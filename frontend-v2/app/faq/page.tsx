"use client";

import { useState } from "react";
import {
  HelpCircle,
  ChevronUp,
  ChevronDown,
  Mail,
  ArrowRight,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function FAQItem({
  question,
  answer,
  defaultOpen = false,
}: {
  question: string;
  answer: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-surface-container rounded-xl border border-white/5 overflow-hidden transition-all hover:border-tertiary/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-6 flex items-start justify-between text-left"
      >
        <div className="flex gap-4">
          <HelpCircle
            className={`w-5 h-5 mt-1 ${isOpen ? "text-tertiary" : "text-on-surface-variant"}`}
          />
          <div>
            <h3
              className={`text-lg font-headline font-medium mb-2 ${isOpen ? "text-white" : "text-slate-100"}`}
            >
              {question}
            </h3>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="text-on-surface-variant font-body leading-relaxed text-sm"
                >
                  {answer}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-on-surface-variant" />
        ) : (
          <ChevronDown className="w-5 h-5 text-on-surface-variant" />
        )}
      </button>
    </div>
  );
}

export default function FAQPage() {
  return (
    <>
      <main className="md:ml-64 pt-20 p-12">
        <header className="mb-16">
          <h1 className="text-6xl font-headline font-bold tracking-tighter mb-4">
            Knowledge Base
          </h1>
          <p className="text-on-surface-variant text-lg max-w-2xl font-body leading-relaxed">
            Everything you need to know about Zero-Knowledge X.509 certificates,
            Merkle-tree verification, and cryptographic identity privacy.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* FAQ Section */}
          <section className="col-span-12 lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-headline font-semibold">
                System Overview FAQs
              </h2>
              <span className="px-3 py-1 bg-tertiary/10 text-tertiary text-xs font-label rounded-full border border-tertiary/20">
                8 Articles Found
              </span>
            </div>

            <FAQItem
              question="What is zk-X509 and how does it differ from standard SSL/TLS?"
              answer="Standard X.509 certificates reveal all identity data to any verifier. zk-X509 utilizes Zero-Knowledge Proofs (ZKP) to prove ownership and validity of a certificate without disclosing the underlying sensitive data, such as your legal name or specific organizational details."
              defaultOpen={true}
            />
            <FAQItem
              question="How are Merkle Proofs used in the verification process?"
              answer="Merkle Proofs allow for efficient and secure verification of data inclusion in a large set. In zk-X509, they are used to prove that a certificate belongs to a trusted registry without exposing the entire registry."
            />
            <FAQItem
              question="Are certificates stored on the public blockchain?"
              answer="Certificates themselves are typically kept private. Only the cryptographic commitments and proofs are stored on-chain to ensure immutability and public verifiability while maintaining user privacy."
            />
            <FAQItem
              question="What cryptographic primitives are supported for proof generation?"
              answer="We support a variety of modern primitives including Groth16, Plonk, and Halo2, optimized for different use cases ranging from high-speed mobile verification to complex enterprise identity management."
            />
          </section>

          {/* Sidebar Content */}
          <aside className="col-span-12 lg:col-span-4 space-y-8">
            {/* Support Card */}
            <div className="bg-surface-container-low rounded-xl p-8 border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 rounded-full -mr-16 -mt-16 blur-3xl transition-all group-hover:bg-secondary/10" />
              <h2 className="text-2xl font-headline font-bold mb-4">
                Still have questions?
              </h2>
              <p className="text-on-surface-variant text-sm font-body mb-8 leading-relaxed">
                Can&apos;t find the answer you&apos;re looking for? Our
                technical support team is available 24/7 for cryptographic
                verification assistance.
              </p>
              <button className="w-full py-4 bg-white text-black font-headline font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all">
                <Mail className="w-5 h-5" />
                Contact Support
              </button>
            </div>

            {/* Quick Stats Bento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container rounded-xl p-6 border border-white/5">
                <span className="text-tertiary font-headline font-bold text-3xl">
                  99.9%
                </span>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-2 font-bold">
                  Uptime
                </p>
              </div>
              <div className="bg-surface-container rounded-xl p-6 border border-white/5">
                <span className="text-secondary font-headline font-bold text-3xl">
                  2.4ms
                </span>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-2 font-bold">
                  Proof Speed
                </p>
              </div>
            </div>

            {/* Featured Article */}
            <div className="bg-surface-container rounded-xl p-1 border border-white/5 group cursor-pointer overflow-hidden">
              <div className="relative h-48 overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://picsum.photos/seed/crypto/800/600"
                  alt="Featured Guide"
                  className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-all" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-tertiary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">
                    Advanced Guide
                  </span>
                </div>
                <h4 className="text-lg font-headline font-semibold mb-2">
                  Implementing recursive SNARKs in certificate validation
                </h4>
                <p className="text-on-surface-variant text-xs font-body mb-4">
                  Learn how to chain multiple proofs to reduce gas costs and
                  computation time.
                </p>
                <span className="text-tertiary text-xs font-headline flex items-center gap-1 group-hover:underline underline-offset-4">
                  Read full paper <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Floating Action Button */}
      <button className="fixed bottom-10 right-10 w-16 h-16 rounded-full bg-secondary text-black shadow-2xl shadow-secondary/20 flex items-center justify-center hover:scale-110 active:scale-90 transition-all z-50">
        <MessageSquare className="w-8 h-8" />
      </button>
    </>
  );
}
