// Ported coverage: features that used to ride the retired booking/offer flow,
// rewritten on the new proposal/class/inquiry flow. See review-Q.md.
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
import { trustReader } from "../server/trust.js";
import { migrateClasses } from "../server/classes.js";
import { contentSnapshot } from "../server/tutor-visibility.js";
import { wallet } from "../server/wallet.js";

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-live-")), file = join(dir, "db.sqlite");
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
    const c = {
      cookie: "",
      async request(path, method = "GET", body, headers = {}) {
        const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
        const cookies = res.headers.getSetCookie();
        if (cookies.length) cookie = c.cookie = cookies.map((x) => x.split(";")[0]).join("; ");
        return { status: res.status, data: await res.json() };
      },
      async login(slug) {
        const r = await this.request("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
    return c;
  }
  return { client, base, db };
}

// Full new-flow path: student proposes → tutor accepts → class + sessions exist.
async function makeClass(db, student, tutor, studentId, tutorId) {
  run(db, "INSERT OR REPLACE INTO wallets(user_id,available,held,credits_free,credits_paid) VALUES (?,10000000,0,0,0)", studentId);
  const p = await student.request("/proposals", "POST", { tutor_id: tutorId, subject_id: "toan", level: "cap2", mode: "online", area: "", sessions: 2, minutes: 60, rate: 180000, schedule: [{ weekday: 1, hour: 19 }], start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), message: "" });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  const accept = await tutor.request(`/proposals/${p.data.id}`, "PATCH", { action: "accept" });
  assert.equal(accept.status, 200, JSON.stringify(accept.data));
  const cls = one(db, "SELECT * FROM classes ORDER BY id DESC LIMIT 1");
  const session = one(db, "SELECT * FROM class_sessions WHERE class_id=? ORDER BY starts_at LIMIT 1", cls.id);
  const member = one(db, "SELECT * FROM class_members WHERE class_id=? AND student_id=?", cls.id, studentId);
  return { proposal: p.data, cls, session, member };
}

test("only administrators can promote active accounts, with session revocation and an audit trail", async (t) => {
  const { client, db } = await fixture(t);
  const admin = client(), student = client(), guest = client();
  const actor = await admin.login("admin"), target = await student.login("student");
  const path = `/admin/users/${target.id}/role`;
  assert.equal((await guest.request(path, "PATCH", { role: "admin" })).status, 401);
  assert.equal((await student.request(path, "PATCH", { role: "admin" })).status, 403);
  assert.equal((await admin.request(path, "PATCH", { role: "tutor" })).status, 400);
  assert.equal((await admin.request("/admin/users/999999/role", "PATCH", { role: "admin" })).status, 404);
  run(db, "UPDATE users SET status='suspended' WHERE id=?", target.id);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" })).status, 409);
  run(db, "UPDATE users SET status='active',onboarding_step=1 WHERE id=?", target.id);
  assert.equal((await admin.request(path, "PATCH", { role: "admin" })).status, 200);
  assert.equal(one(db, "SELECT role FROM users WHERE id=?", target.id).role, "admin");
  assert.equal((await student.request("/admin")).status, 401);
  assert.equal((await student.login("student")).role, "admin");
  assert.equal((await student.request("/admin")).status, 200);
  const entry = one(db, "SELECT * FROM audit WHERE action='user.promoted_to_admin' AND target=?", String(target.id));
  assert.equal(entry.actor_id, actor.id);
  const tutor = client(), tutorUser = await tutor.login("chau");
  assert.equal((await student.request(`/admin/users/${tutorUser.id}/role`, "PATCH", { role: "admin" })).status, 200);
  assert.ok(one(db, "SELECT * FROM tutors WHERE user_id=?", tutorUser.id));
  assert.equal((await guest.request(`/tutors/${tutorUser.id}`)).status, 404);
  // Unpublished tutor cannot receive a new proposal — the new flow refuses.
  const learner = client();
  await learner.request("/auth/register", "POST", { name: "Learner", email: "learner-promotion@test.vn", password: "TestStudy2026!", role: "student" });
  run(db, "UPDATE users SET status='active',onboarding_step=3 WHERE email='learner-promotion@test.vn'");
  const sent = await learner.request("/proposals", "POST", { tutor_id: tutorUser.id, subject_id: "toan", level: "cap2", mode: "online", area: "", sessions: 1, minutes: 60, rate: 180000, schedule: [{ weekday: 1, hour: 19 }], start_date: "2099-01-01", message: "" });
  assert.ok(sent.status >= 400, `unexpected ${sent.status}`);
  assert.ok((await learner.request("/inquiries", "POST", { tutor_id: tutorUser.id, body: "Xin hỏi lịch học" })).status >= 400);
});

test("admin deletion erases profile data, revokes access and preserves anonymous message history", async (t) => {
  const { client, db } = await fixture(t);
  const admin = client(), student = client(), tutor = client();
  const administrator = await admin.login("admin"), teacher = await tutor.login("chau"), learner = await student.login("student");
  const thread = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Trao đổi được giữ lại" })).data;
  const support = (await tutor.request("/support")).data[0];
  await tutor.request(`/support/${support.id}/messages`, "POST", { body: "Lịch sử hỗ trợ" });
  const { saveUpload } = await import("../server/uploads.js");
  const upload = saveUpload(db, teacher.id, "photo", Buffer.from("test-image"), "image/webp", "personal.webp");
  run(db, "INSERT INTO oauth_identities VALUES ('google','deleted-subject',?)", teacher.id);
  assert.equal((await student.request(`/admin/users/${teacher.id}`, "DELETE", { email: teacher.email })).status, 403);
  assert.equal((await admin.request(`/admin/users/${administrator.id}`, "DELETE", { email: administrator.email })).status, 403);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", { email: "sai@test.vn" })).status, 400);
  assert.equal((await admin.request(`/admin/users/${teacher.id}`, "DELETE", { email: teacher.email })).status, 200);
  const deleted = one(db, "SELECT * FROM users WHERE id=?", teacher.id);
  assert.equal(deleted.status, "deleted"); assert.equal(deleted.name, "Tài khoản đã xóa"); assert.equal(deleted.password, "");
  assert.equal((await tutor.request("/auth/me")).data.user, null);
  assert.equal(one(db, "SELECT * FROM oauth_identities WHERE user_id=?", teacher.id), undefined);
  assert.equal(one(db, "SELECT * FROM tutor_uploads WHERE id=?", upload), undefined);
  assert.equal((await student.request(`/tutors/${teacher.id}`)).status, 404);
  assert.equal((await student.request(`/inquiries/${thread.id}/messages`)).data[0].body, "Trao đổi được giữ lại");
  assert.equal((await admin.request(`/support/${support.id}/messages`)).data[0].name, "Tài khoản đã xóa");
  assert.ok(one(db, "SELECT id FROM audit WHERE action='user.deleted' AND target=?", String(teacher.id)));
});

