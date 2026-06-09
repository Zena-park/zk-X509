"use client";

import { ethers } from "ethers";
import { useWallet } from "./wallet";

/**
 * Read-only provider = the connected wallet's node (MetaMask).
 *
 * All node access (read + write) goes through the user's wallet; there is no
 * separate/operator RPC. Returns null until a wallet is connected, so callers
 * must gate reads on a connected account/provider.
 */
export function useReadProvider(): ethers.BrowserProvider | null {
  return useWallet().browserProvider;
}
