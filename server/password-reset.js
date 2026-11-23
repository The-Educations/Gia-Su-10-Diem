import { randomBytes } from "node:crypto";
import { one, run, transaction, tokenHash, passwordHash } from "./db.js";
import { z } from "./validation.js";

// Password reset tokens: 30 minutes, single use, latest one wins, only the
// sha256 hash is stored — a leaked table never hands out usable tokens.
const TOKEN_TTL = 30 * 60 * 1000, HOURLY_LIMIT = 3;

export function registerPasswordReset(app, db, { origin, sendEmail, audit }) {
  run(db, `CREATE TABLE IF NOT EXISTS password_resets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL, expires INTEGER NOT NULL, used_at INTEGER,
    sent_at INTEGER NOT NULL, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 1)`);

  const body = z.object({ email: z.string().email().max(254) });

  app.post("/api/auth/forgot-password", async (req, res) => {
    body.parse(req.body);
    // Same answer for every email — the response never reveals whether an
    // account exists, so the address book cannot be harvested here.
    const ok = () => res.json({ ok: true, message: "Nếu email này có tài khoản, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu." });
    if (!sendEmail) return ok();
    const user = one(db, "SELECT id,email,password,status FROM users WHERE email=?", String(req.body?.email || "").trim().toLowerCase());
    if (!user || user.status !== "active") return ok();
    const previous = one(db, "SELECT sent_at,window_start,attempts FROM password_resets WHERE user_id=?", user.id);
    const now = Date.now();
    // Per-email hourly budget — exhausted accounts still get the same 200.
    if (previous && now - previous.window_start < 3600000 && previous.attempts >= HOURLY_LIMIT) return ok();
    const sameWindow = previous && now - previous.window_start < 3600000;
    if (!user.password) {
      // Google-only account: explain instead of minting a password it never had.
      run(db, `INSERT INTO password_resets(user_id,token_hash,expires,sent_at,window_start,attempts) VALUES (?,?,?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET sent_at=excluded.sent_at,window_start=excluded.window_start,attempts=excluded.attempts`,
        user.id, "", 0, now, sameWindow ? previous.window_start : now, sameWindow ? previous.attempts + 1 : 1);
      await sendEmail({ kind: "password_reset_google", to: user.email, link: `${origin}/app/auth` });
      return ok();
    }
    const token = randomBytes(32).toString("hex");
    run(db, `INSERT INTO password_resets(user_id,token_hash,expires,used_at,sent_at,window_start,attempts) VALUES (?,?,?,NULL,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,used_at=NULL,sent_at=excluded.sent_at,window_start=excluded.window_start,attempts=excluded.attempts`,
      user.id, tokenHash(token), now + TOKEN_TTL, now, sameWindow ? previous.window_start : now, sameWindow ? previous.attempts + 1 : 1);
    await sendEmail({ kind: "password_reset", to: user.email, link: `${origin}/app/reset-password?token=${token}` });
    return ok();
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { token, password } = z.object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: z.string().min(10).max(128),
    }).parse(req.body);
    const user = transaction(db, () => {
      const reset = one(db, `SELECT r.user_id FROM password_resets r JOIN users u ON u.id=r.user_id
        WHERE r.token_hash=? AND r.expires>? AND r.used_at IS NULL AND u.status='active'`, tokenHash(token), Date.now());
      if (!reset) return null;
      return reset.user_id;
    });
    if (!user) return res.status(400).json({ error: "Liên kết đã hết hạn hoặc đã được sử dụng. Hãy yêu cầu liên kết mới." });
    const hash = await passwordHash(password);
    transaction(db, () => {
      if (!run(db, "UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL", Date.now(), user).changes)
        throw Object.assign(new Error("used"), { code: "used" });
      run(db, "UPDATE users SET password=? WHERE id=?", hash, user);
      // Every previous session dies with the old password.
      run(db, "DELETE FROM sessions WHERE user_id=?", user);
      audit(user, "user.password_reset", `user:${user}`);
    });
    if (sendEmail) await sendEmail({ kind: "password_changed", to: one(db, "SELECT email FROM users WHERE id=?", user).email, link: `${origin}/app/auth` }).catch(() => {});
    res.json({ ok: true });
  });
}
