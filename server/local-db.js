import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateDatabase } from "./db.js";
export function openDatabase(
  filename = process.env.DB_PATH || ".data/marketplace.sqlite",
) {
  if (filename !== ":memory:")
    mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  migrateDatabase(db);
  db.exec("PRAGMA user_version = 6;");
  return db;
}
