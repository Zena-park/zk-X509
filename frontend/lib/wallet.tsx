"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { ethers } from "ethers";
import { IDENTITY_REGISTRY_ABI, getRegistryAddress } from "./contract";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<string[]>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

interface ContractState {
  owner: string;
  paused: boolean;
  caMerkleRoot: string;
  crlMerkleRoot: string;
  maxProofAge: bigint;
  MAX_WALLETS_PER_CERT: number;
}

interface WalletContext {
  account: string | null;
  chainId: string | null;
  chainName: string;
  registryAddr: string;
  isOwner: boolean;
  contractState: ContractState | null;
  readContract: ethers.Contract | null;
  writeContract: ethers.Contract | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => void;
}

const WalletCtx = createContext<WalletContext>({
  account: null,
  chainId: null,
  chainName: "",
  registryAddr: "",
  isOwner: false,
  contractState: null,
  readContract: null,
  writeContract: null,
  connect: async () => {},
  disconnect: () => {},
  refresh: () => {},
});

export function useWallet() {
  return useContext(WalletCtx);
}

function getChainName(id: string): string {
  switch (id) {
    case "1": return "Ethereum";
    case "11155111": return "Sepolia";
    case "31337": return "Localhost";
    default: return `Chain ${id}`;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [chainName, setChainName] = useState("");
  const [registryAddr, setRegistryAddr] = useState("");
  const readProviderRef = useRef<ethers.JsonRpcProvider | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [contractState, setContractState] = useState<ContractState | null>(null);
  const [readContract, setReadContract] = useState<ethers.Contract | null>(null);
  const [writeContract, setWriteContract] = useState<ethers.Contract | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Load contract state
  useEffect(() => {
    if (!account || !window.ethereum) return;
    (async () => {
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum!);
        const signer = await browserProvider.getSigner();
        const network = await browserProvider.getNetwork();
        const cid = network.chainId.toString();
        setChainId(cid);
        setChainName(getChainName(cid));

        const addr = getRegistryAddress(cid);
        setRegistryAddr(addr);
        if (!addr || addr === ethers.ZeroAddress) return;

        // JsonRpcProvider for reads — avoids MetaMask BrowserProvider caching issues
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";
        if (!readProviderRef.current) {
          readProviderRef.current = new ethers.JsonRpcProvider(rpcUrl);
        }
        const readProvider = readProviderRef.current;
        const ro = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, readProvider);
        const rw = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, signer);
        setReadContract(ro);
        setWriteContract(rw);

        const [owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, MAX_WALLETS_PER_CERT] =
          await Promise.all([
            ro.owner(), ro.paused(), ro.caMerkleRoot(), ro.crlMerkleRoot(), ro.maxProofAge(), ro.MAX_WALLETS_PER_CERT(),
          ]);
        setContractState({ owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, MAX_WALLETS_PER_CERT: Number(MAX_WALLETS_PER_CERT) });
        setIsOwner(owner.toLowerCase() === account.toLowerCase());
      } catch (e) {
        console.error("Failed to load contract:", e);
      }
    })();
  }, [account, refreshKey]);

  // MetaMask events
  useEffect(() => {
    const eth = window.ethereum as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    } | undefined;
    if (!eth?.on) return;

    const onChainChanged = () => window.location.reload();
    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts?.length > 0) setAccount(accounts[0]);
      else setAccount(null);
    };
    eth.on("chainChanged", onChainChanged);
    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      eth.removeListener?.("chainChanged", onChainChanged);
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, []);

  async function connect() {
    if (!window.ethereum) { alert("MetaMask를 설치해주세요."); return; }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (accounts?.length > 0) setAccount(accounts[0]);
    } catch (e) {
      console.error("Connect failed:", e);
    }
  }

  function disconnect() {
    setAccount(null);
    setChainId(null);
    setChainName("");
    setRegistryAddr("");
    setIsOwner(false);
    setContractState(null);
    setReadContract(null);
    setWriteContract(null);
  }

  return (
    <WalletCtx.Provider value={{
      account, chainId, chainName, registryAddr, isOwner,
      contractState, readContract, writeContract,
      connect, disconnect, refresh,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}
