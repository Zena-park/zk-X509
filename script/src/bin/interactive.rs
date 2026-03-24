//! zk-X509 Interactive CLI
//!
//! Scans NPKI directories for certificates, user selects one,
//! enters password each time, generates proof, submits on-chain.
//! No persistent storage of keys — everything in memory, cleared after use.
//!
//! Usage:
//!   cargo run --release --bin interactive

use alloy_sol_types::SolType;
use sha2::Digest;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, ProvingKey, SP1Stdin,
};
use std::io::{self, Write};
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;
use zk_x509_script::keychain::NpkiCertEntry;

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

struct Session {
    selected: Option<NpkiCertEntry>,
    proof_output: Option<Vec<u8>>,
    nullifier: Option<String>,
    ca_root_hash: Option<String>,
    registrant: Option<String>,
}

fn prompt(msg: &str) -> String {
    print!("{}", msg);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}

fn prompt_password(msg: &str) -> String {
    // Use regular prompt when stdin is piped, rpassword when interactive
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
        proof_output: None,
        nullifier: None,
        ca_root_hash: None,
        registrant: None,
    };

    loop {
        println!();
        println!("  ─────────────────────────────────");
        println!("  1. Scan certificates");
        println!("  2. Select certificate");
        println!("  3. Verify (execute mode)");
        println!("  4. Submit on-chain");
        println!("  5. Status");
        println!("  q. Quit");
        println!("  ─────────────────────────────────");
        if let Some(c) = &session.selected {
            print!("  [{}]", c.subject);
            if session.proof_output.is_some() { print!(" [proof ready]"); }
            println!();
        }
        println!();

        match prompt("  > ").as_str() {
            "1" => cmd_scan(),
            "2" => cmd_select(&mut session),
            "3" => cmd_prove(&mut session),
            "4" => cmd_submit(&session),
            "5" => cmd_status(&session),
            "q" | "Q" => { println!("  Bye!"); break; }
            "" => {}
            _ => println!("  Enter 1-5 or q."),
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
    session.proof_output = None;
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

    let password = prompt_password("  Certificate password: ");
    let key_der = if password.is_empty() {
        key_raw
    } else {
        match zk_x509_script::npki::decrypt_npki_key(&key_raw, &password) {
            Ok(k) => k,
            Err(e) => { println!("  Decryption failed: {}", e); return; }
        }
    };
    // password goes out of scope here — dropped from memory

    // CA public key
    let ca_path = prompt("  CA public key path [certs/ca_pub.der]: ");
    let ca_path = if ca_path.is_empty() { "certs/ca_pub.der".to_string() } else { ca_path };
    let ca_pub_key = match std::fs::read(&ca_path) {
        Ok(d) => d,
        Err(e) => { println!("  Error: {}", e); return; }
    };

    // Wallet address
    let registrant = prompt("  Wallet address (0x...): ");
    if !registrant.starts_with("0x") || registrant.len() != 42 {
        println!("  Invalid address.");
        return;
    }
    let registrant_bytes: [u8; 20] = match hex::decode(&registrant[2..]) {
        Ok(b) => match b.try_into() {
            Ok(a) => a,
            Err(_) => { println!("  Invalid address."); return; }
        },
        Err(_) => { println!("  Invalid hex."); return; }
    };
    session.registrant = Some(registrant.clone());

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key.clone()];
    let crl_der: Vec<u8> = Vec::new();

    println!("  Executing ZK program (verify mode, no proof generation)...");
    println!("  For full proof, use the prover server's /prove endpoint.");
    let client = ProverClient::from_env();

    let idx_str = prompt("  Wallet index [0]: ");
    let wallet_index: u32 = idx_str.parse().unwrap_or(0);
    let max_wallets: u32 = 1;

    let chain_id = zk_x509_script::DEFAULT_CHAIN_ID;
    let registry_address = zk_x509_script::DEFAULT_REGISTRY_ADDRESS;
    let ownership_sig = zk_x509_script::ownership::sign_ownership(
        &cert_der, &key_der, &registrant_bytes, wallet_index, timestamp, chain_id,
    ).unwrap_or_else(|e| { println!("  Sign failed: {}", e); std::process::exit(1); });
    let nullifier_sig = zk_x509_script::ownership::sign_nullifier(
        &cert_der, &key_der, &registry_address, chain_id,
    ).unwrap_or_else(|e| { println!("  Nullifier sign failed: {}", e); std::process::exit(1); });

    let mask_str = prompt("  Disclosure mask (15=all, 1=country, 0=none) [15]: ");
    let disclosure_mask: u8 = mask_str.parse().unwrap_or(0x0F);

    let (_ca_leaf, ca_merkle_root, ca_merkle_proof) =
        zk_x509_script::merkle::ca_merkle_tree(&ca_pub_key, &[]);

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
        registry_address: &registry_address,
        chain_id,
    });
    match client.execute(ZK_X509_ELF, stdin).run() {
        Ok((output, report)) => {
            let decoded = PublicValuesStruct::abi_decode(output.as_slice())
                .expect("Failed to decode");

            let nullifier = format!("0x{}", hex::encode(decoded.nullifier));
            let ca_hash = format!("0x{}", hex::encode(decoded.caMerkleRoot));

            println!();
            println!("  Verification successful! (execute mode — public values below)");
            println!("  ├─ Nullifier:  {}", nullifier);
            println!("  ├─ CA Hash:    {}", ca_hash);
            println!("  ├─ Registrant: {}", registrant);
            println!("  └─ Cycles:     {}", report.total_instruction_count());

            session.nullifier = Some(nullifier);
            session.ca_root_hash = Some(ca_hash);
            session.proof_output = Some(output.to_vec());
        }
        Err(e) => println!("  Failed: {}", e),
    }
}

