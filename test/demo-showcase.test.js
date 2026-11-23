import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { one, all } from "../server/db.js";

// Seeded audit rows must deep-link to real records, not lookalike ids.
test("showcase audit targets resolve to the people named in detail", async (t) => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "giasu-seed-")), "db.sqlite"));
  seedCatalog(db);
  await seedDemo(db, "DemoTest2026!", { activity: true });
  t.after(() => db.close());
  const rows = all(db, "SELECT action,target,detail FROM audit WHERE action LIKE 'tutor.%' OR action LIKE 'credential.%'");
  assert.ok(rows.length >= 4, "expected seeded tutor/credential audit rows");
  for (const row of rows) {
    const detail = JSON.parse(row.detail || "{}");
    if (row.action.startsWith("tutor.")) {
      const u = one(db, "SELECT name FROM users WHERE id=?", Number(row.target));
      assert.ok(u, `${row.action} target ${row.target} should be a user`);
      if (detail.name) assert.equal(u.name, detail.name, `${row.action} target ${row.target}`);
    } else {
      const c = one(db, "SELECT u.name FROM tutor_credentials c JOIN users u ON u.id=c.tutor_id WHERE c.id=?", Number(row.target));
      assert.ok(c, `${row.action} target ${row.target} should be a credential`);
      if (detail.name) assert.equal(c.name, detail.name, `${row.action} target ${row.target}`);
    }
  }
  // And every audit target should resolve to *something* named, not a bare id.
  for (const row of all(db, "SELECT action,target FROM audit WHERE target NOT IN ('0','')")) {
    assert.ok(row.target && row.target !== "undefined", `${row.action} has a target`);
  }
});