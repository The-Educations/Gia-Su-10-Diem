import { randomBytes } from "node:crypto";
import { one, run, publicUser, tokenHash, transaction } from "./db.js";
import { z } from "./validation.js";

export const needsEmailVerification = user => !!user?.email_verification_required && !user.email_verified_at;
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function createMailflareSender({ url = "https://mail.giasudiem10.online", key, mailboxId, from = "contact@giasudiem10.online" } = {}) {
  if (!key || !mailboxId) return null;
  return async ({ to, link }) => {
    const response = await fetch(`${url}/api/v1/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ mailboxId, from, to: [to], subject: "Xác nhận email — Gia Sư 10 Điểm", undoSend: false, trackOpens: false,
        text: `Xác nhận email để hoàn tất tài khoản Gia Sư 10 Điểm:\n${link}\n\nLiên kết có hiệu lực trong 24 giờ và chỉ dùng một lần. Nếu bạn không tạo tài khoản, hãy bỏ qua email này.`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:32px;color:#292b23"><h1 style="font-size:24px">Xác nhận email của bạn</h1><p>Hoàn tất tài khoản Gia Sư 10 Điểm bằng nút bên dưới.</p><p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:#852f36;color:white;padding:14px 22px;border-radius:10px;text-decoration:none">Xác nhận email</a></p><p>Liên kết có hiệu lực trong 24 giờ và chỉ dùng một lần.</p><p>Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p></div>`,
      }),
    });
    if (!response.ok) throw new Error("Mail delivery unavailable");
  };
}

export function registerEmailVerification(app, db, { origin, sendEmail }) {
  async function send(user) {
    if (!sendEmail) throw new Error("Mail delivery unavailable");
    const previous = one(db, "SELECT sent_at,window_start,attempts FROM email_verifications WHERE user_id=?", user.id);
    const now = Date.now();
    if (previous && (now - previous.sent_at < 60000 || (now - previous.window_start < 3600000 && previous.attempts >= 5))) {
      const error = new Error("Vui lòng chờ trước khi gửi lại email xác nhận."); error.status = 429; throw error;
    }
    const token = randomBytes(32).toString("hex");
    const sameWindow = previous && now - previous.window_start < 3600000;
    run(db, `INSERT INTO email_verifications(user_id,token_hash,expires,sent_at,window_start,attempts) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,sent_at=excluded.sent_at,window_start=excluded.window_start,attempts=excluded.attempts`,
      user.id, tokenHash(token), now + 86400000, now, sameWindow ? previous.window_start : now, sameWindow ? previous.attempts + 1 : 1);
    await sendEmail({ to: user.email, link: `${origin}/app/verify-email#token=${token}` });
  }
  app.post("/api/auth/resend-verification", async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Vui lòng đăng nhập để gửi lại email." });
    if (!needsEmailVerification(req.user)) return res.json({ ok: true });
    try { await send(req.user); res.json({ ok: true }); }
    catch (e) { res.status(e.status === 429 ? 429 : 503).json({ error: e.status === 429 ? e.message : "Chưa gửi được email. Vui lòng thử lại sau một phút." }); }
  });
  app.post("/api/auth/verify-email", (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(req.body);
    const user = transaction(db, () => {
      const verification = one(db, "SELECT v.user_id FROM email_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=? AND v.expires>? AND u.status='active' AND u.email_verified_at IS NULL", tokenHash(token), Date.now());
      if (!verification) return null;
      run(db, "UPDATE users SET email_verified_at=CURRENT_TIMESTAMP WHERE id=?", verification.user_id);
      run(db, "DELETE FROM email_verifications WHERE user_id=?", verification.user_id);
      return one(db, "SELECT * FROM users WHERE id=?", verification.user_id);
    });
    if (!user) return res.status(400).json({ error: "Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu email mới." });
    res.json({ ok: true, user: req.user?.id === user.id ? publicUser(user) : null });
  });
  return { send, configured: !!sendEmail };
}
