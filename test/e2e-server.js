import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";

import { seedCatalog, seedDemo } from "../server/seed.js";
const dir = mkdtempSync(join(tmpdir(), "giasu-browser-"));
process.env.DB_PATH = join(dir, "db.sqlite");
process.env.PORT = "4175";
process.env.NODE_ENV = "test";
process.env.SERVE_BUILD = "1";
process.env.APP_ORIGIN = "http://127.0.0.1:4175";
const db = openDatabase();
seedCatalog(db);
await seedDemo(db, "BrowserStudy2026!");
db.close();
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
await import("../server/index.js");
