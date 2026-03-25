"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ethers } from "ethers";
import { ArrowLeft } from "lucide-react";
import AdminContent from "@/components/AdminContent";
import { REGISTRY_FACTORY_ABI, getFactoryAddress, getRpcUrl } from "@/lib/contract";
import { useWallet } from "@/lib/wallet";

export default function ScopedAdminPage() {
  const params = useParams<{ address: string }>();
  const address = params.address;
  const { chainId } = useWallet();
  const [serviceName, setServiceName] = useState<string>("");
  const providerRef = useRef<ethers.JsonRpcProvider | null>(null);

  useEffect(() => {
    const cid = chainId || "31337";
    const factoryAddr = getFactoryAddress(cid);
    if (!factoryAddr || !address) return;

    (async () => {
      try {
        if (!providerRef.current) {
          providerRef.current = new ethers.JsonRpcProvider(getRpcUrl());
        }
        const factory = new ethers.Contract(factoryAddr, REGISTRY_FACTORY_ABI, providerRef.current);
        const info = await factory.registryInfo(address);
        setServiceName(info.name ?? info[1] ?? "");
      } catch (e) {
        console.error("Failed to load service name:", e);
      }
    })();
  }, [address, chainId]);

  return (
    <>
      <div className="max-w-6xl mx-auto pt-24 px-8 pb-2">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors font-headline text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Services
        </Link>
        {serviceName && (
          <h1 className="text-2xl font-headline font-bold tracking-tight text-primary mt-3">
            {serviceName}
          </h1>
        )}
      </div>
      <AdminContent />
    </>
  );
}
