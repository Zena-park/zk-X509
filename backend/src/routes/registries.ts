// Registry CMS writes (PUT/POST/DELETE) are authorized with an owner wallet
// signature: the request must carry { chainId, signature, signatureTimestamp }
// in its JSON body, signed by the registry's on-chain owner. See
// `util/registryAuth.ts`. (The Firestore rules block direct client DB access
// but these REST writes reach Firestore via the Admin SDK, so the gate lives
// here.)
import { Router, Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import {
  getRegistryStore,
  Announcement,
  RegistryEntry,
  VALID_DISCLOSURE_FIELDS,
  makeDefaultEntry,
} from "../stores";
import { coerceChainId } from "../util/chainId";
import { authorizeRegistryOwner } from "../util/registryAuth";
import { isAllowedUrl, isUnsafeKey, withinLen, LIMITS } from "../util/validate";

const router = Router();
const store = getRegistryStore();

// Registry addresses are case-insensitive and stored/looked-up lowercased.
// Normalize the `:address` param once here so every handler can use it as-is.
router.param("address", (req, _res, next, value) => {
  req.params.address = (value as string).toLowerCase();
  next();
});

// Public CMS content — cache GETs to cut Firestore reads / load. Short TTL with
// stale-while-revalidate keeps edits visibly fresh while absorbing read bursts.
const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";
function cacheable(res: Response) {
  res.set("Cache-Control", PUBLIC_CACHE);
}

// Express 4 doesn't forward async rejections — wrap handlers so store errors
// become a clean 500 instead of an unhandled rejection.
type Handler = (req: Request, res: Response) => Promise<void>;
function h(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
}

// Gate a write on the registry owner's signature. The signed message binds the
// chainId, registry, operation (+ optional target), so a signature can't be
// replayed across operations/registries. On success returns the already-fetched
// entry (so the handler needn't re-read the store); on failure writes the error
// response and returns `{ ok: false }`.
type OwnerGate = { ok: true; entry: RegistryEntry | null } | { ok: false };
async function requireOwner(req: Request, res: Response, addr: string, operation: string, target?: string): Promise<OwnerGate> {
  const body = (req.body ?? {}) as { chainId?: unknown; signature?: unknown; signatureTimestamp?: unknown };
  // Pin the auth chainId to the registry's REGISTERED chain, not the
  // client-supplied one. The store is keyed by address alone, so without this
  // an attacker who owns the same address on another chain could sign with
  // their key on that chain and overwrite this registry (cross-chain hijack).
  const existing = await store.get(addr);
  let chainId: unknown = body.chainId;
  if (existing?.chainId !== undefined) {
    if (body.chainId !== undefined && Number(body.chainId) !== existing.chainId) {
      res.status(400).json({ error: "chainId does not match the registered registry chainId" });
      return { ok: false };
    }
    chainId = existing.chainId;
  }
  const auth = await authorizeRegistryOwner(addr, {
    chainId,
    signature: body.signature,
    signatureTimestamp: body.signatureTimestamp,
    operation,
    target,
  });
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return { ok: false };
  }
  return { ok: true, entry: existing };
}

// --- Routes ---

// GET /api/registries — list listed registry addresses.
// Optional `?chainId=<n>` restricts the list to one network; omitting it lists
// every network (back-compat). A malformed chainId is a 400.
router.get("/", h(async (req, res) => {
  let chainId: number | undefined;
  if (req.query.chainId !== undefined) {
    const parsed = coerceChainId(req.query.chainId);
    if (parsed === null) {
      res.status(400).json({ error: "Invalid chainId: must be a positive integer" });
      return;
    }
    chainId = parsed;
  }
  cacheable(res);
  res.json(await store.listListed(chainId));
}));

// GET /api/registries/:address
router.get("/:address", h(async (req, res) => {
  const addr = req.params.address as string;
  const entry = await store.get(addr);
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  cacheable(res);
  res.json(entry);
}));

