"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin Console" },
  { href: "/faq", label: "Knowledge Base" },
  { href: "/landing-a", label: "Landing A" },
  { href: "/landing-b", label: "Landing B" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20 flex justify-between items-center px-8 h-20 shadow-2xl shadow-tertiary/5">
      <div className="flex items-center gap-8">
        <Link href="/" className="text-2xl font-bold tracking-tighter text-primary font-headline">
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
        <button className="px-4 py-2 bg-surface-container-high rounded-lg transition-all text-on-surface-variant hover:text-on-surface text-sm font-headline">
          0x...f2a1
        </button>
        <button className="px-6 py-2 bg-primary text-surface font-headline text-sm font-bold rounded-full transition-transform active:scale-95">
          Connect Wallet
        </button>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-surface-container-high rounded-lg transition-all text-on-surface-variant hover:text-on-surface">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-surface-container-high rounded-lg transition-all text-on-surface-variant hover:text-on-surface">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
