use alloy_sol_types::sol;

sol! {
    /// Public values output from the ZK program, verified on-chain.
    struct PublicValuesStruct {
        bytes32 nullifier;       // SHA-256(serial ‖ SHA-256(sk) ‖ walletIndex)
        bytes32 caRootHash;      // SHA-256 hash of CA public key (identifies issuing CA)
        uint64 timestamp;        // Proof generation timestamp (verified against block.timestamp)
        address registrant;      // Wallet address bound to this proof (anti-front-running)
        uint32 walletIndex;      // Which wallet slot (0..maxWalletsPerCert-1)
    }
}
