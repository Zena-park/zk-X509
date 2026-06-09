/**
 * Single-use guard for owner signatures — anti-replay.
 *
 * A signature is a bearer token for an operation until its freshness window
 * expires (±10 min). The CA-registry flow PUBLISHES the signature in the
 * generated GitHub PR (`signature.json`), so without single-use a captured
 * signature could be replayed (with attacker-substituted, unsigned cert
 * content) for up to 10 min. `consume(key)` marks a signature used and returns
 * false if it was already used, closing that window.
 *
 * Backend mirrors the registry store exactly (firestore on Cloud Functions /
 * REGISTRY_STORE=firestore, else in-memory). Firestore is multi-instance-safe
 * via an atomic `create()`.
 */
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

export interface ReplayGuard {
  /** Mark `key` used (TTL `ttlSec`). True if newly used; false if a replay. */
  consume(key: string, ttlSec: number): Promise<boolean>;
}

/** In-memory: correct for a single instance / the file store / tests. */
class MemoryReplayGuard implements ReplayGuard {
  private seen = new Map<string, number>(); // key -> expiresAt (ms)
  private lastSweep = 0;

  async consume(key: string, ttlSec: number): Promise<boolean> {
    const now = Date.now();
    // Sweep at most once a minute so a large live set doesn't cost O(N) per call.
    if (this.seen.size > 2000 && now - this.lastSweep > 60_000) {
      this.lastSweep = now;
      for (const [k, exp] of this.seen) if (exp <= now) this.seen.delete(k);
    }
    const exp = this.seen.get(key);
    if (exp !== undefined && exp > now) return false; // still within TTL → replay
    this.seen.set(key, now + ttlSec * 1000);
    return true;
  }

  /** Test-only: clear remembered keys between cases. */
  reset(): void {
    this.seen.clear();
    this.lastSweep = 0;
  }
}

/**
 * Firestore: multi-instance-safe. `create()` is atomic — it fails if the doc
 * already exists, which is exactly the replay signal. A Firestore TTL policy on
 * `expiresAt` should be configured to reap old docs.
 */
class FirestoreReplayGuard implements ReplayGuard {
  private readonly db: Firestore;

  constructor() {
    // Ensure the Admin SDK is initialized (mirrors FirestoreRegistryStore); the
    // guard must not depend on the store having been constructed first.
    if (getApps().length === 0) {
      initializeApp(
        process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() },
      );
    }
    this.db = getFirestore();
  }

  async consume(key: string, ttlSec: number): Promise<boolean> {
    try {
      await this.db.collection("usedSignatures").doc(key).create({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSec * 1000),
      });
      return true;
    } catch (e: unknown) {
      // 6 = ALREADY_EXISTS → genuine replay. Any other error is transient; let
      // it propagate so we don't falsely flag a first use as a replay.
      if ((e as { code?: number })?.code === 6) return false;
      throw e;
    }
  }
}

let cached: ReplayGuard | undefined;
export function getReplayGuard(): ReplayGuard {
  if (!cached) {
    // Mirror getRegistryStore(): unset → firestore on Cloud Functions
    // (K_SERVICE), else file/in-memory — so the guard is multi-instance-safe
    // wherever the store is.
    let kind = (process.env.REGISTRY_STORE || "").toLowerCase();
    if (!kind) kind = process.env.K_SERVICE ? "firestore" : "file";
    cached = kind === "firestore" ? new FirestoreReplayGuard() : new MemoryReplayGuard();
  }
  return cached;
}

/** Test-only: reset the (in-memory) guard between cases. No-op for Firestore. */
export function __resetReplayGuardForTest(): void {
  if (cached instanceof MemoryReplayGuard) cached.reset();
}
