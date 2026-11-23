import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { UPLOAD_LIMIT } from "./uploads.js";

const CHUNK = 100000;
const unattached = "created_at<datetime('now','-1 day') AND id NOT IN (SELECT image_id FROM news_post_images)";

// News images are kept apart from Cộng đồng images so that community cleanup never touches them.
export function registerNewsImages(app, db, auth, audit, processPhoto) {
  app.post(
    "/api/admin/news/images",
    auth("admin"),
    express.raw({ type: () => true, limit: UPLOAD_LIMIT }),
    async (req, res) => {
      let data;
      try {
        if (
          !Buffer.isBuffer(req.body) || !req.body.length ||
          !["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type")?.split(";")[0])
        ) throw new Error();
        data = await processPhoto(req.body, true);
        if (data.length > UPLOAD_LIMIT) throw new Error();
      } catch {
        return res.status(400).json({ error: "Dùng ảnh JPG, PNG hoặc WebP, tối đa 5 MB và 16 triệu pixel." });
      }
      const id = transaction(db, () => {
        // Uploads that never reached a saved post are dropped after a day.
        run(db, `DELETE FROM news_image_chunks WHERE image_id IN (SELECT id FROM news_images WHERE ${unattached})`);
        run(db, `DELETE FROM news_images WHERE ${unattached}`);
        const id = randomUUID();
        run(db, "INSERT INTO news_images(id,author_id) VALUES (?,?)", id, req.user.id);
        for (let offset = 0, part = 0; offset < data.length; offset += CHUNK, part++)
          run(db, "INSERT INTO news_image_chunks VALUES (?,?,?)", id, part, data.subarray(offset, offset + CHUNK));
        audit(req.user.id, "upload_news_image", id);
        return id;
      });
      res.status(201).json({ url: `/api/news/images/${id}` });
    },
  );
  app.get("/api/news/images/:id", (req, res) => {
    const file = one(db, "SELECT id FROM news_images WHERE id=?", req.params.id);
    const published =
      file &&
      one(
        db,
        "SELECT 1 FROM news_post_images i JOIN posts p ON p.id=i.post_id WHERE i.image_id=? AND p.published=1 LIMIT 1",
        req.params.id,
      );
    if (!file || !(published || req.user?.role === "admin"))
      return res.status(404).json({ error: "Ảnh không có sẵn." });
    res.set("Content-Type", "image/webp");
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set("Content-Disposition", 'inline; filename="news.webp"');
    // Image ids are random and their bytes never change, so a published image can be cached for good.
    res.set("Cache-Control", published ? "public, max-age=31536000, immutable" : "private, no-store");
    res.send(
      Buffer.concat(
        all(db, "SELECT data FROM news_image_chunks WHERE image_id=? ORDER BY part", req.params.id).map((c) => Buffer.from(c.data)),
      ),
    );
  });
}