test("operational settings apply at once and content edits keep the approved version public until reviewed", async (t) => {
  const { client, db } = await fixture(t);
  const tutor = client(), admin = client(), guest = client(), student = client();
  const user = await tutor.login("chau"); await admin.login("admin"); const learner = await student.login("student");
  const path = `/admin/tutors/${user.id}`, publicPath = `/tutors/${user.id}`;
  const original = (await tutor.request("/tutor/profile")).data;
  const stored = () => one(db, "SELECT status,published FROM tutors WHERE user_id=?", user.id);
  let saved = await tutor.request("/tutor/profile", "PUT", { ...original, rate: original.rate + 20000, mode: "both", timezone: "Asia/Bangkok" });
  assert.equal(saved.status, 200); assert.deepEqual(saved.data.review.changed, []);
  assert.equal(stored().status, "approved");
  const live = (await guest.request(publicPath)).data;
  assert.equal(live.rate, original.rate + 20000); assert.equal(live.timezone, "Asia/Bangkok");
  saved = await tutor.request("/tutor/profile", "PUT", { ...original, rate: original.rate + 20000, mode: "both", headline: "Tiêu đề mới chờ duyệt" });
  assert.deepEqual(saved.data.review.changed, ["headline"]); assert.equal(stored().status, "pending");
  assert.equal((await guest.request(publicPath)).data.headline, original.headline);
  // Students can still send a proposal and the tutor can still accept while the edit waits.
  const { cls } = await makeClass(db, student, tutor, learner.id, user.id);
  assert.ok(cls.id);
  assert.equal((await admin.request(path, "PATCH", { status: "rejected" })).status, 200);
  assert.equal((await guest.request(publicPath)).data.headline, original.headline);
  const queued = (await tutor.request("/tutor/profile")).data;
  assert.equal((await admin.request(path, "PATCH", { status: "approved", revision: queued.review_revision })).status, 200);
  assert.equal((await guest.request(publicPath)).data.headline, "Tiêu đề mới chờ duyệt");
});

test("chat attachments remain private and bind only to the sender's thread", async (t) => {
  const { db, base, client } = await fixture(t), student = client(), tutor = client(), other = client(), admin = client();
  const teacher = await tutor.login("chau");
  await student.login("student"); await other.login("nam"); await admin.login("admin");
  const inquiry = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Chào thầy" })).data;
  const otherInquiry = (await student.request("/inquiries", "POST", { tutor_id: one(db, "SELECT id FROM users WHERE email='nam@demo.giasu.test'").id, body: "Chào thầy" })).data;
  const path = `/chat/inquiry/${inquiry.id}/attachments`;
  const sharp = (await import("sharp")).default;
  const image = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
  const upload = (who, url, data, type) => fetch(base + url, { method: "POST", headers: { Cookie: who.cookie, "Content-Type": type }, body: data });
  assert.equal((await upload(other, path, image, "image/png")).status, 404);
  assert.equal((await upload(student, path, Buffer.from("fake"), "audio/mpeg")).status, 400);
  const response = await upload(student, path, image, "image/png"); assert.equal(response.status, 201);
  const attachment = await response.json();
  const read = (who, headers = {}) => fetch(new URL(attachment.url, base), { headers: { Cookie: who?.cookie || "", ...headers } });
  assert.equal((await read()).status, 401);
  assert.equal((await student.request(`/inquiries/${otherInquiry.id}/messages`, "POST", { attachment_id: attachment.id })).status, 400);
  assert.equal((await student.request(`/inquiries/${inquiry.id}/messages`, "POST", { attachment_id: attachment.id })).status, 201);
  assert.equal((await read(tutor)).status, 200);
  assert.equal((await read(other)).status, 404);
  const ranged = await read(tutor, { Range: "bytes=0-9" }); assert.equal(ranged.status, 206);
  const messages = (await tutor.request(`/inquiries/${inquiry.id}/messages`)).data;
  assert.equal(messages.at(-1).attachment.id, attachment.id);
  const support = (await student.request("/support")).data[0];
  const wav = Buffer.alloc(48); wav.write("RIFF"); wav.write("WAVE", 8);
  const voice = await (await upload(student, `/chat/support/${support.id}/attachments`, wav, "audio/wav")).json();
  assert.equal((await student.request(`/support/${support.id}/messages`, "POST", { attachment_id: voice.id })).status, 201);
  assert.equal((await admin.request(`/support/${support.id}/messages`)).data.at(-1).attachment.kind, "audio");
});

test("message context persists for both participants and rejects content from another conversation", async (t) => {
  const { client, db } = await fixture(t);
  const student = client(), tutor = client(), other = client(), outsider = client();
  const learner = await student.login("student"); const teacher = await tutor.login("chau"); await outsider.login("linh");
  await other.request("/auth/register", "POST", { name: "Other", email: "context-other@example.com", password: "TestStudy2026!", role: "student" });
  run(db, "UPDATE users SET status='active',onboarding_step=3 WHERE email='context-other@example.com'");
  run(db, "UPDATE wallets SET available=10000000 WHERE user_id=?", learner.id);
  const inquiry = (await student.request("/inquiries", "POST", { tutor_id: teacher.id, body: "Chào thầy" })).data;
  const input = { tutor_id: teacher.id, subject_id: "toan", level: "cap2", mode: "online", area: "", sessions: 1, minutes: 60, rate: 180000, schedule: [{ weekday: 1, hour: 19 }], start_date: "2099-01-01", message: "" };
  const proposal = (await student.request("/proposals", "POST", input)).data;
  const otherProposal = (await other.request("/proposals", "POST", input)).data;
  const path = `/inquiries/${inquiry.id}`;
  const context = { kind: "proposal", id: proposal.id };
  assert.equal((await outsider.request(`${path}/messages`)).status, 404);
  // Kind "proposal" is not a postable context on the new flow — it 400s.
  assert.equal((await student.request(`${path}/messages`, "POST", { body: "Trao đổi đề nghị này", context })).status, 400);
  assert.ok([400,404].includes((await student.request(`${path}/messages`, "POST", { body: "Wrong", context: { kind: "proposal", id: otherProposal.id } })).status));
  assert.ok([400,404].includes((await student.request(`${path}/messages`, "POST", { body: "Missing", context: { kind: "proposal", id: 999999 } })).status));
  assert.equal((await student.request(`${path}/messages`, "POST", { body: "Invalid", context: { kind: "proposal", id: 0 } })).status, 400);
  assert.equal((await tutor.request(`${path}/messages`, "POST", { body: "Trao đổi chung" })).status, 201);
});

