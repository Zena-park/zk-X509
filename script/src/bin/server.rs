//! Local prover HTTP server for the zk-X509 frontend.
//!
//! Lists certificates discovered from the OS keychain.
//! Keychain-based signing is not supported via HTTP — use the interactive CLI.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin server
//!
//! Endpoints:
//!   GET  /certs         - List certificates (scanned from keychain at startup)
//!   POST /certs/refresh - Re-scan keychain
//!   POST /prove         - Returns error (keychain signing not supported via HTTP)
//!   POST /execute       - Returns error (keychain signing not supported via HTTP)
//!   GET  /health        - Health check

use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;
use axum::extract::DefaultBodyLimit;
use tower_http::cors::{AllowOrigin, CorsLayer};

fn default_max_wallets() -> u32 { 1 }
fn default_disclosure_mask() -> u8 { 0x00 }

/// Request body from the frontend.
#[derive(Deserialize)]
struct ProveRequest2 {
    /// Index from /certs list
    cert_index: usize,
    /// Wallet address to bind the proof to (hex string, e.g. "0xf39F...")
    #[serde(default)]
    _registrant: String,
    /// Wallet slot index (0-based, for multi-wallet mode)
    #[serde(default)]
    _wallet_index: u32,
    /// Max wallets per cert (must match contract)
    #[serde(default = "default_max_wallets")]
    _max_wallets: u32,
    /// Selective disclosure bitmask (0x0F = all, 0x00 = none)
    #[serde(default = "default_disclosure_mask")]
    _disclosure_mask: u8,
}

/// Shared application state.
struct AppState {
    /// Cached cert scan results (refreshed on /certs/refresh).
    certs: std::sync::RwLock<Vec<zk_x509_script::keychain::CertEntry>>,
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let certs = zk_x509_script::keychain::scan_certs();
    tracing::info!("Found {} certificates (keychain)", certs.len());

    let state = Arc::new(AppState {
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
    println!("Prover server running at http://localhost:8080");
    println!("   GET  /certs   - List keychain certificates");
    println!("   GET  /health  - Health check");
    println!("   Note: /prove and /execute return errors (use interactive CLI)");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

/// List certificates found in the OS keychain.
/// Returns cached results. Use POST /certs/refresh to re-scan.
async fn list_certs_handler(
    state: Arc<AppState>,
) -> impl IntoResponse {
    let certs = state.certs.read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    Json(certs)
}

/// Re-scan keychain and update cache.
async fn refresh_certs_handler(state: Arc<AppState>) -> impl IntoResponse {
    let certs = zk_x509_script::keychain::scan_certs();
    let count = certs.len();
    *state.certs.write().unwrap_or_else(|e| e.into_inner()) = certs;
    Json(serde_json::json!({ "refreshed": count }))
}

/// Keychain-based signing is not supported via HTTP.
fn check_cert_source(
    state: &AppState,
    cert_index: usize,
) -> Result<(), (StatusCode, String)> {
    let certs = state.certs.read().unwrap_or_else(|e| e.into_inner());
    certs.get(cert_index).ok_or_else(|| {
        (StatusCode::BAD_REQUEST, format!("Invalid cert_index: {}", cert_index))
    })?;

    // All certs are now keychain-based; HTTP API cannot sign with keychain
    Err((
        StatusCode::BAD_REQUEST,
        "Keychain signing is not supported via the HTTP API. Use the interactive CLI instead.".to_string(),
    ))
}

/// Execute the ZK program without generating a proof (fast, for testing).
async fn execute_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_cert_source(&state, req.cert_index)?;
    // check_cert_source always returns Err for keychain-only certs
    unreachable!("check_cert_source always returns Err")
}

/// Generate a full ZK proof.
async fn prove_handler(
    Json(req): Json<ProveRequest2>,
    state: Arc<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    check_cert_source(&state, req.cert_index)?;
    unreachable!("check_cert_source always returns Err")
}