// PUT /api/registries/:address — update metadata (auto-create if not exists)
router.put("/:address", h(async (req, res) => {
  const addr = req.params.address as string;
  const gate = await requireOwner(req, res, addr, "update-metadata");
  if (!gate.ok) return;
  const entry = gate.entry ?? makeDefaultEntry();

  const { chainId, description, logoUrl, category, website, tags, listed,
    explorerEnabled, explorerVisibleFields, explorerFilterableFields } = req.body;
  // Validate stored content: URLs must be http(s) (served to visitors — no
  // javascript:/data:), and bound field sizes to keep the document small.
  if (!isAllowedUrl(logoUrl) || !isAllowedUrl(website)) {
    res.status(400).json({ error: "logoUrl/website must be an http(s) URL" });
    return;
  }
  if (!withinLen(description, LIMITS.longText) || !withinLen(logoUrl, LIMITS.shortText) || !withinLen(website, LIMITS.shortText)) {
    res.status(400).json({ error: "Field too long" });
    return;
  }
  if (chainId !== undefined) {
    const parsed = coerceChainId(chainId);
    if (parsed === null) {
      res.status(400).json({ error: "Invalid chainId: must be a positive integer" });
      return;
    }
    entry.chainId = parsed;
  }
  if (description !== undefined) entry.description = String(description);
  if (logoUrl !== undefined) entry.logoUrl = String(logoUrl);
  if (category !== undefined && ["dao", "defi", "corporate", "other"].includes(category)) {
    entry.category = category;
  }
  if (website !== undefined) entry.website = String(website);
  if (Array.isArray(tags)) {
    entry.tags = tags
      .filter((tag: unknown): tag is string => typeof tag === "string" && tag.length <= LIMITS.shortText)
      .slice(0, LIMITS.tags);
  }
  if (listed !== undefined) entry.listed = typeof listed === "string" ? listed.toLowerCase() === "true" : Boolean(listed);
  if (explorerEnabled !== undefined) {
    entry.explorerEnabled = typeof explorerEnabled === "string"
      ? explorerEnabled.toLowerCase() === "true"
      : Boolean(explorerEnabled);
  }
  if (Array.isArray(explorerVisibleFields)) {
    entry.explorerVisibleFields = [...new Set(
      explorerVisibleFields.filter((f: unknown): f is string =>
        typeof f === "string" && VALID_DISCLOSURE_FIELDS.includes(f))
    )];
  }
  if (Array.isArray(explorerFilterableFields)) {
    const visible = new Set(entry.explorerVisibleFields ?? VALID_DISCLOSURE_FIELDS);
    entry.explorerFilterableFields = [...new Set(
      explorerFilterableFields.filter((f: unknown): f is string =>
        typeof f === "string" && VALID_DISCLOSURE_FIELDS.includes(f) && visible.has(f))
    )];
  }

  await store.save(addr, entry);
  res.json(entry);
}));

// GET /api/registries/:address/explorer-settings
router.get("/:address/explorer-settings", h(async (req, res) => {
  const addr = req.params.address as string;
  const entry = await store.get(addr);
  const defaults = makeDefaultEntry();
  cacheable(res);
  res.json({
    explorerEnabled: entry?.explorerEnabled ?? defaults.explorerEnabled,
    explorerVisibleFields: entry?.explorerVisibleFields ?? defaults.explorerVisibleFields,
    explorerFilterableFields: entry?.explorerFilterableFields ?? defaults.explorerFilterableFields,
  });
}));

// GET /api/registries/:address/announcements
router.get("/:address/announcements", h(async (req, res) => {
  const addr = req.params.address as string;
  const entry = await store.get(addr);
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  cacheable(res);
  res.json(entry.announcements);
}));

