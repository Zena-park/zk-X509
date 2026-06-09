/** A zk-X509 deployment on a specific chain. */
export interface NetworkConfig {
  chainId: number;
  name: string;
  /** RegistryFactory — deploys/indexes per-service registries. */
  registryFactory: string;
  /** SP1 verifier the registries verify proofs against. */
  sp1Verifier: string;
  /** Well-known example registries run by the zk-X509 team (name → address). */
  registries: Record<string, string>;
  /** A public RPC usable when the caller doesn't pass their own. */
  defaultRpcUrl: string;
  explorer: string;
}

/**
 * Canonical deployments. Mirrors `deployments/<chainId>.json` in the zk-X509
 * repo — keep in sync when contracts are redeployed.
 */
export const NETWORKS: Record<string, NetworkConfig> = {
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    registryFactory: "0x9e937dF6ac0E85979622519068412A518fa085d9",
    sp1Verifier: "0x261a1619cC63273de7c64872B769305732761888",
    registries: {
      users: "0x3cF6A96f1970053ffDf957074F988aD53D13ada3",
      relayers: "0x9fDE6182B1fd10F2eDfE15b704FE95787C170914",
    },
    defaultRpcUrl: "https://ethereum-sepolia.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
  },
};

/** Resolve a network by key ("sepolia"), chainId (11155111), or numeric string. */
export function getNetwork(idOrName: string | number): NetworkConfig | undefined {
  if (typeof idOrName === "string") {
    const byName = NETWORKS[idOrName.toLowerCase()];
    if (byName) return byName;
    const asNum = Number(idOrName);
    if (Number.isFinite(asNum)) idOrName = asNum;
  }
  return Object.values(NETWORKS).find((n) => n.chainId === idOrName);
}
