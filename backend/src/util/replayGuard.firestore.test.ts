import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Exercise the Firestore-backed guard with firebase-admin mocked: an atomic
// `create()` that throws ALREADY_EXISTS (code 6) on a duplicate key, and a
// transient (code 13) error for one sentinel key.
const created = new Set<string>();
vi.mock("firebase-admin/app", () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: (id: string) => ({
        create: async () => {
          if (id === "boom") throw Object.assign(new Error("unavailable"), { code: 13 });
          if (created.has(id)) throw Object.assign(new Error("exists"), { code: 6 });
          created.add(id);
        },
      }),
    }),
  }),
}));

import { getReplayGuard } from "./replayGuard";

describe("FirestoreReplayGuard (REGISTRY_STORE=firestore)", () => {
  const saved = process.env.REGISTRY_STORE;
  beforeAll(() => { process.env.REGISTRY_STORE = "firestore"; });
  afterAll(() => {
    if (saved === undefined) delete process.env.REGISTRY_STORE;
    else process.env.REGISTRY_STORE = saved;
  });
  beforeEach(() => created.clear());

  it("first consume succeeds, a replay (ALREADY_EXISTS) is rejected", async () => {
    const g = getReplayGuard();
    expect(await g.consume("k", 600)).toBe(true);
    expect(await g.consume("k", 600)).toBe(false);
  });

  it("propagates a non-ALREADY_EXISTS error (never silently allows)", async () => {
    const g = getReplayGuard();
    await expect(g.consume("boom", 600)).rejects.toThrow();
  });
});
