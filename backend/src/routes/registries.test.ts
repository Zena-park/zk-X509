import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";

/// Route-level tests for the registry CMS network scoping. These run against
/// the real Express app over the File store, with the DB pointed at a temp file
/// via REGISTRIES_DB_PATH. The env + dynamic import must happen before the route
/// module loads, since it resolves the store singleton at import time.
let app: Express;
let dbDir: string;

const MAINNET = 1;
const SEPOLIA = 11155111;
const addrMainnet = "0xAAaa000000000000000000000000000000000001";
const addrSepolia = "0xbBbB000000000000000000000000000000000002";
const addrNoChain = "0xCccc000000000000000000000000000000000003";

beforeAll(async () => {
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-route-"));
  process.env.REGISTRY_STORE = "file";
  process.env.REGISTRIES_DB_PATH = path.join(dbDir, "registries.json");
  // The route module resolves its store singleton at import time; reset the
  // module registry first so it re-initializes against the temp DB path above
  // (and never the default/production JSON) regardless of prior imports.
  vi.resetModules();
  const mod = await import("./registries");
  // Mount only this router so the test is independent of the rest of createApp.
  const express = (await import("express")).default;
  app = express();
  app.use(express.json());
  app.use("/api/registries", mod.default);
});

afterAll(() => {
  // Guard against beforeAll failing before dbDir was assigned, so cleanup
  // doesn't throw a TypeError that masks the real setup error.
  if (dbDir) fs.rmSync(dbDir, { recursive: true, force: true });
});

describe("registries route — chainId network scoping", () => {
  it("seeds entries via PUT and stores chainId as a number", async () => {
    const r1 = await request(app).put(`/api/registries/${addrMainnet}`).send({ chainId: MAINNET, listed: true });
    expect(r1.status).toBe(200);
    expect(r1.body.chainId).toBe(MAINNET);

    // chainId as a digits-only string is coerced to a number
    const r2 = await request(app).put(`/api/registries/${addrSepolia}`).send({ chainId: String(SEPOLIA), listed: true });
    expect(r2.status).toBe(200);
    expect(r2.body.chainId).toBe(SEPOLIA);

    // an entry written without chainId stays chainId-less (regression guard for
    // the "listed but hidden from ?chainId=" admin bug)
    const r3 = await request(app).put(`/api/registries/${addrNoChain}`).send({ listed: true });
    expect(r3.status).toBe(200);
    expect(r3.body.chainId).toBeUndefined();
  });

  it("GET without chainId lists every network (incl. the chainId-less entry)", async () => {
    const res = await request(app).get("/api/registries");
    expect(res.status).toBe(200);
    expect(res.body.map((a: string) => a.toLowerCase()).sort()).toEqual(
      [addrMainnet, addrSepolia, addrNoChain].map((a) => a.toLowerCase()).sort(),
    );
  });

  it("GET ?chainId= restricts to one network and excludes chainId-less entries", async () => {
    const sep = await request(app).get(`/api/registries?chainId=${SEPOLIA}`);
    expect(sep.status).toBe(200);
    expect(sep.body.map((a: string) => a.toLowerCase())).toEqual([addrSepolia.toLowerCase()]);

    const main = await request(app).get(`/api/registries?chainId=${MAINNET}`);
    expect(main.body.map((a: string) => a.toLowerCase())).toEqual([addrMainnet.toLowerCase()]);

    // the chainId-less entry appears in neither network-scoped list
    expect(sep.body.map((a: string) => a.toLowerCase())).not.toContain(addrNoChain.toLowerCase());
    expect(main.body.map((a: string) => a.toLowerCase())).not.toContain(addrNoChain.toLowerCase());
  });

  it("GET ?chainId= for a network with no registries is an empty list", async () => {
    const res = await request(app).get("/api/registries?chainId=999999");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects a malformed ?chainId= with 400", async () => {
    for (const bad of ["abc", "0", "-1", "1.5", "0xaa36a7"]) {
      const res = await request(app).get(`/api/registries?chainId=${encodeURIComponent(bad)}`);
      expect(res.status, `chainId=${bad}`).toBe(400);
    }
  });

  it("rejects a malformed chainId in a PUT body with 400", async () => {
    const res = await request(app).put(`/api/registries/${addrMainnet}`).send({ chainId: "0xabc" });
    expect(res.status).toBe(400);
  });

  it("a PUT updating other fields without chainId preserves the existing chainId", async () => {
    const res = await request(app).put(`/api/registries/${addrSepolia}`).send({ description: "updated" });
    expect(res.status).toBe(200);
    expect(res.body.chainId).toBe(SEPOLIA);
    expect(res.body.description).toBe("updated");
    // still listed under its network
    const sep = await request(app).get(`/api/registries?chainId=${SEPOLIA}`);
    expect(sep.body.map((a: string) => a.toLowerCase())).toContain(addrSepolia.toLowerCase());
  });
});
