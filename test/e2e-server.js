import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { one, run } from "../server/db.js";
import { openDatabase } from "../server/local-db.js";

import { seedCatalog, seedDemo } from "../server/seed.js";
const dir = mkdtempSync(join(tmpdir(), "giasu-browser-"));
process.env.DB_PATH = join(dir, "db.sqlite");
process.env.PORT = process.env.E2E_PORT || "4175";
process.env.NODE_ENV = "test";
process.env.SERVE_BUILD = "1";
process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
const db = openDatabase();
seedCatalog(db);
await seedDemo(db, "BrowserStudy2026!");
for (const [slug, role, learner] of [
  ["community-parent", "student", "parent"],
  ["community-pending", "tutor", "student"],
  ["profile-student", "student", "student"],
  ["profile-parent", "student", "parent"],
  ["profile-tutor", "tutor", "student"],
  ["profile-pending", "tutor", "student"],
  ["profile-other", "student", "student"],
  ["profile-admin", "admin", "student"],
]) {
  const id = Number(
    run(
      db,
      "INSERT INTO users(name,email,password,role,learner_type,demo) VALUES (?,?,?,?,?,1)",
      `Private ${slug}`,
      `${slug}@demo.giasu.test`,
      one(
        db,
        "SELECT password FROM users WHERE email='student@demo.giasu.test'",
      ).password,
      role,
      learner,
    ).lastInsertRowid,
  );
  if (role === "tutor")
    run(db, "INSERT INTO tutors(user_id,status) VALUES (?,?)", id, slug === "profile-tutor" ? "approved" : "pending");
  if (role === "student" && learner === "student")
    run(db, "INSERT INTO student_verifications(user_id,school,grade,student_code,status) VALUES (?,?,?,?,'approved')", id, "THCS Mẫu", "Lớp 9", `E2E${id}`);
  if (slug.startsWith("profile-")) run(db, "UPDATE users SET display_name=? WHERE id=?", `Bạn ${slug.slice(8)}`, id);
}
db.close();
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const messages = new Map();
const { startServer } = await import("../server/index.js");
const { app } = await startServer({ sendAdminEmail: async message => { messages.set(message.to, message); }, sendEmail: async message => { messages.set(message.to, message); } });
app.get("/__test/email", (req, res) => res.json(messages.get(req.query.email) || null));
// Test-only: public community posts with a chosen author, status and age, for the "Đang tìm gia sư" strip.
const stripPosts = new Set();
app.post("/__test/community-post", express.json(), (req, res) => {
  const { author, title, body = "Nội dung bài", status = "approved", solved = 0, days_ago = 0, kind = "user" } = req.body;
  const db = openDatabase();
  try {
    const user = one(db, "SELECT id FROM users WHERE email=?", `${author}@demo.giasu.test`);
    const id = Number(run(db, "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,solved,published_at) VALUES (?,?,?,?,?,?,?,datetime('now',?))",
      user.id, kind, status, title, body, `${title} ${body}`.toLowerCase(), solved, `-${days_ago * 86400} seconds`).lastInsertRowid);
    stripPosts.add(id);
    res.json({ id });
  } finally { db.close(); }
});
app.post("/__test/community-posts/clear", (_req, res) => {
  const db = openDatabase();
  try {
    for (const id of stripPosts) run(db, "DELETE FROM community_posts WHERE id=?", id);
    stripPosts.clear();
    res.json({ ok: true });
  } finally { db.close(); }
});
// Test-only: a course that already ended with completed lessons, so ratings and reviews can be exercised.
app.post("/__test/course", express.json(), (req, res) => {
  const { student, tutor, lessons = 3 } = req.body;
  const db = openDatabase();
  try {
    const user = email => one(db, "SELECT id FROM users WHERE email=?", `${email}@demo.giasu.test`).id;
    const studentId = user(student), tutorId = user(tutor), day = 86400000, now = Date.now();
    run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", studentId, tutorId);
    const inquiry = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", studentId, tutorId).id;
    const date = ms => new Date(ms).toISOString().slice(0, 10);
    const offer = Number(run(db, "INSERT INTO offers(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,rate,start_date,end_date,status,kind,weeks,accepted_at,ended_at,ended_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      studentId, tutorId, inquiry, "toan", "online", "[{\"weekday\":0,\"hour\":19}]", 180000, date(now - 30 * day), date(now + 30 * day), "cancelled", "course", 8, new Date(now - 30 * day).toISOString(), new Date(now - 2 * day).toISOString(), tutorId).lastInsertRowid);
    const ids = [];
    for (let i = 0; i < lessons; i++) {
      const starts_at = new Date(now - (3 + i * 5) * day).toISOString();
      const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at,source,available) VALUES (?,?,'offer',0)", tutorId, starts_at).lastInsertRowid);
      ids.push(Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,status,duration_minutes,offer_id) VALUES (?,?,?,?,?,?,?,?,?,?)", studentId, tutorId, slot, "toan", starts_at, 180000, "online", "completed", 60, offer).lastInsertRowid));
    }
    res.json({ offer, bookings: ids });
  } finally { db.close(); }
});
// Test-only: age a lesson and set its members' outcome, so the admin "Buổi học" queues have work.
app.post("/__test/class-session", express.json(), (req, res) => {
  const { session_id, hours_from_now, outcome = "pending", note = "", keep_outcome = false } = req.body;
  const db = openDatabase();
  try {
    run(db, "UPDATE class_sessions SET starts_at=? WHERE id=?", new Date(Date.now() + hours_from_now * 3600000).toISOString(), session_id);
    // keep_outcome: only move the lesson in time, leaving each student's own outcome as it is (group classes).
    if (!keep_outcome) run(db, "UPDATE session_members SET outcome=?,note=? WHERE session_id=?", outcome, note || (outcome === "disputed" ? "Gia sư không vào lớp" : ""), session_id);
    res.json({ ok: true });
  } finally { db.close(); }
});
// Test-only: a dedicated class with a unique slugged title and three lessons
// (disputed past, ended-pending past, upcoming) — specs filter by the slug, so
// leftovers from other specs on the shared database never change the counts.
app.post("/__test/session-class", express.json(), (req, res) => {
  const db = openDatabase();
  try {
    const slug = `B${Date.now().toString(36)}`;
    const tutor = one(db, "SELECT id FROM users WHERE email='nam@demo.giasu.test'"),
      student = one(db, "SELECT id,name FROM users WHERE email='student@demo.giasu.test'"),
      title = `Vật lí · ${slug}`;
    const cid = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,color,minutes,schedule) VALUES (?,?,?,?,?,?,?)", tutor.id, title, "vat-li", "online", "rose", 60, "[]").lastInsertRowid);
    const mid = Number(run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held) VALUES (?,?,?,?,?)", cid, student.id, 3, 180000, 540000).lastInsertRowid);
    const mk = (hours, outcome, note) => {
      const sid = Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cid, new Date(Date.now() + hours * 3600000).toISOString(), 60).lastInsertRowid);
      run(db, "INSERT INTO session_members(session_id,member_id,outcome,note) VALUES (?,?,?,?)", sid, mid, outcome, note);
      return sid;
    };
    const disputed = mk(-3, "disputed", `Gia sư không vào lớp ${slug}`), waiting = mk(-2, "pending", ""), upcoming = mk(26, "pending", "");
    const slot = Number(run(db, "INSERT INTO slots(tutor_id,starts_at) VALUES (?,?)", tutor.id, new Date(Date.now() + 30 * 3600000).toISOString()).lastInsertRowid);
    const booking = Number(run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,status,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?,?)",
      student.id, tutor.id, slot, "vat-li", new Date(Date.now() + 30 * 3600000).toISOString(), 180000, "online", `Lịch lẻ ${slug}`, "accepted", 60).lastInsertRowid);
    res.json({ class_id: cid, slug, disputed, waiting, upcoming, member_id: mid, booking_id: booking, student_id: student.id, student_name: student.name });
  } finally { db.close(); }
});

