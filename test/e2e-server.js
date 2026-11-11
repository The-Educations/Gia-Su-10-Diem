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
  ["legacy-weekly", "student", "student"],
  // Books through offers in the marketplace spec, keeping its threads apart from the demo student's.
  ["lesson-student", "student", "student"],
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
  if (slug.startsWith("profile-")) run(db, "UPDATE users SET display_name=? WHERE id=?", `Bạn ${slug.slice(8)}`, id);
}
// A weekly request from the retired template, seeded because the API no longer creates them.
// The message-context spec follows its message link back to the exact card. It has its own
// learner so the thread stays separate from the offer conversations other specs create with nam.
{
  const parent = one(db, "SELECT id FROM users WHERE email='legacy-weekly@demo.giasu.test'");
  const nam = one(db, "SELECT u.id,t.rate FROM users u JOIN tutors t ON t.user_id=u.id WHERE u.email='nam@demo.giasu.test'");
  run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", parent.id, nam.id);
  const inquiry = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", parent.id, nam.id);
  const id = Number(run(db, "INSERT INTO weekly_requests(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,rate) VALUES (?,?,?,'vat-li','online',?,?)", parent.id, nam.id, inquiry.id, JSON.stringify([{ weekday: 3, hour: 18 }]), nam.rate).lastInsertRowid);
  run(db, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id) VALUES (?,?,?,'weekly-request',?)", inquiry.id, parent.id, `Yêu cầu học hằng tuần #${id}: Thứ 5 18:00–19:00 (giờ Việt Nam).`, id);
}
db.close();
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const messages = new Map();
const { startServer } = await import("../server/index.js");
const { app } = await startServer({ sendAdminEmail: async message => { messages.set(message.to, message); }, sendEmail: async message => { messages.set(message.to, message); } });
app.get("/__test/email", (req, res) => res.json(messages.get(req.query.email) || null));
