"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Wallet,
  Send,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <main className="md:ml-64 pt-28 px-8 pb-12">
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <h1 className="text-4xl md:text-5xl font-headline font-bold tracking-tight text-primary mb-2">
          Network Overview
        </h1>
        <p className="text-on-surface-variant max-w-2xl">
          Cryptographic identity management for secure X.509 certificate
          validation using zero-knowledge architecture.
        </p>
      </motion.header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Identity Verified Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-4 glass-panel rounded-3xl p-6 flex flex-col justify-between group overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-secondary/10 transition-colors" />
          <div className="flex justify-between items-start mb-8">
            <div className="p-3 bg-secondary/10 rounded-xl">
              <ShieldCheck className="w-8 h-8 text-secondary" />
            </div>
            <span className="text-secondary font-label text-xs font-bold tracking-widest uppercase bg-secondary/10 px-3 py-1 rounded-full">
              Active
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-headline font-bold text-on-surface mb-1">
              Identity Verified
            </h2>
            <p className="text-on-surface-variant text-sm">
              Last validated: 2h 14m ago
            </p>
          </div>
        </motion.div>

        {/* Account Metadata Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-8 glass-panel rounded-3xl p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-headline font-bold text-on-surface">
              Account Metadata
            </h2>
            <Wallet className="w-5 h-5 text-on-surface-variant" />
          </div>
          <div className="space-y-4">
            <div className="bg-surface-container-low/50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-on-surface-variant text-sm">
                Primary Wallet
              </span>
              <code className="font-mono text-tertiary bg-tertiary/5 px-3 py-1 rounded border border-tertiary/10">
                0xf39f...2266
              </code>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container-low/50 rounded-xl p-4">
                <p className="text-on-surface-variant text-[10px] uppercase tracking-tighter mb-1">
                  Nodes Connected
                </p>
                <p className="text-xl font-headline font-bold text-primary">
                  12 / 12
                </p>
              </div>
              <div className="bg-surface-container-low/50 rounded-xl p-4">
                <p className="text-on-surface-variant text-[10px] uppercase tracking-tighter mb-1">
                  Trust Score
                </p>
                <p className="text-xl font-headline font-bold text-secondary">
                  99.8%
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Submit New Proof Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="md:col-span-8 glass-panel rounded-3xl p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface">
                Submit New Proof
              </h2>
              <p className="text-on-surface-variant text-sm">
                Generate and submit a zero-knowledge proof to the registry.
              </p>
            </div>
            <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-start">
              <button className="px-6 py-2 bg-surface-container-highest text-primary font-headline text-sm rounded-full shadow-sm">
                Register
              </button>
              <button className="px-6 py-2 text-on-surface-variant font-headline text-sm rounded-full hover:text-primary transition-colors">
                Re-Register
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest px-1">
                Proof Hex Data
              </label>
              <div className="relative">
                <textarea
                  className="w-full h-24 bg-surface-container-low border border-outline-variant/20 rounded-xl p-4 font-mono text-sm text-tertiary focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition-all outline-none resize-none"
                  placeholder="0x4a9d7b..."
                  defaultValue="0x4a9d7b..."
                />
                <button className="absolute right-4 bottom-4 text-outline-variant hover:text-tertiary transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest px-1">
                Public Values
              </label>
              <input
                className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl p-4 font-mono text-sm text-tertiary focus:ring-2 focus:ring-tertiary/20 focus:border-tertiary/40 transition-all outline-none"
                placeholder="0x0000..."
                defaultValue="0x0000000000000000000000000000000000000000000000000000000000000001"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-4 pt-4">
            <button className="text-on-surface-variant hover:text-primary font-headline text-sm transition-colors">
              Discard Draft
            </button>
            <button className="px-10 py-4 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
              Submit Proof <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Live Status Tracker */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="md:col-span-4"
        >
          <div className="glass-panel rounded-3xl p-6 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-headline font-bold text-on-surface">
                  Live Status
                </h2>
                <div className="flex gap-1">
                  <span className="w-1 h-4 bg-tertiary/40 rounded-full" />
                  <span className="w-1 h-4 bg-tertiary/40 rounded-full" />
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-1 h-4 bg-tertiary rounded-full"
                  />
                </div>
              </div>
              <div className="space-y-8 relative">
                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-outline-variant/20" />

                <div className="relative flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center z-10">
                    <Check className="w-4 h-4 text-surface" />
                  </div>
                  <div>
                    <p className="text-sm font-headline font-bold text-primary">
                      Connection established
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Validated by node cluster-A
                    </p>
                  </div>
                </div>

                <div className="relative flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-tertiary/20 border-2 border-tertiary flex items-center justify-center z-10">
                    <motion.div
                      animate={{ scale: [0.8, 1.2, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-2 h-2 rounded-full bg-tertiary"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-headline font-bold text-tertiary">
                      Waiting for Signature
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Step 1 of 3 Processing...
                    </p>
                  </div>
                </div>

                <div className="relative flex items-center gap-4 opacity-40">
                  <div className="w-8 h-8 rounded-full bg-surface-container border-2 border-outline-variant/20 flex items-center justify-center z-10">
                    <span className="text-[10px] font-bold">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-headline font-bold text-on-surface">
                      Merkle Tree Update
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Pending completion
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-outline-variant/10">
              <div className="flex justify-between items-center text-xs font-mono text-on-surface-variant">
                <span>TX_HASH</span>
                <span className="text-tertiary">0x88c2...d91e</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Architecture Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="md:col-span-12 glass-panel rounded-3xl p-1 border-none relative overflow-hidden group"
        >
          <div
            className="absolute inset-0 z-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(14,14,16,0.95), rgba(14,14,16,0.6)), url('https://picsum.photos/seed/cryptography/1200/400?blur=2')`,
            }}
          />
          <div className="relative z-10 p-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="text-3xl font-headline font-bold text-primary mb-4">
                About zk-X509 Architecture
              </h2>
              <p className="text-on-surface-variant leading-relaxed mb-6">
                Our protocol leverages SNARK-based recursion to prove the
                validity of standard X.509 certificates without revealing
                sensitive subject metadata. By mapping traditional PKI into
                Merkleized state, we ensure that every verification is instant,
                private, and cryptographically sound.
              </p>
              <div className="flex gap-4">
                <button className="px-6 py-2 border border-outline-variant/30 text-on-surface font-headline text-sm rounded-full hover:bg-surface-container-highest transition-all">
                  Whitepaper
                </button>
                <button className="px-6 py-2 border border-outline-variant/30 text-on-surface font-headline text-sm rounded-full hover:bg-surface-container-highest transition-all">
                  Audit Report
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center bg-surface/40 backdrop-blur-md p-8 rounded-3xl border border-outline-variant/20">
              <div className="text-5xl font-headline font-bold text-tertiary mb-1">
                0.03s
              </div>
              <div className="text-[10px] text-on-surface font-label uppercase tracking-[0.2em] opacity-60 text-center">
                Verification Latency
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="mt-20 pt-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant">
        <p className="text-sm font-label">
          &copy; 2024 ZK-X509 Foundation. All rights reserved.
        </p>
        <div className="flex gap-8 text-[10px] font-label uppercase tracking-widest">
          <a className="hover:text-primary transition-colors" href="#">
            Privacy Policy
          </a>
          <a className="hover:text-primary transition-colors" href="#">
            Node Operator Terms
          </a>
          <a className="hover:text-primary transition-colors" href="#">
            System Status
          </a>
        </div>
      </footer>
    </main>
  );
}
