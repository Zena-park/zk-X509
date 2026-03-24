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
use sha2::Digest;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1Stdin,
};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;
use zk_x509_script::keychain::NpkiCertEntry;

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

    let mw_input = prompt("  Max wallets per cert [3]: ");
    let max_wallets: u32 = mw_input.parse().unwrap_or(3);

    let registry_bytes = match zk_x509_script::parse_eth_address(&registry_address) {
        Ok(b) => b,
        Err(e) => { println!("  Invalid registry address: {}", e); return; }
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

    let certs = zk_x509_script::keychain::scan_npki_certs();
    if certs.is_empty() {
        println!("  No NPKI certificates found.");
        println!("  Checked: ~/Library/Preferences/NPKI/, ~/.pki/NPKI/, certs/");
        println!("  Place test certs in certs/ directory and retry.");
        return;
    }

    for (i, c) in certs.iter().enumerate() {
        println!("  {}. {} ({})", i + 1, c.subject, c.issuer);
        println!("     Expires: {} | Path: {}", c.expires,
            c.cert_path.parent().unwrap_or(&c.cert_path).display());
    }
    println!();

    let input = prompt(&format!("  Select certificate [1-{}]: ", certs.len()));
    let idx = match input.parse::<usize>() {
        Ok(n) if n >= 1 && n <= certs.len() => n - 1,
        _ => { println!("  Invalid selection."); return; }
    };
    let entry = &certs[idx];
    println!("  ✓ Selected: {}", entry.subject);

    // ── Step 3: Credentials ───────────────────────────
    println!();
    println!("  ── Step 3/5: Credentials ──");
    println!();

    // Read cert + key
    let cert_der = match std::fs::read(&entry.cert_path) {
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

    // CA public key
    let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
    let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
    let ca_pub_key = match std::fs::read(&ca_path) {
        Ok(d) => d,
        Err(e) => { println!("  Failed to read CA: {}", e); return; }
    };
    println!("  ✓ CA public key loaded");

    // Wallet address
    let registrant = prompt("  Your wallet address (0x...): ");
    let registrant_bytes = match zk_x509_script::parse_eth_address(&registrant) {
        Ok(b) => b,
        Err(e) => { println!("  {}", e); return; }
    };

    let idx_str = prompt("  Wallet index [0]: ");
    let wallet_index: u32 = idx_str.parse().unwrap_or(0);

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

    // Signatures
    let ownership_sig = match zk_x509_script::ownership::sign_ownership(
        &cert_der, &key_der, &registrant_bytes, wallet_index, timestamp, chain_id,
    ) {
        Ok(s) => s,
        Err(e) => { println!("  Ownership sign failed: {}", e); return; }
    };
    let nullifier_sig = match zk_x509_script::ownership::sign_nullifier(
        &cert_der, &key_der, &registry_bytes, chain_id,
    ) {
        Ok(s) => s,
        Err(e) => { println!("  Nullifier sign failed: {}", e); return; }
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
                let decoded = PublicValuesStruct::abi_decode(output.as_slice())
                    .expect("Failed to decode");
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
        let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");
        match client.prove(&pk, stdin).groth16().run() {
            Ok(proof) => {
                let pv_bytes = proof.public_values.as_slice();
                let decoded = PublicValuesStruct::abi_decode(pv_bytes).expect("Failed to decode");
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
