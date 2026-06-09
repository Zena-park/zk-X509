import { ethers } from "ethers";

/**
 * Multicall3 — same canonical address on Ethereum, Sepolia, and most chains.
 * https://www.multicall3.com/
 */
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[] returnData)",
];

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
 * Batch many read-only calls into a single `eth_call` via Multicall3. Falls
 * back to individual `eth_call`s (preserving per-call success flags) when
 * Multicall3 isn't deployed on the chain or the batch reverts.
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
    return Promise.all(
      calls.map(async (c) => {
        try {
          return { success: true, returnData: await provider.call({ to: c.target, data: c.callData }) };
        } catch {
          return { success: false, returnData: "0x" };
        }
      }),
    );
  }
}

/** Decode one result with a fallback for the failed/empty case. */
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

/** Decode the full Result of a multi-return function (e.g. registryInfo). */
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