// Test-only: a class with three finished sessions a student can rate, plus an
// endable membership — used by ratings.spec.ts on the new class flow.
// A free-trial package (rate 0, one lesson still ahead) so the class page can be checked end to end.
app.post("/__test/trial-class", express.json(), (req, res) => {
  const db = openDatabase();
  try {
    const student = one(db, "SELECT id FROM users WHERE email=?", `${req.body.student}@demo.giasu.test`);
    const tutor = one(db, "SELECT id FROM users WHERE email='chau@demo.giasu.test'");
    const cid = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,color,minutes,schedule) VALUES (?,?,?,?,?,?,?)", tutor.id, `Học thử · T${Date.now().toString(36)}`, "toan", "online", "sky", 60, "[]").lastInsertRowid);
    const mid = Number(run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held) VALUES (?,?,1,0,0)", cid, student.id).lastInsertRowid);
    const sid = Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,60)", cid, new Date(Date.now() + 2 * 86400000).toISOString()).lastInsertRowid);
    run(db, "INSERT INTO session_members(session_id,member_id,outcome) VALUES (?,?,'pending')", sid, mid);
    res.json({ class_id: cid, member: mid, tutor_id: tutor.id });
  } finally { db.close(); }
});
app.post("/__test/rated-class", express.json(), (req, res) => {
  const db = openDatabase();
  try {
    const student = one(db, "SELECT id FROM users WHERE email=?", `${req.body.student}@demo.giasu.test`);
    const tutor = one(db, "SELECT id FROM users WHERE email='chau@demo.giasu.test'");
    const slug = `R${Date.now().toString(36)}`;
    const cid = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,color,minutes,schedule) VALUES (?,?,?,?,?,?,?)", tutor.id, `Toán · ${slug}`, "toan", "online", "sky", 60, "[]").lastInsertRowid);
    const mid = Number(run(db, "INSERT INTO class_members(class_id,student_id,sessions_total,rate,held) VALUES (?,?,?,?,?)", cid, student.id, 3, 180000, 0).lastInsertRowid);
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const sid = Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cid, new Date(Date.now() - (5 - i) * 86400000).toISOString(), 60).lastInsertRowid);
      run(db, "INSERT INTO session_members(session_id,member_id,outcome) VALUES (?,?,'confirmed')", sid, mid);
      sessions.push(sid);
    }
    res.json({ member: mid, sessions });
  } finally { db.close(); }
});
