"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Wallet,
  Share2,
  ListFilter,
  Cpu,
  Settings,
  History,
  ShieldCheck,
  Search,
  Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { useWallet } from "@/lib/wallet";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TxStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "confirming"; hash: string }
  | { kind: "success"; hash: string }
  | { kind: "error"; message: string };

const IDLE: TxStatus = { kind: "idle" };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function truncateHash(h: string, head = 6, tail = 4): string {
  if (!h || h.length < head + tail + 2) return h ?? "";
  return `${h.slice(0, head)}...${h.slice(-tail)}`;
}

function isZeroHash(h: string): boolean {
  return !h || h === ethers.ZeroHash;
}

const REASON_MAP: Record<string, string> = {
  "Key Compromise": ethers.id("KEY_COMPROMISE"),
  "CA Revocation": ethers.id("CA_REVOCATION"),
  "Malicious Activity": ethers.id("MALICIOUS_ACTIVITY"),
};

/** Run a write tx, handling user-rejection silently. */
async function execTx(
  setStatus: React.Dispatch<React.SetStateAction<TxStatus>>,
  fn: () => Promise<ethers.TransactionResponse>,
  refresh: () => void,
) {
  try {
    setStatus({ kind: "pending" });
    const tx = await fn();
    setStatus({ kind: "confirming", hash: tx.hash });
    await tx.wait();
    setStatus({ kind: "success", hash: tx.hash });
    refresh();
  } catch (err: unknown) {
    const e = err as { code?: string | number; message?: string };
    // user rejected in wallet — silently reset
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
      setStatus(IDLE);
      return;
    }
    setStatus({ kind: "error", message: e?.message ?? "Transaction failed" });
  }
}

/* ------------------------------------------------------------------ */
/*  Tx Status Badge                                                    */
/* ------------------------------------------------------------------ */

function TxBadge({ status }: { status: TxStatus }) {
  if (status.kind === "idle") return null;
  if (status.kind === "pending")
    return (
      <span className="text-[10px] font-mono text-tertiary animate-pulse">
        Waiting for wallet...
      </span>
    );
  if (status.kind === "confirming")
    return (
      <span className="text-[10px] font-mono text-tertiary animate-pulse">
        Confirming {truncateHash(status.hash)}...
      </span>
    );
  if (status.kind === "success")
    return (
      <span className="text-[10px] font-mono text-secondary">
        Confirmed: {truncateHash(status.hash)}
      </span>
    );
  return (
    <span className="text-[10px] font-mono text-error truncate max-w-xs inline-block">
      Error: {status.message.slice(0, 80)}
    </span>
  );
}

function isBusy(s: TxStatus) {
  return s.kind === "pending" || s.kind === "confirming";
}

/* ------------------------------------------------------------------ */
/*  Simulated verification feed                                        */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  BentoCard                                                          */
/* ------------------------------------------------------------------ */

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

/* ================================================================== */
/*  Admin Page                                                         */
/* ================================================================== */

