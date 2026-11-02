import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { UPLOAD_LIMIT } from "./uploads.js";

export function attachPostImages(db, post, user, images, revision = false) {
  for (const id of images) {
    if (
      !one(
        db,
        "SELECT id FROM community_images WHERE id=? AND (author_id=? OR EXISTS (SELECT 1 FROM community_post_images WHERE image_id=community_images.id AND post_id=?))",
        id,
        user,
        post,
      )
    )
      throw Object.assign(
        new Error("Ảnh không thuộc tài khoản của bạn. Hãy tải ảnh lên lại."),
        { status: 400 },
      );
  }
  run(
    db,
    "DELETE FROM community_post_images WHERE post_id=? AND revision=?",
    post,
    Number(revision),
  );
  for (const id of images)
    run(
      db,
      "INSERT INTO community_post_images VALUES (?,?,?)",
      post,
      id,
      Number(revision),
    );
}

export function registerCommunityImages(app, db, auth, processPhoto) {
  app.post(
    "/api/community/images",
    auth(),
    express.raw({ type: () => true, limit: UPLOAD_LIMIT }),
    async (req, res) => {
      if (req.user.community_locked)
        return res.status(403).json({ error: "Quyền đăng bài đang bị khóa." });
      let data;
      try {
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
        return res
          .status(400)
          .json({
            error:
              "Dùng ảnh JPG, PNG hoặc WebP, tối đa 5 MB và 16 triệu pixel.",
          });
      }
      const id = transaction(db, () => {
        if (
          !one(
            db,
            "SELECT id FROM users WHERE id=? AND status='active' AND community_locked=0",
            req.user.id,
          )
        )
          throw Object.assign(new Error("Quyền đăng bài đang bị khóa."), {
            status: 403,
          });
        // Abandoned draft uploads expire; images referenced by posts or revisions remain.
        run(
          db,
          "DELETE FROM community_images WHERE author_id=? AND created_at<datetime('now','-1 day') AND id NOT IN (SELECT image_id FROM community_post_images)",
          req.user.id,
        );
        if (
          one(
            db,
            "SELECT COUNT(*) n FROM community_images WHERE author_id=? AND created_at>=datetime('now','-1 day')",
            req.user.id,
          ).n >= 20
        )
          throw Object.assign(
            new Error("Bạn chỉ được tải 20 ảnh trong 24 giờ."),
            { status: 429 },
          );
        const id = randomUUID();
        run(
          db,
          "INSERT INTO community_images(id,author_id) VALUES (?,?)",
          id,
          req.user.id,
        );
        for (
          let offset = 0, part = 0;
          offset < data.length;
          offset += 100000, part++
        )
          run(
            db,
            "INSERT INTO community_image_chunks VALUES (?,?,?)",
            id,
            part,
            data.subarray(offset, offset + 100000),
          );
        return id;
      });
      res.status(201).json({ url: `/api/community/images/${id}` });
    },
  );
  app.get("/api/community/images/:id", (req, res) => {
    const file = one(
      db,
      "SELECT author_id FROM community_images WHERE id=?",
      req.params.id,
    );
    const publicImage =
      file &&
      one(
        db,
        `SELECT p.id FROM community_post_images i
      JOIN community_posts p ON p.id=i.post_id JOIN users u ON u.id=p.author_id
      WHERE i.image_id=? AND i.revision=0 AND p.status='approved' AND u.status='active' LIMIT 1`,
        req.params.id,
      );
    if (
      !file ||
      !(
        publicImage ||
        req.user?.id === file.author_id ||
        req.user?.role === "admin"
      )
    )
      return res.status(404).json({ error: "Ảnh không có sẵn." });
    res.set("Content-Type", "image/webp");
    res.set("Content-Security-Policy", "default-src 'none'; sandbox");
    res.set("Content-Disposition", 'inline; filename="community.webp"');
    res.send(
      Buffer.concat(
        all(
          db,
          "SELECT data FROM community_image_chunks WHERE image_id=? ORDER BY part",
          req.params.id,
        ).map((c) => Buffer.from(c.data)),
      ),
    );
  });
}
