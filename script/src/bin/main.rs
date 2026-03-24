//! ZK X.509 Host Script - Reads certificate files and generates/verifies ZK proofs.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release -- --execute \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der
//!
//!   RUST_LOG=info cargo run --release -- --prove \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der

use alloy_sol_types::SolType;
use sha2::Digest;
use clap::Parser;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, ProvingKey, SP1Stdin,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;

/// The ELF file for the ZK X.509 verification program.
const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

#[derive(Parser, Debug)]
#[command(author, version, about = "ZK X.509 Certificate Verification")]
struct Args {
    /// Execute the program (without generating a proof)
    #[arg(long)]
    execute: bool,

    /// Generate a ZK proof
    #[arg(long)]
    prove: bool,

    /// Compute and print CA Merkle Root only (no proof, no zkVM)
    #[arg(long)]
    ca_root: bool,

    /// Path to the X.509 certificate file (DER format)
    #[arg(long, default_value = "certs/signCert.der")]
    cert: PathBuf,

    /// Path to the private key file (DER/PKCS#1 format)
    #[arg(long, default_value = "certs/signPri.key")]
    key: PathBuf,

    /// Root CA public key (SPKI DER). Always the last element in the chain.
    #[arg(long, default_value = "certs/ca_pub.der")]
    ca_cert: PathBuf,

    /// Additional trusted CA public keys (SPKI DER) for multi-CA Merkle tree.
    #[arg(long)]
    extra_ca: Vec<PathBuf>,

    /// Intermediate CA certificates (full X.509 DER), in order from user→root.
    /// For single-level CA (no intermediates), omit this.
    #[arg(long)]
    intermediate: Vec<PathBuf>,

    /// Path to CRL file (DER format, optional). If provided, cert serial is checked.
    #[arg(long)]
    crl: Option<PathBuf>,

    /// Wallet address to bind the proof to (hex, e.g. 0xf39F...). Required for --execute/--prove.
    #[arg(long)]
    registrant: Option<String>,

    /// Wallet slot index (0-based, for multi-wallet mode).
    #[arg(long, default_value = "0")]
    wallet_index: u32,

    /// Max wallets per certificate (must match contract's maxWalletsPerCert).
    #[arg(long, default_value = "1")]
    max_wallets: u32,

    /// Selective disclosure bitmask: bit 0=C, 1=O, 2=OU, 3=CN. Default 0=hide all.
    #[arg(long, default_value = "0")]
    disclosure_mask: u8,

    /// Chain ID (EIP-155). Default: 31337 (Anvil local).
    #[arg(long, default_value = "31337")]
    chain_id: u64,

    /// IdentityRegistry address (hex). For cross-DApp nullifier separation.
    #[arg(long, default_value = "0x0000000000000000000000000000000000000000")]
    registry_address: String,

    /// JSON-RPC URL to fetch on-chain CA list. When set, --extra-ca is ignored
    /// and the CA Merkle tree is built from on-chain getCaLeaves().
    #[arg(long)]
    rpc_url: Option<String>,
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = Args::parse();

    // --ca-root: compute CA Merkle Root and exit (no zkVM, no proof)
    if args.ca_root {
        let ca_pub_key = std::fs::read(&args.ca_cert)
            .unwrap_or_else(|e| panic!("Failed to read CA cert file {:?}: {}", args.ca_cert, e));
        let mut extra_hashes = Vec::new();
        for extra in &args.extra_ca {
            let extra_pub = std::fs::read(extra)
                .unwrap_or_else(|e| panic!("Failed to read extra CA {:?}: {}", extra, e));
            extra_hashes.push(sha2::Sha256::digest(&extra_pub).into());
        }
        let (_, ca_merkle_root, _) = zk_x509_script::merkle::ca_merkle_tree(&ca_pub_key, &extra_hashes);
        println!("CA Merkle Root: 0x{}", hex::encode(ca_merkle_root));
        println!("CA count: {}", 1 + extra_hashes.len());
        return;
    }

    if args.execute == args.prove {
        eprintln!("Error: You must specify either --execute or --prove");
        std::process::exit(1);
    }

    // Read certificate files
    let cert_der = std::fs::read(&args.cert)
        .unwrap_or_else(|e| panic!("Failed to read cert file {:?}: {}", args.cert, e));
    let priv_key = std::fs::read(&args.key)
        .unwrap_or_else(|e| panic!("Failed to read key file {:?}: {}", args.key, e));
    let ca_pub_key = std::fs::read(&args.ca_cert)
        .unwrap_or_else(|e| panic!("Failed to read CA cert file {:?}: {}", args.ca_cert, e));

    println!("Certificate: {} ({} bytes)", args.cert.display(), cert_der.len());
    println!("Private Key: {} ({} bytes)", args.key.display(), priv_key.len());
    println!("CA Public Key: {} ({} bytes)", args.ca_cert.display(), ca_pub_key.len());

    // Setup the prover client
    let client = ProverClient::from_env();

    // Current timestamp for validity check
    let current_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    println!("Current Timestamp: {}", current_timestamp);

    // Build certificate chain: [intermediate_certs..., root_ca_pub_key]
    let mut cert_chain: Vec<Vec<u8>> = Vec::new();
    for path in &args.intermediate {
        let intermediate = std::fs::read(path)
            .unwrap_or_else(|e| panic!("Failed to read intermediate cert {:?}: {}", path, e));
        println!("Intermediate CA: {} ({} bytes)", path.display(), intermediate.len());
        cert_chain.push(intermediate);
    }
    cert_chain.push(ca_pub_key.clone());
    println!("Chain depth: {} ({})",
        cert_chain.len(),
        if cert_chain.len() == 1 { "single-level" } else { "multi-level" }
    );

