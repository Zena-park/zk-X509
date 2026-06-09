import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";
import { Wallet } from "ethers";

/// Route-level tests for the registry CMS — network scoping + owner-signature
/// auth. They run against the real Express app over the File store (DB pointed
/// at a temp file via REGISTRIES_DB_PATH). The on-chain owner lookup is mocked
/// so no RPC is needed; the "owner" is set per test via `mockOwner`.
vi.mock("../util/onchain", () => ({ getRegistryOwner: vi.fn() }));
// eslint-disable-next-line import/first
import { getRegistryOwner } from "../util/onchain";
// eslint-disable-next-line import/first
import { buildAuthMessage } from "../util/registryAuth";

const mockOwner = vi.mocked(getRegistryOwner);

let app: Express;
let dbDir: string;
const ENV_KEYS = ["REGISTRY_STORE", "REGISTRIES_DB_PATH"] as const;
const savedEnv: Record<string, string | undefined> = {};

const MAINNET = 1;
const SEPOLIA = 11155111;
const addrMainnet = "0xAAaa000000000000000000000000000000000001";
const addrSepolia = "0xbBbB000000000000000000000000000000000002";

// Deterministic wallets: `owner` is the registry owner, `stranger` is not.
const owner = new Wallet("0x" + "11".repeat(32));
const stranger = new Wallet("0x" + "22".repeat(32));

async function authFields(opts: {
  chainId: number;
  registry: string;
  operation: string;
  target?: string;
  ts?: number;
  wallet?: Wallet;
}): Promise<{ chainId: number; signature: string; signatureTimestamp: number }> {
  const signatureTimestamp = opts.ts ?? Math.floor(Date.now() / 1000);
  const message = buildAuthMessage({
    chainId: opts.chainId,
    registryAddress: opts.registry,
    operation: opts.operation,
    target: opts.target,
    signatureTimestamp,
  });
  const signature = await (opts.wallet ?? owner).signMessage(message);
  return { chainId: opts.chainId, signature, signatureTimestamp };
}

/** PUT metadata signed by the registry owner (owner lookup stubbed to `owner`). */
async function putAsOwner(addr: string, chainId: number, body: Record<string, unknown> = {}) {
  mockOwner.mockResolvedValue(owner.address.toLowerCase());
  const auth = await authFields({ chainId, registry: addr, operation: "update-metadata" });
  return request(app).put(`/api/registries/${addr}`).send({ ...body, ...auth });
}

beforeAll(async () => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-route-"));
  process.env.REGISTRY_STORE = "file";
  process.env.REGISTRIES_DB_PATH = path.join(dbDir, "registries.json");
  vi.resetModules();
  const mod = await import("./registries");
  const express = (await import("express")).default;
  app = express();
  app.use(express.json());
  app.use("/api/registries", mod.default);
});

