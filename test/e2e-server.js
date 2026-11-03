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
  if (slug.startsWith("profile-")) run(db, "UPDATE users SET display_name=? WHERE id=?", `Bạn ${slug.slice(8)}`, id);
}
db.close();
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
const messages = new Map();
const { startServer } = await import("../server/index.js");
const { app } = await startServer({ sendAdminEmail: async message => { messages.set(message.to, message); }, sendEmail: async message => { messages.set(message.to, message); } });
app.get("/__test/email", (req, res) => res.json(messages.get(req.query.email) || null));
