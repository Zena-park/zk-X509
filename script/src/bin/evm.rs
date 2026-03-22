//! Generate an EVM-compatible proof (Groth16/PLONK) for on-chain verification.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin evm -- --system groth16 \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca.der

use alloy_sol_types::SolType;
use clap::{Parser, ValueEnum};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1ProofWithPublicValues, SP1Stdin, SP1VerifyingKey,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use zk_x509_lib::PublicValuesStruct;

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

#[derive(Parser, Debug)]
#[command(author, version, about = "ZK X.509 EVM Proof Generator")]
struct EVMArgs {
    #[arg(long, default_value = "certs/signCert.der")]
    cert: PathBuf,
    #[arg(long, default_value = "certs/signPri.key")]
    key: PathBuf,
    #[arg(long, default_value = "certs/ca_pub.der")]
    ca_cert: PathBuf,
    #[arg(long, value_enum, default_value = "groth16")]
    system: ProofSystem,
    /// Wallet address to bind the proof to (hex, e.g. 0xf39F...).
    #[arg(long)]
    registrant: String,
    #[arg(long, default_value = "0")]
    wallet_index: u32,
    #[arg(long, default_value = "1")]
    max_wallets: u32,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum ProofSystem {
    Plonk,
    Groth16,
}

/// Proof fixture for Solidity testing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SP1X509ProofFixture {
    nullifier: String,
    ca_root_hash: String,
    vkey: String,
    public_values: String,
    proof: String,
}

fn main() {
    sp1_sdk::utils::setup_logger();

    let args = EVMArgs::parse();

    let cert_der = std::fs::read(&args.cert).expect("Failed to read cert file");
    let priv_key = std::fs::read(&args.key).expect("Failed to read key file");
    let ca_pub_key = std::fs::read(&args.ca_cert).expect("Failed to read CA cert file");

    let client = ProverClient::from_env();
    let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");

    let current_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Single-level chain for now (no intermediates in evm CLI)
    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key];

    let mut stdin = SP1Stdin::new();
    stdin.write(&cert_der);
    stdin.write(&priv_key);
    stdin.write(&cert_chain);
    stdin.write(&current_timestamp);
    let crl_der: Vec<u8> = Vec::new(); // TODO: accept CRL from CLI
    stdin.write(&crl_der);
    let registrant_hex = args.registrant.strip_prefix("0x").unwrap_or(&args.registrant);
    let registrant_bytes: [u8; 20] = hex::decode(registrant_hex)
        .expect("Invalid registrant address hex")
        .try_into()
        .expect("Registrant address must be 20 bytes");
    stdin.write(&registrant_bytes);
    stdin.write(&args.wallet_index);
    stdin.write(&args.max_wallets);

    println!("Proof System: {:?}", args.system);

    let proof = match args.system {
        ProofSystem::Plonk => client.prove(&pk, stdin).plonk().run(),
        ProofSystem::Groth16 => client.prove(&pk, stdin).groth16().run(),
    }
    .expect("failed to generate proof");

    create_proof_fixture(&proof, pk.verifying_key(), args.system);
}

fn create_proof_fixture(
    proof: &SP1ProofWithPublicValues,
    vk: &SP1VerifyingKey,
    system: ProofSystem,
) {
    let bytes = proof.public_values.as_slice();
    let decoded = PublicValuesStruct::abi_decode(bytes).unwrap();

    let fixture = SP1X509ProofFixture {
        nullifier: format!("0x{}", hex::encode(decoded.nullifier)),
        ca_root_hash: format!("0x{}", hex::encode(decoded.caRootHash)),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("Verification Key: {}", fixture.vkey);
    println!("Nullifier: {}", fixture.nullifier);
    println!("CA Root Hash: {}", fixture.ca_root_hash);
    println!("Public Values: {}", fixture.public_values);

    // Save fixture for Solidity tests
    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/test/fixtures");
    std::fs::create_dir_all(&fixture_path).expect("failed to create fixture path");
    std::fs::write(
        fixture_path.join(format!("{:?}-fixture.json", system).to_lowercase()),
        serde_json::to_string_pretty(&fixture).unwrap(),
    )
    .expect("failed to write fixture");

    println!("Fixture saved to contracts/src/fixtures/");
}
