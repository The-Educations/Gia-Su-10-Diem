import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { all, one } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";

// Notification links must deep-link to a real object. Regression: three
// notify() sites built "/classes/undefined" and "...withdrawal=undefined"
// because the link column was missing from the query (or the id never set).
// These tests run the real flows and read the recipient's actual rows.

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-links-")),
    file = join(dir, "db.sqlite"),
    db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!");
  const app = createApi(db, { processPhoto, limit: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    let cookie = "";
    return {
      async request(path, method = "GET", body, headers = {}) {
        const response = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
          body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
        return { status: response.status, data: await response.json() };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", {
          email: `${slug}@demo.giasu.test`,
          password: "TestStudy2026!",
        });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  }
  return { db, client, base };
}

test("admin-cancel, dispute-resolve and withdrawal links point at real objects", async (t) => {
  const { client, db } = await fixture(t);
  const admin = client(), student = client(), tutor = client();
  const s = await student.login("student"), u = await tutor.login("chau");
  await admin.login("admin");

  // A real class with real sessions, created through the API like any lesson.
  db.prepare("INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available").run(s.id, 2000000);
  const start = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const sent = await student.request("/proposals", "POST", { tutor_id: u.id, subject_id: "toan", mode: "online", sessions: 3, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }, { weekday: 1, hour: 18, minute: 0 }, { weekday: 2, hour: 18, minute: 0 }], start_date: start });
  assert.equal(sent.status, 201);
  const cid = (await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" })).data.class_id;
  const cls = (await student.request(`/classes/${cid}`)).data;
  const [a, b, c] = cls.sessions;
  const past = (id, hours) => db.prepare("UPDATE class_sessions SET starts_at=? WHERE id=?").run(new Date(Date.now() - hours * 3600000).toISOString(), id);
  past(a.id, 3); past(b.id, 2);

  // 1. Admin cancels a lesson -> session_cancelled links /classes/<id>.
  const cancelled = await admin.request(`/admin/sessions/${c.id}/cancel`, "POST", { note: "review link test" });
  assert.equal(cancelled.status, 200);
  const sNotices = (await student.request("/notifications")).data;
  const cancelNotice = sNotices.find((n) => n.kind === "session_cancelled" && n.subject === cls.title);
  assert.ok(cancelNotice, "student got session_cancelled");
  assert.match(cancelNotice.link, /^\/classes\/\d+$/, `cancel link: ${cancelNotice.link}`);

  // 2. Student disputes an ended session -> admin resolves -> /classes/<id>.
  const disputed = await student.request(`/sessions/${b.id}/dispute`, "POST", { reason: "Gia sư vắng mặt" });
  assert.equal(disputed.status, 200);
  const memberId = one(db, "SELECT member_id FROM session_members WHERE session_id=? AND outcome='disputed'", b.id).member_id;
  const resolved = await admin.request(`/admin/sessions/${b.id}/resolve`, "POST", { member_id: memberId, outcome: "refunded" });
  assert.equal(resolved.status, 200);
  const resolveNotice = (await student.request("/notifications")).data.find((n) => n.kind === "dispute_resolved" && n.subject === cls.title);
  assert.ok(resolveNotice, "student got dispute_resolved");
  assert.match(resolveNotice.link, /^\/classes\/\d+$/, `resolve link: ${resolveNotice.link}`);
  const tutorResolve = (await tutor.request("/notifications")).data.find((n) => n.kind === "dispute_resolved" && n.subject === cls.title);
  assert.match(tutorResolve?.link, /^\/classes\/\d+$/, `tutor resolve link: ${tutorResolve?.link}`);

  // 3. Tutor withdraws -> admins get the finance payouts deep link with a real id.
  db.prepare("INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available").run(u.id, 500000);
  const wd = await tutor.request("/wallet/withdrawals", "POST", { amount: 300000, bank_name: "MB Bank", account_number: "0987654321", account_name: "Nguyen Minh Chau" });
  assert.equal(wd.status, 201);
  const adminNotices = (await admin.request("/notifications")).data;
  const wdNotice = adminNotices.find((n) => n.kind === "withdrawal_requested");
  assert.ok(wdNotice, "admin got withdrawal_requested");
  assert.match(wdNotice.link, /^\/admin\?tab=finance&fin=payouts&withdrawal=\d+$/, `withdrawal link: ${wdNotice.link}`);
  assert.equal(wdNotice.link, `/admin?tab=finance&fin=payouts&withdrawal=${wd.data.withdrawals[0].id}`);

  // No notification on the system may carry a literal "undefined" anywhere.
  for (const c of [admin, student, tutor])
    for (const n of (await c.request("/notifications")).data)
      assert.ok(!/undefined/.test(n.link ?? ""), `undefined in link ${n.link}`);
});
