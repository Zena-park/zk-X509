"use client";

import { ethers } from "ethers";

/**
 * Multicall3 — canonical address, deployed at the same address on Ethereum,
 * Sepolia, and most chains. https://www.multicall3.com/
 */
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[] returnData)",
] as const;

export interface Call3 {
  target: string;
  callData: string;
  /** When false, a failed sub-call reverts the whole batch. Default true. */
  allowFailure?: boolean;
}

export interface Call3Result {
  success: boolean;
  returnData: string;
}

/**
 * Batch many read-only calls into a SINGLE eth_call via Multicall3.
 *
 * All reads in this app go through the connected wallet's node, so collapsing
 * N view calls into one request is the main efficiency lever (no per-call
 * round-trip / rate-limit pressure on the wallet RPC).
 *
 * Falls back to individual `eth_call`s — preserving per-call success flags —
 * when Multicall3 isn't deployed on the chain (e.g. a fresh local dev node)
 * or the aggregate reverts, so callers always get a well-formed result array.
 */
export async function multicall(
  provider: ethers.Provider,
  calls: Call3[],
): Promise<Call3Result[]> {
  if (calls.length === 0) return [];

  const payload = calls.map((c) => ({
    target: c.target,
    allowFailure: c.allowFailure ?? true,
    callData: c.callData,
  }));

  try {
    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);
    const results: Array<{ success: boolean; returnData: string }> = await mc.aggregate3(payload);
    return results.map((r) => ({ success: r.success, returnData: r.returnData }));
  } catch {
    // Multicall3 unavailable on this chain (or batch reverted) — fall back to
    // individual calls so reads still resolve.
    return Promise.all(
      calls.map(async (c) => {
        try {
          const returnData = await provider.call({ to: c.target, data: c.callData });
          return { success: true, returnData };
        } catch {
          return { success: false, returnData: "0x" };
        }
      }),
    );
  }
}

/**
 * Decode one Multicall3 result with a fallback for the `!success` / empty case
 * (mirrors the `.catch(() => default)` pattern used with individual calls).
 */
export function decodeResult<T>(
  iface: ethers.Interface,
  fn: string,
  result: Call3Result | undefined,
  fallback: T,
): T {
  if (!result || !result.success || result.returnData === "0x") return fallback;
  try {
    return iface.decodeFunctionResult(fn, result.returnData)[0] as T;
  } catch {
    return fallback;
  }
}

/**
 * Like `decodeResult` but returns the FULL decoded Result, for functions with
 * multiple named return values (e.g. `registryInfo`). Returns null on failure.
 */
export function decodeResultFull(
  iface: ethers.Interface,
  fn: string,
  result: Call3Result | undefined,
): ethers.Result | null {
  if (!result || !result.success || result.returnData === "0x") return null;
  try {
    return iface.decodeFunctionResult(fn, result.returnData);
  } catch {
    return null;
  }
}