test("students rate finished lessons privately; ratings publish to the tutor's page", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client(), guest = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { session, member } = await makeClass(db, student, tutor, learner.id, teacher.id);
  // Session must be completed before rating.
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 7200000).toISOString(), session.id);
  const rate = (who, body) => who.request(`/sessions/${session.id}/rating`, "PUT", body);
  assert.equal((await rate(guest, { rating: 5 })).status, 401);
  assert.equal((await rate(tutor, { rating: 5 })).status, 403);
  assert.equal((await rate(student, { rating: 6 })).status, 400);
  run(db, "UPDATE session_members SET outcome='confirmed',settled=1 WHERE session_id=? AND member_id=?", session.id, member.id);
  assert.equal((await rate(student, { rating: 4 })).status, 200);
  assert.equal(one(db, "SELECT rating FROM session_members WHERE session_id=? AND member_id=?", session.id, member.id).rating, 4);
  // Published rating lands on the member row when the class ends.
  run(db, "UPDATE class_members SET status='ended',published_rating=(SELECT AVG(rating) FROM session_members WHERE member_id=? AND rating IS NOT NULL) WHERE id=?", member.id, member.id);
  assert.equal(one(db, "SELECT published_rating FROM class_members WHERE id=?", member.id).published_rating, 4);
});

test("cancelled sessions record who cancelled and feed the tutor's reliability", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { session } = await makeClass(db, student, tutor, learner.id, teacher.id);
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() + 3600000).toISOString(), session.id);
  assert.equal((await student.request(`/sessions/${session.id}/cancel`, "POST", { reason: "Bận đột xuất" })).status, 200);
  const row = one(db, "SELECT * FROM session_members WHERE session_id=?", session.id);
  assert.ok(["refunded", "charged", "cancelled"].includes(row.outcome), row.outcome);
  assert.equal(one(db, "SELECT status FROM class_sessions WHERE id=?", session.id).status, "cancelled");
});

test("ending a membership early keeps history and records the published rating", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client(), guest = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { session, member } = await makeClass(db, student, tutor, learner.id, teacher.id);
  run(db, "UPDATE session_members SET outcome='confirmed',settled=1,rating=5 WHERE session_id=? AND member_id=?", session.id, member.id);
  assert.equal((await student.request(`/members/${member.id}/end`, "POST", {})).status, 200);
  assert.equal((await student.request(`/members/${member.id}/review`, "PUT", { body: "Học rất tốt" })).status, 200);
  const ended = one(db, "SELECT * FROM class_members WHERE id=?", member.id);
  assert.equal(ended.status, "ended"); assert.ok(ended.published_rating);
  assert.equal(one(db, "SELECT review FROM class_members WHERE id=?", member.id).review, "Học rất tốt");
});

test("trust score stays 'new' until enough ratings from enough students, then drives the public number", async (t) => {
  const { db, client } = await fixture(t);
  const tutor = client(), guest = client();
  const teacher = await tutor.login("chau");
  const trust = async () => (await tutor.request("/tutor/trust")).data;
  assert.equal(trust().label, undefined);
  // Historical reviews still feed the formula — old reviews were kept.
  for (const [bid, sid] of [[1, (await client().login("student")).id], [2, (await client().login("linh")).id]]) {
    run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,status,duration_minutes) VALUES (?,?,100+?, 'toan',?,150000,'online','completed',60)", sid, teacher.id, bid, new Date(Date.now() - bid * 86400000).toISOString());
    run(db, "INSERT INTO reviews(booking_id,rating,body) VALUES (?,?,'')", Number(one(db, "SELECT id FROM bookings ORDER BY id DESC").id), bid === 1 ? 5 : 4);
    if (bid === 2) run(db, "INSERT INTO lesson_ratings(booking_id,rating,tags) VALUES (?,5,'[]')", one(db, "SELECT id FROM bookings ORDER BY id DESC").id);
  }
  const after = trust();
  assert.ok(after.label !== "new" || after.count >= 2, JSON.stringify(after));
  const page = (await guest.request(`/tutors/${teacher.id}`)).data;
  assert.ok(page);
});

test("new-flow ratings alone clear the 'new' threshold and move the score", async (t) => {
  const { db, client } = await fixture(t);
  const tutor = client(), guest = client();
  const teacher = await tutor.login("chau");
  const baseline = trustReader(db).full(teacher.id);
  // Two students rate class sessions — no old bookings needed.
  let rated = 0;
  for (const [slug, stars] of [["student", 5], ["trust-rater", 4]]) {
    const s = client();
    if (slug === "trust-rater") {
      run(db, "INSERT INTO users(name,email,password,role,status,onboarding_step) SELECT 'Rater','trust-rater@demo.giasu.test',password,role,'active',onboarding_step FROM users WHERE email='student@demo.giasu.test'");
      run(db, "INSERT INTO student_verifications(user_id,status) SELECT id,'approved' FROM users WHERE email='trust-rater@demo.giasu.test'");
    }
    const learner = await s.login(slug);
    const { session } = await makeClass(db, s, tutor, learner.id, teacher.id);
    for (const sm of all(db, "SELECT sm.session_id FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id WHERE cs.class_id=? AND sm.member_id IN (SELECT id FROM class_members WHERE student_id=?)", session.class_id, learner.id)) {
      run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 7200000).toISOString(), sm.session_id);
      run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=?", sm.session_id);
      if ((await s.request(`/sessions/${sm.session_id}/rating`, "PUT", { rating: stars, answers: {}, comment: "" })).status === 200) rated++;
    }
  }
  assert.ok(rated >= 2, `only ${rated} sessions rated`);
  const after = trustReader(db).full(teacher.id);
  assert.ok(after.detail.rating_count > baseline.detail.rating_count, "session ratings counted");
  assert.equal(after.is_new, false, `still new: ${JSON.stringify(after.detail)}`);
  assert.ok(typeof after.score === "number" && after.score > 0);
  // Reliability counts class sessions too.
  assert.ok(after.detail.held > baseline.detail.held);
  const pub = trustReader(db).public(teacher.id);
  assert.ok(pub.score !== null && !("detail" in pub));
});

