"use client";

import { useCallback, useState } from "react";

interface UploadProps {
  disabled: boolean;
  onProofGenerated: (result: {
    nullifier: string;
    caRootHash: string;
    proof: string;
  }) => void;
}

export function Upload({ disabled, onProofGenerated }: UploadProps) {
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const handleDrop = useCallback(
    (setter: (f: File) => void) =>
      (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) setter(file);
      },
    []
  );

  const handleFileSelect = useCallback(
    (setter: (f: File) => void) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setter(file);
      },
    []
  );

  async function generateProof() {
    if (!certFile || !keyFile) {
      setStatus("인증서와 개인키 파일을 모두 업로드해주세요.");
      return;
    }

    setGenerating(true);
    setStatus("증명 생성 중... (로컬 프루버 서버에 요청 중)");

    try {
      // Read files as ArrayBuffer
      const certBytes = await certFile.arrayBuffer();
      const keyBytes = await keyFile.arrayBuffer();

      // Send to local prover server
      // MVP: localhost:8080 Rust prover server
      const response = await fetch("http://localhost:8080/prove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cert_der: Array.from(new Uint8Array(certBytes)),
          user_priv_key: Array.from(new Uint8Array(keyBytes)),
          password: password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Prover server error: ${response.statusText}`);
      }

      const result = await response.json();
      setStatus("증명 생성 완료!");
      onProofGenerated(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("fetch") || errorMsg.includes("Failed to fetch")) {
        setStatus("오류: 프루버 서버(localhost:8080)에 연결할 수 없습니다. 서버를 실행하세요.");
      } else {
        setStatus(`오류: ${errorMsg}`);
      }
    } finally {
      setPassword(""); // Clear password from memory immediately
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Certificate Upload */}
      <div
        onDrop={handleDrop(setCertFile)}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-lg border-2 border-dashed border-gray-700 p-4 text-center hover:border-gray-500"
      >
        <p className="text-sm text-gray-400">
          {certFile ? `인증서: ${certFile.name}` : "signCert.der 파일을 드래그하세요"}
        </p>
        <input
          type="file"
          accept=".der,.cer,.crt"
          onChange={handleFileSelect(setCertFile)}
          className="mt-2 text-sm"
        />
      </div>

      {/* Private Key Upload */}
      <div
        onDrop={handleDrop(setKeyFile)}
        onDragOver={(e) => e.preventDefault()}
        className="rounded-lg border-2 border-dashed border-gray-700 p-4 text-center hover:border-gray-500"
      >
        <p className="text-sm text-gray-400">
          {keyFile ? `개인키: ${keyFile.name}` : "signPri.key 파일을 드래그하세요"}
        </p>
        <input
          type="file"
          accept=".key,.der"
          onChange={handleFileSelect(setKeyFile)}
          className="mt-2 text-sm"
        />
      </div>

      {/* Password */}
      <input
        type="password"
        placeholder="인증서 비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />

      {/* Generate Proof Button */}
      <button
        onClick={generateProof}
        disabled={disabled || generating || !certFile || !keyFile}
        className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {generating ? "증명 생성 중..." : "ZK 증명 생성"}
      </button>

      {/* Status */}
      {status && (
        <p className="text-sm text-yellow-400">{status}</p>
      )}
    </div>
  );
}
