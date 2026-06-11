"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { MessageSquare, X, Send, Loader2, Sparkles } from "lucide-react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { BACKEND_URL } from "@/lib/platform";

/**
 * Floating zk-X509 assistant. Talks only to our backend (/api/chat), which
 * holds the Tokamak AI credentials and streams the reply back — the model
 * endpoint and key never reach the browser. Scoped to zk-X509 / zk-scatter /
 * Tokamak Network, and guides first-time users with links into the site.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING =
  "👋 Hi! I'm the zk-X509 assistant. I can explain zk-X509, zk-scatter, and Tokamak Network, and walk you through getting verified. What would you like to do?";

// Curated one-tap guides for first-time visitors. Clicking one instantly shows
// a friendly, link-rich answer (no model call) so onboarding is fast and always
// polished; the in-site links navigate within the app. Free-text questions
// still go to the assistant.
interface Guide {
  label: string;
  answer: string;
}

const GUIDES: Guide[] = [
  {
    label: "🚀 Get verified (new here)",
    answer:
      "Welcome! Getting a verified identity takes about 5 minutes and reveals **none** of your personal data. Here's the path:\n\n" +
      "1. **[Download the app](/download)** — it reads an X.509 certificate (government eID, banking cert, or corporate PKI) from your OS keychain and builds a Zero-Knowledge proof locally. Your private key never leaves your machine.\n" +
      "2. **[Explore services](/dashboard)** — pick a service to verify against, then paste your proof to submit it on-chain.\n" +
      "3. **[Check your status](/identity)** — confirm your wallet is now verified.\n\n" +
      "Want me to explain any step in more detail?",
  },
  {
    label: "🧩 Use a zk-scatter app",
    answer:
      "zk-scatter is a suite of privacy-preserving DeFi apps — only zk-X509 verified wallets can take part:\n\n" +
      "- **Pay** — private payouts (payroll, grants, bonuses, contractor payments)\n" +
      "- **Pro** — private trading with an on-chain order book\n" +
      "- **Relayers** — a gasless relayer network for the apps\n\n" +
      "See them all on **[Built with zk-X509](/built-with)**. New to verification? Tap **🚀 Get verified** first.",
  },
  {
    label: "👩‍💻 I'm a developer",
    answer:
      "Great — you can gate your dApp on a verified identity with a single on-chain check (`isVerified(wallet)`).\n\n" +
      "Head to **[Developers](/developers)** for the integration guide, SDK, and CLI. From there you can require verified wallets in your contract, deploy your own registry, and onboard users.",
  },
  {
    label: "🏢 Run a service (operator)",
    answer:
      "If you operate a service and want to accept zk-X509 identities:\n\n" +
      "1. **[Create an Auth Policy](/create)** — spin up a registry with your trusted CAs and field rules (country, organization…).\n" +
      "2. **[My Console](/admin)** — manage it afterward: settings, delegated proving, revocation.\n\n" +
      "Want guidance on delegated (cloud) proving or trusted-CA setup?",
  },
];

// Markdown link renderer: internal `/…` links navigate inside the SPA (the
// widget lives in the root layout so it survives route changes); external
// links open in a new tab; unknown/unsafe schemes render as plain text.
const LINK_CLASS = "text-tertiary font-medium underline underline-offset-2 hover:text-secondary transition-colors";
const MARKDOWN_COMPONENTS: Components = {
  a({ href, children }) {
    const url = href ?? "";
    if (url.startsWith("/")) return <Link href={url} className={LINK_CLASS}>{children}</Link>;
    if (/^https?:\/\//.test(url)) return <a href={url} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>{children}</a>;
    return <span>{children}</span>;
  },
};

/** Render an assistant message as Markdown with clickable, in-site links. */
function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 [&_p]:leading-relaxed [&_ol]:list-decimal [&_ul]:list-disc [&_ol]:pl-5 [&_ul]:pl-5 [&_ol]:space-y-1 [&_ul]:space-y-1 [&_strong]:text-on-surface [&_strong]:font-semibold [&_code]:font-mono [&_code]:text-tertiary [&_code]:text-xs">
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest message in view as content streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  // Abort any in-flight stream when the widget is closed or unmounts, so we
  // stop consuming bandwidth and LLM tokens the user can no longer see.
  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Only the canned greeting present → it's a fresh conversation.
  const isFresh = messages.length === 1;

  // Overwrite the in-progress assistant turn (the last message) as content streams.
  function replaceLastAssistant(content: string) {
    setMessages((prev) => {
      const next = [...prev];
      next[next.length - 1] = { role: "assistant", content };
      return next;
    });
  }

  // Curated guide → instant, deterministic answer (no model call).
  function showGuide(guide: Guide) {
    if (sending) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: guide.label },
      { role: "assistant", content: guide.answer },
    ]);
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");

    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setSending(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // Send only real turns (drop the canned greeting).
      const payload = history.filter((m, i) => !(i === 0 && m.role === "assistant"));
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        replaceLastAssistant(acc);
      }
      acc += decoder.decode(); // flush any trailing multi-byte char (e.g. Korean/emoji)
      replaceLastAssistant(acc || "(no response)");
    } catch (e) {
      // A user-initiated abort (closing the widget) isn't an error to surface.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        replaceLastAssistant("Sorry — I couldn't reach the assistant. Please try again.");
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setSending(false);
    }
  }

  return (
    <>
      {/* Panel */}
      {open && (
        <div className="fixed bottom-28 right-6 z-50 w-[min(92vw,400px)] h-[min(72vh,580px)] flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container shadow-2xl shadow-tertiary/10 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15 bg-surface-container-high">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-tertiary" />
              <span className="text-sm font-headline font-bold text-on-surface">zk-X509 Assistant</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-on-surface-variant hover:text-on-surface transition-colors" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-surface font-medium whitespace-pre-wrap"
                      : "bg-surface-container-high text-on-surface"
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content ? (
                      <AssistantMarkdown text={m.content} />
                    ) : sending && i === messages.length - 1 ? (
                      <Loader2 className="w-4 h-4 animate-spin text-on-surface-variant" />
                    ) : null
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {/* Curated onboarding guides for a fresh conversation */}
            {isFresh && (
              <div className="flex flex-col gap-2 pt-1">
                <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant/70">New here? Start with a guide</span>
                {GUIDES.map((g) => (
                  <button
                    key={g.label}
                    onClick={() => showGuide(g)}
                    className="text-left px-3 py-2 rounded-xl text-sm bg-surface-container-high border border-outline-variant/20 text-on-surface hover:border-tertiary/40 hover:bg-surface-container transition-colors"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Persistent compact guide bar — keeps the prepared guides one tap
              away even after the conversation has started. */}
          {!isFresh && (
            <div className="flex gap-2 overflow-x-auto px-3 pt-2 pb-1 border-t border-outline-variant/15">
              {GUIDES.map((g) => (
                <button
                  key={g.label}
                  onClick={() => showGuide(g)}
                  disabled={sending}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-label bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface hover:border-tertiary/40 disabled:opacity-50 transition-colors"
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}

          <div className={cn("p-3 flex items-end gap-2", isFresh && "border-t border-outline-variant/15")}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask about zk-X509…"
              className="flex-1 resize-none max-h-28 px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant/20 text-on-surface text-sm placeholder:text-on-surface-variant/60 focus:outline-none focus:border-tertiary/40"
            />
            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary text-surface flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-secondary text-black shadow-2xl shadow-secondary/20 flex items-center justify-center hover:scale-110 active:scale-90 transition-transform z-50"
      >
        {open ? <X className="w-7 h-7" /> : <MessageSquare className="w-7 h-7" />}
      </button>
    </>
  );
}
