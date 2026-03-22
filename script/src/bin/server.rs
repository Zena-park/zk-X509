//! Local prover HTTP server for the zk-X509 frontend.
//!
//! Accepts certificate data from the browser and generates ZK proofs.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin server
//!
//! Endpoints:
//!   POST /prove   - Generate a ZK proof from certificate data
//!   POST /execute - Execute without proof (fast, for testing)
//!   GET  /health  - Health check

use alloy_sol_types::SolType;
use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    blocking::{EnvProver, ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1Stdin,
};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use axum::extract::DefaultBodyLimit;
use tower_http::cors::{AllowOrigin, CorsLayer};
use zk_x509_lib::PublicValuesStruct;
use zk_x509_script::npki;

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

/// Request body from the frontend.
/// NOTE: Do NOT derive Debug — it would log private key bytes.
#[derive(Deserialize)]
struct ProveRequest2 {
    /// DER-encoded certificate bytes (as u8 array)
    cert_der: Vec<u8>,
    /// Private key bytes (decrypted, PKCS#1 DER)
    user_priv_key: Vec<u8>,
    /// Password for encrypted private key (optional, for NPKI)
    #[serde(default)]
    password: String,
    /// CA public key bytes (optional, uses default Korean NPKI CA if not provided)
    #[serde(default)]
    ca_pub_key: Option<Vec<u8>>,
    /// Intermediate CA certificates (full X.509 DER), in order from user→root
    #[serde(default)]
    intermediate_certs: Vec<Vec<u8>>,
}

/// Response sent back to the frontend.
#[derive(Debug, Serialize)]
struct ProveResponse {
    nullifier: String,
    #[serde(rename = "caRootHash")]
    ca_root_hash: String,
    proof: String,
    public_values: String,
    vkey: String,
}

/// Shared application state.
struct AppState {
    client: EnvProver,
    /// Default CA public key (SPKI DER) loaded at startup.
    default_ca_pub_key: Vec<u8>,
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    // Load default CA public key from certs/ca_pub.der (if available)
    let default_ca_pub_key = std::fs::read("certs/ca_pub.der").unwrap_or_else(|_| {
        tracing::warn!("certs/ca_pub.der not found — clients must provide ca_pub_key in request");
        Vec::new()
    });
    if !default_ca_pub_key.is_empty() {
        tracing::info!("Loaded default CA public key ({} bytes)", default_ca_pub_key.len());
    }

    // Initialize prover BEFORE tokio runtime (from_env may block internally)
    tracing::info!("Initializing SP1 ProverClient...");
    let client = ProverClient::from_env();

    let state = Arc::new(AppState { client, default_ca_pub_key });

    // Start the async runtime
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async_main(state));
}

async fn async_main(state: Arc<AppState>) {
    let allowed_origins = [
        "http://localhost:3000".parse().unwrap(),
        "http://127.0.0.1:3000".parse().unwrap(),
    ];
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/prove", post({
            let state = Arc::clone(&state);
            move |body| prove_handler(body, state)
        }))
        .route("/execute", post({
            let state = Arc::clone(&state);
            move |body| execute_handler(body, state)
        }))
        .layer(cors)
        .layer(DefaultBodyLimit::max(1024 * 1024)); // 1MB max request body

    let addr = "0.0.0.0:8080";
    tracing::info!("Prover server listening on {}", addr);
    println!("🚀 Prover server running at http://localhost:8080");
    println!("   POST /prove   - Generate ZK proof");
    println!("   POST /execute - Execute without proof (fast)");
    println!("   GET  /health  - Health check");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

/// Decrypt the private key if a password is provided.
fn maybe_decrypt_key(key_bytes: &[u8], password: &str) -> Result<Vec<u8>, (StatusCode, String)> {
    if password.is_empty() {
        return Ok(key_bytes.to_vec());
    }
    npki::decrypt_npki_key(key_bytes, password)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Key decryption failed: {}", e)))
}

/// Execute the ZK program without generating a proof (fast, for testing).
async fn execute_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ca_pub_key = req.ca_pub_key
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| state.default_ca_pub_key.clone());
    if ca_pub_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "ca_pub_key is required (provide in request or place certs/ca_pub.der on server)".to_string(),
        ));
    }

    let decrypted_key = maybe_decrypt_key(&req.user_priv_key, &req.password)?;
    let cert_der = req.cert_der;

    let current_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut cert_chain = req.intermediate_certs;
    cert_chain.push(ca_pub_key);

    let mut stdin = SP1Stdin::new();
    stdin.write(&cert_der);
    stdin.write(&decrypted_key);
    stdin.write(&cert_chain);
    stdin.write(&current_timestamp);
    let revoked_serials: Vec<Vec<u8>> = Vec::new(); // TODO: load from CRL endpoint
    stdin.write(&revoked_serials);

    let result = tokio::task::spawn_blocking(move || {
        state.client.execute(ZK_X509_ELF, stdin).run()
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (output, report) = result;
    let decoded = PublicValuesStruct::abi_decode(output.as_slice())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "nullifier": format!("0x{}", hex::encode(decoded.nullifier)),
        "caRootHash": format!("0x{}", hex::encode(decoded.caRootHash)),
        "cycles": report.total_instruction_count(),
    })))
}

/// Generate a full ZK proof.
async fn prove_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let ca_pub_key = req.ca_pub_key
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| state.default_ca_pub_key.clone());
    if ca_pub_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "ca_pub_key is required (provide in request or place certs/ca_pub.der on server)".to_string(),
        ));
    }

    let decrypted_key = maybe_decrypt_key(&req.user_priv_key, &req.password)?;
    let cert_der = req.cert_der;

    let current_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let mut cert_chain = req.intermediate_certs;
    cert_chain.push(ca_pub_key);

    let mut stdin = SP1Stdin::new();
    stdin.write(&cert_der);
    stdin.write(&decrypted_key);
    stdin.write(&cert_chain);
    stdin.write(&current_timestamp);
    let revoked_serials: Vec<Vec<u8>> = Vec::new(); // TODO: load from CRL endpoint
    stdin.write(&revoked_serials);

    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let pk = state.client.setup(ZK_X509_ELF).map_err(|e| e.to_string())?;
        let proof = state
            .client
            .prove(&pk, stdin)
            .run()
            .map_err(|e| e.to_string())?;

        state
            .client
            .verify(&proof, pk.verifying_key(), None)
            .map_err(|e| e.to_string())?;

        let vkey = pk.verifying_key().bytes32().to_string();
        Ok((proof, vkey))
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let (proof, vkey) = result;

    let bytes = proof.public_values.as_slice();
    let decoded = PublicValuesStruct::abi_decode(bytes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ProveResponse {
        nullifier: format!("0x{}", hex::encode(decoded.nullifier)),
        ca_root_hash: format!("0x{}", hex::encode(decoded.caRootHash)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
        public_values: format!("0x{}", hex::encode(bytes)),
        vkey,
    }))
}
