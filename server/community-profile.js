import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { LIMITS } from "./community-policy.js";
import { UPLOAD_LIMIT } from "./uploads.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function memberByCode(db, code, viewer) {
  const user = one(db, "SELECT u.*,t.status tutor_status FROM users u LEFT JOIN tutors t ON t.user_id=u.id WHERE u.profile_code=?", code);
  if (!user || (user.status !== "active" && viewer?.role !== "admin"))
    fail(404, "Không tìm thấy hồ sơ.");
  return user;
}
export function editableMember(db, id) {
  const user = one(db, "SELECT * FROM users WHERE id=?", id);
  if (!user || user.status !== "active" || user.community_locked)
    fail(403, "Quyền chỉnh sửa hồ sơ cộng đồng đang bị khóa.");
  return user;
}
function recordChange(db, user, kind, limit) {
  if (one(db, "SELECT COUNT(*) n FROM community_profile_changes WHERE user_id=? AND kind=? AND created_at>=datetime('now','-24 hours')", user, kind).n >= limit)
    fail(429, `Bạn chỉ được thay đổi mục này ${limit} lần trong 24 giờ.`);
  run(db, "DELETE FROM community_profile_changes WHERE user_id=? AND created_at<datetime('now','-24 hours')", user);
  run(db, "INSERT INTO community_profile_changes(user_id,kind) VALUES (?,?)", user, kind);
}
export function removeMemberImage(db, user, kind) {
  run(db, "DELETE FROM user_image_chunks WHERE image_id IN (SELECT id FROM user_images WHERE user_id=? AND kind=?)", user, kind);
  run(db, "DELETE FROM user_images WHERE user_id=? AND kind=?", user, kind);
}
export function registerCommunityProfile(app, db, auth, audit, processPhoto, { serialize }) {
  const base = "/api/community";
  for (const kind of ["avatar", "cover"]) {
    app.get(`${base}/members/:code/${kind}`, auth(), (req, res) => {
      const user = memberByCode(db, req.params.code, req.user);
      const image = one(db, "SELECT id FROM user_images WHERE user_id=? AND kind=?", user.id, kind);
      if (!image) fail(404, "Ảnh không có sẵn.");
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Type", "image/webp");
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
      res.set("Content-Disposition", `inline; filename="${kind}.webp"`);
      res.send(Buffer.concat(all(db, "SELECT data FROM user_image_chunks WHERE image_id=? ORDER BY idx", image.id).map(c => Buffer.from(c.data))));
    });
    app.put(`${base}/me/${kind}`, auth(), express.raw({ type: () => true, limit: UPLOAD_LIMIT }), async (req, res) => {
      editableMember(db, req.user.id);
      let data;
      try {
        if (!Buffer.isBuffer(req.body) || !req.body.length || !["image/jpeg", "image/png", "image/webp"].includes(req.get("Content-Type")?.split(";")[0])) throw new Error();
        data = await processPhoto(req.body, kind === "cover" ? "banner" : false);
        if (data.length > UPLOAD_LIMIT) throw new Error();
      } catch {
        return res.status(400).json({ error: "Dùng ảnh JPG, PNG hoặc WebP, tối đa 5 MB và 16 triệu pixel." });
      }
      const id = transaction(db, () => {
        editableMember(db, req.user.id);
        recordChange(db, req.user.id, kind, kind === "avatar" ? LIMITS.avatarsPerDay : LIMITS.coversPerDay);
        removeMemberImage(db, req.user.id, kind);
        const id = randomUUID();
        run(db, "INSERT INTO user_images(id,user_id,kind,content_type,size) VALUES (?,?,?,'image/webp',?)", id, req.user.id, kind, data.length);
        for (let offset = 0, idx = 0; offset < data.length; offset += 100000, idx++)
          run(db, "INSERT INTO user_image_chunks VALUES (?,?,?)", id, idx, data.subarray(offset, offset + 100000));
        return id;
      });
      res.json({ image_version: id });
    });
    app.delete(`${base}/me/${kind}`, auth(), (req, res) => {
      transaction(db, () => {
        editableMember(db, req.user.id);
        removeMemberImage(db, req.user.id, kind);
      });
      res.json({ ok: true });
    });
  }
}
