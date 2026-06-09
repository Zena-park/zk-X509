"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { ethers } from "ethers";
import { IDENTITY_REGISTRY_ABI, getRegistryAddress } from "./contract";
import { multicall, decodeResult } from "./multicall";

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
  delegatedProvingRequired: boolean;
}

interface WalletContext {
  account: string | null;
  chainId: string | null;
  chainName: string;
  /** Chain the service is deployed on (NEXT_PUBLIC_CHAIN_ID). */
  expectedChainId: string;
  /** Wallet connected but on a different chain than the service is deployed on. */
  isWrongNetwork: boolean;
  registryAddr: string;
  isOwner: boolean;
  contractState: ContractState | null;
  /**
   * The connected wallet's node (MetaMask), used for ALL reads. There is no
   * separate operator RPC — reads and writes share this one provider, so they
   * can never target different chains. Null until a wallet is connected.
   */
  browserProvider: ethers.BrowserProvider | null;
  readContract: ethers.Contract | null;
  writeContract: ethers.Contract | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Prompt the wallet to switch to expectedChainId. */
  switchNetwork: () => Promise<void>;
  refresh: () => void;
}

/** Chain the service is deployed on — reads/writes must happen here. */
export const EXPECTED_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "31337";

const WalletCtx = createContext<WalletContext>({
  account: null,
  chainId: null,
  chainName: "",
  expectedChainId: EXPECTED_CHAIN_ID,
  isWrongNetwork: false,
  registryAddr: "",
  isOwner: false,
  contractState: null,
  browserProvider: null,
  readContract: null,
  writeContract: null,
  connect: async () => {},
  disconnect: () => {},
  switchNetwork: async () => {},
  refresh: () => {},
});

export function useWallet() {
  return useContext(WalletCtx);
}

export function getChainName(id: string): string {
  switch (id) {
    case "1": return "Ethereum";
    case "11155111": return "Sepolia";
    case "31337": return "Localhost";
    default: return `Chain ${id}`;
  }
}

export function WalletProvider({ children, registryOverride }: { children: ReactNode; registryOverride?: string }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [chainName, setChainName] = useState("");
  const [registryAddr, setRegistryAddr] = useState("");
  const [browserProvider, setBrowserProvider] = useState<ethers.BrowserProvider | null>(null);
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
        // Single provider for the whole app: the connected wallet's node.
        // All node access (read AND write) flows through MetaMask — there is
        // no separate/operator RPC. Reads use the BrowserProvider directly,
        // writes use its signer. Same node ⇒ reads and writes never target
        // different chains. (Staleness after a tx is handled by refresh().)
        const bp = new ethers.BrowserProvider(window.ethereum!);
        const signer = await bp.getSigner();
        const network = await bp.getNetwork();
        const cid = network.chainId.toString();
        setChainId(cid);
        setChainName(getChainName(cid));
        // Expose the provider only once chainId is known, so consumers never
        // observe a non-null provider paired with a stale/null chainId.
        setBrowserProvider(bp);

        const addr = registryOverride || getRegistryAddress(cid);
        setRegistryAddr(addr);
        if (!addr || addr === ethers.ZeroAddress) return;

        const ro = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, bp);
        const rw = new ethers.Contract(addr, IDENTITY_REGISTRY_ABI, signer);
        setReadContract(ro);
        setWriteContract(rw);

        // Batch the contract-state reads into a single eth_call via Multicall3
        // (one round-trip through the wallet node instead of seven).
        const iface = new ethers.Interface(IDENTITY_REGISTRY_ABI);
        const stateFns = ["owner", "paused", "caMerkleRoot", "crlMerkleRoot", "maxProofAge", "MAX_WALLETS_PER_CERT", "delegatedProvingRequired"];
        const res = await multicall(bp, stateFns.map((fn) => ({ target: addr, callData: iface.encodeFunctionData(fn, []) })));
        const owner = decodeResult<string>(iface, "owner", res[0], ethers.ZeroAddress);
        setContractState({
          owner,
          paused: decodeResult<boolean>(iface, "paused", res[1], false),
          caMerkleRoot: decodeResult<string>(iface, "caMerkleRoot", res[2], ethers.ZeroHash),
          crlMerkleRoot: decodeResult<string>(iface, "crlMerkleRoot", res[3], ethers.ZeroHash),
          maxProofAge: decodeResult<bigint>(iface, "maxProofAge", res[4], BigInt(0)),
          MAX_WALLETS_PER_CERT: Number(decodeResult<bigint>(iface, "MAX_WALLETS_PER_CERT", res[5], BigInt(0))),
          delegatedProvingRequired: decodeResult<boolean>(iface, "delegatedProvingRequired", res[6], false),
        });
        setIsOwner(owner.toLowerCase() === account.toLowerCase());
      } catch (e) {
        console.error("Failed to load contract:", e);
      }
    })();
  }, [account, refreshKey, registryOverride]);

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

  // Auto-connect: restore previously connected wallet on page load
  useEffect(() => {
    if (!window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum!.request({ method: "eth_accounts" });
        if (accounts?.length > 0) setAccount(accounts[0]);
      } catch (e) {
        console.error("Auto-connect failed:", e);
      }
    })();
  }, []);

  async function connect() {
    if (!window.ethereum) { alert("Please install MetaMask."); return; }
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
    setBrowserProvider(null);
    setReadContract(null);
    setWriteContract(null);
  }

  // Prompt the wallet to switch to the chain the service is deployed on.
  // Sepolia/mainnet are already known to MetaMask, so a plain switch works;
  // unknown chains (e.g. a local dev chain) are left to the user to add.
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    // EXPECTED_CHAIN_ID is a base-10 string; guard against a mis-set env
    // (empty / non-numeric / hex) that would otherwise build an invalid
    // "0xNaN" chainId and fail in a confusing way.
    const expected = Number(EXPECTED_CHAIN_ID);
    if (!Number.isInteger(expected) || expected <= 0) {
      console.error(`Invalid NEXT_PUBLIC_CHAIN_ID: "${EXPECTED_CHAIN_ID}"`);
      return;
    }
    const hexChainId = "0x" + expected.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (e) {
      console.error("Failed to switch network:", e);
    }
  }, []);

  const isWrongNetwork = account !== null && chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  return (
    <WalletCtx.Provider value={{
      account, chainId, chainName, expectedChainId: EXPECTED_CHAIN_ID, isWrongNetwork,
      registryAddr, isOwner, contractState, browserProvider, readContract, writeContract,
      connect, disconnect, switchNetwork, refresh,
    }}>
      {children}
    </WalletCtx.Provider>
  );
}
