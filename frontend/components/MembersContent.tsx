"use client";

import { useState, useEffect, useMemo } from "react";
import { ethers } from "ethers";
import { Users, Filter, Loader2, Eye, EyeOff } from "lucide-react";
import { useReadProvider } from "@/lib/useReadProvider";
import { IDENTITY_REGISTRY_ABI } from "@/lib/contract";
import { getExplorerSettings, type ExplorerSettings } from "@/lib/platform";
import { truncateHex, bytes32ToString } from "@/lib/utils";

interface MemberEntry {
  user: string;
  nullifier: string;
  country: string;
  org: string;
  orgUnit: string;
  commonName: string;
  blockNumber: number;
}

const FIELD_KEYS = ["country", "org", "orgUnit", "commonName"] as const;
const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  org: "Organization",
  orgUnit: "Org Unit",
  commonName: "Common Name",
};

interface Props {
  registryAddress: string;
  minDisclosureMask: number;
}

export default function MembersContent({ registryAddress, minDisclosureMask }: Props) {
  const provider = useReadProvider();
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExplorerSettings | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  // Fetch explorer settings
  useEffect(() => {
    getExplorerSettings(registryAddress).then(setSettings);
  }, [registryAddress]);

  // Fetch members from on-chain events
  useEffect(() => {
    if (!provider || !settings?.explorerEnabled) return;

    async function fetchMembers() {
      setLoading(true);
      setError(null);
      try {
        const contract = new ethers.Contract(registryAddress, IDENTITY_REGISTRY_ABI, provider);
        const registerFilter = contract.filters.UserRegistered();
        const events = await contract.queryFilter(registerFilter);

        // Build member map (latest event per user wins)
        const memberMap = new Map<string, MemberEntry>();
        for (const event of events) {
          const log = event as ethers.EventLog;
          if (!log.args) continue;
          const entry: MemberEntry = {
            user: log.args.user,
            nullifier: log.args.nullifier,
            country: bytes32ToString(log.args.country),
            org: bytes32ToString(log.args.org),
            orgUnit: bytes32ToString(log.args.orgUnit),
            commonName: bytes32ToString(log.args.commonName),
            blockNumber: log.blockNumber,
          };
          memberMap.set(entry.user.toLowerCase(), entry);
        }

        // Handle re-registrations: update user mapping
        const reRegFilter = contract.filters.UserReRegistered();
        const reRegEvents = await contract.queryFilter(reRegFilter);
        for (const event of reRegEvents) {
          const log = event as ethers.EventLog;
          if (!log.args) continue;
          const oldUser = (log.args.oldUser as string).toLowerCase();
          const newUser = (log.args.newUser as string).toLowerCase();
          memberMap.delete(oldUser);
          memberMap.set(newUser, {
            user: log.args.newUser,
            nullifier: log.args.nullifier,
            country: bytes32ToString(log.args.country),
            org: bytes32ToString(log.args.org),
            orgUnit: bytes32ToString(log.args.orgUnit),
            commonName: bytes32ToString(log.args.commonName),
            blockNumber: log.blockNumber,
          });
        }

        setMembers(Array.from(memberMap.values()).sort((a, b) => b.blockNumber - a.blockNumber));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load members");
      } finally {
        setLoading(false);
      }
    }
    fetchMembers();
  }, [provider, registryAddress, settings?.explorerEnabled]);

  // Visible fields (intersection of settings + disclosure mask)
  const visibleFields = useMemo(() => {
    if (!settings) return [];
    return FIELD_KEYS.filter((key, i) => {
      if (!(minDisclosureMask & (1 << i))) return false;
      return settings.explorerVisibleFields.includes(key);
    });
  }, [settings, minDisclosureMask]);

  const filterableFields = useMemo(() => {
    if (!settings) return [];
    return visibleFields.filter((f) => settings.explorerFilterableFields.includes(f));
  }, [settings, visibleFields]);

  // Unique values for filter dropdowns
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    for (const field of filterableFields) {
      const values = new Set<string>();
      for (const m of members) {
        const val = m[field as keyof MemberEntry] as string;
        if (val) values.add(val);
      }
      opts[field] = Array.from(values).sort();
    }
    return opts;
  }, [members, filterableFields]);

  // Apply filters
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      for (const [field, value] of Object.entries(filters)) {
        if (!value) continue;
        if ((m[field as keyof MemberEntry] as string) !== value) return false;
      }
      return true;
    });
  }, [members, filters]);

  // Not enabled
  if (settings && !settings.explorerEnabled) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center">
        <EyeOff className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-on-surface-variant text-sm">
          The member explorer is not enabled for this service.
        </p>
      </div>
    );
  }

  // No disclosure required
  if (minDisclosureMask === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center">
        <Eye className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p className="text-on-surface-variant text-sm">
          This service does not require disclosure. No member data is available.
        </p>
      </div>
    );
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-3 text-on-surface-variant text-sm">Loading members...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {filterableFields.length > 0 && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-tertiary" />
            <span className="text-on-surface-variant text-xs uppercase tracking-widest font-label">
              Filter
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {filterableFields.map((field) => (
              <select
                key={field}
                value={filters[field] || ""}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, [field]: e.target.value }))
                }
                className="bg-surface border border-outline/20 rounded-lg px-3 py-1.5 text-sm text-on-surface"
              >
                <option value="">All {FIELD_LABELS[field]}</option>
                {filterOptions[field]?.map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            ))}
          </div>
        </div>
      )}

      {/* Members count */}
      <div className="flex items-center justify-between px-1">
        <span className="text-on-surface-variant text-xs">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""}
          {filteredMembers.length !== members.length && ` (${members.length} total)`}
        </span>
      </div>

      {/* Members table */}
      {filteredMembers.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-on-surface-variant text-sm">No members found.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline/10">
                  <th className="text-left px-4 py-3 text-on-surface-variant text-xs uppercase tracking-widest font-label">
                    Address
                  </th>
                  {visibleFields.map((field) => (
                    <th
                      key={field}
                      className="text-left px-4 py-3 text-on-surface-variant text-xs uppercase tracking-widest font-label"
                    >
                      {FIELD_LABELS[field]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr
                    key={member.user}
                    className="border-b border-outline/5 hover:bg-surface/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-primary">
                      {truncateHex(member.user)}
                    </td>
                    {visibleFields.map((field) => (
                      <td key={field} className="px-4 py-3 text-on-surface">
                        {(member[field as keyof MemberEntry] as string) || (
                          <span className="text-on-surface-variant opacity-40">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
