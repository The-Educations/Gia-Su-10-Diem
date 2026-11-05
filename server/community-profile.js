import { liveTutorSql } from "./tutor-visibility.js";
import express from "express";
import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
import {
  LIMITS,
  authorLabel,
  displayNameSchema,
  findContactInfo,
} from "./community-policy.js";
import { UPLOAD_LIMIT } from "./uploads.js";

const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function memberByCode(db, code, viewer) {
  const user = one(
    db,
    `SELECT u.*,CASE WHEN ${liveTutorSql("t")} THEN 'approved' ELSE t.status END tutor_status FROM users u LEFT JOIN tutors t ON t.user_id=u.id WHERE u.profile_code=?`,
    code,
  );
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
  if (
    one(
      db,
      "SELECT COUNT(*) n FROM community_profile_changes WHERE user_id=? AND kind=? AND created_at>=datetime('now','-24 hours')",
      user,
      kind,
    ).n >= limit
  )
    fail(429, `Bạn chỉ được thay đổi mục này ${limit} lần trong 24 giờ.`);
  run(
    db,
    "DELETE FROM community_profile_changes WHERE user_id=? AND created_at<datetime('now','-24 hours')",
    user,
  );
  run(
    db,
    "INSERT INTO community_profile_changes(user_id,kind) VALUES (?,?)",
    user,
    kind,
  );
}
export function removeMemberImage(db, user, kind) {
  run(
    db,
    "DELETE FROM user_image_chunks WHERE image_id IN (SELECT id FROM user_images WHERE user_id=? AND kind=?)",
    user,
    kind,
  );
  run(db, "DELETE FROM user_images WHERE user_id=? AND kind=?", user, kind);
}
export function setMemberProfile(db, id, input) {
  const data = z
    .object({
      display_name: displayNameSchema.optional(),
      bio: z
        .string()
        .trim()
        .max(300)
        .refine(
          (value) => value.split("\n").length <= 5,
          "Giới thiệu tối đa 5 dòng.",
        )
        .superRefine((value, ctx) => {
          const contact = findContactInfo(value);
          if (contact)
            ctx.addIssue({
              code: "custom",
              message: `Vui lòng không đăng ${contact}.`,
            });
        })
        .optional(),
    })
    .strict()
    .parse(input);
  const user = editableMember(db, id);
  for (const field of ["display_name", "bio"]) {
    if (data[field] !== undefined && data[field] !== user[field]) {
      recordChange(
        db,
        id,
        field,
        field === "display_name" ? LIMITS.namesPerDay : LIMITS.biosPerDay,
      );
      run(db, `UPDATE users SET ${field}=? WHERE id=?`, data[field], id);
    }
  }
  return {
    display_name: data.display_name ?? user.display_name,
    bio: data.bio ?? user.bio,
  };
}
function memberImages(db, user) {
  const images = all(
    db,
    "SELECT kind,id FROM user_images WHERE user_id=? ORDER BY kind",
    user,
  );
  return {
    has_avatar: images.some((i) => i.kind === "avatar"),
    has_cover: images.some((i) => i.kind === "cover"),
    image_version: images.map((i) => i.id).join("-"),
  };
}
export function registerCommunityProfile(
  app,
  db,
  auth,
  audit,
  processPhoto,
  { serialize, mail },
) {
  const base = "/api/community";
  app.get(`${base}/members/:code`, auth(), (req, res) => {
    const user = memberByCode(db, req.params.code, req.user);
    const images = memberImages(db, user.id);
    const posts = one(
      db,
      "SELECT COUNT(*) n FROM community_posts WHERE author_id=? AND status='approved' AND kind=?",
      user.id,
      user.role === "admin" ? "announcement" : "user",
    ).n;
    const stats = one(
      db,
      `SELECT COUNT(*) comments,COALESCE(SUM((SELECT COUNT(*) FROM community_helpful h JOIN users hu ON hu.id=h.user_id WHERE h.comment_id=c.id AND hu.status='active')),0) helpful
      FROM community_comments c JOIN community_posts p ON p.id=c.post_id JOIN users pu ON pu.id=p.author_id
      WHERE c.author_id=? AND c.status='visible' AND p.status='approved' AND pu.status='active'`,
      user.id,
    );
    const mine = req.user.id === user.id;
    res.json({
      profile: {
        code: user.profile_code,
        ...authorLabel({ ...user, ...images }, req.user),
        ...images,
        bio: user.bio,
        joined_at: user.created_at.slice(0, 7),
        stats:
          user.status === "active"
            ? { posts, ...stats }
            : { posts: 0, comments: 0, helpful: 0 },
        mine,
        ...(mine ? { display_name: user.display_name } : {}),
      },
      ...(req.user.role === "admin"
        ? {
            admin: {
              id: user.id,
              name: user.name,
              email: user.email,
              status: user.status,
              community_locked: !!user.community_locked,
              community_lock_reason: user.community_lock_reason,
            },
          }
        : {}),
    });
  });
  app.get(`${base}/members/:code/posts`, auth(), (req, res) => {
    const user = memberByCode(db, req.params.code, req.user);
    const { page, sort } = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        sort: z.enum(["new", "helpful"]).default("new"),
      })
      .parse(req.query);
    if (user.status !== "active") return res.json({ items: [], more: false });
    const helpful = `(SELECT COUNT(*) FROM community_helpful h JOIN community_comments c ON c.id=h.comment_id JOIN users cu ON cu.id=c.author_id JOIN users hu ON hu.id=h.user_id WHERE c.post_id=p.id AND c.status='visible' AND cu.status='active' AND hu.status='active')`;
    const rows = all(
      db,
      `SELECT p.* FROM community_posts p WHERE p.author_id=? AND p.status='approved' AND p.kind=? ORDER BY ${sort === "helpful" ? helpful + " DESC," : ""} p.published_at DESC,p.id DESC LIMIT 11 OFFSET ?`,
      user.id,
      user.role === "admin" ? "announcement" : "user",
      (page - 1) * 10,
    );
    res.json({
      items: rows.slice(0, 10).map((p) => serialize(p, req.user, true)),
      more: rows.length > 10,
    });
  });
  app.put(`${base}/me/profile`, auth(), (req, res) => {
    res.json(
      transaction(db, () => setMemberProfile(db, req.user.id, req.body)),
    );
  });
  app.delete(
    "/api/admin/community/members/:code/:part",
    auth("admin"),
    async (req, res) => {
      const part = z.enum(["avatar", "cover", "bio"]).parse(req.params.part);
      const note = text(1000).parse(req.body.note);
      const mailId = transaction(db, () => {
        const user = memberByCode(db, req.params.code, req.user);
        if (part === "bio") {
          if (!user.bio) fail(409, "Giới thiệu đã được xóa.");
          run(db, "UPDATE users SET bio='' WHERE id=?", user.id);
        } else {
          if (
            !one(
              db,
              "SELECT id FROM user_images WHERE user_id=? AND kind=?",
              user.id,
              part,
            )
          )
            fail(409, "Ảnh đã được gỡ.");
          removeMemberImage(db, user.id, part);
        }
        const label = {
          avatar: "Ảnh đại diện",
          cover: "Ảnh bìa",
          bio: "Giới thiệu",
        }[part];
        run(
          db,
          "INSERT INTO community_notifications(user_id,kind,detail) VALUES (?,'profile_removed',?)",
          user.id,
          `${label} đã được gỡ: ${note}`,
        );
        audit(
          req.user.id,
          "community.profile.remove",
          JSON.stringify({ id: user.id, part, note }),
        );
        return mail.enqueue(user.id, `${label} trong hồ sơ đã được gỡ.`, note, `/app/community/members/${user.profile_code}`);
      });
      res.json({ ok: true, ...await mail.deliver(mailId, req.user.id) });
    },
  );
  for (const kind of ["avatar", "cover"]) {
    app.get(`${base}/members/:code/${kind}`, auth(), (req, res) => {
      const user = memberByCode(db, req.params.code, req.user);
      const image = one(
        db,
        "SELECT id FROM user_images WHERE user_id=? AND kind=?",
        user.id,
        kind,
      );
      if (!image) fail(404, "Ảnh không có sẵn.");
      res.set("Cache-Control", "private, no-store");
      res.set("Content-Type", "image/webp");
      res.set("Content-Security-Policy", "default-src 'none'; sandbox");
      res.set("Content-Disposition", `inline; filename="${kind}.webp"`);
      res.send(
        Buffer.concat(
          all(
            db,
            "SELECT data FROM user_image_chunks WHERE image_id=? ORDER BY idx",
            image.id,
          ).map((c) => Buffer.from(c.data)),
        ),
      );
    });
    app.put(
      `${base}/me/${kind}`,
      auth(),
      express.raw({ type: () => true, limit: UPLOAD_LIMIT }),
      async (req, res) => {
        editableMember(db, req.user.id);
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
          data = await processPhoto(
            req.body,
            kind === "cover" ? "banner" : false,
          );
          if (data.length > UPLOAD_LIMIT) throw new Error();
        } catch {
          return res.status(400).json({
            error:
              "Dùng ảnh JPG, PNG hoặc WebP, tối đa 5 MB và 16 triệu pixel.",
          });
        }
        const id = transaction(db, () => {
          editableMember(db, req.user.id);
          recordChange(
            db,
            req.user.id,
            kind,
            kind === "avatar" ? LIMITS.avatarsPerDay : LIMITS.coversPerDay,
          );
          removeMemberImage(db, req.user.id, kind);
          const id = randomUUID();
          run(
            db,
            "INSERT INTO user_images(id,user_id,kind,content_type,size) VALUES (?,?,?,'image/webp',?)",
            id,
            req.user.id,
            kind,
            data.length,
          );
          for (
            let offset = 0, idx = 0;
            offset < data.length;
            offset += 100000, idx++
          )
            run(
              db,
              "INSERT INTO user_image_chunks VALUES (?,?,?)",
              id,
              idx,
              data.subarray(offset, offset + 100000),
            );
          return id;
        });
        res.json({ image_version: id });
      },
    );
    app.delete(`${base}/me/${kind}`, auth(), (req, res) => {
      transaction(db, () => {
        editableMember(db, req.user.id);
        removeMemberImage(db, req.user.id, kind);
      });
      res.json({ ok: true });
    });
  }
}
