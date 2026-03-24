"use client";

import React, { useState, useEffect } from "react";
import {
  AlertTriangle,
  Wallet,
  Share2,
  ListFilter,
  Cpu,
  Settings,
  History,
  ShieldCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const INITIAL_FEED = [
  {
    id: 1,
    status: "OK",
    timestamp: "2024-05-20 14:02:11",
    message: "Proof Verified: 0x9a...32b1",
    latency: "242ms",
  },
  {
    id: 2,
    status: "OK",
    timestamp: "2024-05-20 14:01:58",
    message: "Proof Verified: 0x11...e2f3",
    latency: "218ms",
  },
  {
    id: 3,
    status: "INF",
    timestamp: "2024-05-20 14:01:42",
    message: "Merkle Tree Snapshot Created: Block #19,482,000",
    latency: "1.2s",
  },
];

function BentoCard({
  title,
  value,
  color,
  mono = false,
  icon,
  children,
}: {
  title: string;
  value: string;
  color: "primary" | "secondary" | "tertiary" | "error";
  mono?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const colorMap = {
    primary: "text-primary",
    secondary: "text-secondary",
    tertiary: "text-tertiary",
    error: "text-error",
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-surface p-6 rounded-3xl border border-outline-variant/10 relative overflow-hidden group"
    >
      <div className="absolute top-0 right-0 p-4 transition-transform group-hover:scale-110 duration-500">
        {icon}
      </div>
      <p className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">
        {title}
      </p>
      <h3
        className={`text-2xl font-headline font-bold mt-2 ${colorMap[color]} ${mono ? "font-mono text-lg" : ""}`}
      >
        {value}
      </h3>
      {children}
    </motion.div>
  );
}

export default function AdminPage() {
  const [isPaused, setIsPaused] = useState(false);
  const [feed, setFeed] = useState(INITIAL_FEED);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isPaused) {
        const newEntry = {
          id: Date.now(),
          status: Math.random() > 0.1 ? "OK" : "INF",
          timestamp: new Date()
            .toISOString()
            .replace("T", " ")
            .split(".")[0],
          message: `Proof Verified: 0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
          latency: `${Math.floor(Math.random() * 300 + 100)}ms`,
        };
        setFeed((prev) => [newEntry, ...prev].slice(0, 10));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <main className="md:ml-64 pt-28 p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Alert Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 p-4 rounded-xl border border-error/20 bg-error/5 backdrop-blur-sm"
        >
          <AlertTriangle className="text-error w-5 h-5" />
          <div className="flex-1">
            <p className="text-sm font-headline font-bold text-error">
              READ-ONLY ACCESS RESTRICTED
            </p>
            <p className="text-xs text-on-surface-variant">
              Your connected wallet (0x...f2a1) is not the protocol owner.
              Transaction signing is disabled.
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-error/20 text-error font-bold border border-error/30">
            AUDIT_MODE
          </span>
        </motion.div>

        {/* Header Section */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-headline font-bold tracking-tight text-primary">
              Admin Console
            </h1>
            <p className="text-on-surface-variant mt-2 max-w-lg">
              Cryptographic root management and protocol safety parameters for
              the ZK-X509 network.
            </p>
          </div>
          <div className="flex gap-2 text-xs font-mono">
            <span className="px-3 py-1 bg-surface-highest/50 rounded-full text-tertiary border border-tertiary/20">
              BLOCK #19,482,001
            </span>
            <span className="px-3 py-1 bg-surface-highest/50 rounded-full text-secondary border border-secondary/20">
              SYNCED
            </span>
          </div>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - System Status */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contract Status */}
            <BentoCard
              title="Contract Status"
              value="ACTIVE"
              color="secondary"
              icon={<Wallet className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-mono mt-4 text-on-surface-variant truncate">
                0x5f3e...b921
              </p>
              <div className="mt-6 flex items-center gap-2">
                <div className="h-1 flex-1 bg-secondary/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-secondary shadow-[0_0_8px_rgba(107,255,143,0.5)]"
                  />
                </div>
                <span className="text-[10px] font-mono text-secondary">
                  100%
                </span>
              </div>
            </BentoCard>

            {/* CA Merkle Root */}
            <BentoCard
              title="CA Merkle Root"
              value="0x8a...4d2f"
              color="primary"
              mono
              icon={<Share2 className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-label text-on-surface-variant mt-4">
                LAST UPDATED: 2 HOURS AGO
              </p>
              <div className="mt-4 flex items-end gap-1.5 h-8">
                {[0.4, 1, 0.6, 0.8, 0.5, 0.9, 0.7].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h * 100}%` }}
                    transition={{ delay: i * 0.1, duration: 0.5 }}
                    className="w-1.5 bg-tertiary/60 rounded-full"
                  />
                ))}
              </div>
            </BentoCard>

            {/* CRL Merkle Root */}
            <BentoCard
              title="CRL Merkle Root"
              value="0x2c...ef1a"
              color="primary"
              mono
              icon={<ListFilter className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-label text-on-surface-variant mt-4 uppercase tracking-wider">
                Verified Leaves: 1,402,192
              </p>
              <div className="mt-4 flex -space-x-2">
                {["M", "P", "V", "S"].map((l, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-full border-2 border-surface bg-surface-highest flex items-center justify-center text-[8px] font-bold text-on-surface-variant"
                  >
                    {l}
                  </div>
                ))}
              </div>
            </BentoCard>

            {/* Global Config */}
            <BentoCard
              title="Global Config"
              value="v2.4.0-beta"
              color="primary"
              icon={<Cpu className="w-12 h-12 opacity-10" />}
            >
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    Circuits
                  </p>
                  <p className="text-sm font-headline font-bold">
                    Plonk/Groth16
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    Security
                  </p>
                  <p className="text-sm font-headline font-bold">128-bit</p>
                </div>
              </div>
              <div className="mt-4 p-2 bg-surface-low rounded-lg border border-outline-variant/10">
                <p className="text-[10px] font-mono text-tertiary">
                  TRUSTED_SETUP_KEY: verified
                </p>
              </div>
            </BentoCard>

            {/* Protocol Management */}
            <div className="col-span-1 md:col-span-2 bg-surface p-8 rounded-3xl border border-outline-variant/10 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-8">
                <Settings className="text-primary w-5 h-5" />
                <h2 className="text-xl font-headline font-bold text-primary">
                  Protocol Management
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-label text-on-surface-variant">
                      Update Merkle Root
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-mono focus:ring-1 focus:ring-tertiary transition-all outline-none text-primary placeholder:text-on-surface-variant/30"
                        placeholder="New 32-byte Hex Root"
                        type="text"
                      />
                      <button
                        className="bg-primary text-background px-6 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                        disabled
                      >
                        UPDATE
                      </button>
                    </div>
                    <p className="text-[10px] text-on-surface-variant italic">
                      Requires owner signature. Propagates in ~12 seconds.
                    </p>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-label text-on-surface-variant">
                      Max Proof Age (Seconds)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        className="flex-1 accent-tertiary h-1 bg-surface-highest rounded-full appearance-none cursor-pointer"
                        max="3600"
                        min="60"
                        type="range"
                        defaultValue="1800"
                      />
                      <span className="text-sm font-mono font-bold w-12 text-center text-primary">
                        1800s
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-label">
                      <span>1 Min</span>
                      <span>1 Hour</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Danger Zone & Visuals */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            <div className="bg-surface p-8 rounded-3xl border border-error/10 bg-gradient-to-b from-error/5 to-transparent flex-1">
              <div className="flex items-center gap-3 mb-8">
                <AlertTriangle className="text-error w-5 h-5" />
                <h2 className="text-xl font-headline font-bold text-error">
                  Danger Zone
                </h2>
              </div>
              <div className="space-y-10">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-headline font-bold text-primary">
                      Revoke Identity
                    </p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Permanently blacklist a nullifier from the protocol.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <input
                      className="w-full bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-mono outline-none text-primary placeholder:text-on-surface-variant/30"
                      placeholder="Identity Nullifier Hash"
                      type="text"
                    />
                    <select className="w-full bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-label outline-none text-on-surface-variant appearance-none cursor-pointer">
                      <option>Select Reason</option>
                      <option>Key Compromise</option>
                      <option>CA Revocation</option>
                      <option>Malicious Activity</option>
                    </select>
                    <button
                      className="w-full py-3 border border-error/40 text-error hover:bg-error/10 transition-all font-bold text-xs rounded-xl uppercase tracking-widest disabled:opacity-50"
                      disabled
                    >
                      Commit Revocation
                    </button>
                  </div>
                </div>

                <div className="pt-10 border-t border-outline-variant/10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-headline font-bold text-primary">
                        Emergency Pause
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">
                        Halt all verification proofs.
                      </p>
                    </div>
                    <button
                      onClick={() => setIsPaused(!isPaused)}
                      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none ${isPaused ? "bg-error" : "bg-surface-highest"}`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isPaused ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>
                  <div className="p-4 bg-error/10 rounded-2xl border border-error/20">
                    <p className="text-[10px] text-error leading-relaxed font-medium">
                      <strong>ATTENTION:</strong> Pausing the contract will
                      freeze all user activities immediately. Only the DAO or
                      emergency multi-sig can resume operations.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Accent Card */}
            <div className="relative group h-48 rounded-3xl overflow-hidden border border-outline-variant/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBFYS16YTYLcKy_1HSu87kHyrRUf3D7A3z4bXsJ_WIgYry0bjCjajNurHZL0SJNyd6NGD57MfPRJSYAGUV6sPKDxxUum7ygo1f9itOkeeZgims4mFP6ZxPMuLyX9GOhGk3Pp8FZRbiaVgio42VfSA2vsKLnK_qbBVFa433xcwWdhOKh30rKmMnouLXq4rki7N5MwLNa5J1W8gwZTSduV8bJQqMmte3IRtx1TWPwHn2QoY4n-RZslAL9w9UCYTt15m4N45M6uyGhvKU"
                alt="Cryptographic Visualization"
                className="w-full h-full object-cover grayscale opacity-30 group-hover:grayscale-0 group-hover:opacity-50 transition-all duration-1000 scale-110 group-hover:scale-100"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
              <div className="absolute bottom-4 left-6">
                <p className="text-xs font-mono text-tertiary">
                  ZK-PROOF_ENGINE_v4
                </p>
                <p className="text-[10px] text-on-surface-variant">
                  Substrate Node #0012
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Feed */}
        <div className="bg-surface rounded-3xl p-8 border border-outline-variant/10">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-primary" />
              <h4 className="font-headline font-bold text-lg">
                Real-time Verification Feed
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${isPaused ? "bg-error" : "bg-secondary animate-pulse"}`}
              />
              <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
                {isPaused ? "FEED_PAUSED" : "WS_CONNECTED"}
              </span>
            </div>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto no-scrollbar">
            <AnimatePresence initial={false}>
              {feed.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-6 text-xs font-mono py-3 border-b border-outline-variant/5 hover:bg-surface-high/30 px-4 rounded-lg transition-colors group"
                >
                  <span
                    className={
                      item.status === "OK" ? "text-secondary" : "text-tertiary"
                    }
                  >
                    [{item.status}]
                  </span>
                  <span className="text-on-surface-variant w-32">
                    {item.timestamp}
                  </span>
                  <span className="text-primary flex-1">{item.message}</span>
                  <span className="text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.latency}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 p-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-label text-on-surface-variant">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3 h-3" />
          <span>&copy; 2024 ZK-X509 PROTOCOL FOUNDATION</span>
        </div>
        <div className="flex gap-8">
          <a href="#" className="hover:text-primary transition-colors">
            PRIVACY POLICY
          </a>
          <a href="#" className="hover:text-primary transition-colors">
            TERMS OF SERVICE
          </a>
          <a href="#" className="hover:text-primary transition-colors">
            GITHUB SOURCE
          </a>
        </div>
      </footer>
    </main>
  );
}
