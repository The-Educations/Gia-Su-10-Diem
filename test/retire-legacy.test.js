import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { all, one, run } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-retire-")), file = join(dir, "db.sqlite");
  const db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const app = createApi(db, { processPhoto, limit: false, sendEmail: async () => {}, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  function client() {
    let cookie = "";
    return {
      async request(path, method = "GET", body) {
        const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
        const cookies = res.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
        return { status: res.status, data: await res.json() };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  }
  return { client, base, db };
}

const ledger = (db, ids) => {
  for (const id of ids) {
    const w = one(db, "SELECT * FROM wallets WHERE user_id=?", id) || { available: 0, held: 0 };
    const sums = one(db, "SELECT COALESCE(SUM(amount),0) a, COALESCE(SUM(held),0) h FROM wallet_entries WHERE user_id=?", id);
    assert.equal(sums.a, w.available); assert.equal(sums.h, w.held);
  }
};

test("migration expires pending offers, cancels future bookings, keeps history; writes 410", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), admin = client();
  const s = await student.login("student"), u = await tutor.login("chau"), a = await admin.login("admin");
  const fut = new Date(Date.now() + 86400000).toISOString();
  run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", s.id, u.id);
  run(db, "INSERT INTO offers(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,rate,start_date,end_date,status,kind,weeks) VALUES (?,?,(SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?),'toan','online','[]',200000,?,?,'pending','course',4)", s.id, u.id, s.id, u.id, fut.slice(0,10), fut.slice(0,10));
  run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,status,duration_minutes) VALUES (?,?,11,'toan',?,200000,'online','','pending',60)", s.id, u.id, fut);
  run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,status,duration_minutes) VALUES (?,?,12,'toan',?,200000,'online','','completed',60)", s.id, u.id, new Date(Date.now() - 7 * 86400000).toISOString());
  run(db, "INSERT INTO weekly_requests(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,rate,status) VALUES (?,?,(SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?),'toan','online','[]',150000,'pending')", s.id, u.id, s.id, u.id);
  ledger(db, [s.id, u.id]);
  // createApi already ran retireLegacyFlow at startup of THIS fixture? — the
  // inserts above came after, so trigger it once more via a fresh fixture's
  // effect: re-check in the NEXT test instance instead. Here call directly:
  const { retireLegacyFlow } = await import("../server/legacy-retire.js");
  retireLegacyFlow(db);
  assert.equal(one(db, "SELECT status FROM offers WHERE status='pending'"), undefined, "pending offer expired");
  assert.equal(one(db, "SELECT COUNT(*) n FROM bookings WHERE status IN ('pending','accepted') AND starts_at>?", new Date().toISOString()).n, 0);
  assert.equal(one(db, "SELECT COUNT(*) n FROM bookings WHERE status='completed'").n, 1, "completed history kept");
  assert.equal(one(db, "SELECT status FROM weekly_requests WHERE tutor_id=? ORDER BY id DESC", u.id).status, "declined");
  assert.ok(one(db, "SELECT 1 FROM notifications WHERE user_id=?", s.id), "student notified");
  assert.ok(one(db, "SELECT 1 FROM notifications WHERE user_id=?", u.id), "tutor notified");
  ledger(db, [s.id, u.id]);

  // GETs still serve history; every write answers 410 with guidance.
  assert.equal((await student.request("/bookings")).status, 200);
  assert.equal((await student.request("/offers")).status, 200);
  for (const [m, p] of [["POST", "/bookings"], ["PATCH", "/bookings/1"], ["POST", "/bookings/1/messages"], ["POST", "/bookings/1/review"], ["POST", "/offers"], ["PATCH", "/offers/1"], ["POST", "/offers/preview"], ["POST", "/weekly-requests"], ["PATCH", "/weekly-requests/1"], ["PUT", "/bookings/1/rating"]]) {
    const r = await student.request(p, m, {});
    assert.equal(r.status, 410, `${m} ${p}`);
    assert.ok(r.data.retired === true && r.data.message.includes("đề nghị"), "guidance message");
  }
  ledger(db, [s.id, u.id]);
});
