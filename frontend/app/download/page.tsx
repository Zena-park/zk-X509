"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Monitor, Apple, ArrowDownToLine, Clock, ExternalLink, Terminal } from "lucide-react";
import { REPO_URL } from "@/lib/platform";

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 },
};

const stagger = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.5, delay },
});

// Served as a static asset from frontend/public/downloads/.
// Bumped when the bundled DMG version changes — keeps the URL explicit
// about what the user is actually getting (no silent rev'ing).
const MACOS_DOWNLOAD_URL = "/downloads/zk-X509_0.1.0_aarch64.dmg";
const MACOS_DOWNLOAD_FILENAME = "zk-X509_0.1.0_aarch64.dmg";

// HEAD-probe the DMG on mount so an operator who hasn't run
// `tauri build && cp …/public/downloads/` yet sees a clear
// "not built" message instead of clicking a button that 404s.
// The DMG itself is gitignored (each rebuild is ~24 MB and the repo
// stays private until release), so a fresh clone always starts in
// the "missing" state until the operator follows the build steps.
function useDmgAvailability(url: string) {
  // States: "checking" until the probe resolves, then "available" if
  // HEAD returns 2xx and the file is non-empty, else "missing".
  const [state, setState] = useState<"checking" | "available" | "missing">(
    "checking",
  );
  useEffect(() => {
    let cancelled = false;
    fetch(url, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        const lenHeader = res.headers.get("content-length");
        const sizeOk = !lenHeader || parseInt(lenHeader, 10) > 0;
        setState(res.ok && sizeOk ? "available" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export default function DownloadPage() {
  const dmgState = useDmgAvailability(MACOS_DOWNLOAD_URL);
  return (
    <main className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <motion.div {...fadeUp} className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight text-on-surface mb-4">
            Download ZK-X509 Prover
          </h1>
          <p className="text-on-surface-variant text-lg max-w-2xl mx-auto">
            Generate zero-knowledge proofs from your X.509 certificates locally.
            Your private key never leaves your device.
          </p>
        </motion.div>

        {/* Platform Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* macOS */}
          <motion.div
            {...stagger(0)}
            className="relative rounded-2xl border border-outline-variant/20 bg-surface-container p-8 flex flex-col items-center text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Apple className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-headline font-semibold text-on-surface mb-2">
              macOS
            </h2>
            <p className="text-on-surface-variant text-sm mb-1">
              Apple Silicon (aarch64)
            </p>
            <p className="text-on-surface-variant/60 text-xs mb-6">
              macOS 12 Monterey or later
            </p>
            {dmgState === "available" ? (
              <a
                href={MACOS_DOWNLOAD_URL}
                download={MACOS_DOWNLOAD_FILENAME}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-surface font-headline text-sm font-bold rounded-full transition-transform active:scale-95 hover:shadow-lg hover:shadow-primary/20"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Download for macOS
              </a>
            ) : dmgState === "checking" ? (
              <span className="inline-flex items-center gap-2 px-6 py-3 bg-on-surface/10 text-on-surface-variant font-headline text-sm font-bold rounded-full cursor-wait">
                <ArrowDownToLine className="w-4 h-4 opacity-50" />
                Checking…
              </span>
            ) : (
              // DMG missing — most likely a fresh repo clone where the
              // operator hasn't run `tauri build` + copy yet. The card
              // stays the same height; the message tells them what to
              // do without sending them to a 404.
              <div className="flex flex-col items-center gap-2">
                <span className="inline-flex items-center gap-2 px-6 py-3 bg-on-surface/10 text-on-surface-variant font-headline text-sm font-bold rounded-full cursor-not-allowed">
                  <Clock className="w-4 h-4" />
                  Signed build coming soon
                </span>
                <p className="text-xs text-on-surface-variant/70 max-w-xs">
                  The notarized installer is still being code-signed. For now,
                  clone the repo and build &amp; run from source — see{" "}
                  <strong className="text-on-surface">Run from source</strong> below.
                </p>
              </div>
            )}
          </motion.div>

          {/* Windows */}
          <motion.div
            {...stagger(0.1)}
            className="relative rounded-2xl border border-outline-variant/20 bg-surface-container p-8 flex flex-col items-center text-center opacity-60"
          >
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-tertiary/10 rounded-full">
              <Clock className="w-3 h-3 text-tertiary" />
              <span className="text-xs font-label text-tertiary">Coming Soon</span>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-on-surface/5 flex items-center justify-center mb-6">
              <Monitor className="w-8 h-8 text-on-surface-variant" />
            </div>
            <h2 className="text-xl font-headline font-semibold text-on-surface mb-2">
              Windows
            </h2>
            <p className="text-on-surface-variant text-sm mb-1">
              x86_64
            </p>
            <p className="text-on-surface-variant/60 text-xs mb-6">
              Windows 10 or later
            </p>
            <span className="inline-flex items-center gap-2 px-6 py-3 bg-on-surface/10 text-on-surface-variant font-headline text-sm font-bold rounded-full cursor-not-allowed">
              <ArrowDownToLine className="w-4 h-4" />
              Not Available Yet
            </span>
          </motion.div>
        </div>

        {/* Run from source */}
        <motion.div
          {...stagger(0.15)}
          className="rounded-2xl border border-primary/20 bg-surface-container p-8 mb-8"
        >
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-headline font-semibold text-on-surface">
              Run from source <span className="text-primary">(available now)</span>
            </h3>
          </div>
          <p className="text-sm text-on-surface-variant mb-5">
            Signed macOS &amp; Windows installers are pending Apple notarization
            and code-signing — they&apos;ll land here soon. Until then, clone the
            repo and build the app locally. It&apos;s the same prover, and the ELF
            is pinned via Docker so its verification key matches what&apos;s
            on-chain.
          </p>

          <p className="text-xs font-label text-on-surface-variant mb-2">
            Prerequisites: Rust + SP1 (<code>sp1up</code>), Foundry
            (<code>foundryup</code>), Docker Desktop, Node.js 20+.
          </p>

          <pre className="px-4 py-3 bg-surface-container-low rounded-lg text-xs text-on-surface font-mono overflow-x-auto whitespace-pre">{`# clone
git clone https://github.com/Zena-park/zk-X509.git
cd zk-X509

# 1) extract the pinned ELF from Docker — guarantees the prover's
#    vkey matches the on-chain programVKey (don't skip this)
make elf

# 2) build the desktop app (Tauri GUI) — produces .app + DMG
make desktop

#    install the DMG, or open the .app directly:
open target/release/bundle/macos/zk-X509.app`}</pre>

          <p className="text-xs text-on-surface-variant/70 mt-3">
            <strong className="text-on-surface-variant">Windows:</strong> extract
            the ELF in WSL/Git&nbsp;Bash with <code>make elf</code>, then in
            PowerShell run{" "}
            <code>$env:PREBUILT_ELF = &quot;$pwd\elf\zk-x509-program&quot;</code>{" "}
            followed by <code>cargo build --release --bin interactive</code>.
          </p>
        </motion.div>

        {/* Info Section */}
        <motion.div
          {...stagger(0.2)}
          className="rounded-2xl border border-outline-variant/20 bg-surface-container p-8"
        >
          <h3 className="text-lg font-headline font-semibold text-on-surface mb-4">
            How it works
          </h3>
          <div className="space-y-4 text-sm text-on-surface-variant">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <p>
                The prover app reads your X.509 certificate from the{" "}
                <strong className="text-on-surface">macOS Keychain</strong> via Security.framework.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">2</span>
              </div>
              <p>
                A <strong className="text-on-surface">zero-knowledge proof</strong> is generated
                locally, proving certificate validity without revealing private data.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">3</span>
              </div>
              <p>
                Submit the proof on-chain to{" "}
                <strong className="text-on-surface">verify your identity</strong> without exposing
                your certificate or keys.
              </p>
            </div>
          </div>
        </motion.div>

        {/* GitHub link */}
        <motion.div {...stagger(0.3)} className="text-center mt-8">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View source on GitHub
          </a>
        </motion.div>
      </div>
    </main>
  );
}
