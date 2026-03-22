use alloy_sol_types::sol;

sol! {
    /// Public values output from the ZK program, verified on-chain.
    struct PublicValuesStruct {
        bytes32 nullifier;       // SHA-256(cert_public_key_der ‖ walletIndex)
        bytes32 caRootHash;      // SHA-256 hash of CA public key (identifies issuing CA)
        uint64 timestamp;        // Proof generation timestamp (verified against block.timestamp)
        address registrant;      // Wallet address bound to this proof (anti-front-running)
        uint32 walletIndex;      // Which wallet slot (0..maxWalletsPerCert-1)
        uint64 notAfter;         // Certificate expiry (unix timestamp)
        // Selective disclosure: salted hash of each field, or bytes32(0) if not disclosed.
        // hash = SHA-256(len1 ‖ val1 ‖ ... ‖ cert_serial) — length-prefixed, salted
        bytes32 countryHash;     // SHA-256(len ‖ "KR" ‖ serial) or bytes32(0)
        bytes32 orgHash;         // SHA-256(len ‖ "yessign" ‖ serial) or bytes32(0)
        bytes32 orgUnitHash;     // SHA-256(len ‖ "personal4IB" ‖ ... ‖ serial) or bytes32(0)
        bytes32 commonNameHash;  // SHA-256(len ‖ "Hong Gildong" ‖ serial) or bytes32(0)
    }
}
