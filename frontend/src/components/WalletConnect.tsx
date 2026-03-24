"use client";

import { useState } from "react";

interface WalletConnectProps {
  account: string | null;
  onConnect: (account: string) => void;
}

export function WalletConnect({ account, onConnect }: WalletConnectProps) {
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

  if (account) {
    return (
      <span className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-mono text-green-400">
        {account.slice(0, 6)}...{account.slice(-4)}
      </span>
    );
  }

  return (
    <button
      onClick={connectWallet}
      disabled={connecting}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
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
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}
