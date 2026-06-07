import { RegistryEntry } from "./types";

/// Storage port for registry CMS metadata. Two adapters implement it:
///   - FileRegistryStore     (local JSON file — default / dev fallback)
///   - FirestoreRegistryStore (Cloud Firestore — serverless production)
/// Routes are thin controllers over this interface so the REST contract is
/// identical regardless of backend (frontend stays unchanged).
///
/// The metadata document is small (one per registry address), so writes use a
/// full read-modify-save on the whole entry — atomic at the document level in
/// Firestore — mirroring the original file store's behavior exactly. Callers
/// validate/normalize the entry, then persist it via `save`.
export interface RegistryStore {
  /** Addresses of registries that are not explicitly unlisted (`listed !== false`). */
  listListed(): Promise<string[]>;

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
