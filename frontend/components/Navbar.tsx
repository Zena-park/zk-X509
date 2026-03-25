"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/lib/wallet";

const defaultNavLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Explore" },
  { href: "/identity", label: "Verified" },
  { href: "/admin", label: "My Console" },
  { href: "/faq", label: "FAQ" },
];

/** Extract registry address from a /registry/[address]/... path, or null */
function extractRegistryScope(pathname: string): string | null {
  const match = pathname.match(/^\/registry\/(0x[a-fA-F0-9]{40})/);
  return match ? match[1] : null;
}

export function Navbar() {
  const pathname = usePathname();
  const { account, chainName, chainId, registryAddr, connect, disconnect } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  const registryScope = extractRegistryScope(pathname);

  const navLinks = useMemo(() => {
    if (!registryScope) return defaultNavLinks;
    return [
      { href: "/", label: "Home" },
      { href: "/dashboard", label: "Explore" },
      { href: "/identity", label: "Verified" },
      { href: `/registry/${registryScope}/admin`, label: "Manage" },
      { href: "/faq", label: "FAQ" },
    ];
  }, [registryScope]);

  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex justify-between items-center px-8 h-20 shadow-2xl shadow-tertiary/5">
      <div className="flex items-center gap-8">
        <Link href="/" className="flex items-center gap-2 text-2xl font-bold tracking-tighter text-primary font-headline">
          <img src="/logo.png" alt="zk-X509" className="w-8 h-8" />
          ZK-X509
        </Link>
        <div className="hidden md:flex gap-6 items-center">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "font-headline text-sm tracking-tight transition-colors",
                  isActive
                    ? "text-tertiary border-b-2 border-tertiary pb-1"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Network badge */}
        {account && chainName && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(107,255,143,0.5)]" />
            <span className="text-xs font-label text-on-surface-variant">{chainName} ({chainId})</span>
          </div>
        )}

        {/* Wallet */}
        {account ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="px-4 py-2 bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface text-sm font-mono transition-all"
            >
              {account.slice(0, 6)}...{account.slice(-4)}
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-outline-variant/20 bg-surface-container py-1 shadow-lg z-50">
                <button
                  onClick={() => { disconnect(); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm text-error hover:bg-surface-container-high"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={connect}
            className="px-6 py-2 bg-primary text-surface font-headline text-sm font-bold rounded-full transition-transform active:scale-95"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
