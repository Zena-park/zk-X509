import { describe, it, expect, beforeEach } from "vitest";
import { getReplayGuard, __resetReplayGuardForTest } from "./replayGuard";

// REGISTRY_STORE is unset here → the in-memory guard.
describe("replayGuard (in-memory)", () => {
  beforeEach(() => __resetReplayGuardForTest());

  it("allows first use and rejects a replay of the same key", async () => {
    const g = getReplayGuard();
    expect(await g.consume("sig-A", 600)).toBe(true);
    expect(await g.consume("sig-A", 600)).toBe(false); // replay within TTL
  });

  it("allows distinct keys", async () => {
    const g = getReplayGuard();
    expect(await g.consume("sig-1", 600)).toBe(true);
    expect(await g.consume("sig-2", 600)).toBe(true);
  });

  it("allows reuse once the TTL has elapsed", async () => {
    const g = getReplayGuard();
    // ttl 0 → expiresAt is in the past on the next check, so not a replay.
    expect(await g.consume("sig-X", 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(await g.consume("sig-X", 0)).toBe(true);
  });
});
