//! Local prover HTTP server for the zk-X509 frontend.
//!
//! Lists certificates and provides signing-only endpoints for delegated proving.
//! The private key never leaves the OS keychain — only signature bytes are returned.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin server
//!
//! Endpoints:
//!   GET  /certs              - List certificates (scanned from keychain at startup)
//!   POST /certs/refresh      - Re-scan keychain
//!   POST /api/sign/consent   - Sign consent message with cert key
//!   POST /api/sign/ownership - Sign ownership challenge with cert key
//!   POST /api/sign/nullifier - Sign nullifier challenge with cert key
//!   GET  /health             - Health check

use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use axum::extract::DefaultBodyLimit;
use tower_http::cors::{AllowOrigin, CorsLayer};
use zk_x509_script::keychain::{CertEntry, PlatformIdentity};
use zk_x509_script::ownership;

/// Shared application state.
/// PlatformIdentity is not Send+Sync, so we wrap each identity in a Mutex
/// and access signing handles sequentially.
struct AppState {
    /// Cached cert entries (for display) + signing handles.
    identities: std::sync::RwLock<Vec<(CertEntry, std::sync::Mutex<Box<dyn PlatformIdentity>>)>>,
}

impl AppState {
    fn scan() -> Self {
        let identities = zk_x509_script::keychain::scan_identities_boxed()
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to scan identities: {}", e);
                Vec::new()
            })
            .into_iter()
            .map(|(entry, id)| (entry, std::sync::Mutex::new(id)))
            .collect();
        AppState {
            identities: std::sync::RwLock::new(identities),
        }
    }

    fn cert_entries(&self) -> Vec<CertEntry> {
        self.identities.read()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .map(|(entry, _)| entry.clone())
            .collect()
    }
}

// ── Request/Response types ──────────────────────────────────────

#[derive(Deserialize)]
struct CertDerRequest {
    cert_index: usize,
}

#[derive(Deserialize)]
struct SignConsentRequest {
    cert_index: usize,
    prover_url: String,
    registry_address: String,
    chain_id: u64,
    registrant: String,
    timestamp: u64,
}

#[derive(Deserialize)]
struct SignOwnershipRequest {
    cert_index: usize,
    registrant: String,
    wallet_index: u32,
    timestamp: u64,
    chain_id: u64,
}

#[derive(Deserialize)]
struct SignNullifierRequest {
    cert_index: usize,
    registry_address: String,
    chain_id: u64,
}

#[derive(Serialize)]
struct SignConsentResponse {
    signature: String,
    message: String,
}

#[derive(Serialize)]
struct SignatureResponse {
    signature: String,
}

// ── Helpers ─────────────────────────────────────────────────────

const CONSENT_DOMAIN: &str = "zk-x509-delegated-proving-consent";

fn build_consent_message(
    prover_url: &str,
    registry_address: &str,
    chain_id: u64,
    registrant: &str,
    timestamp: u64,
) -> String {
    format!(
        "{}\nProver: {}\nRegistry: {}\nChain ID: {}\nWallet: {}\nTimestamp: {}",
        CONSENT_DOMAIN,
        prover_url,
        registry_address.to_lowercase(),
        chain_id,
        registrant.to_lowercase(),
        timestamp,
    )
}

fn parse_address(s: &str) -> Result<[u8; 20], (StatusCode, String)> {
    let s = s.strip_prefix("0x").unwrap_or(s);
    let bytes = hex::decode(s).map_err(|e| {
        (StatusCode::BAD_REQUEST, format!("Invalid address hex: {}", e))
    })?;
    if bytes.len() != 20 {
        return Err((StatusCode::BAD_REQUEST, "Address must be 20 bytes".to_string()));
    }
    let mut arr = [0u8; 20];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

fn sign_prehash_at_index(
    state: &AppState,
    cert_index: usize,
    prehash: &[u8; 32],
) -> Result<Vec<u8>, (StatusCode, String)> {
    let identities = state.identities.read()
        .unwrap_or_else(|e| e.into_inner());
    let (_, identity_mutex) = identities.get(cert_index).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, format!("Invalid cert_index: {}", cert_index))
    })?;
    let mut identity = identity_mutex.lock()
        .unwrap_or_else(|e| e.into_inner());
    identity.sign_prehash(prehash).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Signing failed: {}", e))
    })
}

fn get_cert_der_at_index(
    state: &AppState,
    cert_index: usize,
) -> Result<Vec<u8>, (StatusCode, String)> {
    let identities = state.identities.read()
        .unwrap_or_else(|e| e.into_inner());
    let (_, identity_mutex) = identities.get(cert_index).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, format!("Invalid cert_index: {}", cert_index))
    })?;
    let identity = identity_mutex.lock()
        .unwrap_or_else(|e| e.into_inner());
    identity.cert_der().map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to get cert DER: {}", e))
    })
}

// ── Handlers ────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

async fn list_certs_handler(state: Arc<AppState>) -> impl IntoResponse {
    Json(state.cert_entries())
}

