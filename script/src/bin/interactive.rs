//! zk-X509 Interactive CLI — Guided Proof Generation
//!
//! Walks through each step sequentially:
//!   1. Settings (RPC, registry, chain)
//!   2. Certificate selection (OS certificate store scan)
//!   3. Wallet address
//!   4. Proof generation (Execute or Groth16)
//!   5. Output proof for Dashboard
//!
//! Supports macOS Keychain and Windows Certificate Store.
//!
//! Usage:
//!   cargo run --release --bin interactive

use alloy_sol_types::SolType;
use base64::Engine as _;
use sha2::Digest;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf,
};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;
use zk_x509_script::keychain::{CertEntry, PlatformIdentity};

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");
const DEFAULT_REGISTRY: &str = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

fn prompt(msg: &str) -> String {
    print!("{}", msg);
    io::stdout().flush().expect("Failed to flush stdout");
    let mut input = String::new();
    io::stdin().read_line(&mut input).expect("Failed to read from stdin");
    input.trim().to_string()
}

fn format_decoded(decoded: &PublicValuesStruct) -> (String, String) {
    (
        format!("0x{}", hex::encode(decoded.nullifier)),
        format!("0x{}", hex::encode(decoded.caMerkleRoot)),
    )
}

fn platform_name() -> &'static str {
    #[cfg(target_os = "macos")]
    { "macOS Keychain" }
    #[cfg(target_os = "windows")]
    { "Windows Certificate Store" }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { "OS Certificate Store" }
}

