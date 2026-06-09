"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Code block with a copy button. Used across the developer portal for
 * copy-paste Solidity / TypeScript / shell snippets.
 */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable (insecure context) — no-op
    }
  };

  return (
    <div className="relative group my-3">
      {lang && (
        <span className="absolute top-2 left-3 text-[10px] uppercase tracking-widest font-label text-on-surface-variant/60">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute top-2 right-2 p-1.5 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className={`overflow-x-auto rounded-xl bg-surface-container-low/60 border border-outline-variant/10 p-4 ${lang ? "pt-7" : ""} text-xs leading-relaxed font-mono text-on-surface`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
