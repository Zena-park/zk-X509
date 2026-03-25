//! Local prover HTTP server for the zk-X509 frontend.
//!
//! Accepts certificate data from the browser and generates ZK proofs.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin server
//!
//! Endpoints:
//!   GET  /certs         - List NPKI certificates (scanned at startup)
//!   POST /certs/refresh - Re-scan NPKI directories
//!   POST /prove         - Generate a ZK proof (cert_index + password + registrant)
//!   POST /execute       - Execute without proof (fast, for testing)
//!   GET  /health        - Health check

use alloy_sol_types::SolType;
use sha2::Digest;
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

fn default_max_wallets() -> u32 { 1 }
fn default_disclosure_mask() -> u8 { 0x00 }

/// Request body from the frontend.
/// NOTE: Do NOT derive Debug — password would be logged.
#[derive(Deserialize)]
struct ProveRequest2 {
    /// Index from /certs list (server reads files directly)
    cert_index: usize,
    /// Password to decrypt the NPKI private key
    #[serde(default)]
    password: String,
    /// Wallet address to bind the proof to (hex string, e.g. "0xf39F...")
    registrant: String,
    /// Wallet slot index (0-based, for multi-wallet mode)
    #[serde(default)]
    wallet_index: u32,
    /// Max wallets per cert (must match contract)
    #[serde(default = "default_max_wallets")]
    max_wallets: u32,
    /// Selective disclosure bitmask (0x0F = all, 0x00 = none)
    #[serde(default = "default_disclosure_mask")]
    disclosure_mask: u8,
}

/// Response sent back to the frontend.
#[derive(Debug, Serialize)]
struct ProveResponse {
    nullifier: String,
    #[serde(rename = "caMerkleRoot")]
    ca_merkle_root: String,
    proof: String,
    public_values: String,
    vkey: String,
}

/// Shared application state.
struct AppState {
    client: EnvProver,
    /// Default CA public key (SPKI DER) loaded at startup.
    default_ca_pub_key: Vec<u8>,
    /// Cached NPKI cert scan results (refreshed on /certs).
    certs: std::sync::RwLock<Vec<zk_x509_script::keychain::NpkiCertEntry>>,
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

    let certs = zk_x509_script::keychain::scan_all_certs();
    tracing::info!("Found {} certificates (file + keychain)", certs.len());

    let state = Arc::new(AppState {
        client,
        default_ca_pub_key,
        certs: std::sync::RwLock::new(certs),
    });

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
        .route("/certs", get({
            let state = Arc::clone(&state);
            move || list_certs_handler(state)
        }))
        .route("/certs/refresh", post({
            let state = Arc::clone(&state);
            move || refresh_certs_handler(state)
        }))
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

/// List NPKI certificates found on the local filesystem.
/// Returns cached results. Use POST /certs/refresh to re-scan.
async fn list_certs_handler(
    state: Arc<AppState>,
) -> impl IntoResponse {
    let certs = state.certs.read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    Json(certs)
}

/// Re-scan NPKI directories and update cache.
async fn refresh_certs_handler(state: Arc<AppState>) -> impl IntoResponse {
    let certs = zk_x509_script::keychain::scan_all_certs();
    let count = certs.len();
    *state.certs.write().unwrap_or_else(|e| e.into_inner()) = certs;
    Json(serde_json::json!({ "refreshed": count }))
}

/// Parse a hex-encoded Ethereum address into [u8; 20].
fn parse_registrant(s: &str) -> Result<[u8; 20], (StatusCode, String)> {
    zk_x509_script::parse_eth_address(s)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))
}

