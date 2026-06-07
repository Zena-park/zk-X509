// Shared CMS types + defaults for the registry metadata store.
// Extracted from the original routes/registries.ts so both the File and
// Firestore store implementations share one source of truth.
import * as path from "path";

/// Canonical location of the local JSON DB (backend/db/registries.json),
/// shared by FileRegistryStore and the seed script so the path lives in one
/// place. Resolved from this file's dir (backend/src/stores).
export const DEFAULT_REGISTRIES_DB_PATH = path.join(__dirname, "../../db/registries.json");

export interface CaGuide {
  name: string;
  description: string;
  issue_url: string;
  instructions: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface RegistryEntry {
  description: string;
  logoUrl: string;
  category: string;
  website: string;
  tags: string[];
  listed?: boolean;
  explorerEnabled?: boolean;
  explorerVisibleFields?: string[];
  explorerFilterableFields?: string[];
  announcements: Announcement[];
  caGuides: Record<string, CaGuide>;
}

export interface ExplorerSettings {
  explorerEnabled: boolean;
  explorerVisibleFields: string[];
  explorerFilterableFields: string[];
}

/** address (lowercased) -> entry */
export type DB = Record<string, RegistryEntry>;

/** Disclosure fields a registry explorer may expose / filter on. */
export const VALID_DISCLOSURE_FIELDS = ["country", "org", "orgUnit", "commonName"];

/// Guard the two collection fields that callers mutate/iterate
/// (`announcements.push`, `caGuides[hash]`). A document written by an older
/// schema or hand-edited could omit them, which would crash the routes. Scalar
/// optionals (listed/explorer*) are read with `??` defaults at the call sites,
/// so we deliberately do NOT inject them here — that keeps GET responses
/// shape-identical to what was stored.
export function normalizeEntry(entry: RegistryEntry): RegistryEntry {
  if (entry.announcements && entry.caGuides) return entry;
  return {
    ...entry,
    announcements: entry.announcements ?? [],
    caGuides: entry.caGuides ?? {},
  };
}

export function makeDefaultEntry(): RegistryEntry {
  return {
    description: "",
    logoUrl: "",
    category: "other",
    website: "",
    tags: [],
    listed: true,
    explorerEnabled: false,
    explorerVisibleFields: ["country", "org", "orgUnit", "commonName"],
    explorerFilterableFields: ["country", "org"],
    announcements: [],
    caGuides: {},
  };
}
