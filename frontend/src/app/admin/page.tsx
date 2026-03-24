"use client";

import { useAccount } from "@/components/NavBar";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ABI,
  getRegistryAddress,
} from "@/contracts/IdentityRegistry";

type TxState = "idle" | "pending" | "confirming" | "success" | "error";
interface TxStatus { state: TxState; message: string; }
const IDLE: TxStatus = { state: "idle", message: "" };

interface ContractState {
  owner: string;
  paused: boolean;
  caMerkleRoot: string;
  crlMerkleRoot: string;
  maxProofAge: bigint;
  maxWalletsPerCert: number;
}

export default function AdminPage() {
  const { account } = useAccount();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [readContract, setReadContract] = useState<ethers.Contract | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [state, setState] = useState<ContractState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);

  // TX states
  const [caTx, setCaTx] = useState<TxStatus>(IDLE);
  const [crlTx, setCrlTx] = useState<TxStatus>(IDLE);
  const [ageTx, setAgeTx] = useState<TxStatus>(IDLE);
  const [revokeTx, setRevokeTx] = useState<TxStatus>(IDLE);
  const [pauseTx, setPauseTx] = useState<TxStatus>(IDLE);

  // Form values
  const [caRoot, setCaRoot] = useState("");
  const [crlRoot, setCrlRoot] = useState("");
  const [proofAge, setProofAge] = useState(60);
  const [revokeNullifier, setRevokeNullifier] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!account || !window.ethereum) return;
    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const chainId = network.chainId.toString();
        const addr = getRegistryAddress(chainId);
        if (!addr || addr === ethers.ZeroAddress) return;

        const ro = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, provider);
        const rw = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, signer);
        setReadContract(ro);
        setContract(rw);

        const [owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, maxWalletsPerCert] =
          await Promise.all([
            ro.owner(), ro.paused(), ro.caMerkleRoot(), ro.crlMerkleRoot(), ro.maxProofAge(), ro.maxWalletsPerCert(),
          ]);
        setState({ owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, maxWalletsPerCert });
        setIsOwner(owner.toLowerCase() === account.toLowerCase());
        setProofAge(Number(maxProofAge) / 60);
      } catch (e) {
        console.error("Failed to load:", e);
      }
    })();
  }, [account, refreshKey]);

  async function sendTx(fn: () => Promise<ethers.TransactionResponse>, setTx: (s: TxStatus) => void) {
    setTx({ state: "pending", message: "서명 대기 중..." });
    try {
      const tx = await fn();
      setTx({ state: "confirming", message: `전송됨: ${tx.hash.slice(0, 14)}...` });
      const receipt = await tx.wait();
      setTx({ state: "success", message: `완료: ${tx.hash.slice(0, 18)}...` });
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("user rejected")) { setTx(IDLE); return; }
      setTx({ state: "error", message: msg.slice(0, 120) });
    }
  }

  async function search() {
    if (!readContract || !searchQuery) return;
    try {
      if (searchQuery.length === 66) {
        // Nullifier lookup
        const owner = await readContract.nullifierOwner(searchQuery);
        const revoked = await readContract.revokedNullifiers(searchQuery);
        if (owner === ethers.ZeroAddress) { setSearchResult("미등록 nullifier"); return; }
        setSearchResult(`Owner: ${owner}${revoked ? " (폐기됨)" : ""}`);
      } else if (searchQuery.length === 42) {
        // Address lookup
        const verified = await readContract.isVerified(searchQuery);
        const until: bigint = await readContract.verifiedUntil(searchQuery);
        if (verified) {
          const date = new Date(Number(until) * 1000);
          setSearchResult(`인증됨 (만료: ${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR")})`);
        } else if (until > BigInt(0)) {
          setSearchResult(`만료됨`);
        } else {
          setSearchResult("미인증");
        }
      } else {
        setSearchResult("주소(0x, 42자) 또는 nullifier(0x, 66자)를 입력하세요");
      }
    } catch (e) {
      setSearchResult(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const busy = (tx: TxStatus) => tx.state === "pending" || tx.state === "confirming";
  const crlEnabled = state?.crlMerkleRoot && state.crlMerkleRoot !== ethers.ZeroHash;
  const sp1VerifierAddr = process.env.NEXT_PUBLIC_SP1_VERIFIER_ADDRESS || "";

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Identity Registry</h1>
            {isOwner && (
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                Owner
              </span>
            )}
          </div>
          <p className="text-zinc-400 text-sm">컨트랙트 상태 관리, 신원 검증, 접근 제어.</p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-96">
          <input
            type="text"
            placeholder="주소 또는 Nullifier 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="w-full bg-black/50 border border-zinc-700/50 text-white rounded-xl pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono placeholder:font-sans"
          />
          {searchResult && (
            <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm z-10">
              <span className={searchResult.includes("오류") ? "text-red-400" : "text-blue-400"}>{searchResult}</span>
              <button onClick={() => setSearchResult(null)} className="ml-2 text-zinc-500 hover:text-white">x</button>
            </div>
          )}
        </div>
      </div>

      {!account && (
        <div className="text-center py-20 text-zinc-500">지갑을 연결하세요.</div>
      )}

      {account && state && (
        <>
          {/* Row 1: Status Cards (2x2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusCard
              label="Contract Status"
              value={state.paused ? "Paused" : "Active"}
              sub={state.paused ? "Emergency Stop" : "Not Paused"}
              color={state.paused ? "red" : "green"}
            />
            <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-400">CA Merkle Root</span>
              </div>
              <div className="font-mono text-sm text-cyan-400 bg-black/30 p-2.5 rounded-lg border border-white/5 break-all mt-3">
                {state.caMerkleRoot === ethers.ZeroHash ? "Not set" : `${state.caMerkleRoot.slice(0, 22)}...`}
              </div>
            </div>
            <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-400">CRL Merkle Root</span>
              </div>
              <div className="bg-black/30 p-2.5 rounded-lg border border-white/5 mt-3">
                <span className={`font-mono text-sm ${crlEnabled ? "text-cyan-400" : "text-zinc-500"}`}>
                  {crlEnabled ? `${state.crlMerkleRoot.slice(0, 22)}...` : "Disabled"}
                </span>
              </div>
            </div>
            <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
              <span className="text-sm font-medium text-zinc-400">Configuration</span>
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs text-zinc-500">Max Proof Age</span>
                  <span className="text-sm font-medium text-white">{Number(state.maxProofAge) / 60} min</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs text-zinc-500">Max Wallets/Cert</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{state.maxWalletsPerCert}</span>
                    <span className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">immutable</span>
                  </div>
                </div>
                {sp1VerifierAddr && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">SP1 Verifier</span>
                    <span className="text-xs font-mono text-zinc-400">{sp1VerifierAddr.slice(0, 8)}...{sp1VerifierAddr.slice(-4)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Management + Danger Zone */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
            {/* Protocol Management */}
            <div className="lg:col-span-2 bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-6">Protocol Management</h2>
              <div className="space-y-6">
                {/* CA Root */}
                <ActionRow label="Update CA Merkle Root">
                  <div className="flex gap-3">
                    <input placeholder="0x..." value={caRoot} onChange={(e) => setCaRoot(e.target.value)}
                      className="flex-1 bg-black/40 border border-zinc-700 text-cyan-400 font-mono text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500" />
                    <ActionButton label="Update" loading={busy(caTx)} disabled={!isOwner || !caRoot || busy(caTx)}
                      onClick={() => sendTx(() => contract!.updateCaMerkleRoot(caRoot), setCaTx)} />
                  </div>
                  <TxLine tx={caTx} />
                </ActionRow>

                {/* CRL Root */}
                <ActionRow label="Update CRL Merkle Root">
                  <div className="flex gap-3">
                    <input placeholder="0x... (0x00...00 = disable)" value={crlRoot} onChange={(e) => setCrlRoot(e.target.value)}
                      className="flex-1 bg-black/40 border border-zinc-700 text-cyan-400 font-mono text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:border-indigo-500" />
                    <ActionButton label="Update" loading={busy(crlTx)} disabled={!isOwner || !crlRoot || busy(crlTx)} variant="secondary"
                      onClick={() => sendTx(() => contract!.updateCrlMerkleRoot(crlRoot), setCrlTx)} />
                  </div>
                  <TxLine tx={crlTx} />
                </ActionRow>

                {/* Proof Age */}
                <ActionRow label={`Set Max Proof Age: ${proofAge} min`}>
                  <div className="flex gap-3">
                    <input type="number" min={5} max={1440} value={proofAge} onChange={(e) => setProofAge(Number(e.target.value))}
                      className="w-24 bg-black/40 border border-zinc-700 text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                    <ActionButton label="Save" loading={busy(ageTx)} disabled={!isOwner || busy(ageTx)} variant="secondary"
                      onClick={() => sendTx(() => contract!.setMaxProofAge(proofAge * 60), setAgeTx)} />
                  </div>
                  <TxLine tx={ageTx} />
                </ActionRow>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-zinc-900/60 backdrop-blur border border-red-900/30 rounded-xl p-6 bg-gradient-to-b from-transparent to-red-950/10">
              <h2 className="text-lg font-semibold mb-4 text-red-400">Danger Zone</h2>
              <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                되돌릴 수 없는 위험한 작업입니다.
              </p>
              <div className="space-y-4">
                {/* Revoke */}
                <div className="p-4 border border-red-900/50 bg-red-950/20 rounded-xl space-y-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-200 mb-1">Revoke Identity</div>
                    <div className="text-xs text-zinc-500">영구적으로 신원을 폐기합니다.</div>
                  </div>
                  <input placeholder="Nullifier (0x...)" value={revokeNullifier} onChange={(e) => setRevokeNullifier(e.target.value)}
                    className="w-full bg-black/40 border border-zinc-700 text-white font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-red-500" />
                  <input placeholder="Reason (optional)" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)}
                    className="w-full bg-black/40 border border-zinc-700 text-white font-mono text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-red-500" />
                  <button
                    disabled={!isOwner || !revokeNullifier || busy(revokeTx)}
                    onClick={() => sendTx(() => contract!.revokeIdentity(revokeNullifier, revokeReason || ethers.ZeroHash), setRevokeTx)}
                    className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-medium rounded-lg text-sm transition-all disabled:opacity-50"
                  >
                    {busy(revokeTx) ? "처리 중..." : "Revoke"}
                  </button>
                  <TxLine tx={revokeTx} />
                </div>

                {/* Pause */}
                <div className="p-4 border border-red-900/50 bg-red-950/20 rounded-xl space-y-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-200 mb-1">
                      {state.paused ? "Resume Contract" : "Emergency Pause"}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {state.paused ? "서비스를 재개합니다." : "모든 등록 기능을 정지합니다."}
                    </div>
                  </div>
                  <button
                    disabled={!isOwner || busy(pauseTx)}
                    onClick={() => sendTx(() => (state.paused ? contract!.unpause() : contract!.pause()), setPauseTx)}
                    className={`w-full py-2 font-medium rounded-lg text-sm transition-all disabled:opacity-50 ${
                      state.paused
                        ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                        : "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                    }`}
                  >
                    {busy(pauseTx) ? "처리 중..." : state.paused ? "Unpause" : "Pause Contract"}
                  </button>
                  <TxLine tx={pauseTx} />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function StatusCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  const colors = {
    green: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-500" },
    red: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-500" },
  }[color] || { bg: "bg-zinc-800", text: "text-white" };
  return (
    <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
      <span className="text-sm font-medium text-zinc-400">{label}</span>
      <div className="flex items-center gap-3 mt-4">
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${colors.bg} border`}>
          <span className={`text-xl ${colors.text}`}>{color === "green" ? "●" : "■"}</span>
        </div>
        <div>
          <div className="text-xl font-bold text-white">{value}</div>
          <div className="text-xs text-zinc-500">{sub}</div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
      <label className="text-sm font-medium text-zinc-200">{label}</label>
      {children}
    </div>
  );
}

function ActionButton({ label, loading, disabled, onClick, variant }: {
  label: string; loading: boolean; disabled: boolean; onClick: () => void; variant?: string;
}) {
  const style = variant === "secondary"
    ? "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white"
    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.3)]";
  return (
    <button disabled={disabled} onClick={onClick}
      className={`px-6 py-2.5 text-sm font-medium rounded-lg transition-all disabled:opacity-50 ${style}`}>
      {loading ? "처리 중..." : label}
    </button>
  );
}

function TxLine({ tx }: { tx: TxStatus }) {
  if (!tx.message) return null;
  const c = { idle: "", pending: "text-yellow-400", confirming: "text-blue-400", success: "text-emerald-400", error: "text-red-400" }[tx.state];
  return <p className={`text-xs mt-1 ${c}`}>{tx.message}</p>;
}
