/**
 * "Built with zk-X509" — the project listing.
 *
 * This file is the single source of truth for the /built-with page. To get your
 * project listed, open a PR that adds one entry to the PROJECTS array below
 * (the "Add your project" button on the page links straight to this file in the
 * GitHub editor). Copy the TEMPLATE entry at the bottom of PROJECTS, fill it in,
 * and title the PR: "Add <project> to Built with zk-X509".
 *
 * Field rules:
 *  - category: must be one of CATEGORIES so the page's filter picks it up.
 *  - status:   "live" shows a green badge, "building" an amber one.
 *  - chains:   chain IDs as strings (matching the wallet's chainId), e.g.
 *              Sepolia "11155111", Mainnet "1". A project on several networks
 *              lists them all: ["11155111", "1"]. The network filter is built
 *              from whatever chain IDs appear here.
 *  - url:      the project's entry point; adds a ↗ link on the card.
 *  - logo:     optional logo image URL (https or a /path under frontend/public),
 *              shown on the card; falls back to the project's initial if absent.
 *  - accent:   optional brand color as a hex string (e.g. "#6b5bff"); tints the
 *              card's logo tile, border, and hover glow. Falls back to the theme
 *              accent if absent. Must be a #RGB / #RRGGBB hex value.
 *  - contactEmail: who to reach about the listing (not shown publicly on the card).
 *  - owner:    the wallet address that controls this listing. Once set, any later
 *              edit to this entry must be authorized by a signature from this
 *              address (see `signature`). Omit for maintainer-curated entries.
 *  - signature: owner's signature over the entry's canonical content, proving the
 *              edit was authorized by `owner`. Required whenever `owner` is set.
 *  - audience: optional — who it's for, shown as a "For …" tag.
 */

/**
 * Deep link to this file in the GitHub editor — opening it lets a contributor
 * edit the listing and "Propose changes", which opens a PR. Single source for
 * both the page CTA and the signer page.
 */
export const ADD_PROJECT_PR_URL =
  "https://github.com/Zena-park/zk-X509/edit/main/frontend/app/built-with/projects.ts";

export type ProjectStatus = "live" | "building";

export const CATEGORIES = [
  "DeFi",
  "DAO & Governance",
  "Identity",
  "Gaming",
  "Infrastructure",
] as const;

/**
 * Card layout templates a project can pick from to show its personality:
 *  - classic:  default glass panel.
 *  - gradient: accent-tinted gradient header band.
 *  - bold:     filled accent-tinted card with a large logo.
 *  - minimal:  flat, compact, thin border.
 */
