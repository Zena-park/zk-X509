//! ZK X.509 Host Script - Reads certificate files and generates/verifies ZK proofs.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release -- --execute \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der
//!
//!   RUST_LOG=info cargo run --release -- --prove \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca_pub.der

use alloy_sol_types::SolType;
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

    /// Path to the X.509 certificate file (DER format)
    #[arg(long, default_value = "certs/signCert.der")]
    cert: PathBuf,

    /// Path to the private key file (DER/PKCS#1 format)
    #[arg(long, default_value = "certs/signPri.key")]
    key: PathBuf,

    /// Root CA public key (SPKI DER). Always the last element in the chain.
    #[arg(long, default_value = "certs/ca_pub.der")]
    ca_cert: PathBuf,

    /// Intermediate CA certificates (full X.509 DER), in order from user→root.
    /// For single-level CA (no intermediates), omit this.
    #[arg(long)]
    intermediate: Vec<PathBuf>,

    /// Path to CRL file (DER format, optional). If provided, cert serial is checked.
    #[arg(long)]
    crl: Option<PathBuf>,
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = Args::parse();

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

    // Parse CRL if provided
    let revoked_serials: Vec<Vec<u8>> = if let Some(crl_path) = &args.crl {
        let crl_der = std::fs::read(crl_path)
            .unwrap_or_else(|e| panic!("Failed to read CRL {:?}: {}", crl_path, e));
        use x509_parser::prelude::FromDer;
        let (_, crl) = x509_parser::revocation_list::CertificateRevocationList::from_der(&crl_der)
            .expect("Failed to parse CRL");
        let serials: Vec<Vec<u8>> = crl
            .iter_revoked_certificates()
            .map(|entry| entry.raw_serial().to_vec())
            .collect();
        println!("CRL: {} revoked certificates", serials.len());
        serials
    } else {
        println!("CRL: not provided (skipping revocation check)");
        Vec::new()
    };

    // Write inputs to SP1 stdin
    let mut stdin = SP1Stdin::new();
    stdin.write(&cert_der);
    stdin.write(&priv_key);
    stdin.write(&cert_chain);
    stdin.write(&current_timestamp);
    stdin.write(&revoked_serials);

    if args.execute {
        // Execute without proof (for testing)
        let (output, report) = client.execute(ZK_X509_ELF, stdin).run().unwrap();
        println!("Program executed successfully.");

        // Decode the public values
        let decoded = PublicValuesStruct::abi_decode(output.as_slice()).unwrap();
        println!("Nullifier: 0x{}", hex::encode(decoded.nullifier));
        println!("CA Root Hash: 0x{}", hex::encode(decoded.caRootHash));
        println!("Cycles: {}", report.total_instruction_count());
    } else {
        // Generate a ZK proof
        let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");

        let proof = client
            .prove(&pk, stdin)
            .run()
            .expect("failed to generate proof");

        println!("Successfully generated proof!");

        // Verify the proof
        client
            .verify(&proof, pk.verifying_key(), None)
            .expect("failed to verify proof");
        println!("Successfully verified proof!");

        // Decode and display public values
        let decoded =
            PublicValuesStruct::abi_decode(proof.public_values.as_slice()).unwrap();
        println!("Nullifier: 0x{}", hex::encode(decoded.nullifier));
        println!("CA Root Hash: 0x{}", hex::encode(decoded.caRootHash));
    }
}
