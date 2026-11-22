import { randomInt } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { wallet } from "./wallet.js";

// A parent links to a child's student account with the child's invite code.
// Linked parents follow the child's classes, money and offers, top up the
// child's balance and send offers on the child's behalf.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function migrateFamily(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS family_links (
    parent_id INTEGER NOT NULL REFERENCES users(id), student_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(parent_id, student_id));
  CREATE TABLE IF NOT EXISTS family_codes (student_id INTEGER PRIMARY KEY REFERENCES users(id), code TEXT NOT NULL UNIQUE);`);
}

export const isParentOf = (db, parentId, studentId) => !!one(db, "SELECT 1 FROM family_links WHERE parent_id=? AND student_id=?", parentId, studentId);
export const childrenOf = (db, parentId) => all(db, "SELECT student_id FROM family_links WHERE parent_id=?", parentId).map((r) => r.student_id);

function code(db, studentId, fresh = false) {
  const row = one(db, "SELECT code FROM family_codes WHERE student_id=?", studentId);
  if (row && !fresh) return row.code;
  for (let i = 0; i < 5; i++) {
    const next = Array.from({ length: 6 }, () => CHARS[randomInt(CHARS.length)]).join("");
    try {
      run(db, "INSERT INTO family_codes(student_id,code) VALUES (?,?) ON CONFLICT(student_id) DO UPDATE SET code=excluded.code", studentId, next);
      return next;
    } catch (e) { if (!/UNIQUE/.test(String(e.message))) throw e; }
  }
  fail(500, "Không tạo được mã. Thử lại.");
}

export function registerFamily(app, db, auth) {
  app.get("/api/family", auth("student"), (req, res) => {
    if (req.user.learner_type === "parent") {
      const kids = all(db, "SELECT u.id,u.name,u.school FROM family_links f JOIN users u ON u.id=f.student_id WHERE f.parent_id=? AND u.status='active' ORDER BY u.name", req.user.id);
      return res.json({
        role: "parent",
        children: kids.map((k) => {
          const w = wallet(db, k.id);
          return {
            ...k, available: w.available, held: w.held,
            classes: all(db, `SELECT c.id,c.title,c.color,m.sessions_total,m.status,
              (SELECT COUNT(*) FROM session_members WHERE member_id=m.id AND outcome IN ('confirmed','charged')) AS done,
              (SELECT MIN(cs.starts_at) FROM class_sessions cs JOIN session_members sm ON sm.session_id=cs.id WHERE sm.member_id=m.id AND cs.status='scheduled' AND cs.starts_at>?) AS next_at
              FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.student_id=? ORDER BY m.status, c.id DESC`, new Date().toISOString(), k.id),
            pending_offers: one(db, "SELECT COUNT(*) n FROM proposals WHERE student_id=? AND status='pending'", k.id).n,
          };
        }),
      });
    }
    res.json({ role: "student", code: code(db, req.user.id), parents: all(db, "SELECT u.id,u.name FROM family_links f JOIN users u ON u.id=f.parent_id WHERE f.student_id=?", req.user.id) });
  });
  app.post("/api/family/code", auth("student"), (req, res) => {
    if (req.user.learner_type === "parent") fail(403, "Mã mời thuộc tài khoản học sinh.");
    res.json({ code: code(db, req.user.id, true) });
  });
  app.post("/api/family/link", auth("student"), (req, res) => {
    if (req.user.learner_type !== "parent") fail(403, "Chỉ tài khoản phụ huynh liên kết được với con.");
    const { code: input } = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Mã gồm 6 ký tự.") }).parse(req.body);
    transaction(db, () => {
      const row = one(db, "SELECT f.student_id FROM family_codes f JOIN users u ON u.id=f.student_id WHERE f.code=? AND u.status='active' AND u.learner_type='student'", input);
      if (!row) fail(404, "Mã không đúng hoặc đã được đổi. Hỏi con mã mới trong Cài đặt.");
      if (childrenOf(db, req.user.id).length >= 6) fail(409, "Tối đa 6 tài khoản con.");
      run(db, "INSERT OR IGNORE INTO family_links(parent_id,student_id) VALUES (?,?)", req.user.id, row.student_id);
      notify(db, row.student_id, "family_linked", { actor: req.user.name, link: "/settings" });
    });
    res.status(201).json({ ok: true });
  });
  app.delete("/api/family/:id", auth("student"), (req, res) => {
    const other = z.coerce.number().int().positive().parse(req.params.id);
    run(db, "DELETE FROM family_links WHERE (parent_id=? AND student_id=?) OR (parent_id=? AND student_id=?)", req.user.id, other, other, req.user.id);
    res.json({ ok: true });
  });
}
