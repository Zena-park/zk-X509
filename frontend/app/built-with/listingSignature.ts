import type { Project } from "./projects";

/** A project entry without its signature — the part the owner actually signs. */
export type SignableListing = Omit<Project, "signature">;

/**
 * The exact, deterministic message an owner signs to authorize a listing.
 *
 * It covers every meaningful field, so changing ANY of them invalidates the
 * old signature and forces a re-sign by the same `owner` key — that is what
 * makes "only the owner can edit this entry" hold. Field order is fixed here
 * (not derived from object key order) so the message is stable across the
 * in-app signer and the CI verifier.
 */
export function canonicalListingMessage(p: SignableListing): string {
  return [
    "zk-X509 Built with — listing authorization",
    `name: ${p.name}`,
    `description: ${p.description}`,
    `category: ${p.category}`,
    `status: ${p.status}`,
    `chains: ${[...p.chains].join(",")}`,
    `url: ${p.url ?? ""}`,
    `logo: ${p.logo ?? ""}`,
    `background: ${p.background ?? ""}`,
    `accent: ${p.accent ?? ""}`,
    `cardStyle: ${p.cardStyle ?? ""}`,
    `font: ${p.font ?? ""}`,
    `animation: ${p.animation ?? ""}`,
    `contactEmail: ${p.contactEmail ?? ""}`,
    `audience: ${p.audience ?? ""}`,
    `owner: ${(p.owner ?? "").toLowerCase()}`,
  ].join("\n");
}
