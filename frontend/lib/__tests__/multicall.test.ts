import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { decodeResult, decodeResultFull, type Call3Result } from "../multicall";

// Mirrors the real IdentityRegistry / RegistryFactory return shapes the app
// decodes via multicall. We round-trip through ethers' own encoder so the test
// validates that decodeResult/decodeResultFull read the same bytes the chain
// would return.
const iface = new ethers.Interface([
  "function paused() view returns (bool)",
  "function getCaCount() view returns (uint256)",
  "function requiredCountry() view returns (bytes32)",
  "function isVerified(address) view returns (bool)",
  "function registryInfo(address) view returns (address creator, string name, uint32 maxWallets, uint8 minDisclosureMask, uint256 maxProofAge, uint256 createdAt, uint256 vKeyVersion)",
]);

function ok(fn: string, values: unknown[]): Call3Result {
  return { success: true, returnData: iface.encodeFunctionResult(fn, values) };
}

describe("decodeResult (single-return functions)", () => {
  it("decodes a bool", () => {
    expect(decodeResult<boolean>(iface, "paused", ok("paused", [true]), false)).toBe(true);
  });

  it("decodes a uint256 as bigint", () => {
    expect(decodeResult<bigint>(iface, "getCaCount", ok("getCaCount", [BigInt(42)]), BigInt(0))).toBe(BigInt(42));
  });

  it("decodes a bytes32", () => {
    const root = "0x" + "ab".repeat(32);
    expect(decodeResult<string>(iface, "requiredCountry", ok("requiredCountry", [root]), ethers.ZeroHash)).toBe(root);
  });

  it("returns the fallback on a failed sub-call", () => {
    expect(decodeResult<boolean>(iface, "isVerified", { success: false, returnData: "0x" }, false)).toBe(false);
  });

  it("returns the fallback on empty returnData", () => {
    expect(decodeResult<bigint>(iface, "getCaCount", { success: true, returnData: "0x" }, BigInt(0))).toBe(BigInt(0));
  });

  it("returns the fallback when the result is undefined (index out of range)", () => {
    expect(decodeResult<boolean>(iface, "paused", undefined, false)).toBe(false);
  });
});

describe("decodeResultFull (multi-return registryInfo)", () => {
  const creator = "0x1111111111111111111111111111111111111111";
  const values = [creator, "Acme CA", 5, 3, BigInt(3600), BigInt(1700000000), BigInt(1)];

  it("exposes both named and positional access matching the app's usage", () => {
    const info = decodeResultFull(iface, "registryInfo", ok("registryInfo", values));
    expect(info).not.toBeNull();
    // app reads: info.creator ?? info[0], info.name ?? info[1], info.maxWallets ?? info[2], info.minDisclosureMask ?? info[3]
    expect(info!.creator).toBe(creator);
    expect(info![0]).toBe(creator);
    expect(info!.name).toBe("Acme CA");
    expect(info![1]).toBe("Acme CA");
    expect(Number(info!.maxWallets ?? info![2])).toBe(5);
    expect(Number(info!.minDisclosureMask ?? info![3])).toBe(3);
  });

  it("returns null on a failed sub-call", () => {
    expect(decodeResultFull(iface, "registryInfo", { success: false, returnData: "0x" })).toBeNull();
  });
});
