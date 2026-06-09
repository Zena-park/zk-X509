import { JsonRpcProvider, Contract } from "ethers";

/**
 * Read-only on-chain access for owner-authorization of CMS writes.
 *
 * The backend has no signing key and never writes on-chain — it only needs to
 * answer "who owns this registry?" so it can check that a request was signed by
 * that owner. RPC endpoints are configured per chain via `RPC_URL_<chainId>`
 * env vars, with a built-in default for Sepolia so it works on testnet without
 * extra config.
 */

const IDENTITY_REGISTRY_ABI = ["function owner() view returns (address)"];

const DEFAULT_RPCS: Record<number, string> = {
  11155111: "https://ethereum-sepolia.publicnode.com",
};

function rpcUrlFor(chainId: number): string | undefined {
  return process.env[`RPC_URL_${chainId}`] || DEFAULT_RPCS[chainId];
}

const providers = new Map<number, JsonRpcProvider>();
function providerFor(chainId: number): JsonRpcProvider | null {
  const url = rpcUrlFor(chainId);
  if (!url) return null;
  let p = providers.get(chainId);
  if (!p) {
    // A malformed RPC_URL_<chainId> makes the constructor throw; fail closed
    // (return null → 503) rather than crashing the server.
    try {
      p = new JsonRpcProvider(url);
    } catch {
      return null;
    }
    providers.set(chainId, p);
  }
  return p;
}

// Owner rarely changes; cache briefly so a burst of writes costs one RPC call.
const ownerCache = new Map<string, { owner: string; at: number }>();
const OWNER_TTL_MS = 60_000;

/**
 * The on-chain `owner()` of an IdentityRegistry, lowercased. Returns null when
 * the chain has no configured RPC or the call fails (caller treats as "can't
 * verify" → 503, never as authorized).
 */
export async function getRegistryOwner(chainId: number, registry: string): Promise<string | null> {
  const key = `${chainId}:${registry.toLowerCase()}`;
  const now = Date.now();
  const cached = ownerCache.get(key);
  if (cached && now - cached.at < OWNER_TTL_MS) return cached.owner;

  const provider = providerFor(chainId);
  if (!provider) return null;
  try {
    const owner = ((await new Contract(registry, IDENTITY_REGISTRY_ABI, provider).owner()) as string).toLowerCase();
    ownerCache.set(key, { owner, at: now });
    return owner;
  } catch {
    return null;
  }
}