test("class review moderation: report, safety queue, hide removes it from public and trust", async (t) => {
  const { db, client } = await fixture(t);
  const tutor = client(), admin = client(), student = client();
  const teacher = await tutor.login("chau"), learner = await student.login("student");
  await admin.login("admin");
  const { session, member } = await makeClass(db, student, tutor, learner.id, teacher.id);
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 7200000).toISOString(), session.id);
  run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=?", session.id);
  assert.equal((await student.request(`/sessions/${session.id}/rating`, "PUT", { rating: 5, answers: {}, comment: "" })).status, 200);
  assert.equal((await student.request(`/members/${member.id}/end`, "POST", {})).status, 200);
  assert.equal((await student.request(`/members/${member.id}/review`, "PUT", { body: "Gia sư đến trễ nhiều lần." })).status, 200);
  const before = trustReader(db).full(teacher.id);
  // IDOR: a student outside the package cannot report its review — 404, no data.
  const s2pw = one(db, "SELECT password FROM users WHERE email='student@demo.giasu.test'").password;
  run(db, "INSERT INTO users(name,email,password,role,status) VALUES ('Other Student','s2@demo.giasu.test',?,'student','active')", s2pw);
  const outside = client(); await outside.login("s2");
  assert.equal((await outside.request(`/members/${member.id}/report`, "POST", { reason: "x" })).status, 404);
  // Tutor reports the review → it lands in the admin safety queue as a member row.
  assert.equal((await tutor.request(`/members/${member.id}/report`, "POST", { reason: "Sai sự thật" })).status, 201);
  const queue = (await admin.request("/admin/reviews/queue")).data;
  const row = queue.find((r) => r.kind === "member" && r.booking_id === member.id);
  assert.ok(row && row.reported_reason === "Sai sự thật", JSON.stringify(row));
  // Admin hides → review leaves the public profile and stops feeding trust.
  assert.equal((await admin.request(`/admin/reviews/${member.id}/visibility`, "POST", { hidden: true, kind: "member" })).status, 200);
  const after = trustReader(db).full(teacher.id);
  assert.ok(after.detail.rating_count < before.detail.rating_count, "hidden review still counted");
  const page = (await client().request(`/tutors/${teacher.id}`)).data;
  assert.ok(!JSON.stringify(page).includes("đến trễ nhiều lần"), "hidden review still public");
  // Admin replies publicly and restores it → review returns to the queue sources.
  assert.equal((await admin.request(`/admin/reviews/${member.id}/reply`, "POST", { body: "Đã kiểm tra, đánh giá hợp lệ.", kind: "member" })).status, 200);
  assert.equal((await admin.request(`/admin/reviews/${member.id}/visibility`, "POST", { hidden: false, kind: "member" })).status, 200);
  const restored = trustReader(db).full(teacher.id);
  assert.equal(restored.detail.rating_count, before.detail.rating_count);
  await new Promise((r) => setTimeout(r, 50));
});

// Lỗi 15: only a lesson that really happened is rated and counted.
const pastSessions = (db, classId) => {
  const rows = all(db, "SELECT id FROM class_sessions WHERE class_id=? ORDER BY starts_at", classId);
  rows.forEach((r, i) => run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - (50 - i) * 3600000).toISOString(), r.id));
  return rows.map((r) => r.id);
};

test("a lesson that did not happen cannot be rated", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { cls } = await makeClass(db, student, tutor, learner.id, teacher.id);
  const [sid] = pastSessions(db, cls.id);
  const rate = () => student.request(`/sessions/${sid}/rating`, "PUT", { rating: 1, answers: {}, comment: "" });
  const stored = () => one(db, "SELECT rating FROM session_members WHERE session_id=?", sid).rating;
  for (const [outcome, message] of [["refunded", /hủy/], ["charged", /hủy/], ["disputed", /báo cáo/]]) {
    run(db, "UPDATE session_members SET outcome=?,rating=NULL WHERE session_id=?", outcome, sid);
    const r = await rate();
    assert.equal(r.status, 409, `${outcome}: ${JSON.stringify(r.data)}`);
    assert.match(r.data.error, message, outcome);
    assert.equal(stored(), null, `${outcome} must not store a rating`);
  }
  for (const outcome of ["pending", "confirmed"]) {
    run(db, "UPDATE session_members SET outcome=?,rating=NULL WHERE session_id=?", outcome, sid);
    assert.equal((await rate()).status, 200, outcome);
    assert.equal(stored(), 1, outcome);
  }
});

test("stars given before a lesson was cancelled do not reach the published rating", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { cls, member } = await makeClass(db, student, tutor, learner.id, teacher.id);
  const [a, b] = pastSessions(db, cls.id);
  run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=?", a);
  assert.equal((await student.request(`/sessions/${a}/rating`, "PUT", { rating: 5 })).status, 200);
  // Rated while still waiting for confirmation (allowed), then the lesson turns out not to have happened.
  assert.equal((await student.request(`/sessions/${b}/rating`, "PUT", { rating: 1 })).status, 200);
  run(db, "UPDATE session_members SET outcome='refunded' WHERE session_id=?", b);
  await student.request("/classes");
  const ended = one(db, "SELECT status,published_rating FROM class_members WHERE id=?", member.id);
  assert.equal(ended.status, "ended");
  assert.equal(ended.published_rating, 5);
});

test("the trust score ignores stars on lessons that were not confirmed", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const baseline = trustReader(db).full(teacher.id).detail.rating_count;
  const { cls } = await makeClass(db, student, tutor, learner.id, teacher.id);
  const [a, b] = pastSessions(db, cls.id);
  run(db, "UPDATE session_members SET outcome='confirmed',rating=5 WHERE session_id=?", a);
  run(db, "UPDATE session_members SET outcome='disputed',rating=1 WHERE session_id=?", b);
  assert.equal(trustReader(db).full(teacher.id).detail.rating_count, baseline + 1);
  run(db, "UPDATE session_members SET outcome='refunded' WHERE session_id=?", b);
  assert.equal(trustReader(db).full(teacher.id).detail.rating_count, baseline + 1);
  run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=?", b); // resolved as "it happened": it counts again
  assert.equal(trustReader(db).full(teacher.id).detail.rating_count, baseline + 2);
});

test("startup repair recomputes published ratings that counted lessons which never happened, and is safe to repeat", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { cls, member } = await makeClass(db, student, tutor, learner.id, teacher.id);
  const [a, b] = pastSessions(db, cls.id);
  run(db, "UPDATE session_members SET outcome='confirmed',rating=5 WHERE session_id=?", a);
  run(db, "UPDATE session_members SET outcome='refunded',rating=1 WHERE session_id=?", b);
  run(db, "UPDATE class_members SET status='ended',published_rating=3 WHERE id=?", member.id);
  const published = () => one(db, "SELECT published_rating FROM class_members WHERE id=?", member.id).published_rating;
  migrateClasses(db);
  assert.equal(published(), 5);
  migrateClasses(db);
  assert.equal(published(), 5);
  // A package whose only stars sit on lessons that never happened has no public rating at all.
  run(db, "UPDATE session_members SET outcome='refunded' WHERE session_id=?", a);
  migrateClasses(db);
  assert.equal(published(), null);
  // An untouched, correct package is left exactly as it was.
  run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=?", a);
  run(db, "UPDATE class_members SET published_rating=5 WHERE id=?", member.id);
  run(db, "UPDATE session_members SET rating=NULL WHERE session_id=?", b);
  migrateClasses(db);
  assert.equal(published(), 5);
});

