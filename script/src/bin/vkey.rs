use sp1_sdk::{
    blocking::{Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey,
};

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

fn main() {
    // MUST use the real ProverClient (same backend `interactive.rs`
    // uses for Groth16 proofs). MockProver's setup produces a
    // different vkey, so committing that to the on-chain
    // `currentProgramVKey` causes the real verifier to reject
    // proofs with `ProofInvalid()`.
    let client = ProverClient::from_env();
    let pk = client.setup(ZK_X509_ELF).expect("failed to setup elf");
    println!("Verification Key: {}", pk.verifying_key().bytes32());
}
