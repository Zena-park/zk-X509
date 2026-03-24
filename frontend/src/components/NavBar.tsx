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
  const [chainMismatch, setChainMismatch] = useState(false);
  const expectedChainId = process.env.NEXT_PUBLIC_CHAIN_ID || "31337";

  async function updateNetwork() {
    if (!window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const cid = network.chainId.toString();
      setChainId(cid);
      setChainName(getChainName(cid));
      setRegistryAddr(getRegistryAddress(cid));
      setChainMismatch(cid !== expectedChainId);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!account) return;
    updateNetwork();
  }, [account]);

  useEffect(() => {
    const eth = window.ethereum as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    } | undefined;
    if (!eth?.on) return;
    const handleChainChanged = () => { window.location.reload(); };
    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts && accounts.length > 0) { setAccount(accounts[0]); } else { setAccount(null); }
    };
    eth.on("chainChanged", handleChainChanged);
    eth.on("accountsChanged", handleAccountsChanged);
    return () => {
      eth.removeListener?.("chainChanged", handleChainChanged);
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
    };
  }, []);

  async function connectWallet() {
    if (!window.ethereum) { alert("MetaMask를 설치해주세요."); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) { setAccount(accounts[0]); updateNetwork(); }
    } catch (err) { console.error("Wallet connection failed:", err); }
  }

  function disconnect() {
    setAccount(null); setChainId(null); setChainName(""); setRegistryAddr(""); setShowMenu(false);
  }

  const hasRegistry = registryAddr && registryAddr !== ethers.ZeroAddress;

  return (
    <AccountContext.Provider value={{ account, setAccount }}>
      <header className="border-b border-white/10 bg-black/20 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-8">
            <a href="/" className="text-xl font-bold tracking-tight">zk-X509</a>
            <nav className="hidden md:flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
              <NavTab href="/" label="사용자" />
              <NavTab href="/admin" label="관리자" />
            </nav>
          </div>

          {/* Right: Registry + Network + Wallet */}
          <div className="flex items-center gap-4">
            {/* Registry Address */}
            {account && hasRegistry && (
              <div className="hidden lg:flex flex-col items-end mr-2">
                <span className="text-[10px] text-zinc-500 font-mono">Registry</span>
                <span className="text-xs font-mono text-zinc-400">
                  {registryAddr.slice(0, 8)}...{registryAddr.slice(-4)}
                </span>
              </div>
            )}

            {account && <div className="h-8 w-px bg-white/10 hidden lg:block" />}

            {/* Network Badge */}
            {account && chainName && (
              <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full ${
                chainMismatch
                  ? "bg-red-950 border-red-800"
                  : "bg-zinc-900 border-zinc-800"
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  chainMismatch ? "bg-red-500" : "bg-emerald-500 shadow-[0_0_8px_#10b981]"
                }`} />
                <span className={`text-xs font-medium ${chainMismatch ? "text-red-300" : "text-zinc-300"}`}>
                  {chainName} ({chainId})
                </span>
              </div>
            )}

            {/* Wallet */}
            <div className="relative">
              {account ? (
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 rounded-full font-mono text-sm transition-all"
                >
                  {account.slice(0, 6)}...{account.slice(-4)}
                </button>
              ) : (
                <button
                  onClick={connectWallet}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-sm font-medium transition-all shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                >
                  MetaMask 연결
                </button>
              )}
              {showMenu && account && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-lg z-50">
                  <button
                    onClick={disconnect}
                    className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-zinc-800"
                  >
                    연결 해제
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chain mismatch warning */}
        {chainMismatch && (
          <div className="bg-red-950/50 border-t border-red-800/50 px-6 py-2 text-center text-xs text-red-300">
            네트워크 불일치 — MetaMask를 {getChainName(expectedChainId)} ({expectedChainId})로 전환하세요
          </div>
        )}
      </header>
      {children}
    </AccountContext.Provider>
  );
}

function NavTab({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-4 py-1.5 text-sm font-medium text-zinc-400 hover:text-white rounded-md transition-colors"
    >
      {label}
    </a>
  );
}

function getChainName(chainId: string): string {
  switch (chainId) {
    case "1": return "Ethereum";
    case "11155111": return "Sepolia";
    case "31337": return "Localhost";
    default: return `Chain ${chainId}`;
  }
}
