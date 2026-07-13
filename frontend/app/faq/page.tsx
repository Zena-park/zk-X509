"use client";

import { useState } from "react";
import {
  HelpCircle,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Shield,
  Zap,
} from "lucide-react";
import { REPO_URL } from "@/lib/platform";
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
            className={`w-5 h-5 mt-1 shrink-0 ${isOpen ? "text-tertiary" : "text-on-surface-variant"}`}
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
          <ChevronUp className="w-5 h-5 shrink-0 text-on-surface-variant" />
        ) : (
          <ChevronDown className="w-5 h-5 shrink-0 text-on-surface-variant" />
        )}
      </button>
    </div>
  );
}

const faqItems = [
  {
    question: "What is zk-X509?",
    answer:
      "zk-X509 is a system that lets you prove your identity on the blockchain using existing X.509 certificates (e.g. government eID, banking certificates, corporate PKI) without revealing any personal information. Using Zero-Knowledge Proofs, the blockchain only learns that you hold a valid certificate — your name, ID number, and other details remain completely private.",
  },
  {
    question: "How does the identity verification process work?",
    answer:
      "The process has 3 steps: (1) Download and run the zk-X509 app — it scans your OS keychain for X.509 certificates and lets you select one. (2) The app generates a Zero-Knowledge Proof locally — this cryptographically proves your certificate is valid without exposing its contents. (3) Copy the proof into the web dashboard and submit it on-chain. The smart contract verifies the proof and registers your wallet as a verified identity. The entire certificate verification (signature chain, expiry, revocation check) happens inside the ZK circuit, so nothing sensitive ever touches the blockchain.",
  },
  {
    question: "What personal information is stored on the blockchain?",
    answer:
      "No personal information is stored on-chain. The blockchain only stores: a nullifier (a random-looking identifier derived from your certificate), the proof verification result, and the certificate's expiry date. Your name, ID number, email, organization, and all other certificate details remain completely private. Even the specific Certificate Authority that issued your certificate is hidden — only a group membership proof is revealed.",
  },
  {
    question: "What types of certificates are supported?",
    answer:
      "zk-X509 supports standard X.509 certificates with RSA (2048/4096-bit) and ECDSA (P-256, P-384) signatures. This includes government-issued certificates (e.g. Korean banking certificates, European eID), corporate PKI, and any CA-signed X.509 certificate stored in your OS keychain. The system verifies the full certificate chain from your certificate up to the trusted root CA.",
  },
  {
    question: "Can I register the same certificate on multiple wallets?",
    answer:
      "It depends on how the contract is configured. Each deployment sets a maximum number of wallets per certificate. For strict identity use cases (like DAO voting), only 1 wallet per certificate may be allowed. For other scenarios (like DeFi account recovery), multiple wallets may be permitted. The administrator configures this policy at deployment time.",
  },
  {
    question: "What happens if my certificate expires or gets revoked?",
    answer:
      "Your on-chain identity automatically expires when your certificate's validity period ends — no manual action is needed. For revocation, the system checks the Certificate Revocation List (CRL) inside the ZK proof, and the administrator can also directly revoke a specific identity on-chain if a certificate is compromised. Once revoked, the associated wallet is immediately unverified.",
  },
  {
    question: "Can someone steal my proof and register it to their wallet?",
    answer:
      "No. Every proof is cryptographically bound to the wallet address of the person who generated it. The smart contract checks that the proof's embedded address matches the transaction sender (msg.sender). Even if an attacker intercepts your proof from the mempool, they cannot use it — the proof simply won't verify for any other wallet address.",
  },
  {
    question: "How long does proof generation take?",
    answer:
      "Proof generation typically takes 3-5 minutes using Docker (Groth16 mode). The ZK circuit performs full certificate chain verification, signature validation, and revocation checking — all within a single proof. On-chain verification of the resulting proof costs approximately 300,000 gas and completes within one transaction.",
  },
  {
    question: "Can different blockchain apps link my identities across services?",
    answer:
      "No. zk-X509 generates a different nullifier for each smart contract and each blockchain. If you verify on App A and App B, there is no way for anyone to determine that both verifications came from the same certificate. Similarly, verifications on different chains are completely unlinkable. This is achieved by including the contract address and chain ID in the nullifier derivation.",
  },
  {
    question: "What is the role of the administrator?",
    answer:
      "The administrator manages the trust configuration: which Certificate Authorities (CAs) are accepted, the revocation list updates, and proof freshness settings. They can also pause the system in emergencies or revoke compromised identities. However, the administrator cannot forge proofs, see users' personal data, or register wallets on behalf of users. Ownership can be transferred through a secure 2-step process.",
  },
  {
    question: "How is this different from other identity solutions like Worldcoin or DID?",
    answer:
      "Unlike Worldcoin (which requires a physical Orb device) or DID systems (which require new credential infrastructure to be built), zk-X509 works entirely in software and leverages the billions of X.509 certificates already deployed worldwide. There is no special hardware needed, no new credential issuance process, and no centralized verification server. You can start using it today with a certificate you already have.",
  },
  {
    question: "Is my private key safe during the proof generation?",
    answer:
      "Yes. Your certificate's private key never leaves your OS keychain and is never included in the ZK proof. The zk-X509 app delegates signing to the OS keychain (macOS Security.framework) — the private key is never loaded into process memory. The resulting one-time signature is verified inside the ZK circuit, and only the ZK proof (which reveals nothing about the key) is submitted on-chain.",
  },
  {
    question: "Does my certificate contain personal information like my name or ID number?",
    answer:
      "Yes — X.509 certificates contain personal information such as your name, organization, and identifiers. However, zk-X509 ensures that none of this information is included in the data published on-chain. Your certificate is used locally as a private witness inside the ZK circuit. No certificate PII is included in the on-chain public values — only the nullifier, expiry timestamp, and other non-PII metadata (wallet address, chain ID, CA Merkle root) are public. Your name, identifier, organization, and all other personal details are never stored on-chain. With Selective Disclosure, you can optionally reveal specific attributes (e.g., country or organization). The on-chain record commits only a salted hash of each disclosed attribute — anyone you share the plaintext with can verify consistency, while everything else remains private.",
  },
  {
    question: "Is Delegated Proving (cloud-based proof generation) safe even if my certificate is leaked?",
    answer:
      "Yes, it is safe by design. There are three layers of defense: (1) Certificate vs. Private Key separation — the certificate contains your public key and identity details. Without the private key (stored securely in your OS keychain), no one can generate the required signature. (2) Wallet-bound signatures — the ownership signature includes your specific wallet address, timestamp, and chain ID. Even if an attacker obtains your signature, they cannot redirect it to their own wallet — the ZK circuit will reject the mismatch. (3) Front-running protection — the smart contract verifies that the proof's embedded wallet address matches the transaction sender (msg.sender). An intercepted proof is useless to any other address. In Delegated Proving, you only send a one-time signature (not your private key) to the cloud prover. The prover generates the ZK proof but cannot forge your identity or register a different wallet.",
  },
  {
    question:
      "As a service operator, how do I enable Delegated Proving when creating my service?",
    answer:
      "When you create a service (Auth Policy / registry), there is a 'Require Delegated Proving' toggle in the creation form. Turning it on stores a delegatedProvingRequired flag on-chain. The toggle alone is not enough to go live, though — you also need to publish your prover server's address. After the registry is deployed, open its Admin panel and set the Prover Server URL (e.g. https://prover.your-service.com) via 'Save Delegated Proving Settings', which calls the owner-only setDelegatedProving(required, proverUrl) function. Until a non-empty URL is set, users cannot register, and the admin panel shows a 'Prover URL not set' warning. You can also toggle delegated proving on or off later from the same panel — it is not locked at creation time. Running the prover server itself requires deploying the prover-server binary (SP1 + GPU) that accepts certificate data and consent signatures and returns a ZK proof.",
  },
  {
    question:
      "Do users choose between local and delegated proving, or is it decided by the service?",
    answer:
      "It is decided by the service's on-chain configuration, not by the user. When the desktop app connects to a registry it reads two fields: delegatedProvingRequired and proverUrl. There are three outcomes: (1) delegatedProvingRequired is false → the app generates the proof locally (the default flow, full privacy). (2) delegatedProvingRequired is true and proverUrl is set → the app shows a consent dialog, and only after you explicitly agree does it send your certificate and one-time signatures to that prover. (3) delegatedProvingRequired is true but proverUrl is empty → registration is unavailable until the operator configures the prover. Because the consent message is signed by your certificate key (via the OS keychain) and is scoped to that specific prover, registry, chain, and timestamp, no certificate data is transmitted before you consent, and the consent cannot be reused elsewhere.",
  },
  {
    question:
      "As a service operator, how do I run the delegated prover server?",
    answer:
      "The server is the prover-server binary in script/src/bin/prover-server.rs (not server.rs, which is the local client-side prover). Build and run it with: RUST_LOG=info cargo run --release --bin prover-server (from the script/ directory). Configure it with environment variables: PROVER_URL (this server's public URL, used to verify consent signatures — default http://localhost:9090), PROVER_PORT (listen port, default 9090), PROVER_LOG_DIR (compliance log directory, default ./logs), and PROVER_ECIES_KEY (the key used to decrypt encrypted requests — if unset, one is generated and persisted to logs/.ecies_key). Critical: PROVER_URL must exactly match the prover URL you register in the Admin panel and the URL users read on-chain — if they differ, every request is rejected with 403 because the reconstructed consent message won't match. Proof generation uses SP1 in Groth16 mode, which requires Docker locally (~3-5 min per proof, ~16GB RAM); for GPU acceleration set SP1_PROVER=network with a NETWORK_PRIVATE_KEY to use the Succinct prover network. Verify the server with: curl http://localhost:9090/api/health. The endpoints are POST /api/prove (generate a proof from consent + cert + signatures), GET /api/pubkey (ECIES public key for encrypting requests), and GET /api/health (status).",
  },
  {
    question:
      "What does the prover server store, and what does the user actually send it?",
    answer:
      "The user never sends their private key — only a one-time consent signature, the certificate and its chain, and the ownership/nullifier signatures (all produced by the OS keychain). The server first reconstructs the consent message from the request and verifies the consent signature against the certificate's public key, rejecting anything older than 10 minutes or signed for a different prover/registry/chain. Only after consent is verified does it run the proof. For compliance it appends a record to logs/compliance-<epoch-day>.jsonl (the day bucket is the Unix timestamp divided by 86400) containing the registrant address, certificate subject, certificate expiry, the consent message, and the consent signature — enough to demonstrate the certificate owner agreed, without retaining the full certificate by default (operators under KYC/AML rules can extend this). Requests can optionally be ECIES-encrypted end-to-end: the user fetches the server's public key from /api/pubkey, encrypts the sensitive fields, and the server decrypts them in memory.",
  },
];

