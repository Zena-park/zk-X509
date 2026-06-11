"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PenLine, Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { truncateHex } from "@/lib/utils";
import CopyButton from "@/components/CopyButton";
import {
  ADD_PROJECT_PR_URL,
  CARD_ANIMATIONS,
  CARD_STYLES,
  CATEGORIES,
  type CardAnimation,
  type CardStyle,
  type Project,
} from "../projects";
import { canonicalListingMessage } from "../listingSignature";
import { ProjectCard } from "../ProjectCard";

const STATUSES = ["live", "building"] as const;

/** Emit a TS object-literal line for a field, skipping empty optionals. */
function field(key: string, value: string | string[] | undefined): string | null {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  const rendered = Array.isArray(value)
    ? `[${value.map((v) => JSON.stringify(v)).join(", ")}]`
    : JSON.stringify(value);
  return `    ${key}: ${rendered},`;
}

/** Render a Project as a pasteable entry for the PROJECTS array. */
function toEntryLiteral(p: Project): string {
  const lines = [
    "  {",
    field("name", p.name),
    field("description", p.description),
    field("category", p.category),
    field("status", p.status),
    field("chains", p.chains),
    field("url", p.url),
    field("logo", p.logo),
    field("accent", p.accent),
    field("cardStyle", p.cardStyle),
    field("animation", p.animation),
    field("contactEmail", p.contactEmail),
    field("audience", p.audience),
    field("owner", p.owner),
    field("signature", p.signature),
    "  },",
  ].filter(Boolean);
  return lines.join("\n");
}

