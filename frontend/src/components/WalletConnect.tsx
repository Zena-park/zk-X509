"use client";

import { useState } from "react";

interface WalletConnectProps {
  onConnect: (account: string) => void;
}

export function WalletConnect({ onConnect }: WalletConnectProps) {
  const [connecting, setConnecting] = useState(false);

  async function connectWallet() {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("MetaMask를 설치해주세요.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        onConnect(accounts[0]);
      }
    } catch (err) {
      console.error("Wallet connection failed:", err);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <button
      onClick={connectWallet}
      disabled={connecting}
      className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium hover:bg-indigo-700 disabled:opacity-50"
    >
      {connecting ? "연결 중..." : "MetaMask 연결"}
    </button>
  );
}

// Extend Window type for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<string[]>;
    };
  }
}
