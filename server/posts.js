import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
import {
  LEVELS, NEWS_IMAGE_PATH, TOPIC_IDS, buildCta, cleanNewsHtml, postWarnings, publishProblems,
  readingMinutes, searchText, slugify, splitLegacyBody,
} from "./news-policy.js";

const PAGE_SIZE = 12;
const optional = (max) => z.string().trim().max(max).default("");
const url = (pattern, message) => z.string().trim().max(500).refine((v) => v === "" || pattern(v), message).default("");
const saveSchema = z
  .object({
    title: text(160),
    summary: text(500),
    body_html: z.string().max(60000).optional(),
    body: z.string().max(30000).optional(),
    topic: z.enum(TOPIC_IDS).default("study"),
    origin: z.enum(["manual", "auto"]).default("manual"),
    cover_url: url((v) => /^https:\/\/\S+$/.test(v) || NEWS_IMAGE_PATH.test(v), "Ảnh bìa phải là liên kết https hoặc ảnh đã tải lên."),
    cover_alt: optional(300),
    cover_credit: optional(120),
    source_name: optional(120),
    source_url: url((v) => /^https?:\/\/\S+$/i.test(v), "Link nguồn phải bắt đầu bằng http:// hoặc https://."),
    cta_level: z.enum(["", ...LEVELS]).default(""),
    cta_goal: optional(80),
    published: z.boolean(),
    pinned: z.boolean().optional(),
  })
  .refine((d) => d.body_html !== undefined || d.body !== undefined, { message: "Thiếu nội dung bài viết.", path: ["body_html"] });
