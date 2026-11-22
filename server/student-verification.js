import express from "express";
import { createHash, randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";

// Students prove they are students with a photo or PDF of their school record
// (học bạ) or transcript. An administrator checks it before the student can
// send or accept offers. One record, and one student code, belong to one account.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const LIMIT = 5 * 1024 * 1024, MAX_FILES = 3;
export const fingerprint = (data) => createHash("sha256").update(data).digest("hex");
const code = (s) => s.normalize("NFKC").replace(/\s+/g, "").toUpperCase();

export function migrateStudentVerification(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS student_verifications (
    user_id INTEGER PRIMARY KEY REFERENCES users(id), school TEXT NOT NULL DEFAULT '', grade TEXT NOT NULL DEFAULT '',
    student_code TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', note TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT, submitted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS verification_files (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mime TEXT NOT NULL, size INTEGER NOT NULL,
    sha256 TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS verification_files_hash ON verification_files(sha256);
  CREATE TABLE IF NOT EXISTS verification_file_chunks (
    file_id TEXT NOT NULL REFERENCES verification_files(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(file_id, part));`);
  if (!db.prepare("PRAGMA table_info(credential_files)").all().some((c) => c.name === "sha256"))
    db.exec("ALTER TABLE credential_files ADD COLUMN sha256 TEXT NOT NULL DEFAULT ''");
}

// The same file may not prove two accounts, whether as a student record or a tutor's proof.
export function assertUnusedProof(db, hash, userId) {
  const other = one(db, `SELECT user_id FROM verification_files WHERE sha256=? AND user_id<>?
    UNION SELECT c.tutor_id FROM credential_files f JOIN tutor_credentials c ON c.id=f.credential_id WHERE f.sha256=? AND c.tutor_id<>? LIMIT 1`, hash, userId, hash, userId);
  if (other) fail(409, "Minh chứng này đã được dùng cho một tài khoản khác.");
}

export const isVerifiedStudent = (db, userId) => one(db, "SELECT status FROM student_verifications WHERE user_id=?", userId)?.status === "approved";

function view(db, userId) {
  const v = one(db, "SELECT * FROM student_verifications WHERE user_id=?", userId) || { status: "draft", school: "", grade: "", student_code: "", note: "" };
  return { ...v, files: all(db, "SELECT id,mime,size,created_at FROM verification_files WHERE user_id=? ORDER BY created_at", userId) };
}

export function registerStudentVerification(app, db, auth, audit, processPhoto) {
  const student = (req) => {
    if (req.user.role !== "student" || req.user.learner_type === "parent") fail(403, "Chỉ tài khoản học sinh cần xác minh.");
  };
  app.get("/api/account/verification", auth("student"), (req, res) => res.json(view(db, req.user.id)));
  app.put("/api/account/verification", auth("student"), (req, res) => {
    student(req);
    const d = z.object({
      school: z.string().trim().min(2, "Nhập tên trường.").max(160),
      grade: z.string().trim().min(1, "Chọn lớp.").max(20),
      student_code: z.string().trim().min(4, "Nhập mã học sinh hoặc số báo danh.").max(40),
    }).parse(req.body);
    transaction(db, () => {
      const current = one(db, "SELECT status FROM student_verifications WHERE user_id=?", req.user.id);
      if (current?.status === "approved") fail(409, "Tài khoản đã được xác minh.");
      if (one(db, "SELECT 1 FROM student_verifications WHERE student_code=? AND user_id<>? AND status<>'rejected'", code(d.student_code), req.user.id))
        fail(409, "Mã học sinh này đã được dùng cho một tài khoản khác. Liên hệ hỗ trợ nếu đây là bạn.");
      if (!one(db, "SELECT 1 FROM verification_files WHERE user_id=?", req.user.id)) fail(400, "Tải lên ảnh học bạ hoặc bảng điểm.");
      run(db, `INSERT INTO student_verifications(user_id,school,grade,student_code,status,submitted_at) VALUES (?,?,?,?,'pending',CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET school=excluded.school,grade=excluded.grade,student_code=excluded.student_code,status='pending',note='',submitted_at=CURRENT_TIMESTAMP`,
        req.user.id, d.school, d.grade, code(d.student_code));
      for (const a of all(db, "SELECT id FROM users WHERE role='admin' AND status='active'")) notify(db, a.id, "verification_submitted", { actor: req.user.name, link: "/admin?tab=today" });
    });
    res.json(view(db, req.user.id));
  });
  app.post("/api/account/verification/files", auth("student"), express.raw({ type: () => true, limit: LIMIT }), async (req, res) => {
    student(req);
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, "Chọn một tệp.");
    const hash = fingerprint(req.body);
    assertUnusedProof(db, hash, req.user.id);
    let data = req.body, mime = req.body.subarray(0, 4).toString() === "%PDF" ? "application/pdf" : "image";
    if (mime === "image") {
      try { data = await processPhoto(data, true); mime = "image/webp"; }
      catch { fail(400, "Ảnh không hợp lệ. Dùng JPG, PNG hoặc WebP, tối đa 5 MB."); }
    }
    transaction(db, () => {
      if (one(db, "SELECT status FROM student_verifications WHERE user_id=?", req.user.id)?.status === "approved") fail(409, "Tài khoản đã được xác minh.");
      if (one(db, "SELECT COUNT(*) n FROM verification_files WHERE user_id=?", req.user.id).n >= MAX_FILES) fail(409, `Tối đa ${MAX_FILES} tệp.`);
      const id = randomUUID();
      run(db, "INSERT INTO verification_files(id,user_id,mime,size,sha256) VALUES (?,?,?,?,?)", id, req.user.id, mime, data.length, hash);
      for (let offset = 0, part = 0; offset < data.length; offset += 100000, part++)
        run(db, "INSERT INTO verification_file_chunks VALUES (?,?,?)", id, part, data.subarray(offset, offset + 100000));
    });
    res.status(201).json(view(db, req.user.id));
  });
  app.delete("/api/account/verification/files/:id", auth("student"), (req, res) => {
    if (one(db, "SELECT status FROM student_verifications WHERE user_id=?", req.user.id)?.status === "approved") fail(409, "Tài khoản đã được xác minh.");
    run(db, "DELETE FROM verification_files WHERE id=? AND user_id=?", req.params.id, req.user.id);
    res.json(view(db, req.user.id));
  });
  app.get("/api/verification-files/:id", auth(), (req, res) => {
    const f = one(db, "SELECT * FROM verification_files WHERE id=?", req.params.id);
    if (!f || (req.user.role !== "admin" && req.user.id !== f.user_id)) fail(404, "Tệp không có sẵn.");
    const data = Buffer.concat(all(db, "SELECT data FROM verification_file_chunks WHERE file_id=? ORDER BY part", f.id).map((c) => Buffer.from(c.data)));
    res.set("Content-Type", f.mime).set("Content-Security-Policy", "default-src 'none'; sandbox").set("Cache-Control", "private, no-store").send(data);
  });
  app.get("/api/admin/verifications", auth("admin"), (req, res) => {
    res.json(all(db, `SELECT v.*,u.name,u.email FROM student_verifications v JOIN users u ON u.id=v.user_id WHERE v.status='pending' ORDER BY v.submitted_at`)
      .map((v) => ({ ...v, files: all(db, "SELECT id,mime FROM verification_files WHERE user_id=?", v.user_id) })));
  });
  app.patch("/api/admin/verifications/:id", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).default("") }).parse(req.body);
    if (d.status === "rejected" && !d.note) fail(400, "Ghi lý do để học sinh biết cần bổ sung gì.");
    if (!run(db, "UPDATE student_verifications SET status=?,note=?,reviewed_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='pending'", d.status, d.note, id).changes) fail(404, "Không tìm thấy yêu cầu xác minh.");
    notify(db, id, `verification_${d.status}`, { subject: d.note, link: "/settings" });
    audit(req.user.id, `student.verification.${d.status}`, id);
    res.json({ ok: true });
  });
}
