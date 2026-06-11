// AI assistant endpoint. Takes a short conversation and streams the zk-X509
// expert's reply back as plain-text chunks. The Tokamak AI (LiteLLM) key and
// base URL stay server-side (Secret Manager) — the browser only talks to here.
import { Router, Request, Response } from "express";
import { streamReply, ChatMessage } from "../services/assistant";

const router = Router();

// Bound the request so a caller can't push an unbounded transcript at the
// gateway. Keep only the recent turns; the system prompt carries the grounding.
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

// Best-effort per-IP rate limit. This endpoint is unauthenticated and forwards
// to a paid LLM, so cap how often one client can call it. Note: the counter is
// in-memory and therefore per Cloud Functions instance — it blunts trivial
// abuse but isn't a hard global limit (a shared store would be needed for that).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 15; // requests per IP per window
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
    return false;
  }
  e.count += 1;
  return e.count > RATE_MAX;
}

function parseMessages(body: unknown): ChatMessage[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    out.push({ role, content: content.slice(0, MAX_CHARS) });
  }
  // The conversation must end on a user turn for the model to reply to.
  if (out[out.length - 1].role !== "user") return null;
  return out;
}

router.post("/", async (req: Request, res: Response) => {
  // Behind the Cloud Functions proxy the real client IP is in X-Forwarded-For.
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.ip || "unknown";
  if (rateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Please slow down." });
    return;
  }

  const messages = parseMessages(req.body);
  if (!messages) {
    res.status(400).json({ error: "Body must be { messages: [{role, content}, ...] } ending in a user turn." });
    return;
  }

  // Headers committed only at the first chunk, so the catch below can still send
  // a JSON error if the upstream fails before any byte is written.
  let started = false;
  const startStream = () => {
    if (started) return;
    started = true;
    res.set("Content-Type", "text/plain; charset=utf-8");
    res.set("Cache-Control", "no-store");
    res.set("X-Accel-Buffering", "no"); // ask reverse proxies not to buffer the stream
  };

  try {
    for await (const delta of streamReply(messages)) {
      startStream();
      res.write(delta);
    }
    startStream(); // ensure a 200 even on an empty reply
    res.end();
  } catch (err) {
    console.error("chat error:", err);
    // If nothing was streamed yet, headers aren't committed → clean JSON error.
    if (!res.headersSent) {
      res.status(502).json({ error: "Assistant is unavailable right now." });
    } else {
      res.end();
    }
  }
});

export default router;
