import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { all, one, run, transaction } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";
import { processPhoto } from "../server/photo.js";
import { migrateNotifications } from "../server/notifications.js";
import { createNoticeMailer } from "../server/notice-mail.js";
import { createMailflareSender } from "../server/email-verification.js";
import { PARENT_KINDS, notifyParents } from "../server/family-notify.js";

// Lỗi 18: parents pay and follow, but only ever heard about their own top-ups.
// Every notice here is produced by a real API flow, never inserted by hand.

const SECRETS = {
  reason: "BIMAT-ly-do-gia-su-vang-mat",
  comment: "BIMAT-nhan-xet-buoi-hoc",
  message: "BIMAT-noi-dung-tin-nhan",
  account: "9704229876543210",
  holder: "BIMAT CHU TAI KHOAN",
};
const DAY = 86400000, HOUR = 3600000;

async function fixture(t, { link = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-parent-")), db = openDatabase(join(dir, "db.sqlite"));
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

  async function login(slug) {
    let cookie = "";
    const request = async (path, method = "GET", body) => {
      const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });
      const cookies = res.headers.getSetCookie();
      if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
      return { status: res.status, data: await res.json() };
    };
    const r = await request("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
    assert.equal(r.status, 200, `login ${slug}`);
    return { ...r.data.user, request };
  }
  const idOf = (slug) => one(db, "SELECT id FROM users WHERE email=?", `${slug}@demo.giasu.test`).id;
  const parentId = idOf("parent");
  run(db, "UPDATE users SET learner_type='parent' WHERE id=?", parentId);
  const linkUp = (parent, student) => run(db, "INSERT INTO family_links(parent_id,student_id) VALUES (?,?)", parent, student);
  if (link) linkUp(parentId, idOf("student"));

  // Another account that signs in with the demo password, for second parents and classmates.
  const addUser = (slug, name, learnerType) => {
    const like = one(db, "SELECT * FROM users WHERE email='student@demo.giasu.test'");
    const id = Number(run(db, "INSERT INTO users(name,email,password,role,demo,onboarding_step,learner_type) VALUES (?,?,?,'student',1,?,?)",
      name, `${slug}@demo.giasu.test`, like.password, like.onboarding_step, learnerType).lastInsertRowid);
    if (learnerType === "student") run(db, "INSERT INTO student_verifications(user_id,status) VALUES (?,'approved')", id);
    return id;
  };
  const grant = (id, amount) => {
    run(db, "INSERT INTO wallet_entries(user_id,kind,amount,ref) VALUES (?,'test_grant',?,'grant')", id, amount);
    run(db, "INSERT INTO wallets(user_id,available) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET available=available+excluded.available", id, amount);
  };
  const bells = (id) => all(db, "SELECT * FROM notifications WHERE user_id=? AND kind LIKE 'child\\_%' ESCAPE '\\' ORDER BY id", id)
    .map((n) => ({ ...n, data: JSON.parse(n.detail || "{}") }));
  const mails = (id) => all(db, "SELECT * FROM email_outbox WHERE user_id=? AND kind LIKE 'child\\_%' ESCAPE '\\' ORDER BY id", id)
    .map((n) => ({ ...n, data: JSON.parse(n.detail || "{}") }));
  const sessionAt = (id, ms) => run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() + ms).toISOString(), id);

  return { db, login, idOf, parentId, linkUp, addUser, grant, bells, mails, sessionAt };
}