async fn refresh_certs_handler(state: Arc<AppState>) -> impl IntoResponse {
    let identities: Vec<(CertEntry, std::sync::Mutex<Box<dyn PlatformIdentity>>)> =
        zk_x509_script::keychain::scan_identities_boxed()
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to scan identities: {}", e);
                Vec::new()
            })
            .into_iter()
            .map(|(entry, id)| (entry, std::sync::Mutex::new(id)))
            .collect();
    let count = identities.len();
    *state.identities.write().unwrap_or_else(|e| e.into_inner()) = identities;
    Json(serde_json::json!({ "refreshed": count }))
}

/// Return certificate DER bytes (base64 encoded) for a given cert index.
async fn cert_der_handler(
    Json(req): Json<CertDerRequest>,
    state: Arc<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let der = get_cert_der_at_index(&state, req.cert_index)?;
    use base64::Engine as _;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&der);
    Ok(Json(serde_json::json!({ "cert_der": b64 })))
}

/// Sign a consent message for delegated proving.
/// The consent message is constructed server-side from the provided parameters.
async fn sign_consent_handler(
    Json(req): Json<SignConsentRequest>,
    state: Arc<AppState>,
) -> Result<Json<SignConsentResponse>, (StatusCode, String)> {
    let message = build_consent_message(
        &req.prover_url,
        &req.registry_address,
        req.chain_id,
        &req.registrant,
        req.timestamp,
    );

    // Hash the consent message as the prehash for signing
    let prehash: [u8; 32] = Sha256::digest(message.as_bytes()).into();
    let sig = sign_prehash_at_index(&state, req.cert_index, &prehash)?;

    Ok(Json(SignConsentResponse {
        signature: format!("0x{}", hex::encode(&sig)),
        message,
    }))
}

/// Sign the ownership challenge (binds cert to wallet + timestamp + chain).
async fn sign_ownership_handler(
    Json(req): Json<SignOwnershipRequest>,
    state: Arc<AppState>,
) -> Result<Json<SignatureResponse>, (StatusCode, String)> {
    let registrant = parse_address(&req.registrant)?;
    let cert_der = get_cert_der_at_index(&state, req.cert_index)?;

    let prehash = ownership::ownership_challenge_hash(
        &cert_der,
        &registrant,
        req.wallet_index,
        req.timestamp,
        req.chain_id,
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let sig = sign_prehash_at_index(&state, req.cert_index, &prehash)?;

    Ok(Json(SignatureResponse {
        signature: format!("0x{}", hex::encode(&sig)),
    }))
}

/// Sign the nullifier challenge (deterministic per registry + chain).
async fn sign_nullifier_handler(
    Json(req): Json<SignNullifierRequest>,
    state: Arc<AppState>,
) -> Result<Json<SignatureResponse>, (StatusCode, String)> {
    let registry_address = parse_address(&req.registry_address)?;

    let prehash = ownership::nullifier_challenge_hash(
        &registry_address,
        req.chain_id,
    );

    let sig = sign_prehash_at_index(&state, req.cert_index, &prehash)?;

    Ok(Json(SignatureResponse {
        signature: format!("0x{}", hex::encode(&sig)),
    }))
}

// ── Main ─────────────��──────────────────────────────────────────

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let state = Arc::new(AppState::scan());
    let count = state.cert_entries().len();
    tracing::info!("Found {} certificates (keychain)", count);

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
            let s = Arc::clone(&state);
            move || {
                let s = Arc::clone(&s);
                async move { list_certs_handler(s).await }
            }
        }))
        .route("/certs/refresh", post({
            let s = Arc::clone(&state);
            move || {
                let s = Arc::clone(&s);
                async move { refresh_certs_handler(s).await }
            }
        }))
        .route("/api/cert-der", post({
            let s = Arc::clone(&state);
            move |body: Json<CertDerRequest>| {
                let s = Arc::clone(&s);
                async move { cert_der_handler(body, s).await }
            }
        }))
        .route("/api/sign/consent", post({
            let s = Arc::clone(&state);
            move |body: Json<SignConsentRequest>| {
                let s = Arc::clone(&s);
                async move { sign_consent_handler(body, s).await }
            }
        }))
        .route("/api/sign/ownership", post({
            let s = Arc::clone(&state);
            move |body: Json<SignOwnershipRequest>| {
                let s = Arc::clone(&s);
                async move { sign_ownership_handler(body, s).await }
            }
        }))
        .route("/api/sign/nullifier", post({
            let s = Arc::clone(&state);
            move |body: Json<SignNullifierRequest>| {
                let s = Arc::clone(&s);
                async move { sign_nullifier_handler(body, s).await }
            }
        }))
        .layer(cors)
        .layer(DefaultBodyLimit::max(1024 * 1024));

    let addr = "0.0.0.0:8080";
    tracing::info!("Prover server listening on {}", addr);
    println!("Local signing server running at http://localhost:8080");
    println!("   GET  /certs              - List keychain certificates");
    println!("   POST /api/sign/consent   - Sign consent for delegated proving");
    println!("   POST /api/sign/ownership - Sign ownership challenge");
    println!("   POST /api/sign/nullifier - Sign nullifier challenge");
    println!("   GET  /health             - Health check");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
