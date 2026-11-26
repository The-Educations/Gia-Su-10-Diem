import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../server/local-db.js";
import { one, run } from "../server/db.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { createApi } from "../server/api.js";

async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-class-extras-")), db = openDatabase(join(dir, "db.sqlite"));
  seedCatalog(db); await seedDemo(db, "TestStudy2026!", { activity: true });
  const app = createApi(db, { limit: false, sendEmail: async () => {} });
  const server = app.listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const client = () => { let cookie = ""; return { async req(path, method = "GET", body) {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: method === "GET" ? undefined : JSON.stringify(body || {}) });
    const cookies = res.headers.getSetCookie(); if (cookies.length) cookie = cookies.map((x) => x.split(";")[0]).join("; ");
    const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }, async login(slug) { const r = await this.req("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" }); assert.equal(r.status, 200, JSON.stringify(r.data)); } }; };
  return { db, client };
}

test("class extras: notes, assignments, posts, badges and ICS", async (t) => {
  const { db, client } = await fixture(t), tutor = client(), student = client(), outsider = client();
  await tutor.login("chau"); await student.login("student"); await outsider.login("nam");
  const studentId = one(db, "SELECT id FROM users WHERE email='student@demo.giasu.test'").id;
  const list = (await tutor.req("/classes")).data; assert.ok(list.length >= 3); assert.ok(list.some((c) => c.assignment_badge >= 0));
  const cls = list.find((c) => c.members.some((m) => m.name === "Minh Anh")) || list[0];
  let detail = (await tutor.req(`/classes/${cls.id}`)).data;
  assert.ok(Array.isArray(detail.assignments)); assert.ok(Array.isArray(detail.posts)); assert.ok(detail.tutor_stats);
  const session = detail.sessions.find((s) => s.status === "scheduled") || detail.sessions[0];
  const note = await tutor.req(`/sessions/${session.id}/note`, "PUT", { body: "Hôm nay ôn căn bậc hai, em cần xét điều kiện kỹ hơn." });
  assert.equal(note.status, 200); detail = (await tutor.req(`/classes/${cls.id}`)).data;
  assert.equal(detail.sessions.find((s) => s.id === session.id).teacher_note.includes("căn bậc hai"), true);

  const made = await tutor.req(`/classes/${cls.id}/assignments`, "POST", { title: "Phiếu luyện test", note: "Làm 10 câu đầu", due_at: new Date(Date.now() + 86400000).toISOString(), session_id: session.id });
  assert.equal(made.status, 201, JSON.stringify(made.data));
  detail = (await student.req(`/classes/${cls.id}`)).data;
  const assignment = detail.assignments.find((a) => a.title === "Phiếu luyện test"); assert.ok(assignment);
  assert.equal((await outsider.req(`/assignments/${assignment.id}/submit`, "POST", { note: "x" })).status, 403);
  assert.equal((await student.req(`/assignments/${assignment.id}/submit`, "POST", { note: "https://example.com/bai-lam" })).status, 200);
  detail = (await tutor.req(`/classes/${cls.id}`)).data;
  const sub = detail.assignments.find((a) => a.id === assignment.id).submissions.find((s) => s.status === "submitted");
  assert.ok(sub); assert.equal((await tutor.req(`/assignments/${assignment.id}/review`, "POST", { member_id: sub.member_id, feedback: "Làm tốt, câu 5 xem lại dấu." })).status, 200);
  assert.equal((await tutor.req(`/classes/${cls.id}/posts`, "POST", { body: "Tuần sau học đúng giờ, nhớ mang vở." })).status, 201);
  const ics = await student.req(`/classes/${cls.id}/ics`); assert.equal(ics.status, 200); assert.match(String(ics.data), /BEGIN:VCALENDAR/); assert.match(ics.headers.get("content-type"), /text\/calendar/);
  const parent = client();
  await parent.login("parent");
  const parentList = await parent.req("/classes");
  assert.equal(parentList.status, 200, JSON.stringify(parentList.data));
  assert.ok(parentList.data.some((c) => c.id === cls.id), "parent list includes the child's class");
  const parentDetail = await parent.req(`/classes/${cls.id}`);
  assert.equal(parentDetail.status, 200, JSON.stringify(parentDetail.data));
  assert.ok(parentDetail.data.sessions.some((s) => s.id === session.id), "parent sees the child's sessions");
  assert.equal(parentDetail.data.sessions.find((s) => s.id === session.id).teacher_note.includes("căn bậc hai"), true);
  assert.ok(parentDetail.data.posts.some((p) => p.body.includes("Tuần sau học đúng giờ")));
  const parentAssignment = parentDetail.data.assignments.find((a) => a.id === assignment.id);
  assert.ok(parentAssignment.submissions.length);
  assert.ok(parentAssignment.submissions.every((s) => s.student_id === studentId), "parent only sees the child's submissions");
  assert.equal((await parent.req(`/sessions/${session.id}/confirm`, "POST")).status, 404);
  assert.equal((await parent.req(`/sessions/${session.id}/cancel`, "POST")).status, 404);
  assert.equal((await parent.req(`/sessions/${session.id}/dispute`, "POST", { reason: "phụ huynh không được báo" })).status, 404);
  assert.equal((await parent.req(`/sessions/${session.id}/move`, "POST", { starts_at: new Date(Date.now() + 86400000).toISOString() })).status, 404);
  assert.equal((await parent.req(`/assignments/${assignment.id}/submit`, "POST", { note: "phụ huynh nộp thay" })).status, 404);
  assert.equal((await parent.req(`/classes/${cls.id}/posts`, "POST", { body: "phụ huynh đăng thông báo" })).status, 403);
  const notification = one(db, "SELECT * FROM notifications WHERE kind='assignment_new' ORDER BY id DESC LIMIT 1"); assert.ok(notification);
  run(db, "DELETE FROM notifications WHERE id=?", notification.id);
});