// POST /api/registries/:address/announcements
router.post("/:address/announcements", h(async (req, res) => {
  const addr = req.params.address as string;
  const gate = await requireOwner(req, res, addr, "post-announcement");
  if (!gate.ok) return;
  const entry = gate.entry;
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

  const { title, body } = req.body;
  if (!title || !body) {
    res.status(400).json({ error: "title and body are required" });
    return;
  }
  if (!withinLen(title, LIMITS.shortText) || !withinLen(body, LIMITS.longText)) {
    res.status(400).json({ error: "title/body too long" });
    return;
  }
  if (!entry.announcements) entry.announcements = []; // legacy entries may lack it
  if (entry.announcements.length >= LIMITS.announcements) {
    res.status(400).json({ error: `Too many announcements (max ${LIMITS.announcements}); delete some first` });
    return;
  }

  const announcement: Announcement = {
    id: crypto.randomUUID(),
    title,
    body,
    createdAt: new Date().toISOString(),
  };

  entry.announcements.push(announcement);
  await store.save(addr, entry);
  res.status(201).json(announcement);
}));

// DELETE /api/registries/:address/announcements/:id
router.delete("/:address/announcements/:id", h(async (req, res) => {
  const addr = req.params.address as string;
  const annId = req.params.id as string;
  const gate = await requireOwner(req, res, addr, "delete-announcement", annId);
  if (!gate.ok) return;
  const entry = gate.entry;
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  if (!entry.announcements) entry.announcements = []; // legacy entries may lack it

  const idx = entry.announcements.findIndex((a: Announcement) => a.id === annId);
  if (idx === -1) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  entry.announcements.splice(idx, 1);
  await store.save(addr, entry);
  res.status(204).send();
}));

// GET /api/registries/:address/ca-guides
router.get("/:address/ca-guides", h(async (req, res) => {
  const addr = req.params.address as string;
  const entry = await store.get(addr);
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  cacheable(res);
  res.json(entry.caGuides);
}));

// PUT /api/registries/:address/ca-guides/:caHash
router.put("/:address/ca-guides/:caHash", h(async (req, res) => {
  const addr = req.params.address as string;
  const caHash = req.params.caHash as string;
  const gate = await requireOwner(req, res, addr, "put-ca-guide", caHash);
  if (!gate.ok) return;
  if (isUnsafeKey(caHash)) {
    res.status(400).json({ error: "Invalid caHash" });
    return;
  }
  const entry = gate.entry ?? makeDefaultEntry();
  // A registry first created via this route needs its chainId recorded (for
  // network-scoped queries); legacy entries may lack `caGuides`.
  if (entry.chainId === undefined && req.body?.chainId !== undefined) {
    const parsed = coerceChainId(req.body.chainId);
    if (parsed !== null) entry.chainId = parsed;
  }
  if (!entry.caGuides) entry.caGuides = {};

  const { name, description, issue_url, instructions } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!isAllowedUrl(issue_url)) {
    res.status(400).json({ error: "issue_url must be an http(s) URL" });
    return;
  }
  if (!withinLen(name, LIMITS.shortText) || !withinLen(description, LIMITS.longText)
    || !withinLen(issue_url, LIMITS.shortText) || !withinLen(instructions, LIMITS.longText)) {
    res.status(400).json({ error: "Field too long" });
    return;
  }

  entry.caGuides[caHash] = {
    name,
    description: description || "",
    issue_url: issue_url || "",
    instructions: instructions || "",
  };

  await store.save(addr, entry);
  res.json(entry.caGuides[caHash]);
}));

// DELETE /api/registries/:address/ca-guides/:caHash — idempotent
router.delete("/:address/ca-guides/:caHash", h(async (req, res) => {
  const addr = req.params.address as string;
  const caHash = req.params.caHash as string;
  const gate = await requireOwner(req, res, addr, "delete-ca-guide", caHash);
  if (!gate.ok) return;
  const entry = gate.entry;
  if (!entry || !entry.caGuides[caHash]) {
    res.status(204).send();
    return;
  }

  delete entry.caGuides[caHash];
  await store.save(addr, entry);
  res.status(204).send();
}));

export default router;
