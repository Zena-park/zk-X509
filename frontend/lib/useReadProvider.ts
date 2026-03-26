"use client";

import { useRef } from "react";
import { ethers } from "ethers";
import { getRpcUrl } from "./contract";

/**
 * Shared read-only JsonRpcProvider hook.
 *
 * Returns a stable provider instance that persists across re-renders.
 * Avoids creating a new provider on every render (which causes RPC
 * connection churn and MetaMask BrowserProvider caching issues).
 */
export function useReadProvider(): ethers.JsonRpcProvider {
  const ref = useRef<ethers.JsonRpcProvider | null>(null);
  if (!ref.current) {
    ref.current = new ethers.JsonRpcProvider(getRpcUrl());
  }
  return ref.current;
}
