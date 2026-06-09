import Link from "next/link";
import { ShieldCheck, Boxes, UserCheck, ArrowRight, Terminal, BookOpen, Bot } from "lucide-react";
import { DevNav } from "@/components/dev/DevNav";
import type { ReactNode } from "react";
import { DEV_NETWORK } from "@/lib/dev-config";

export const metadata = {
  title: "Developers — zk-X509",
  description: "Integrate zk-X509 on-chain identity verification: gate your dApp on verified wallets, deploy a registry, or use the SDK & CLI.",
};

// Reference registries operated by the zkScatter service (a consumer of
// zk-X509). They exist to inspect / try the checker against — build your own
// service with its own registry via the factory.
const EXAMPLE_REGISTRIES: [string, string][] = [
  ["Users", DEV_NETWORK.registries.users],
  ["Relayers", DEV_NETWORK.registries.relayers],
];

function PathCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-5 border border-outline-variant/10">
      <div className="flex items-center gap-2 mb-2 text-tertiary">{icon}<h3 className="font-headline font-bold text-on-surface">{title}</h3></div>
      <p className="text-sm text-on-surface-variant leading-relaxed">{children}</p>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <main className="max-w-4xl mx-auto pt-24 px-8 pb-16">
      <DevNav />

      <h1 className="text-3xl font-headline font-bold text-on-surface mb-3">Build with zk-X509</h1>
      <p className="text-on-surface-variant leading-relaxed mb-8 max-w-2xl">
        zk-X509 lets a wallet prove it holds a valid X.509 certificate identity with a zero-knowledge proof.
        The proof is verified on-chain and the wallet is marked <span className="text-on-surface font-semibold">verified</span> in a
        registry — no personal data ever touches the chain. Your contract or dApp then gates access on a single
        view call: <code className="font-mono text-tertiary">isVerified(wallet)</code>.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <PathCard icon={<ShieldCheck className="w-4 h-4" />} title="Gate access">
          Require a verified identity in your Solidity contract or frontend — the killer use case.
        </PathCard>
        <PathCard icon={<Boxes className="w-4 h-4" />} title="Deploy a registry">
          Spin up your own registry with custom CA trust anchors and field constraints (country, org…).
        </PathCard>
        <PathCard icon={<UserCheck className="w-4 h-4" />} title="Onboard users">
          Send users to get verified, then read their status on-chain.
        </PathCard>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        <Link href="/developers/quickstart" className="glass-panel rounded-2xl p-5 border border-outline-variant/10 hover:border-tertiary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-1"><BookOpen className="w-4 h-4 text-tertiary" /><span className="font-headline font-bold text-on-surface">Quickstart</span><ArrowRight className="w-4 h-4 ml-auto text-on-surface-variant group-hover:text-tertiary transition-colors" /></div>
          <p className="text-sm text-on-surface-variant">Gate your dApp in three steps — Solidity + TypeScript, with a live checker.</p>
        </Link>
        <Link href="/developers/sdk" className="glass-panel rounded-2xl p-5 border border-outline-variant/10 hover:border-tertiary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-1"><Terminal className="w-4 h-4 text-tertiary" /><span className="font-headline font-bold text-on-surface">SDK &amp; CLI</span><ArrowRight className="w-4 h-4 ml-auto text-on-surface-variant group-hover:text-tertiary transition-colors" /></div>
          <p className="text-sm text-on-surface-variant"><code className="font-mono">@tokamak-network/zk-x509-sdk</code> — read helpers + a terminal CLI.</p>
        </Link>
        <Link href="/developers/contracts" className="glass-panel rounded-2xl p-5 border border-outline-variant/10 hover:border-tertiary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-1"><ShieldCheck className="w-4 h-4 text-tertiary" /><span className="font-headline font-bold text-on-surface">Contract reference</span><ArrowRight className="w-4 h-4 ml-auto text-on-surface-variant group-hover:text-tertiary transition-colors" /></div>
          <p className="text-sm text-on-surface-variant">The <code className="font-mono">IIdentityRegistry</code> interface, events, and ABIs.</p>
        </Link>
        <a href="/developers/llms.txt" target="_blank" rel="noreferrer" className="glass-panel rounded-2xl p-5 border border-outline-variant/10 hover:border-tertiary/30 transition-colors group">
          <div className="flex items-center gap-2 mb-1"><Bot className="w-4 h-4 text-tertiary" /><span className="font-headline font-bold text-on-surface">For AI agents</span><ArrowRight className="w-4 h-4 ml-auto text-on-surface-variant group-hover:text-tertiary transition-colors" /></div>
          <p className="text-sm text-on-surface-variant">A machine-readable <code className="font-mono">llms.txt</code> describing the whole integration.</p>
        </a>
      </div>

      <h2 className="text-lg font-headline font-bold text-on-surface mb-3">Protocol contracts</h2>
      <p className="text-sm text-on-surface-variant mb-3 max-w-2xl">
        The shared infrastructure every integrator uses. Deploy your own registry through the{" "}
        <Link href="/create" className="text-tertiary hover:underline">factory</Link> — one registry per service.
      </p>
      <div className="glass-panel rounded-2xl p-5 border border-outline-variant/10 text-sm mb-8">
        <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/10">
          <span className="text-on-surface-variant">Network</span>
          <span className="font-headline text-on-surface">{DEV_NETWORK.name} ({DEV_NETWORK.chainId})</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-outline-variant/10">
          <span className="text-on-surface-variant">RegistryFactory</span>
          <span className="font-mono text-xs text-on-surface">{DEV_NETWORK.factory}</span>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-on-surface-variant">SP1 verifier</span>
          <span className="font-mono text-xs text-on-surface">{DEV_NETWORK.verifier}</span>
        </div>
      </div>

      <h2 className="text-lg font-headline font-bold text-on-surface mb-2">Example registries</h2>
      <p className="text-sm text-on-surface-variant mb-3 max-w-2xl">
        Operated by the <span className="text-on-surface font-semibold">zkScatter</span> service (a reference consumer of
        zk-X509) — handy to inspect or to try the live checker against. They are <span className="text-on-surface">not</span> yours
        to gate on; deploy your own registry for your service.
      </p>
      <div className="glass-panel rounded-2xl p-5 border border-outline-variant/10 text-sm">
        {EXAMPLE_REGISTRIES.map(([name, addr]) => (
          <div key={addr} className="flex items-center justify-between py-1.5">
            <span className="text-on-surface-variant">{name} <span className="text-on-surface-variant/50">(zkScatter)</span></span>
            <span className="font-mono text-xs text-on-surface">{addr}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
