"use client";

import { useState } from "react";
import { ethers } from "ethers";

interface AdminActionsProps {
  contract: ethers.Contract | null;
  isOwner: boolean;
  isPaused: boolean;
  onRefresh: () => void;
}

type TxState = "idle" | "pending" | "confirming" | "success" | "error";

interface TxStatus {
  state: TxState;
  message: string;
}

const IDLE: TxStatus = { state: "idle", message: "" };

export function AdminActions({ contract, isOwner, isPaused, onRefresh }: AdminActionsProps) {
  const [caRoot, setCaRoot] = useState("");
  const [caTx, setCaTx] = useState<TxStatus>(IDLE);

  const [crlRoot, setCrlRoot] = useState("");
  const [crlTx, setCrlTx] = useState<TxStatus>(IDLE);

  const [proofAge, setProofAge] = useState(60);
  const [proofAgeTx, setProofAgeTx] = useState<TxStatus>(IDLE);

  const [revokeNullifier, setRevokeNullifier] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeTx, setRevokeTx] = useState<TxStatus>(IDLE);

  const [pauseTx, setPauseTx] = useState<TxStatus>(IDLE);

  const [newOwner, setNewOwner] = useState("");
  const [ownerTx, setOwnerTx] = useState<TxStatus>(IDLE);

  async function sendTx(
    fn: () => Promise<ethers.TransactionResponse>,
    setTx: (s: TxStatus) => void,
  ) {
    setTx({ state: "pending", message: "트랜잭션 서명 대기 중..." });
    try {
      const tx = await fn();
      setTx({ state: "confirming", message: `전송됨: ${tx.hash.slice(0, 18)}... 확인 대기 중` });
      const receipt = await tx.wait();
      setTx({ state: "success", message: `완료! 블록: ${receipt?.blockNumber}` });
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("user rejected")) {
        setTx({ state: "idle", message: "" });
      } else {
        setTx({ state: "error", message: msg.slice(0, 200) });
      }
    }
  }

  if (!contract) return null;

  const busy = (tx: TxStatus) => tx.state === "pending" || tx.state === "confirming";

  return (
    <div className="space-y-6">
      {/* CA Merkle Root */}
      <Section title="CA Merkle Root 업데이트">
        <input
          placeholder="0x..."
          value={caRoot}
          onChange={(e) => setCaRoot(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <TxButton
          label="업데이트"
          disabled={!isOwner || !caRoot || busy(caTx)}
          loading={busy(caTx)}
          onClick={() => sendTx(() => contract.updateCaMerkleRoot(caRoot), setCaTx)}
        />
        <StatusLine tx={caTx} />
      </Section>

      {/* CRL Merkle Root */}
      <Section title="CRL Merkle Root 업데이트">
        <input
          placeholder="0x... (0x0000...0000 = 비활성화)"
          value={crlRoot}
          onChange={(e) => setCrlRoot(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <TxButton
          label="업데이트"
          disabled={!isOwner || !crlRoot || busy(crlTx)}
          loading={busy(crlTx)}
          onClick={() => sendTx(() => contract.updateCrlMerkleRoot(crlRoot), setCrlTx)}
        />
        <StatusLine tx={crlTx} />
      </Section>

      {/* Max Proof Age */}
      <Section title={`Max Proof Age: ${proofAge}분`}>
        <input
          type="range"
          min={5}
          max={1440}
          value={proofAge}
          onChange={(e) => setProofAge(Number(e.target.value))}
          className="w-full"
        />
        <TxButton
          label={`설정 (${proofAge}분 = ${proofAge * 60}초)`}
          disabled={!isOwner || busy(proofAgeTx)}
          loading={busy(proofAgeTx)}
          onClick={() => sendTx(() => contract.setMaxProofAge(proofAge * 60), setProofAgeTx)}
        />
        <StatusLine tx={proofAgeTx} />
      </Section>

      {/* Revoke Identity */}
      <Section title="신원 폐기">
        <input
          placeholder="Nullifier (0x...)"
          value={revokeNullifier}
          onChange={(e) => setRevokeNullifier(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <input
          placeholder="Reason (0x... 또는 비워두기)"
          value={revokeReason}
          onChange={(e) => setRevokeReason(e.target.value)}
          className="mt-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <TxButton
          label="폐기 (되돌릴 수 없음)"
          disabled={!isOwner || !revokeNullifier || busy(revokeTx)}
          loading={busy(revokeTx)}
          color="red"
          onClick={() =>
            sendTx(
              () => contract.revokeIdentity(revokeNullifier, revokeReason || ethers.ZeroHash),
              setRevokeTx
            )
          }
        />
        <StatusLine tx={revokeTx} />
      </Section>

      {/* Pause / Unpause */}
      <Section title="긴급 정지">
        <TxButton
          label={isPaused ? "서비스 재개 (Unpause)" : "긴급 정지 (Pause)"}
          disabled={!isOwner || busy(pauseTx)}
          loading={busy(pauseTx)}
          color={isPaused ? "green" : "red"}
          onClick={() =>
            sendTx(
              () => (isPaused ? contract.unpause() : contract.pause()),
              setPauseTx
            )
          }
        />
        <StatusLine tx={pauseTx} />
      </Section>

      {/* Transfer Ownership */}
      <Section title="소유권 이전">
        <input
          placeholder="새 owner 주소 (0x...)"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <div className="mt-2 flex gap-2">
          <TxButton
            label="이전 제안"
            disabled={!isOwner || !newOwner || busy(ownerTx)}
            loading={busy(ownerTx)}
            color="yellow"
            onClick={() => sendTx(() => contract.transferOwnership(newOwner), setOwnerTx)}
            className="flex-1"
          />
          <TxButton
            label="수락"
            disabled={busy(ownerTx)}
            loading={busy(ownerTx)}
            color="green"
            onClick={() => sendTx(() => contract.acceptOwnership(), setOwnerTx)}
            className="flex-1"
          />
        </div>
        <StatusLine tx={ownerTx} />
      </Section>

      {!isOwner && (
        <p className="text-sm text-yellow-400">
          읽기 전용 모드 — 연결된 지갑이 owner가 아닙니다.
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-300">{title}</h3>
      {children}
    </div>
  );
}

function TxButton({
  label, disabled, loading, color, onClick, className,
}: {
  label: string;
  disabled: boolean;
  loading: boolean;
  color?: string;
  onClick: () => void;
  className?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-600 hover:bg-blue-700",
    red: "bg-red-600 hover:bg-red-700",
    green: "bg-green-600 hover:bg-green-700",
    yellow: "bg-yellow-600 hover:bg-yellow-700",
  };
  const bg = colors[color || "blue"];
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`mt-2 w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${bg} ${className || ""}`}
    >
      {loading ? "처리 중..." : label}
    </button>
  );
}

function StatusLine({ tx }: { tx: TxStatus }) {
  if (!tx.message) return null;
  const colorMap: Record<TxState, string> = {
    idle: "",
    pending: "text-yellow-400",
    confirming: "text-blue-400",
    success: "text-green-400",
    error: "text-red-400",
  };
  return <p className={`mt-2 text-xs ${colorMap[tx.state]}`}>{tx.message}</p>;
}
