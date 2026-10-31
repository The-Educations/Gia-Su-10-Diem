import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
import { UPLOAD_LIMIT } from "./uploads.js";

const captionSchema = z.string().trim().max(500);
const MAX_IMAGES = 12;
export const galleryMetadata = (db, tutorId) =>
  all(
    db,
    "SELECT id,caption,created_at FROM tutor_gallery WHERE tutor_id=? ORDER BY created_at DESC,rowid DESC",
    tutorId,
  ).map((image) => ({ ...image, url: `/api/gallery/${image.id}` }));

export function registerGallery(app, db, auth, audit, processPhoto) {
  const pending = (id) =>
    run(
      db,
      "UPDATE tutors SET status='pending',moderation_note='' WHERE user_id=?",
      id,
    );
  app.post(
    "/api/tutor/gallery",
    auth("tutor"),
    express.raw({ type: () => true, limit: UPLOAD_LIMIT }),
    async (req, res) => {
      let caption, data;
      try {
        caption = captionSchema.parse(
          decodeURIComponent(req.get("X-Caption") || ""),
        );
        if (
          !Buffer.isBuffer(req.body) ||
          !req.body.length ||
          !["image/jpeg", "image/png", "image/webp"].includes(
            req.get("Content-Type")?.split(";")[0],
          )
        )
          throw new Error();
        data = await processPhoto(req.body, true);
        if (data.length > UPLOAD_LIMIT) throw new Error();
      } catch {
        return res.status(400).json({
          error:
            "Dùng ảnh JPG, PNG hoặc WebP tối đa 5 MB, 16 triệu pixel; chú thích tối đa 500 ký tự.",
        });
      }
      // Decode outside the transaction; recheck ownership state and quota before writing.
      const result = transaction(db, () => {
        if (
          !one(
            db,
            "SELECT id FROM users WHERE id=? AND status='active'",
            req.user.id,
          )
        )
          return { status: 403, error: "Tài khoản đã bị tạm khóa." };
        if (
          one(
            db,
            "SELECT COUNT(*) AS count FROM tutor_gallery WHERE tutor_id=?",
            req.user.id,
          ).count >= MAX_IMAGES
        )
          return {
            status: 409,
            error: "Thư viện tối đa 12 ảnh. Xóa một ảnh trước khi thêm.",
          };
        const id = randomUUID();
        run(
          db,
          "INSERT INTO tutor_gallery(id,tutor_id,caption) VALUES (?,?,?)",
          id,
          req.user.id,
          caption,
        );
        for (
          let offset = 0, part = 0;
          offset < data.length;
          offset += 100000, part++
        )
          run(
            db,
            "INSERT INTO gallery_chunks VALUES (?,?,?)",
            id,
            part,
            data.subarray(offset, offset + 100000),
          );
        pending(req.user.id);
        audit(req.user.id, "gallery.add", id);
        return { status: 201, gallery: galleryMetadata(db, req.user.id) };
      });
      res
        .status(result.status)
        .json(result.error ? { error: result.error } : result.gallery);
    },
  );
  app.patch("/api/tutor/gallery/:id", auth("tutor"), (req, res) => {
    const { caption } = z.object({ caption: captionSchema }).parse(req.body);
    if (
      !one(
        db,
        "SELECT id FROM tutor_gallery WHERE id=? AND tutor_id=?",
        req.params.id,
        req.user.id,
      )
    )
      return res.status(404).json({ error: "Không tìm thấy ảnh." });
    transaction(db, () => {
      run(
        db,
        "UPDATE tutor_gallery SET caption=? WHERE id=? AND tutor_id=?",
        caption,
        req.params.id,
        req.user.id,
      );
      pending(req.user.id);
      audit(req.user.id, "gallery.caption", req.params.id);
    });
    res.json(galleryMetadata(db, req.user.id));
  });
  app.delete("/api/tutor/gallery/:id", auth("tutor"), (req, res) => {
    const result = run(
      db,
      "DELETE FROM tutor_gallery WHERE id=? AND tutor_id=?",
      req.params.id,
      req.user.id,
    );
    if (!result.changes)
      return res.status(404).json({ error: "Không tìm thấy ảnh." });
    audit(req.user.id, "gallery.remove", req.params.id);
    res.json(galleryMetadata(db, req.user.id));
  });
  const visible = (req, res, publicOnly = false) => {
    const image = one(
      db,
      "SELECT g.tutor_id,t.status,u.status AS account_status FROM tutor_gallery g JOIN tutors t ON t.user_id=g.tutor_id JOIN users u ON u.id=g.tutor_id WHERE g.id=?",
      req.params.id,
    );
    const published =
      image?.status === "approved" && image?.account_status === "active";
    if (
      !image ||
      !(
        published ||
        (!publicOnly &&
          (req.user?.id === image.tutor_id || req.user?.role === "admin"))
      )
    ) {
      res.status(404).json({ error: "Ảnh không có sẵn." });
      return null;
    }
    return { ...image, published };
  };
  app.get("/api/gallery/:id/social", (req, res) => {
    const image = visible(req, res);
    if (!image) return;
    const before = req.query.before
      ? z.coerce.number().int().positive().parse(req.query.before)
      : Number.MAX_SAFE_INTEGER;
    const comments = all(
      db,
      "SELECT c.id,c.student_id,c.body,c.created_at,u.name FROM gallery_comments c JOIN users u ON u.id=c.student_id WHERE c.image_id=? AND c.id<? ORDER BY c.id DESC LIMIT 21",
      req.params.id,
      before,
    );
    const more = comments.length > 20;
    if (more) comments.pop();
    res.json({
      likes: one(
        db,
        "SELECT COUNT(*) AS count FROM gallery_likes WHERE image_id=?",
        req.params.id,
      ).count,
      liked: !!one(
        db,
        "SELECT 1 FROM gallery_likes WHERE image_id=? AND student_id=?",
        req.params.id,
        req.user?.id || 0,
      ),
      comment_count: one(
        db,
        "SELECT COUNT(*) AS count FROM gallery_comments WHERE image_id=?",
        req.params.id,
      ).count,
      can_interact: image.published && req.user?.role === "student",
      can_moderate:
        req.user?.id === image.tutor_id || req.user?.role === "admin",
      comments,
      next: more ? comments.at(-1).id : null,
    });
  });
  app.put("/api/gallery/:id/like", auth("student"), (req, res) => {
    if (!visible(req, res, true)) return;
    run(
      db,
      "INSERT OR IGNORE INTO gallery_likes(image_id,student_id) VALUES (?,?)",
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.delete("/api/gallery/:id/like", auth("student"), (req, res) => {
    if (!visible(req, res, true)) return;
    run(
      db,
      "DELETE FROM gallery_likes WHERE image_id=? AND student_id=?",
      req.params.id,
      req.user.id,
    );
    res.json({ ok: true });
  });
  app.post("/api/gallery/:id/comments", auth("student"), (req, res) => {
    if (!visible(req, res, true)) return;
    const { body } = z.object({ body: text(1000) }).parse(req.body);
    const recent = one(
      db,
      "SELECT COUNT(*) AS count FROM gallery_comments WHERE student_id=? AND created_at > datetime('now','-1 minute')",
      req.user.id,
    ).count;
    if (recent >= 5)
      return res
        .status(429)
        .json({ error: "Bạn bình luận quá nhanh. Thử lại sau một phút." });
    run(
      db,
      "INSERT INTO gallery_comments(image_id,student_id,body) VALUES (?,?,?)",
      req.params.id,
      req.user.id,
      body,
    );
    res.status(201).json({ ok: true });
  });
  app.delete("/api/gallery/:id/comments/:commentId", auth(), (req, res) => {
    const image = visible(req, res);
    if (!image) return;
    const comment = one(
      db,
      "SELECT student_id FROM gallery_comments WHERE id=? AND image_id=?",
      req.params.commentId,
      req.params.id,
    );
    if (
      !comment ||
      !(
        comment.student_id === req.user.id ||
        image.tutor_id === req.user.id ||
        req.user.role === "admin"
      )
    )
      return res.status(404).json({ error: "Không tìm thấy bình luận." });
    transaction(db, () => {
      run(
        db,
        "DELETE FROM gallery_comments WHERE id=? AND image_id=?",
        req.params.commentId,
        req.params.id,
      );
      audit(req.user.id, "gallery.comment.remove", req.params.commentId);
    });
    res.json({ ok: true });
  });
  app.get("/api/gallery/:id", (req, res) => {
    if (!visible(req, res)) return;
    const chunks = all(
      db,
      "SELECT data FROM gallery_chunks WHERE image_id=? ORDER BY part",
      req.params.id,
    );
    res.set("Content-Type", "image/webp");
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set("Content-Disposition", 'inline; filename="gallery.webp"');
    res.send(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data))));
  });
}
