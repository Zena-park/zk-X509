"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  text: string;
  className?: string;
  iconSize?: string;
  title?: string;
}

export default function CopyButton({ text, className, iconSize = "w-3.5 h-3.5", title = "Copy to clipboard" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API unavailable (e.g., insecure context)
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className ?? "ml-2 shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"}
      title={title}
      aria-label={title}
    >
      {copied ? <Check className={`${iconSize} text-secondary`} /> : <Copy className={`${iconSize} text-on-surface-variant`} />}
    </button>
  );
}
