import express from "express";
import { randomUUID } from "node:crypto";
import catalog from "../shared/credential-catalog.json" with { type: "json" };
import { all, one, run, transaction } from "./db.js";
import { assertUnusedProof, fingerprint } from "./student-verification.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";

// A tutor's school, award or certificate. Each one carries proof files that only
// the tutor and administrators can open; students see the approved entries as
// "verified" lines, never the files.
export const PROOF_LIMIT = 5 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_CREDENTIALS = 20;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const year = z.number().int().min(1950).max(new Date().getUTCFullYear() + 6);

export function migrateCredentials(db) {
  const columns = db.prepare("PRAGMA table_info(tutors)").all().map((c) => c.name);
  if (!columns.includes("tutor_kind")) db.exec("ALTER TABLE tutors ADD COLUMN tutor_kind TEXT NOT NULL DEFAULT ''");
  if (!columns.includes("intro_video")) db.exec("ALTER TABLE tutors ADD COLUMN intro_video TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE TABLE IF NOT EXISTS tutor_credentials (
    id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES tutors(user_id),
    kind TEXT NOT NULL CHECK(kind IN ('school','award','certificate')), catalog_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT NOT NULL DEFAULT '', reviewed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS tutor_credentials_tutor ON tutor_credentials(tutor_id, status);
    CREATE TABLE IF NOT EXISTS credential_files (
    id TEXT PRIMARY KEY, credential_id INTEGER NOT NULL REFERENCES tutor_credentials(id) ON DELETE CASCADE,
    mime TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS credential_file_chunks (
    file_id TEXT NOT NULL REFERENCES credential_files(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(file_id, part));`);
}

const detailSchema = z.object({
  field: z.string().trim().max(120).default(""),
  start_year: year.nullable().default(null),
  end_year: year.nullable().default(null),
  current: z.boolean().default(false),
  prize: z.string().trim().max(80).default(""),
  subject: z.string().trim().max(80).default(""),
  score: z.string().trim().max(40).default(""),
  reference: z.string().trim().max(60).default(""),
}).refine((d) => d.end_year === null || d.start_year === null || d.end_year >= d.start_year, { message: "Năm kết thúc phải từ năm bắt đầu trở đi.", path: ["end_year"] });

export const credentialSchema = z.object({
  kind: z.enum(["school", "award", "certificate"]),
  catalog_id: z.string().max(120).default(""),
  name: z.string().trim().max(200).default(""),
  detail: detailSchema.default({}),
});

const lists = { school: catalog.schools, award: catalog.awards, certificate: catalog.certificates };

// A catalogue entry fixes the name; "Khác" entries carry a typed name instead.
export function normalizeCredential(input) {
  const d = credentialSchema.parse(input);
  if (d.catalog_id) {
    const entry = lists[d.kind].find((e) => e.id === d.catalog_id);
    if (!entry) fail(400, "Mục không có trong danh sách. Chọn lại hoặc dùng mục Khác.");
    d.name = entry.name;
    if (d.kind === "award" && d.detail.prize && !entry.prizes.includes(d.detail.prize)) fail(400, "Chọn giải trong danh sách.");
  } else if (d.name.length < 2) fail(400, "Nhập tên trường, giải thưởng hoặc chứng chỉ.");
  if (d.kind === "award" && !d.detail.prize) fail(400, "Chọn giải đạt được.");
  if (d.kind === "school" && !d.detail.start_year) fail(400, "Nhập năm bắt đầu học.");
  return d;
}

// Short public line for an approved credential, e.g. "IELTS Academic · 8.0".
export function credentialLabel(c) {
  const d = typeof c.detail === "string" ? JSON.parse(c.detail) : c.detail;
  if (c.kind === "school") return [c.name, d.field].filter(Boolean).join(" · ");
  if (c.kind === "award") return [d.prize, c.name, d.subject, d.end_year || d.start_year].filter(Boolean).join(" · ");
  return [c.name, d.score].filter(Boolean).join(" · ");
}

export function verifiedCredentials(db) {
  const map = new Map();
  for (const c of all(db, "SELECT tutor_id,kind,name,detail FROM tutor_credentials WHERE status='approved' AND EXISTS(SELECT 1 FROM credential_files f WHERE f.credential_id=tutor_credentials.id) ORDER BY CASE kind WHEN 'school' THEN 0 WHEN 'award' THEN 1 ELSE 2 END, id")) {
    if (!map.has(c.tutor_id)) map.set(c.tutor_id, []);
    map.get(c.tutor_id).push({ kind: c.kind, label: credentialLabel(c) });
  }
  return map;
}

function rows(db, tutorId) {
  const files = all(db, "SELECT f.id,f.credential_id,f.mime,f.name,f.size FROM credential_files f JOIN tutor_credentials c ON c.id=f.credential_id WHERE c.tutor_id=? ORDER BY f.created_at", tutorId);
  return all(db, "SELECT * FROM tutor_credentials WHERE tutor_id=? ORDER BY CASE kind WHEN 'school' THEN 0 WHEN 'award' THEN 1 ELSE 2 END, id", tutorId).map((c) => ({
    ...c,
    detail: JSON.parse(c.detail),
    label: credentialLabel(c),
    files: files.filter((f) => f.credential_id === c.id).map(({ credential_id, ...f }) => ({ ...f, url: `/api/credential-files/${f.id}` })),
  }));
}

function proofMime(data, claimed) {
  if (["image/jpeg", "image/png", "image/webp"].includes(claimed)) return "image";
  if ((claimed === "application/pdf" || !claimed) && data.subarray(0, 1024).includes("%PDF-")) return "application/pdf";
  fail(400, "Dùng ảnh JPG, PNG, WebP hoặc tệp PDF.");
}

export function registerCredentials(app, db, auth, audit, processPhoto) {
  const owned = (req) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const c = one(db, "SELECT * FROM tutor_credentials WHERE id=? AND tutor_id=?", id, req.user.id);
    if (!c) fail(404, "Không tìm thấy mục này.");
    return c;
  };
  const reopen = (id) => run(db, "UPDATE tutor_credentials SET status='pending',review_note='',reviewed_at=NULL WHERE id=?", id);

  // A candidate number or certificate ID proves one tutor only.
  const uniqueReference = (d, userId) => {
    if (d.detail.reference && one(db, "SELECT 1 FROM tutor_credentials WHERE catalog_id=? AND catalog_id<>'' AND json_extract(detail,'$.reference')=? AND tutor_id<>? AND status<>'rejected'", d.catalog_id, d.detail.reference, userId))
      fail(409, "Số báo danh / mã chứng chỉ này đã được một gia sư khác khai báo.");
  };
  app.get("/api/credentials/catalog", (req, res) => res.json(catalog));
  app.get("/api/tutor/credentials", auth("tutor"), (req, res) => res.json(rows(db, req.user.id)));
  app.post("/api/tutor/credentials", auth("tutor"), (req, res) => {
    const d = normalizeCredential(req.body);
    uniqueReference(d, req.user.id);
    const id = transaction(db, () => {
      if (one(db, "SELECT COUNT(*) n FROM tutor_credentials WHERE tutor_id=?", req.user.id).n >= MAX_CREDENTIALS) fail(409, `Tối đa ${MAX_CREDENTIALS} mục.`);
      return Number(run(db, "INSERT INTO tutor_credentials(tutor_id,kind,catalog_id,name,detail) VALUES (?,?,?,?,?)", req.user.id, d.kind, d.catalog_id, d.name, JSON.stringify(d.detail)).lastInsertRowid);
    });
    audit(req.user.id, "credential.created", id);
    res.status(201).json(rows(db, req.user.id).find((c) => c.id === id));
  });
  app.put("/api/tutor/credentials/:id", auth("tutor"), (req, res) => {
    const c = owned(req), d = normalizeCredential(req.body);
    if (d.kind !== c.kind) fail(400, "Không đổi được loại mục. Hãy xóa và thêm mới.");
    uniqueReference(d, req.user.id);
    run(db, "UPDATE tutor_credentials SET catalog_id=?,name=?,detail=? WHERE id=?", d.catalog_id, d.name, JSON.stringify(d.detail), c.id);
    reopen(c.id);
    res.json(rows(db, req.user.id).find((r) => r.id === c.id));
  });
  app.delete("/api/tutor/credentials/:id", auth("tutor"), (req, res) => {
    const c = owned(req);
    run(db, "DELETE FROM tutor_credentials WHERE id=?", c.id);
    audit(req.user.id, "credential.deleted", c.id);
    res.json({ ok: true });
  });
  app.post("/api/tutor/credentials/:id/files", auth("tutor"), express.raw({ type: () => true, limit: PROOF_LIMIT }), async (req, res) => {
    const c = owned(req);
    if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, "Chọn một tệp minh chứng.");
    const hash = fingerprint(req.body);
    assertUnusedProof(db, hash, req.user.id);
    let data = req.body, mime = proofMime(data, req.get("Content-Type")?.split(";")[0].toLowerCase() || "");
    if (mime === "image") {
      try { data = await processPhoto(data, true); mime = "image/webp"; }
      catch { fail(400, "Ảnh không hợp lệ. Dùng JPG, PNG hoặc WebP, tối đa 5 MB."); }
    }
    if (data.length > PROOF_LIMIT) fail(413, "Tệp tối đa 5 MB.");
    let name = "minh-chung";
    try { name = decodeURIComponent(req.get("X-File-Name") || "").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 120) || name; } catch { /* keep the fallback */ }
    const id = randomUUID();
    transaction(db, () => {
      if (one(db, "SELECT COUNT(*) n FROM credential_files WHERE credential_id=?", c.id).n >= MAX_FILES) fail(409, `Tối đa ${MAX_FILES} tệp cho một mục.`);
      run(db, "INSERT INTO credential_files(id,credential_id,mime,name,size,sha256) VALUES (?,?,?,?,?,?)", id, c.id, mime, name, data.length, hash);
      for (let offset = 0, part = 0; offset < data.length; offset += 100000, part++)
        run(db, "INSERT INTO credential_file_chunks VALUES (?,?,?)", id, part, data.subarray(offset, offset + 100000));
      reopen(c.id);
    });
    res.status(201).json(rows(db, req.user.id).find((r) => r.id === c.id));
  });
  app.delete("/api/tutor/credentials/:id/files/:file", auth("tutor"), (req, res) => {
    const c = owned(req);
    if (!run(db, "DELETE FROM credential_files WHERE id=? AND credential_id=?", req.params.file, c.id).changes) fail(404, "Không tìm thấy tệp.");
    reopen(c.id);
    res.json(rows(db, req.user.id).find((r) => r.id === c.id));
  });
  // Proof files never reach the public: only their owner and administrators.
  app.get("/api/credential-files/:id", auth(), (req, res) => {
    const f = one(db, "SELECT f.*,c.tutor_id FROM credential_files f JOIN tutor_credentials c ON c.id=f.credential_id WHERE f.id=?", req.params.id);
    if (!f || (req.user.role !== "admin" && req.user.id !== f.tutor_id)) fail(404, "Tệp không có sẵn.");
    const data = Buffer.concat(all(db, "SELECT data FROM credential_file_chunks WHERE file_id=? ORDER BY part", f.id).map((c) => Buffer.from(c.data)));
    res.set("Content-Type", f.mime).set("Content-Security-Policy", "default-src 'none'; sandbox").set("Cache-Control", "private, no-store")
      .set("Content-Disposition", `inline; filename="${f.mime === "application/pdf" ? "minh-chung.pdf" : "minh-chung.webp"}"`);
    res.send(data);
  });
  app.get("/api/admin/tutors/:id/credentials", auth("admin"), (req, res) => {
    res.json(rows(db, z.coerce.number().int().positive().parse(req.params.id)));
  });
  app.get("/api/admin/credentials/pending", auth("admin"), (req, res) => {
    res.json(all(db, "SELECT c.tutor_id, COUNT(*) count FROM tutor_credentials c WHERE c.status='pending' AND EXISTS(SELECT 1 FROM credential_files f WHERE f.credential_id=c.id) GROUP BY c.tutor_id"));
  });
  app.patch("/api/admin/credentials/:id", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ status: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).default("") }).parse(req.body);
    const c = one(db, "SELECT * FROM tutor_credentials WHERE id=?", id);
    if (!c) fail(404, "Không tìm thấy mục này.");
    if (d.status === "approved" && !one(db, "SELECT 1 FROM credential_files WHERE credential_id=?", id)) fail(409, "Mục chưa có tệp minh chứng.");
    if (d.status === "rejected" && !d.note) fail(400, "Ghi lý do để gia sư biết cần bổ sung gì.");
    run(db, "UPDATE tutor_credentials SET status=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?", d.status, d.note, id);
    notify(db, c.tutor_id, `credential_${d.status}`, { subject: c.name, link: "/studio?step=proof" });
    audit(req.user.id, `credential.${d.status}`, id);
    res.json({ ok: true });
  });
}