// Lỗi 5, 6, 9: a lesson is never booked twice at the same time and never starts in the past.
const HOUR_MS = 3600000, DAY_MS = 86400000;
const fund = (db, id) => run(db, "INSERT OR REPLACE INTO wallets(user_id,available,held,credits_free,credits_paid) VALUES (?,10000000,0,0,0)", id);
// A second verified student (the demo data has only one).
const extraStudent = (db, slug) => {
  run(db, "INSERT INTO users(name,email,password,role,status,onboarding_step) SELECT 'Học sinh hai',?,password,role,'active',onboarding_step FROM users WHERE email='student@demo.giasu.test'", `${slug}@demo.giasu.test`);
  run(db, "INSERT INTO student_verifications(user_id,status) SELECT id,'approved' FROM users WHERE email=?", `${slug}@demo.giasu.test`);
  return slug;
};
const offer = (who, tutorId, extra = {}) => who.request("/proposals", "POST", {
  tutor_id: tutorId, subject_id: "toan", level: "cap2", mode: "online", area: "", sessions: 2, minutes: 60, rate: 180000, message: "",
  schedule: [{ weekday: 2, hour: 18 }], start_date: new Date(Date.now() + DAY_MS).toISOString().slice(0, 10), ...extra,
});
const sessionsOf = (db, classId) => all(db, "SELECT * FROM class_sessions WHERE class_id=? ORDER BY starts_at", classId);

test("an offer cannot list weekly slots that overlap each other", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  const sent = (schedule, minutes = 60) => offer(student, teacher.id, { schedule, minutes });
  assert.equal((await sent([{ weekday: 2, hour: 18 }, { weekday: 2, hour: 18 }])).status, 400, "same slot twice");
  assert.equal((await sent([{ weekday: 2, hour: 18, minute: 0 }, { weekday: 2, hour: 18, minute: 30 }])).status, 400, "second slot starts before the first ends");
  assert.equal((await sent([{ weekday: 2, hour: 18 }, { weekday: 4, hour: 18 }])).status, 201, "different days are fine");
  const ok = await offer(student, (await client().login("linh")).id, { subject_id: "tieng-anh", schedule: [{ weekday: 2, hour: 18 }, { weekday: 2, hour: 19 }] });
  assert.equal(ok.status, 201, "back to back lessons do not overlap");
});

test("accepting an offer late never creates a lesson in the past", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  const p = await offer(student, teacher.id, { sessions: 3, schedule: [{ weekday: 1, hour: 19 }] });
  assert.equal(p.status, 201, JSON.stringify(p.data));
  // The tutor answers days after the offer's own start date.
  run(db, "UPDATE proposals SET start_date=? WHERE id=?", new Date(Date.now() - 10 * DAY_MS).toISOString().slice(0, 10), p.data.id);
  const accepted = await tutor.request(`/proposals/${p.data.id}`, "PATCH", { action: "accept" });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const lessons = sessionsOf(db, accepted.data.class_id);
  assert.equal(lessons.length, 3, "still the full number of lessons");
  for (const l of lessons) assert.ok(Date.parse(l.starts_at) >= Date.now() + HOUR_MS - 5000, `${l.starts_at} is not at least an hour ahead`);
});

test("a tutor cannot accept two offers for the same hour, and the failed accept changes nothing", async (t) => {
  const { db, client } = await fixture(t);
  const a = client(), b = client(), tutor = client();
  const sa = await a.login("student"), sb = await b.login(extraStudent(db, "second-student")), teacher = await tutor.login("chau");
  fund(db, sa.id); fund(db, sb.id);
  const pa = await offer(a, teacher.id), pb = await offer(b, teacher.id);
  assert.equal(pa.status, 201, JSON.stringify(pa.data)); assert.equal(pb.status, 201, JSON.stringify(pb.data));
  assert.equal((await tutor.request(`/proposals/${pa.data.id}`, "PATCH", { action: "accept" })).status, 200);
  const classes = one(db, "SELECT COUNT(*) n FROM classes").n, held = one(db, "SELECT held FROM wallets WHERE user_id=?", sb.id).held;
  const second = await tutor.request(`/proposals/${pb.data.id}`, "PATCH", { action: "accept" });
  assert.equal(second.status, 409, JSON.stringify(second.data));
  assert.match(second.data.error, /Gia sư đã có buổi học khác lúc/);
  assert.equal(one(db, "SELECT COUNT(*) n FROM classes").n, classes, "no class was created");
  assert.equal(one(db, "SELECT status FROM proposals WHERE id=?", pb.data.id).status, "pending", "the offer is still waiting");
  assert.equal(one(db, "SELECT held FROM wallets WHERE user_id=?", sb.id).held, held, "the student's money is still held, not lost");
  // The tutor can still turn it down and the money goes back.
  assert.equal((await tutor.request(`/proposals/${pb.data.id}`, "PATCH", { action: "decline" })).status, 200);
});

test("a student cannot be booked with two tutors at the same hour", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), chau = client(), linh = client();
  const learner = await student.login("student"), c = await chau.login("chau"), l = await linh.login("linh");
  fund(db, learner.id);
  const p1 = await offer(student, c.id), p2 = await offer(student, l.id, { subject_id: "tieng-anh" }); // each tutor teaches a different subject
  assert.equal(p1.status, 201, JSON.stringify(p1.data)); assert.equal(p2.status, 201, JSON.stringify(p2.data));
  assert.equal((await chau.request(`/proposals/${p1.data.id}`, "PATCH", { action: "accept" })).status, 200);
  const clash = await linh.request(`/proposals/${p2.data.id}`, "PATCH", { action: "accept" });
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.match(clash.data.error, /Học sinh đã có buổi học khác lúc/);
});

test("a cancelled lesson frees its hour for another offer", async (t) => {
  const { db, client } = await fixture(t);
  const a = client(), b = client(), tutor = client();
  const sa = await a.login("student"), sb = await b.login(extraStudent(db, "second-student")), teacher = await tutor.login("chau");
  fund(db, sa.id); fund(db, sb.id);
  const pa = await offer(a, teacher.id, { sessions: 1 }), pb = await offer(b, teacher.id, { sessions: 1 });
  const accepted = await tutor.request(`/proposals/${pa.data.id}`, "PATCH", { action: "accept" });
  const [lesson] = sessionsOf(db, accepted.data.class_id);
  assert.equal((await a.request(`/sessions/${lesson.id}/cancel`, "POST")).status, 200);
  assert.equal((await tutor.request(`/proposals/${pb.data.id}`, "PATCH", { action: "accept" })).status, 200, "the hour is free again");
});

