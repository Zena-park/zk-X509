"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck,
  Settings,
  Users,
  ArrowLeft,
  Loader2,
  Lock,
  Unlock,
  Database,
  Fingerprint,
} from "lucide-react";
import { IDENTITY_REGISTRY_ABI, getRpcUrl } from "@/lib/contract";
import { truncateHex } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RegistryInfo {
  owner: string;
  maxWallets: number;
  minDisclosureMask: number;
  caCount: number;
  paused: boolean;
}

const DISCLOSURE_LABELS = ["Country", "Organization", "Org Unit", "Common Name"] as const;

function decodeMask(mask: number): string[] {
  const fields: string[] = [];
  for (let i = 0; i < DISCLOSURE_LABELS.length; i++) {
    if (mask & (1 << i)) fields.push(DISCLOSURE_LABELS[i]);
  }
  return fields;
}

/* ================================================================== */
/*  Registry Detail Page                                               */
/* ================================================================== */

export default function RegistryDetailPage() {
  const params = useParams<{ address: string }>();
  const address = params.address;

  const [info, setInfo] = useState<RegistryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !ethers.isAddress(address)) {
      setError("Invalid registry address.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(getRpcUrl());
        const contract = new ethers.Contract(address, IDENTITY_REGISTRY_ABI, provider);

        const [owner, maxWallets, caCount, paused] = await Promise.all([
          contract.owner(),
          contract.MAX_WALLETS_PER_CERT(),
          contract.getCaCount(),
          contract.paused(),
        ]);

        // Try to read MIN_DISCLOSURE_MASK (may not exist on older contracts)
        let minDisclosureMask = 0;
        try {
          minDisclosureMask = Number(await contract.MIN_DISCLOSURE_MASK());
        } catch {
          // not available on this contract version
        }

        setInfo({
          owner,
          maxWallets: Number(maxWallets),
          minDisclosureMask,
          caCount: Number(caCount),
          paused,
        });
      } catch (e) {
        console.error("Failed to load registry:", e);
        setError("Failed to load registry data. Check that the address is valid and the RPC is reachable.");
      } finally {
        setLoading(false);
      }
    })();
  }, [address]);

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <main className="max-w-6xl mx-auto pt-24 px-8 pb-12 flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-8 h-8 text-tertiary animate-spin" />
          <p className="text-on-surface-variant text-sm">Loading registry...</p>
        </motion.div>
      </main>
    );
  }

  /* ---------- Error ---------- */
  if (error || !info) {
    return (
      <main className="max-w-6xl mx-auto pt-24 px-8 pb-12 flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-3xl p-12 text-center max-w-md"
        >
          <ShieldCheck className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
            Registry Not Found
          </h2>
          <p className="text-on-surface-variant mb-6">{error || "Unknown error"}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-tertiary hover:text-primary transition-colors font-headline text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Platform
          </Link>
        </motion.div>
      </main>
    );
  }

  const disclosureFields = decodeMask(info.minDisclosureMask);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <main className="max-w-4xl mx-auto pt-24 px-8 pb-12">
      {/* Back link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-6"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors font-headline text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Platform
        </Link>
      </motion.div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className={`p-2 rounded-xl ${info.paused ? "bg-red-500/10" : "bg-secondary/10"}`}>
            <ShieldCheck className={`w-6 h-6 ${info.paused ? "text-red-400" : "text-secondary"}`} />
          </div>
          <div>
            <h1 className="text-3xl font-headline font-bold tracking-tight text-primary">
              Registry
            </h1>
            <p className="font-mono text-sm text-on-surface-variant">{address}</p>
          </div>
        </div>
      </motion.header>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-tertiary" />
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-label">Max Wallets</p>
          </div>
          <p className="text-2xl font-headline font-bold text-primary">{info.maxWallets}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-panel rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Fingerprint className="w-4 h-4 text-tertiary" />
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-label">Disclosure</p>
          </div>
          <p className="text-sm font-headline font-bold text-primary">
            {disclosureFields.length > 0 ? disclosureFields.join(", ") : "None required"}
          </p>
          <p className="text-xs font-mono text-on-surface-variant mt-1">
            mask: 0x{info.minDisclosureMask.toString(16).padStart(2, "0")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-tertiary" />
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-label">Trusted CAs</p>
          </div>
          <p className="text-2xl font-headline font-bold text-primary">{info.caCount}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 }}
          className="glass-panel rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            {info.paused ? (
              <Lock className="w-4 h-4 text-red-400" />
            ) : (
              <Unlock className="w-4 h-4 text-secondary" />
            )}
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-label">Status</p>
          </div>
          <p className={`text-lg font-headline font-bold ${info.paused ? "text-red-400" : "text-secondary"}`}>
            {info.paused ? "Paused" : "Active"}
          </p>
        </motion.div>
      </div>

      {/* Owner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel rounded-2xl p-5 mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-on-surface-variant text-[10px] uppercase tracking-widest font-label mb-1">Owner</p>
            <p className="font-mono text-sm text-tertiary">{info.owner}</p>
          </div>
        </div>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <Link
          href={`/registry/${address}/dashboard`}
          className="flex-1 flex items-center justify-center gap-3 px-8 py-5 bg-primary text-surface font-headline font-bold rounded-2xl hover:scale-[1.02] active:scale-95 transition-all"
        >
          <Users className="w-5 h-5" />
          User Dashboard
        </Link>
        <Link
          href={`/registry/${address}/admin`}
          className="flex-1 flex items-center justify-center gap-3 px-8 py-5 border border-outline-variant/30 text-on-surface font-headline font-bold rounded-2xl hover:bg-surface-container-highest transition-all"
        >
          <Settings className="w-5 h-5" />
          Admin Console
        </Link>
      </motion.div>
    </main>
  );
}
