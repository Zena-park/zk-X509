use alloy_sol_types::sol;

sol! {
    /// Public values output from the ZK program, verified on-chain.
    struct PublicValuesStruct {
        bytes32 nullifier;       // SHA-256 hash of cert serial + private key (unique per cert)
        bytes32 caRootHash;      // SHA-256 hash of CA public key (identifies issuing CA)
        uint64 timestamp;        // Proof generation timestamp (verified against block.timestamp)
    }
}
