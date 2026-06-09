/**
 * Minimal human-readable ABIs for the contracts a third-party integrator
 * touches. These are the read surface for gating + discovery; the full ABIs
 * (incl. proof-submission writes) live in the zk-X509 contracts package.
 */

/** Per-service registry: who is verified, and the service's policy. */
export const IDENTITY_REGISTRY_ABI = [
  // --- verification status (the gating surface) ---
  "function isVerified(address wallet) view returns (bool)",
  "function verifiedUntil(address wallet) view returns (uint64)",
  // --- service policy / metadata ---
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function MAX_WALLETS_PER_CERT() view returns (uint32)",
  "function MIN_DISCLOSURE_MASK() view returns (uint8)",
  "function maxProofAge() view returns (uint256)",
  "function delegatedProvingRequired() view returns (bool)",
  // --- trust anchors ---
  "function caMerkleRoot() view returns (bytes32)",
  "function crlMerkleRoot() view returns (bytes32)",
  "function getCaCount() view returns (uint256)",
  // --- required certificate fields (bytes32(0) = unconstrained) ---
  "function requiredCountry() view returns (bytes32)",
  "function requiredOrg() view returns (bytes32)",
  "function requiredOrgUnit() view returns (bytes32)",
  "function requiredCommonName() view returns (bytes32)",
  // --- events ---
  "event UserRegistered(address indexed user, bytes32 nullifier, bytes32 country, bytes32 org, bytes32 orgUnit, bytes32 commonName)",
] as const;

/** Factory that deploys/indexes per-service registries. */
export const REGISTRY_FACTORY_ABI = [
  "function getRegistries() view returns (address[])",
  "function registryInfo(address registry) view returns (address creator, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 maxProofAge, uint256 createdAt, uint256 vKeyVersion)",
  "function isRegistry(address) view returns (bool)",
  "function SP1_VERIFIER() view returns (address)",
  "function registryCreationFee() view returns (uint256)",
  "function feeToken() view returns (address)",
  "event RegistryCreated(address indexed registry, address indexed owner, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 vKeyVersion)",
] as const;
