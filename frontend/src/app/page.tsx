"use client";

import { Upload } from "@/components/Upload";
import { WalletConnect } from "@/components/WalletConnect";
import { useState } from "react";
import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ABI,
  REGISTRY_ADDRESSES,
} from "@/contracts/IdentityRegistry";

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [proofResult, setProofResult] = useState<{
    nullifier: string;
    caRootHash: string;
    proof: string;
    public_values?: string;
  } | null>(null);
  const [txStatus, setTxStatus] = useState<string>("");
  const [isRegistered, setIsRegistered] = useState(false);

  async function registerOnChain() {
    if (!proofResult || !window.ethereum) return;

    setTxStatus("트랜잭션 전송 중...");

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const chainId = network.chainId.toString();

      const registryAddress = REGISTRY_ADDRESSES[chainId];
      if (!registryAddress || registryAddress === "0x0000000000000000000000000000000000000000") {
        setTxStatus(`체인 ${chainId}에 컨트랙트가 배포되지 않았습니다. Deploy.s.sol로 먼저 배포하세요.`);
        return;
      }

      const contract = new ethers.Contract(
        registryAddress,
        IDENTITY_REGISTRY_ABI,
        signer
      );

      // Send the register transaction
      const proofBytes = proofResult.proof;
      const publicValues = proofResult.public_values || "0x";

      const tx = await contract.register(proofBytes, publicValues);
      setTxStatus(`트랜잭션 전송됨: ${tx.hash.slice(0, 18)}...`);

      // Wait for confirmation
      const receipt = await tx.wait();
      setTxStatus(`등록 완료! 블록: ${receipt.blockNumber}`);
      setIsRegistered(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("UnsupportedCA")) {
        setTxStatus("오류: 지원되지 않는 CA입니다. 관리자에게 CA 등록을 요청하세요.");
      } else if (errorMsg.includes("AlreadyRegistered")) {
        setTxStatus("오류: 이미 등록된 인증서입니다.");
      } else if (errorMsg.includes("UserAlreadyVerified")) {
        setTxStatus("오류: 이미 인증된 지갑 주소입니다.");
      } else {
        setTxStatus(`오류: ${errorMsg}`);
      }
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

        {/* Step 1: Connect Wallet */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">
            1. 지갑 연결
          </h2>
          <WalletConnect onConnect={setAccount} />
          {account && (
            <p className="mt-2 text-sm text-green-400">
              연결됨: {account.slice(0, 6)}...{account.slice(-4)}
            </p>
          )}
        </section>

        {/* Step 2: Upload Certificate */}
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 text-lg font-semibold">
            2. 인증서 업로드 및 증명 생성
          </h2>
          <Upload
            disabled={!account}
            account={account}
            onProofGenerated={setProofResult}
          />
        </section>

        {/* Step 3: Register On-Chain */}
        {proofResult && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 text-lg font-semibold">
              3. 온체인 등록
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-gray-400">Nullifier:</span>{" "}
                <code className="text-blue-400">{proofResult.nullifier.slice(0, 18)}...</code>
              </p>
              <p>
                <span className="text-gray-400">CA Hash:</span>{" "}
                <code className="text-blue-400">{proofResult.caRootHash.slice(0, 18)}...</code>
              </p>
            </div>
            <button
              className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 font-medium hover:bg-blue-700 disabled:opacity-50"
              disabled={isRegistered}
              onClick={registerOnChain}
            >
              {isRegistered ? "등록 완료" : "블록체인에 등록하기"}
            </button>
            {txStatus && (
              <p className={`mt-2 text-sm ${txStatus.includes("오류") ? "text-red-400" : "text-yellow-400"}`}>
                {txStatus}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
