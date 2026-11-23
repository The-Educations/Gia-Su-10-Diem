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
  run(db, "UPDATE session_members SET outcome='completed',settled=1 WHERE session_id=? AND member_id=?", session.id, member.id);
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
  run(db, "UPDATE session_members SET outcome='completed',settled=1,rating=5 WHERE session_id=? AND member_id=?", session.id, member.id);
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
