/**
 * Validation helpers for CMS write content. Writes are owner-signature gated,
 * but stored content is served to a registry's visitors, so it's still
 * validated server-side (don't trust the client form): URL scheme, length caps
 * (to bound document size), and unsafe object keys.
 */

/** Empty string (= unset) or an http(s) URL. Rejects javascript:/data:/etc. */
export function isAllowedUrl(s: unknown): boolean {
  if (s === undefined || s === null || s === "") return true;
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Object keys that must never be used for property assignment. */
export function isUnsafeKey(k: string): boolean {
  return k === "__proto__" || k === "constructor" || k === "prototype";
}

export const LIMITS = {
  /** name, title, category, website, logoUrl, issue_url, tags entries. */
  shortText: 256,
  /** description, announcement body, ca-guide instructions. */
  longText: 8000,
  /** max announcements retained per registry. */
  announcements: 200,
  /** max tags per registry. */
  tags: 32,
} as const;

/**
 * True when `s` is absent, or a string within `max` chars. A present non-string
 * (array/object) is REJECTED — otherwise `["x".repeat(1e6)]` would pass the
 * length check (array.length === 1) and bypass the cap once stringified.
 */
export function withinLen(s: unknown, max: number): boolean {
  if (s === undefined || s === null) return true;
  return typeof s === "string" && s.length <= max;
}
