// TODO: Add owner authentication (wallet signature) before production use
import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const router = Router();
const DB_PATH = path.join(__dirname, "../../db/registries.json");

// --- DB helpers ---

interface CaGuide {
  name: string;
  description: string;
  issueUrl: string;
  instructions: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

interface RegistryEntry {
  description: string;
  logoUrl: string;
  category: string;
  website: string;
  tags: string[];
  announcements: Announcement[];
  caGuides: Record<string, CaGuide>;
}

type DB = Record<string, RegistryEntry>;

function readDB(): DB {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

function writeDB(db: DB): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function makeDefaultEntry(): RegistryEntry {
  return {
    description: "",
    logoUrl: "",
    category: "other",
    website: "",
    tags: [],
    announcements: [],
    caGuides: {},
  };
}

// --- Routes ---

// GET /api/registries/:address
router.get("/:address", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const entry = db[addr];
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  res.json(entry);
});

// PUT /api/registries/:address — update metadata (auto-create if not exists)
router.put("/:address", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();

  if (!db[addr]) {
    db[addr] = makeDefaultEntry();
  }

  const allowed = ["description", "logoUrl", "category", "website", "tags"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      (db[addr] as any)[key] = req.body[key];
    }
  }

  writeDB(db);
  res.json(db[addr]);
});

// GET /api/registries/:address/announcements
router.get("/:address/announcements", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const entry = db[addr];
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  res.json(entry.announcements);
});

// POST /api/registries/:address/announcements
router.post("/:address/announcements", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  if (!db[addr]) {
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

  db[addr].announcements.push(announcement);
  writeDB(db);
  res.status(201).json(announcement);
});

// DELETE /api/registries/:address/announcements/:id
router.delete("/:address/announcements/:id", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const annId = req.params.id as string;
  if (!db[addr]) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

  const idx = db[addr].announcements.findIndex((a: Announcement) => a.id === annId);
  if (idx === -1) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  db[addr].announcements.splice(idx, 1);
  writeDB(db);
  res.status(204).send();
});

// GET /api/registries/:address/ca-guides
router.get("/:address/ca-guides", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const entry = db[addr];
  if (!entry) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }
  res.json(entry.caGuides);
});

// PUT /api/registries/:address/ca-guides/:caHash
router.put("/:address/ca-guides/:caHash", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const caHash = req.params.caHash as string;
  if (!db[addr]) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

  const { name, description, issueUrl, instructions } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  db[addr].caGuides[caHash] = {
    name,
    description: description || "",
    issueUrl: issueUrl || "",
    instructions: instructions || "",
  };

  writeDB(db);
  res.json(db[addr].caGuides[caHash]);
});

// DELETE /api/registries/:address/ca-guides/:caHash
router.delete("/:address/ca-guides/:caHash", (req, res) => {
  const db = readDB();
  const addr = (req.params.address as string).toLowerCase();
  const caHash = req.params.caHash as string;
  if (!db[addr]) {
    res.status(404).json({ error: "Registry not found" });
    return;
  }

  if (!db[addr].caGuides[caHash]) {
    res.status(404).json({ error: "CA guide not found" });
    return;
  }

  delete db[addr].caGuides[caHash];
  writeDB(db);
  res.status(204).send();
});

export default router;
