"use client";

import { useAccount } from "@/components/NavBar";
import { AdminDashboard } from "@/components/AdminDashboard";
import { AdminActions } from "@/components/AdminActions";
import { UserLookup } from "@/components/UserLookup";
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  IDENTITY_REGISTRY_ABI,
  getRegistryAddress,
} from "@/contracts/IdentityRegistry";

type Tab = "dashboard" | "manage" | "lookup";

export default function AdminPage() {
  const { account } = useAccount();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [readContract, setReadContract] = useState<ethers.Contract | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("dashboard");

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!account || !window.ethereum) return;

    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const chainId = network.chainId.toString();
        const addr = getRegistryAddress(chainId);
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "상태" },
    { id: "manage", label: "관리" },
    { id: "lookup", label: "조회" },
  ];

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">관리자</h1>
          <p className="mt-1 text-gray-400 text-sm">IdentityRegistry 컨트랙트 관리</p>
          {isOwner && <p className="mt-1 text-xs text-yellow-400">Owner 권한</p>}
        </div>

        {/* Tabs */}
        {account && (
          <div className="flex border-b border-gray-800">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-blue-500 text-white"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Tab Content */}
        {tab === "dashboard" && readContract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <AdminDashboard key={refreshKey} contract={readContract} />
          </section>
        )}

        {tab === "manage" && contract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <AdminActions
              contract={contract}
              isOwner={isOwner}
              isPaused={isPaused}
              onRefresh={refresh}
            />
          </section>
        )}

        {tab === "lookup" && readContract && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
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
