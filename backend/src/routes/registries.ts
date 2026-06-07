// TODO: Add owner authentication (wallet signature) before production use.
// NOTE: write endpoints (PUT/POST/DELETE) are intentionally still unauthenticated
// here — this migration preserves the prior behavior. The Firestore security
// rules block *direct* client DB access (write: false), but they do NOT gate
// these REST writes, which reach Firestore via the Admin SDK. Adding wallet-
// signature auth is a separate follow-up.
import { Router, Request, Response, NextFunction } from "express";
import * as crypto from "crypto";
import {
  getRegistryStore,
  Announcement,
  VALID_DISCLOSURE_FIELDS,
  makeDefaultEntry,
} from "../stores";

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

// --- Routes ---

// GET /api/registries — list all listed registry addresses
router.get("/", h(async (_req, res) => {
  cacheable(res);
  res.json(await store.listListed());
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
  const entry = await store.getOrCreate(addr);

  const { description, logoUrl, category, website, tags, listed,
    explorerEnabled, explorerVisibleFields, explorerFilterableFields } = req.body;
  if (description !== undefined) entry.description = String(description);
  if (logoUrl !== undefined) entry.logoUrl = String(logoUrl);
  if (category !== undefined && ["dao", "defi", "corporate", "other"].includes(category)) {
    entry.category = category;
  }
  if (website !== undefined) entry.website = String(website);
  if (Array.isArray(tags)) {
    entry.tags = tags.filter((tag: unknown): tag is string => typeof tag === "string");
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
  const entry = await store.get(addr);
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

  const { title, body } = req.body;
  if (!title || !body) {
    res.status(400).json({ error: "title and body are required" });
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
  const entry = await store.get(addr);
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

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
  const entry = await store.getOrCreate(addr);

  const { name, description, issue_url, instructions } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
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
  const entry = await store.get(addr);
  if (!entry || !entry.caGuides[caHash]) {
    res.status(204).send();
    return;
  }

  delete entry.caGuides[caHash];
  await store.save(addr, entry);
  res.status(204).send();
}));

export default router;
