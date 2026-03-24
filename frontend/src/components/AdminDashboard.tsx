"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { IDENTITY_REGISTRY_ABI } from "@/contracts/IdentityRegistry";

interface DashboardProps {
  contract: ethers.Contract | null;
}

interface ContractState {
  owner: string;
  paused: boolean;
  caMerkleRoot: string;
  crlMerkleRoot: string;
  maxProofAge: bigint;
  maxWalletsPerCert: number;
}

export function AdminDashboard({ contract }: DashboardProps) {
  const [state, setState] = useState<ContractState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contract) return;
    (async () => {
      try {
        const [owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, maxWalletsPerCert] =
          await Promise.all([
            contract.owner(),
            contract.paused(),
            contract.caMerkleRoot(),
            contract.crlMerkleRoot(),
            contract.maxProofAge(),
            contract.maxWalletsPerCert(),
          ]);
        setState({ owner, paused, caMerkleRoot, crlMerkleRoot, maxProofAge, maxWalletsPerCert });
      } catch (e) {
        console.error("Failed to load contract state:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [contract]);

  if (loading) return <p className="text-sm text-gray-400">Loading...</p>;
  if (!state) return <p className="text-sm text-red-400">Failed to load contract state</p>;

  const proofAgeMin = Number(state.maxProofAge) / 60;
  const crlEnabled = state.crlMerkleRoot !== ethers.ZeroHash;

  return (
    <div className="space-y-3 text-sm">
      <Row label="Owner" value={state.owner} mono />
      <Row label="Paused" value={state.paused ? "YES" : "NO"} color={state.paused ? "red" : "green"} />
      <Row label="CA Merkle Root" value={state.caMerkleRoot === ethers.ZeroHash ? "Not set" : state.caMerkleRoot} mono />
      <Row label="CRL Merkle Root" value={crlEnabled ? state.crlMerkleRoot : "Disabled"} mono={crlEnabled} />
      <Row label="Max Proof Age" value={`${proofAgeMin} min`} />
      <Row label="Max Wallets/Cert" value={String(state.maxWalletsPerCert)} />
    </div>
  );
}

function Row({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
  const colorClass = color === "red" ? "text-red-400" : color === "green" ? "text-green-400" : "text-blue-400";
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400">{label}</span>
      <span className={`${mono ? "font-mono text-xs" : ""} ${colorClass} truncate max-w-[400px]`}>
        {value}
      </span>
    </div>
  );
}
