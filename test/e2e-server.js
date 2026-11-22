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
