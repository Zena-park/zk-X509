use sp1_sdk::{blocking::MockProver, blocking::Prover, include_elf, Elf, HashableKey, ProvingKey};

const ZK_X509_ELF: Elf = include_elf!("zk-x509-program");

fn main() {
    let prover = MockProver::new();
    let pk = prover.setup(ZK_X509_ELF).expect("failed to setup elf");
    println!("Verification Key: {}", pk.verifying_key().bytes32());
}
