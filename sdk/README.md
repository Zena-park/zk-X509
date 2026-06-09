# @tokamak-network/zk-x509-sdk

TypeScript SDK + CLI for integrating **zk-X509** — on-chain identity verification backed by X.509 certificates and zero-knowledge proofs.

A user proves they hold a valid X.509 certificate (e.g. a national eID / org cert) with a ZK proof; the proof is verified on-chain and the user's wallet is marked **verified** in a registry. Your dApp or contract then gates access on `isVerified(wallet)` — no PII touches the chain.

This package is the **read side**: check verification, and discover registries + their policy. It works in Node, the browser, scripts, and from the terminal.

## Install

```bash
npm install @tokamak-network/zk-x509-sdk ethers
```

`ethers` v6 is a peer dependency.

## Quick start (library)

```ts
import { ethers } from "ethers";
import { ZkX509Client } from "@tokamak-network/zk-x509-sdk";

// Any ethers Provider — a JsonRpcProvider, or a wallet BrowserProvider.
const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia.publicnode.com");
const zk = new ZkX509Client(provider, { network: "sepolia" });

const REGISTRY = "0x3cF6A96f1970053ffDf957074F988aD53D13ada3"; // your service's registry
const user = "0xc1eba383D94c6021160042491A5dfaF1d82694E6";

if (await zk.isVerified(REGISTRY, user)) {
  // ...grant access
}

// Status + expiry in one batched call:
const status = await zk.getVerificationStatus(REGISTRY, user);
// { verified: true, verifiedUntil: Date, verifiedUntilTimestamp: 1802703599 }
```

### Gate a Solidity contract

```solidity
interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
}

contract Gated {
    IIdentityRegistry public immutable registry;
    constructor(address registry_) { registry = IIdentityRegistry(registry_); }

    modifier onlyVerified() {
        require(registry.isVerified(msg.sender), "zk-x509: not verified");
        _;
    }

    function doSomething() external onlyVerified { /* ... */ }
}
```

## CLI

```bash
# one-off, no install:
npx @tokamak-network/zk-x509-sdk check 0xabc...def

# check against a named registry / network:
zk-x509 check 0xabc...def --service relayers --network sepolia

# list registries and inspect one:
zk-x509 registries
zk-x509 info 0x3cF6A96f1970053ffDf957074F988aD53D13ada3
```

`check` exits `0` when verified, `2` when not — handy in scripts/CI.

```
Options:
  --network <name|chainId>   Deployment (default: sepolia)
  --rpc <url>                RPC endpoint (default: the network's public RPC)
  --registry <address>       Target a specific registry
  --service <name>           Well-known registry by name (users, relayers)
  --factory <address>        Override the RegistryFactory address
```

## API

| Method | Returns |
| --- | --- |
| `isVerified(registry, wallet)` | `boolean` |
| `verifiedUntil(registry, wallet)` | `Date \| null` |
| `getVerificationStatus(registry, wallet)` | `{ verified, verifiedUntil, verifiedUntilTimestamp }` (batched) |
| `listRegistries(factory?)` | `string[]` |
| `getRegistryInfo(registry, factory?)` | name, creator, policy params |
| `getRegistryPolicy(registry)` | paused, constraints, CA root (batched) |

Also exported: `isVerified(provider, registry, wallet)` (one-shot), the ABIs (`IDENTITY_REGISTRY_ABI`, `REGISTRY_FACTORY_ABI`), `NETWORKS` / `getNetwork`, and the `multicall` helpers.

Batched reads use [Multicall3](https://www.multicall3.com/) (one `eth_call`), with an automatic fallback to individual calls where it isn't deployed.

## Networks

| Network | chainId | RegistryFactory |
| --- | --- | --- |
| Sepolia | 11155111 | `0x9e937dF6ac0E85979622519068412A518fa085d9` |

Addresses mirror `deployments/<chainId>.json` in the [zk-X509 repo](https://github.com/tokamak-network/zk-X509).

## License

MIT
