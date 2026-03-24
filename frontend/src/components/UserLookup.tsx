"use client";

import { useState } from "react";
import { ethers } from "ethers";

interface UserLookupProps {
  contract: ethers.Contract | null;
}

export function UserLookup({ contract }: UserLookupProps) {
  const [address, setAddress] = useState("");
  const [nullifier, setNullifier] = useState("");
  const [result, setResult] = useState<string | null>(null);

  async function lookupAddress() {
    if (!contract || !address) return;
    try {
      const verified = await contract.isVerified(address);
      if (verified) {
        const until: bigint = await contract.verifiedUntil(address);
        const date = new Date(Number(until) * 1000);
        setResult(`인증됨 (만료: ${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR")})`);
      } else {
        const until: bigint = await contract.verifiedUntil(address);
        if (until > BigInt(0)) {
          const date = new Date(Number(until) * 1000);
          setResult(`만료됨 (${date.toLocaleDateString("ko-KR")}에 만료)`);
        } else {
          setResult("미인증");
        }
      }
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function lookupNullifier() {
    if (!contract || !nullifier) return;
    try {
      const owner = await contract.nullifierOwner(nullifier);
      const revoked = await contract.revokedNullifiers(nullifier);
      if (owner === ethers.ZeroAddress) {
        setResult("미등록 nullifier");
      } else {
        setResult(`Owner: ${owner}${revoked ? " (폐기됨)" : ""}`);
      }
    } catch (e) {
      setResult(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">주소로 조회</label>
        <div className="flex gap-2">
          <input
            placeholder="0x..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
          />
          <button
            onClick={lookupAddress}
            disabled={!address}
            className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600 disabled:opacity-50"
          >
            조회
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Nullifier로 조회</label>
        <div className="flex gap-2">
          <input
            placeholder="0x..."
            value={nullifier}
            onChange={(e) => setNullifier(e.target.value)}
            className="flex-1 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm font-mono text-white"
          />
          <button
            onClick={lookupNullifier}
            disabled={!nullifier}
            className="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600 disabled:opacity-50"
          >
            조회
          </button>
        </div>
      </div>

      {result && (
        <p className={`text-sm ${result.includes("오류") ? "text-red-400" : "text-blue-400"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
