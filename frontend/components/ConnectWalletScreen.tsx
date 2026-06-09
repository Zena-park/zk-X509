"use client";

import { motion } from "framer-motion";
import { Wallet } from "lucide-react";
import { useWallet } from "@/lib/wallet";

/**
 * Full-page "connect your wallet" prompt. All node access (read + write) goes
 * through the connected wallet, so pages render this when no wallet is
 * connected. `message` describes what the user unlocks by connecting.
 */
export function ConnectWalletScreen({ message }: { message: string }) {
  const { connect } = useWallet();
  return (
    <main className="max-w-6xl mx-auto pt-24 px-8 pb-12 flex items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-3xl p-12 text-center max-w-md"
      >
        <Wallet className="w-12 h-12 text-on-surface-variant mx-auto mb-4" />
        <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
          Connect Wallet
        </h2>
        <p className="text-on-surface-variant mb-6">{message}</p>
        <button
          onClick={connect}
          className="px-8 py-3 bg-primary text-surface font-headline font-bold rounded-full hover:scale-105 active:scale-95 transition-all"
        >
          Connect
        </button>
      </motion.div>
    </main>
  );
}
