import { all, one, run } from "./db.js";
import { z } from "./validation.js";

// Enqueue within the moderation transaction; call Mailflare only after commit.
export function registerCommunityMail(app, db, auth, audit, { sendAdminEmail, origin }) {
  function enqueue(userId, detail, reason, path) {
    return Number(run(db, "INSERT INTO community_mail(user_id,detail,reason,path) VALUES (?,?,?,?)", userId, detail, reason, path).lastInsertRowid);
  }
  async function deliver(id, actorId) {
    const row = one(db, "SELECT m.*,u.email,u.status FROM community_mail m JOIN users u ON u.id=m.user_id WHERE m.id=?", id);
    if (!row || row.status === "deleted") return { email_status: "unavailable" };
    if (row.sent_at) return { email_status: "sent" };
    const now = Date.now();
    if (!run(db, "UPDATE community_mail SET sending_until=?,attempted_at=? WHERE id=? AND sent_at IS NULL AND sending_until<=?", now + 60000, now, id, now).changes) return { email_status: "pending" };
    try {
      if (!sendAdminEmail) throw new Error("Admin mailbox not configured");
      await sendAdminEmail({ to: row.email, kind: "community_moderation", detail: row.detail, reason: row.reason,
        occurredAt: new Date(`${row.created_at.replace(" ", "T")}Z`).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) + " (giờ Việt Nam)",
        link: `${origin}${row.path}` });
      run(db, "UPDATE community_mail SET sent_at=CURRENT_TIMESTAMP,sending_until=0 WHERE id=?", id);
      audit(actorId, "community.mail.sent", id);
      return { email_status: "sent" };
    } catch {
      run(db, "UPDATE community_mail SET sending_until=0 WHERE id=?", id);
      audit(actorId, "community.mail.failed", id);
      return { email_status: "failed" };
    }
  }
  app.get("/api/admin/community/mail", auth("admin"), (req, res) => {
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    res.json(all(db, "SELECT m.id,m.detail,m.reason,m.created_at,u.name FROM community_mail m JOIN users u ON u.id=m.user_id WHERE m.sent_at IS NULL AND u.status<>'deleted' ORDER BY m.id DESC LIMIT 20 OFFSET ?", (page - 1) * 20));
  });
  app.post("/api/admin/community/mail/:id/retry", auth("admin"), async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const row = one(db, "SELECT * FROM community_mail WHERE id=?", id);
    if (!row) return res.status(404).json({ error: "Không tìm thấy thông báo email." });
    if (!row.sent_at && row.attempted_at > Date.now() - 60000) return res.status(429).json({ error: "Vui lòng đợi một phút trước khi gửi lại." });
    res.json({ ok: true, ...await deliver(id, req.user.id) });
  });
  return { enqueue, deliver };
}