export default function AdminPage() {
  const {
    account,
    isOwner,
    contractState,
    writeContract,
    readContract,
    registryAddr,
    chainName,
    refresh,
  } = useWallet();

  /* ---------- local state ---------- */
  const [blockNumber, setBlockNumber] = useState<number | null>(null);

  // inputs
  const [caRootInput, setCaRootInput] = useState("");
  const [crlRootInput, setCrlRootInput] = useState("");
  const [proofAgeInput, setProofAgeInput] = useState<number | null>(null);
  const [revokeNullifier, setRevokeNullifier] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // tx statuses
  const [caRootTx, setCaRootTx] = useState<TxStatus>(IDLE);
  const [crlRootTx, setCrlRootTx] = useState<TxStatus>(IDLE);
  const [proofAgeTx, setProofAgeTx] = useState<TxStatus>(IDLE);
  const [revokeTx, setRevokeTx] = useState<TxStatus>(IDLE);
  const [pauseTx, setPauseTx] = useState<TxStatus>(IDLE);

  const paused = contractState?.paused ?? false;
  const disabled = !isOwner || !writeContract;

  /* ---------- sync proof age slider from contract ---------- */
  useEffect(() => {
    if (contractState && proofAgeInput === null) {
      setProofAgeInput(Number(contractState.maxProofAge));
    }
  }, [contractState, proofAgeInput]);

  /* ---------- block number polling ---------- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const bn = await provider.getBlockNumber();
        if (!cancelled) setBlockNumber(bn);
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [account]);

  /* ---------- search handler ---------- */
  const handleSearch = useCallback(async () => {
    if (!readContract || !searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const q = searchQuery.trim();
      if (q.length === 42 && q.startsWith("0x")) {
        // address lookup
        const [verified, until]: [boolean, bigint] = await Promise.all([
          readContract.isVerified(q),
          readContract.verifiedUntil(q),
        ]);
        const expiry =
          until > BigInt(0)
            ? new Date(Number(until) * 1000).toISOString().split("T")[0]
            : "N/A";
        setSearchResult(
          `Address ${truncateHash(q)}: verified=${verified}, expires=${expiry}`,
        );
      } else if (q.length === 66 && q.startsWith("0x")) {
        // nullifier lookup
        const [owner, revoked]: [string, boolean] = await Promise.all([
          readContract.nullifierOwner(q),
          readContract.revokedNullifiers(q),
        ]);
        const ownerStr =
          owner === ethers.ZeroAddress ? "unregistered" : truncateHash(owner);
        setSearchResult(
          `Nullifier ${truncateHash(q)}: owner=${ownerStr}, revoked=${revoked}`,
        );
      } else {
        setSearchResult(
          "Enter a 42-char address (0x...) or 66-char bytes32 hash (0x...)",
        );
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSearchResult(`Query failed: ${e?.message?.slice(0, 80) ?? "unknown error"}`);
    } finally {
      setSearchLoading(false);
    }
  }, [readContract, searchQuery]);

  /* ---------- action handlers ---------- */
  const handleUpdateCaRoot = () => {
    if (!writeContract || !caRootInput) return;
    execTx(setCaRootTx, () => writeContract.updateCaMerkleRoot(caRootInput), refresh);
  };

  const handleUpdateCrlRoot = () => {
    if (!writeContract || !crlRootInput) return;
    execTx(setCrlRootTx, () => writeContract.updateCrlMerkleRoot(crlRootInput), refresh);
  };

  const handleSetProofAge = () => {
    if (!writeContract || proofAgeInput === null) return;
    execTx(setProofAgeTx, () => writeContract.setMaxProofAge(proofAgeInput), refresh);
  };

  const handleRevoke = () => {
    if (!writeContract || !revokeNullifier || !revokeReason) return;
    const reasonHash = REASON_MAP[revokeReason] ?? ethers.id(revokeReason);
    execTx(setRevokeTx, () => writeContract.revokeIdentity(revokeNullifier, reasonHash), refresh);
  };

  const handlePauseToggle = () => {
    if (!writeContract) return;
    execTx(
      setPauseTx,
      () => (paused ? writeContract.unpause() : writeContract.pause()),
      refresh,
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Not connected                                                    */
  /* ---------------------------------------------------------------- */
  if (!account) {
    return (
      <main className="md:ml-64 pt-28 p-8 min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <Shield className="w-16 h-16 text-primary mx-auto opacity-40" />
          <h2 className="text-2xl font-headline font-bold text-primary">
            Admin Console
          </h2>
          <p className="text-on-surface-variant text-sm max-w-md">
            Connect your wallet to access the admin console. Only the contract
            owner can execute administrative transactions.
          </p>
        </motion.div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Derived display values                                           */
  /* ---------------------------------------------------------------- */
  const statusLabel = paused ? "PAUSED" : "ACTIVE";
  const statusColor: "error" | "secondary" = paused ? "error" : "secondary";

  const caRoot = contractState?.caMerkleRoot ?? "";
  const crlRoot = contractState?.crlMerkleRoot ?? "";
  const crlDisplay = isZeroHash(crlRoot) ? "Disabled" : truncateHash(crlRoot);

  const maxProofAge = contractState ? Number(contractState.maxProofAge) : 0;
  const maxWallets = contractState?.maxWalletsPerCert ?? 0;

  const blockDisplay = blockNumber
    ? `BLOCK #${blockNumber.toLocaleString()}`
    : "SYNCING...";

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <main className="md:ml-64 pt-28 p-8 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Alert Section — non-owner */}
        {!isOwner && (
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
                Your connected wallet ({truncateHash(account)}) is not the
                protocol owner. Transaction signing is disabled.
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-1 rounded bg-error/20 text-error font-bold border border-error/30">
              AUDIT_MODE
            </span>
          </motion.div>
        )}

        {/* Header Section */}
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-headline font-bold tracking-tight text-primary">
                Admin Console
              </h1>
              <p className="text-on-surface-variant mt-2 max-w-lg">
                Cryptographic root management and protocol safety parameters for
                the ZK-X509 network.
              </p>
            </div>
            {isOwner && (
              <span className="px-3 py-1 bg-secondary/20 rounded-full text-secondary text-[10px] font-mono font-bold border border-secondary/30 self-start mt-1">
                OWNER
              </span>
            )}
          </div>
          <div className="flex gap-2 text-xs font-mono">
            <span className="px-3 py-1 bg-surface-highest/50 rounded-full text-tertiary border border-tertiary/20">
              {blockDisplay}
            </span>
            <span className="px-3 py-1 bg-surface-highest/50 rounded-full text-secondary border border-secondary/20">
              {chainName || "UNKNOWN"}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-surface p-4 rounded-2xl border border-outline-variant/10">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40" />
              <input
                className="w-full bg-surface-highest border-none rounded-xl pl-10 pr-4 py-3 text-sm font-mono focus:ring-1 focus:ring-tertiary transition-all outline-none text-primary placeholder:text-on-surface-variant/30"
                placeholder="Search address (0x...42 chars) or nullifier hash (0x...66 chars)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading || !readContract}
              className="bg-primary text-background px-6 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {searchLoading ? "Searching..." : "SEARCH"}
            </button>
          </div>
          {searchResult && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 text-xs font-mono text-on-surface-variant px-2"
            >
              {searchResult}
            </motion.p>
          )}
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - System Status */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contract Status */}
            <BentoCard
              title="Contract Status"
              value={statusLabel}
              color={statusColor}
              icon={<Wallet className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-mono mt-4 text-on-surface-variant truncate">
                {registryAddr ? truncateHash(registryAddr, 8, 6) : "Not deployed"}
              </p>
              <div className="mt-6 flex items-center gap-2">
                <div className="h-1 flex-1 bg-secondary/10 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: paused ? "0%" : "100%" }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className={`h-full ${paused ? "bg-error" : "bg-secondary shadow-[0_0_8px_rgba(107,255,143,0.5)]"}`}
                  />
                </div>
                <span
                  className={`text-[10px] font-mono ${paused ? "text-error" : "text-secondary"}`}
                >
                  {paused ? "HALTED" : "100%"}
                </span>
              </div>
            </BentoCard>

            {/* CA Merkle Root */}
            <BentoCard
              title="CA Merkle Root"
              value={caRoot ? truncateHash(caRoot) : "Loading..."}
              color="primary"
              mono
              icon={<Share2 className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-label text-on-surface-variant mt-4">
                {isZeroHash(caRoot) ? "NOT SET" : "ACTIVE ROOT"}
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
              value={crlDisplay}
              color="primary"
              mono
              icon={<ListFilter className="w-12 h-12 opacity-10" />}
            >
              <p className="text-[10px] font-label text-on-surface-variant mt-4 uppercase tracking-wider">
                {isZeroHash(crlRoot)
                  ? "CRL checking disabled"
                  : "CRL checking enabled"}
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
              value={contractState ? "On-Chain" : "Loading..."}
              color="primary"
              icon={<Cpu className="w-12 h-12 opacity-10" />}
            >
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    Max Proof Age
                  </p>
                  <p className="text-sm font-headline font-bold">
                    {maxProofAge}s
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-tighter">
                    Wallets/Cert
                  </p>
                  <p className="text-sm font-headline font-bold">
                    {maxWallets}
                  </p>
                </div>
              </div>
              <div className="mt-4 p-2 bg-surface-low rounded-lg border border-outline-variant/10">
                <p className="text-[10px] font-mono text-tertiary">
                  SP1 ZKVM: verified
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
                {/* CA Merkle Root update */}
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-label text-on-surface-variant">
                      Update CA Merkle Root
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-mono focus:ring-1 focus:ring-tertiary transition-all outline-none text-primary placeholder:text-on-surface-variant/30"
                        placeholder="New 32-byte Hex Root (0x...)"
                        type="text"
                        value={caRootInput}
                        onChange={(e) => setCaRootInput(e.target.value)}
                        disabled={disabled}
                      />
                      <button
                        className="bg-primary text-background px-6 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                        disabled={disabled || isBusy(caRootTx) || !caRootInput}
                        onClick={handleUpdateCaRoot}
                      >
                        {isBusy(caRootTx) ? "Processing..." : "UPDATE"}
                      </button>
                    </div>
                    <TxBadge status={caRootTx} />
                    <p className="text-[10px] text-on-surface-variant italic">
                      Requires owner signature. Propagates in ~12 seconds.
                    </p>
                  </div>

                  {/* CRL Merkle Root update */}
                  <div className="space-y-2">
                    <label className="text-xs font-label text-on-surface-variant">
                      Update CRL Merkle Root
                    </label>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-mono focus:ring-1 focus:ring-tertiary transition-all outline-none text-primary placeholder:text-on-surface-variant/30"
                        placeholder="New CRL Root (0x...) or 0x00..00 to disable"
                        type="text"
                        value={crlRootInput}
                        onChange={(e) => setCrlRootInput(e.target.value)}
                        disabled={disabled}
                      />
                      <button
                        className="bg-primary text-background px-6 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                        disabled={disabled || isBusy(crlRootTx) || !crlRootInput}
                        onClick={handleUpdateCrlRoot}
                      >
                        {isBusy(crlRootTx) ? "Processing..." : "UPDATE"}
                      </button>
                    </div>
                    <TxBadge status={crlRootTx} />
                    <p className="text-[10px] text-on-surface-variant italic">
                      Set to zero hash to disable CRL checking.
                    </p>
                  </div>
                </div>

                {/* Max Proof Age */}
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
                        value={proofAgeInput ?? maxProofAge}
                        onChange={(e) =>
                          setProofAgeInput(Number(e.target.value))
                        }
                        disabled={disabled}
                      />
                      <span className="text-sm font-mono font-bold w-16 text-center text-primary">
                        {proofAgeInput ?? maxProofAge}s
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-on-surface-variant font-label">
                      <span>1 Min</span>
                      <span>1 Hour</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        className="bg-primary text-background px-4 py-2 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                        disabled={
                          disabled ||
                          isBusy(proofAgeTx) ||
                          proofAgeInput === null ||
                          proofAgeInput === maxProofAge
                        }
                        onClick={handleSetProofAge}
                      >
                        {isBusy(proofAgeTx) ? "Processing..." : "SET AGE"}
                      </button>
                      <TxBadge status={proofAgeTx} />
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
                      placeholder="Identity Nullifier Hash (0x...)"
                      type="text"
                      value={revokeNullifier}
                      onChange={(e) => setRevokeNullifier(e.target.value)}
                      disabled={disabled}
                    />
                    <select
                      className="w-full bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-label outline-none text-on-surface-variant appearance-none cursor-pointer"
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      disabled={disabled}
                    >
                      <option value="">Select Reason</option>
                      <option>Key Compromise</option>
                      <option>CA Revocation</option>
                      <option>Malicious Activity</option>
                    </select>
                    <button
                      className="w-full py-3 border border-error/40 text-error hover:bg-error/10 transition-all font-bold text-xs rounded-xl uppercase tracking-widest disabled:opacity-50"
                      disabled={
                        disabled ||
                        isBusy(revokeTx) ||
                        !revokeNullifier ||
                        !revokeReason
                      }
                      onClick={handleRevoke}
                    >
                      {isBusy(revokeTx)
                        ? "Processing..."
                        : "Commit Revocation"}
                    </button>
                    <TxBadge status={revokeTx} />
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
                      onClick={handlePauseToggle}
                      disabled={disabled || isBusy(pauseTx)}
                      className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${paused ? "bg-error" : "bg-surface-highest"}`}
                    >
                      <span
                        className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${paused ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </button>
                  </div>
                  <TxBadge status={pauseTx} />
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

          </div>
        </div>

      </div>

      {/* Footer */}
      <footer className="mt-12 p-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-label text-on-surface-variant">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3 h-3" />
          <span>Developed by Tokamak Network</span>
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
