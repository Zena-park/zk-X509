import Link from "next/link";
import { DevNav } from "@/components/dev/DevNav";
import { CodeBlock } from "@/components/dev/CodeBlock";
import { VerificationChecker } from "@/components/dev/VerificationChecker";
import type { ReactNode } from "react";
import { DEV_NETWORK } from "@/lib/dev-config";

export const metadata = {
  title: "Quickstart — zk-X509 Developers",
  description: "Gate your dApp on zk-X509 identity verification in four steps.",
};

const SOLIDITY = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
}

contract Gated {
    IIdentityRegistry public immutable registry;

    constructor(address registry_) {
        registry = IIdentityRegistry(registry_);
    }

    modifier onlyVerified() {
        require(registry.isVerified(msg.sender), "zk-x509: not verified");
        _;
    }

    function protectedAction() external onlyVerified {
        // ...only verified identities reach here
    }
}`;

const TS_SDK = `import { ethers } from "ethers";
import { ZkX509Client } from "zk-x509-sdk";

const provider = new ethers.JsonRpcProvider(rpcUrl); // or a wallet BrowserProvider
const zk = new ZkX509Client(provider, { network: "sepolia" });

// your service's registry (deploy via the factory).
// 0x3cF6… below is zkScatter's, shown only as a runnable example.
const REGISTRY = "${DEV_NETWORK.registries.users}";
if (await zk.isVerified(REGISTRY, userAddress)) {
  // ...grant access
}`;

const TS_ETHERS = `import { ethers } from "ethers";

const ABI = ["function isVerified(address) view returns (bool)"];
const registry = new ethers.Contract(REGISTRY_ADDRESS, ABI, provider);
const ok = await registry.isVerified(userAddress);`;

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-tertiary/15 text-tertiary font-headline font-bold text-sm">{n}</span>
        <h2 className="text-lg font-headline font-bold text-on-surface">{title}</h2>
      </div>
      <div className="pl-10 text-sm text-on-surface-variant leading-relaxed">{children}</div>
    </section>
  );
}

export default function QuickstartPage() {
  return (
    <main className="max-w-4xl mx-auto pt-24 px-8 pb-16">
      <DevNav />

      <h1 className="text-3xl font-headline font-bold text-on-surface mb-3">Gate your dApp in 4 steps</h1>
      <p className="text-on-surface-variant leading-relaxed mb-10 max-w-2xl">
        The core integration is a single view call — <code className="font-mono text-tertiary">isVerified(wallet)</code>.
        Pick a registry, read it on-chain or off-chain, and point users to verification.
      </p>

      <Step n={1} title="Deploy your registry">
        Each service gets its own registry.{" "}
        <Link href="/create" className="text-tertiary hover:underline">Deploy one via the factory</Link> with your CA trust
        anchors and certificate-field constraints. (The Sepolia{" "}
        <span className="font-mono text-xs">Users</span> registry <span className="font-mono text-xs">0x3cF6…ada3</span> belongs
        to the zkScatter service — use it only to try the checker below, not to gate your app.)
      </Step>

      <Step n={2} title="Read verification — on-chain">
        Call <code className="font-mono">isVerified</code> from your contract. The <code className="font-mono">onlyVerified</code> modifier
        is all most integrations need:
        <CodeBlock lang="solidity" code={SOLIDITY} />
      </Step>

      <Step n={3} title="…or off-chain (TypeScript)">
        With the SDK:
        <CodeBlock lang="typescript" code={TS_SDK} />
        Or with plain ethers, no dependency:
        <CodeBlock lang="typescript" code={TS_ETHERS} />
      </Step>

      <Step n={4} title="Send users to get verified">
        Direct unverified users to your registry&apos;s verification page (they generate a ZK proof of their certificate locally).
        Once verified, the reads above flip to <code className="font-mono">true</code>.
      </Step>

      <div className="mt-12">
        <VerificationChecker />
      </div>
    </main>
  );
}
