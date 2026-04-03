use alloy_sol_types::sol;

/// Domain separator prefix for nullifier generation.
/// Full domain = NULLIFIER_DOMAIN ‖ registry_address (20 bytes) ‖ chain_id (uint64)
/// This ensures different registries and different chains get different nullifiers.
pub const NULLIFIER_DOMAIN: &[u8] = b"zk-X509-Nullifier-v2";

sol! {
    /// Public values output from the ZK program, verified on-chain.
    struct PublicValuesStruct {
        bytes32 nullifier;       // SHA-256(nullifier_sig ‖ walletIndex)
        bytes32 caMerkleRoot;    // Merkle root of allowed CA set (hides which CA issued the cert)
        uint64 timestamp;        // Proof generation timestamp (verified against block.timestamp)
        address registrant;      // Wallet address bound to this proof (anti-front-running)
        uint32 walletIndex;      // Which wallet slot (0..maxWalletsPerCert-1)
        uint64 notAfter;         // Certificate expiry (unix timestamp)
        uint64 chainId;          // EIP-155 chain ID (prevents cross-chain replay)
        address registryAddress; // Target registry address (prevents cross-DApp nullifier reuse)
        bytes32 crlMerkleRoot;  // CRL sorted Merkle root (bytes32(0) = CRL checking disabled)
        // Selective disclosure: UTF-8 plaintext right-padded to bytes32, or bytes32(0) if not disclosed.
        bytes32 country;         // e.g., "KR" or bytes32(0)
        bytes32 org;             // e.g., "Samsung" or bytes32(0)
        bytes32 orgUnit;         // e.g., "Engineering" or bytes32(0)
        bytes32 commonName;      // e.g., "Hong Gildong" or bytes32(0)
        // In-circuit field constraints: the required values the circuit was asked to verify.
        // bytes32(0) = no constraint. Non-zero = circuit asserted cert field == this value.
        // Contract checks these match its stored requiredX values to prevent constraint forgery.
        bytes32 requiredCountry;
        bytes32 requiredOrg;
        bytes32 requiredOrgUnit;
        bytes32 requiredCommonName;
    }
}
