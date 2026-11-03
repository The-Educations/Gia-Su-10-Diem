import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
import { attachPostImages } from "./community-images.js";
import { postSchema, fold } from "./community-policy.js";

export function registerCommunityAdmin(
  app,
  db,
  auth,
  audit,
  { fail, getPost, serialize, notify, follow, rules, removeComment, mail },
) {
  const base = "/api/admin/community";
  const admin = auth("admin");
  const privatePost = (p) => ({
    ...p,
    owner: one(
      db,
      "SELECT id,name,email,community_locked,community_lock_reason FROM users WHERE id=?",
      p.author_id,
    ),
  });
  app.get(`${base}/summary`, admin, (_req, res) =>
    res.json({
      ...one(
        db,
        `SELECT
        COUNT(CASE WHEN status='pending' OR (status='approved' AND revision_status='pending') THEN 1 END) pending,
        COUNT(CASE WHEN status='approved' THEN 1 END) approved,
        COUNT(CASE WHEN status='hidden' THEN 1 END) hidden
        FROM community_posts WHERE kind!='rules'`,
      ),
      reports: one(
        db,
        "SELECT COUNT(*) total FROM community_reports WHERE status='open'",
      ).total,
    }),
  );
  app.get(`${base}/queue`, admin, (_req, res) =>
    res.json(
      all(
        db,
        "SELECT * FROM community_posts WHERE status='pending' OR (status='approved' AND revision_status='pending') ORDER BY submitted_at,id",
      ).map(privatePost),
    ),
  );
  app.get(`${base}/posts`, admin, (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const status = z
      .enum(["approved", "hidden", "deleted"])
      .default("approved")
      .parse(req.query.status);
    const rows = all(
      db,
      "SELECT * FROM community_posts WHERE status=? AND kind!='rules' ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET ?",
      status,
      (page - 1) * 20,
    );
    res.json({
      items: rows.slice(0, 20).map(privatePost),
      more: rows.length > 20,
    });
  });
  app.get(`${base}/rules`, admin, (req, res) => res.json(rules(req.user)));
  for (const action of ["approve", "reject", "hide", "restore"])
    app.post(`${base}/posts/:id/${action}`, admin, async (req, res) => {
      const p = getPost(req.params.id, req.user);
      if (p.kind === "rules") fail(409, "Sửa Quy tắc bằng biểu mẫu riêng.");
      const note = ["reject", "hide"].includes(action)
        ? text(1000).parse(req.body.note)
        : "";
      if (["approve", "reject"].includes(action)) {
        const version = z
          .number()
          .int()
          .nonnegative()
          .parse(req.body.expected_version);
        if (version !== p.review_version)
          fail(
            409,
            "Bài đã thay đổi. Đóng hộp thoại và tải lại hàng đợi trước khi duyệt.",
          );
      }
      const revision =
        p.status === "approved" && p.revision_status === "pending";
      if (
        ["approve", "reject"].includes(action) &&
        !(p.status === "pending" || revision)
      )
        fail(409, "Bài không còn chờ duyệt.");
      if (
        (action === "hide" && p.status !== "approved") ||
        (action === "restore" && p.status !== "hidden")
      )
        fail(409, "Trạng thái bài không phù hợp.");
      const mailId = transaction(db, () => {
        if (revision && action === "approve") {
          run(
            db,
            "DELETE FROM community_post_images WHERE post_id=? AND revision=0",
            p.id,
          );
          run(
            db,
            "UPDATE community_post_images SET revision=0 WHERE post_id=? AND revision=1",
            p.id,
          );
          run(
            db,
            "UPDATE community_posts SET title=revision_title,body=revision_body,body_html=revision_body_html,revision_body_html='',search_text=?,revision_title=NULL,revision_body=NULL,revision_status=NULL,revision_note='',reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            fold(p.revision_title + " " + p.revision_body),
            req.user.id,
            p.id,
          );
        } else if (revision && action === "reject")
          run(
            db,
            "UPDATE community_posts SET revision_status='rejected',revision_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",
            note,
            req.user.id,
            p.id,
          );
        else
          run(
            db,
            "UPDATE community_posts SET status=?,review_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,published_at=CASE WHEN ?='approve' THEN CURRENT_TIMESTAMP ELSE published_at END WHERE id=?",
            {
              approve: "approved",
              reject: "rejected",
              hide: "hidden",
              restore: "approved",
            }[action],
            note,
            req.user.id,
            action,
            p.id,
          );
        if (action !== "restore")
          notify(
            p.author_id,
            `${revision && ["approve", "reject"].includes(action) ? "revision" : "post"}_${{ approve: "approved", reject: "rejected", hide: "hidden" }[action]}`,
            p.id,
          );
        audit(
          req.user.id,
          `community.${revision && ["approve", "reject"].includes(action) ? "revision" : "post"}.${action}`,
          JSON.stringify({ id: p.id, note }),
        );
        if (action === "hide" || action === "reject") return mail.enqueue(p.author_id, `${revision && action === "reject" ? "Bản sửa bài viết" : "Bài viết"} “${revision && action === "reject" ? p.revision_title : p.title}” ${action === "hide" ? "đã bị ẩn" : "chưa được duyệt"}.`, note, "/app/community/mine");
      });
      res.json({ ok: true, ...(mailId ? await mail.deliver(mailId, req.user.id) : {}) });
    });
  app.post(`${base}/posts`, admin, (req, res) => {
    const d = postSchema.parse(req.body);
    const id = transaction(db, () => {
      const id = Number(
        run(
          db,
          "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?,'announcement','approved',?,?,?,CURRENT_TIMESTAMP)",
          req.user.id,
          d.title,
          d.body,
          fold(d.title + " " + d.body),
        ).lastInsertRowid,
      );
      run(
        db,
        "UPDATE community_posts SET body_html=? WHERE id=?",
        d.body_html,
        id,
      );
      attachPostImages(db, id, req.user.id, d.image_ids);
      follow(id, req.user.id);
      audit(req.user.id, "community.announcement.create", id);
      return id;
    });
    res.status(201).json(serialize(getPost(id, req.user), req.user));
  });
  app.put(`${base}/rules`, admin, (req, res) => {
    const d = postSchema.parse(req.body);
    transaction(db, () => {
      const p = one(db, "SELECT id FROM community_posts WHERE kind='rules'");
      if (p)
        run(
          db,
          "UPDATE community_posts SET title=?,body=?,search_text=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.title,
          d.body,
          fold(d.title + " " + d.body),
          p.id,
        );
      else
        run(
          db,
          "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?,'rules','approved',?,?,?,CURRENT_TIMESTAMP)",
          req.user.id,
          d.title,
          d.body,
          fold(d.title + " " + d.body),
        );
      const saved = one(
        db,
        "SELECT id FROM community_posts WHERE kind='rules'",
      );
      run(
        db,
        "UPDATE community_posts SET body_html=? WHERE id=?",
        d.body_html,
        saved.id,
      );
      attachPostImages(db, saved.id, req.user.id, d.image_ids);
      audit(req.user.id, "community.rules.update", "rules");
    });
    res.json({ ok: true });
  });
  app.delete(`${base}/comments/:id`, admin, async (req, res) => {
    const note = text(1000).parse(req.body.note);
    const c = one(
      db,
      "SELECT * FROM community_comments WHERE id=?",
      req.params.id,
    );
    if (!c || c.status !== "visible") fail(404, "Không tìm thấy bình luận.");
    const mailId = transaction(db, () => {
      removeComment(c.id, "removed_by_admin", note);
      audit(
        req.user.id,
        "community.comment.remove",
        JSON.stringify({ id: c.id, note }),
      );
      const post = one(db, "SELECT title FROM community_posts WHERE id=?", c.post_id);
      return mail.enqueue(c.author_id, `Bình luận trong bài “${post.title}” đã được gỡ: “${c.body.slice(0, 300)}”`, note, `/app/community/${c.post_id}`);
    });
    res.json({ ok: true, ...await mail.deliver(mailId, req.user.id) });
  });
  app.get(`${base}/reports`, admin, (req, res) => {
    const status = z
      .enum(["open", "resolved"])
      .default("open")
      .parse(req.query.status);
    res.json(
      all(
        db,
        `SELECT r.*,(SELECT COUNT(*) FROM community_reports x WHERE x.target_type=r.target_type AND x.target_id=r.target_id AND x.part=r.part AND x.status='open') report_count FROM community_reports r WHERE r.status=? ORDER BY report_count DESC,r.id LIMIT 100`,
        status,
      ).map((r) => {
        if (r.target_type === "profile") {
          const user = one(db, "SELECT id,name,email,status,profile_code,bio,community_locked,community_lock_reason FROM users WHERE id=?", r.target_id);
          const images = user ? all(db, "SELECT kind,id FROM user_images WHERE user_id=? ORDER BY kind", user.id) : [];
          return { ...r, owner: user, target: user ? {
            profile_code: user.profile_code, body: user.bio, status: user.status,
            has_avatar: images.some(i => i.kind === "avatar"), has_cover: images.some(i => i.kind === "cover"), image_version: images.map(i => i.id).join("-"),
          } : null };
        }
        const target = one(
          db,
          `SELECT * FROM ${r.target_type === "post" ? "community_posts" : "community_comments"} WHERE id=?`,
          r.target_id,
        );
        return {
          ...r,
          target,
          owner: target
            ? one(
                db,
                "SELECT id,name,email,community_locked,community_lock_reason FROM users WHERE id=?",
                target.author_id,
              )
            : null,
        };
      }),
    );
  });
  app.post(`${base}/reports/:id/resolve`, admin, (req, res) => {
    const resolution = text(1000).parse(req.body.resolution);
    if (
      !one(
        db,
        "SELECT id FROM community_reports WHERE id=? AND status='open'",
        req.params.id,
      )
    )
      fail(409, "Báo cáo đã được xử lý hoặc không tồn tại.");
    transaction(db, () => {
      run(
        db,
        "UPDATE community_reports SET status='resolved',resolved_by=?,resolution=? WHERE id=?",
        req.user.id,
        resolution,
        req.params.id,
      );
      audit(
        req.user.id,
        "community.report.resolve",
        JSON.stringify({ id: req.params.id, resolution }),
      );
    });
    res.json({ ok: true });
  });
  app.patch(`${base}/users/:id/lock`, admin, (req, res) => {
    const d = z
      .object({ locked: z.boolean(), reason: text(1000) })
      .parse(req.body);
    if (!one(db, "SELECT id FROM users WHERE id=?", req.params.id))
      fail(404, "Không tìm thấy tài khoản.");
    transaction(db, () => {
      run(
        db,
        "UPDATE users SET community_locked=?,community_lock_reason=? WHERE id=?",
        Number(d.locked),
        d.reason,
        req.params.id,
      );
      audit(
        req.user.id,
        d.locked ? "community.user.lock" : "community.user.unlock",
        JSON.stringify({ id: req.params.id, reason: d.reason }),
      );
    });
    res.json({ ok: true });
  });
}
