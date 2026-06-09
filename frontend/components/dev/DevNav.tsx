"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/developers", label: "Overview" },
  { href: "/developers/quickstart", label: "Quickstart" },
  { href: "/developers/contracts", label: "Contracts" },
  { href: "/developers/sdk", label: "SDK & CLI" },
];

export function DevNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1.5 mb-8 border-b border-outline-variant/10 pb-3">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-label transition-colors",
              active
                ? "bg-tertiary/15 text-tertiary"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
            )}
          >
            {t.label}
          </Link>
        );
      })}
      <a
        href="/developers/llms.txt"
        target="_blank"
        rel="noreferrer"
        className="ml-auto px-3 py-1.5 rounded-full text-xs font-label text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
        title="Machine-readable docs for AI agents / LLMs"
      >
        llms.txt ↗
      </a>
    </nav>
  );
}
