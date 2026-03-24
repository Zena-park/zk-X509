"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck,
  EyeOff,
  Lock,
  Network,
  Cpu,
  FileCheck,
  ArrowRight,
  Globe,
  Fingerprint,
  Database,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">
      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-screen flex items-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-tertiary/3 via-secondary/2 to-transparent" />
        <motion.div
          animate={{ x: [0, 60, 0], y: [0, -40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-tertiary/5 rounded-full blur-[150px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 50, 0], scale: [1, 1.3, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-40 right-1/5 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[130px]"
        />
        <motion.div
          animate={{ x: [0, 30, 0], y: [0, -60, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 left-1/3 w-[300px] h-[300px] bg-tertiary/3 rounded-full blur-[100px]"
        />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: "linear-gradient(rgba(140,231,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(140,231,255,0.2) 1px, transparent 1px)",
          backgroundSize: "60px 60px"
        }} />
        {/* Large Lock icon background */}
        <div className="absolute right-[5%] top-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
          <Lock className="w-[500px] h-[500px]" />
        </div>

        <div className="relative max-w-5xl mx-auto px-8 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface-container rounded-full border border-outline-variant/20 mb-8">
              <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
              <span className="text-xs font-label text-on-surface-variant uppercase tracking-widest">
                Zero-Knowledge Identity Protocol
              </span>
            </div>

            <h1 className="text-6xl md:text-8xl font-headline font-bold tracking-tighter text-primary leading-[0.9] mb-8">
              Verify without
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-tertiary to-secondary">
                Revealing.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-on-surface-variant max-w-xl mx-auto leading-relaxed mb-12">
              On-chain identity verification powered by ZK proofs and X.509 certificates. Your data stays yours.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/dashboard"
                className="px-10 py-4 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 text-lg"
              >
                Get Started <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="/faq"
                className="px-10 py-4 border border-outline-variant/30 text-on-surface font-headline rounded-full hover:bg-surface-container-highest transition-all text-lg"
              >
                Learn More
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-headline font-bold text-primary mb-4">
            How It Works
          </h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">
            Three steps to verified on-chain identity.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              icon: FileCheck,
              title: "Generate Proof",
              desc: "Create a ZK proof locally using your X.509 certificate and private key. Your private key never leaves your machine.",
              color: "tertiary",
            },
            {
              step: "02",
              icon: Lock,
              title: "On-Chain Verification",
              desc: "Submit the Groth16 proof to the smart contract. The contract mathematically verifies the proof's validity.",
              color: "secondary",
            },
            {
              step: "03",
              icon: ShieldCheck,
              title: "Identity Registered",
              desc: "Upon verification, your wallet address is certified. Other DApps can query isVerified() to check your status.",
              color: "tertiary",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="glass-panel rounded-3xl p-8 relative group"
            >
              <span className={`text-6xl font-headline font-bold text-${item.color}/10 absolute top-4 right-6`}>
                {item.step}
              </span>
              <div className={`p-3 bg-${item.color}/10 rounded-xl w-fit mb-6`}>
                <item.icon className={`w-6 h-6 text-${item.color}`} />
              </div>
              <h3 className="text-xl font-headline font-bold text-primary mb-3">{item.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Key Features */}
      <section className="max-w-6xl mx-auto px-8 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-headline font-bold text-primary mb-4">
            Key Features
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: EyeOff,
              title: "Privacy First",
              desc: "No personal data touches the blockchain. Only a nullifier hash is stored on-chain for Sybil resistance.",
            },
            {
              icon: Fingerprint,
              title: "Selective Disclosure",
              desc: "Choose which certificate fields to reveal — country, organization, or name. Everything else stays hidden.",
            },
            {
              icon: Network,
              title: "CA Anonymity",
              desc: "Merkle Tree proves your CA is in the trusted set without revealing which specific CA issued your certificate.",
            },
            {
              icon: Globe,
              title: "Multi-Chain",
              desc: "Independent nullifiers per chain make cross-chain tracking impossible. Deploy on any EVM-compatible network.",
            },
            {
              icon: Database,
              title: "Auto-Expiry",
              desc: "Certificate expiration date is stored on-chain. Verification automatically lapses when the certificate expires.",
            },
            {
              icon: Cpu,
              title: "SP1 zkVM",
              desc: "Powered by Succinct SP1 — compile Rust programs directly into ZK proofs. 17M cycles, Groth16 on-chain verification.",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-surface-container rounded-2xl p-6 border border-outline-variant/10 hover:border-outline-variant/30 transition-all group"
            >
              <item.icon className="w-5 h-5 text-tertiary mb-4 group-hover:text-secondary transition-colors" />
              <h3 className="text-lg font-headline font-bold text-primary mb-2">{item.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Architecture Banner */}
      <section className="max-w-6xl mx-auto px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="glass-panel rounded-3xl p-12 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/80 to-transparent z-0" />
          <div className="relative z-10 max-w-xl">
            <h2 className="text-3xl font-headline font-bold text-primary mb-4">
              Architecture
            </h2>
            <div className="text-on-surface-variant leading-relaxed space-y-3 text-sm mb-8">
              <p>
                <span className="text-tertiary font-mono">zkVM Program</span> — X.509 parsing, signature verification, and Merkle proofs executed inside SP1
              </p>
              <p>
                <span className="text-secondary font-mono">Groth16 Proof</span> — Core proof compressed into ~260 bytes verifiable on EVM
              </p>
              <p>
                <span className="text-tertiary font-mono">IdentityRegistry</span> — Registration, re-registration, revocation, and CA management in one contract
              </p>
            </div>
            <div className="flex gap-4">
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
              >
                Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/admin"
                className="px-6 py-3 border border-outline-variant/30 text-on-surface font-headline rounded-full hover:bg-surface-container-highest transition-all"
              >
                Admin Console
              </Link>
            </div>
          </div>
          <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden lg:flex flex-col items-center bg-surface/40 backdrop-blur-md p-8 rounded-3xl border border-outline-variant/20">
            <div className="text-5xl font-headline font-bold text-tertiary mb-1">17M</div>
            <div className="text-[10px] text-on-surface font-label uppercase tracking-[0.2em] opacity-60 text-center">
              zkVM Cycles
            </div>
            <div className="text-3xl font-headline font-bold text-secondary mt-4 mb-1">~260B</div>
            <div className="text-[10px] text-on-surface font-label uppercase tracking-[0.2em] opacity-60 text-center">
              On-chain Proof
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-8 py-12 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-tertiary" />
          <span className="text-sm font-label">zk-X509 Protocol</span>
        </div>
        <div className="flex gap-8 text-[10px] font-label uppercase tracking-widest">
          <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
          <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
          <a href="https://github.com/tokamak-network/zk-X509" className="hover:text-primary transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
