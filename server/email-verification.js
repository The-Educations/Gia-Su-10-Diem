import { randomBytes } from "node:crypto";
import { one, run, publicUser, tokenHash, transaction } from "./db.js";
import { z } from "./validation.js";

export const needsEmailVerification = user => !!user?.email_verification_required && !user.email_verified_at;
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function emailFrame(title, content, footer) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#252821"><tr><td style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" align="center" style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e7e2;border-radius:16px"><tr><td style="padding:28px">
<p style="margin:0 0 28px;font-size:15px;font-weight:700;color:#852f36">Gia Sư 10 Điểm</p>
<p style="margin:0 0 8px;color:#73766c;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase">Tài khoản của bạn</p>
<h1 style="margin:0 0 24px;font-size:28px;line-height:1.25;letter-spacing:-0.5px;font-weight:700;color:#252821">${title}</h1>
${content}
</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e6e7e2"><p style="margin:0;font-size:12px;line-height:1.7;color:#73766c">${footer}</p></td></tr></table>
<p style="margin:18px 0 0;text-align:center;font-size:12px;line-height:1.5;color:#73766c"><a href="https://giasudiem10.online" style="color:#73766c;text-decoration:none">giasudiem10.online</a></p>
</td></tr></table>`;
}

export function createMailflareSender({ url = "https://mail.giasudiem10.online", key, mailboxId, from = "contact@giasudiem10.online" } = {}) {
  if (!key || !mailboxId) return null;
  return async ({ to, link, code, kind = "verification" }) => {
    const signup = kind === "signup";
    const update = kind === "profile_update";
    if (update && from !== "admin@giasudiem10.online") throw new Error("Profile review mail must use the admin mailbox in Mailflare");
    const subject = signup ? "Mã xác minh tài khoản — Gia Sư 10 Điểm" : update ? "Cập nhật hồ sơ gia sư — Gia Sư 10 Điểm" : "Xác nhận email — Gia Sư 10 Điểm";
    const message = update ? "Hồ sơ gia sư của bạn cần được bổ sung trước khi công bố. Vui lòng kiểm tra thông tin cá nhân, môn dạy, học vấn, phần giới thiệu và hình ảnh; cập nhật đầy đủ rồi chọn Lưu & gửi duyệt để quản trị viên xem lại." : "Xác nhận email để hoàn tất tài khoản Gia Sư 10 Điểm.";
    const footer = update ? "Nếu cần hỗ trợ, hãy trả lời email này." : "Liên kết có hiệu lực trong 24 giờ và chỉ dùng một lần. Nếu bạn không tạo tài khoản, hãy bỏ qua email này. Đây là email tự động; vui lòng không trả lời.";
    const action = update ? "Cập nhật hồ sơ" : "Xác nhận email";
    const content = signup
      ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#55594f">Nhập mã dưới đây tại màn hình đăng ký để xác nhận địa chỉ email và tạo tài khoản của bạn.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f7f7f3;border:1px solid #e9e9e1;border-radius:10px"><tr><td align="center" style="padding:24px 12px"><p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#73766c">MÃ XÁC MINH</p><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:700;line-height:1.3;letter-spacing:6px;color:#252821">${escapeHtml(String(code))}</p><p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#73766c">Có hiệu lực trong 10 phút</p></td></tr></table>
<p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#55594f">Không chia sẻ mã này với bất kỳ ai. Đội ngũ Gia Sư 10 Điểm sẽ không yêu cầu bạn cung cấp mã qua tin nhắn hoặc điện thoại.</p>`
      : `<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#55594f">${message}</p><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#852f36;border-radius:8px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;font-size:14px;font-weight:700;line-height:1.4;color:#ffffff;text-decoration:none">${action}</a></td></tr></table>`;
    const html = emailFrame(signup ? "Xác minh email của bạn" : action, content, signup ? "Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.<br>Đây là email tự động từ contact@giasudiem10.online; vui lòng không trả lời." : footer);
    const response = await fetch(`${url}/api/v1/send`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ mailboxId, from, to: [to], subject, undoSend: false, trackOpens: false,
        text: signup ? `Mã xác minh Gia Sư 10 Điểm: ${code}. Mã có hiệu lực 10 phút. Không chia sẻ mã này. Nếu bạn không đăng ký, hãy bỏ qua email này. Đây là email tự động; vui lòng không trả lời.` : `${message}\n${link}\n\n${footer}`,
        html,
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
