// Machine-readable integration doc for AI agents / LLMs, served at
// /developers/llms.txt (the emerging llms.txt convention). Kept terse and
// structured so an agent can ingest the whole zk-X509 integration in one fetch.

export const dynamic = "force-static";

const BODY = `# zk-X509

> On-chain identity verification. A wallet proves it holds a valid X.509 certificate (e.g. a national eID / org certificate) with a zero-knowledge proof. The proof is verified on-chain and the wallet is marked "verified" in a registry. No personal data is stored on-chain. Integrators gate access on a single view call: isVerified(wallet).

## Core concept

- IdentityRegistry: a per-service contract. Holds the set of verified wallets and the service's policy (accepted CAs, required certificate fields, proof freshness). Key read: isVerified(address) -> bool.
- RegistryFactory: deploys and indexes IdentityRegistry instances. Read: getRegistries() -> address[], registryInfo(registry).
- A wallet becomes verified by submitting a ZK proof of its certificate to the registry (done in the zk-X509 app UI). Integrators only READ status.

## The one call you need (gating)

Solidity:

interface IIdentityRegistry { function isVerified(address wallet) external view returns (bool); }

contract Gated {
    IIdentityRegistry public immutable registry;
    constructor(address registry_) { registry = IIdentityRegistry(registry_); }
    modifier onlyVerified() { require(registry.isVerified(msg.sender), "zk-x509: not verified"); _; }
    function protectedAction() external onlyVerified { /* ... */ }
}

TypeScript (ethers v6):

import { ethers } from "ethers";
const registry = new ethers.Contract(REGISTRY_ADDRESS, ["function isVerified(address) view returns (bool)"], provider);
const ok = await registry.isVerified(userAddress);

TypeScript (SDK):

import { ZkX509Client } from "@tokamak-network/zk-x509-sdk";
const zk = new ZkX509Client(provider, { network: "sepolia" });
const ok = await zk.isVerified(REGISTRY_ADDRESS, userAddress);

## IdentityRegistry read interface

- isVerified(address wallet) view returns (bool)            // current, non-expired verification
- verifiedUntil(address wallet) view returns (uint256)      // expiry, unix seconds; 0 if never
- owner() view returns (address)
- paused() view returns (bool)
- MAX_WALLETS_PER_CERT() view returns (uint32)
- MIN_DISCLOSURE_MASK() view returns (uint8)
- maxProofAge() view returns (uint256)
- caMerkleRoot() view returns (bytes32)
- crlMerkleRoot() view returns (bytes32)
- getCaCount() view returns (uint256)
- requiredCountry()/requiredOrg()/requiredOrgUnit()/requiredCommonName() view returns (bytes32)  // bytes32(0) = unconstrained
- event UserRegistered(address indexed user, bytes32 nullifier, bytes32 country, bytes32 org, bytes32 orgUnit, bytes32 commonName)

## RegistryFactory read interface

- getRegistries() view returns (address[])
- registryInfo(address registry) view returns (address creator, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 maxProofAge, uint256 createdAt, uint256 vKeyVersion)
- isRegistry(address) view returns (bool)
- event RegistryCreated(address indexed registry, address indexed owner, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 vKeyVersion)

## Deployments

Sepolia (chainId 11155111):
- RegistryFactory: 0x9e937dF6ac0E85979622519068412A518fa085d9
- SP1 verifier:    0x261a1619cC63273de7c64872B769305732761888
- Public RPC: https://ethereum-sepolia.publicnode.com

Example registries operated by the zkScatter service (a reference consumer of zk-X509) — for inspection/testing only, NOT for integrators to gate on. Deploy your own via the RegistryFactory.
- "Users" (zkScatter):    0x3cF6A96f1970053ffDf957074F988aD53D13ada3
- "Relayers" (zkScatter): 0x9fDE6182B1fd10F2eDfE15b704FE95787C170914

## SDK + CLI

npm install @tokamak-network/zk-x509-sdk ethers

CLI:
- zk-x509 check <address> [--service users|relayers] [--registry <addr>] [--network sepolia] [--rpc <url>]   // exit 0 = verified, 2 = not
- zk-x509 registries [--network sepolia]
- zk-x509 info <registry>

SDK methods (ZkX509Client):
- isVerified(registry, wallet) -> boolean
- verifiedUntil(registry, wallet) -> Date | null
- getVerificationStatus(registry, wallet) -> { verified, verifiedUntil, verifiedUntilTimestamp }   // batched
- listRegistries(factory?) -> string[]
- getRegistryInfo(registry, factory?) -> { creator, name, maxWallets, minDisclosureMask, maxProofAge, createdAt, vKeyVersion }
- getRegistryPolicy(registry) -> { paused, owner, maxWalletsPerCert, minDisclosureMask, caCount, caMerkleRoot, required }   // batched

## Notes

- Reads are plain eth_call view functions; no gas, no signature needed.
- Batched reads use Multicall3 (0xcA11bde05977b3631167028862bE2a173976CA11) with a fallback to individual calls.
- Integrators never handle personal data; only verification status (bool/timestamp) is on-chain.
- To onboard users, send them to the zk-X509 app to generate a proof; status then flips to verified.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
