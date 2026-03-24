/// ABI and deployment info for the IdentityRegistry contract.

export const IDENTITY_REGISTRY_ABI = [
  // ============ User Functions ============
  {
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicValues", type: "bytes" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicValues", type: "bytes" },
    ],
    name: "reRegister",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ============ View Functions ============
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isVerified",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "address" }],
    name: "verifiedUntil",
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "nullifierOwner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "revokedNullifiers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "pendingOwner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "paused",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "caMerkleRoot",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "crlMerkleRoot",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxProofAge",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "MAX_WALLETS_PER_CERT",
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
    type: "function",
  },

  // ============ CA List Management ============
  {
    inputs: [{ name: "caHash", type: "bytes32" }],
    name: "addCA",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "index", type: "uint256" }],
    name: "removeCA",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "getCaCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCaLeaves",
    outputs: [{ name: "", type: "bytes32[]" }],
    stateMutability: "view",
    type: "function",
  },

  // ============ Admin Functions ============
  {
    inputs: [{ name: "newRoot", type: "bytes32" }],
    name: "updateCaMerkleRoot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "newRoot", type: "bytes32" }],
    name: "updateCrlMerkleRoot",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "newAge", type: "uint256" }],
    name: "setMaxProofAge",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "nullifier", type: "bytes32" },
      { name: "reason", type: "bytes32" },
    ],
    name: "revokeIdentity",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "pause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "unpause",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "acceptOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ============ Events ============
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "nullifier", type: "bytes32" },
    ],
    name: "UserRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "oldUser", type: "address" },
      { indexed: true, name: "newUser", type: "address" },
      { indexed: false, name: "nullifier", type: "bytes32" },
    ],
    name: "UserReRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, name: "newRoot", type: "bytes32" }],
    name: "CaMerkleRootUpdated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "caHash", type: "bytes32" },
      { indexed: false, name: "index", type: "uint256" },
    ],
    name: "CaAdded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "caHash", type: "bytes32" },
      { indexed: false, name: "index", type: "uint256" },
    ],
    name: "CaRemoved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: true, name: "nullifier", type: "bytes32" },
      { indexed: false, name: "reason", type: "bytes32" },
    ],
    name: "IdentityRevoked",
    type: "event",
  },

  // ============ Errors ============
  {
    inputs: [
      { name: "proofRoot", type: "bytes32" },
      { name: "expectedRoot", type: "bytes32" },
    ],
    name: "InvalidCaMerkleRoot",
    type: "error",
  },
  {
    inputs: [{ name: "nullifier", type: "bytes32" }],
    name: "AlreadyRegistered",
    type: "error",
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "UserAlreadyVerified",
    type: "error",
  },
  {
    inputs: [
      { name: "proofRegistrant", type: "address" },
      { name: "actualSender", type: "address" },
    ],
    name: "RegistrantMismatch",
    type: "error",
  },
  {
    inputs: [{ name: "nullifier", type: "bytes32" }],
    name: "NullifierRevoked",
    type: "error",
  },
  {
    inputs: [
      { name: "proofTimestamp", type: "uint64" },
      { name: "blockTimestamp", type: "uint256" },
    ],
    name: "ProofTooOld",
    type: "error",
  },
  {
    inputs: [
      { name: "notAfter", type: "uint64" },
      { name: "blockTimestamp", type: "uint256" },
    ],
    name: "CertAlreadyExpired",
    type: "error",
  },
  { inputs: [], name: "OnlyOwner", type: "error" },
  { inputs: [], name: "ContractPaused", type: "error" },
] as const;

/// Registry address from environment variable, or fallback per network.
export function getRegistryAddress(chainId: string): string {
  const envAddr = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (envAddr) return envAddr;

  const fallback: Record<string, string> = {
    "11155111": "0x0000000000000000000000000000000000000000",
    "31337": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
  };
  return fallback[chainId] || "";
}

/// RPC URL from environment variable, or fallback.
export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";
}