/// Load cert+key from NPKI files by index, decrypt key with password.
fn load_cert_and_key(
    state: &AppState,
    cert_index: usize,
    password: &str,
) -> Result<(Vec<u8>, Vec<u8>), (StatusCode, String)> {
    let certs = state.certs.read().unwrap_or_else(|e| e.into_inner());
    let entry = certs.get(cert_index).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, format!("Invalid cert_index: {}", cert_index))
    })?;

    // Keychain-based signing is not yet supported via the HTTP API
    #[cfg(target_os = "macos")]
    if entry.source == zk_x509_script::keychain::CertSource::Keychain {
        return Err((
            StatusCode::BAD_REQUEST,
            "Keychain signing is not yet supported via the HTTP API. Use the interactive CLI instead.".to_string(),
        ));
    }

    let cert_der = std::fs::read(&entry.cert_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read cert: {}", e)))?;
    let key_raw = std::fs::read(&entry.key_path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Read key: {}", e)))?;

    let key_der = if password.is_empty() {
        key_raw
    } else {
        npki::decrypt_npki_key(&key_raw, password)
            .map_err(|e| (StatusCode::BAD_REQUEST, format!("Key decryption failed: {}", e)))?
    };

    Ok((cert_der, key_der))
}

/// Build SP1 stdin from cert, key, CA, timestamp, registrant.
/// Shared logic: load cert, sign ownership + nullifier, build stdin.
fn prepare_stdin(
    state: &AppState,
    cert_index: usize,
    password: &str,
    registrant_bytes: &[u8; 20],
    ca_pub_key: &[u8],
    wallet_index: u32,
    max_wallets: u32,
    disclosure_mask: u8,
) -> Result<SP1Stdin, String> {
    let (cert_der, key_der) = load_cert_and_key(state, cert_index, password)
        .map_err(|(_status, msg)| msg)?;
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {}", e))?.as_secs();
    let chain_id = zk_x509_script::DEFAULT_CHAIN_ID;
    let registry_address = zk_x509_script::DEFAULT_REGISTRY_ADDRESS;
    let ownership_sig = zk_x509_script::ownership::sign_ownership(
        &cert_der, &key_der, registrant_bytes, wallet_index, timestamp, chain_id)
        .map_err(|e| e.to_string())?;
    let nullifier_sig = zk_x509_script::ownership::sign_nullifier(
        &cert_der, &key_der, &registry_address, chain_id)
        .map_err(|e| e.to_string())?;
    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key.to_vec()];
    let crl_der: Vec<u8> = Vec::new();
    let (_ca_leaf, ca_merkle_root, ca_merkle_proof) =
        zk_x509_script::merkle::ca_merkle_tree(ca_pub_key, &[]);
    Ok(zk_x509_script::build_stdin(&zk_x509_script::StdinParams {
        cert_der: &cert_der,
        ownership_sig: &ownership_sig,
        nullifier_sig: &nullifier_sig,
        cert_chain: &cert_chain,
        timestamp,
        crl_der: &crl_der,
        registrant: registrant_bytes,
        wallet_index,
        max_wallets,
        disclosure_mask,
        ca_merkle_proof: &ca_merkle_proof,
        ca_merkle_root,
        registry_address: &registry_address,
        chain_id,
    }))
}

/// Execute the ZK program without generating a proof (fast, for testing).
async fn execute_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let registrant_bytes = parse_registrant(&req.registrant)?;
    let ca_pub_key = state.default_ca_pub_key.clone();
    if ca_pub_key.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "CA public key not configured".to_string()));
    }

    let cert_index = req.cert_index;
    let password = req.password.clone();
    let wallet_index = req.wallet_index;
    let max_wallets = req.max_wallets;
    let disclosure_mask = req.disclosure_mask;

    let result = tokio::task::spawn_blocking(move || {
        let stdin = prepare_stdin(&state, cert_index, &password, &registrant_bytes, &ca_pub_key, wallet_index, max_wallets, disclosure_mask)?;
        state.client.execute(ZK_X509_ELF, stdin).run()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (output, report) = result;
    let decoded = PublicValuesStruct::abi_decode(output.as_slice())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "nullifier": format!("0x{}", hex::encode(decoded.nullifier)),
        "caMerkleRoot": format!("0x{}", hex::encode(decoded.caMerkleRoot)),
        "cycles": report.total_instruction_count(),
    })))
}

/// Generate a full ZK proof.
async fn prove_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let registrant_bytes = parse_registrant(&req.registrant)?;
    let ca_pub_key = state.default_ca_pub_key.clone();
    if ca_pub_key.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "CA public key not configured".to_string()));
    }

    let cert_index = req.cert_index;
    let password = req.password.clone();
    let wallet_index = req.wallet_index;
    let max_wallets = req.max_wallets;
    let disclosure_mask = req.disclosure_mask;

    let result = tokio::task::spawn_blocking(move || -> Result<_, String> {
        let stdin = prepare_stdin(&state, cert_index, &password, &registrant_bytes, &ca_pub_key, wallet_index, max_wallets, disclosure_mask)?;
        let pk = state.client.setup(ZK_X509_ELF).map_err(|e| e.to_string())?;
        let proof = state.client.prove(&pk, stdin).run().map_err(|e| e.to_string())?;
        state.client.verify(&proof, pk.verifying_key(), None).map_err(|e| e.to_string())?;
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
        ca_merkle_root: format!("0x{}", hex::encode(decoded.caMerkleRoot)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
        public_values: format!("0x{}", hex::encode(bytes)),
        vkey,
    }))
}
