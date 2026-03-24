"use client";

import { ProofInput } from "@/components/ProofInput";
import { useAccount } from "@/components/NavBar";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ABI,
  getRegistryAddress,
} from "@/contracts/IdentityRegistry";

export default function Home() {
  const { account } = useAccount();
  const [txStatus, setTxStatus] = useState<string>("");
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifiedExpiry, setVerifiedExpiry] = useState<string>("");
  const [mode, setMode] = useState<"register" | "reRegister">("register");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!account || !window.ethereum) return;

    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const network = await provider.getNetwork();
        const chainId = network.chainId.toString();
        const addr = getRegistryAddress(chainId);
        if (!addr || addr === ethers.ZeroAddress) return;

        const contract = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, provider);
        const isV = await contract.isVerified(account);
        setVerified(isV);

        if (isV) {
          const until: bigint = await contract.verifiedUntil(account);
          const date = new Date(Number(until) * 1000);
          setVerifiedExpiry(date.toLocaleDateString("ko-KR"));
        }
      } catch (e) {
        console.error("Failed to check verification status:", e);
      }
    })();
  }, [account]);

  async function submitProof(proof: string, publicValues: string) {
    if (!window.ethereum || submitting) return;

    setSubmitting(true);
    setTxStatus("트랜잭션 전송 중...");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const chainId = network.chainId.toString();

      const registryAddress = getRegistryAddress(chainId);
      if (!registryAddress || registryAddress === ethers.ZeroAddress) {
        setTxStatus(`체인 ${chainId}에 컨트랙트가 배포되지 않았습니다.`);
        return;
      }

      const contract = new ethers.Contract(
        registryAddress,
        IDENTITY_REGISTRY_ABI,
        signer
      );

      const tx = await contract.getFunction(mode)(proof, publicValues);
      setTxStatus(`트랜잭션 전송됨: ${tx.hash.slice(0, 18)}...`);

      const receipt = await tx.wait();
      setTxStatus(`등록 완료! 블록: ${receipt.blockNumber}`);
      setVerified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AlreadyRegistered")) {
        setTxStatus("오류: 이미 등록된 인증서입니다.");
      } else if (msg.includes("UserAlreadyVerified")) {
        setTxStatus("오류: 이미 인증된 지갑 주소입니다.");
      } else if (msg.includes("RegistrantMismatch")) {
        setTxStatus("오류: proof의 registrant와 현재 지갑 주소가 다릅니다.");
      } else if (msg.includes("ProofTooOld")) {
        setTxStatus("오류: proof가 만료되었습니다. 다시 생성하세요.");
      } else if (msg.includes("InvalidCaMerkleRoot")) {
        setTxStatus("오류: CA Merkle Root가 컨트랙트와 일치하지 않습니다.");
      } else if (msg.includes("NullifierRevoked")) {
        setTxStatus("오류: 해당 인증서는 폐기되었습니다.");
      } else if (msg.includes("CertAlreadyExpired")) {
        setTxStatus("오류: 인증서가 만료되었습니다.");
      } else if (msg.includes("ContractPaused")) {
        setTxStatus("오류: 서비스가 일시 중지 상태입니다.");
      } else {
        setTxStatus(`오류: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight">zk-X509</h1>
          <p className="mt-2 text-gray-400">
            공인인증서로 블록체인 신원 인증 — 개인정보 노출 없이
          </p>
        </div>

        {/* Verification Status */}
        {account && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-2 text-lg font-semibold">인증 상태</h2>
            {verified === true ? (
              <p className="text-sm text-green-400">
                인증됨 (만료: {verifiedExpiry})
              </p>
            ) : verified === false ? (
              <p className="text-sm text-gray-400">미인증</p>
            ) : (
              <p className="text-sm text-gray-500">확인 중...</p>
            )}
          </section>
        )}

        {/* Submit Proof */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">증명 제출</h2>
            <div className="flex gap-2 text-sm">
              <button
                onClick={() => setMode("register")}
                className={`rounded px-3 py-1 ${
                  mode === "register"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                등록
              </button>
              <button
                onClick={() => setMode("reRegister")}
                className={`rounded px-3 py-1 ${
                  mode === "reRegister"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                재등록
              </button>
            </div>
          </div>
          <ProofInput disabled={!account || submitting} onSubmit={submitProof} />
          {txStatus && (
            <p
              className={`mt-3 text-sm ${
                txStatus.includes("오류") ? "text-red-400" : "text-yellow-400"
              }`}
            >
              {txStatus}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