fn main() {
    sp1_sdk::utils::setup_logger();

    println!();
    println!("  ╔══════════════════════════════════╗");
    println!("  ║    zk-X509 Proof Generator        ║");
    println!("  ╚══════════════════════════════════╝");
    println!();

    // ── Pre-flight: Docker check ─────────────────────
    let docker_available = is_docker_running();
    if docker_available {
        println!("  ✓ Docker detected");
    } else {
        println!("  ⚠ Docker not running (Groth16 unavailable, Execute mode OK)");
    }
    println!();

    // ── Step 1: Settings ──────────────────────────────
    println!("  ── Step 1/5: Settings ──");
    println!();

    let rpc_input = prompt(&format!("  RPC URL [http://localhost:8545]: "));
    let rpc_url = if rpc_input.is_empty() { "http://localhost:8545".to_string() } else { rpc_input };

    let reg_input = prompt(&format!("  Registry address [{}]: ", DEFAULT_REGISTRY));
    let registry_address = if reg_input.is_empty() { DEFAULT_REGISTRY.to_string() } else { reg_input };

    let cid_input = prompt("  Chain ID [31337]: ");
    let chain_id: u64 = cid_input.parse().unwrap_or(zk_x509_script::DEFAULT_CHAIN_ID);

    let registry_bytes = match zk_x509_script::parse_eth_address(&registry_address) {
        Ok(b) => b,
        Err(e) => { println!("  Invalid registry address: {}", e); return; }
    };

    // Auto-fetch max_wallets from on-chain
    let max_wallets = match zk_x509_script::onchain::fetch_max_wallets(&rpc_url, &registry_bytes) {
        Ok(v) => { println!("  ✓ MAX_WALLETS_PER_CERT: {} (from on-chain)", v); v }
        Err(e) => {
            println!("  ⚠ Could not fetch MAX_WALLETS_PER_CERT: {}", e);
            let mw_input = prompt("  Enter max wallets manually [3]: ");
            mw_input.parse().unwrap_or(3)
        }
    };

    // Check delegated proving configuration
    let delegated_config = zk_x509_script::onchain::fetch_delegated_proving_config(
        &rpc_url, &registry_bytes,
    ).ok();

    let delegated_required = delegated_config.as_ref().map_or(false, |c| c.required);
    let prover_url = delegated_config.as_ref().map_or(String::new(), |c| c.prover_url.clone());

    println!();
    println!("  ✓ RPC: {}", rpc_url);
    println!("  ✓ Registry: {}", registry_address);
    println!("  ✓ Chain ID: {} / Max Wallets: {}", chain_id, max_wallets);

    if delegated_required {
        println!("  ✓ Delegated proving: REQUIRED");
        if prover_url.is_empty() {
            println!("  ✗ Prover server not yet configured. Registration unavailable.");
            return;
        }
        println!("  ✓ Prover URL: {}", prover_url);
    } else {
        println!("  ✓ Delegated proving: not required (local proving)");
    }

    // ── Step 2: Certificate Selection ─────────────────
    println!();
    println!("  ── Step 2/5: Select Certificate ──");
    println!();
    println!("  Scanning {} for certificates...", platform_name());

    let identities: Vec<(CertEntry, Box<dyn PlatformIdentity>)> =
        match zk_x509_script::keychain::scan_identities_boxed() {
            Ok(ids) => ids,
            Err(e) => {
                println!("  ✗ Certificate scanning failed: {}", e);
                println!("  This platform may not be supported yet.");
                return;
            }
        };

    if identities.is_empty() {
        println!("  No certificates found in {}.", platform_name());
        #[cfg(target_os = "macos")]
        println!("  Import a certificate+key identity into Keychain Access and retry.");
        #[cfg(target_os = "windows")]
        println!("  Import a certificate+key (.pfx/.p12) into Certificate Manager and retry.");
        return;
    }

    for (i, (c, _)) in identities.iter().enumerate() {
        println!("  {}. [{}] {} ({})", i + 1, c.source, c.subject, c.issuer);
        println!("     Expires: {} | Source: {}", c.expires, platform_name());
    }
    println!();

    let input = prompt(&format!("  Select certificate [1-{}]: ", identities.len()));
    let idx = match input.parse::<usize>() {
        Ok(n) if n >= 1 && n <= identities.len() => n - 1,
        _ => { println!("  Invalid selection."); return; }
    };

    let (entry, identity) = &identities[idx];
    let mut identity = identity.clone();
    println!("  ✓ Selected: {}", entry.subject);

    // ── Step 3: Credentials ───────────────────────────
    println!();
    println!("  ── Step 3/5: Credentials ──");
    println!();

    let cert_der = match entry.cert_der.clone() {
        Some(der) => der,
        None => match identity.cert_der() {
            Ok(der) => der,
            Err(e) => {
                println!("  ✗ Failed to read certificate: {}", e);
                return;
            }
        },
    };

    println!("  ✓ Using {} (no password needed)", platform_name());
    println!("  ✓ Private key stays in OS-managed store");

    // CA public key — auto-match via remote repository, then local fallback
    let on_chain_leaves = zk_x509_script::onchain::fetch_ca_leaves(&rpc_url, &registry_bytes).ok();

    // Try remote CA repository first (per-service, hash-verified)
    let mut ca_certs = if let Some(ref leaves) = on_chain_leaves {
        println!("  Fetching CA certificates from registry...");
        let remote = zk_x509_script::ca_repo::fetch_verified_cas(
            chain_id, &registry_bytes, leaves, None,
        );
        if !remote.is_empty() {
            println!("  ✓ {} CA(s) fetched from remote repository", remote.len());
        }
        remote
    } else {
        Vec::new()
    };

    // Fallback to local data/ca-certs-*/ if remote returned nothing
    if ca_certs.is_empty() {
        ca_certs = zk_x509_script::ca::scan_ca_certs();
    }

    let ca_pub_key = auto_match_ca(&cert_der, &ca_certs, on_chain_leaves.as_deref())
        .unwrap_or_else(|| {
            println!("  ⚠ Could not auto-match CA, manual input required");
            let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
            let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
            match std::fs::read(&ca_path) {
                Ok(d) => { println!("  ✓ CA public key loaded"); d }
                Err(e) => { println!("  Failed to read CA: {}", e); std::process::exit(1); }
            }
        });

    // Wallet address
    let registrant = prompt("  Your wallet address (0x...): ");
    let registrant_bytes = match zk_x509_script::parse_eth_address(&registrant) {
        Ok(b) => b,
        Err(e) => { println!("  {}", e); return; }
    };

    let idx_str = prompt(&format!("  Wallet index (0-{}) [0]: ", max_wallets - 1));
    let wallet_index: u32 = idx_str.parse().unwrap_or(0);
    if wallet_index >= max_wallets {
        println!("  ✗ Wallet index {} exceeds max {} (0-{})", wallet_index, max_wallets, max_wallets - 1);
        return;
    }

    let mask_str = prompt("  Disclosure mask (0=hide all, 15=show all) [0]: ");
    let disclosure_mask: u8 = mask_str.parse().unwrap_or(0);

    println!("  ✓ Registrant: {}", registrant);

    // ── Step 4: Build & Generate Proof ────────────────
    println!();
    println!("  ── Step 4/5: Generate Proof ──");
    println!();

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key.clone()];
    let crl_der: Vec<u8> = Vec::new();

    // Platform-agnostic signing (private key never in memory)
    let ownership_hash = match zk_x509_script::ownership::ownership_challenge_hash(
        &cert_der, &registrant_bytes, wallet_index, timestamp, chain_id,
    ) {
        Ok(h) => h,
        Err(e) => { println!("  Failed to build ownership hash: {}", e); return; }
    };
    let ownership_sig = match identity.sign_prehash(&ownership_hash) {
        Ok(s) => s,
        Err(e) => { println!("  Ownership signing failed: {}", e); return; }
    };

    let nullifier_hash = zk_x509_script::ownership::nullifier_challenge_hash(
        &registry_bytes, chain_id,
    );
    let nullifier_sig = match identity.sign_prehash(&nullifier_hash) {
        Ok(s) => s,
        Err(e) => { println!("  Nullifier signing failed: {}", e); return; }
    };
    println!("  ✓ Signatures generated");

    // CA Merkle tree (on-chain → local fallback)
    println!("  Building CA Merkle tree...");
    let (ca_merkle_root, ca_merkle_proof) = zk_x509_script::onchain::build_ca_merkle(
        &rpc_url, &registry_bytes, &ca_pub_key,
    );
    println!("  CA Merkle Root: 0x{}", hex::encode(ca_merkle_root));

    // Build stdin
    let stdin = zk_x509_script::build_stdin(&zk_x509_script::StdinParams {
        cert_der: &cert_der,
        ownership_sig: &ownership_sig,
        nullifier_sig: &nullifier_sig,
        cert_chain: &cert_chain,
        timestamp,
        crl_der: &crl_der,
        registrant: &registrant_bytes,
        wallet_index,
        max_wallets,
        disclosure_mask,
        // Field constraints: interactive mode uses zero (no constraints).
        // For production use with constrained registries, use main/evm binaries
        // which fetch constraints from on-chain.
        required_country: [0u8; 32],
        required_org: [0u8; 32],
        required_org_unit: [0u8; 32],
        required_common_name: [0u8; 32],
        ca_merkle_proof: &ca_merkle_proof,
        ca_merkle_root,
        registry_address: &registry_bytes,
        chain_id,
    });

    // Mode selection — delegated proving overrides local
    println!();

    if delegated_required {
        // ── Delegated Proving ────────────────────────
        println!("  ── Delegated Proving ──");
        println!();
        println!("  ⚠ This service requires delegated proving.");
        println!("  Your certificate information will be sent to:");
        println!("    {}", prover_url);
        println!();
        println!("  The following data will be shared with the prover:");
        println!("    - Certificate subject (name, organization, country)");
        println!("    - Certificate chain and validity period");
        println!("    - Your wallet address");
        println!();
        println!("  Your private key will NOT be sent.");
        println!("  The prover may store this information for compliance.");
        println!();
        let consent = prompt("  Do you consent? (y/n): ");
        if consent.to_lowercase() != "y" {
            println!("  Consent declined. Exiting.");
            return;
        }

        // Sign consent with cert key
        let consent_message = format!(
            "zk-x509-delegated-proving-consent\nProver: {}\nRegistry: {}\nChain ID: {}\nWallet: {}\nTimestamp: {}",
            prover_url,
            registry_address.to_lowercase(),
            chain_id,
            registrant.to_lowercase(),
            timestamp,
        );
        let consent_hash: [u8; 32] = sha2::Sha256::digest(consent_message.as_bytes()).into();
        let consent_sig = match identity.sign_prehash(&consent_hash) {
            Ok(s) => s,
            Err(e) => { println!("  ✗ Consent signing failed: {}", e); return; }
        };
        println!("  ✓ Consent signed");

        // Encode data for prover
        let cert_b64 = base64::engine::general_purpose::STANDARD.encode(&cert_der);
        let chain_b64: Vec<String> = cert_chain.iter()
            .map(|c| base64::engine::general_purpose::STANDARD.encode(c))
            .collect();

        let body = serde_json::json!({
            "consent_signature": format!("0x{}", hex::encode(&consent_sig)),
            "cert_der": cert_b64,
            "cert_chain": chain_b64,
            "ownership_sig": format!("0x{}", hex::encode(&ownership_sig)),
            "nullifier_sig": format!("0x{}", hex::encode(&nullifier_sig)),
            "registrant": registrant.to_lowercase(),
            "wallet_index": wallet_index,
            "max_wallets": max_wallets,
            "disclosure_mask": disclosure_mask,
            "chain_id": chain_id,
            "registry_address": registry_address.to_lowercase(),
            "ca_merkle_root": format!("0x{}", hex::encode(ca_merkle_root)),
            "ca_merkle_proof": ca_merkle_proof.iter().map(|h| format!("0x{}", hex::encode(h))).collect::<Vec<_>>(),
            "timestamp": timestamp,
        });

        println!("  Sending to prover (this may take a few minutes)...");
        let url = format!("{}/api/prove", prover_url.trim_end_matches('/'));
        let resp: Result<ureq::Body, _> = ureq::post(&url)
            .header("Content-Type", "application/json")
            .send(body.to_string().as_bytes())
            .map(|r| r.into_body());

        match resp {
            Ok(mut body) => {
                let result: serde_json::Value = body.read_json()
                    .unwrap_or_else(|e| { println!("  ✗ Failed to parse response: {}", e); std::process::exit(1); });

                if let Some(err) = result.get("error") {
                    println!("  ✗ Prover error: {}", err);
                    return;
                }

                let proof_hex = result["proof"].as_str().unwrap_or("");
                let pv_hex = result["public_values"].as_str().unwrap_or("");
                let time_ms = result["proving_time_ms"].as_u64().unwrap_or(0);

                println!();
                println!("  ✓ Proof received! ({:.1} seconds)", time_ms as f64 / 1000.0);
                println!();
                println!("  ── Step 5/5: Copy to Dashboard ──");
                println!();
                println!("  ═══════════════════════════════════════");
                println!("  Proof:");
                println!("  {}", proof_hex);
                println!();
                println!("  Public Values:");
                println!("  {}", pv_hex);
                println!("  ═══════════════════════════════════════");
                println!();
                println!("  → Open http://localhost:3000/dashboard");
                println!("  → Paste Proof and Public Values");
                println!("  → Click Register");
            }
            Err(e) => {
                println!("  ✗ Failed to connect to prover: {}", e);
                println!("    Check that the prover server is running at {}", prover_url);
            }
        }

        println!();
        println!("  Done!");
        return;
    }

    let mode = prompt("  [1] Execute (fast test, no proof) / [2] Groth16 (production) [2]: ");
    let client = ProverClient::from_env();

    if mode == "1" {
        println!("  Running execute mode (fast, no on-chain proof)...");
        match client.execute(ZK_X509_ELF, stdin).run() {
            Ok((output, report)) => {
                let decoded = match PublicValuesStruct::abi_decode(output.as_slice()) {
                    Ok(d) => d,
                    Err(e) => { println!("  ✗ Failed to decode output: {}", e); return; }
                };
                let (nullifier, ca_root) = format_decoded(&decoded);
                println!();
                println!("  ✓ Verification successful!");
                println!("  ├─ Nullifier:  {}", nullifier);
                println!("  ├─ CA Root:    {}", ca_root);
                println!("  ├─ Registrant: {}", registrant);
                println!("  └─ Cycles:     {}", report.total_instruction_count());
                println!();
                println!("  ⚠ Execute mode — no proof generated.");
                println!("    To register on-chain, re-run and select [2] Groth16.");
            }
            Err(e) => { println!("  ✗ Execution failed: {}", e); return; }
        }
    } else {
        if !docker_available {
            println!("  ✗ Docker is not running.");
            println!("    Groth16 proof generation requires Docker Desktop.");
            println!();
            println!("    1. Start Docker Desktop");
            println!("    2. Re-run: ./script/run-interactive.sh");
            println!();
            std::process::exit(1);
        }
        println!("  Generating Groth16 proof (this takes several minutes)...");
        let pk = match client.setup(ZK_X509_ELF) {
            Ok(pk) => pk,
            Err(e) => { println!("  ✗ Prover setup failed: {}", e); return; }
        };
        match client.prove(&pk, stdin).groth16().run() {
            Ok(proof) => {
                let pv_bytes = proof.public_values.as_slice();
                let decoded = match PublicValuesStruct::abi_decode(pv_bytes) {
                    Ok(d) => d,
                    Err(e) => { println!("  ✗ Failed to decode proof output: {}", e); return; }
                };
                let (nullifier, ca_root) = format_decoded(&decoded);

                let proof_bytes = proof.bytes();
                let proof_hex = format!("0x{}", hex::encode(&proof_bytes));
                let pv_hex = format!("0x{}", hex::encode(pv_bytes));

                println!();
                println!("  ✓ Groth16 proof generated!");
                println!("  ├─ Nullifier:  {}", nullifier);
                println!("  ├─ CA Root:    {}", ca_root);
                println!("  ├─ Registrant: {}", registrant);
                println!("  └─ Proof size: {} bytes", proof_bytes.len());

                // ── Step 5: Output ────────────────────────────
                println!();
                println!("  ── Step 5/5: Copy to Dashboard ──");
                println!();
                println!("  ═══════════════════════════════════════");
                println!("  Proof:");
                println!("  {}", proof_hex);
                println!();
                println!("  Public Values:");
                println!("  {}", pv_hex);
                println!("  ═══════════════════════════════════════");
                println!();
                println!("  → Open http://localhost:3000/dashboard");
                println!("  → Paste Proof and Public Values");
                println!("  → Click Register");
            }
            Err(e) => println!("  ✗ Proof generation failed: {}", e),
        }
    }

    println!();
    println!("  Done!");
}

