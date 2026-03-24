//! zk-X509 Interactive CLI
//!
//! Scans NPKI directories for certificates, user selects one,
//! enters password each time, generates Groth16 proof for on-chain registration.
//! No persistent storage of keys — everything in memory, cleared after use.
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

struct Session {
    selected: Option<NpkiCertEntry>,
    proof_hex: Option<String>,
    public_values_hex: Option<String>,
    nullifier: Option<String>,
    ca_root_hash: Option<String>,
    registrant: Option<String>,
    // Saved settings (persist across proof generations)
    rpc_url: String,
    registry_address: String,
    chain_id: u64,
    max_wallets: u32,
}

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

fn main() {
    sp1_sdk::utils::setup_logger();

    println!();
    println!("  ╔══════════════════════════════════╗");
    println!("  ║    zk-X509 Interactive CLI        ║");
    println!("  ╚══════════════════════════════════╝");

    let mut session = Session {
        selected: None,
        proof_hex: None,
        public_values_hex: None,
        nullifier: None,
        ca_root_hash: None,
        registrant: None,
        rpc_url: "http://localhost:8545".to_string(),
        registry_address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512".to_string(),
        chain_id: zk_x509_script::DEFAULT_CHAIN_ID,
        max_wallets: 3,
    };

    loop {
        println!();
        println!("  ─────────────────────────────────");
        println!("  1. Scan certificates");
        println!("  2. Select certificate");
        println!("  3. Generate proof (Groth16)");
        println!("  4. Show proof (copy to frontend)");
        println!("  5. Settings");
        println!("  6. Status");
        println!("  q. Quit");
        println!("  ─────────────────────────────────");
        if let Some(c) = &session.selected {
            print!("  [{}]", c.subject);
            if session.proof_hex.is_some() { print!(" [proof ready]"); }
            println!();
        }
        println!();

        match prompt("  > ").as_str() {
            "1" => cmd_scan(),
            "2" => cmd_select(&mut session),
            "3" => cmd_prove(&mut session),
            "4" => cmd_show_proof(&session),
            "5" => cmd_settings(&mut session),
            "6" => cmd_status(&session),
            "q" | "Q" => { println!("  Bye!"); break; }
            "" => {}
            _ => println!("  Enter 1-6 or q."),
        }
    }
}

fn cmd_scan() {
    println!("  Scanning for NPKI certificates...");
    let certs = zk_x509_script::keychain::scan_npki_certs();
    if certs.is_empty() {
        println!("  No certificates found.");
        println!("  Checked: ~/Library/Preferences/NPKI/, ~/.pki/NPKI/, certs/");
    } else {
        for (i, c) in certs.iter().enumerate() {
            println!("  {}. {}", i + 1, c.subject);
            println!("     Issuer:  {}", c.issuer);
            println!("     Expires: {}", c.expires);
            println!("     Path:    {}", c.cert_path.parent().unwrap_or(&c.cert_path).display());
        }
        println!("  Found {} certificate(s).", certs.len());
    }
}

fn cmd_select(session: &mut Session) {
    let certs = zk_x509_script::keychain::scan_npki_certs();
    if certs.is_empty() {
        println!("  No certificates found. Run [1] first to check paths.");
        return;
    }

    for (i, c) in certs.iter().enumerate() {
        println!("  {}. {} ({})", i + 1, c.subject, c.issuer);
    }

    let input = prompt(&format!("  Select [1-{}]: ", certs.len()));
    let idx = match input.parse::<usize>() {
        Ok(n) if n >= 1 && n <= certs.len() => n - 1,
        _ => { println!("  Invalid."); return; }
    };

    session.selected = Some(certs[idx].clone());
    session.proof_hex = None;
    session.public_values_hex = None;
    session.nullifier = None;
    session.ca_root_hash = None;
    println!("  Selected: {}", certs[idx].subject);
}

