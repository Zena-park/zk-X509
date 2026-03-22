"use client";

import { useEffect, useState } from "react";

interface CertInfo {
  subject: string;
  issuer: string;
  serial_hex: string;
  expires: string;
}

interface UploadProps {
  disabled: boolean;
  account: string | null;
  onProofGenerated: (result: {
    nullifier: string;
    caRootHash: string;
    proof: string;
    public_values?: string;
  }) => void;
}

export function Upload({ disabled, account, onProofGenerated }: UploadProps) {
  const [certs, setCerts] = useState<CertInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const proverUrl = process.env.NEXT_PUBLIC_PROVER_URL || "http://localhost:8080";

  // Load certificate list from prover server (scans NPKI directories)
  useEffect(() => {
    fetch(`${proverUrl}/certs`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data: CertInfo[]) => {
        setCerts(data);
        if (data.length > 0) setSelectedIndex(0);
      })
      .catch((err) => {
        console.error("Failed to load certs:", err);
        setStatus("프루버 서버에 연결할 수 없습니다. 서버를 실행하세요.");
      })
      .finally(() => setLoading(false));
  }, [proverUrl]);

  async function generateProof() {
    if (selectedIndex < 0) {
      setStatus("인증서를 선택해주세요.");
      return;
    }
    if (!account) {
      setStatus("지갑을 먼저 연결해주세요.");
      return;
    }

    setGenerating(true);
    setStatus("증명 생성 중...");

    try {
      const response = await fetch(`${proverUrl}/prove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cert_index: selectedIndex,
          password: password,
          registrant: account,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
      }

      const result = await response.json();
      setStatus("증명 생성 완료!");
      onProofGenerated(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`오류: ${msg}`);
    } finally {
      setPassword("");
      setGenerating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">인증서 목록을 불러오는 중...</p>;
  }

  return (
    <div className="space-y-4">
      {certs.length === 0 ? (
        <p className="text-sm text-yellow-400">
          인증서를 찾을 수 없습니다. NPKI 폴더를 확인하세요.
        </p>
      ) : (
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            인증서 선택 ({certs.length}개)
          </label>
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-blue-500 focus:outline-none"
          >
            {certs.map((cert, i) => (
              <option key={cert.serial_hex} value={i}>
                {cert.subject} ({cert.issuer})
              </option>
            ))}
          </select>
          {selectedIndex >= 0 && certs[selectedIndex] && (
            <p className="mt-1 text-xs text-gray-500">
              만료: {certs[selectedIndex].expires}
            </p>
          )}
        </div>
      )}

      <input
        type="password"
        placeholder="인증서 비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />

      <button
        onClick={generateProof}
        disabled={disabled || generating || selectedIndex < 0}
        className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {generating ? "증명 생성 중..." : "ZK 증명 생성"}
      </button>

      {status && (
        <p className={`text-sm ${status.includes("오류") ? "text-red-400" : "text-yellow-400"}`}>
          {status}
        </p>
      )}
    </div>
  );
}
