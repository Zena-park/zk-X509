import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { decodeResult, decodeResultFull, type Call3Result } from "../src/multicall";

// Round-trip through ethers' own encoder so the test validates that the decode
// helpers read the same bytes the chain would return. Mirrors the registry
// shapes the SDK decodes (incl. registryInfo's multi-return + named access).
const iface = new ethers.Interface([
  "function isVerified(address) view returns (bool)",
  "function verifiedUntil(address) view returns (uint64)",
  "function caMerkleRoot() view returns (bytes32)",
  "function registryInfo(address) view returns (address creator, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 maxProofAge, uint256 createdAt, uint256 vKeyVersion)",
]);

function ok(fn: string, values: unknown[]): Call3Result {
  return { success: true, returnData: iface.encodeFunctionResult(fn, values) };
}

describe("decodeResult", () => {
  it("decodes a bool", () => {
    expect(decodeResult<boolean>(iface, "isVerified", ok("isVerified", [true]), false)).toBe(true);
  });

  it("decodes a uint64 as bigint", () => {
    expect(decodeResult<bigint>(iface, "verifiedUntil", ok("verifiedUntil", [BigInt(1802703599)]), BigInt(0))).toBe(BigInt(1802703599));
  });

  it("returns the fallback on a failed/empty sub-call", () => {
    expect(decodeResult<boolean>(iface, "isVerified", { success: false, returnData: "0x" }, false)).toBe(false);
    expect(decodeResult<string>(iface, "caMerkleRoot", { success: true, returnData: "0x" }, ethers.ZeroHash)).toBe(ethers.ZeroHash);
    expect(decodeResult<boolean>(iface, "isVerified", undefined, false)).toBe(false);
  });
});

describe("decodeResultFull (registryInfo, multi-return)", () => {
  const creator = "0x1111111111111111111111111111111111111111";

  it("exposes named + positional access matching the client's usage", () => {
    const info = decodeResultFull(iface, "registryInfo", ok("registryInfo", [creator, "Acme CA", 5, 3, BigInt(3600), BigInt(1700000000), BigInt(1)]));
    expect(info).not.toBeNull();
    expect(info!.creator).toBe(creator);
    expect(info![0]).toBe(creator);
    expect(info!.name).toBe("Acme CA");
    expect(Number(info!.maxWallets ?? info![2])).toBe(5);
    expect(Number(info!.minDisclosureMask ?? info![3])).toBe(3);
  });

  it("returns null on a failed sub-call", () => {
    expect(decodeResultFull(iface, "registryInfo", { success: false, returnData: "0x" })).toBeNull();
  });
});
