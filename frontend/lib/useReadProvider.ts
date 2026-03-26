"use client";

import { useMemo } from "react";
import { ethers } from "ethers";
import { getRpcUrl } from "./contract";

/**
 * Shared read-only JsonRpcProvider hook.
 *
 * Returns a stable provider instance that persists across re-renders.
 * Uses useMemo (not useRef) to avoid side effects during render phase.
 * Safe for React Strict Mode and concurrent features.
 */
export function useReadProvider(): ethers.JsonRpcProvider {
  return useMemo(() => new ethers.JsonRpcProvider(getRpcUrl()), []);
}
