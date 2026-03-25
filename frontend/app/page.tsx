"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ethers } from "ethers";
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
  Plus,
  Loader2,
  Users,
} from "lucide-react";
import {
  REGISTRY_FACTORY_ABI,
  IDENTITY_REGISTRY_ABI,
  getFactoryAddress,
  getRpcUrl,
} from "@/lib/contract";
import { truncateHex } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";
import { getRegistryMetadata, type RegistryMetadata } from "@/lib/platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RegistryCard {
  address: string;
  name: string;
  maxWallets: number;
  minDisclosureMask: number;
  caCount: number;
  metadata?: RegistryMetadata | null;
}

const DISCLOSURE_LABELS = ["C", "O", "OU", "CN"] as const;

function decodeMaskShort(mask: number): string {
  const fields: string[] = [];
  for (let i = 0; i < DISCLOSURE_LABELS.length; i++) {
    if (mask & (1 << i)) fields.push(DISCLOSURE_LABELS[i]);
  }
  return fields.length > 0 ? fields.join(", ") : "None";
}

/* ------------------------------------------------------------------ */
/*  Platform Section Component                                         */
/* ------------------------------------------------------------------ */

function PlatformSection() {
  const { chainId } = useWallet();
  const [registries, setRegistries] = useState<RegistryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cid = chainId || "31337";
        const factoryAddr = getFactoryAddress(cid);
        if (!factoryAddr) {
          setLoading(false);
          return;
        }

        const provider = new ethers.JsonRpcProvider(getRpcUrl());
        const factory = new ethers.Contract(factoryAddr, REGISTRY_FACTORY_ABI, provider);

        let addresses: string[];
        try {
          addresses = await factory.getRegistries();
        } catch {
          // Factory not deployed or no registries
          setLoading(false);
          return;
        }

        const cards: RegistryCard[] = [];
        for (const addr of addresses) {
          try {
            const [infoResult, registry, meta] = await Promise.all([
              factory.registryInfo(addr),
              new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, provider),
              getRegistryMetadata(addr),
            ]);
            const caCount = await registry.getCaCount();
            cards.push({
              address: addr,
              name: infoResult.name || infoResult[1] || "Unnamed",
              maxWallets: Number(infoResult.maxWallets ?? infoResult[2]),
              minDisclosureMask: Number(infoResult.minDisclosureMask ?? infoResult[3]),
              caCount: Number(caCount),
              metadata: meta,
            });
          } catch (e) {
            console.error(`Failed to load registry ${addr}:`, e);
          }
        }

        setRegistries(cards);
      } catch (e) {
        console.error("Failed to load registries:", e);
        setError("Failed to load registry directory.");
      } finally {
        setLoading(false);
      }
    })();
  }, [chainId]);

  return (
    <section className="max-w-6xl mx-auto px-8 py-20">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl md:text-4xl font-headline font-bold text-primary mb-4">
          Registry Directory
        </h2>
        <p className="text-on-surface-variant max-w-xl mx-auto mb-8">
          Browse deployed identity registries or create your own.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-8 py-3 bg-tertiary/10 text-tertiary border border-tertiary/20 font-headline font-bold rounded-full hover:bg-tertiary/20 transition-all"
        >
          <Plus className="w-5 h-5" />
          Create New Registry
        </Link>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-tertiary animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-on-surface-variant text-sm">{error}</p>
        </div>
      ) : registries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-on-surface-variant text-sm">No registries deployed yet. Be the first!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {registries.map((reg, i) => (
            <motion.div
              key={reg.address}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <Link
                href={`/registry/${reg.address}`}
                className="block bg-surface-container rounded-2xl p-6 border border-outline-variant/10 hover:border-outline-variant/30 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-headline font-bold text-primary group-hover:text-tertiary transition-colors truncate">
                    {reg.name}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0 mt-1">
                    {reg.metadata?.category && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-label font-bold uppercase tracking-wider bg-tertiary/10 text-tertiary border border-tertiary/20">
                        {reg.metadata.category}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4 text-on-surface-variant group-hover:text-tertiary transition-colors" />
                  </div>
                </div>

                {reg.metadata?.description && (
                  <p className="text-on-surface-variant text-xs mb-3 line-clamp-2 leading-relaxed">
                    {reg.metadata.description.length > 100
                      ? reg.metadata.description.slice(0, 100) + "..."
                      : reg.metadata.description}
                  </p>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant text-xs">Address</span>
                    <span className="font-mono text-xs text-tertiary">{truncateHex(reg.address)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant text-xs flex items-center gap-1">
                      <Users className="w-3 h-3" /> Max Wallets
                    </span>
                    <span className="text-sm font-headline font-bold text-on-surface">{reg.maxWallets}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant text-xs flex items-center gap-1">
                      <Fingerprint className="w-3 h-3" /> Disclosure
                    </span>
                    <span className="text-xs font-mono text-on-surface">{decodeMaskShort(reg.minDisclosureMask)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant text-xs flex items-center gap-1">
                      <Database className="w-3 h-3" /> Trusted CAs
                    </span>
                    <span className="text-sm font-headline font-bold text-on-surface">{reg.caCount}</span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/*  Landing Page                                                       */
/* ================================================================== */

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

        {/* Floating particles */}
        {[
          { x: "10%", y: "20%", size: 3, delay: 0, dur: 12, color: "tertiary" },
          { x: "85%", y: "30%", size: 2, delay: 2, dur: 15, color: "secondary" },
          { x: "70%", y: "70%", size: 4, delay: 1, dur: 18, color: "tertiary" },
          { x: "20%", y: "75%", size: 2, delay: 3, dur: 14, color: "secondary" },
          { x: "50%", y: "15%", size: 3, delay: 4, dur: 16, color: "tertiary" },
          { x: "90%", y: "60%", size: 2, delay: 0.5, dur: 13, color: "tertiary" },
          { x: "30%", y: "50%", size: 3, delay: 2.5, dur: 17, color: "secondary" },
          { x: "60%", y: "85%", size: 2, delay: 1.5, dur: 11, color: "tertiary" },
        ].map((p, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full bg-${p.color} pointer-events-none`}
            style={{ left: p.x, top: p.y, width: p.size, height: p.size }}
            animate={{
              y: [0, -30, 0, 20, 0],
              x: [0, 15, -10, 5, 0],
              opacity: [0.2, 0.6, 0.3, 0.5, 0.2],
            }}
            transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          />
        ))}

        {/* Floating rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          className="absolute right-[10%] top-[30%] w-48 h-48 border border-tertiary/5 rounded-full pointer-events-none"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
          className="absolute left-[15%] bottom-[25%] w-32 h-32 border border-secondary/5 rounded-full pointer-events-none"
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          className="absolute right-[20%] bottom-[15%] w-64 h-64 border border-tertiary/3 rounded-full pointer-events-none"
        />

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

      {/* Platform: Registry Directory */}
      <PlatformSection />

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
          <span className="text-sm font-label">Developed by Tokamak Network</span>
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