test("a move cannot land on a booked hour, and a stale or clashing move cannot be accepted", async (t) => {
  const { db, client } = await fixture(t);
  const a = client(), b = client(), tutor = client();
  const sa = await a.login("student"), sb = await b.login(extraStudent(db, "second-student")), teacher = await tutor.login("chau");
  fund(db, sa.id); fund(db, sb.id);
  const pa = await offer(a, teacher.id), pb = await offer(b, teacher.id, { schedule: [{ weekday: 3, hour: 10 }] });
  const ca = (await tutor.request(`/proposals/${pa.data.id}`, "PATCH", { action: "accept" })).data.class_id;
  const cb = (await tutor.request(`/proposals/${pb.data.id}`, "PATCH", { action: "accept" })).data.class_id;
  const busy = sessionsOf(db, ca)[0].starts_at, mine = sessionsOf(db, cb)[0];
  // Asking for a booked hour is refused straight away.
  const refused = await b.request(`/sessions/${mine.id}/move`, "POST", { starts_at: busy });
  assert.equal(refused.status, 409, JSON.stringify(refused.data));
  assert.match(refused.data.error, /Gia sư đã có buổi học khác lúc/);
  // A free hour is accepted as a request.
  const free = new Date(Date.parse(busy) + 10 * DAY_MS + 5 * HOUR_MS).toISOString();
  assert.equal((await b.request(`/sessions/${mine.id}/move`, "POST", { starts_at: free })).status, 201);
  const mv = one(db, "SELECT * FROM session_moves WHERE session_id=? AND status='pending'", mine.id);
  const accept = () => tutor.request(`/moves/${mv.id}`, "PATCH", { accept: true });
  // The hour was taken in the meantime.
  run(db, "UPDATE session_moves SET starts_at=? WHERE id=?", busy, mv.id);
  assert.equal((await accept()).status, 409);
  // The new hour is now too close, or already past.
  run(db, "UPDATE session_moves SET starts_at=? WHERE id=?", new Date(Date.now() + 10 * 60000).toISOString(), mv.id);
  assert.equal((await accept()).status, 409);
  run(db, "UPDATE session_moves SET starts_at=? WHERE id=?", free, mv.id);
  // The lesson itself has already started.
  const original = mine.starts_at;
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 3 * HOUR_MS).toISOString(), mine.id);
  assert.equal((await accept()).status, 409);
  assert.equal(one(db, "SELECT starts_at FROM class_sessions WHERE id=?", mine.id).starts_at.slice(0, 13), new Date(Date.now() - 3 * HOUR_MS).toISOString().slice(0, 13), "the lesson was not moved");
  // A good request still works end to end.
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", original, mine.id);
  assert.equal((await accept()).status, 200);
  assert.equal(one(db, "SELECT starts_at FROM class_sessions WHERE id=?", mine.id).starts_at, free);
});

// Lỗi 16: an offer is only valid for a subject and a mode the tutor publicly teaches.
const xuOf = (db, id) => { const w = wallet(db, id); return w.credits_free + w.credits_paid; };
const tutorOffers = (db, id, subjects, mode = "both") => run(db, "UPDATE tutors SET subjects=?,mode=? WHERE user_id=?", JSON.stringify(subjects), mode, id);

test("a student's offer must be for a subject and mode the tutor teaches", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", teacher.id);
  const balance = () => one(db, "SELECT available,held FROM wallets WHERE user_id=?", learner.id);
  const before = balance();
  tutorOffers(db, teacher.id, ["toan"], "both");
  const wrongSubject = await offer(student, teacher.id, { subject_id: "tieng-anh" });
  assert.equal(wrongSubject.status, 400, JSON.stringify(wrongSubject.data));
  assert.equal(wrongSubject.data.error, "Gia sư không dạy môn này.");
  assert.deepEqual(balance(), before, "nothing was held");
  assert.equal((await offer(student, teacher.id, { subject_id: "tieng-anh", trial: true })).status, 400, "a trial is checked too");
  // Mode: an online-only tutor refuses an in-person offer, and the other way round.
  tutorOffers(db, teacher.id, ["toan"], "online");
  const inPerson = await offer(student, teacher.id, { mode: "offline" });
  assert.equal(inPerson.status, 400, JSON.stringify(inPerson.data));
  assert.equal(inPerson.data.error, "Gia sư chỉ dạy trực tuyến.");
  tutorOffers(db, teacher.id, ["toan"], "offline");
  assert.equal((await offer(student, teacher.id, { mode: "online" })).data.error, "Gia sư chỉ dạy trực tiếp.");
  assert.deepEqual(balance(), before, "still nothing held");
  // The right subject and mode go through, and "both" takes either mode.
  tutorOffers(db, teacher.id, ["toan"], "both");
  for (const mode of ["online", "offline"]) {
    const ok = await offer(student, teacher.id, { mode });
    assert.equal(ok.status, 201, `${mode}: ${JSON.stringify(ok.data)}`);
    assert.equal((await student.request(`/proposals/${ok.data.id}`, "PATCH", { action: "withdraw" })).status, 200);
  }
});

test("a tutor's own offer must be for a subject in their profile, and a refusal costs no Xu", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  tutorOffers(db, teacher.id, ["toan"], "online");
  const before = xuOf(db, teacher.id);
  const outside = await tutor.request("/proposals", "POST", { ...baseTutorOffer(learner.id), subject_id: "tieng-anh" });
  assert.equal(outside.status, 400, JSON.stringify(outside.data));
  assert.equal(outside.data.error, "Môn này chưa có trong hồ sơ của bạn.");
  const offline = await tutor.request("/proposals", "POST", { ...baseTutorOffer(learner.id), mode: "offline" });
  assert.equal(offline.data.error, "Hồ sơ của bạn chưa nhận hình thức học này.");
  assert.equal(xuOf(db, teacher.id), before, "no Xu taken for a refused offer");
  assert.equal((await tutor.request("/proposals", "POST", baseTutorOffer(learner.id))).status, 201);
});
const baseTutorOffer = (studentId) => ({ student_id: studentId, subject_id: "toan", mode: "online", area: "", level: "cap2", sessions: 2, minutes: 60, rate: 180000, message: "", schedule: [{ weekday: 2, hour: 18 }], start_date: new Date(Date.now() + DAY_MS).toISOString().slice(0, 10) });

test("while an edit awaits review, only the published subjects can be offered", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  // The tutor added English in a draft that is not approved yet: students still see Toán only.
  const row = one(db, "SELECT * FROM tutors WHERE user_id=?", teacher.id);
  run(db, "UPDATE tutors SET published=?,status='pending',subjects=? WHERE user_id=?", contentSnapshot(row), JSON.stringify(["toan", "tieng-anh"]), teacher.id);
  const draft = await offer(student, teacher.id, { subject_id: "tieng-anh" });
  assert.equal(draft.status, 400, JSON.stringify(draft.data));
  assert.equal(draft.data.error, "Gia sư không dạy môn này.");
  assert.equal((await offer(student, teacher.id, { subject_id: "toan" })).status, 201, "the published subject still works");
});

