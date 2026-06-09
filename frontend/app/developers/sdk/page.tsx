import { DevNav } from "@/components/dev/DevNav";
import { CodeBlock } from "@/components/dev/CodeBlock";
import { DEV_NETWORK } from "@/lib/dev-config";

export const metadata = {
  title: "SDK & CLI — zk-X509 Developers",
  description: "@tokamak-network/zk-x509-sdk — TypeScript read helpers and a terminal CLI for zk-X509.",
};

const INSTALL = `npm install @tokamak-network/zk-x509-sdk ethers`;

const LIB = `import { ethers } from "ethers";
import { ZkX509Client } from "@tokamak-network/zk-x509-sdk";

const provider = new ethers.JsonRpcProvider("${DEV_NETWORK.rpcUrl}");
const zk = new ZkX509Client(provider, { network: "sepolia" });

// your registry (deploy via the factory); 0x3cF6… is zkScatter's example
const REGISTRY = "${DEV_NETWORK.registries.users}";

// gating
await zk.isVerified(REGISTRY, user);            // boolean
await zk.getVerificationStatus(REGISTRY, user); // { verified, verifiedUntil, verifiedUntilTimestamp }

// discovery (batched via Multicall3)
await zk.listRegistries();              // address[]
await zk.getRegistryInfo(REGISTRY);     // name, creator, policy params
await zk.getRegistryPolicy(REGISTRY);   // paused, constraints, CA root`;

const CLI = `# one-off, no install
npx @tokamak-network/zk-x509-sdk check 0xabc...def

# check against a named registry / network
zk-x509 check 0xabc...def --service relayers --network sepolia

# discover + inspect
zk-x509 registries
zk-x509 info 0x3cF6A96f1970053ffDf957074F988aD53D13ada3`;

const API: [string, string][] = [
  ["isVerified(registry, wallet)", "boolean"],
  ["verifiedUntil(registry, wallet)", "Date | null"],
  ["getVerificationStatus(registry, wallet)", "{ verified, verifiedUntil, verifiedUntilTimestamp } — batched"],
  ["listRegistries(factory?)", "string[]"],
  ["getRegistryInfo(registry, factory?)", "name, creator, policy params"],
  ["getRegistryPolicy(registry)", "paused, constraints, CA root — batched"],
];

export default function SdkPage() {
  return (
    <main className="max-w-4xl mx-auto pt-24 px-8 pb-16">
      <DevNav />

      <h1 className="text-3xl font-headline font-bold text-on-surface mb-3">SDK &amp; CLI</h1>
      <p className="text-on-surface-variant leading-relaxed mb-6 max-w-2xl">
        <code className="font-mono text-tertiary">@tokamak-network/zk-x509-sdk</code> is the read side of zk-X509 — check
        verification and discover registries from Node, the browser, scripts, or the terminal. <code className="font-mono">ethers</code> v6
        is a peer dependency.
      </p>

      <CodeBlock lang="bash" code={INSTALL} />

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-2">Library</h2>
      <CodeBlock lang="typescript" code={LIB} />

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-3">API</h2>
      <div className="glass-panel rounded-2xl border border-outline-variant/10 divide-y divide-outline-variant/10 text-sm">
        {API.map(([sig, ret]) => (
          <div key={sig} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 p-3">
            <code className="font-mono text-xs text-tertiary sm:w-1/2">{sig}</code>
            <span className="text-on-surface-variant text-xs">{ret}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-on-surface-variant mt-2">
        Batched reads use Multicall3 (one <code className="font-mono">eth_call</code>) with an automatic fallback to individual calls.
      </p>

      <h2 className="text-lg font-headline font-bold text-on-surface mt-8 mb-2">CLI</h2>
      <p className="text-sm text-on-surface-variant mb-1">
        <code className="font-mono">check</code> exits <code className="font-mono">0</code> when verified and{" "}
        <code className="font-mono">2</code> when not — handy in scripts/CI.
      </p>
      <CodeBlock lang="bash" code={CLI} />
    </main>
  );
}
