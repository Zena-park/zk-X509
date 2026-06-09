/**
 * Single source of truth for the addresses shown in the developer portal.
 *
 * Committed (not read from the gitignored .env) so the docs render correct
 * addresses on a fresh deploy. Mirrors `deployments/<chainId>.json` and
 * `sdk/src/addresses.ts` — keep in sync when contracts are redeployed.
 *
 * The `registries` below are operated by the zkScatter service (a reference
 * consumer of zk-X509) and are examples only — integrators deploy their own
 * registry via the factory.
 */
export const DEV_NETWORK = {
  chainId: 11155111,
  name: "Sepolia",
  factory: "0x9e937dF6ac0E85979622519068412A518fa085d9",
  verifier: "0x261a1619cC63273de7c64872B769305732761888",
  rpcUrl: "https://ethereum-sepolia.publicnode.com",
  explorer: "https://sepolia.etherscan.io",
  registries: {
    users: "0x3cF6A96f1970053ffDf957074F988aD53D13ada3",
    relayers: "0x9fDE6182B1fd10F2eDfE15b704FE95787C170914",
  },
} as const;
