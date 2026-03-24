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
  const [txState, setTxState] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
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
          setVerifiedExpiry(`${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR")}`);
        }
      } catch (e) {
        console.error("Failed to check verification status:", e);
      }
    })();
  }, [account]);

  async function submitProof(proof: string, publicValues: string) {
    if (!window.ethereum || submitting) return;

    setSubmitting(true);
    setTxState("pending");
    setTxStatus("서명 대기 중...");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const chainId = network.chainId.toString();

      const registryAddress = getRegistryAddress(chainId);
      if (!registryAddress || registryAddress === ethers.ZeroAddress) {
        setTxState("error");
        setTxStatus(`체인 ${chainId}에 컨트랙트가 배포되지 않았습니다.`);
        return;
      }

      const contract = new ethers.Contract(registryAddress, IDENTITY_REGISTRY_ABI, signer);
      const tx = await contract.getFunction(mode)(proof, publicValues);
      setTxState("confirming");
      setTxStatus(`전송됨: ${tx.hash.slice(0, 18)}... 확인 대기 중`);

      await tx.wait();
      setTxState("success");
      setTxStatus(`완료: ${tx.hash.slice(0, 18)}...`);
      setVerified(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("user rejected")) { setTxState("idle"); setTxStatus(""); setSubmitting(false); return; }
      setTxState("error");
      if (msg.includes("AlreadyRegistered")) setTxStatus("이미 등록된 인증서입니다.");
      else if (msg.includes("UserAlreadyVerified")) setTxStatus("이미 인증된 지갑 주소입니다.");
      else if (msg.includes("RegistrantMismatch")) setTxStatus("proof의 registrant와 현재 지갑 주소가 다릅니다.");
      else if (msg.includes("ProofTooOld")) setTxStatus("proof가 만료되었습니다. 다시 생성하세요.");
      else if (msg.includes("InvalidCaMerkleRoot")) setTxStatus("CA Merkle Root가 컨트랙트와 일치하지 않습니다.");
      else if (msg.includes("NullifierRevoked")) setTxStatus("해당 인증서는 폐기되었습니다.");
      else if (msg.includes("CertAlreadyExpired")) setTxStatus("인증서가 만료되었습니다.");
      else if (msg.includes("ContractPaused")) setTxStatus("서비스가 일시 중지 상태입니다.");
      else setTxStatus(msg.slice(0, 120));
    } finally {
      setSubmitting(false);
    }
  }

  const txColor = { idle: "", pending: "text-yellow-400", confirming: "text-blue-400", success: "text-emerald-400", error: "text-red-400" }[txState];

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-8 w-full flex-1 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">신원 인증</h1>
        <p className="text-zinc-400 text-sm mt-1">공인인증서로 블록체인 신원 인증 — 개인정보 노출 없이</p>
      </div>

      {!account && (
        <div className="text-center py-20 text-zinc-500">지갑을 연결하세요.</div>
      )}

      {account && (
        <>
          {/* Status Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
              <span className="text-sm font-medium text-zinc-400">인증 상태</span>
              <div className="flex items-center gap-3 mt-4">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border ${
                  verified
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-zinc-800 border-zinc-700"
                }`}>
                  <span className={`text-xl ${verified ? "text-emerald-500" : "text-zinc-500"}`}>
                    {verified ? "●" : "○"}
                  </span>
                </div>
                <div>
                  <div className="text-xl font-bold text-white">
                    {verified === null ? "확인 중..." : verified ? "인증됨" : "미인증"}
                  </div>
                  {verified && verifiedExpiry && (
                    <div className="text-xs text-zinc-500">만료: {verifiedExpiry}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-5">
              <span className="text-sm font-medium text-zinc-400">연결된 지갑</span>
              <div className="font-mono text-sm text-cyan-400 bg-black/30 p-2.5 rounded-lg border border-white/5 break-all mt-3">
                {account}
              </div>
            </div>
          </div>

          {/* Proof Submission */}
          <div className="bg-zinc-900/60 backdrop-blur border border-white/[0.08] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">증명 제출</h2>
              <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                <button
                  onClick={() => setMode("register")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "register"
                      ? "text-white bg-white/10 shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  등록
                </button>
                <button
                  onClick={() => setMode("reRegister")}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === "reRegister"
                      ? "text-white bg-white/10 shadow-sm"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  재등록
                </button>
              </div>
            </div>

            <ProofInput disabled={!account || submitting} onSubmit={submitProof} />

            {txStatus && (
              <p className={`mt-4 text-sm ${txColor}`}>{txStatus}</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