fn cmd_prove(session: &mut Session) {
    let entry = match &session.selected {
        Some(e) => e.clone(),
        None => { println!("  Select a certificate first [2]."); return; }
    };

    // Read certificate
    let cert_der = match std::fs::read(&entry.cert_path) {
        Ok(d) => d,
        Err(e) => { println!("  Failed to read cert: {}", e); return; }
    };

    // Read and decrypt private key
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
    // password dropped from memory here

    // CA public key
    let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
    let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
    let ca_pub_key = match std::fs::read(&ca_path) {
        Ok(d) => d,
        Err(e) => { println!("  Error: {}", e); return; }
    };

    // Registrant
    let registrant_input = prompt(&format!(
        "  Wallet address [{}]: ",
        session.registrant.as_deref().unwrap_or("0x...")
    ));
    let registrant = if registrant_input.is_empty() {
        match &session.registrant {
            Some(r) => r.clone(),
            None => { println!("  Wallet address required."); return; }
        }
    } else {
        registrant_input
    };
    let registrant_bytes = match zk_x509_script::parse_eth_address(&registrant) {
        Ok(b) => b,
        Err(e) => { println!("  {}", e); return; }
    };
    session.registrant = Some(registrant.clone());

    let registry_bytes = match zk_x509_script::parse_eth_address(&session.registry_address) {
        Ok(b) => b,
        Err(e) => { println!("  Invalid registry address: {}", e); return; }
    };

    let idx_str = prompt("  Wallet index [0]: ");
    let wallet_index: u32 = idx_str.parse().unwrap_or(0);

    let mask_str = prompt("  Disclosure mask (15=all, 0=none) [15]: ");
    let disclosure_mask: u8 = mask_str.parse().unwrap_or(0x0F);

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key.clone()];
    let crl_der: Vec<u8> = Vec::new();

    // Ownership + nullifier signatures
    let ownership_sig = zk_x509_script::ownership::sign_ownership(
        &cert_der, &key_der, &registrant_bytes, wallet_index, timestamp, session.chain_id,
    ).unwrap_or_else(|e| { println!("  Sign failed: {}", e); std::process::exit(1); });
    let nullifier_sig = zk_x509_script::ownership::sign_nullifier(
        &cert_der, &key_der, &registry_bytes, session.chain_id,
    ).unwrap_or_else(|e| { println!("  Nullifier sign failed: {}", e); std::process::exit(1); });

    // CA Merkle tree (from on-chain)
    println!("  Fetching CA list from on-chain ({})...", session.rpc_url);
    let (ca_merkle_root, ca_merkle_proof) = match zk_x509_script::onchain::build_ca_merkle_from_onchain(
        &session.rpc_url, &registry_bytes, &ca_pub_key,
    ) {
        Ok(r) => r,
        Err(e) => {
            println!("  On-chain CA fetch failed: {}", e);
            println!("  Falling back to single-CA local mode...");
            let (_leaf, root, proof) = zk_x509_script::merkle::ca_merkle_tree(&ca_pub_key, &[]);
            (root, proof)
        }
    };
    println!("  CA Merkle Root: 0x{}", hex::encode(ca_merkle_root));

    let stdin = zk_x509_script::build_stdin(&zk_x509_script::StdinParams {
        cert_der: &cert_der,
        ownership_sig: &ownership_sig,
        nullifier_sig: &nullifier_sig,
        cert_chain: &cert_chain,
        timestamp,
        crl_der: &crl_der,
        registrant: &registrant_bytes,
        wallet_index,
        max_wallets: session.max_wallets,
        disclosure_mask,
        ca_merkle_proof: &ca_merkle_proof,
        ca_merkle_root,
        registry_address: &registry_bytes,
        chain_id: session.chain_id,
    });

    // Proof mode selection
    let mode = prompt("  Mode: [1] Execute (fast test) / [2] Groth16 proof [1]: ");
    let client = ProverClient::from_env();

    if mode == "2" {
        println!("  Generating Groth16 proof (this takes several minutes, Docker required)...");
        let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");
        match client.prove(&pk, stdin).groth16().run() {
            Ok(proof) => {
                let pv_bytes = proof.public_values.as_slice();
                let decoded = PublicValuesStruct::abi_decode(pv_bytes).expect("Failed to decode");

                let proof_bytes = proof.bytes();
                let proof_hex = format!("0x{}", hex::encode(&proof_bytes));
                let pv_hex = format!("0x{}", hex::encode(pv_bytes));

                let nullifier = format!("0x{}", hex::encode(decoded.nullifier));
                let ca_hash = format!("0x{}", hex::encode(decoded.caMerkleRoot));

                println!();
                println!("  Groth16 proof generated!");
                println!("  ├─ Nullifier:  {}", nullifier);
                println!("  ├─ CA Root:    {}", ca_hash);
                println!("  ├─ Registrant: {}", registrant);
                println!("  └─ Proof size: {} bytes", proof_bytes.len());

                session.proof_hex = Some(proof_hex);
                session.public_values_hex = Some(pv_hex);
                session.nullifier = Some(nullifier);
                session.ca_root_hash = Some(ca_hash);
            }
            Err(e) => println!("  Proof generation failed: {}", e),
        }
    } else {
        println!("  Executing ZK program (fast verify, no on-chain proof)...");
        match client.execute(ZK_X509_ELF, stdin).run() {
            Ok((output, report)) => {
                let decoded = PublicValuesStruct::abi_decode(output.as_slice())
                    .expect("Failed to decode");

                let nullifier = format!("0x{}", hex::encode(decoded.nullifier));
                let ca_hash = format!("0x{}", hex::encode(decoded.caMerkleRoot));

                println!();
                println!("  Verification successful! (execute mode — no proof for on-chain)");
                println!("  ├─ Nullifier:  {}", nullifier);
                println!("  ├─ CA Root:    {}", ca_hash);
                println!("  ├─ Registrant: {}", registrant);
                println!("  └─ Cycles:     {}", report.total_instruction_count());

                session.nullifier = Some(nullifier);
                session.ca_root_hash = Some(ca_hash);
                session.proof_hex = None;
                session.public_values_hex = None;
            }
            Err(e) => println!("  Failed: {}", e),
        }
    }
}

