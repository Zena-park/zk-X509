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
  const messages = parseMessages(req.body);
  if (!messages) {
    res.status(400).json({ error: "Body must be { messages: [{role, content}, ...] } ending in a user turn." });
    return;
  }

  // Stream as plain text so the widget can render tokens as they arrive.
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "no-store");
  try {
    for await (const delta of streamReply(messages)) {
      res.write(delta);
    }
    res.end();
  } catch (err) {
    console.error("chat error:", err);
    // If nothing was streamed yet, return a clean JSON error; otherwise the
    // headers/body are already committed, so just close the stream.
    if (!res.headersSent) {
      res.status(502).json({ error: "Assistant is unavailable right now." });
    } else {
      res.end();
    }
  }
});

export default router;
