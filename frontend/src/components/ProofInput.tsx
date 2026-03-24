"use client";

import { useState } from "react";

interface ProofInputProps {
  disabled: boolean;
  onSubmit: (proof: string, publicValues: string) => void;
}

function isValidHex(value: string): boolean {
  const trimmed = value.trim();
  return /^0x[0-9a-fA-F]{2,}$/.test(trimmed) && trimmed.length % 2 === 0;
}

export function ProofInput({ disabled, onSubmit }: ProofInputProps) {
  const [proof, setProof] = useState("");
  const [publicValues, setPublicValues] = useState("");

  const proofValid = proof.trim() === "" || isValidHex(proof);
  const pvValid = publicValues.trim() === "" || isValidHex(publicValues);
  const canSubmit =
    !disabled &&
    proof.trim() !== "" &&
    publicValues.trim() !== "" &&
    isValidHex(proof) &&
    isValidHex(publicValues);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Proof (hex)</label>
        <textarea
          rows={3}
          placeholder="0x..."
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          className={`w-full rounded-lg border bg-gray-800 px-4 py-3 text-sm text-white font-mono placeholder-gray-500 focus:outline-none ${
            proofValid
              ? "border-gray-700 focus:border-blue-500"
              : "border-red-500"
          }`}
        />
        {!proofValid && (
          <p className="mt-1 text-xs text-red-400">
            올바른 hex 형식이 아닙니다 (0x...)
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Public Values (hex)
        </label>
        <textarea
          rows={3}
          placeholder="0x..."
          value={publicValues}
          onChange={(e) => setPublicValues(e.target.value)}
          className={`w-full rounded-lg border bg-gray-800 px-4 py-3 text-sm text-white font-mono placeholder-gray-500 focus:outline-none ${
            pvValid
              ? "border-gray-700 focus:border-blue-500"
              : "border-red-500"
          }`}
        />
        {!pvValid && (
          <p className="mt-1 text-xs text-red-400">
            올바른 hex 형식이 아닙니다 (0x...)
          </p>
        )}
      </div>

      <p className="text-xs text-gray-500">
        CLI에서 <code>cargo run --release -- --prove ...</code> 실행 후 출력된
        값을 붙여넣으세요.
      </p>

      <button
        onClick={() => onSubmit(proof.trim(), publicValues.trim())}
        disabled={!canSubmit}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        트랜잭션 전송
      </button>
    </div>
  );
}