const offer = (extra) => ({
  subject_id: "toan", mode: "online", sessions: 6, minutes: 60, rate: 200000,
  schedule: [{ weekday: 0, hour: 18, minute: 0 }, { weekday: 2, hour: 18, minute: 0 }, { weekday: 4, hour: 18, minute: 0 }],
  start_date: new Date(Date.now() + 9 * DAY).toISOString().slice(0, 10), ...extra,
});
async function send(from, extra) {
  const r = await from.request("/proposals", "POST", offer(extra));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
async function ok(promise, status = 200) {
  const r = await promise;
  assert.equal(r.status, status, JSON.stringify(r.data));
  return r.data;
}
async function openClass(student, tutor, extra) {
  const p = await send(student, { tutor_id: tutor.id, ...extra });
  const { class_id } = await ok(tutor.request(`/proposals/${p.id}`, "PATCH", { action: "accept" }));
  return { proposal: p, cls: await ok(student.request(`/classes/${class_id}`)) };
}

// One run through every flow that touches the child's money or timetable.
async function everyFlow(f) {
  const { db, login, grant, sessionAt, parentId } = f;
  const student = await login("student"), tutor = await login("chau"), admin = await login("admin"), parent = await login("parent");
  grant(student.id, 3000000);

  const declined = await send(student, { tutor_id: tutor.id });
  await ok(tutor.request(`/proposals/${declined.id}`, "PATCH", { action: "decline" }));

  const fromTutor = await send(tutor, { student_id: student.id, sessions: 30, rate: 500000 });
  const shortBy = 30 * 500000 - one(db, "SELECT available FROM wallets WHERE user_id=?", student.id).available;
  await ok(student.request(`/proposals/${fromTutor.id}`, "PATCH", { action: "decline" }));

  const stale = await send(student, { tutor_id: tutor.id });
  run(db, "UPDATE proposals SET expires_at=? WHERE id=?", new Date(Date.now() - HOUR).toISOString(), stale.id);
  await ok(student.request("/proposals"));

  const { proposal, cls } = await openClass(student, tutor);
  const [byTutor, late, byAdmin, moved, disputed] = cls.sessions;

  await ok(tutor.request(`/sessions/${byTutor.id}/cancel`, "POST"));

  sessionAt(late.id, HOUR);
  const lateResult = await ok(student.request(`/sessions/${late.id}/cancel`, "POST"));
  assert.deepEqual(lateResult, { outcome: "charged", late: true });

  await ok(admin.request(`/admin/sessions/${byAdmin.id}/cancel`, "POST", { note: "quản trị hủy khi kiểm thử" }));

  // A move that is only proposed, or refused, changes no timetable.
  const later = new Date(Date.now() + 30 * DAY).toISOString();
  await ok(tutor.request(`/sessions/${moved.id}/move`, "POST", { starts_at: later }), 201);
  let pending = (await ok(student.request(`/classes/${cls.id}`))).moves[0];
  await ok(student.request(`/moves/${pending.id}`, "PATCH", { accept: false }));
  assert.equal(f.bells(parentId).filter((n) => n.kind === "child_session_moved").length, 0, "refused move tells nobody");
  await ok(tutor.request(`/sessions/${moved.id}/move`, "POST", { starts_at: later }), 201);
  pending = (await ok(student.request(`/classes/${cls.id}`))).moves[0];
  await ok(student.request(`/moves/${pending.id}`, "PATCH", { accept: true }));

  sessionAt(disputed.id, -3 * HOUR);
  await ok(student.request(`/sessions/${disputed.id}/rating`, "PUT", { rating: 2, comment: SECRETS.comment }));
  const thread = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", student.id, tutor.id);
  await ok(student.request(`/inquiries/${thread.id}/messages`, "POST", { body: SECRETS.message }), 201);
  await ok(student.request(`/sessions/${disputed.id}/dispute`, "POST", { reason: SECRETS.reason }));
  const member = cls.members[0];
  await ok(admin.request(`/admin/sessions/${disputed.id}/resolve`, "POST", { member_id: member.id, outcome: "refunded" }));

  await ok(tutor.request(`/members/${member.id}/remind`, "POST"));
  await ok(student.request(`/members/${member.id}/renew`, "POST", { sessions: 2 }));
  await ok(student.request(`/members/${member.id}/end`, "POST"));

  await ok(student.request("/wallet/withdrawals", "POST", { amount: 100000, bank_name: "MB Bank", account_number: SECRETS.account, account_name: SECRETS.holder }), 201);
  await ok(admin.request(`/admin/verifications/${student.id}`, "PATCH", { status: "rejected", note: "Ảnh mờ" }));

  // Open every link while the family is still linked: the API behind each page answers 200.
  const family = await ok(parent.request("/family"));
  assert.ok(family.children.some((c) => c.id === student.id));
  for (const n of f.bells(parentId)) {
    const url = new URL(n.link, "http://x");
    assert.ok(["/family", "/proposals", "/wallet"].includes(url.pathname), `${n.kind} link ${n.link}`);
    await ok(parent.request(url.pathname === "/wallet" ? "/wallet" : url.pathname));
    if (url.pathname === "/proposals") {
      const list = await ok(parent.request("/proposals"));
      assert.ok(list.some((p) => p.id === Number(url.searchParams.get("id"))), `proposal in ${n.link} is visible`);
    }
  }

  await ok(student.request(`/family/${parentId}`, "DELETE"));
  return { student, tutor, admin, parent, cls, proposal, declined, fromTutor, shortBy, stale, byTutor, late, byAdmin, moved, later, disputed };
}

test("every parent kind comes from a real flow, with the child, a safe link and the right facts", async (t) => {
  const f = await fixture(t), w = await everyFlow(f);
  const rows = f.bells(f.parentId), child = w.student;
  assert.deepEqual([...new Set(rows.map((n) => n.kind))].sort(), Object.keys(PARENT_KINDS).sort());
  for (const n of rows) {
    assert.equal(n.child_id, child.id, `${n.kind} child_id`);
    assert.doesNotMatch(`${n.link} ${n.detail} ${n.subject} ${n.actor_name}`, /undefined|NaN|\[object/, n.kind);
  }
  const of = (kind) => rows.filter((n) => n.kind === kind);

  assert.deepEqual(of("child_proposal_sent").map((n) => n.data.amount), [1200000, 1200000, 1200000]);
  assert.equal(of("child_proposal_sent")[0].link, `/proposals?id=${w.declined.id}`);
  assert.equal(of("child_proposal_sent")[0].actor_name, w.tutor.name);
  assert.equal(of("child_proposal_sent")[0].subject, "Toán");

  const [asked] = of("child_proposal_new");
  assert.deepEqual([asked.data.amount, asked.data.short, asked.link], [15000000, w.shortBy, `/wallet?for=${child.id}`]);

  assert.deepEqual(of("child_proposal_closed").map((n) => [n.data.outcome, n.data.amount]),
    [["declined", 1200000], ["declined", 0], ["expired", 1200000]]);

  assert.equal(of("child_class_started").length, 1);
  assert.equal(of("child_class_started")[0].link, `/family?child=${child.id}`);
  assert.equal(of("child_class_started")[0].actor_name, w.tutor.name);

  assert.deepEqual(of("child_session_cancelled").map((n) => [n.data.by, n.data.late, n.data.charged, n.data.when]), [
    ["tutor", false, false, w.byTutor.starts_at],
    ["student", true, true, of("child_session_cancelled")[1].data.when],
    ["admin", false, false, w.byAdmin.starts_at],
  ]);
  assert.equal(of("child_session_cancelled")[1].actor_name, child.name);

  assert.deepEqual(of("child_session_moved").map((n) => [n.data.from, n.data.when]), [[w.moved.starts_at, w.later]]);
  assert.equal(of("child_session_disputed").length, 1);
  assert.equal(of("child_session_disputed")[0].data.by, "student");
  assert.ok(of("child_session_disputed")[0].data.when);
  assert.equal(of("child_dispute_resolved")[0].data.outcome, "refunded");
  assert.equal(of("child_renew_reminder")[0].link, `/wallet?for=${child.id}`);
  assert.deepEqual([of("child_package_renewed")[0].data.n, of("child_package_renewed")[0].data.amount], [2, 400000]);

  const refunded = one(f.db, "SELECT amount FROM wallet_entries WHERE user_id=? AND kind='lesson_refund'", child.id).amount;
  assert.equal(of("child_package_ended").length, 1);
  assert.equal(of("child_package_ended")[0].data.amount, refunded);

  assert.deepEqual(of("child_withdrawal_requested")[0].data, { amount: 100000, last4: "3210" });
  assert.deepEqual(of("child_verification")[0].data, { status: "rejected" });
  assert.equal(of("child_unlinked")[0].link, "/family");

  // Email goes out for exactly the kinds marked as emailed, one per bell row.
  const mails = f.mails(f.parentId);
  assert.deepEqual(mails.map((m) => m.kind), rows.filter((n) => PARENT_KINDS[n.kind].email).map((n) => n.kind));
  assert.deepEqual(Object.entries(PARENT_KINDS).filter(([, k]) => !k.email).map(([k]) => k).sort(),
    ["child_package_renewed", "child_proposal_closed", "child_proposal_sent", "child_verification"]);
  for (const m of mails) assert.equal(m.data.child, child.name, `${m.kind} carries the child's name`);

  // Every emailed notice renders in the parent's voice.
  const sent = [];
  run(f.db, "UPDATE email_outbox SET sent_at=NULL,attempts=0,sending_until=0 WHERE user_id=?", f.parentId);
  run(f.db, "DELETE FROM email_outbox WHERE user_id<>? OR kind NOT LIKE 'child%'", f.parentId);
  const mailer = createNoticeMailer(f.db, { sendEmail: async (m) => sent.push(m), origin: "https://gs.test" });
  while (await mailer.flush());
  assert.equal(sent.length, mails.length);
  for (const [i, m] of sent.entries()) {
    assert.equal(m.link, `https://gs.test/app${mails[i].link}`);
    assert.ok(m.message.includes(child.name), `${mails[i].kind}: ${m.message}`);
    assert.doesNotMatch(`${m.subject} ${m.message} ${m.action}`, /undefined|NaN|Invalid Date|\[object/, mails[i].kind);
    assert.ok(["Xem việc học của con", "Nạp cho con", "Xem đề nghị"].includes(m.action), m.action);
  }

  // Nothing private reaches the parent, in the bell or in the mail.
  const everything = JSON.stringify([rows, mails, sent, (await w.parent.request("/notifications")).data]);
  for (const secret of Object.values(SECRETS)) assert.ok(!everything.toUpperCase().includes(secret.toUpperCase()), `leaked ${secret}`);

  // The bell API carries what the client needs to write the sentence.
  const api = (await w.parent.request("/notifications")).data.find((n) => n.kind === "child_session_moved");
  assert.equal(api.child_id, child.id);
  assert.equal(api.child_name, child.name);
  assert.equal(JSON.parse(api.detail).when, w.later);
  // A deleted child reads as a deleted account, not as the old name.
  run(f.db, "UPDATE users SET name='Tài khoản đã xóa',status='deleted' WHERE id=?", child.id);
  assert.equal((await w.parent.request("/notifications")).data.find((n) => n.child_id === child.id).child_name, "Tài khoản đã xóa");
});

test("the bell writes every parent notice as a full sentence, in both languages", async (t) => {
  const { childNotice, CHILD_TEMPLATES } = await import("../app/src/lib/child-notices.ts");
  const f = await fixture(t), w = await everyFlow(f);
  const rows = (await w.parent.request("/notifications")).data.filter((n) => n.kind.startsWith("child_"));
  const fill = (text, params = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{missing ${k}}`));
  const format = { t: fill, when: (iso) => `<${iso}>`, money: (n) => `${n}đ` };
  const seen = new Set();
  for (const n of rows) {
    const out = childNotice(n, format);
    assert.ok(out, `no sentence for ${n.kind}`);
    assert.ok(["users", "calendar", "wallet"].includes(out.icon));
    assert.ok(out.text.includes(w.student.name), `${n.kind}: ${out.text}`);
    assert.doesNotMatch(out.text, /\{|undefined|NaN|<>/, n.kind);
    seen.add(n.kind);
  }
  assert.deepEqual([...seen].sort(), Object.keys(PARENT_KINDS).sort());
  const texts = rows.map((n) => childNotice(n, format).text);
  assert.ok(texts.some((s) => s.includes("vẫn tính phí")), "late cancellation says it is still charged");
  assert.ok(texts.some((s) => s.includes("Còn thiếu")), "offer short of money says by how much");
  assert.ok(texts.some((s) => s.endsWith("hoàn tiền")), "resolved dispute names the outcome");
  assert.ok(!texts.some((s) => / 0đ/.test(s)), "no sentence talks about 0đ");
  assert.equal(childNotice({ kind: "proposal_new", detail: "", subject: "", actor_name: "" }, format), null);
  // A broken detail still gives a sentence instead of a crash.
  for (const kind of Object.keys(PARENT_KINDS))
    assert.ok(childNotice({ kind, detail: "{oops", subject: "Toán", actor_name: "A", child_name: "B" }, format).text);

  const keys = new Set();
  for (const file of ["en.ts", "en-more.ts"])
    for (const m of readFileSync(new URL(`../app/src/lib/locales/${file}`, import.meta.url), "utf8").matchAll(/^\s*["'`]([^"'`]+)["'`]\s*:/gm)) keys.add(m[1]);
  assert.deepEqual(CHILD_TEMPLATES.filter((vi) => !keys.has(vi)), [], "templates without an English entry");
});

test("no notice for a parent who is not linked, was removed, is not active or is not a parent account", async (t) => {
  const f = await fixture(t, { link: false }), student = await f.login("student"), tutor = await f.login("chau");
  f.grant(student.id, 5000000);
  const round = async () => {
    const p = await send(student, { tutor_id: tutor.id, sessions: 1 });
    await ok(student.request(`/proposals/${p.id}`, "PATCH", { action: "withdraw" }));
  };
  const count = () => f.bells(f.parentId).length + f.mails(f.parentId).length;

  await round();
  assert.equal(count(), 0, "not linked");
  f.linkUp(f.parentId, student.id);
  run(f.db, "DELETE FROM family_links WHERE parent_id=?", f.parentId);
  await round();
  assert.equal(count(), 0, "link removed");
  f.linkUp(f.parentId, student.id);
  run(f.db, "UPDATE users SET status='blocked' WHERE id=?", f.parentId);
  await round();
  assert.equal(count(), 0, "account not active");
  run(f.db, "UPDATE users SET status='active',learner_type='student' WHERE id=?", f.parentId);
  await round();
  assert.equal(count(), 0, "not a parent account");
  run(f.db, "UPDATE users SET learner_type='parent' WHERE id=?", f.parentId);
  await round();
  assert.equal(f.bells(f.parentId).length, 2, "control: a linked active parent is told (sent and closed)");
});

test("both parents of one child are told", async (t) => {
  const f = await fixture(t), student = await f.login("student"), tutor = await f.login("chau");
  const second = f.addUser("dad", "Bố Minh", "parent");
  f.linkUp(second, student.id);
  f.grant(student.id, 2000000);
  await openClass(student, tutor);
  const kinds = (id) => f.bells(id).map((n) => n.kind);
  assert.deepEqual(kinds(f.parentId), ["child_proposal_sent", "child_class_started"]);
  assert.deepEqual(kinds(second), kinds(f.parentId));
  assert.deepEqual(f.mails(second).map((m) => m.kind), ["child_class_started"]);
});

test("in a group class a parent only ever hears about their own child", async (t) => {
  const f = await fixture(t), a = await f.login("student"), tutor = await f.login("chau"), admin = await f.login("admin");
  const bId = f.addUser("second", "Gia Bảo Riêng", "student"), parentB = f.addUser("dad", "Bố Bảo", "parent");
  f.linkUp(parentB, bId);
  const b = await f.login("second");
  f.grant(a.id, 2000000);
  f.grant(b.id, 2000000);
  const { cls } = await openClass(a, tutor);
  const join = await send(b, { tutor_id: tutor.id });
  await ok(tutor.request(`/proposals/${join.id}`, "PATCH", { action: "accept", class_id: cls.id }));
  const [s1, s2, s3] = (await ok(tutor.request(`/classes/${cls.id}`))).sessions.filter((s) => s.student_id === a.id);
  const since = { a: f.bells(f.parentId).length, b: f.bells(parentB).length };
  const fresh = () => ({
    a: f.bells(f.parentId).slice(since.a).map((n) => [n.kind, n.child_id]),
    b: f.bells(parentB).slice(since.b).map((n) => [n.kind, n.child_id]),
  });

  // A alone cancels: only A's parent hears it.
  await ok(a.request(`/sessions/${s1.id}/cancel`, "POST"));
  assert.deepEqual(fresh(), { a: [["child_session_cancelled", a.id]], b: [] });
  // The admin then cancels the whole lesson: only B still had it.
  await ok(admin.request(`/admin/sessions/${s1.id}/cancel`, "POST", { note: "kiểm thử lớp nhóm" }));
  assert.deepEqual(fresh(), { a: [["child_session_cancelled", a.id]], b: [["child_session_cancelled", bId]] });

  since.a = f.bells(f.parentId).length; since.b = f.bells(parentB).length;
  await ok(tutor.request(`/sessions/${s2.id}/move`, "POST", { starts_at: new Date(Date.now() + 40 * DAY).toISOString() }), 201);
  const mv = (await ok(a.request(`/classes/${cls.id}`))).moves[0];
  await ok(a.request(`/moves/${mv.id}`, "PATCH", { accept: true }));
  assert.deepEqual(fresh(), { a: [["child_session_moved", a.id]], b: [["child_session_moved", bId]] });

  since.a = f.bells(f.parentId).length; since.b = f.bells(parentB).length;
  f.sessionAt(s3.id, -3 * HOUR);
  await ok(b.request(`/sessions/${s3.id}/dispute`, "POST", { reason: SECRETS.reason }));
  assert.deepEqual(fresh(), { a: [], b: [["child_session_disputed", bId]] });

  // The class is titled after its first student; that name never reaches the other family.
  assert.ok(cls.title.includes(a.name));
  assert.ok(!JSON.stringify([f.bells(parentB), f.mails(parentB)]).includes(a.name));
});

test("bell and email switches for the child's learning work independently", async (t) => {
  const f = await fixture(t), student = await f.login("student"), tutor = await f.login("chau"), parent = await f.login("parent");
  f.grant(student.id, 20000000);
  const prefs = (body) => ok(parent.request("/account/notifications", "PUT", body));
  // Each round: one emailed notice (class started) and one bell-only notice (offer sent).
  // Each round starts a week later: the same tutor and student cannot hold two lessons in one hour.
  let week = 0;
  const round = async () => {
    const before = { bell: f.bells(f.parentId).length, mail: f.mails(f.parentId).length };
    const start_date = new Date(Date.now() + (9 + 7 * week++) * DAY).toISOString().slice(0, 10);
    const { cls } = await openClass(student, tutor, { sessions: 1, start_date });
    assert.ok(cls.id);
    return [f.bells(f.parentId).length - before.bell, f.mails(f.parentId).length - before.mail];
  };
  assert.deepEqual(await round(), [2, 1], "everything on by default");
  assert.equal((await prefs({ bell: { children: false } })).bell.children, false);
  assert.deepEqual(await round(), [0, 1], "muting the bell keeps the email");
  await prefs({ bell: { children: true }, email: { children: false } });
  assert.deepEqual(await round(), [2, 0], "muting email keeps the bell");
  await prefs({ bell: { children: false } });
  assert.deepEqual(await round(), [0, 0], "both off");
});

test("unlinking: the child leaving tells the parent, the parent leaving tells nobody", async (t) => {
  const f = await fixture(t), student = await f.login("student"), parent = await f.login("parent");
  await ok(parent.request(`/family/${student.id}`, "DELETE"));
  assert.equal(f.bells(f.parentId).length + f.mails(f.parentId).length, 0);
  assert.equal(one(f.db, "SELECT COUNT(*) n FROM family_links WHERE parent_id=?", f.parentId).n, 0);

  f.linkUp(f.parentId, student.id);
  const other = f.addUser("dad", "Bố Minh", "parent");
  f.linkUp(other, student.id);
  await ok(student.request(`/family/${f.parentId}`, "DELETE"));
  assert.deepEqual(f.bells(f.parentId).map((n) => [n.kind, n.child_id]), [["child_unlinked", student.id]]);
  assert.deepEqual(f.mails(f.parentId).map((n) => n.kind), ["child_unlinked"]);
  assert.equal(f.bells(other).length, 0, "the parent who stays is not told");
  // Removing someone who was never linked says nothing.
  await ok(student.request(`/family/${f.parentId}`, "DELETE"));
  assert.equal(f.bells(f.parentId).length, 1);
});

test("a parent's own top-up stays one notice, and a refused flow leaves no notice behind", async (t) => {
  const f = await fixture(t), student = await f.login("student"), tutor = await f.login("chau"), parent = await f.login("parent");
  const dep = await ok(parent.request("/wallet/deposits", "POST", { amount: 100000, student_id: student.id }), 201);
  await ok(parent.request(`/wallet/deposits/${dep.id}/simulate`, "POST"));
  assert.deepEqual(all(f.db, "SELECT kind FROM notifications WHERE user_id=?", f.parentId).map((n) => n.kind), ["deposit_received"]);
  const poor = await student.request("/proposals", "POST", offer({ tutor_id: tutor.id, sessions: 60, rate: 3000000 }));
  assert.equal(poor.status, 402);
  assert.equal(f.bells(f.parentId).length, 0);
});

test("notifyParents refuses unknown kinds, does nothing without parents and rolls back with its flow", async (t) => {
  const f = await fixture(t), studentId = f.idOf("student");
  assert.throws(() => notifyParents(f.db, studentId, "child_nonsense"), /child_nonsense/);
  assert.throws(() => notifyParents(f.db, studentId, "proposal_new"), /proposal_new/);
  notifyParents(f.db, 999999, "child_session_moved");
  notifyParents(f.db, f.idOf("chau"), "child_session_moved");
  assert.equal(one(f.db, "SELECT COUNT(*) n FROM notifications WHERE kind LIKE 'child%'").n, 0);
  assert.throws(() => transaction(f.db, () => {
    notifyParents(f.db, studentId, "child_session_moved", { subject: "Toán" });
    throw new Error("flow failed");
  }), /flow failed/);
  assert.equal(f.bells(f.parentId).length + f.mails(f.parentId).length, 0);
});

test("the new notice columns are added once to an old database, and a broken detail never stops the mail", async (t) => {
  const old = openDatabase(":memory:");
  t.after(() => old.close());
  run(old, "ALTER TABLE notifications DROP COLUMN child_id");
  run(old, "ALTER TABLE notifications DROP COLUMN detail");
  migrateNotifications(old);
  migrateNotifications(old);
  const columns = all(old, "PRAGMA table_info(notifications)").map((c) => c.name);
  assert.ok(columns.includes("child_id") && columns.includes("detail"));

  const f = await fixture(t), sent = [];
  for (const [kind, spec] of Object.entries(PARENT_KINDS).filter(([, k]) => k.email))
    for (const detail of ["not json", "null", '{"when":"never","amount":"x"}'])
      run(f.db, "INSERT INTO email_outbox(user_id,kind,subject,detail,link) VALUES (?,?,?,?,?)", f.parentId, kind, "Toán", detail, "/family");
  const expected = one(f.db, "SELECT COUNT(*) n FROM email_outbox").n;
  const mailer = createNoticeMailer(f.db, { sendEmail: async (m) => sent.push(m), origin: "https://gs.test" });
  while (await mailer.flush());
  assert.equal(sent.length, expected);
  for (const m of sent) assert.doesNotMatch(`${m.subject} ${m.message}`, /undefined|NaN|Invalid Date|\[object/, m.message);
});

test("a free trial is never described as charged or refunded", async (t) => {
  const { childNotice } = await import("../app/src/lib/child-notices.ts");
  const f = await fixture(t), student = await f.login("student"), admin = await f.login("admin"), parent = await f.login("parent");
  run(f.db, "UPDATE tutors SET accepts_trial=1");
  const trial = async (slug) => (await openClass(student, await f.login(slug), { trial: true, sessions: 1, rate: 0 })).cls;
  const first = await trial("chau");
  f.sessionAt(first.sessions[0].id, HOUR);
  await ok(student.request(`/sessions/${first.sessions[0].id}/cancel`, "POST"));
  const second = await trial("linh");
  f.sessionAt(second.sessions[0].id, -3 * HOUR);
  await ok(student.request(`/sessions/${second.sessions[0].id}/dispute`, "POST", { reason: "Gia sư vắng mặt" }));
  await ok(admin.request(`/admin/sessions/${second.sessions[0].id}/resolve`, "POST", { member_id: second.members[0].id, outcome: "refunded" }));

  const rows = (await parent.request("/notifications")).data;
  const format = { t: (text, p = {}) => text.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? "")), when: (iso) => iso, money: (n) => `${n}đ` };
  const words = rows.filter((n) => ["child_session_cancelled", "child_dispute_resolved"].includes(n.kind)).map((n) => childNotice(n, format).text);
  assert.equal(words.length, 2);
  for (const text of words) assert.doesNotMatch(text, /vẫn tính phí|hoàn tiền| 0đ/, text);
  const sent = [];
  const mailer = createNoticeMailer(f.db, { sendEmail: async (m) => sent.push(m), origin: "https://gs.test" });
  while (await mailer.flush());
  for (const m of sent) assert.doesNotMatch(m.message, /vẫn tính phí|hoàn tiền/, m.message);
});

test("a name written as HTML stays text in the notice email", async (t) => {
  const f = await fixture(t), student = await f.login("student");
  run(f.db, "UPDATE users SET name=? WHERE id=?", '<a href="https://evil.example">Bấm đây</a>', student.id);
  await ok(student.request(`/family/${f.parentId}`, "DELETE"));
  const bodies = [], real = globalThis.fetch;
  globalThis.fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true }; };
  t.after(() => { globalThis.fetch = real; });
  const mailer = createNoticeMailer(f.db, { sendEmail: createMailflareSender({ url: "https://mail.test", key: "k", mailboxId: "m" }), origin: "https://gs.test" });
  while (await mailer.flush());
  globalThis.fetch = real;
  assert.equal(bodies.length, 1);
  assert.ok(!bodies[0].html.includes('<a href="https://evil.example"'), "name became a link in the email");
  assert.ok(bodies[0].html.includes("&lt;a href="), "name is shown as written");
});

test("who is told, and where an offer leads, in the less common cases", async (t) => {
  const f = await fixture(t), a = await f.login("student"), tutor = await f.login("chau");
  const bId = f.addUser("second", "Gia Bảo", "student"), parentB = f.addUser("dad", "Bố Bảo", "parent");
  f.linkUp(parentB, bId);
  const b = await f.login("second");
  f.grant(a.id, 20000000);
  f.grant(b.id, 2000000);

  // An offer the child can already pay for leads to the offer, not to the top-up screen.
  const covered = await send(tutor, { student_id: a.id, sessions: 2 });
  const [offered] = f.bells(f.parentId);
  assert.deepEqual([offered.data.short, offered.link], [0, `/proposals?id=${covered.id}`]);
  await ok(a.request(`/proposals/${covered.id}`, "PATCH", { action: "decline" }));

  const { cls } = await openClass(a, tutor);
  const join = await send(b, { tutor_id: tutor.id });
  await ok(tutor.request(`/proposals/${join.id}`, "PATCH", { action: "accept", class_id: cls.id }));
  const [s1, s2] = (await ok(tutor.request(`/classes/${cls.id}`))).sessions.filter((s) => s.student_id === a.id);
  const count = (id, kind) => f.bells(id).filter((n) => n.kind === kind).length;

  // A cancels, then the lesson moves: A is no longer in it, so only B's parent hears of the move.
  await ok(a.request(`/sessions/${s1.id}/cancel`, "POST"));
  await ok(a.request(`/sessions/${s1.id}/cancel`, "POST"));
  assert.equal(count(f.parentId, "child_session_cancelled"), 1, "cancelling twice says it once");
  await ok(tutor.request(`/sessions/${s1.id}/move`, "POST", { starts_at: new Date(Date.now() + 40 * DAY).toISOString() }), 201);
  const mv = (await ok(b.request(`/classes/${cls.id}`))).moves[0];
  await ok(b.request(`/moves/${mv.id}`, "PATCH", { accept: true }));
  assert.deepEqual([count(f.parentId, "child_session_moved"), count(parentB, "child_session_moved")], [0, 1]);

  // A report by the tutor is recorded as the tutor's.
  f.sessionAt(s2.id, -3 * HOUR);
  await ok(tutor.request(`/sessions/${s2.id}/dispute`, "POST", { reason: "Học sinh không tới" }));
  for (const parentId of [f.parentId, parentB])
    assert.deepEqual(f.bells(parentId).filter((n) => n.kind === "child_session_disputed").map((n) => n.data.by), ["tutor"]);
});
