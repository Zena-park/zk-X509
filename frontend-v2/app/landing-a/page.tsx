"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck,
  Fingerprint,
  Network,
  ArrowRight,
  Terminal,
  FileText,
  Globe,
  Lock,
} from "lucide-react";

export default function LandingA() {
  return (
    <div className="min-h-screen bg-[#0b1326] text-[#dae2fd] selection:bg-[#3cd7ff]/30">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-gradient-to-b from-[#0b1326] to-transparent">
        <div className="flex justify-between items-center px-6 md:px-12 py-6 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-extrabold tracking-tighter text-[#3cd7ff] font-headline">
            zk-X509
          </div>
          <div className="hidden md:flex items-center gap-10 font-headline tracking-tight text-[#c4c6ce]">
            <Link href="/" className="text-[#3cd7ff] font-bold border-b-2 border-[#3cd7ff] pb-1">Home</Link>
            <Link href="/dashboard" className="hover:text-[#3cd7ff] transition-colors">Dashboard</Link>
            <Link href="/admin" className="hover:text-[#3cd7ff] transition-colors">Admin</Link>
            <Link href="/faq" className="hover:text-[#3cd7ff] transition-colors">FAQ</Link>
          </div>
          <Link href="/dashboard" className="bg-gradient-to-br from-[#3cd7ff] to-[#0098b7] text-[#0b1326] font-bold px-6 py-2.5 rounded-md active:scale-95 duration-200 shadow-[0_0_20px_rgba(60,215,255,0.2)]">
            Launch App
          </Link>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 px-6 md:px-12 overflow-hidden min-h-screen flex items-center">
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-[#3cd7ff]/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] bg-[#3cd7ff]/5 blur-[150px] rounded-full" />

          <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="relative z-10"
            >
              <span className="inline-block px-4 py-1.5 mb-6 rounded-full bg-[#3cd7ff]/10 border border-[#3cd7ff]/20 text-[#3cd7ff] text-xs font-bold tracking-widest uppercase">
                Zero Knowledge Identity Protocol
              </span>
              <h1 className="font-headline text-6xl md:text-8xl font-extrabold tracking-tighter mb-8 leading-[0.9] bg-clip-text text-transparent bg-gradient-to-r from-[#3cd7ff] to-white">
                Verify <br /> without <br /> Revealing
              </h1>
              <p className="text-lg md:text-xl text-[#c4c6ce] max-w-xl mb-12 leading-relaxed">
                Use your X.509 certificates to prove your identity on-chain without exposing personal data, powered by Zero-Knowledge Proofs.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <Link href="/dashboard" className="bg-gradient-to-br from-[#3cd7ff] to-[#0098b7] text-[#0b1326] font-bold px-10 py-5 rounded-md text-lg active:scale-95 transition-all shadow-[0_0_30px_rgba(60,215,255,0.3)]">
                  Start Proof Generation
                </Link>
                <Link href="/faq" className="text-[#3cd7ff] font-semibold flex items-center gap-2 hover:translate-x-1 transition-transform group">
                  Explore Documentation
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1 }}
              className="relative"
            >
              <div className="bg-[#2d3449]/40 backdrop-blur-xl border border-white/5 p-4 md:p-8 rounded-2xl shadow-2xl relative z-10">
                <div className="aspect-square w-full bg-[#060e20] rounded-xl border border-white/5 overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3cd7ff]/5 via-transparent to-[#0098b7]/5" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ShieldCheck className="w-32 h-32 text-[#3cd7ff]/10" />
                  </div>
                  <div className="absolute top-6 left-6 bg-[#2d3449]/40 backdrop-blur-xl border border-[#3cd7ff]/20 p-4 rounded-lg animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#3cd7ff] shadow-[0_0_10px_#3cd7ff]" />
                      <span className="text-[10px] font-mono text-[#3cd7ff] tracking-widest">ENCRYPTING_X509...</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -top-10 -right-10 w-64 h-64 border-r border-t border-[#3cd7ff]/10 -z-0" />
              <div className="absolute -bottom-10 -left-10 w-64 h-64 border-l border-b border-[#3cd7ff]/10 -z-0" />
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="py-32 px-6 md:px-12 bg-[#131b2e]">
          <div className="max-w-screen-2xl mx-auto">
            <div className="mb-20">
              <h2 className="font-headline text-4xl font-bold tracking-tight mb-4 text-[#dae2fd]">Architectural Security</h2>
              <div className="w-24 h-1 bg-[#3cd7ff]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: "Trust the Certificate",
                  desc: "Leverage the existing global X.509 infrastructure. Convert standard digital identities into privacy-preserving cryptographic proofs.",
                  icon: ShieldCheck,
                },
                {
                  title: "Zero-Knowledge Privacy",
                  desc: "Your sensitive personal data never leaves your device. Only the proof of validity is shared, keeping your PII entirely private.",
                  icon: Lock,
                },
                {
                  title: "On-Chain Proof",
                  desc: "Compatible with all EVM chains. Generate a proof once and use it to access gated DeFi, DAOs, or cross-chain services.",
                  icon: Network,
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -10 }}
                  className="group bg-[#171f33] p-10 rounded-xl border-l-4 border-transparent hover:border-[#3cd7ff] transition-all duration-300 hover:bg-[#222a3d] shadow-xl"
                >
                  <div className="mb-8 flex items-center justify-center w-16 h-16 rounded-lg bg-[#3cd7ff]/5 text-[#3cd7ff]">
                    <feature.icon className="w-8 h-8" />
                  </div>
                  <h3 className="font-headline text-2xl font-bold mb-4">{feature.title}</h3>
                  <p className="text-[#c4c6ce] leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="py-40 px-6 md:px-12 relative overflow-hidden">
          <div className="max-w-screen-2xl mx-auto relative z-10 flex flex-col md:flex-row justify-around items-center gap-20">
            <div className="text-center group">
              <div className="text-[120px] font-headline font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#3cd7ff] to-[#2d3449] mb-4 group-hover:scale-105 transition-transform duration-500">
                0
              </div>
              <p className="font-headline text-3xl font-bold tracking-tight">Data Leaks</p>
              <p className="text-[#c4c6ce] mt-2 max-w-xs mx-auto">Absolute mathematical certainty through local execution.</p>
            </div>
            <div className="w-px h-32 bg-[#43474d]/20 hidden md:block" />
            <div className="text-center group">
              <div className="text-[120px] font-headline font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#3cd7ff] to-[#2d3449] mb-4 group-hover:scale-105 transition-transform duration-500">
                100%
              </div>
              <p className="font-headline text-3xl font-bold tracking-tight">Anonymous</p>
              <p className="text-[#c4c6ce] mt-2 max-w-xs mx-auto">Your identity is cryptographically shielded from all peers.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="pb-32 px-6 md:px-12">
          <div className="max-w-screen-2xl mx-auto bg-[#2d3449]/40 backdrop-blur-xl border border-white/5 p-12 md:p-20 rounded-3xl border-[#3cd7ff]/10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#3cd7ff]/5 rounded-full blur-3xl -mr-32 -mt-32" />
            <h2 className="font-headline text-4xl md:text-5xl font-bold mb-8">Ready to secure your autonomy?</h2>
            <p className="text-[#c4c6ce] text-lg md:text-xl mb-12 max-w-2xl mx-auto">Join the new standard of decentralized identity. Fast, secure, and entirely yours.</p>
            <div className="flex flex-wrap justify-center gap-6">
              <Link href="/dashboard" className="bg-gradient-to-br from-[#3cd7ff] to-[#0098b7] text-[#0b1326] font-bold px-12 py-5 rounded-md text-lg active:scale-95 transition-all">
                Launch Application
              </Link>
              <Link href="/faq" className="bg-[#2d3449] text-[#3cd7ff] font-bold px-12 py-5 rounded-md text-lg active:scale-95 transition-all border border-[#3cd7ff]/20">
                Read Documentation
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#060e20] w-full py-16 px-6 md:px-12 border-t border-[#43474d]/15">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start">
            <div className="text-lg font-black text-[#3cd7ff] mb-2 font-headline uppercase tracking-widest">zk-X509</div>
            <div className="text-sm tracking-wide text-[#c4c6ce]">Engineered for Privacy.</div>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-sm tracking-wide text-[#c4c6ce]">
            <Link href="/faq" className="hover:text-[#3cd7ff] transition-colors">FAQ</Link>
            <Link href="/admin" className="hover:text-[#3cd7ff] transition-colors">Admin</Link>
            <a href="https://github.com/tokamak-network/zk-X509" className="hover:text-[#3cd7ff] transition-colors">GitHub</a>
          </div>
          <div className="flex gap-6 text-[#c4c6ce]">
            <Terminal className="w-5 h-5 hover:text-[#3cd7ff] cursor-pointer transition-colors" />
            <FileText className="w-5 h-5 hover:text-[#3cd7ff] cursor-pointer transition-colors" />
            <Globe className="w-5 h-5 hover:text-[#3cd7ff] cursor-pointer transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
}
