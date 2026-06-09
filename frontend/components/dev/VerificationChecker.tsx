"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { Loader2, ShieldCheck, ShieldX, Search } from "lucide-react";
import { IDENTITY_REGISTRY_ABI } from "@/lib/contract";
import { multicall, decodeResult } from "@/lib/multicall";

// Read-only demo: a public Sepolia RPC so developers can try a check without
// connecting a wallet. Mirrors what the SDK/CLI does by default. The main app
// reads through the connected wallet; this is a standalone developer utility.
const DEMO_RPC = "https://ethereum-sepolia.publicnode.com";
const DEFAULT_REGISTRY = "0x3cF6A96f1970053ffDf957074F988aD53D13ada3"; // Sepolia "Users"

interface Result {
  verified: boolean;
  until: Date | null;
}

export function VerificationChecker() {
  const [wallet, setWallet] = useState("");
  const [registry, setRegistry] = useState(DEFAULT_REGISTRY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setError(null);
    setResult(null);
    if (!ethers.isAddress(wallet)) return setError("Enter a valid wallet address.");
    if (!ethers.isAddress(registry)) return setError("Enter a valid registry address.");
    setLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(DEMO_RPC);
      const iface = new ethers.Interface(IDENTITY_REGISTRY_ABI);
      const res = await multicall(provider, [
        { target: registry, callData: iface.encodeFunctionData("isVerified", [wallet]) },
        { target: registry, callData: iface.encodeFunctionData("verifiedUntil", [wallet]) },
      ]);
      const verified = decodeResult<boolean>(iface, "isVerified", res[0], false);
      const ts = Number(decodeResult<bigint>(iface, "verifiedUntil", res[1], BigInt(0)));
      setResult({ verified, until: ts > 0 ? new Date(ts * 1000) : null });
    } catch {
      setError("Read failed — check the addresses and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-outline-variant/10">
      <div className="flex items-center gap-2 mb-4">
        <Search className="w-4 h-4 text-tertiary" />
        <h3 className="font-headline font-bold text-on-surface">Try it — check a wallet</h3>
        <span className="ml-auto text-[10px] uppercase tracking-widest font-label text-on-surface-variant/60">Sepolia · read-only</span>
      </div>

      <label className="block text-xs font-label text-on-surface-variant mb-1">Wallet address</label>
      <input
        value={wallet}
        onChange={(e) => setWallet(e.target.value.trim())}
        placeholder="0x…"
        className="w-full mb-3 px-3 py-2 rounded-lg bg-surface-container-low/60 border border-outline-variant/20 text-sm font-mono text-on-surface focus:outline-none focus:border-tertiary/50"
      />

      <label className="block text-xs font-label text-on-surface-variant mb-1">Registry address</label>
      <input
        value={registry}
        onChange={(e) => setRegistry(e.target.value.trim())}
        placeholder="0x…"
        className="w-full mb-4 px-3 py-2 rounded-lg bg-surface-container-low/60 border border-outline-variant/20 text-sm font-mono text-on-surface focus:outline-none focus:border-tertiary/50"
      />

      <button
        type="button"
        onClick={check}
        disabled={loading}
        className="w-full px-5 py-2.5 bg-primary text-surface font-headline font-bold text-sm rounded-full active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Checking…" : "Check verification"}
      </button>

      {error && <p className="mt-3 text-sm text-error">{error}</p>}

      {result && (
        <div
          className={`mt-4 flex items-center gap-3 p-3 rounded-xl border ${
            result.verified ? "border-secondary/30 bg-secondary/5" : "border-outline-variant/20 bg-surface-container-low/40"
          }`}
        >
          {result.verified ? (
            <ShieldCheck className="w-6 h-6 text-secondary shrink-0" />
          ) : (
            <ShieldX className="w-6 h-6 text-on-surface-variant shrink-0" />
          )}
          <div className="text-sm">
            <div className="font-headline font-bold text-on-surface">
              {result.verified ? "Verified" : "Not verified"}
            </div>
            {result.verified && result.until && (
              <div className="text-on-surface-variant text-xs">Expires {result.until.toLocaleDateString()}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