    // Load CRL DER if provided (passed as-is to zkVM for signature verification)
    let crl_der: Vec<u8> = if let Some(crl_path) = &args.crl {
        let data = std::fs::read(crl_path)
            .unwrap_or_else(|e| panic!("Failed to read CRL {:?}: {}", crl_path, e));
        println!("CRL: {} ({} bytes)", crl_path.display(), data.len());
        data
    } else {
        println!("CRL: not provided (skipping revocation check)");
        Vec::new()
    };

    // Parse registrant address (required for --execute/--prove)
    let registrant_str = args.registrant.as_deref()
        .expect("--registrant is required for --execute/--prove");
    let registrant_bytes = zk_x509_script::parse_eth_address(registrant_str)
        .expect("Invalid registrant address");
    let registry_bytes = zk_x509_script::parse_eth_address(&args.registry_address)
        .expect("Invalid registry address");

    // Sign ownership + nullifier challenges
    let ownership_sig = zk_x509_script::ownership::sign_ownership(
        &cert_der, &priv_key, &registrant_bytes, args.wallet_index, current_timestamp, args.chain_id,
    ).expect("Failed to sign ownership challenge");
    let nullifier_sig = zk_x509_script::ownership::sign_nullifier(
        &cert_der, &priv_key, &registry_bytes, args.chain_id,
    ).expect("Failed to sign nullifier domain");
    println!("Ownership sig: {} bytes, Nullifier sig: {} bytes", ownership_sig.len(), nullifier_sig.len());

    // Build CA Merkle tree (from on-chain if --rpc-url, else from local files)
    let (ca_merkle_root, ca_merkle_proof) = if let Some(rpc_url) = &args.rpc_url {
        println!("Fetching CA list from on-chain ({})...", rpc_url);
        let (root, proof) = zk_x509_script::onchain::build_ca_merkle_from_onchain(rpc_url, &registry_bytes, &ca_pub_key)
            .expect("Failed to build CA Merkle tree from on-chain");
        println!("CA Merkle Root (on-chain): 0x{}", hex::encode(root));
        (root, proof)
    } else {
        let mut extra_hashes = Vec::new();
        for extra in &args.extra_ca {
            let extra_pub = std::fs::read(extra)
                .unwrap_or_else(|e| panic!("Failed to read extra CA {:?}: {}", extra, e));
            let extra_hash: [u8; 32] = sha2::Sha256::digest(&extra_pub).into();
            extra_hashes.push(extra_hash);
            println!("Extra CA: {} (hash: 0x{})", extra.display(), hex::encode(extra_hash));
        }
        let (_ca_leaf, root, proof) = zk_x509_script::merkle::ca_merkle_tree(&ca_pub_key, &extra_hashes);
        println!("CA Merkle Tree: {} leaves", 1 + extra_hashes.len());
        (root, proof)
    };

    let stdin = zk_x509_script::build_stdin(&zk_x509_script::StdinParams {
        cert_der: &cert_der,
        ownership_sig: &ownership_sig,
        nullifier_sig: &nullifier_sig,
        cert_chain: &cert_chain,
        timestamp: current_timestamp,
        crl_der: &crl_der,
        registrant: &registrant_bytes,
        wallet_index: args.wallet_index,
        max_wallets: args.max_wallets,
        disclosure_mask: args.disclosure_mask,
        ca_merkle_proof: &ca_merkle_proof,
        ca_merkle_root,
        registry_address: &registry_bytes,
        chain_id: args.chain_id,
    });
    println!("Wallet Index: {} / Max: {} / Disclosure: 0x{:02X}", args.wallet_index, args.max_wallets, args.disclosure_mask);
    println!("Registrant: 0x{}", hex::encode(registrant_bytes));
    println!("Chain ID: {} / Registry: 0x{}", args.chain_id, hex::encode(registry_bytes));
    println!("CA Merkle Root: 0x{}", hex::encode(ca_merkle_root));

    if args.execute {
        // Execute without proof (for testing)
        let (output, report) = client.execute(ZK_X509_ELF, stdin).run().unwrap();
        println!("Program executed successfully.");

        // Decode the public values
        let decoded = PublicValuesStruct::abi_decode(output.as_slice()).unwrap();
        println!("Nullifier: 0x{}", hex::encode(decoded.nullifier));
        println!("CA Root Hash: 0x{}", hex::encode(decoded.caMerkleRoot));
        println!("Cycles: {}", report.total_instruction_count());
    } else {
        // Generate a ZK proof
        let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");

        let proof = client
            .prove(&pk, stdin)
            .run()
            .expect("failed to generate proof");

        println!("Successfully generated proof!");

        // Decode and display public values
        let decoded =
            PublicValuesStruct::abi_decode(proof.public_values.as_slice()).unwrap();
        println!("Nullifier: 0x{}", hex::encode(decoded.nullifier));
        println!("CA Root Hash: 0x{}", hex::encode(decoded.caMerkleRoot));
        println!("Public Values: 0x{}", hex::encode(proof.public_values.as_slice()));

        // Verify the proof (may fail in mock mode — mock generates empty core proofs)
        match client.verify(&proof, pk.verifying_key(), None) {
            Ok(()) => println!("Successfully verified proof!"),
            Err(e) => eprintln!("Warning: proof verification skipped ({})", e),
        }
        println!("\nNote: For on-chain submission, use `cargo run --bin evm` to generate Groth16/Plonk proof.");
    }
}