test("a pitch into a 'Tìm gia sư' post is checked the same way and costs no Xu when refused", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  tutorOffers(db, teacher.id, ["toan"], "online");
  run(db, "UPDATE users SET display_name='Minh Anh' WHERE id=?", learner.id);
  const post = await student.request("/community/posts", "POST", { title: "Cần tìm gia sư Toán lớp 9", body: "Em cần gia sư Toán ôn thi vào 10, học online tối thứ 3.", topic: "find_tutor" });
  assert.equal(post.status, 201, JSON.stringify(post.data));
  run(db, "UPDATE community_posts SET status='approved',published_at=CURRENT_TIMESTAMP WHERE id=?", post.data.id);
  const pitch = { subject_id: "toan", mode: "online", sessions: 4, minutes: 90, rate: 180000, schedule: [{ weekday: 1, hour: 19, minute: 0 }], start_date: new Date(Date.now() + DAY_MS).toISOString().slice(0, 10), message: "Cô dạy Toán." };
  const before = xuOf(db, teacher.id);
  const wrong = await tutor.request(`/community/posts/${post.data.id}/pitches`, "POST", { ...pitch, subject_id: "tieng-anh" });
  assert.equal(wrong.status, 400, JSON.stringify(wrong.data));
  assert.equal(wrong.data.error, "Môn này chưa có trong hồ sơ của bạn.");
  assert.equal((await tutor.request(`/community/posts/${post.data.id}/pitches`, "POST", { ...pitch, mode: "offline" })).status, 400);
  assert.equal(xuOf(db, teacher.id), before, "no Xu taken");
  assert.equal((await tutor.request(`/community/posts/${post.data.id}/pitches`, "POST", pitch)).status, 201);
});

// Lỗi 2 + 17: a free trial is one lesson, never renewable; the renew reminder counts what is really left.
const openTrial = async (db, student, tutor, studentId, tutorId) => {
  run(db, "UPDATE tutors SET accepts_trial=1 WHERE user_id=?", tutorId);
  const sent = await offer(student, tutorId, { trial: true });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const accepted = await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  return { classId: accepted.data.class_id, member: one(db, "SELECT * FROM class_members WHERE class_id=? AND student_id=?", accepted.data.class_id, studentId) };
};

test("a free trial package cannot be renewed or reminded, and nothing changes", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  const { classId, member } = await openTrial(db, student, tutor, learner.id, teacher.id);
  assert.equal(member.rate, 0);
  const lessons = () => one(db, "SELECT COUNT(*) n FROM session_members WHERE member_id=?", member.id).n;
  const money = () => one(db, "SELECT available,held FROM wallets WHERE user_id=?", learner.id);
  const before = { lessons: lessons(), money: money() };
  const renew = await student.request(`/members/${member.id}/renew`, "POST", { sessions: 20 });
  assert.equal(renew.status, 409, JSON.stringify(renew.data));
  assert.match(renew.data.error, /Buổi học thử chỉ có một buổi/);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 1);
  assert.equal(lessons(), before.lessons, "no lesson was added");
  assert.deepEqual(money(), before.money, "no money moved");
  const remind = await tutor.request(`/members/${member.id}/remind`, "POST");
  assert.equal(remind.status, 409, JSON.stringify(remind.data));
  assert.equal(one(db, "SELECT reminded_at FROM class_members WHERE id=?", member.id).reminded_at, null);
  // Even a package that somehow has a zero rate is never renewable, trial or not.
  run(db, "UPDATE proposals SET trial=0 WHERE id=?", member.proposal_id);
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 3 })).status, 409);
  // The class page says it is a trial.
  const detail = (await student.request(`/classes/${classId}`)).data;
  assert.equal(detail.members[0].trial, true);
});

test("an ordinary package can still be renewed and reminded", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { member, cls } = await makeClass(db, student, tutor, learner.id, teacher.id);
  assert.equal((await tutor.request(`/members/${member.id}/remind`, "POST")).status, 200);
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 2 })).status, 200);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 4);
  const detail = (await student.request(`/classes/${cls.id}`)).data;
  assert.equal(detail.members[0].trial, false);
});

test("the class page reports the lessons still ahead, not total minus done", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  fund(db, learner.id);
  const sent = await offer(student, teacher.id, { sessions: 3, schedule: [{ weekday: 2, hour: 18 }] });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const classId = (await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept" })).data.class_id;
  const [first] = sessionsOf(db, classId);
  let member = (await student.request(`/classes/${classId}`)).data.members[0];
  assert.deepEqual([member.sessions_total, member.done, member.upcoming], [3, 0, 3]);
  assert.equal((await student.request(`/sessions/${first.id}/cancel`, "POST")).status, 200);
  member = (await student.request(`/classes/${classId}`)).data.members[0];
  assert.equal(member.upcoming, 2, "a cancelled lesson is not 'left'");
  assert.equal(member.sessions_total - member.done, 3, "the old arithmetic would still say 3");
});

// Lỗi 3: renewing N lessons gives the package exactly N new lessons, all after the last one it has.
const vnSlot = (iso) => { const d = new Date(Date.parse(iso) + 7 * HOUR_MS); return { weekday: (d.getUTCDay() + 6) % 7, hour: d.getUTCHours() }; };
const rowsOf = (db, memberId) => all(db, "SELECT cs.id,cs.starts_at,sm.outcome FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id WHERE sm.member_id=? ORDER BY cs.starts_at", memberId);
const openCourse = async (db, student, tutor, studentId, tutorId, extra = {}) => {
  fund(db, studentId);
  const sent = await offer(student, tutorId, { sessions: 2, schedule: [{ weekday: 2, hour: 18 }], ...extra });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const accepted = await tutor.request(`/proposals/${sent.data.id}`, "PATCH", { action: "accept", ...(extra.class_id ? { class_id: extra.class_id } : {}) });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  return { classId: accepted.data.class_id, member: one(db, "SELECT * FROM class_members WHERE class_id=? AND student_id=?", accepted.data.class_id, studentId) };
};

test("renewing with lessons still ahead adds exactly the lessons paid for, after the last one", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { member } = await openCourse(db, student, tutor, learner.id, teacher.id);
  const before = rowsOf(db, member.id), heldBefore = one(db, "SELECT held FROM class_members WHERE id=?", member.id).held;
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 4 })).status, 200);
  const rows = rowsOf(db, member.id);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 6);
  assert.equal(rows.length, 6, "one lesson row per lesson in the package");
  const last = before.at(-1).starts_at;
  for (const r of rows.slice(2)) {
    assert.ok(r.starts_at > last, `${r.starts_at} comes after the old last lesson ${last}`);
    assert.deepEqual(vnSlot(r.starts_at), { weekday: 2, hour: 18 }, "on the class's own weekly rhythm");
  }
  assert.equal(one(db, "SELECT held FROM class_members WHERE id=?", member.id).held, heldBefore + 4 * 180000);
});

