import { isLiveTutor } from "./tutor-visibility.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";

export const UPLOAD_LIMIT = 5 * 1024 * 1024;
export function uploadMetadata(db, tutorId) {
  const rows = all(
    db,
    "SELECT id,kind,name,size,created_at FROM tutor_uploads WHERE tutor_id=?",
    tutorId,
  );
  const photo = rows.find((r) => r.kind === "photo");
  const banner = one(db, "SELECT id FROM tutor_banners WHERE tutor_id=?", tutorId);
  return {
    photo_url: photo ? `/api/uploads/${photo.id}` : null,
    banner_url: banner ? `/api/uploads/${banner.id}` : null,
  };
}

export function saveUpload(db, tutorId, kind, data, mime, name) {
  const id = randomUUID();
  const table = kind === "banner" ? "tutor_banners" : "tutor_uploads";
  const chunks = kind === "banner" ? "banner_chunks" : "upload_chunks";
  run(
    db,
    `DELETE FROM ${table} WHERE tutor_id=? AND kind=?`,
    tutorId,
    kind,
  );
  run(
    db,
    `INSERT INTO ${table}(id,tutor_id,kind,data,mime,name,size) VALUES (?,?,?,?,?,?,?)`,
    id,
    tutorId,
    kind,
    Buffer.alloc(0),
    mime,
    name,
    data.length,
  );
  for (let offset = 0, part = 0; offset < data.length; offset += 100000, part++)
    run(
      db,
      `INSERT INTO ${chunks} VALUES (?,?,?)`,
      id,
      part,
      data.subarray(offset, offset + 100000),
    );
  return id;
}
export function registerUploads(app, db, auth, audit, processPhoto) {
  app.put(
    "/api/tutor/uploads/:kind",
    auth("tutor"),
    express.raw({ type: () => true, limit: UPLOAD_LIMIT }),
    async (req, res) => {
      const kind = req.params.kind;
      if (!["photo", "banner"].includes(kind))
        return res.status(404).json({ error: "Loại tệp không tồn tại." });
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: "Chọn một tệp để tải lên." });
      let data = req.body,
        mime,
        name;
      try {
        if (!["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type")?.split(";")[0])) throw new Error();
        data = await processPhoto(data, kind === "banner" ? "banner" : false);
        if (data.length > UPLOAD_LIMIT) throw new Error();
        mime = "image/webp";
        name = kind === "banner" ? "banner.webp" : "profile.webp";
      } catch {
        return res.status(400).json({ error: "Ảnh không hợp lệ. Dùng JPG, PNG hoặc WebP, tối đa 5 MB và 16 triệu pixel." });
      }
      // Recheck account after asynchronous decoding; a suspended session cannot publish a file.
      if (
        !one(
          db,
          "SELECT id FROM users WHERE id=? AND status='active' AND role='tutor'",
          req.user.id,
        )
      )
        return res.status(403).json({ error: "Tài khoản đã bị tạm khóa." });
      transaction(db, () => {
        saveUpload(db, req.user.id, kind, data, mime, name);
        run(
          db,
          "UPDATE tutors SET status=CASE WHEN status='rejected' THEN 'rejected' ELSE 'pending' END,published=NULL,moderation_note='',review_revision=review_revision+1 WHERE user_id=?",
          req.user.id,
        );
        audit(req.user.id, `upload.${kind}`, req.user.id);
      });
      res.json(uploadMetadata(db, req.user.id));
    },
  );
  app.delete("/api/tutor/uploads/:kind", auth("tutor"), (req, res) => {
    if (!["photo", "banner"].includes(req.params.kind))
      return res.status(404).json({ error: "Loại tệp không tồn tại." });
    run(
      db,
      `DELETE FROM ${req.params.kind === "banner" ? "tutor_banners" : "tutor_uploads"} WHERE tutor_id=? AND kind=?`,
      req.user.id,
      req.params.kind,
    );
    run(db, "UPDATE tutors SET review_revision=review_revision+1 WHERE user_id=?", req.user.id);
    audit(req.user.id, `upload.remove.${req.params.kind}`, req.user.id);
    res.json(uploadMetadata(db, req.user.id));
  });
  app.get("/api/uploads/:id", (req, res) => {
    const row = one(
      db,
      `SELECT f.*,t.status AS profile_status,t.published AS profile_published,u.status AS account_status,u.role AS account_role FROM (SELECT * FROM tutor_uploads UNION ALL SELECT * FROM tutor_banners) f JOIN tutors t ON t.user_id=f.tutor_id JOIN users u ON u.id=t.user_id WHERE f.id=?`,
      req.params.id,
    );
    if (
      !row || row.kind === "cv" ||
      !(
        (isLiveTutor({ status: row.profile_status, published: row.profile_published }) &&
          row.account_status === "active" && row.account_role === "tutor") ||
        req.user?.id === row.tutor_id ||
        req.user?.role === "admin"
      )
    )
      return res.status(404).json({ error: "Tệp không có sẵn." });
    res.set("Content-Type", row.mime);
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set(
      "Content-Disposition",
      `inline; filename="${row.kind === "banner" ? "banner.webp" : "profile.webp"}"`,
    );
    const chunks = all(
      db,
      `SELECT data FROM ${row.kind === "banner" ? "banner_chunks" : "upload_chunks"} WHERE upload_id=? ORDER BY part`,
      row.id,
    );
    res.send(
      chunks.length
        ? Buffer.concat(chunks.map((c) => Buffer.from(c.data)))
        : Buffer.from(row.data),
    );
  });
}