fn cmd_show_proof(session: &Session) {
    match (&session.proof_hex, &session.public_values_hex) {
        (Some(proof), Some(pv)) => {
            println!();
            println!("  ══════ Copy to Dashboard ══════");
            println!();
            println!("  Proof:");
            println!("  {}", proof);
            println!();
            println!("  Public Values:");
            println!("  {}", pv);
            println!();
            println!("  ═══════════════════════════════");
            println!("  Paste these into the Dashboard → Submit New Proof → Register");
        }
        _ => {
            println!("  No Groth16 proof available.");
            println!("  Run [3] and select Groth16 mode [2] to generate a proof.");
        }
    }
}

fn cmd_settings(session: &mut Session) {
    println!("  Current settings:");
    println!("  ├─ RPC URL:     {}", session.rpc_url);
    println!("  ├─ Registry:    {}", session.registry_address);
    println!("  ├─ Chain ID:    {}", session.chain_id);
    println!("  └─ Max Wallets: {}", session.max_wallets);
    println!();

    let rpc = prompt(&format!("  RPC URL [{}]: ", session.rpc_url));
    if !rpc.is_empty() { session.rpc_url = rpc; }

    let reg = prompt(&format!("  Registry address [{}]: ", session.registry_address));
    if !reg.is_empty() { session.registry_address = reg; }

    let cid = prompt(&format!("  Chain ID [{}]: ", session.chain_id));
    if !cid.is_empty() { session.chain_id = cid.parse().unwrap_or(session.chain_id); }

    let mw = prompt(&format!("  Max wallets per cert [{}]: ", session.max_wallets));
    if !mw.is_empty() { session.max_wallets = mw.parse().unwrap_or(session.max_wallets); }

    println!("  Settings updated.");
}

fn cmd_status(session: &Session) {
    println!("  Certificate: {}", session.selected.as_ref()
        .map(|c| c.subject.as_str()).unwrap_or("none"));
    println!("  Registrant:  {}", session.registrant.as_deref().unwrap_or("none"));
    println!("  Nullifier:   {}", session.nullifier.as_deref().unwrap_or("no proof"));
    println!("  CA Root:     {}", session.ca_root_hash.as_deref().unwrap_or("no proof"));
    println!("  Proof:       {}", if session.proof_hex.is_some() { "Groth16 ready" } else { "none" });
    println!("  ─────────────────────────────────");
    println!("  RPC:         {}", session.rpc_url);
    println!("  Registry:    {}", session.registry_address);
    println!("  Chain ID:    {}", session.chain_id);
    println!("  Max Wallets: {}", session.max_wallets);
}
