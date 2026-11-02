import { all, one, run } from "./db.js";
import { z, text } from "./validation.js";

export function registerSupport(app, db, auth) {
  function participant(req, res) {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const thread = one(db, "SELECT s.*,u.status FROM support_threads s JOIN users u ON u.id=s.user_id WHERE s.id=?", id);
    if (!thread || (req.user.role !== "admin" && thread.user_id !== req.user.id)) {
      res.status(404).json({ error: "Không tìm thấy cuộc trò chuyện." }); return null;
    }
    return thread;
  }
  app.get("/api/support", auth(), (req, res) => {
    if (req.user.role !== "admin") run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", req.user.id);
    res.json(all(db, `SELECT s.*,u.name,u.role,u.learner_type,u.status,
      (SELECT body FROM support_messages WHERE thread_id=s.id ORDER BY id DESC LIMIT 1) AS last_message
      FROM support_threads s JOIN users u ON u.id=s.user_id
      WHERE ?='admin' OR s.user_id=? ORDER BY COALESCE((SELECT MAX(id) FROM support_messages WHERE thread_id=s.id),0) DESC,s.id DESC`, req.user.role, req.user.id));
  });
  app.get("/api/support/:id/messages", auth(), (req, res) => {
    if (!participant(req, res)) return;
    res.json(all(db, "SELECT m.*,u.name FROM support_messages m JOIN users u ON u.id=m.sender_id WHERE thread_id=? ORDER BY m.id", req.params.id));
  });
  app.post("/api/support/:id/messages", auth(), (req, res) => {
    const thread = participant(req, res);
    if (!thread) return;
    if (thread.status !== "active") return res.status(409).json({ error: "Tài khoản hiện không hoạt động." });
    const { body } = z.object({ body: text(3000) }).parse(req.body);
    run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", thread.id, req.user.id, body);
    res.status(201).json({ ok: true });
  });
}
