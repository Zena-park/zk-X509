//! Generate an EVM-compatible proof (Groth16/PLONK) for on-chain verification.
//!
//! Usage:
//!   RUST_LOG=info cargo run --release --bin evm -- --system groth16 \
//!     --cert certs/signCert.der --key certs/signPri.key --ca-cert certs/ca.der

use alloy_sol_types::SolType;
use clap::{Parser, ValueEnum};
use sha2::Digest;
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
    #[arg(long, default_value = "15")]
    disclosure_mask: u8,
    /// Chain ID (EIP-155). Default: 31337 (Anvil local).
    #[arg(long, default_value = "31337")]
    chain_id: u64,
    /// IdentityRegistry address (hex).
    #[arg(long, default_value = "0x0000000000000000000000000000000000000000")]
    registry_address: String,
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
    ca_merkle_root: String,
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

    let cert_chain: Vec<Vec<u8>> = vec![ca_pub_key.clone()];
    let registrant_hex = args.registrant.strip_prefix("0x").unwrap_or(&args.registrant);
    let registrant_bytes: [u8; 20] = hex::decode(registrant_hex)
        .expect("Invalid registrant address hex")
        .try_into()
        .expect("Registrant address must be 20 bytes");

    let chain_id = args.chain_id;
    let registry_hex = args.registry_address.strip_prefix("0x").unwrap_or(&args.registry_address);
    let registry_address: [u8; 20] = hex::decode(registry_hex)
        .expect("Invalid registry address hex")
        .try_into()
        .expect("Registry address must be 20 bytes");
    let ownership_sig = zk_x509_script::ownership::sign_ownership(
        &cert_der, &priv_key, &registrant_bytes, args.wallet_index, current_timestamp, chain_id,
    ).expect("Failed to sign");
    let nullifier_sig = zk_x509_script::ownership::sign_nullifier(
        &cert_der, &priv_key, &registry_address, chain_id,
    ).expect("Failed to sign nullifier");

    let crl_der: Vec<u8> = Vec::new();

    let ca_leaf_hash: [u8; 32] = sha2::Sha256::digest(&ca_pub_key).into();
    let ca_leaves = vec![ca_leaf_hash];
    let (ca_merkle_root, ca_merkle_proof) = zk_x509_script::merkle::merkle_root_and_proof(&ca_leaves, 0);

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
        registry_address: &registry_address,
        chain_id,
    });
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
        ca_merkle_root: format!("0x{}", hex::encode(decoded.caMerkleRoot)),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("Verification Key: {}", fixture.vkey);
    println!("Nullifier: {}", fixture.nullifier);
    println!("CA Root Hash: {}", fixture.ca_merkle_root);

    // Output hex values for frontend submission
    println!("\n=== Frontend Input ===");
    println!("Proof: {}", fixture.proof);
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