/// Check if Docker is running (required for Groth16 proof generation).
fn is_docker_running() -> bool {
    std::process::Command::new("docker")
        .arg("info")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Try to auto-match the CA that issued the user cert from the local CA directory.
/// Prioritizes on-chain verified CAs, falls back to local-only match.
fn auto_match_ca(
    user_cert_der: &[u8],
    ca_certs: &[zk_x509_script::ca::CaCertInfo],
    on_chain_leaves: Option<&[[u8; 32]]>,
) -> Option<Vec<u8>> {
    if ca_certs.is_empty() {
        return None;
    }

    // Try with on-chain filter first
    if let Some(leaves) = on_chain_leaves {
        if let Some(idx) = zk_x509_script::ca::find_issuer_ca(user_cert_der, ca_certs, Some(leaves)) {
            let ca = &ca_certs[idx];
            println!("  ✓ Auto-matched CA: {} (on-chain verified)", ca.subject);
            return Some(ca.spki_der.clone());
        }
    }

    // Fallback: match without on-chain filter
    if let Some(idx) = zk_x509_script::ca::find_issuer_ca(user_cert_der, ca_certs, None) {
        let ca = &ca_certs[idx];
        println!();
        println!("  ⚠ CA NOT REGISTERED ON-CHAIN");
        println!("  ─────────────────────────────");
        println!("  Matched CA: {}", ca.subject);
        println!();
        println!("  This CA is recognized locally but has not been");
        println!("  registered on the on-chain registry by an admin.");
        println!();
        println!("  • Execute mode (test): OK");
        println!("  • Groth16 (production): WILL FAIL");
        println!();
        println!("  Request CA registration:");
        println!("    → GitHub: github.com/Zena-park/zk-X509/issues");
        println!();
        return Some(ca.spki_der.clone());
    }

    None
}
