import { randomUUID } from "node:crypto";
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { cleanPostHtml } from "./community-rich.js";

const draftSchema = z
  .object({
    title: z.string().trim().max(120).default(""),
    body_html: z.string().max(50000).default(""),
  })
  .transform((d) => ({ title: d.title, ...cleanPostHtml(d.body_html) }))
  .superRefine((d, ctx) => {
    if (d.body.length > 5000 || d.image_count > 5)
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: "Tối đa 5.000 ký tự và 5 ảnh.",
      });
  });
const versionSchema = z.number().int().positive();
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export function ownedDraft(db, user, id, version) {
  const draft = one(
    db,
    "SELECT * FROM community_drafts WHERE id=? AND author_id=?",
    id,
    user,
  );
  if (!draft) fail(404, "Không tìm thấy bản nháp.");
  if (version !== undefined && draft.version !== versionSchema.parse(version))
    fail(409, "Bản nháp đã thay đổi ở nơi khác. Hãy mở lại trước khi lưu.");
  return draft;
}
export function consumeDraft(db, user, body) {
  if (body.draft_id === undefined) return;
  const id = z.string().uuid().parse(body.draft_id);
  ownedDraft(db, user, id, versionSchema.parse(body.draft_version));
  run(db, "DELETE FROM community_drafts WHERE id=?", id);
}
export function registerCommunityDrafts(app, db, auth, participant) {
  app.get("/api/community/drafts", auth(), (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const rows = all(
      db,
      "SELECT id,title,body,version,updated_at FROM community_drafts WHERE author_id=? ORDER BY updated_at DESC,id LIMIT 21 OFFSET ?",
      req.user.id,
      (page - 1) * 20,
    );
    res.json({ items: rows.slice(0, 20), more: rows.length > 20 });
  });
  app.get("/api/community/drafts/:id", auth(), (req, res) =>
    res.json(ownedDraft(db, req.user.id, req.params.id)),
  );
  for (const method of ["post", "put"]) {
    app[method](
      "/api/community/drafts" + (method === "put" ? "/:id" : ""),
      auth(),
      participant,
      (req, res) => {
        const d = draftSchema.parse(req.body);
        const id = method === "post" ? randomUUID() : req.params.id;
        transaction(db, () => {
          if (method === "put")
            ownedDraft(
              db,
              req.user.id,
              id,
              versionSchema.parse(req.body.version),
            );
          else if (
            one(
              db,
              "SELECT COUNT(*) n FROM community_drafts WHERE author_id=?",
              req.user.id,
            ).n >= 100
          )
            fail(
              429,
              "Bạn có tối đa 100 bản nháp. Hãy xóa bản không còn dùng.",
            );
          for (const image of d.image_ids)
            if (
              !one(
                db,
                "SELECT id FROM community_images WHERE id=? AND author_id=?",
                image,
                req.user.id,
              )
            )
              fail(
                400,
                "Ảnh không thuộc tài khoản của bạn. Hãy tải ảnh lên lại.",
              );
          if (method === "post")
            run(
              db,
              "INSERT INTO community_drafts(id,author_id,title,body,body_html) VALUES (?,?,?,?,?)",
              id,
              req.user.id,
              d.title,
              d.body,
              d.body_html,
            );
          else
            run(
              db,
              "UPDATE community_drafts SET title=?,body=?,body_html=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?",
              d.title,
              d.body,
              d.body_html,
              id,
            );
          run(db, "DELETE FROM community_draft_images WHERE draft_id=?", id);
          for (const image of d.image_ids)
            run(
              db,
              "INSERT INTO community_draft_images VALUES (?,?)",
              id,
              image,
            );
        });
        res
          .status(method === "post" ? 201 : 200)
          .json(ownedDraft(db, req.user.id, id));
      },
    );
  }
  app.delete("/api/community/drafts/:id", auth(), (req, res) => {
    transaction(db, () => {
      ownedDraft(
        db,
        req.user.id,
        req.params.id,
        versionSchema.parse(req.body.version),
      );
      run(db, "DELETE FROM community_drafts WHERE id=?", req.params.id);
    });
    res.json({ ok: true });
  });
}
