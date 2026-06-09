import { ethers } from "ethers";
import { IDENTITY_REGISTRY_ABI, REGISTRY_FACTORY_ABI } from "./abi";
import { getNetwork } from "./addresses";
import { multicall, decodeResult, decodeResultFull, type Call3 } from "./multicall";

export interface ZkX509ClientOptions {
  /** Network key ("sepolia") or chainId — used to default the factory address. */
  network?: string | number;
  /** Override the RegistryFactory address (otherwise taken from `network`). */
  factory?: string;
}

export interface VerificationStatus {
  /** True if the wallet currently holds a valid (non-expired) verification. */
  verified: boolean;
  /** Expiry as a Date, or null when not verified / no expiry. */
  verifiedUntil: Date | null;
  /** Expiry as a unix timestamp (seconds); 0 when none. */
  verifiedUntilTimestamp: number;
}

export interface RegistryInfo {
  address: string;
  creator: string;
  name: string;
  maxWallets: number;
  minDisclosureMask: number;
  maxProofAge: number;
  createdAt: number;
  vKeyVersion: number;
}

export interface RegistryPolicy {
  paused: boolean;
  owner: string;
  maxWalletsPerCert: number;
  minDisclosureMask: number;
  caCount: number;
  caMerkleRoot: string;
  /** Required certificate fields; bytes32(0) means unconstrained. */
  required: { country: string; org: string; orgUnit: string; commonName: string };
}

/**
 * Read-side client for zk-X509. Everything here is a view call — gating a
 * dApp/contract on verification, and discovering registries + their policy.
 *
 * ```ts
 * import { ethers } from "ethers";
 * import { ZkX509Client } from "@tokamak-network/zk-x509-sdk";
 *
 * const provider = new ethers.JsonRpcProvider(rpcUrl); // or a wallet BrowserProvider
 * const zk = new ZkX509Client(provider, { network: "sepolia" });
 * const ok = await zk.isVerified(registryAddress, userAddress);
 * ```
 */
export class ZkX509Client {
  readonly provider: ethers.Provider;
  readonly factoryAddress?: string;
  private readonly registryIface = new ethers.Interface(IDENTITY_REGISTRY_ABI);
  private readonly factoryIface = new ethers.Interface(REGISTRY_FACTORY_ABI);

  constructor(provider: ethers.Provider, opts: ZkX509ClientOptions = {}) {
    this.provider = provider;
    const net = opts.network != null ? getNetwork(opts.network) : undefined;
    this.factoryAddress = opts.factory ?? net?.registryFactory;
  }

  /** True if `wallet` is currently verified in `registry`. */
  async isVerified(registry: string, wallet: string): Promise<boolean> {
    const c = new ethers.Contract(registry, this.registryIface, this.provider);
    return c.isVerified(wallet);
  }

  /** Verification expiry for `wallet` in `registry`, or null if not verified. */
  async verifiedUntil(registry: string, wallet: string): Promise<Date | null> {
    const c = new ethers.Contract(registry, this.registryIface, this.provider);
    const ts = Number(await c.verifiedUntil(wallet));
    return ts > 0 ? new Date(ts * 1000) : null;
  }

  /** `isVerified` + `verifiedUntil` batched into one call. */
  async getVerificationStatus(registry: string, wallet: string): Promise<VerificationStatus> {
    const calls: Call3[] = [
      { target: registry, callData: this.registryIface.encodeFunctionData("isVerified", [wallet]) },
      { target: registry, callData: this.registryIface.encodeFunctionData("verifiedUntil", [wallet]) },
    ];
    const res = await multicall(this.provider, calls);
    const verified = decodeResult<boolean>(this.registryIface, "isVerified", res[0], false);
    const ts = Number(decodeResult<bigint>(this.registryIface, "verifiedUntil", res[1], BigInt(0)));
    return { verified, verifiedUntilTimestamp: ts, verifiedUntil: ts > 0 ? new Date(ts * 1000) : null };
  }

