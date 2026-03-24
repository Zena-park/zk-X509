"use client";

import { useState, createContext, useContext, useEffect } from "react";
import { ethers } from "ethers";
import { getRegistryAddress } from "@/contracts/IdentityRegistry";

const AccountContext = createContext<{
  account: string | null;
  setAccount: (a: string | null) => void;
}>({ account: null, setAccount: () => {} });

export function useAccount() {
  return useContext(AccountContext);
}

export function NavBarProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [chainName, setChainName] = useState<string>("");
  const [registryAddr, setRegistryAddr] = useState<string>("");
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!account || !window.ethereum) return;
    (async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum!);
        const network = await provider.getNetwork();
        const cid = network.chainId.toString();
        setChainId(cid);
        setChainName(getChainName(cid));
        setRegistryAddr(getRegistryAddress(cid));
      } catch {
        // ignore
      }
    })();
  }, [account]);

  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask를 설치해주세요.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }

  function disconnect() {
    setAccount(null);
    setChainId(null);
    setChainName("");
    setRegistryAddr("");
    setShowMenu(false);
  }

  return (
    <AccountContext.Provider value={{ account, setAccount }}>
      <nav className="border-b border-gray-800 px-6 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="text-lg font-bold">zk-X509</a>
            <div className="flex gap-4 text-sm">
              <a href="/" className="text-gray-400 hover:text-white">사용자</a>
              <a href="/admin" className="text-gray-400 hover:text-white">관리자</a>
            </div>
          </div>

          {/* Wallet */}
          <div className="relative">
            {account ? (
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-mono text-green-400 hover:bg-gray-700"
              >
                {account.slice(0, 6)}...{account.slice(-4)}
              </button>
            ) : (
              <button
                onClick={connectWallet}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-700"
              >
                MetaMask 연결
              </button>
            )}

            {/* Dropdown Menu */}
            {showMenu && account && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-lg z-50">
                <button
                  onClick={disconnect}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-800"
                >
                  연결 해제
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Network + Contract Info */}
        {account && chainId && (
          <div className="mx-auto mt-2 flex max-w-4xl gap-4 text-xs text-gray-500">
            <span>Chain: {chainName} ({chainId})</span>
            {registryAddr && registryAddr !== ethers.ZeroAddress && (
              <span>Registry: {registryAddr.slice(0, 10)}...{registryAddr.slice(-8)}</span>
            )}
            {(!registryAddr || registryAddr === ethers.ZeroAddress) && (
              <span className="text-yellow-500">Registry 미배포</span>
            )}
          </div>
        )}
      </nav>
      {children}
    </AccountContext.Provider>
  );
}

function getChainName(chainId: string): string {
  switch (chainId) {
    case "1": return "Ethereum";
    case "11155111": return "Sepolia";
    case "31337": return "Localhost";
    default: return "Unknown";
  }
}
