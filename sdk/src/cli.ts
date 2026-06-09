#!/usr/bin/env node
import { ethers } from "ethers";
import { ZkX509Client } from "./client";
import { getNetwork, NETWORKS, type NetworkConfig } from "./addresses";

// Keep in sync with package.json "version".
const VERSION = "0.1.0";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { positionals: string[]; flags: Record<string, string | boolean> } {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function resolveRegistry(net: NetworkConfig | undefined, flags: Record<string, string | boolean>): string {
  if (typeof flags.registry === "string") return flags.registry;
  if (typeof flags.service === "string") {
    const addr = net?.registries[flags.service];
    if (!addr) fail(`Unknown service "${flags.service}" on this network. Known: ${Object.keys(net?.registries ?? {}).join(", ") || "(none)"}`);
    return addr;
  }
  // Default to the "users" registry when available.
  const fallback = net?.registries.users ?? Object.values(net?.registries ?? {})[0];
  if (!fallback) fail("No registry specified. Pass --registry <address> or --service <name>.");
  return fallback;
}

function printHelp(): void {
  console.log(`zk-x509 — query zk-X509 on-chain identity verification

Usage:
  zk-x509 check <address> [options]     Check whether a wallet is verified
  zk-x509 registries [options]          List registries deployed via the factory
  zk-x509 info [<registry>] [options]   Show a registry's policy + metadata
  zk-x509 help | version

Options:
  --network <name|chainId>   Deployment to use (default: sepolia). Known: ${Object.keys(NETWORKS).join(", ")}
  --rpc <url>                RPC endpoint (default: the network's public RPC)
  --registry <address>       Target a specific registry
  --service <name>           Target a well-known registry by name (e.g. users, relayers)
  --factory <address>        Override the RegistryFactory address

Examples:
  zk-x509 check 0xabc...def
  zk-x509 check 0xabc...def --service relayers
  zk-x509 check 0xabc...def --registry 0x3cF6... --rpc https://my-sepolia-rpc
  zk-x509 registries --network sepolia
  zk-x509 info 0x3cF6...`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positionals, flags } = parseArgs(rest);

  if (!cmd || cmd === "help" || flags.help) return printHelp();
  if (cmd === "version" || flags.version) {
    console.log(VERSION);
    return;
  }

  const netKey = typeof flags.network === "string" ? flags.network : "sepolia";
  const net = getNetwork(netKey);
  if (!net && typeof flags.rpc !== "string") {
    fail(`Unknown network "${netKey}". Known: ${Object.keys(NETWORKS).join(", ")}. Or pass --rpc <url>.`);
  }
  const rpcUrl = typeof flags.rpc === "string" ? flags.rpc : net!.defaultRpcUrl;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const factory = typeof flags.factory === "string" ? flags.factory : net?.registryFactory;
  const client = new ZkX509Client(provider, { factory });

  if (cmd === "check") {
    const wallet = positionals[0];
    if (!wallet || !ethers.isAddress(wallet)) {
      fail("Usage: zk-x509 check <address> [--registry <addr> | --service <name>] [--network sepolia]");
    }
    const registry = resolveRegistry(net, flags);
    const status = await client.getVerificationStatus(registry, wallet);
    console.log(`wallet:    ${wallet}`);
    console.log(`registry:  ${registry}`);
    console.log(`verified:  ${status.verified ? "YES" : "no"}`);
    if (status.verifiedUntil) {
      console.log(`expires:   ${status.verifiedUntil.toISOString()} (unix ${status.verifiedUntilTimestamp})`);
    }
    process.exit(status.verified ? 0 : 2);
  } else if (cmd === "registries") {
    const list = await client.listRegistries();
    if (list.length === 0) {
      console.log("(no registries)");
      return;
    }
    for (const addr of list) {
      try {
        const info = await client.getRegistryInfo(addr);
        console.log(`${addr}  ${info.name}`);
      } catch {
        console.log(addr);
      }
    }
  } else if (cmd === "info") {
    const registry = positionals[0] && ethers.isAddress(positionals[0]) ? positionals[0] : resolveRegistry(net, flags);
    const [info, policy] = await Promise.all([
      client.getRegistryInfo(registry).catch(() => null),
      client.getRegistryPolicy(registry),
    ]);
    console.log(`registry:           ${registry}`);
    if (info) {
      console.log(`name:               ${info.name}`);
      console.log(`creator:            ${info.creator}`);
      console.log(`maxWalletsPerCert:  ${info.maxWallets}`);
      console.log(`minDisclosureMask:  ${info.minDisclosureMask}`);
      console.log(`maxProofAge:        ${info.maxProofAge}s`);
    }
    console.log(`paused:             ${policy.paused}`);
    console.log(`CA count:           ${policy.caCount}`);
    console.log(`CA merkle root:     ${policy.caMerkleRoot}`);
  } else {
    fail(`Unknown command "${cmd}". Run "zk-x509 help".`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
