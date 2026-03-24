"use client";

import { useState } from "react";
import { ethers } from "ethers";

interface AdminActionsProps {
  contract: ethers.Contract | null;
  isOwner: boolean;
  isPaused: boolean;
  onRefresh: () => void;
}

export function AdminActions({ contract, isOwner, isPaused, onRefresh }: AdminActionsProps) {
  const [status, setStatus] = useState("");
  const [caRoot, setCaRoot] = useState("");
  const [crlRoot, setCrlRoot] = useState("");
  const [proofAge, setProofAge] = useState(60); // minutes
  const [revokeNullifier, setRevokeNullifier] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [newOwner, setNewOwner] = useState("");

  async function sendTx(fn: () => Promise<ethers.TransactionResponse>, label: string) {
    setStatus(`${label} 전송 중...`);
    try {
      const tx = await fn();
      setStatus(`${label} 전송됨: ${tx.hash.slice(0, 18)}...`);
      await tx.wait();
      setStatus(`${label} 완료!`);
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`오류: ${msg}`);
    }
  }

  if (!contract) return null;

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
        <button
          disabled={!isOwner || !caRoot}
          onClick={() => sendTx(() => contract.updateCaMerkleRoot(caRoot), "CA Root")}
          className="mt-2 w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          업데이트
        </button>
      </Section>

      {/* CRL Merkle Root */}
      <Section title="CRL Merkle Root 업데이트">
        <input
          placeholder="0x... (0x0 = 비활성화)"
          value={crlRoot}
          onChange={(e) => setCrlRoot(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <button
          disabled={!isOwner || !crlRoot}
          onClick={() => sendTx(() => contract.updateCrlMerkleRoot(crlRoot), "CRL Root")}
          className="mt-2 w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          업데이트
        </button>
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
        <button
          disabled={!isOwner}
          onClick={() => sendTx(() => contract.setMaxProofAge(proofAge * 60), "Proof Age")}
          className="mt-2 w-full rounded bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          설정 ({proofAge}분 = {proofAge * 60}초)
        </button>
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
          placeholder="Reason (0x... or empty)"
          value={revokeReason}
          onChange={(e) => setRevokeReason(e.target.value)}
          className="mt-2 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
        />
        <button
          disabled={!isOwner || !revokeNullifier}
          onClick={() =>
            sendTx(
              () => contract.revokeIdentity(revokeNullifier, revokeReason || ethers.ZeroHash),
              "Revoke"
            )
          }
          className="mt-2 w-full rounded bg-red-600 px-3 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          폐기 (되돌릴 수 없음)
        </button>
      </Section>

      {/* Pause / Unpause */}
      <Section title="긴급 정지">
        <button
          disabled={!isOwner}
          onClick={() =>
            sendTx(
              () => (isPaused ? contract.unpause() : contract.pause()),
              isPaused ? "Unpause" : "Pause"
            )
          }
          className={`w-full rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${
            isPaused
              ? "bg-green-600 hover:bg-green-700"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {isPaused ? "서비스 재개 (Unpause)" : "긴급 정지 (Pause)"}
        </button>
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
          <button
            disabled={!isOwner || !newOwner}
            onClick={() => sendTx(() => contract.transferOwnership(newOwner), "Transfer")}
            className="flex-1 rounded bg-yellow-600 px-3 py-2 text-sm font-medium hover:bg-yellow-700 disabled:opacity-50"
          >
            이전 제안
          </button>
          <button
            onClick={() => sendTx(() => contract.acceptOwnership(), "Accept")}
            className="flex-1 rounded bg-green-600 px-3 py-2 text-sm font-medium hover:bg-green-700"
          >
            수락
          </button>
        </div>
      </Section>

      {status && (
        <p className={`text-sm ${status.includes("오류") ? "text-red-400" : "text-yellow-400"}`}>
          {status}
        </p>
      )}

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
