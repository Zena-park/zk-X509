import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/** Site footer, shown on every page via the root layout. */
export function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-8 py-12 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-tertiary" />
        <span className="text-sm font-label">Developed by Tokamak Network</span>
      </div>
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[10px] font-label uppercase tracking-widest">
        <a href="https://arxiv.org/abs/2603.25190" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
          Paper
        </a>
        <Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link>
        <Link href="/built-with" className="hover:text-primary transition-colors">Built with</Link>
        <Link href="/admin" className="hover:text-primary transition-colors">Admin</Link>
        <a href="https://github.com/tokamak-network/zk-X509" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
          GitHub
        </a>
      </div>
    </footer>
  );
}