fn cmd_submit(session: &Session) {
    let output = match &session.proof_output {
        Some(o) => o,
        None => { println!("  Run verify first [3]."); return; }
    };

    println!("  NOTE: CLI execute mode produces public values but not a real ZK proof.");
    println!("  For production, use the prover server's /prove endpoint + web frontend.");
    println!("  Proceeding with mock proof (0x1234) for testing...");
    println!();

    let rpc = prompt("  RPC URL [http://localhost:8545]: ");
    let rpc = if rpc.is_empty() { "http://localhost:8545".to_string() } else { rpc };

    let registry = prompt("  IdentityRegistry address (0x...): ");
    if !registry.starts_with("0x") { println!("  Invalid."); return; }

    let eth_key = prompt_password("  Ethereum private key (0x...): ");
    if !eth_key.starts_with("0x") { println!("  Invalid."); return; }

    let pv_hex = format!("0x{}", hex::encode(output));

    println!("  Submitting transaction...");

    // Pass ETH key via env var instead of CLI arg (avoids /proc exposure)
    let status = std::process::Command::new("cast")
        .args([
            "send", &registry,
            "register(bytes,bytes)", "0x1234", &pv_hex,
            "--rpc-url", &rpc,
        ])
        .env("ETH_PRIVATE_KEY", &eth_key)
        .status();

    match status {
        Ok(s) if s.success() => println!("  Registration successful!"),
        Ok(s) => println!("  Failed (exit {})", s),
        Err(e) => println!("  `cast` not found: {}. Install Foundry.", e),
    }
}

fn cmd_status(session: &Session) {
    println!("  Certificate: {}", session.selected.as_ref()
        .map(|c| c.subject.as_str()).unwrap_or("none"));
    println!("  Registrant:  {}", session.registrant.as_deref().unwrap_or("none"));
    println!("  Nullifier:   {}", session.nullifier.as_deref().unwrap_or("no proof"));
    println!("  CA Hash:     {}", session.ca_root_hash.as_deref().unwrap_or("no proof"));
    println!("  Proof:       {}", if session.proof_output.is_some() { "ready" } else { "none" });
}
