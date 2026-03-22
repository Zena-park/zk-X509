/// ABI and deployment info for the IdentityRegistry contract.

export const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [
      { name: "_sp1Verifier", type: "address" },
      { name: "_programVKey", type: "bytes32" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
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
  // isVerified(address user) -> bool
  {
    inputs: [{ name: "user", type: "address" }],
    name: "isVerified",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // verifiedUsers(address) -> bool
  {
    inputs: [{ name: "", type: "address" }],
    name: "verifiedUsers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // nullifiers(bytes32) -> bool
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "nullifiers",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // validCARoots(bytes32) -> bool
  {
    inputs: [{ name: "", type: "bytes32" }],
    name: "validCARoots",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "nullifier", type: "bytes32" },
      { indexed: false, name: "caRootHash", type: "bytes32" },
    ],
    name: "UserRegistered",
    type: "event",
  },
  // Errors
  {
    inputs: [{ name: "caRootHash", type: "bytes32" }],
    name: "UnsupportedCA",
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
] as const;

/// Contract addresses per network.
/// Update these after deployment.
export const REGISTRY_ADDRESSES: Record<string, string> = {
  // Sepolia testnet
  "11155111": "0x0000000000000000000000000000000000000000",
  // Localhost (Anvil)
  "31337": "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512",
};
