import express from "express";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";

export const UPLOAD_LIMIT = 5 * 1024 * 1024;
export function uploadMetadata(db, tutorId) {
  const rows = all(
    db,
    "SELECT id,kind,name,size,created_at FROM tutor_uploads WHERE tutor_id=?",
    tutorId,
  );
  const photo = rows.find((r) => r.kind === "photo"),
    cv = rows.find((r) => r.kind === "cv");
  return {
    photo_url: photo ? `/api/uploads/${photo.id}` : null,
    cv: cv
      ? {
          name: cv.name,
          size: cv.size,
          url: `/api/uploads/${cv.id}`,
          uploaded_at: cv.created_at,
        }
      : null,
  };
}
export function saveUpload(db, tutorId, kind, data, mime, name) {
  const id = randomUUID();
  run(
    db,
    "DELETE FROM tutor_uploads WHERE tutor_id=? AND kind=?",
    tutorId,
    kind,
  );
  run(
    db,
    "INSERT INTO tutor_uploads(id,tutor_id,kind,data,mime,name,size) VALUES (?,?,?,?,?,?,?)",
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
      "INSERT INTO upload_chunks VALUES (?,?,?)",
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
      if (!["photo", "cv"].includes(kind))
        return res.status(404).json({ error: "Loại tệp không tồn tại." });
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: "Chọn một tệp để tải lên." });
      let data = req.body,
        mime,
        name;
      try {
        name = decodeURIComponent(req.get("X-File-Name") || "")
          .replace(/[\x00-\x1f\x7f/\\]/g, "")
          .trim()
          .slice(0, 120);
        if (kind === "photo") {
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(
              req.get("Content-Type")?.split(";")[0],
            )
          )
            throw new Error();
          data = await processPhoto(data);
          mime = "image/webp";
          name = "profile.webp";
        } else {
          if (
            req.get("Content-Type") !== "application/pdf" ||
            data.subarray(0, 5).toString() !== "%PDF-"
          )
            throw new Error();
          const pdf = await PDFDocument.load(data, {
            throwOnInvalidObject: true,
          });
          if (
            pdf.isEncrypted ||
            pdf.getPageCount() < 1 ||
            pdf.getPageCount() > 20
          )
            throw new Error();
          mime = "application/pdf";
          name = (name || "CV.pdf").replace(/\.pdf$/i, "") + ".pdf";
        }
      } catch {
        return res.status(400).json({
          error:
            kind === "photo"
              ? "Ảnh không hợp lệ. Dùng JPG, PNG hoặc WebP, tối đa 16 triệu pixel."
              : "CV phải là PDF hợp lệ, không khóa mật khẩu, từ 1–20 trang.",
        });
      }
      // Recheck account after asynchronous decoding; a suspended session cannot publish a file.
      if (
        !one(
          db,
          "SELECT id FROM users WHERE id=? AND status='active'",
          req.user.id,
        )
      )
        return res.status(403).json({ error: "Tài khoản đã bị tạm khóa." });
      transaction(db, () => {
        saveUpload(db, req.user.id, kind, data, mime, name);
        run(
          db,
          "UPDATE tutors SET status='pending',moderation_note='' WHERE user_id=?",
          req.user.id,
        );
        audit(req.user.id, `upload.${kind}`, req.user.id);
      });
      res.json(uploadMetadata(db, req.user.id));
    },
  );
  app.delete("/api/tutor/uploads/:kind", auth("tutor"), (req, res) => {
    if (!["photo", "cv"].includes(req.params.kind))
      return res.status(404).json({ error: "Loại tệp không tồn tại." });
    run(
      db,
      "DELETE FROM tutor_uploads WHERE tutor_id=? AND kind=?",
      req.user.id,
      req.params.kind,
    );
    audit(req.user.id, `upload.remove.${req.params.kind}`, req.user.id);
    res.json(uploadMetadata(db, req.user.id));
  });
  app.get("/api/uploads/:id", (req, res) => {
    const row = one(
      db,
      `SELECT f.*,t.status AS profile_status,u.status AS account_status FROM tutor_uploads f JOIN tutors t ON t.user_id=f.tutor_id JOIN users u ON u.id=t.user_id WHERE f.id=?`,
      req.params.id,
    );
    if (
      !row ||
      !(
        (row.profile_status === "approved" &&
          row.account_status === "active") ||
        req.user?.id === row.tutor_id ||
        req.user?.role === "admin"
      )
    )
      return res.status(404).json({ error: "Tệp không có sẵn." });
    res.set("Content-Type", row.mime);
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set(
      "Content-Disposition",
      `${row.kind === "cv" ? "attachment" : "inline"}; filename="${row.kind === "cv" ? "CV.pdf" : "profile.webp"}"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/'/g, "%27")}`,
    );
    const chunks = all(
      db,
      "SELECT data FROM upload_chunks WHERE upload_id=? ORDER BY part",
      row.id,
    );
    res.send(
      chunks.length
        ? Buffer.concat(chunks.map((c) => Buffer.from(c.data)))
        : Buffer.from(row.data),
    );
  });
}
