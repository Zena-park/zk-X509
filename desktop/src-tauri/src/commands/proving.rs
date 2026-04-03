use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, SP1ProofWithPublicValues,
};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

use super::certificates::IdentityStore;

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofParams {
    pub cert_index: usize,
    pub rpc_url: String,
    pub registry_address: String,
    pub chain_id: u64,
    pub registrant: String,
    pub wallet_index: u32,
    pub max_wallets: u32,
    pub disclosure_mask: u8,
    pub mode: String, // "execute" or "groth16"
}

#[derive(Serialize, Clone)]
pub struct ProofResult {
    pub proof: String,
    pub public_values: String,
    pub elapsed_ms: u64,
}

#[derive(Serialize, Clone)]
struct ProgressEvent {
    stage: String,
    message: String,
}

fn emit_progress(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit(
        "proof-progress",
        ProgressEvent {
            stage: stage.to_string(),
            message: message.to_string(),
        },
    );
    // Brief yield so the webview event loop can process the UI update
    std::thread::sleep(std::time::Duration::from_millis(50));
}

/// Resolve CA public key for the user's cert via remote repo + local scan.
fn resolve_ca(
    cert_der: &[u8],
    rpc_url: &str,
    registry_bytes: &[u8; 20],
    chain_id: u64,
) -> Result<Vec<u8>, String> {
    let on_chain_leaves = zk_x509_script::onchain::fetch_ca_leaves(rpc_url, registry_bytes).ok();

    let mut ca_certs = if let Some(ref leaves) = on_chain_leaves {
        zk_x509_script::ca_repo::fetch_verified_cas(chain_id, registry_bytes, leaves, None)
    } else {
        Vec::new()
    };

    if ca_certs.is_empty() {
        ca_certs = zk_x509_script::ca::scan_ca_certs();
    }

    // Try with on-chain filter first
    if let Some(ref leaves) = on_chain_leaves {
        if let Some(idx) =
            zk_x509_script::ca::find_issuer_ca(cert_der, &ca_certs, Some(leaves))
        {
            return Ok(ca_certs[idx].spki_der.clone());
        }
    }

    // Fallback: match without on-chain filter
    if let Some(idx) = zk_x509_script::ca::find_issuer_ca(cert_der, &ca_certs, None) {
        return Ok(ca_certs[idx].spki_der.clone());
    }

    let ca_count = on_chain_leaves.as_ref().map(|l| l.len()).unwrap_or(0);

    Err(format!(
        "No matching CA found for this certificate. \
         The registry has {} registered CA(s). \
         The issuing CA must be registered via addCA() before this certificate can be used.",
        ca_count
    ))
}

