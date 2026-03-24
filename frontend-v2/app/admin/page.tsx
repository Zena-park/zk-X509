"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  AlertTriangle,
  Wallet,
  Share2,
  ListFilter,
  Cpu,
  Settings,
  ShieldCheck,
  Search,
  Shield,
  Upload,
  FileText,
  X,
  ArrowRightLeft,
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

type AdminTab = "status" | "ca" | "settings" | "security";

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
/*  Merkle Tree helpers                                                */
/* ------------------------------------------------------------------ */

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(hash);
}

async function merkleRoot(leaves: Uint8Array[]): Promise<string> {
  if (leaves.length === 0) return ethers.ZeroHash;
  // Pad to power of 2
  let nodes = [...leaves];
  while (nodes.length > 1 && (nodes.length & (nodes.length - 1)) !== 0) {
    nodes.push(new Uint8Array(32)); // zero hash padding
  }
  while (nodes.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = i + 1 < nodes.length ? nodes[i + 1] : new Uint8Array(32);
      const combined = new Uint8Array(64);
      combined.set(left, 0);
      combined.set(right, 32);
      next.push(await sha256(combined));
    }
    nodes = next;
  }
  return (
    "0x" +
    Array.from(nodes[0])
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/* ------------------------------------------------------------------ */
/*  Tx Status Badge                                                    */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-1 text-[10px] text-on-surface-variant hover:text-primary transition-colors"
      title="Copy tx hash"
    >
      {copied ? "✓" : "📋"}
    </button>
  );
}

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
      <span className="text-[10px] font-mono text-tertiary animate-pulse inline-flex items-center">
        Confirming {truncateHash(status.hash)}...
        <CopyButton text={status.hash} />
      </span>
    );
  if (status.kind === "success")
    return (
      <span className="text-[10px] font-mono text-secondary inline-flex items-center">
        Confirmed: {truncateHash(status.hash)}
        <CopyButton text={status.hash} />
      </span>
    );
  return (
    <span className="text-[10px] font-mono text-error truncate max-w-xs inline-block">
      Error: {status.message.slice(0, 120)}
    </span>
  );
}

function isBusy(s: TxStatus) {
  return s.kind === "pending" || s.kind === "confirming";
}

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

/* ------------------------------------------------------------------ */
/*  CA File Entry type                                                 */
/* ------------------------------------------------------------------ */

interface CaFileEntry {
  name: string;
  hash: Uint8Array;
  hashHex: string;
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

  /* ---------- tab state ---------- */
  const [activeTab, setActiveTab] = useState<AdminTab>("status");

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

