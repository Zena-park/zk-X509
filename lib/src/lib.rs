use alloy_sol_types::sol;

/// Domain separator for nullifier generation.
/// Shared between host (ownership.rs) and zkVM guest (program/src/main.rs).
/// Changing this value changes all nullifiers — coordinate with contract state.
pub const NULLIFIER_DOMAIN: &[u8] = b"zk-X509-Nullifier-v1";

sol! {
    /// Public values output from the ZK program, verified on-chain.
    struct PublicValuesStruct {
        bytes32 nullifier;       // SHA-256(nullifier_sig ‖ walletIndex)
        bytes32 caMerkleRoot;    // Merkle root of allowed CA set (hides which CA issued the cert)
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