const listQuery = z.object({ tab: z.enum(["review", "drafts", "published"]).optional() });
const feedQuery = z.object({
  topic: z.union([z.literal(""), z.enum(TOPIC_IDS)]).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

const CARD = "id,slug,title,summary,topic,cover_url,cover_alt,published_at,revised_at,body";
const card = ({ body, ...rest }) => ({ ...rest, reading_minutes: readingMinutes(body) });
const adminRow = ({ search_text, ...row }) => ({ ...row, reading_minutes: readingMinutes(row.body) });
const notFound = (res) => res.status(404).json({ error: "Không tìm thấy bài viết." });

export function registerPosts(app, db, auth, audit) {
  const latest = (where, limit, ...args) =>
    all(db, `SELECT ${CARD} FROM posts WHERE published=1 AND ${where} ORDER BY published_at DESC,id DESC LIMIT ${limit}`, ...args);
  const find = (id) => one(db, "SELECT * FROM posts WHERE id=?", id);

  // ---- public ----
  app.get("/api/posts", (_req, res) =>
    res.json(all(db, "SELECT id,slug,title,summary,published_at,updated_at,revised_at FROM posts WHERE published=1 ORDER BY published_at DESC,id DESC")),
  );
  app.get("/api/news", (req, res) => {
    const { topic, page } = feedQuery.parse(req.query);
    const filtered = !!topic;
    // The pinned post leads the unfiltered feed and is left out of its pages; a topic view lists it normally.
    const rows = all(
      db,
      `SELECT ${CARD} FROM posts WHERE published=1 ${filtered ? "AND topic=?" : "AND pinned=0"}
       ORDER BY published_at DESC,id DESC LIMIT ? OFFSET ?`,
      ...(filtered ? [topic] : []), PAGE_SIZE + 1, page * PAGE_SIZE,
    );
    const pinned = !filtered && page === 0 ? one(db, `SELECT ${CARD} FROM posts WHERE published=1 AND pinned=1`) : null;
    res.json({ pinned: pinned ? card(pinned) : null, items: rows.slice(0, PAGE_SIZE).map(card), has_more: rows.length > PAGE_SIZE });
  });
  app.get("/api/posts/:id", (req, res) => {
    const post = /^\d+$/.test(req.params.id)
      ? one(db, "SELECT * FROM posts WHERE id=? AND published=1", Number(req.params.id))
      : null;
    if (!post) return notFound(res);
    const related = latest("id<>? AND topic=?", 3, post.id, post.topic);
    if (related.length < 3) related.push(...latest("id<>? AND topic<>?", 3 - related.length, post.id, post.topic));
    res.json({
      id: post.id, slug: post.slug, title: post.title, summary: post.summary, topic: post.topic,
      body: post.body, body_html: post.body_html,
      cover_url: post.cover_url, cover_alt: post.cover_alt, cover_credit: post.cover_credit,
      source_name: post.source_name, source_url: post.source_url,
      published_at: post.published_at, updated_at: post.updated_at, revised_at: post.revised_at,
      reading_minutes: readingMinutes(post.body), cta: buildCta(post), related: related.map(card),
    });
  });

  // ---- admin ----
  app.get("/api/admin/posts", auth("admin"), (req, res) => {
    const counts = one(
      db,
      `SELECT COALESCE(SUM(published=0 AND origin='auto'),0) review, COALESCE(SUM(published=0 AND origin='manual'),0) drafts,
        COALESCE(SUM(published=1),0) published FROM posts`,
    );
    const tab = listQuery.parse(req.query).tab ?? (counts.review ? "review" : "published");
    const where = { review: "published=0 AND origin='auto'", drafts: "published=0 AND origin='manual'", published: "published=1" }[tab];
    const order = tab === "published" ? "published_at DESC,id DESC" : "created_at DESC,id DESC";
    const items = all(
      db,
      `SELECT id,slug,title,summary,topic,origin,published,pinned,cover_url,cover_alt,source_name,source_url,
        created_at,updated_at,published_at,revised_at,body FROM posts WHERE ${where} ORDER BY ${order}`,
    ).map(({ body, ...row }) => ({ ...row, warnings: postWarnings({ ...row, body }) }));
    res.json({ tab, counts, items });
  });
  app.get("/api/admin/posts/:id", auth("admin"), (req, res) => {
    const post = find(req.params.id);
    post ? res.json(adminRow(post)) : notFound(res);
  });

  const imageIds = (cover, htmlIds) => {
    const ids = new Set(htmlIds);
    const match = cover.match(NEWS_IMAGE_PATH);
    if (match) ids.add(match[1]);
    for (const id of ids)
      if (!one(db, "SELECT id FROM news_images WHERE id=?", id))
        throw Object.assign(new Error("Ảnh không tồn tại. Hãy tải ảnh lên lại."), { status: 400 });
    return [...ids];
  };
  const save = (req, res) => {
    const d = saveSchema.parse(req.body);
    const existing = req.params.id ? find(req.params.id) : null;
    if (req.params.id && !existing) return notFound(res);
    let body = d.body ?? "", body_html = "", html = [];
    if (d.body_html !== undefined) ({ body_html, body, image_ids: html } = cleanNewsHtml(d.body_html));
    const fields = { cover_url: d.cover_url, cover_alt: d.cover_alt, cover_credit: d.cover_credit, source_name: d.source_name, source_url: d.source_url };
    if (!existing && d.origin === "auto" && d.body_html === undefined) {
      // Workflows that predate structured fields send the cover and source inside the text.
      const split = splitLegacyBody(body, { cover: !d.cover_url, source: !d.source_name });
      body = split.body;
      for (const key of Object.keys(fields)) fields[key] = fields[key] || split[key];
    }
    const problems = d.published ? publishProblems({ title: d.title, summary: d.summary, body, topic: d.topic }) : [];
    if (problems.length) return res.status(422).json({ error: "Bài chưa đủ điều kiện để đăng.", problems });
    const ids = imageIds(fields.cover_url, html);
    const search = searchText({ title: d.title, summary: d.summary, body });
    const id = transaction(db, () => {
      let id = existing?.id;
      const firstPublish = d.published && !existing?.published_at;
      const slug = existing?.slug || (firstPublish || existing?.published_at ? slugify(d.title) : "");
      const values = [d.title, d.summary, body, body_html, d.topic, fields.cover_url, fields.cover_alt, fields.cover_credit,
        fields.source_name, fields.source_url, d.cta_level, d.cta_goal, search, slug, Number(d.published)];
      if (existing) {
        const changed = existing.title !== d.title || existing.summary !== d.summary || existing.body !== body || existing.body_html !== body_html;
        run(
          db,
          `UPDATE posts SET title=?,summary=?,body=?,body_html=?,topic=?,cover_url=?,cover_alt=?,cover_credit=?,source_name=?,
            source_url=?,cta_level=?,cta_goal=?,search_text=?,slug=?,published=?,updated_at=CURRENT_TIMESTAMP,
            published_at=CASE WHEN ?=1 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END,
            revised_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE revised_at END WHERE id=?`,
          ...values, Number(d.published), Number(!!existing.published && changed), id,
        );
      } else {
        id = Number(
          run(
            db,
            `INSERT INTO posts(title,summary,body,body_html,topic,cover_url,cover_alt,cover_credit,source_name,source_url,
              cta_level,cta_goal,search_text,slug,published,origin,author_id,published_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)`,
            ...values, d.origin, req.user.id, Number(d.published),
          ).lastInsertRowid,
        );
      }
      if (!d.published) run(db, "UPDATE posts SET pinned=0 WHERE id=?", id);
      else if (d.pinned === true) setPinned(id, true);
      else if (d.pinned === false) run(db, "UPDATE posts SET pinned=0 WHERE id=?", id);
      run(db, "DELETE FROM news_post_images WHERE post_id=?", id);
      for (const image of ids) run(db, "INSERT INTO news_post_images VALUES (?,?)", id, image);
      if (existing?.published && !d.published) audit(req.user.id, "unpublish_post", String(id));
      audit(req.user.id, d.published ? "publish_post" : "save_post_draft", String(id));
      return id;
    });
    res.status(existing ? 200 : 201).json(adminRow(find(id)));
  };
  function setPinned(id, on) {
    if (on) run(db, "UPDATE posts SET pinned=0 WHERE pinned=1 AND id<>?", id);
    run(db, "UPDATE posts SET pinned=? WHERE id=?", Number(on), id);
  }
  app.post("/api/admin/posts", auth("admin"), save);
  app.put("/api/admin/posts/:id", auth("admin"), save);

  app.post("/api/admin/posts/:id/publish", auth("admin"), (req, res) => {
    const post = find(req.params.id);
    if (!post) return notFound(res);
    if (post.published) return res.json(adminRow(post));
    const problems = publishProblems(post);
    if (problems.length) return res.status(422).json({ error: "Bài chưa đủ điều kiện để đăng.", problems });
    transaction(db, () => {
      run(
        db,
        "UPDATE posts SET published=1,slug=?,published_at=COALESCE(published_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?",
        post.slug || slugify(post.title), post.id,
      );
      audit(req.user.id, "publish_post", String(post.id));
    });
    res.json(adminRow(find(post.id)));
  });
  app.post("/api/admin/posts/:id/unpublish", auth("admin"), (req, res) => {
    const post = find(req.params.id);
    if (!post) return notFound(res);
    if (post.published)
      transaction(db, () => {
        run(db, "UPDATE posts SET published=0,pinned=0,updated_at=CURRENT_TIMESTAMP WHERE id=?", post.id);
        audit(req.user.id, "unpublish_post", String(post.id));
      });
    res.json(adminRow(find(post.id)));
  });
  app.post("/api/admin/posts/:id/pin", auth("admin"), (req, res) => {
    const { pinned } = z.object({ pinned: z.boolean() }).parse(req.body);
    const post = find(req.params.id);
    if (!post) return notFound(res);
    if (pinned && !post.published) return res.status(409).json({ error: "Chỉ ghim được bài đã đăng." });
    transaction(db, () => {
      setPinned(post.id, pinned);
      audit(req.user.id, pinned ? "pin_post" : "unpin_post", String(post.id));
    });
    res.json(adminRow(find(post.id)));
  });
  app.delete("/api/admin/posts/:id", auth("admin"), (req, res) => {
    const post = one(db, "SELECT id FROM posts WHERE id=?", req.params.id);
    if (!post) return notFound(res);
    transaction(db, () => {
      // Explicit, so cleanup does not depend on the engine enforcing ON DELETE CASCADE.
      run(db, "DELETE FROM news_post_images WHERE post_id=?", post.id);
      run(db, "DELETE FROM posts WHERE id=?", post.id);
      audit(req.user.id, "delete_post", String(post.id));
    });
    res.json({ ok: true });
  });
}
