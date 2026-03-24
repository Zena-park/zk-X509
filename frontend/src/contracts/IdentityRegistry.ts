/// ABI and deployment info for the IdentityRegistry contract.

export const IDENTITY_REGISTRY_ABI = [
  // register(bytes proof, bytes publicValues)
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
  // reRegister(bytes proof, bytes publicValues)
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
  // isVerified(address user) -> bool
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isVerified",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // verifiedUntil(address) -> uint64
  {
    inputs: [{ name: "", type: "address" }],
    name: "verifiedUntil",
    outputs: [{ name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  // nullifierOwner(bytes32) -> address
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "nullifierOwner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  // Events
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
  // Errors
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
] as const;

/// Contract addresses per network.
/// Update these after deployment.
export const REGISTRY_ADDRESSES: Record<string, string> = {
  // Sepolia testnet
  "11155111": "0x0000000000000000000000000000000000000000",
  // Localhost (Anvil)
  "31337": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
};
