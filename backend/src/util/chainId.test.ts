import { describe, it, expect } from "vitest";
import { coerceChainId } from "./chainId";

describe("coerceChainId", () => {
  it("accepts positive integer numbers", () => {
    expect(coerceChainId(1)).toBe(1);
    expect(coerceChainId(11155111)).toBe(11155111);
  });

  it("accepts digits-only strings", () => {
    expect(coerceChainId("1")).toBe(1);
    expect(coerceChainId("11155111")).toBe(11155111);
  });

  it("rejects zero and negatives", () => {
    expect(coerceChainId(0)).toBeNull();
    expect(coerceChainId(-1)).toBeNull();
    expect(coerceChainId("0")).toBeNull();
    expect(coerceChainId("-1")).toBeNull();
  });

  it("rejects fractional and non-numeric values", () => {
    expect(coerceChainId(1.5)).toBeNull();
    expect(coerceChainId("1.5")).toBeNull();
    expect(coerceChainId("0xaa36a7")).toBeNull(); // hex string not allowed
    expect(coerceChainId("abc")).toBeNull();
    expect(coerceChainId("")).toBeNull();
    expect(coerceChainId(" 1 ")).toBeNull(); // surrounding whitespace
  });

  it("rejects unsafe-large numbers, NaN and Infinity", () => {
    expect(coerceChainId(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
    expect(coerceChainId(NaN)).toBeNull();
    expect(coerceChainId(Infinity)).toBeNull();
  });

  it("rejects non-scalar / nullish inputs", () => {
    expect(coerceChainId(undefined)).toBeNull();
    expect(coerceChainId(null)).toBeNull();
    expect(coerceChainId(["1"])).toBeNull(); // e.g. repeated ?chainId= query param
    expect(coerceChainId({})).toBeNull();
    expect(coerceChainId(true)).toBeNull();
  });
});
