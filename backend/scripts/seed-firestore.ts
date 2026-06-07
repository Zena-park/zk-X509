/// One-shot, idempotent migration/seed: copies every entry from the local
/// db/registries.json into Firestore (collection `registries`, doc id =
/// lowercased address). Re-running overwrites each doc with the file contents,
/// so it is safe to repeat.
///
/// Usage:
///   # against the local emulator
///   FIRESTORE_EMULATOR_HOST=localhost:8080 npx ts-node scripts/seed-firestore.ts
///   # against a real project (uses Application Default Credentials)
///   GOOGLE_CLOUD_PROJECT=<id> npx ts-node scripts/seed-firestore.ts
import * as fs from "fs";
import { FirestoreRegistryStore } from "../src/stores/FirestoreRegistryStore";
import { DB, DEFAULT_REGISTRIES_DB_PATH } from "../src/stores/types";

async function main() {
  const raw = fs.readFileSync(DEFAULT_REGISTRIES_DB_PATH, "utf-8");
  const db = JSON.parse(raw) as DB;

  const store = new FirestoreRegistryStore();
  const addrs = Object.keys(db);
  console.log(`Seeding ${addrs.length} registry entries into Firestore...`);

  let n = 0;
  for (const addr of addrs) {
    const id = addr.toLowerCase();
    await store.save(id, db[addr]);
    n++;
    console.log(`  [${n}/${addrs.length}] ${id}`);
  }

  console.log(`Done. ${n} entries written.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
