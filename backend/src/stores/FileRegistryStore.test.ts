import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileRegistryStore } from "./FileRegistryStore";
import { makeDefaultEntry, RegistryEntry } from "./types";

/// Build an entry on top of the shared defaults so tests only state what differs.
function entry(overrides: Partial<RegistryEntry>): RegistryEntry {
  return { ...makeDefaultEntry(), ...overrides };
}

describe("FileRegistryStore.listListed network scoping", () => {
  let dbPath: string;
  let store: FileRegistryStore;

  const MAINNET = 1;
  const SEPOLIA = 11155111;
  const addrMainnet = "0xaaaa000000000000000000000000000000000001";
  const addrSepolia = "0xbbbb000000000000000000000000000000000002";
  const addrSepoliaUnlisted = "0xcccc000000000000000000000000000000000003";
  const addrNoChain = "0xdddd000000000000000000000000000000000004";

  beforeEach(async () => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reg-store-")), "registries.json");
    store = new FileRegistryStore(dbPath);
    await store.save(addrMainnet, entry({ chainId: MAINNET, listed: true }));
    await store.save(addrSepolia, entry({ chainId: SEPOLIA, listed: true }));
    await store.save(addrSepoliaUnlisted, entry({ chainId: SEPOLIA, listed: false }));
    await store.save(addrNoChain, entry({ listed: true })); // legacy entry, no chainId
  });

  afterEach(() => {
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it("lists every network's listed entries when no chainId is given", async () => {
    const result = await store.listListed();
    expect(result.sort()).toEqual([addrMainnet, addrNoChain, addrSepolia].sort());
    // the explicitly-unlisted Sepolia entry is excluded
    expect(result).not.toContain(addrSepoliaUnlisted);
  });

  it("restricts to the requested network", async () => {
    expect(await store.listListed(SEPOLIA)).toEqual([addrSepolia]);
    expect(await store.listListed(MAINNET)).toEqual([addrMainnet]);
  });

  it("excludes entries without a chainId from network-scoped lists", async () => {
    const sepolia = await store.listListed(SEPOLIA);
    expect(sepolia).not.toContain(addrNoChain);
    const mainnet = await store.listListed(MAINNET);
    expect(mainnet).not.toContain(addrNoChain);
  });

  it("returns an empty list for a network with no registries", async () => {
    expect(await store.listListed(999)).toEqual([]);
  });

  it("round-trips chainId through save/get", async () => {
    const got = await store.get(addrSepolia);
    expect(got?.chainId).toBe(SEPOLIA);
  });
});
