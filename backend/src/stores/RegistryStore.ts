import { RegistryEntry } from "./types";

/// Storage port for registry CMS metadata. Two adapters implement it:
///   - FileRegistryStore     (local JSON file — default / dev fallback)
///   - FirestoreRegistryStore (Cloud Firestore — serverless production)
/// Routes are thin controllers over this interface so the REST contract is
/// identical regardless of backend (frontend stays unchanged).
///
/// The metadata document is small (one per registry address), so writes use a
/// full read-modify-save on the whole entry: callers `get`/`getOrCreate`,
/// mutate, then `save`. Each `save` is a single full-document write (atomic for
/// that one write), but the read→modify→save *sequence* is NOT atomic across
/// concurrent writers — two interleaved writes to the same registry are
/// last-writer-wins (a lost update). This is an accepted tradeoff for this
/// single-admin, very-low-write CMS (registry owners editing their own
/// metadata); if write concurrency ever becomes real, add an atomic
/// `update(addr, mutator)` (Firestore `runTransaction` + a file-store
/// serialized write) and route the PUT/POST/DELETE handlers through it.
export interface RegistryStore {
  /**
   * Addresses of registries that are not explicitly unlisted (`listed !== false`).
   * When `chainId` is given, restrict to registries deployed on that network
   * (entries missing a `chainId` are excluded); when omitted, list every network.
   */
  listListed(chainId?: number): Promise<string[]>;

  /** Full entry for `addr` (already lowercased), or null if absent. */
  get(addr: string): Promise<RegistryEntry | null>;

  /**
   * Existing entry for `addr`, or a fresh default entry if absent. The returned
   * object is a private copy safe to mutate; it is NOT persisted until `save`.
   */
  getOrCreate(addr: string): Promise<RegistryEntry>;

  /** Upsert the full entry for `addr`. */
  save(addr: string, entry: RegistryEntry): Promise<void>;
}
