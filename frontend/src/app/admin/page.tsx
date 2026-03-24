"use client";

import { useAccount } from "@/components/NavBar";
import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminActions } from "@/components/AdminActions";
import { UserLookup } from "@/components/UserLookup";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ABI,
  REGISTRY_ADDRESSES,
} from "@/contracts/IdentityRegistry";

export default function AdminPage() {
  const { account } = useAccount();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [readContract, setReadContract] = useState<ethers.Contract | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!account || !window.ethereum) return;

    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const chainId = network.chainId.toString();
        const addr = REGISTRY_ADDRESSES[chainId];
        if (!addr || addr === ethers.ZeroAddress) return;

        const readOnly = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, provider);
        const writable = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, signer);
        setReadContract(readOnly);
        setContract(writable);

        const owner = await readOnly.owner();
        setIsOwner(owner.toLowerCase() === account.toLowerCase());
        const paused = await readOnly.paused();
        setIsPaused(paused);
      } catch (e) {
        console.error("Failed to connect to contract:", e);
      }
    })();
  }, [account, refreshKey]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">관리자</h1>
          <p className="mt-1 text-gray-400 text-sm">IdentityRegistry 컨트랙트 관리</p>
          {isOwner && <p className="mt-1 text-xs text-yellow-400">Owner 권한</p>}
        </div>

        {/* Dashboard */}
        {readContract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-semibold">컨트랙트 상태</h2>
            <AdminDashboard key={refreshKey} contract={readContract} />
          </section>
        )}

        {/* Admin Actions */}
        {contract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-semibold">관리 기능</h2>
            <AdminActions
              contract={contract}
              isOwner={isOwner}
              isPaused={isPaused}
              onRefresh={refresh}
            />
          </section>
        )}

        {/* User Lookup */}
        {readContract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <h2 className="mb-3 text-lg font-semibold">사용자 조회</h2>
            <UserLookup contract={readContract} />
          </section>
        )}

        {!account && (
          <p className="text-center text-sm text-gray-500">
            지갑을 연결하세요.
          </p>
        )}
      </div>
    </main>
  );
}
