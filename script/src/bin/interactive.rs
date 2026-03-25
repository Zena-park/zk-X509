//! zk-X509 Interactive CLI — Guided Proof Generation
//!
//! Walks through each step sequentially:
//!   1. Settings (RPC, registry, chain)
//!   2. Certificate selection (NPKI scan)
//!   3. Password + wallet address
//!   4. Proof generation (Execute or Groth16)
//!   5. Output proof for Dashboard
//!
//! Usage:
//!   cargo run --release --bin interactive

use alloy_sol_types::SolType;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf,
};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;
use zk_x509_script::keychain::CertSource;

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");
const DEFAULT_REGISTRY: &str = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

fn prompt(msg: &str) -> String {
    print!("{}", msg);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}

fn prompt_password(msg: &str) -> String {
    if atty::is(atty::Stream::Stdin) {
        rpassword::prompt_password(msg).unwrap_or_default()
    } else {
        prompt(msg)
    }
}

fn format_decoded(decoded: &PublicValuesStruct) -> (String, String) {
    (
        format!("0x{}", hex::encode(decoded.nullifier)),
        format!("0x{}", hex::encode(decoded.caMerkleRoot)),
    )
}

fn main() {
    sp1_sdk::utils::setup_logger();

    println!();
    println!("  ╔══════════════════════════════════╗");
    println!("  ║    zk-X509 Proof Generator        ║");
    println!("  ╚══════════════════════════════════╝");
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

    println!();
    println!("  ✓ RPC: {}", rpc_url);
    println!("  ✓ Registry: {}", registry_address);
    println!("  ✓ Chain ID: {} / Max Wallets: {}", chain_id, max_wallets);

    // ── Step 2: Certificate Selection ─────────────────
    println!();
    println!("  ── Step 2/5: Select Certificate ──");
    println!();
    println!("  Scanning for certificates...");

    // Collect file-based certs
    let file_certs = zk_x509_script::keychain::scan_npki_certs();

    // Collect keychain identities (macOS only) — keep handles for signing later
    #[cfg(target_os = "macos")]
    let keychain_identities: Vec<(zk_x509_script::keychain::NpkiCertEntry,
        zk_x509_script::keychain::macos_keychain::KeychainIdentity)> = {
        match zk_x509_script::keychain::macos_keychain::scan_identities() {
            Ok(ids) => ids,
            Err(e) => {
                println!("  ⚠ Keychain scan failed: {}", e);
                Vec::new()
            }
        }
    };

    // Build unified display list
    let mut certs: Vec<&zk_x509_script::keychain::NpkiCertEntry> = Vec::new();
    for c in &file_certs { certs.push(c); }
    #[cfg(target_os = "macos")]
    for (c, _) in &keychain_identities { certs.push(c); }

    if certs.is_empty() {
        println!("  No certificates found.");
        println!("  Checked: ~/Library/Preferences/NPKI/, ~/.pki/NPKI/, certs/");
        #[cfg(target_os = "macos")]
        println!("  Also checked: macOS Keychain");
        println!("  Place test certs in certs/ directory and retry.");
        return;
    }

    for (i, c) in certs.iter().enumerate() {
        let source_label = format!("[{}]", c.source);
        println!("  {}. {} {} ({})", i + 1, source_label, c.subject, c.issuer);
        match c.source {
            CertSource::File => {
                println!("     Expires: {} | Path: {}", c.expires,
                    c.cert_path.parent().unwrap_or(&c.cert_path).display());
            }
            #[cfg(target_os = "macos")]
            CertSource::Keychain => {
                println!("     Expires: {} | Source: macOS Keychain", c.expires);
            }
        }
    }
    println!();

    let input = prompt(&format!("  Select certificate [1-{}]: ", certs.len()));
    let idx = match input.parse::<usize>() {
        Ok(n) if n >= 1 && n <= certs.len() => n - 1,
        _ => { println!("  Invalid selection."); return; }
    };
    let entry = certs[idx];
    println!("  ✓ Selected: {}", entry.subject);

    // ── Step 3: Credentials ───────────────────────────
    println!();
    println!("  ── Step 3/5: Credentials ──");
    println!();

    // Load certificate DER and prepare signing capability based on source
    #[cfg(target_os = "macos")]
    let keychain_identity: Option<zk_x509_script::keychain::macos_keychain::KeychainIdentity>;

    let (cert_der, key_der_opt) = match entry.source {
        CertSource::File => {
            let cert = match std::fs::read(&entry.cert_path) {
                Ok(d) => d,
                Err(e) => { println!("  Failed to read cert: {}", e); return; }
            };
            let key_raw = match std::fs::read(&entry.key_path) {
                Ok(d) => d,
                Err(e) => { println!("  Failed to read key: {}", e); return; }
            };

            let password = prompt_password("  Certificate password (empty if unencrypted): ");
            let key_der = if password.is_empty() {
                key_raw
            } else {
                match zk_x509_script::npki::decrypt_npki_key(&key_raw, &password) {
                    Ok(k) => k,
                    Err(e) => { println!("  Decryption failed: {}", e); return; }
                }
            };
            drop(password);
            println!("  ✓ Private key decrypted");
            #[cfg(target_os = "macos")]
            { keychain_identity = None; }
            (cert, Some(key_der))
        }
        #[cfg(target_os = "macos")]
        CertSource::Keychain => {
            // Find the matching identity from the already-scanned list (no re-scan)
            let matched = keychain_identities.iter()
                .find(|(e, _)| e.serial_hex == entry.serial_hex);
            match matched {
                Some((kc_entry, kc_id)) => {
                    let cert = kc_entry.cert_der.clone().unwrap_or_else(|| {
                        kc_id.identity.certificate().unwrap().to_der()
                    });
                    println!("  ✓ Using macOS Keychain (no password needed)");
                    println!("  ✓ Private key stays in Secure Enclave / Keychain");
                    keychain_identity = Some(kc_id.clone());
                    (cert, None)
                }
                None => {
                    println!("  ✗ Keychain identity not found (may have been removed)");
                    return;
                }
            }
        }
    };

    // CA public key — auto-match from data/ca-certs/ directory
    let ca_certs = zk_x509_script::ca::scan_ca_certs();
    let ca_pub_key = if ca_certs.is_empty() {
        println!("  ⚠ No CA certs in data/ca-certs/, manual input required");
        let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
        let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
        match std::fs::read(&ca_path) {
            Ok(d) => { println!("  ✓ CA public key loaded"); d }
            Err(e) => { println!("  Failed to read CA: {}", e); return; }
        }
    } else {
        // Try on-chain filtering first
        let on_chain_leaves = zk_x509_script::onchain::fetch_ca_leaves(&rpc_url, &registry_bytes).ok();
        let leaves_ref = on_chain_leaves.as_deref();

        match zk_x509_script::ca::find_issuer_ca(&cert_der, &ca_certs, leaves_ref) {
            Some(idx) => {
                let ca = &ca_certs[idx];
                println!("  ✓ Auto-matched CA: {}", ca.subject);
                if leaves_ref.is_some() {
                    println!("    (on-chain verified)");
                }
                ca.spki_der.clone()
            }
            None => {
                // Fallback: try without on-chain filter
                match zk_x509_script::ca::find_issuer_ca(&cert_der, &ca_certs, None) {
                    Some(idx) => {
                        let ca = &ca_certs[idx];
                        println!("  ✓ Auto-matched CA: {} (not yet on-chain)", ca.subject);
                        ca.spki_der.clone()
                    }
                    None => {
                        println!("  ⚠ Could not auto-match CA, manual input required");
                        let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
                        let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
                        match std::fs::read(&ca_path) {
                            Ok(d) => { println!("  ✓ CA public key loaded"); d }
                            Err(e) => { println!("  Failed to read CA: {}", e); return; }
                        }
                    }
                }
            }
        }
    };

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

    // Signatures — branch on cert source
    let (ownership_sig, nullifier_sig) = match &key_der_opt {
        Some(key_der) => {
            // File-based: sign with decrypted private key
            let ownership = match zk_x509_script::ownership::sign_ownership(
                &cert_der, key_der, &registrant_bytes, wallet_index, timestamp, chain_id,
            ) {
                Ok(s) => s,
                Err(e) => { println!("  Ownership sign failed: {}", e); return; }
            };
            let nullifier = match zk_x509_script::ownership::sign_nullifier(
                &cert_der, key_der, &registry_bytes, chain_id,
            ) {
                Ok(s) => s,
                Err(e) => { println!("  Nullifier sign failed: {}", e); return; }
            };
            (ownership, nullifier)
        }
        #[cfg(target_os = "macos")]
        None => {
            // Keychain-based: sign via OS keychain (private key never in memory)
            let kc_id = keychain_identity.as_ref().unwrap();

            let ownership_hash = match zk_x509_script::ownership::ownership_challenge_hash(
                &cert_der, &registrant_bytes, wallet_index, timestamp, chain_id,
            ) {
                Ok(h) => h,
                Err(e) => { println!("  Failed to build ownership hash: {}", e); return; }
            };
            let ownership = match zk_x509_script::keychain::macos_keychain::sign_with_identity(
                kc_id, &ownership_hash,
            ) {
                Ok(s) => s,
                Err(e) => { println!("  Keychain ownership sign failed: {}", e); return; }
            };

            let nullifier_hash = zk_x509_script::ownership::nullifier_challenge_hash(
                &registry_bytes, chain_id,
            );
            let nullifier = match zk_x509_script::keychain::macos_keychain::sign_with_identity(
                kc_id, &nullifier_hash,
            ) {
                Ok(s) => s,
                Err(e) => { println!("  Keychain nullifier sign failed: {}", e); return; }
            };

            (ownership, nullifier)
        }
        #[cfg(not(target_os = "macos"))]
        None => {
            println!("  ✗ Keychain signing not supported on this platform");
            return;
        }
    };
    println!("  ✓ Signatures generated");

    // CA Merkle tree
    println!("  Fetching CA list from on-chain...");
    let (ca_merkle_root, ca_merkle_proof) = match zk_x509_script::onchain::build_ca_merkle_from_onchain(
        &rpc_url, &registry_bytes, &ca_pub_key,
    ) {
        Ok(r) => { println!("  ✓ On-chain CA Merkle tree built"); r }
        Err(e) => {
            println!("  ⚠ On-chain fetch failed: {}", e);
            println!("    Falling back to single-CA local mode...");
            let (_leaf, root, proof) = zk_x509_script::merkle::ca_merkle_tree(&ca_pub_key, &[]);
            (root, proof)
        }
    };
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
        ca_merkle_proof: &ca_merkle_proof,
        ca_merkle_root,
        registry_address: &registry_bytes,
        chain_id,
    });

    // Mode selection
    println!();
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
        println!("  Generating Groth16 proof (this takes several minutes, Docker required)...");
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
