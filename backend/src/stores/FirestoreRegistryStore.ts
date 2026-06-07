import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { RegistryStore } from "./RegistryStore";
import { RegistryEntry, makeDefaultEntry } from "./types";

/// Cloud Firestore store — serverless production backend for the CMS metadata.
/// One document per registry under collection `registries`, doc id = the
/// lowercased registry address. Writes are full-document `set()` (atomic at the
/// document level), mirroring the file store's read-modify-save semantics so
/// the REST responses are byte-for-byte identical.
///
/// Local development uses the Firestore emulator automatically when
/// `FIRESTORE_EMULATOR_HOST` is set (the Admin SDK honors it natively).
export class FirestoreRegistryStore implements RegistryStore {
  private readonly db: Firestore;
  private readonly collection: string;

  constructor(collection = "registries") {
    // Initialize the Admin SDK once per process. On Cloud Functions/Run the
    // default credentials are injected; against the emulator the host env var
    // short-circuits credential use.
    if (getApps().length === 0) {
      initializeApp(
        process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }
      );
    }
    this.db = getFirestore();
    this.collection = collection;
  }

  private doc(addr: string) {
    return this.db.collection(this.collection).doc(addr);
  }

  private async snapToEntry(addr: string): Promise<RegistryEntry | null> {
    const snap = await this.doc(addr).get();
    return snap.exists ? (snap.data() as RegistryEntry) : null;
  }

  async listListed(): Promise<string[]> {
    // Small collection (one doc per registry): fetch all and filter in memory,
    // exactly like the file store (`listed !== false` ⇒ included, incl. absent).
    const snap = await this.db.collection(this.collection).get();
    return snap.docs
      .filter((d) => (d.data() as RegistryEntry).listed !== false)
      .map((d) => d.id);
  }

  async get(addr: string): Promise<RegistryEntry | null> {
    return this.snapToEntry(addr);
  }

  async getOrCreate(addr: string): Promise<RegistryEntry> {
    return (await this.snapToEntry(addr)) ?? makeDefaultEntry();
  }

  async save(addr: string, entry: RegistryEntry): Promise<void> {
    await this.doc(addr).set(entry);
  }
}