afterAll(() => {
  if (dbDir) fs.rmSync(dbDir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("registries route — chainId network scoping (owner-signed writes)", () => {
  it("seeds entries via owner-signed PUT and stores chainId as a number", async () => {
    const r1 = await putAsOwner(addrMainnet, MAINNET, { listed: true });
    expect(r1.status).toBe(200);
    expect(r1.body.chainId).toBe(MAINNET);

    const r2 = await putAsOwner(addrSepolia, SEPOLIA, { listed: true });
    expect(r2.status).toBe(200);
    expect(r2.body.chainId).toBe(SEPOLIA);
  });

  it("GET without chainId lists every network", async () => {
    const res = await request(app).get("/api/registries");
    expect(res.status).toBe(200);
    expect(res.body.map((a: string) => a.toLowerCase()).sort()).toEqual(
      [addrMainnet, addrSepolia].map((a) => a.toLowerCase()).sort(),
    );
  });

  it("GET ?chainId= restricts to one network", async () => {
    const sep = await request(app).get(`/api/registries?chainId=${SEPOLIA}`);
    expect(sep.body.map((a: string) => a.toLowerCase())).toEqual([addrSepolia.toLowerCase()]);
    const main = await request(app).get(`/api/registries?chainId=${MAINNET}`);
    expect(main.body.map((a: string) => a.toLowerCase())).toEqual([addrMainnet.toLowerCase()]);
  });

  it("rejects a malformed ?chainId= with 400", async () => {
    for (const bad of ["abc", "0", "-1", "1.5", "0xaa36a7"]) {
      const res = await request(app).get(`/api/registries?chainId=${encodeURIComponent(bad)}`);
      expect(res.status, `chainId=${bad}`).toBe(400);
    }
  });
});

describe("registries route — owner-signature auth", () => {
  it("rejects an unsigned write with 401", async () => {
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true });
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner signature with 403", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "update-metadata", wallet: stranger });
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true, ...auth });
    expect(res.status).toBe(403);
  });

  it("rejects a stale signature with 401", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const stale = Math.floor(Date.now() / 1000) - 1000;
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "update-metadata", ts: stale });
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true, ...auth });
    expect(res.status).toBe(401);
  });

  it("rejects a signature made for a different operation with 403", async () => {
    // Signed for delete-announcement; server reconstructs the update-metadata
    // message, so verifyMessage recovers a different address → not the owner.
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "delete-announcement", target: "x" });
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true, ...auth });
    expect(res.status).toBe(403);
  });

  it("returns 503 when the on-chain owner can't be resolved", async () => {
    mockOwner.mockResolvedValue(null);
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "update-metadata" });
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true, ...auth });
    expect(res.status).toBe(503);
  });

  it("authorizes the owner across announcements POST + DELETE", async () => {
    await putAsOwner(addrMainnet, MAINNET, { listed: true });

    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const postAuth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "post-announcement" });
    const post = await request(app).post(`/api/registries/${addrMainnet}/announcements`).send({ title: "t", body: "b", ...postAuth });
    expect(post.status).toBe(201);

    const id: string = post.body.id;
    const delAuth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "delete-announcement", target: id });
    const del = await request(app).delete(`/api/registries/${addrMainnet}/announcements/${id}`).send(delAuth);
    expect(del.status).toBe(204);
  });

  it("rejects an unsigned announcement POST with 401", async () => {
    const res = await request(app).post(`/api/registries/${addrMainnet}/announcements`).send({ title: "t", body: "b" });
    expect(res.status).toBe(401);
  });

  it("rejects a cross-chain write (body chainId != the registered chainId)", async () => {
    // addrMainnet is registered on MAINNET. An attacker who owns the same
    // address on SEPOLIA signs for SEPOLIA — must be rejected against the
    // REGISTERED chain, not the client-supplied one.
    await putAsOwner(addrMainnet, MAINNET, { listed: true });
    mockOwner.mockResolvedValue(stranger.address.toLowerCase());
    const auth = await authFields({ chainId: SEPOLIA, registry: addrMainnet, operation: "update-metadata", wallet: stranger });
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ listed: true, ...auth });
    expect(res.status).toBe(400);
  });
});

describe("registries route — content validation (owner-signed)", () => {
  beforeAll(async () => {
    await putAsOwner(addrMainnet, MAINNET, { listed: true });
  });

  it("rejects a ca-guide issue_url that isn't http(s) with 400", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const caHash = "0x" + "ab".repeat(32);
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "put-ca-guide", target: caHash });
    const res = await request(app).put(`/api/registries/${addrMainnet}/ca-guides/${caHash}`).send({ name: "X", issue_url: "javascript:alert(1)", ...auth });
    expect(res.status).toBe(400);
  });

  it("accepts a ca-guide with an https issue_url", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const caHash = "0x" + "cd".repeat(32);
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "put-ca-guide", target: caHash });
    const res = await request(app).put(`/api/registries/${addrMainnet}/ca-guides/${caHash}`).send({ name: "X", issue_url: "https://ca.example.com", ...auth });
    expect(res.status).toBe(200);
  });

  it("rejects an over-long announcement body with 400", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "post-announcement" });
    const res = await request(app).post(`/api/registries/${addrMainnet}/announcements`).send({ title: "t", body: "x".repeat(9000), ...auth });
    expect(res.status).toBe(400);
  });

  it("rejects an unsafe caHash key (prototype pollution) with 400", async () => {
    mockOwner.mockResolvedValue(owner.address.toLowerCase());
    const caHash = "__proto__";
    const auth = await authFields({ chainId: MAINNET, registry: addrMainnet, operation: "put-ca-guide", target: caHash });
    const res = await request(app).put(`/api/registries/${addrMainnet}/ca-guides/${caHash}`).send({ name: "X", ...auth });
    expect(res.status).toBe(400);
  });
});