export default function FAQPage() {
  return (
    <>
      <main className="max-w-6xl mx-auto pt-24 px-8">
        <header className="mb-16">
          <h1 className="text-6xl font-headline font-bold tracking-tighter mb-4">
            FAQ
          </h1>
          <p className="text-on-surface-variant text-lg max-w-2xl font-body leading-relaxed">
            Frequently asked questions about zk-X509 — how it works, what it
            protects, and how to use it for private identity verification on the
            blockchain.
          </p>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* FAQ Section */}
          <section className="col-span-12 lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-headline font-semibold">
                General Questions
              </h2>
              <span className="px-3 py-1 bg-tertiary/10 text-tertiary text-xs font-label rounded-full border border-tertiary/20">
                {faqItems.length} Articles
              </span>
            </div>

            {faqItems.map((item, index) => (
              <FAQItem
                key={index}
                question={item.question}
                answer={item.answer}
                defaultOpen={index === 0}
              />
            ))}
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
                Can&apos;t find the answer you&apos;re looking for? Open an issue
                for technical help with certificate verification or proof
                generation.
              </p>
              <a
                href={`${REPO_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 bg-white text-black font-headline font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 active:scale-95 transition-all"
              >
                <ExternalLink className="w-5 h-5" />
                Open an Issue
              </a>
            </div>

            {/* Quick Stats Bento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container rounded-xl p-6 border border-white/5">
                <Shield className="w-5 h-5 text-tertiary mb-2" />
                <span className="text-tertiary font-headline font-bold text-3xl">
                  0
                </span>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-2 font-bold">
                  PII On-Chain
                </p>
              </div>
              <div className="bg-surface-container rounded-xl p-6 border border-white/5">
                <Zap className="w-5 h-5 text-secondary mb-2" />
                <span className="text-secondary font-headline font-bold text-3xl">
                  ~300K
                </span>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-2 font-bold">
                  Gas Cost
                </p>
              </div>
            </div>

            {/* Key Properties Card */}
            <div className="bg-surface-container rounded-xl p-6 border border-white/5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-tertiary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">
                  Key Properties
                </span>
              </div>
              <ul className="space-y-3 text-sm font-body text-on-surface-variant">
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  No personal data on-chain
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  No special hardware required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  Works with existing certificates
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  Cross-app identity unlinkable
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  Auto-expires with certificate
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tertiary mt-0.5">&#10003;</span>
                  Front-running immune
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
