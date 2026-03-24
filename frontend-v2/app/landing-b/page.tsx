"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  Shield,
  CheckCircle2,
  Lock,
  Cpu,
  Fingerprint,
  ExternalLink,
  Menu,
  X,
  ArrowRight,
  Award,
  Globe,
} from "lucide-react";

export default function LandingB() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#e0e4f0] selection:bg-[#22d3ee]/30">
      {/* Background Glows */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[#22d3ee]/5 blur-[120px] rounded-full -z-10" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-[#22d3ee]/3 blur-[150px] rounded-full -z-10" />

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled ? "bg-[#0b0d11]/60 backdrop-blur-xl py-4 shadow-[0_0_20px_rgba(34,211,238,0.08)]" : "bg-transparent py-6"
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <Link href="/" className="text-2xl font-black tracking-tighter text-[#22d3ee]">
            zk-X509
          </Link>
          <div className="hidden md:flex items-center gap-10 font-medium tracking-tight">
            {[
              { label: "Dashboard", href: "/dashboard" },
              { label: "Admin", href: "/admin" },
              { label: "FAQ", href: "/faq" },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="text-[#a0a4b8] hover:text-[#22d3ee] transition-colors">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hidden sm:block bg-gradient-to-br from-[#22d3ee] to-[#0891b2] text-[#0b0d11] px-6 py-2.5 rounded-lg font-bold active:scale-95 transition-transform shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              Connect Wallet
            </Link>
            <button className="md:hidden text-[#e0e4f0]" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden absolute top-full left-0 w-full bg-[#131520] border-b border-white/5 p-6 flex flex-col gap-4"
          >
            <Link href="/dashboard" className="text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
            <Link href="/admin" className="text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>Admin</Link>
            <Link href="/faq" className="text-lg font-medium" onClick={() => setMobileMenuOpen(false)}>FAQ</Link>
          </motion.div>
        )}
      </nav>

      <main className="pt-32">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-6 mb-40">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#22d3ee]/10 border border-[#22d3ee]/15">
                <span className="w-2 h-2 rounded-full bg-[#6bff8f] animate-pulse" />
                <span className="text-[#6bff8f] font-mono text-xs uppercase tracking-widest">
                  Mainnet Live: Zero-Knowledge v2.1
                </span>
              </div>

              <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9]">
                Verify without <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#22d3ee] via-[#06b6d4] to-[#6bff8f]">
                  Revealing.
                </span>
              </h1>

              <p className="text-xl text-[#a0a4b8] max-w-xl leading-relaxed">
                zk-X509 leverages advanced cryptographic ZK proofs to verify your X.509 certificate identity without exposing a single byte of your private information.
              </p>

              <div className="flex flex-wrap gap-6 pt-4">
                <Link href="/dashboard" className="bg-gradient-to-br from-[#22d3ee] to-[#0891b2] text-[#0b0d11] px-8 py-4 rounded-lg font-black text-lg shadow-[0_8px_30px_rgba(34,211,238,0.2)] hover:shadow-[0_8px_40px_rgba(34,211,238,0.4)] transition-all">
                  Launch Application
                </Link>
                <Link href="/faq" className="px-8 py-4 rounded-lg font-bold text-lg border border-[#a0a4b8]/20 hover:bg-[#1a1d2e] transition-colors">
                  Explore ZK-Proof
                </Link>
              </div>
            </motion.div>

            {/* Hero Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="bg-[#131520]/80 backdrop-blur-xl p-8 rounded-lg border border-[#a0a4b8]/10 shadow-2xl relative z-10">
                <div className="flex justify-between items-start mb-12">
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-[#22d3ee]/60 uppercase tracking-wider">Identity Hash</p>
                    <p className="font-mono text-sm">0x71C...92A4</p>
                  </div>
                  <div className="p-3 bg-[#22d3ee]/10 rounded-full">
                    <Shield className="text-[#22d3ee] w-8 h-8" />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="h-14 bg-[#0b0d11] rounded-lg flex items-center px-4 justify-between border border-[#22d3ee]/10">
                    <span className="text-xs font-mono text-[#a0a4b8]">Certificate Valid</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#22d3ee] font-mono">VERIFIED</span>
                      <CheckCircle2 className="w-4 h-4 text-[#22d3ee]" />
                    </div>
                  </div>

                  <div className="h-14 bg-[#0b0d11] rounded-lg flex items-center px-4 justify-between border border-[#22d3ee]/10">
                    <span className="text-xs font-mono text-[#a0a4b8]">CA: Trusted Set</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#22d3ee] font-mono">VERIFIED</span>
                      <CheckCircle2 className="w-4 h-4 text-[#22d3ee]" />
                    </div>
                  </div>

                  <div className="h-14 bg-[#0b0d11] rounded-lg flex items-center px-4 justify-between border border-[#a0a4b8]/10 opacity-50">
                    <span className="text-xs font-mono text-[#a0a4b8]">Personal Data</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#a0a4b8] font-mono">HIDDEN</span>
                      <Lock className="w-4 h-4 text-[#a0a4b8]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#6bff8f] blur-3xl opacity-20 rounded-full" />
              <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-[#22d3ee] blur-3xl opacity-20 rounded-full" />
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="bg-[#0f1118] py-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-24 space-y-4">
              <h2 className="font-mono text-[#6bff8f] tracking-[0.4em] uppercase text-sm">The Digital Sanctuary</h2>
              <p className="text-4xl md:text-5xl font-black tracking-tight">Architected for Anonymity</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "CertifiGate",
                  desc: "Leverage standard X.509 certificates to bridge institutional identity with the decentralized web without leaking metadata.",
                  icon: Award,
                  status: "Protocol Active",
                },
                {
                  title: "Zero-Knowledge Shield",
                  desc: "Mathematical certainty that no PII ever leaves your local enclave. You only share the cryptographic proof — never your data.",
                  icon: Shield,
                  status: "Proof Generated",
                },
                {
                  title: "EVM Native",
                  desc: "Plug-and-play for smart contracts. Verify users across Ethereum, Arbitrum, and any EVM chain with isVerified().",
                  icon: Cpu,
                  status: "L2 Compatible",
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -10 }}
                  className="bg-[#131520]/80 backdrop-blur-xl p-10 rounded-lg border border-[#a0a4b8]/5 hover:border-[#22d3ee]/20 transition-all duration-500 group"
                >
                  <div className="w-14 h-14 rounded-lg bg-[#0b0d11] flex items-center justify-center mb-8 shadow-inner">
                    <feature.icon className="w-8 h-8 text-[#22d3ee]" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-[#a0a4b8] leading-relaxed">{feature.desc}</p>
                  <div className="mt-8 pt-6 border-t border-[#a0a4b8]/10 flex items-center gap-2">
                    <span className="text-xs font-mono text-[#22d3ee]">{feature.status}</span>
                    <div className="flex-1 h-px bg-[#a0a4b8]/20" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="py-40">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-16">
              <div className="text-center md:text-left">
                <h3 className="text-[#a0a4b8] font-mono uppercase tracking-widest text-xs mb-2">Network Resilience</h3>
                <div className="text-7xl md:text-8xl font-black text-[#22d3ee] drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">Zero</div>
                <p className="text-2xl font-bold mt-2">Compromises</p>
              </div>
              <div className="w-px h-32 bg-[#a0a4b8]/20 hidden md:block" />
              <div className="text-center md:text-left">
                <h3 className="text-[#a0a4b8] font-mono uppercase tracking-widest text-xs mb-2">Privacy Guarantee</h3>
                <div className="text-7xl md:text-8xl font-black text-[#6bff8f] drop-shadow-[0_0_15px_rgba(107,255,143,0.4)]">100%</div>
                <p className="text-2xl font-bold mt-2">Privacy</p>
              </div>
              <div className="w-px h-32 bg-[#a0a4b8]/20 hidden md:block" />
              <div className="text-center md:text-left">
                <h3 className="text-[#a0a4b8] font-mono uppercase tracking-widest text-xs mb-2">Proof Size</h3>
                <div className="text-7xl md:text-8xl font-black">~260B</div>
                <p className="text-2xl font-bold mt-2">On-Chain</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-6 pb-32">
          <div className="max-w-6xl mx-auto rounded-xl bg-gradient-to-br from-[#1a1d2e] to-[#0b0d11] p-12 md:p-24 relative overflow-hidden border border-[#a0a4b8]/10">
            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[#22d3ee]/10 blur-[100px] -mr-40 -mt-40" />
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-5xl md:text-6xl font-black tracking-tighter mb-8">
                Secure your sovereignty today.
              </h2>
              <p className="text-xl text-[#a0a4b8] mb-12">
                Prove your identity without revealing it. Zero-knowledge X.509 certificate verification for the decentralized world.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/dashboard" className="bg-[#22d3ee] text-[#0b0d11] px-10 py-5 rounded-lg font-black text-xl hover:scale-105 transition-transform flex items-center justify-center gap-2">
                  Join Now <ArrowRight className="w-6 h-6" />
                </Link>
                <Link href="/faq" className="px-10 py-5 rounded-lg font-bold text-xl border border-[#a0a4b8]/30 hover:bg-[#1a1d2e] transition-colors">
                  Read Documentation
                </Link>
              </div>
            </div>
            <div className="absolute bottom-12 right-12 opacity-10 hidden lg:block">
              <Fingerprint className="w-[200px] h-[200px] text-[#22d3ee]" />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#080a0e] py-16 px-6 border-t border-[#a0a4b8]/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex flex-col items-center md:items-start gap-4">
            <div className="text-2xl font-black tracking-tighter text-[#22d3ee]">zk-X509</div>
            <p className="font-mono text-[10px] tracking-widest uppercase text-[#a0a4b8]">
              The Digital Sanctuary for Identity.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 font-mono text-[10px] tracking-widest uppercase">
            {[
              { label: "Dashboard", href: "/dashboard" },
              { label: "FAQ", href: "/faq" },
              { label: "Admin", href: "/admin" },
              { label: "GitHub", href: "https://github.com/tokamak-network/zk-X509" },
            ].map((link) => (
              <Link key={link.label} href={link.href} className="text-[#a0a4b8] hover:text-[#22d3ee] transition-colors flex items-center gap-1">
                {link.label} <ExternalLink className="w-3 h-3" />
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
