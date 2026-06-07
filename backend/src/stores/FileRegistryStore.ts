import * as fs from "fs";
import * as path from "path";
import { RegistryStore } from "./RegistryStore";
import { DB, RegistryEntry, makeDefaultEntry, normalizeEntry, DEFAULT_REGISTRIES_DB_PATH } from "./types";

/// Local JSON-file store — the original backend behavior, kept as the default
/// and as a zero-dependency fallback for local development (no Firebase setup
/// or emulator required). Reads/writes `backend/db/registries.json`.
export class FileRegistryStore implements RegistryStore {
  private readonly dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? DEFAULT_REGISTRIES_DB_PATH;
  }

  private readDB(): DB {
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, "utf-8"));
    } catch (error: any) {
      if (error.code === "ENOENT") {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        fs.writeFileSync(this.dbPath, "{}", "utf-8");
        return {};
      }
      console.error("Error reading or parsing DB file at " + this.dbPath + ":", error);
      throw error;
    }
  }

  private writeDB(db: DB): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2), "utf-8");
  }

  async listListed(): Promise<string[]> {
    const db = this.readDB();
    return Object.entries(db)
      .filter(([, entry]) => entry.listed !== false)
      .map(([addr]) => addr);
  }

  async get(addr: string): Promise<RegistryEntry | null> {
    const db = this.readDB();
    return db[addr] ? normalizeEntry(db[addr]) : null;
  }

  async getOrCreate(addr: string): Promise<RegistryEntry> {
    const db = this.readDB();
    return db[addr] ? normalizeEntry(db[addr]) : makeDefaultEntry();
  }

  async save(addr: string, entry: RegistryEntry): Promise<void> {
    const db = this.readDB();
    db[addr] = entry;
    this.writeDB(db);
  }
}
