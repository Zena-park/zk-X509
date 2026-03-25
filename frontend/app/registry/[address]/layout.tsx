"use client";

import { useParams } from "next/navigation";
import { WalletProvider } from "@/lib/wallet";

export default function RegistryLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ address: string }>();
  const address = params.address;

  return <WalletProvider registryOverride={address}>{children}</WalletProvider>;
}