export const CARD_STYLES = ["classic", "gradient", "bold", "minimal"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

/** Optional idle animation applied to the card. */
export const CARD_ANIMATIONS = ["none", "float", "pulse", "glow"] as const;
export type CardAnimation = (typeof CARD_ANIMATIONS)[number];

/**
 * Card text font, chosen from a fixed set (mapped to the app's font classes in
 * ProjectCard) — never an arbitrary font-family, so a listing can't inject CSS.
 *  - grotesk: the default display font.
 *  - sans:    a softer sans.
 *  - mono:    monospace.
 */
export const CARD_FONTS = ["grotesk", "sans", "mono"] as const;
export type CardFont = (typeof CARD_FONTS)[number];

export interface Project {
  name: string;
  /** One or two sentences: what it is and how it uses zk-X509. */
  description: string;
  category: (typeof CATEGORIES)[number];
  status: ProjectStatus;
  /** Chain IDs (as strings) where this project is deployed. */
  chains: string[];
  /** The project's entry point — adds a ↗ link on the card. */
  url?: string;
  /** Logo image URL (https or /public path); falls back to the initial if absent. */
  logo?: string;
  /** Card background image URL (https or /public path); shown behind a readability overlay. */
  background?: string;
  /** Brand color as a hex string (#RGB / #RRGGBB); tints the card. */
  accent?: string;
  /** Card layout template; defaults to "classic". */
  cardStyle?: CardStyle;
  /** Card text font; defaults to "grotesk". */
  font?: CardFont;
  /** Idle animation; defaults to "none". */
  animation?: CardAnimation;
  /** Contact for the listing — not rendered on the card. */
  contactEmail?: string;
  /** Wallet address that controls this listing; edits need its signature. */
  owner?: string;
  /** Owner's signature over the entry's canonical content (required if `owner` set). */
  signature?: string;
  /** Who the project is for — shown as a small "For …" tag on the card. */
  audience?: string;
}

/**
 * Validate an `accent` to a normalized #rrggbb hex, expanding the #rgb
 * shorthand. Returns undefined for anything else, so the value is only ever
 * used as a CSS color — never as arbitrary style text. Lives here (not in the
 * card) so the CI test can reject malformed accents in the data, not just at
 * render time.
 */
export function normalizeAccent(input?: string): string | undefined {
  if (!input) return undefined;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(input.trim());
  if (!m) return undefined;
  const hex =
    m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${hex.toLowerCase()}`;
}

/**
 * A listing's `url` and `logo` are rendered into `<a href>` / `<img src>`, so
 * only safe schemes are allowed: absolute http(s), or a root-relative `/path`
 * (but not protocol-relative `//`). Rejects `javascript:` / `data:` etc. so an
 * owner-signed entry can't smuggle in an XSS/phishing link past the signature
 * check. `undefined` is allowed (the field is optional). Enforced in CI.
 */
export function isSafeListingUrl(value?: string): boolean {
  if (value === undefined) return true;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const PROJECTS: Project[] = [
  {
    name: "zk-scatter Pay",
    description:
      "Privacy-preserving payouts — payroll, grants, bonuses, and contractor payments. Senders and claimants are gated on a zk-X509 verified identity, so only certificate-holding wallets can pay or be paid.",
    category: "DeFi",
    status: "live",
    chains: ["11155111"],
    audience: "Teams & payers",
    url: "https://zkscatter-pay.web.app",
    logo: "/logos/pay.svg",
    accent: "#6bff8f",
    cardStyle: "gradient",
    animation: "float",
  },
  {
    name: "zk-scatter Pro",
    description:
      "Privacy-preserving trading with an on-chain order book. Order placement and settlement are restricted to zk-X509 verified wallets, keeping trader identity off-chain.",
    category: "DeFi",
    status: "live",
    chains: ["11155111"],
    audience: "Traders",
    url: "https://zkscatter-pro.web.app",
    logo: "/logos/pro.svg",
    accent: "#6b8bff",
    cardStyle: "bold",
    animation: "glow",
  },
  {
    name: "zk-scatter Relayers",
    description:
      "Gasless relayer network powering the zk-scatter apps. Relayers must hold a zk-X509 verified identity to register and submit transactions on behalf of users.",
    category: "Infrastructure",
    status: "live",
    chains: ["11155111"],
    audience: "Relayer operators",
    url: "https://zkscatter-relayer.web.app",
    logo: "/logos/relayers.svg",
    accent: "#ffb86b",
    cardStyle: "minimal",
    animation: "pulse",
  },
  // --- TEMPLATE: copy this block, fill it in, and delete this comment line ---
  // {
  //   name: "Your Project",
  //   description: "What it is and how it uses zk-X509 (one or two sentences).",
  //   category: "DeFi", // one of CATEGORIES
  //   status: "building", // or "live"
  //   chains: ["11155111"], // chain IDs as strings
  //   url: "https://your-project.xyz", // service URL
  //   logo: "https://your-project.xyz/logo.png", // optional logo image
  //   background: "https://your-project.xyz/card-bg.jpg", // optional card background image
  //   accent: "#6b5bff", // optional brand color (#RGB / #RRGGBB)
  //   cardStyle: "gradient", // classic | gradient | bold | minimal
  //   font: "grotesk", // grotesk | sans | mono
  //   animation: "float", // none | float | pulse | glow
  //   contactEmail: "you@your-project.xyz", // listing contact (not shown on the card)
  //   owner: "0xYourWalletAddress", // the account that controls this listing
  //   signature: "0x...", // owner's signature over this entry (see "Sign listing" on the page)
  //   audience: "Who it's for", // optional
  // },
];
