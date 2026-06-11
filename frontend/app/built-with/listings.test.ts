import { describe, expect, it } from "vitest";
import { verifyMessage } from "ethers";
import { PROJECTS, normalizeAccent, isSafeListingUrl } from "./projects";
import { canonicalListingMessage } from "./listingSignature";

/**
 * Enforces listing ownership: any entry that sets `owner` must carry a valid
 * `signature` from that address over the entry's canonical content. Editing an
 * owned entry changes the content, which invalidates the old signature — so a
 * PR touching someone else's listing fails here unless it is re-signed by the
 * owner's key. Maintainer-curated entries (no `owner`) are exempt.
 */
describe("built-with listings", () => {
  it("has no duplicate project names", () => {
    const names = PROJECTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only uses valid #rgb / #rrggbb accents", () => {
    for (const p of PROJECTS) {
      if (p.accent === undefined) continue;
      expect(normalizeAccent(p.accent), `${p.name} has an invalid accent: ${p.accent}`).toBeDefined();
    }
  });

  it("only uses safe http(s) / root-relative url and logo", () => {
    for (const p of PROJECTS) {
      expect(isSafeListingUrl(p.url), `${p.name} has an unsafe url: ${p.url}`).toBe(true);
      expect(isSafeListingUrl(p.logo), `${p.name} has an unsafe logo: ${p.logo}`).toBe(true);
    }
  });

  it("uses non-empty numeric chain IDs", () => {
    for (const p of PROJECTS) {
      expect(p.chains.length, `${p.name} has no chains`).toBeGreaterThan(0);
      for (const id of p.chains) {
        expect(/^[0-9]+$/.test(id), `${p.name} has a non-numeric chain ID: ${id}`).toBe(true);
      }
    }
  });

  for (const p of PROJECTS) {
    if (!p.owner) continue;

    it(`'${p.name}' is signed by its owner`, () => {
      expect(p.signature, `${p.name} sets owner but is missing signature`).toBeTruthy();
      const { signature, ...signable } = p;
      const recovered = verifyMessage(canonicalListingMessage(signable), signature!);
      expect(recovered.toLowerCase()).toBe(p.owner!.toLowerCase());
    });
  }
});
