import { withChatMedia, insertChatMessage, chatPage } from "./chat-media.js";
import { all, one, run } from "./db.js";
import { z } from "./validation.js";

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
      (SELECT body FROM support_messages WHERE thread_id=s.id ORDER BY id DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM support_messages WHERE thread_id=s.id ORDER BY id DESC LIMIT 1) AS last_message_at,
      (SELECT u2.name FROM support_messages m JOIN users u2 ON u2.id=m.sender_id WHERE m.thread_id=s.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
      (SELECT is_event FROM support_messages WHERE thread_id=s.id ORDER BY id DESC LIMIT 1) AS last_is_event,
      (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id=s.id AND m.sender_id<>${req.user.id} AND m.id>COALESCE((SELECT last_read_id FROM chat_reads WHERE thread_kind='support' AND thread_id=s.id AND user_id=${req.user.id}),0)) AS unread_count
      FROM support_threads s JOIN users u ON u.id=s.user_id
      WHERE (?='admin' AND EXISTS(SELECT 1 FROM support_messages WHERE thread_id=s.id)) OR s.user_id=? ORDER BY COALESCE((SELECT MAX(id) FROM support_messages WHERE thread_id=s.id),0) DESC,s.id DESC`, req.user.role, req.user.id));
  });
  app.get("/api/support/:id/messages", auth(), (req, res) => {
    if (!participant(req, res)) return;
    const page = chatPage(db, "support", Number(req.params.id), req);
    const messages = withChatMedia(db, "support", Number(req.params.id), page.messages);
    res.json(req.query.limit ? { messages, hasMore: page.hasMore } : messages);
  });
  app.post("/api/support/:id/messages", auth(), (req, res) => {
    const thread = participant(req, res);
    if (!thread) return;
    if (thread.status !== "active") return res.status(409).json({ error: "Tài khoản hiện không hoạt động." });
    insertChatMessage(db, "support", thread.id, req.user, req.body);
    res.status(201).json({ ok: true });
  });
}