  // CA file upload state
  const [caFiles, setCaFiles] = useState<CaFileEntry[]>([]);
  const [calculatedCaRoot, setCalculatedCaRoot] = useState<string | null>(null);
  const [caFileProcessing, setCaFileProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Transfer ownership
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [transferTx, setTransferTx] = useState<TxStatus>(IDLE);

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
      setSearchResult(
        `Query failed: ${e?.message?.slice(0, 80) ?? "unknown error"}`,
      );
    } finally {
      setSearchLoading(false);
    }
  }, [readContract, searchQuery]);

  /* ---------- CA file handlers ---------- */
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setCaFileProcessing(true);
    try {
      const newEntries: CaFileEntry[] = [];
      for (const file of Array.from(files)) {
        if (!file.name.endsWith(".der")) continue;
        const arrayBuffer = await file.arrayBuffer();
        const hash = await sha256(new Uint8Array(arrayBuffer));
        const hashHex =
          "0x" +
          Array.from(hash)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        newEntries.push({ name: file.name, hash, hashHex });
      }
      setCaFiles((prev) => [...prev, ...newEntries]);
      setCalculatedCaRoot(null); // reset when files change
    } finally {
      setCaFileProcessing(false);
    }
  }, []);

  const removeCaFile = useCallback((index: number) => {
    setCaFiles((prev) => prev.filter((_, i) => i !== index));
    setCalculatedCaRoot(null);
  }, []);

  const calculateCaRoot = useCallback(async () => {
    if (caFiles.length === 0) return;
    const leaves = caFiles.map((f) => f.hash);
    const root = await merkleRoot(leaves);
    setCalculatedCaRoot(root);
  }, [caFiles]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  /* ---------- action handlers ---------- */
  const handleUpdateCaRoot = () => {
    if (!writeContract || !caRootInput) return;
    execTx(
      setCaRootTx,
      () => writeContract.updateCaMerkleRoot(caRootInput),
      refresh,
    );
  };

  const handleUpdateCaRootFromFiles = () => {
    if (!writeContract || !calculatedCaRoot) return;
    execTx(
      setCaRootTx,
      () => writeContract.updateCaMerkleRoot(calculatedCaRoot),
      refresh,
    );
  };

  const handleUpdateCrlRoot = () => {
    if (!writeContract || !crlRootInput) return;
    execTx(
      setCrlRootTx,
      () => writeContract.updateCrlMerkleRoot(crlRootInput),
      refresh,
    );
  };

  const handleSetProofAge = () => {
    if (!writeContract || proofAgeInput === null) return;
    execTx(
      setProofAgeTx,
      () => writeContract.setMaxProofAge(proofAgeInput),
      refresh,
    );
  };

  const handleRevoke = () => {
    if (!writeContract || !revokeNullifier || !revokeReason) return;
    const reasonHash = REASON_MAP[revokeReason] ?? ethers.id(revokeReason);
    execTx(
      setRevokeTx,
      () => writeContract.revokeIdentity(revokeNullifier, reasonHash),
      refresh,
    );
  };

  const handlePauseToggle = () => {
    if (!writeContract) return;
    execTx(
      setPauseTx,
      () => (paused ? writeContract.unpause() : writeContract.pause()),
      refresh,
    );
  };

  const handleTransferOwnership = () => {
    if (!writeContract || !newOwnerInput) return;
    execTx(
      setTransferTx,
      () => writeContract.transferOwnership(newOwnerInput),
      refresh,
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Not connected                                                    */
  /* ---------------------------------------------------------------- */
  if (!account) {
    return (
      <main className="max-w-6xl mx-auto pt-24 px-8 pb-12 flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-3xl p-12 text-center max-w-md"
        >
          <Shield className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
          <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
            Admin Console
          </h2>
          <p className="text-on-surface-variant">
            Connect wallet to access admin console
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
  const maxWallets = contractState?.MAX_WALLETS_PER_CERT ?? 0;

  const blockDisplay = blockNumber
    ? `BLOCK #${blockNumber.toLocaleString()}`
    : "SYNCING...";

  /* ---------------------------------------------------------------- */
  /*  Tab definitions                                                  */
  /* ---------------------------------------------------------------- */
  const tabs: { key: AdminTab; label: string }[] = [
    { key: "status", label: "Status" },
    { key: "ca", label: "CA Management" },
    { key: "settings", label: "Settings" },
    { key: "security", label: "Security" },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <main className="max-w-6xl mx-auto pt-24 px-8 min-h-screen">
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

        {/* Tab Bar */}
        <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-start">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-2 font-headline text-sm rounded-full transition-all ${
                activeTab === tab.key
                  ? "bg-surface-container-highest text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {/* ==================== STATUS TAB ==================== */}
          {activeTab === "status" && (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* 4 BentoCards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Contract Status */}
                <BentoCard
                  title="Contract Status"
                  value={statusLabel}
                  color={statusColor}
                  icon={<Wallet className="w-12 h-12 opacity-10" />}
                >
                  <p className="text-[10px] font-mono mt-4 text-on-surface-variant truncate">
                    {registryAddr
                      ? truncateHash(registryAddr, 8, 6)
                      : "Not deployed"}
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
            </motion.div>
          )}

          {/* ==================== CA MANAGEMENT TAB ==================== */}
          {activeTab === "ca" && (
            <motion.div
              key="ca"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* File Upload Section */}
              <div className="bg-surface p-8 rounded-3xl border border-outline-variant/10">
                <div className="flex items-center gap-3 mb-6">
                  <Upload className="text-primary w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-primary">
                    CA Certificate Upload
                  </h2>
                </div>
                <p className="text-sm text-on-surface-variant mb-6">
                  Upload CA certificate <code>.der</code> files to compute the
                  Merkle root. Each file is hashed with SHA-256 to form a leaf.
                </p>

                {/* Drop zone */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    dragOver
                      ? "border-primary bg-primary/5"
                      : "border-outline-variant/30 hover:border-primary/50 hover:bg-surface-highest/30"
                  }`}
                >
                  <Upload
                    className={`w-8 h-8 mx-auto mb-3 ${dragOver ? "text-primary" : "text-on-surface-variant/40"}`}
                  />
                  <p className="text-sm text-on-surface-variant">
                    {caFileProcessing
                      ? "Processing files..."
                      : "Drag & drop .der files here, or click to browse"}
                  </p>
                  <p className="text-[10px] text-on-surface-variant/50 mt-1">
                    Multiple files allowed
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".der"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) processFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {/* File list */}
                {caFiles.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <p className="text-xs font-label text-on-surface-variant uppercase tracking-widest mb-3">
                      Uploaded CA Certificates ({caFiles.length})
                    </p>
                    {caFiles.map((entry, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 bg-surface-highest rounded-xl px-4 py-3"
                      >
                        <FileText className="w-4 h-4 text-tertiary shrink-0" />
                        <span className="text-sm font-headline font-medium text-primary truncate">
                          {entry.name}
                        </span>
                        <span className="text-[10px] font-mono text-on-surface-variant truncate flex-1">
                          {truncateHash(entry.hashHex, 10, 8)}
                        </span>
                        <button
                          onClick={() => removeCaFile(idx)}
                          className="text-on-surface-variant/50 hover:text-error transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {/* Calculate button */}
                    <div className="pt-4 flex items-center gap-4">
                      <button
                        onClick={calculateCaRoot}
                        className="bg-tertiary text-background px-6 py-3 rounded-xl font-label font-bold text-xs hover:opacity-90 transition-all"
                      >
                        CALCULATE MERKLE ROOT
                      </button>
                      {calculatedCaRoot && (
                        <div className="flex-1">
                          <p className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">
                            Calculated Root
                          </p>
                          <p className="text-sm font-mono text-secondary break-all">
                            {calculatedCaRoot}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Update from calculated root */}
                    {calculatedCaRoot && (
                      <div className="pt-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleUpdateCaRootFromFiles}
                            disabled={disabled || isBusy(caRootTx)}
                            className="bg-primary text-background px-6 py-3 rounded-xl font-label font-bold text-xs hover:opacity-90 disabled:opacity-50 transition-all"
                          >
                            {isBusy(caRootTx)
                              ? "Processing..."
                              : "UPDATE CA ROOT"}
                          </button>
                          <TxBadge status={caRootTx} />
                        </div>
                        <p className="text-[10px] text-on-surface-variant italic mt-2">
                          Requires owner signature. Propagates in ~12 seconds.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Manual hex input fallback */}
              <div className="bg-surface p-8 rounded-3xl border border-outline-variant/10">
                <div className="flex items-center gap-3 mb-6">
                  <Share2 className="text-primary w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-primary">
                    Manual CA Root Update
                  </h2>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-label text-on-surface-variant">
                    CA Merkle Root (Hex)
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
              </div>
            </motion.div>
          )}

          {/* ==================== SETTINGS TAB ==================== */}
          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* CRL Merkle Root */}
              <div className="bg-surface p-8 rounded-3xl border border-outline-variant/10">
                <div className="flex items-center gap-3 mb-6">
                  <ListFilter className="text-primary w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-primary">
                    Update CRL Merkle Root
                  </h2>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-label text-on-surface-variant">
                    CRL Merkle Root (Hex)
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
              <div className="bg-surface p-8 rounded-3xl border border-outline-variant/10">
                <div className="flex items-center gap-3 mb-6">
                  <Settings className="text-primary w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-primary">
                    Max Proof Age
                  </h2>
                </div>
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
            </motion.div>
          )}

          {/* ==================== SECURITY TAB ==================== */}
          {activeTab === "security" && (
            <motion.div
              key="security"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Revoke Identity */}
              <div className="bg-surface p-8 rounded-3xl border border-error/10 bg-gradient-to-b from-error/5 to-transparent">
                <div className="flex items-center gap-3 mb-6">
                  <AlertTriangle className="text-error w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-error">
                    Revoke Identity
                  </h2>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">
                  Permanently blacklist a nullifier from the protocol.
                </p>
                <div className="space-y-3 max-w-xl">
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

              {/* Emergency Pause */}
              <div className="bg-surface p-8 rounded-3xl border border-error/10 bg-gradient-to-b from-error/5 to-transparent">
                <div className="flex items-center gap-3 mb-6">
                  <Shield className="text-error w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-error">
                    Emergency Pause
                  </h2>
                </div>
                <div className="flex items-center justify-between max-w-xl">
                  <div>
                    <p className="text-sm font-headline font-bold text-primary">
                      Protocol Status
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
                <div className="mt-3">
                  <TxBadge status={pauseTx} />
                </div>
                <div className="p-4 bg-error/10 rounded-2xl border border-error/20 mt-4 max-w-xl">
                  <p className="text-[10px] text-error leading-relaxed font-medium">
                    <strong>ATTENTION:</strong> Pausing the contract will freeze
                    all user activities immediately. Only the DAO or emergency
                    multi-sig can resume operations.
                  </p>
                </div>
              </div>

              {/* Transfer Ownership */}
              <div className="bg-surface p-8 rounded-3xl border border-error/10 bg-gradient-to-b from-error/5 to-transparent">
                <div className="flex items-center gap-3 mb-6">
                  <ArrowRightLeft className="text-error w-5 h-5" />
                  <h2 className="text-xl font-headline font-bold text-error">
                    Transfer Ownership
                  </h2>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">
                  Transfer protocol ownership to a new address. This action is
                  irreversible.
                </p>
                <div className="space-y-3 max-w-xl">
                  <input
                    className="w-full bg-surface-highest border-none rounded-xl px-4 py-3 text-sm font-mono outline-none text-primary placeholder:text-on-surface-variant/30"
                    placeholder="New Owner Address (0x...)"
                    type="text"
                    value={newOwnerInput}
                    onChange={(e) => setNewOwnerInput(e.target.value)}
                    disabled={disabled}
                  />
                  <button
                    className="w-full py-3 border border-error/40 text-error hover:bg-error/10 transition-all font-bold text-xs rounded-xl uppercase tracking-widest disabled:opacity-50"
                    disabled={
                      disabled ||
                      isBusy(transferTx) ||
                      !newOwnerInput ||
                      !newOwnerInput.startsWith("0x") ||
                      newOwnerInput.length !== 42
                    }
                    onClick={handleTransferOwnership}
                  >
                    {isBusy(transferTx)
                      ? "Processing..."
                      : "Transfer Ownership"}
                  </button>
                  <TxBadge status={transferTx} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