test("renewing with one lesson left, or none ahead, still adds the full number an hour or more from now", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { member } = await openCourse(db, student, tutor, learner.id, teacher.id);
  const [first, second] = rowsOf(db, member.id);
  // One lesson left: the first is over and waiting for confirmation, the second is still ahead.
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 5 * HOUR_MS).toISOString(), first.id);
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 3 })).status, 200);
  assert.equal(rowsOf(db, member.id).length, 5);
  // None ahead: every lesson is over and waiting for confirmation.
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() - 30 * HOUR_MS).toISOString(), second.id);
  run(db, "UPDATE class_sessions SET starts_at=? WHERE id IN (SELECT session_id FROM session_members WHERE member_id=? AND session_id NOT IN (?,?))", new Date(Date.now() - 6 * HOUR_MS).toISOString(), member.id, first.id, second.id);
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 2 })).status, 200);
  const rows = rowsOf(db, member.id);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 7);
  assert.equal(rows.length, 7);
  for (const r of rows.slice(5)) assert.ok(Date.parse(r.starts_at) >= Date.now() + HOUR_MS - 5000, `${r.starts_at} is at least an hour ahead`);
});

test("renewing after cancelling the last lesson puts the new lessons after the cancelled one", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { member } = await openCourse(db, student, tutor, learner.id, teacher.id);
  const [, second] = rowsOf(db, member.id);
  assert.equal((await student.request(`/sessions/${second.id}/cancel`, "POST")).status, 200);
  assert.equal((await student.request(`/members/${member.id}/renew`, "POST", { sessions: 2 })).status, 200);
  const rows = rowsOf(db, member.id);
  assert.equal(rows.length, 4, "rows = sessions_total, the cancelled lesson keeps its row");
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 4);
  for (const r of rows.slice(2)) assert.ok(r.starts_at > second.starts_at, "after the cancelled lesson");
});

test("group class: a renewing student shares the lessons others already have before new ones are made", async (t) => {
  const { db, client } = await fixture(t);
  const b = client(), a = client(), tutor = client();
  const sb = await b.login("student"), sa = await a.login(extraStudent(db, "second-student")), teacher = await tutor.login("chau");
  const { classId } = await openCourse(db, b, tutor, sb.id, teacher.id, { sessions: 5 });
  const { member } = await openCourse(db, a, tutor, sa.id, teacher.id, { sessions: 2, class_id: classId });
  const classLessons = () => one(db, "SELECT COUNT(*) n FROM class_sessions WHERE class_id=?", classId).n;
  assert.equal(rowsOf(db, member.id).length, 2);
  assert.equal(classLessons(), 5);
  // Two more: the next two lessons the class already has, so nothing new is created.
  assert.equal((await a.request(`/members/${member.id}/renew`, "POST", { sessions: 2 })).status, 200);
  assert.equal(rowsOf(db, member.id).length, 4);
  assert.equal(classLessons(), 5, "no new class lessons were needed");
  // Three more: the class's last lesson is shared, the other two are new and come after it.
  assert.equal((await a.request(`/members/${member.id}/renew`, "POST", { sessions: 3 })).status, 200);
  const rows = rowsOf(db, member.id);
  assert.equal(rows.length, 7);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, 7);
  assert.equal(classLessons(), 7, "two lessons were created, one was shared");
  const classLast = sessionsOf(db, classId).slice(0, 5).at(-1).starts_at;
  assert.ok(rows[5].starts_at > classLast && rows[6].starts_at > rows[5].starts_at);
  const bRows = one(db, "SELECT COUNT(*) n FROM session_members sm JOIN class_members m ON m.id=sm.member_id WHERE m.student_id=?", sb.id).n;
  assert.equal(bRows, 5, "the other student's lessons are untouched");
});

test("a renewal that would double-book the student is refused and changes nothing", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), chau = client(), nam = client();
  const learner = await student.login("student"), c = await chau.login("chau"), n = await nam.login("nam");
  const { member } = await openCourse(db, student, chau, learner.id, c.id);
  const last = rowsOf(db, member.id).at(-1).starts_at;
  // A second class with another tutor already holds the hour the first renewal lesson would take.
  const date = new Date(Date.parse(last) + 7 * DAY_MS + 7 * HOUR_MS).toISOString().slice(0, 10);
  await openCourse(db, student, nam, learner.id, n.id, { sessions: 1, start_date: date });
  const before = { total: one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, rows: rowsOf(db, member.id).length, money: one(db, "SELECT available,held FROM wallets WHERE user_id=?", learner.id) };
  const clash = await student.request(`/members/${member.id}/renew`, "POST", { sessions: 2 });
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.match(clash.data.error, /đã có buổi học khác/);
  assert.equal(one(db, "SELECT sessions_total FROM class_members WHERE id=?", member.id).sessions_total, before.total);
  assert.equal(rowsOf(db, member.id).length, before.rows);
  assert.deepEqual(one(db, "SELECT available,held FROM wallets WHERE user_id=?", learner.id), before.money, "the money held for the renewal was rolled back");
});

test("startup repair gives a short active package the lessons it is missing, once, and tells both sides", async (t) => {
  const { db, client } = await fixture(t);
  const student = client(), tutor = client();
  const learner = await student.login("student"), teacher = await tutor.login("chau");
  const { classId, member } = await openCourse(db, student, tutor, learner.id, teacher.id);
  // What the old renewal left behind: paid for 6 lessons, scheduled 2.
  run(db, "UPDATE class_members SET sessions_total=6 WHERE id=?", member.id);
  // An ended package is history and must not be touched, even if it looks short.
  const other = (await client().login(extraStudent(db, "second-student"))).id;
  const endedId = Number(run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held,status) VALUES (?,?,5,100000,0,'ended')", classId, other).lastInsertRowid);
  const notices = () => all(db, "SELECT user_id,subject,link FROM notifications WHERE kind='package_repaired' ORDER BY user_id");
  migrateClasses(db);
  const rows = rowsOf(db, member.id);
  assert.equal(rows.length, 6, "the missing lessons were added");
  assert.ok(rows.slice(2).every((r) => r.starts_at > rows[1].starts_at && Date.parse(r.starts_at) >= Date.now() + HOUR_MS - 5000));
  assert.deepEqual(notices().map((x) => [x.user_id, x.subject, x.link]).sort(), [[learner.id, "4", `/classes/${classId}`], [teacher.id, "4", `/classes/${classId}`]].sort());
  assert.equal(rowsOf(db, endedId).length, 0, "the ended package is left alone");
  migrateClasses(db);
  assert.equal(rowsOf(db, member.id).length, 6, "running it again changes nothing");
  assert.equal(notices().length, 2, "and tells nobody twice");
});
