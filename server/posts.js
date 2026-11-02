import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";

const postSchema = z.object({ title: text(160), summary: text(500), body: text(30000), published: z.boolean() });
export function registerPosts(app, db, auth, audit) {
  app.get("/api/posts", (_req, res) => res.json(all(db, "SELECT id,title,summary,published_at FROM posts WHERE published=1 ORDER BY published_at DESC,id DESC")));
  app.get("/api/posts/:id", (req, res) => {
    const post = one(db, "SELECT id,title,summary,body,published_at FROM posts WHERE id=? AND published=1", req.params.id);
    if (!post) return res.status(404).json({ error: "Không tìm thấy bài viết." });
    res.json(post);
  });
  app.get("/api/admin/posts", auth("admin"), (_req, res) => res.json(all(db, "SELECT * FROM posts ORDER BY updated_at DESC,id DESC")));
  const save = (req, res) => {
    const d = postSchema.parse(req.body);
    let id = req.params.id;
    if (id && !one(db, "SELECT id FROM posts WHERE id=?", id)) return res.status(404).json({ error: "Không tìm thấy bài viết." });
    transaction(db, () => {
      if (id) run(db, `UPDATE posts SET title=?,summary=?,body=?,published=?,updated_at=CURRENT_TIMESTAMP,
        published_at=CASE WHEN ?=1 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE published_at END WHERE id=?`,
        d.title, d.summary, d.body, Number(d.published), Number(d.published), id);
      else id = Number(run(db, "INSERT INTO posts(title,summary,body,published,author_id,published_at) VALUES (?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)", d.title, d.summary, d.body, Number(d.published), req.user.id, Number(d.published)).lastInsertRowid);
      audit(req.user.id, d.published ? "publish_post" : "save_post_draft", String(id));
    });
    res.status(req.params.id ? 200 : 201).json(one(db, "SELECT * FROM posts WHERE id=?", id));
  };
  app.post("/api/admin/posts", auth("admin"), save);
  app.put("/api/admin/posts/:id", auth("admin"), save);
}
