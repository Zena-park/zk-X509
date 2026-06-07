import { RegistryStore } from "./RegistryStore";
import { FileRegistryStore } from "./FileRegistryStore";
import { FirestoreRegistryStore } from "./FirestoreRegistryStore";

export * from "./types";
export { RegistryStore } from "./RegistryStore";
export { FileRegistryStore } from "./FileRegistryStore";
export { FirestoreRegistryStore } from "./FirestoreRegistryStore";

let cached: RegistryStore | undefined;

/// Resolve the active registry store (cached as a singleton):
///   - REGISTRY_STORE="firestore" → Cloud Firestore (prod / emulator)
///   - REGISTRY_STORE="file"      → local JSON file
///   - unset → "firestore" when running on Cloud Functions (`K_SERVICE` is set
///     by the runtime; the file store has no durable disk there), else "file"
///     so `npm run dev` works locally with no Firebase setup.
/// Centralizing the decision here keeps the entry points (server.ts/firebase.ts)
/// free of store-selection side effects.
export function getRegistryStore(): RegistryStore {
  if (cached) return cached;
  let kind = (process.env.REGISTRY_STORE || "").toLowerCase();
  if (!kind) kind = process.env.K_SERVICE ? "firestore" : "file";
  cached = kind === "firestore" ? new FirestoreRegistryStore() : new FileRegistryStore();
  console.log(`[registries] store backend: ${kind === "firestore" ? "firestore" : "file"}`);
  return cached;
}
