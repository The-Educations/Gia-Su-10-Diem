import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
import {
  LIMITS,
  RULES_TITLE,
  RULES_BODY,
  fold,
  content,
  postSchema,
  displayNameSchema,
  authorLabel,
  subjectAliases,
  levelAliases,
} from "./community-policy.js";
import { registerCommunityAdmin } from "./community-admin.js";

export const publicPosts = "p.status='approved' AND u.status='active'";
const joins = "FROM community_posts p JOIN users u ON u.id=p.author_id";
export function communitySitemap(db) {
  return all(
    db,
    `SELECT p.id,p.updated_at ${joins} WHERE ${publicPosts} ORDER BY p.id`,
  );
}
export function publicCommunityPost(db, id) {
  const p = one(db, `SELECT p.* ${joins} WHERE p.id=? AND ${publicPosts}`, id);
  if (!p) return null;
  const u = one(
    db,
    "SELECT u.*,t.status tutor_status FROM users u LEFT JOIN tutors t ON t.user_id=u.id WHERE u.id=?",
    p.author_id,
  );
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    author: authorLabel(u),
    published_at: p.published_at,
    updated_at: p.updated_at,
  };
}
export function registerCommunity(app, db, auth, audit) {
  const fail = (status, message) => {
    throw Object.assign(new Error(message), { status });
  };
  const author = (id) =>
    authorLabel(
      one(
        db,
        "SELECT u.*,t.status tutor_status FROM users u LEFT JOIN tutors t ON t.user_id=u.id WHERE u.id=?",
        id,
      ),
    );
  const participant = (req, _res, next) => {
    if (req.user.community_locked)
      fail(
        403,
        `Quyền đăng bài của bạn đang bị khóa: ${req.user.community_lock_reason}`,
      );
    next();
  };
  const named = (req) => {
    if (
      !["admin", "tutor"].includes(author(req.user.id).tier) &&
      !req.user.display_name
    )
      fail(409, "Vui lòng đặt tên hiển thị trước khi tham gia.");
  };
  const getPost = (id, user) => {
    const p = one(
      db,
      `SELECT p.*,u.status author_status ${joins} WHERE p.id=?`,
      id,
    );
    if (
      !p ||
      p.status === "deleted" ||
      !(
        (p.status === "approved" && p.author_status === "active") ||
        user?.role === "admin" ||
        user?.id === p.author_id
      )
    )
      fail(404, "Không tìm thấy bài viết.");
    return p;
  };
  const livePost = (id) => {
    const p = getPost(id, null);
    return p;
  };
  const owned = (req) => {
    const p = getPost(req.params.id, req.user);
    if (p.author_id !== req.user.id)
      fail(403, "Bạn chỉ được thay đổi bài của mình.");
    if (p.kind === "rules" || p.status === "hidden")
      fail(409, "Không thể sửa hoặc xóa bài này.");
    return p;
  };
  const visibleComments = "c.status='visible' AND cu.status='active'";
  const serialize = (p, user) => {
    const own = user?.id === p.author_id;
    const privateView = own || user?.role === "admin";
    const counts = one(
      db,
      `SELECT COUNT(*) comment_count,COALESCE(SUM((SELECT COUNT(*) FROM community_helpful h JOIN users hu ON hu.id=h.user_id WHERE h.comment_id=c.id AND hu.status='active')),0) helpful_count FROM community_comments c JOIN users cu ON cu.id=c.author_id WHERE c.post_id=? AND ${visibleComments}`,
      p.id,
    );
    return {
      id: p.id,
      public:
        p.status === "approved" &&
        one(db, "SELECT status FROM users WHERE id=?", p.author_id).status ===
          "active",
      kind: p.kind,
      title: p.title,
      body: p.body,
      author: author(p.author_id),
      mine: !!own,
      solved: !!p.solved,
      best_comment_id: p.best_comment_id,
      published_at: p.published_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
      ...counts,
      following: !!(
        user &&
        one(
          db,
          "SELECT 1 FROM community_follows WHERE post_id=? AND user_id=?",
          p.id,
          user.id,
        )
      ),
      ...(privateView
        ? {
            status: p.status,
            review_note: p.review_note,
            revision_title: p.revision_title,
            revision_body: p.revision_body,
            revision_status: p.revision_status,
            revision_note: p.revision_note,
          }
        : {}),
    };
  };
  const follow = (post, user) =>
    run(
      db,
      "INSERT OR IGNORE INTO community_follows(post_id,user_id) VALUES (?,?)",
      post,
      user,
    );
  const notify = (user, kind, post, comment = null) => {
    if (kind === "new_comment")
      run(
        db,
        "DELETE FROM community_notifications WHERE user_id=? AND post_id=? AND kind='new_comment' AND read_at IS NULL",
        user,
        post,
      );
    run(
      db,
      "INSERT INTO community_notifications(user_id,kind,post_id,comment_id) VALUES (?,?,?,?)",
      user,
      kind,
      post,
      comment,
    );
  };
  const rate = (table, column, user, period, max, message) => {
    if (
      one(
        db,
        `SELECT COUNT(*) n FROM ${table} WHERE ${column}=? AND created_at>=datetime('now',?)`,
        user,
        period,
      ).n >= max
    )
      fail(429, message);
  };
  const rules = (user) => {
    const p = one(db, "SELECT * FROM community_posts WHERE kind='rules'");
    return p
      ? serialize(p, user)
      : {
          id: null,
          kind: "rules",
          title: RULES_TITLE,
          body: RULES_BODY,
          author: {
            label: "Ban quản trị - Quản trị viên",
            name_part: "Ban quản trị",
            tier: "admin",
          },
          comment_count: 0,
          helpful_count: 0,
        };
  };
  app.get("/api/community/sitemap", (_req, res) =>
    res.json(communitySitemap(db)),
  );
  app.get("/api/community/posts", (req, res) => {
    const query = z
      .object({
        q: z.string().trim().max(80).default(""),
        subject: z.string().max(80).default(""),
        level: z.string().max(80).default(""),
        sort: z.enum(["new", "helpful"]).default("new"),
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .parse(req.query);
    const where = [publicPosts, "p.kind!='rules'"],
      args = [];
    const match = (words, boundary = false) => {
      where.push(
        `(${words.map(() => `${boundary ? "(' ' || p.search_text || ' ')" : "p.search_text"} LIKE ? ESCAPE '\\'`).join(" OR ")})`,
      );
      args.push(
        ...words.map(
          (w) =>
            `%${boundary ? " " : ""}${fold(w).replace(/[\\%_]/g, "\\$&")}${boundary ? " " : ""}%`,
        ),
      );
    };
    if (query.q) match([query.q]);
    if (query.subject) {
      const s = one(db, "SELECT name FROM subjects WHERE id=?", query.subject);
      if (!s) fail(400, "Môn học không hợp lệ.");
      match(subjectAliases[query.subject] || [s.name]);
    }
    if (query.level) {
      if (!levelAliases[query.level]) fail(400, "Cấp học không hợp lệ.");
      // A word boundary keeps lớp 1 from matching lớp 10.
      where.push(
        `(${levelAliases[query.level].map(() => "(' ' || replace(replace(replace(p.search_text, '.', ' '), ',', ' '), char(10), ' ') || ' ') LIKE ? ESCAPE '\\'").join(" OR ")})`,
      );
      args.push(...levelAliases[query.level].map((w) => `% ${w} %`));
    }
    const helpful = `(SELECT COUNT(*) FROM community_helpful h JOIN community_comments c ON c.id=h.comment_id JOIN users cu ON cu.id=c.author_id JOIN users hu ON hu.id=h.user_id WHERE c.post_id=p.id AND ${visibleComments} AND hu.status='active')`;
    const rows = all(
      db,
      `SELECT p.* ${joins} WHERE ${where.join(" AND ")} ORDER BY ${query.sort === "helpful" ? helpful + " DESC," : ""} p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`,
      ...args,
      LIMITS.page + 1,
      (query.page - 1) * LIMITS.page,
    );
    res.json({
      rules: query.page === 1 ? rules(req.user) : null,
      items: rows.slice(0, LIMITS.page).map((p) => serialize(p, req.user)),
      more: rows.length > LIMITS.page,
    });
  });
  app.get("/api/community/posts/:id", (req, res) =>
    res.json(serialize(getPost(req.params.id, req.user), req.user)),
  );
  app.put("/api/community/me/display-name", auth(), participant, (req, res) => {
    const name = displayNameSchema.parse(req.body.display_name);
    run(db, "UPDATE users SET display_name=? WHERE id=?", name, req.user.id);
    res.json({ display_name: name });
  });
  app.post("/api/community/posts", auth(), participant, (req, res) => {
    named(req);
    const d = postSchema.parse(req.body);
    rate(
      "community_posts",
      "author_id",
      req.user.id,
      "-24 hours",
      LIMITS.postsPerDay,
      "Bạn chỉ được gửi 3 bài trong 24 giờ.",
    );
    const id = transaction(db, () => {
      const admin = req.user.role === "admin";
      const id = Number(
        run(
          db,
          "INSERT INTO community_posts(author_id,kind,status,title,body,search_text,published_at) VALUES (?,?,?,?,?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)",
          req.user.id,
          admin ? "announcement" : "user",
          admin ? "approved" : "pending",
          d.title,
          d.body,
          fold(d.title + " " + d.body),
          Number(admin),
        ).lastInsertRowid,
      );
      follow(id, req.user.id);
      if (admin) audit(req.user.id, "community.announcement.create", id);
      return id;
    });
    res.status(201).json(serialize(getPost(id, req.user), req.user));
  });
  app.put("/api/community/posts/:id", auth(), participant, (req, res) => {
    const p = owned(req),
      d = postSchema.parse(req.body);
    if (p.status === "approved" && req.user.role !== "admin")
      run(
        db,
        "UPDATE community_posts SET revision_title=?,revision_body=?,revision_status='pending',revision_note='',submitted_at=CURRENT_TIMESTAMP,review_version=review_version+1 WHERE id=?",
        d.title,
        d.body,
        p.id,
      );
    else
      transaction(db, () => {
        run(
          db,
          "UPDATE community_posts SET title=?,body=?,search_text=?,status=?,review_note='',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,review_version=review_version+1 WHERE id=?",
          d.title,
          d.body,
          fold(d.title + " " + d.body),
          req.user.role === "admin" ? "approved" : "pending",
          p.id,
        );
        if (req.user.role === "admin")
          audit(req.user.id, "community.announcement.update", p.id);
      });
    res.json(serialize(getPost(p.id, req.user), req.user));
  });
  app.delete("/api/community/posts/:id", auth(), participant, (req, res) => {
    const p = owned(req);
    transaction(db, () => {
      run(
        db,
        "UPDATE community_posts SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        p.id,
      );
      if (req.user.role === "admin")
        audit(req.user.id, "community.post.delete", p.id);
    });
    res.json({ ok: true });
  });
  app.delete(
    "/api/community/posts/:id/revision",
    auth(),
    participant,
    (req, res) => {
      const p = owned(req);
      run(
        db,
        "UPDATE community_posts SET revision_title=NULL,revision_body=NULL,revision_status=NULL,revision_note='' WHERE id=?",
        p.id,
      );
      res.json({ ok: true });
    },
  );
  app.post(
    "/api/community/posts/:id/solve",
    auth(),
    participant,
    (req, res) => {
      const p = owned(req);
      livePost(p.id);
      const d = z
        .object({
          solved: z.boolean(),
          best_comment_id: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      transaction(db, () => {
        if (
          d.best_comment_id &&
          !one(
            db,
            `SELECT c.id FROM community_comments c JOIN users cu ON cu.id=c.author_id WHERE c.id=? AND c.post_id=? AND c.author_id!=? AND ${visibleComments}`,
            d.best_comment_id,
            p.id,
            req.user.id,
          )
        )
          fail(400, "Hãy chọn bình luận của thành viên khác trong bài này.");
        run(
          db,
          "UPDATE community_posts SET solved=?,best_comment_id=? WHERE id=?",
          Number(d.solved),
          d.best_comment_id === undefined
            ? p.best_comment_id
            : d.best_comment_id,
          p.id,
        );
      });
      res.json({ ok: true });
    },
  );
  for (const method of ["put", "delete"])
    app[method]("/api/community/posts/:id/follow", auth(), (req, res) => {
      const p = getPost(req.params.id, req.user);
      if (method === "put") follow(p.id, req.user.id);
      else
        run(
          db,
          "DELETE FROM community_follows WHERE post_id=? AND user_id=?",
          p.id,
          req.user.id,
        );
      res.json({ ok: true });
    });
  const comment = (id) => {
    const c = one(
      db,
      "SELECT c.*,u.status author_status FROM community_comments c JOIN users u ON u.id=c.author_id WHERE c.id=?",
      id,
    );
    if (!c || c.status !== "visible" || c.author_status !== "active")
      fail(404, "Không tìm thấy bình luận.");
    livePost(c.post_id);
    return c;
  };
  const commentJson = (c, user) => {
    const visible = c.status === "visible" && c.author_status === "active";
    return {
      id: c.id,
      post_id: c.post_id,
      parent_id: c.parent_id,
      body: visible ? c.body : "",
      author: visible ? author(c.author_id) : null,
      removed: !visible,
      removed_by_admin: c.status === "removed_by_admin",
      mine: user?.id === c.author_id,
      edited: !!c.edited,
      created_at: c.created_at,
      helpful_count: visible
        ? one(
            db,
            "SELECT COUNT(*) n FROM community_helpful h JOIN users u ON u.id=h.user_id WHERE h.comment_id=? AND u.status='active'",
            c.id,
          ).n
        : 0,
      helpful_by_me:
        visible &&
        !!(
          user &&
          one(
            db,
            "SELECT 1 FROM community_helpful WHERE comment_id=? AND user_id=?",
            c.id,
            user.id,
          )
        ),
    };
  };
  app.get("/api/community/posts/:id/comments", (req, res) => {
    const p = livePost(req.params.id);
    const after = z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .parse(req.query.after);
    const rows = all(
      db,
      `SELECT c.*,cu.status author_status FROM community_comments c JOIN users cu ON cu.id=c.author_id WHERE c.post_id=? AND c.parent_id IS NULL AND c.id>? AND ((${visibleComments}) OR EXISTS (SELECT 1 FROM community_comments r JOIN users ru ON ru.id=r.author_id WHERE r.parent_id=c.id AND r.status='visible' AND ru.status='active')) ORDER BY c.id LIMIT ?`,
      p.id,
      after,
      LIMITS.page + 1,
    );
    const roots = rows.slice(0, LIMITS.page);
    const items = roots.map((c) => ({
      ...commentJson(c, req.user),
      replies: all(
        db,
        "SELECT c.*,u.status author_status FROM community_comments c JOIN users u ON u.id=c.author_id WHERE c.parent_id=? AND c.status='visible' AND u.status='active' ORDER BY c.id",
        c.id,
      ).map((r) => commentJson(r, req.user)),
    }));
    const best = p.best_comment_id
      ? one(
          db,
          `SELECT c.*,cu.status author_status FROM community_comments c JOIN users cu ON cu.id=c.author_id WHERE c.id=? AND ${visibleComments}`,
          p.best_comment_id,
        )
      : null;
    res.json({
      items,
      best: best ? commentJson(best, req.user) : null,
      more: rows.length > LIMITS.page,
      next: roots.at(-1)?.id || after,
    });
  });
  app.post(
    "/api/community/posts/:id/comments",
    auth(),
    participant,
    (req, res) => {
      named(req);
      const p = livePost(req.params.id);
      const d = z
        .object({
          body: content(LIMITS.comment),
          parent_id: z.number().int().positive().optional(),
        })
        .parse(req.body);
      rate(
        "community_comments",
        "author_id",
        req.user.id,
        "-1 minute",
        LIMITS.commentsPerMinute,
        "Tối đa 5 bình luận mỗi phút. Vui lòng thử lại sau.",
      );
      let parent = null;
      if (d.parent_id) {
        const root = comment(d.parent_id);
        if (root.post_id !== p.id) fail(400, "Bình luận không thuộc bài này.");
        parent = root.parent_id || root.id;
      }
      const id = transaction(db, () => {
        const id = Number(
          run(
            db,
            "INSERT INTO community_comments(post_id,parent_id,author_id,body) VALUES (?,?,?,?)",
            p.id,
            parent,
            req.user.id,
            d.body,
          ).lastInsertRowid,
        );
        follow(p.id, req.user.id);
        for (const f of all(
          db,
          "SELECT f.user_id FROM community_follows f JOIN users u ON u.id=f.user_id WHERE f.post_id=? AND f.user_id!=? AND u.status='active'",
          p.id,
          req.user.id,
        ))
          notify(f.user_id, "new_comment", p.id, id);
        return id;
      });
      res.status(201).json(commentJson(comment(id), req.user));
    },
  );
  app.patch("/api/community/comments/:id", auth(), participant, (req, res) => {
    const c = comment(req.params.id);
    if (c.author_id !== req.user.id)
      fail(403, "Bạn chỉ được sửa bình luận của mình.");
    const body = content(LIMITS.comment).parse(req.body.body);
    run(
      db,
      "UPDATE community_comments SET body=?,edited=1 WHERE id=?",
      body,
      c.id,
    );
    res.json({ ok: true });
  });
  const removeComment = (id, status, note = "") => {
    run(
      db,
      "UPDATE community_comments SET status=?,removal_note=? WHERE id=?",
      status,
      note,
      id,
    );
    run(
      db,
      "UPDATE community_posts SET best_comment_id=NULL WHERE best_comment_id=?",
      id,
    );
  };
  app.delete("/api/community/comments/:id", auth(), participant, (req, res) => {
    const c = comment(req.params.id);
    if (c.author_id !== req.user.id)
      fail(403, "Bạn chỉ được xóa bình luận của mình.");
    transaction(db, () => {
      removeComment(c.id, "removed_by_author");
      if (req.user.role === "admin")
        audit(req.user.id, "community.comment.delete", c.id);
    });
    res.json({ ok: true });
  });
  for (const method of ["put", "delete"])
    app[method](
      "/api/community/comments/:id/helpful",
      auth(),
      participant,
      (req, res) => {
        const c = comment(req.params.id);
        if (req.user.role === "admin" || c.author_id === req.user.id)
          fail(403, "Không thể bấm Hữu ích cho bình luận này.");
        if (method === "put")
          run(
            db,
            "INSERT OR IGNORE INTO community_helpful(comment_id,user_id) VALUES (?,?)",
            c.id,
            req.user.id,
          );
        else
          run(
            db,
            "DELETE FROM community_helpful WHERE comment_id=? AND user_id=?",
            c.id,
            req.user.id,
          );
        res.json({ ok: true });
      },
    );
  app.post("/api/community/reports", auth(), participant, (req, res) => {
    if (req.user.role === "admin")
      fail(403, "Quản trị viên xử lý trực tiếp trong hàng đợi.");
    const d = z
      .object({
        target_type: z.enum(["post", "comment"]),
        target_id: z.number().int().positive(),
        reason: z.enum([
          "Quảng cáo",
          "Thông tin liên hệ",
          "Xúc phạm",
          "Không liên quan học tập",
          "Khác",
        ]),
        detail: z.string().trim().max(300).default(""),
      })
      .parse(req.body);
    if (d.target_type === "post") livePost(d.target_id);
    else comment(d.target_id);
    if (
      one(
        db,
        "SELECT id FROM community_reports WHERE reporter_id=? AND target_type=? AND target_id=?",
        req.user.id,
        d.target_type,
        d.target_id,
      )
    )
      fail(409, "Bạn đã báo cáo nội dung này.");
    rate(
      "community_reports",
      "reporter_id",
      req.user.id,
      "-1 hour",
      LIMITS.reportsPerHour,
      "Tối đa 10 báo cáo mỗi giờ.",
    );
    run(
      db,
      "INSERT INTO community_reports(reporter_id,target_type,target_id,reason,detail) VALUES (?,?,?,?,?)",
      req.user.id,
      d.target_type,
      d.target_id,
      d.reason,
      d.detail,
    );
    res.status(201).json({ ok: true });
  });
  app.get("/api/community/mine", auth(), (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .default(1)
      .parse(req.query.page);
    const rows = all(
      db,
      "SELECT * FROM community_posts WHERE author_id=? AND status!='deleted' AND kind!='rules' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      req.user.id,
      LIMITS.page + 1,
      (page - 1) * LIMITS.page,
    );
    res.json({
      items: rows.slice(0, LIMITS.page).map((p) => serialize(p, req.user)),
      more: rows.length > LIMITS.page,
    });
  });
  app.get("/api/community/notifications/unread-count", auth(), (req, res) =>
    res.json(
      one(
        db,
        `SELECT COUNT(*) count FROM community_notifications n JOIN community_posts p ON p.id=n.post_id JOIN users u ON u.id=p.author_id WHERE n.user_id=? AND n.read_at IS NULL AND p.status!='deleted' AND (${publicPosts} OR p.author_id=? OR ?='admin')`,
        req.user.id,
        req.user.id,
        req.user.role,
      ),
    ),
  );
  app.get("/api/community/notifications", auth(), (req, res) =>
    res.json(
      all(
        db,
        `SELECT n.id,n.kind,n.post_id,n.created_at,n.read_at,p.title FROM community_notifications n JOIN community_posts p ON p.id=n.post_id JOIN users u ON u.id=p.author_id WHERE n.user_id=? AND p.status!='deleted' AND (${publicPosts} OR p.author_id=? OR ?='admin') ORDER BY n.id DESC LIMIT 100`,
        req.user.id,
        req.user.id,
        req.user.role,
      ),
    ),
  );
  app.post("/api/community/notifications/read", auth(), (req, res) => {
    const d = z
      .object({
        id: z.number().int().positive().optional(),
        all: z.boolean().optional(),
      })
      .refine((d) => d.id || d.all)
      .parse(req.body);
    run(
      db,
      `UPDATE community_notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL ${d.all ? "" : "AND id=?"}`,
      req.user.id,
      ...(d.all ? [] : [d.id]),
    );
    res.json({ ok: true });
  });
  registerCommunityAdmin(app, db, auth, audit, {
    fail,
    getPost,
    serialize,
    notify,
    follow,
    rules,
    removeComment,
  });
}