#[tauri::command]
pub async fn generate_proof(
    app: AppHandle,
    store: State<'_, IdentityStore>,
    params: ProofParams,
) -> Result<ProofResult, String> {
    let registrant_bytes = zk_x509_script::parse_eth_address(&params.registrant)?;
    let registry_bytes = zk_x509_script::parse_eth_address(&params.registry_address)?;

    // Clone identity from store (lock briefly, then release)
    let mut identity = {
        let mut guard = store.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        let (_, id) = guard
            .get_mut(params.cert_index)
            .ok_or("Invalid certificate index")?;
        id.clone_box()
    };

    let start = Instant::now();
    let mode = params.mode.clone();

    // All blocking work (signing, CA resolution, proof generation) runs off
    // the async executor to avoid starving the Tokio runtime.
    let result = tokio::task::spawn_blocking(move || {
        let cert_der = identity.cert_der()?;

        emit_progress(&app, "signing", "Generating signatures...");

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Sign ownership + nullifier (OS keychain — private key never in memory)
        let ownership_hash = zk_x509_script::ownership::ownership_challenge_hash(
            &cert_der,
            &registrant_bytes,
            params.wallet_index,
            timestamp,
            params.chain_id,
        )?;
        let ownership_sig = identity.sign_prehash(&ownership_hash)?;

        let nullifier_hash =
            zk_x509_script::ownership::nullifier_challenge_hash(&registry_bytes, params.chain_id);
        let nullifier_sig = identity.sign_prehash(&nullifier_hash)?;

        emit_progress(&app, "ca-merkle", "Building CA Merkle tree...");

        let ca_pub_key = resolve_ca(&cert_der, &params.rpc_url, &registry_bytes, params.chain_id)?;

        let (ca_merkle_root, ca_merkle_proof) =
            zk_x509_script::onchain::build_ca_merkle(&params.rpc_url, &registry_bytes, &ca_pub_key);

        let cert_chain = vec![ca_pub_key];
        // CRL is intentionally empty: the ZK circuit validates certificate expiry
        // via the timestamp field; on-chain CRL checking is planned for a future
        // registry upgrade. An empty CRL causes the circuit to skip revocation checks.
        let crl_der: Vec<u8> = Vec::new();

        let stdin = zk_x509_script::build_stdin(&zk_x509_script::StdinParams {
            cert_der: &cert_der,
            ownership_sig: &ownership_sig,
            nullifier_sig: &nullifier_sig,
            cert_chain: &cert_chain,
            timestamp,
            crl_der: &crl_der,
            registrant: &registrant_bytes,
            wallet_index: params.wallet_index,
            max_wallets: params.max_wallets,
            disclosure_mask: params.disclosure_mask,
            required_country: [0u8; 32],
            required_org: [0u8; 32],
            required_org_unit: [0u8; 32],
            required_common_name: [0u8; 32],
            ca_merkle_proof: &ca_merkle_proof,
            ca_merkle_root,
            registry_address: &registry_bytes,
            chain_id: params.chain_id,
        });

        emit_progress(&app, "proving", "Generating ZK proof...");

        let client = ProverClient::from_env();

        if mode == "execute" {
            let (output, _report) = client
                .execute(ZK_X509_ELF, stdin)
                .run()
                .map_err(|e| {
                    let msg = e.to_string();
                    if msg.contains("Country constraint failed") {
                        "Proof failed: Your certificate's country does not match the registry's required country.".to_string()
                    } else if msg.contains("Org constraint failed") {
                        "Proof failed: Your certificate's organization does not match the registry's required organization.".to_string()
                    } else if msg.contains("OrgUnit constraint failed") {
                        "Proof failed: Your certificate's organizational unit does not match the registry's requirement.".to_string()
                    } else if msg.contains("CommonName constraint failed") {
                        "Proof failed: Your certificate's common name does not match the registry's requirement.".to_string()
                    } else if msg.contains("wallet_index must be < max_wallets") {
                        "Proof failed: Wallet index exceeds the maximum allowed by this registry.".to_string()
                    } else if msg.contains("Certificate chain must not be empty") {
                        "Proof failed: No CA certificate chain provided.".to_string()
                    } else if msg.contains("artifact not found") || msg.contains("Artifact") {
                        "Proving failed: SP1 prover artifacts not available. Try using 'execute' mode instead of 'groth16'.".to_string()
                    } else {
                        format!("Proving failed: {}", msg)
                    }
                })?;

            emit_progress(&app, "done", "Proof generated!");
            Ok::<ProofResult, String>(ProofResult {
                proof: "0x".to_string(),
                public_values: format!("0x{}", hex::encode(output.as_slice())),
                elapsed_ms: start.elapsed().as_millis() as u64,
            })
        } else {
            let pk = client
                .setup(ZK_X509_ELF)
                .map_err(|e| format!("Proving setup failed (Docker may be required for Groth16): {}", e))?;

            let proof: SP1ProofWithPublicValues = client
                .prove(&pk, stdin)
                .groth16()
                .run()
                .map_err(|e| format!("Proving failed: {}", e))?;

            let pv_bytes = proof.public_values.as_slice().to_vec();
            let proof_bytes = proof.bytes();

            emit_progress(&app, "done", "Proof generated!");
            Ok(ProofResult {
                proof: format!("0x{}", hex::encode(&proof_bytes)),
                public_values: format!("0x{}", hex::encode(&pv_bytes)),
                elapsed_ms: start.elapsed().as_millis() as u64,
            })
        }
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DelegatedParams {
    pub cert_index: usize,
    pub rpc_url: String,
    pub registry_address: String,
    pub chain_id: u64,
    pub registrant: String,
    pub wallet_index: u32,
    pub max_wallets: u32,
    pub disclosure_mask: u8,
    pub prover_url: String,
}

#[tauri::command]
pub async fn delegated_prove(
    app: AppHandle,
    store: State<'_, IdentityStore>,
    params: DelegatedParams,
) -> Result<ProofResult, String> {
    let registrant_bytes = zk_x509_script::parse_eth_address(&params.registrant)?;
    let registry_bytes = zk_x509_script::parse_eth_address(&params.registry_address)?;

    let mut identity = {
        let mut guard = store.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        let (_, id) = guard
            .get_mut(params.cert_index)
            .ok_or("Invalid certificate index")?;
        id.clone_box()
    };

    let start = Instant::now();

    // All blocking work (consent signing, ownership signing, CA resolution,
    // remote prover call) runs off the async executor.
    let result = tokio::task::spawn_blocking(move || {
        let cert_der = identity.cert_der()?;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        emit_progress(&app, "consent", "Signing consent...");

        let consent_message = format!(
            "zk-x509-delegated-proving-consent\nProver: {}\nRegistry: {}\nChain ID: {}\nWallet: {}\nTimestamp: {}",
            params.prover_url,
            params.registry_address.to_lowercase(),
            params.chain_id,
            params.registrant.to_lowercase(),
            timestamp,
        );
        let consent_hash: [u8; 32] = Sha256::digest(consent_message.as_bytes()).into();
        let consent_sig = identity.sign_prehash(&consent_hash)?;

        emit_progress(&app, "signing", "Generating ownership signatures...");

        let ownership_hash = zk_x509_script::ownership::ownership_challenge_hash(
            &cert_der, &registrant_bytes, params.wallet_index, timestamp, params.chain_id,
        )?;
        let ownership_sig = identity.sign_prehash(&ownership_hash)?;

        let nullifier_hash =
            zk_x509_script::ownership::nullifier_challenge_hash(&registry_bytes, params.chain_id);
        let nullifier_sig = identity.sign_prehash(&nullifier_hash)?;

        emit_progress(&app, "ca-merkle", "Building CA Merkle tree...");

        let ca_pub_key = resolve_ca(&cert_der, &params.rpc_url, &registry_bytes, params.chain_id)?;
        let (ca_merkle_root, ca_merkle_proof) =
            zk_x509_script::onchain::build_ca_merkle(&params.rpc_url, &registry_bytes, &ca_pub_key);

        use base64::Engine;
        let cert_chain_b64 = vec![base64::engine::general_purpose::STANDARD.encode(&ca_pub_key)];

        // Try ECIES encryption (fallback to plaintext for older prover servers)
        let pubkey_url = format!("{}/api/pubkey", params.prover_url.trim_end_matches('/'));
        let pubkey_bytes: Option<Vec<u8>> = ureq::get(&pubkey_url)
            .call()
            .ok()
            .and_then(|mut r| r.body_mut().read_json::<serde_json::Value>().ok())
            .and_then(|v| v["pubkey"].as_str().map(|s| s.to_string()))
            .and_then(|hex| hex::decode(hex.strip_prefix("0x").unwrap_or(&hex)).ok())
            .filter(|bytes| bytes.len() == 65 && bytes[0] == 0x04);

        let consent_hex = format!("0x{}", hex::encode(&consent_sig));
        let cert_der_b64 = base64::engine::general_purpose::STANDARD.encode(&cert_der);
        let ownership_hex = format!("0x{}", hex::encode(&ownership_sig));
        let nullifier_hex = format!("0x{}", hex::encode(&nullifier_sig));

        let body = if let Some(pk) = pubkey_bytes {
            emit_progress(&app, "encrypting", "Encrypting certificate data...");
            let sensitive = serde_json::json!({
                "consent_signature": consent_hex,
                "cert_der": cert_der_b64,
                "cert_chain": cert_chain_b64,
                "ownership_sig": ownership_hex,
                "nullifier_sig": nullifier_hex,
            });
            let plaintext = serde_json::to_vec(&sensitive)
                .map_err(|e| format!("JSON serialize failed: {}", e))?;
            let ciphertext = ecies::encrypt(&pk, &plaintext)
                .map_err(|e| format!("ECIES encryption failed: {}", e))?;
            serde_json::json!({
                "encrypted_payload": format!("0x{}", hex::encode(&ciphertext)),
                "registrant": params.registrant,
                "wallet_index": params.wallet_index,
                "max_wallets": params.max_wallets,
                "disclosure_mask": params.disclosure_mask,
                "chain_id": params.chain_id,
                "registry_address": params.registry_address,
                "ca_merkle_root": format!("0x{}", hex::encode(ca_merkle_root)),
                "ca_merkle_proof": ca_merkle_proof.iter().map(|h| format!("0x{}", hex::encode(h))).collect::<Vec<_>>(),
                "timestamp": timestamp,
            })
        } else {
            // Fallback: plaintext mode for older prover servers without /api/pubkey
            emit_progress(&app, "sending", "Sending to prover server...");
            serde_json::json!({
                "consent_signature": consent_hex,
                "cert_der": cert_der_b64,
                "cert_chain": cert_chain_b64,
                "ownership_sig": ownership_hex,
                "nullifier_sig": nullifier_hex,
                "registrant": params.registrant,
                "wallet_index": params.wallet_index,
                "max_wallets": params.max_wallets,
                "disclosure_mask": params.disclosure_mask,
                "chain_id": params.chain_id,
                "registry_address": params.registry_address,
                "ca_merkle_root": format!("0x{}", hex::encode(ca_merkle_root)),
                "ca_merkle_proof": ca_merkle_proof.iter().map(|h| format!("0x{}", hex::encode(h))).collect::<Vec<_>>(),
                "timestamp": timestamp,
            })
        };

        emit_progress(&app, "proving", "Waiting for proof generation...");
        let url = format!("{}/api/prove", params.prover_url.trim_end_matches('/'));

        let resp: serde_json::Value = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send_json(&body)
            .map_err(|e| format!("Prover request failed: {}", e))?
            .body_mut()
            .read_json()
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let proof = resp["proof"]
            .as_str()
            .ok_or("Missing proof in response")?
            .to_string();
        let public_values = resp["public_values"]
            .as_str()
            .ok_or("Missing public_values in response")?
            .to_string();

        emit_progress(&app, "done", "Proof received!");
        Ok::<ProofResult, String>(ProofResult {
            proof,
            public_values,
            elapsed_ms: start.elapsed().as_millis() as u64,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    Ok(result)
}