  /** All registries deployed via the factory. */
  async listRegistries(factory = this.factoryAddress): Promise<string[]> {
    const c = new ethers.Contract(this.requireFactory(factory), this.factoryIface, this.provider);
    return c.getRegistries();
  }

  /** Factory-level info (name, policy params, creator) for a registry. */
  async getRegistryInfo(registry: string, factory = this.factoryAddress): Promise<RegistryInfo> {
    const c = new ethers.Contract(this.requireFactory(factory), this.factoryIface, this.provider);
    return this.toRegistryInfo(registry, await c.registryInfo(registry));
  }

  /**
   * Factory info for many registries in ONE call (Multicall3). Returns an array
   * aligned with `registries`; an entry is null if its info couldn't be read.
   */
  async getRegistryInfos(registries: string[], factory = this.factoryAddress): Promise<Array<RegistryInfo | null>> {
    const f = this.requireFactory(factory);
    const calls: Call3[] = registries.map((r) => ({
      target: f,
      callData: this.factoryIface.encodeFunctionData("registryInfo", [r]),
    }));
    const res = await multicall(this.provider, calls);
    return registries.map((address, i) => {
      const info = decodeResultFull(this.factoryIface, "registryInfo", res[i]);
      return info ? this.toRegistryInfo(address, info) : null;
    });
  }

  private toRegistryInfo(address: string, info: ethers.Result): RegistryInfo {
    return {
      address,
      creator: info.creator ?? info[0],
      name: info.name ?? info[1],
      maxWallets: Number(info.maxWallets ?? info[2]),
      minDisclosureMask: Number(info.minDisclosureMask ?? info[3]),
      maxProofAge: Number(info.maxProofAge ?? info[4]),
      createdAt: Number(info.createdAt ?? info[5]),
      vKeyVersion: Number(info.vKeyVersion ?? info[6]),
    };
  }

  /** On-chain policy of a registry (paused, constraints, CA root), one call. */
  async getRegistryPolicy(registry: string): Promise<RegistryPolicy> {
    const i = this.registryIface;
    const fns = [
      "paused", "owner", "MAX_WALLETS_PER_CERT", "MIN_DISCLOSURE_MASK", "getCaCount",
      "caMerkleRoot", "requiredCountry", "requiredOrg", "requiredOrgUnit", "requiredCommonName",
    ];
    const res = await multicall(this.provider, fns.map((fn) => ({ target: registry, callData: i.encodeFunctionData(fn, []) })));
    return {
      paused: decodeResult<boolean>(i, "paused", res[0], false),
      owner: decodeResult<string>(i, "owner", res[1], ethers.ZeroAddress),
      maxWalletsPerCert: Number(decodeResult<bigint>(i, "MAX_WALLETS_PER_CERT", res[2], BigInt(0))),
      minDisclosureMask: Number(decodeResult<bigint>(i, "MIN_DISCLOSURE_MASK", res[3], BigInt(0))),
      caCount: Number(decodeResult<bigint>(i, "getCaCount", res[4], BigInt(0))),
      caMerkleRoot: decodeResult<string>(i, "caMerkleRoot", res[5], ethers.ZeroHash),
      required: {
        country: decodeResult<string>(i, "requiredCountry", res[6], ethers.ZeroHash),
        org: decodeResult<string>(i, "requiredOrg", res[7], ethers.ZeroHash),
        orgUnit: decodeResult<string>(i, "requiredOrgUnit", res[8], ethers.ZeroHash),
        commonName: decodeResult<string>(i, "requiredCommonName", res[9], ethers.ZeroHash),
      },
    };
  }

  private requireFactory(factory?: string): string {
    if (!factory) {
      throw new Error(
        "RegistryFactory address unknown. Pass `factory`, or set `network` in the client options (e.g. { network: 'sepolia' }).",
      );
    }
    return factory;
  }
}

/** One-shot helper: is `wallet` verified in `registry`? */
export async function isVerified(provider: ethers.Provider, registry: string, wallet: string): Promise<boolean> {
  return new ZkX509Client(provider).isVerified(registry, wallet);
}