export default function SignListingPage() {
  const { account, signer, connect } = useWallet();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(CATEGORIES[0]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("building");
  const [chains, setChains] = useState("11155111");
  const [url, setUrl] = useState("");
  const [logo, setLogo] = useState("");
  const [accent, setAccent] = useState("#6b5bff");
  const [cardStyle, setCardStyle] = useState<CardStyle>("classic");
  const [animation, setAnimation] = useState<CardAnimation>("none");
  const [contactEmail, setContactEmail] = useState("");
  const [audience, setAudience] = useState("");

  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  // The entry as currently filled in (without signature) — drives the preview.
  const draft = useMemo<Project>(() => {
    const trim = (s: string) => s.trim();
    const opt = (s: string) => (trim(s) ? trim(s) : undefined);
    return {
      name: trim(name) || "Your Project",
      description: trim(description) || "What it is and how it uses zk-X509.",
      category,
      status,
      chains: chains.split(",").map(trim).filter(Boolean),
      url: opt(url),
      logo: opt(logo),
      accent: opt(accent),
      cardStyle,
      animation,
      contactEmail: opt(contactEmail),
      audience: opt(audience),
      owner: account ?? undefined,
    };
  }, [name, description, category, status, chains, url, logo, accent, cardStyle, animation, contactEmail, audience, account]);

  // Changing any field invalidates a prior signature.
  const message = useMemo(() => canonicalListingMessage(draft), [draft]);
  const signedEntry: Project | null =
    signature && account ? { ...draft, owner: account, signature } : null;

  async function handleSign() {
    setError(null);
    setSigning(true);
    try {
      if (!signer || !account) {
        await connect();
        setSigning(false);
        return;
      }
      const sig = await signer.signMessage(message);
      setSignature(sig);
    } catch (e) {
      setError((e as { message?: string })?.message ?? "Signing failed.");
    } finally {
      setSigning(false);
    }
  }

  // Re-signing is required whenever the draft changes after a signature.
  const draftChangedSinceSign = signature !== null && (!signedEntry || signedEntry.owner !== account);

  return (
    <main className="max-w-6xl mx-auto pt-24 px-8 pb-16">
      <Link href="/built-with" className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Built with
      </Link>

      <header className="mb-10">
        <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tighter mb-3">Sign your listing</h1>
        <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
          Fill in your project, sign it with the wallet you want to own the listing,
          then paste the generated entry into a pull request. Any later edit to an
          owned listing must be re-signed by this same wallet.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-10">
        {/* Form */}
        <div className="space-y-4">
          <Text label="Project name" value={name} onChange={setName} placeholder="Your Project" />
          <TextArea label="Description" value={description} onChange={setDescription} placeholder="What it is and how it uses zk-X509." />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Category" value={category} onChange={(v) => setCategory(v as (typeof CATEGORIES)[number])} options={[...CATEGORIES]} />
            <Select label="Status" value={status} onChange={(v) => setStatus(v as (typeof STATUSES)[number])} options={[...STATUSES]} />
          </div>
          <Text label="Networks (chain IDs, comma-separated)" value={chains} onChange={setChains} placeholder="11155111, 1" />
          <Text label="Service URL" value={url} onChange={setUrl} placeholder="https://your-project.xyz" />
          <Text label="Logo URL (optional)" value={logo} onChange={setLogo} placeholder="https://your-project.xyz/logo.png" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Card template" value={cardStyle} onChange={(v) => setCardStyle(v as CardStyle)} options={[...CARD_STYLES]} />
            <Select label="Animation" value={animation} onChange={(v) => setAnimation(v as CardAnimation)} options={[...CARD_ANIMATIONS]} />
          </div>
          <div className="grid grid-cols-2 gap-4 items-end">
            <div>
              <label className="block text-xs font-label text-on-surface-variant mb-1.5">Accent color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-12 rounded-lg bg-surface-container border border-outline-variant/20" />
                <input value={accent} onChange={(e) => setAccent(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface text-sm font-mono" />
              </div>
            </div>
            <Text label="Audience (optional)" value={audience} onChange={setAudience} placeholder="Traders" />
          </div>
          <Text label="Contact email" value={contactEmail} onChange={setContactEmail} placeholder="you@your-project.xyz" />
        </div>

        {/* Preview + sign */}
        <div className="space-y-6">
          <div>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Live preview</span>
            <div className="mt-3">
              <ProjectCard project={draft} index={0} />
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-6 border border-outline-variant/10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-sm font-headline font-bold text-on-surface">Owner</span>
              <span className="text-xs font-mono text-on-surface-variant">
                {account ? truncateHex(account) : "Not connected"}
              </span>
            </div>

            {!account ? (
              <button onClick={connect} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-surface font-headline text-sm font-bold rounded-full active:scale-95 transition-transform">
                <Wallet className="w-4 h-4" /> Connect wallet
              </button>
            ) : (
              <button onClick={handleSign} disabled={signing} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-primary text-surface font-headline text-sm font-bold rounded-full active:scale-95 transition-transform disabled:opacity-60">
                <PenLine className="w-4 h-4" /> {signing ? "Signing…" : signature ? "Re-sign entry" : "Sign entry"}
              </button>
            )}

            {error && <p className="text-error text-xs mt-3">{error}</p>}
            {draftChangedSinceSign && (
              <p className="text-amber-400 text-xs mt-3">You changed the entry after signing — re-sign before submitting.</p>
            )}
          </div>

          {signedEntry && (
            <div className="glass-panel rounded-2xl p-6 border border-outline-variant/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-headline font-bold text-on-surface">Paste this into PROJECTS</span>
                <CopyButton text={toEntryLiteral(signedEntry)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Copy entry" />
              </div>
              <pre className="text-[11px] leading-relaxed text-on-surface-variant font-mono overflow-x-auto whitespace-pre">{toEntryLiteral(signedEntry)}</pre>
              <a href={ADD_PROJECT_PR_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-headline font-bold text-tertiary hover:underline">
                Open the project list to paste &amp; PR →
              </a>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-label text-on-surface-variant mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface text-sm" />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-label text-on-surface-variant mb-1.5">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface text-sm resize-none" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs font-label text-on-surface-variant mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/20 text-on-surface text-sm">
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
