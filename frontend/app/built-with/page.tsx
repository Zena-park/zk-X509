"use client";

import { useState } from "react";
import Link from "next/link";
import { Boxes, GitPullRequest, Mail, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChainName, useWallet } from "@/lib/wallet";
import { ADD_PROJECT_PR_URL, CATEGORIES, PROJECTS } from "./projects";
import { ProjectCard } from "./ProjectCard";

// Filter options derived once from the static data above (never change at runtime).
const CATEGORY_FILTERS = ["All", ...CATEGORIES] as const;
const AVAILABLE_CHAINS = Array.from(
  new Set(PROJECTS.flatMap((p) => p.chains))
).sort((a, b) => Number(a) - Number(b));

/** A pill button used by both the network and category filter rows. */
function FilterPill({
  label,
  isActive,
  onClick,
  activeClass,
  suffix,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  /** Tailwind classes applied when this pill is the active selection. */
  activeClass: string;
  suffix?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 rounded-full text-sm font-label transition-colors border",
        isActive
          ? activeClass
          : "bg-surface-container border-outline-variant/15 text-on-surface-variant hover:text-on-surface"
      )}
    >
      {label}
      {suffix}
    </button>
  );
}

export default function BuiltWithPage() {
  const { chainId } = useWallet();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  // Network filter: "all" shows every project; otherwise a chain ID string.
  // Defaults to the wallet's network once we can resolve it to a known chain
  // that actually has projects, so a connected user sees their network first.
  const [networkChoice, setNetworkChoice] = useState<string | null>(null);

  // Resolve the active network: explicit choice wins; otherwise prefer the
  // connected wallet's chain if any project is on it; else show all.
  const activeNetwork =
    networkChoice ??
    (chainId && AVAILABLE_CHAINS.includes(chainId) ? chainId : "all");

  // Tiny static list — filtering inline each render is cheaper than memoizing.
  const visible = PROJECTS.filter(
    (p) =>
      (activeCategory === "All" || p.category === activeCategory) &&
      (activeNetwork === "all" || p.chains.includes(activeNetwork))
  );

  return (
    <main className="max-w-6xl mx-auto pt-24 px-8 pb-16">
      <header className="mb-12">
        <div className="flex items-center gap-2 mb-4 text-tertiary">
          <Boxes className="w-5 h-5" />
          <span className="text-xs font-label uppercase tracking-widest">Built with zk-X509</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-headline font-bold tracking-tighter mb-4">
          Projects using zk-X509
        </h1>
        <p className="text-on-surface-variant text-lg max-w-2xl font-body leading-relaxed">
          Apps and services that gate access, vote, or onboard users with zk-X509
          on-chain identity — proving a valid X.509 certificate without revealing
          any personal data.
        </p>
      </header>

      {/* Network filter — browse any network's projects without switching the
          wallet. Defaults to the connected network, but every network stays
          selectable regardless of what the wallet is on. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mr-1">
          Network
        </span>
        {["all", ...AVAILABLE_CHAINS].map((id) => (
          <FilterPill
            key={id}
            label={id === "all" ? "All networks" : getChainName(id)}
            isActive={id === activeNetwork}
            onClick={() => setNetworkChoice(id)}
            activeClass="bg-secondary/15 border-secondary/40 text-secondary"
            suffix={
              id !== "all" && id === chainId ? (
                <span className="ml-1.5 text-[10px] opacity-70">• connected</span>
              ) : undefined
            }
          />
        ))}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-10">
        {CATEGORY_FILTERS.map((c) => (
          <FilterPill
            key={c}
            label={c}
            isActive={c === activeCategory}
            onClick={() => setActiveCategory(c)}
            activeClass="bg-tertiary/15 border-tertiary/40 text-tertiary"
          />
        ))}
      </div>

      {/* Project grid */}
      {visible.length > 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((project, i) => (
            <ProjectCard key={project.name} project={project} index={i} />
          ))}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl p-12 border border-outline-variant/10 text-center text-on-surface-variant">
          No projects match this network and category yet.
        </div>
      )}

      {/* Get listed CTA */}
      <div className="mt-16 glass-panel rounded-2xl p-8 border border-outline-variant/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-headline font-bold mb-2">Building with zk-X509?</h2>
          <p className="text-on-surface-variant text-sm font-body max-w-xl leading-relaxed">
            List, update, or remove a project by opening a pull request that edits
            the project list. If you set an owner address, sign your entry first —
            edits to an owned listing must be re-signed by that wallet.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link
            href="/built-with/sign"
            className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-surface font-headline text-sm font-bold rounded-full transition-transform active:scale-95"
          >
            <PenLine className="w-4 h-4" />
            Sign listing
          </Link>
          <a
            href={ADD_PROJECT_PR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 bg-surface-container-high text-on-surface font-headline text-sm font-bold rounded-full transition-colors hover:bg-surface-container"
          >
            <GitPullRequest className="w-4 h-4" />
            Open PR
          </a>
          <Link
            href="/developers"
            className="inline-flex items-center gap-2 px-5 py-3 bg-surface-container-high text-on-surface font-headline text-sm font-bold rounded-full transition-colors hover:bg-surface-container"
          >
            <Mail className="w-4 h-4" />
            Guide
          </Link>
        </div>
      </div>
    </main>
  );
}
