import { randomBytes, randomInt } from "node:crypto";
import { one, run, tokenHash, transaction } from "./db.js";
import { z } from "./validation.js";

const cookieName = "giasu_signup";
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function registerSignupVerification(app, db, { sendEmail, production, session }) {
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "lax", path: "/api/auth", maxAge: 3600000 };
  const pending = req => {
    const raw = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    return raw && one(db, "SELECT * FROM pending_signups WHERE browser_hash=? AND created_at>?", tokenHash(raw), Date.now() - 3600000);
  };
  async function deliver(row) {
    if (!sendEmail) fail(503, "Chưa gửi được mã xác minh. Vui lòng thử lại sau.");
    const now = Date.now();
    if (now - row.sent_at < 60000 || row.sends >= 5) fail(429, "Vui lòng chờ trước khi gửi lại mã. Tối đa 5 mã mỗi giờ.");
    const code = String(randomInt(100000, 1000000));
    run(db, "UPDATE pending_signups SET code_hash=?,expires=?,sent_at=?,sends=sends+1 WHERE email=? AND browser_hash=?", tokenHash(`${row.browser_hash}:${code}`), now + 600000, now, row.email, row.browser_hash);
    try { await sendEmail({ to: row.email, code, kind: "signup" }); }
    catch { fail(503, "Chưa gửi được mã xác minh. Vui lòng thử lại sau một phút."); }
  }
  async function start(res, data) {
    if (!sendEmail) fail(503, "Đăng ký tạm thời chưa khả dụng. Vui lòng thử lại sau.");
    const now = Date.now();
    run(db, "DELETE FROM pending_signups WHERE created_at<=?", now - 3600000);
    const old = one(db, "SELECT * FROM pending_signups WHERE email=?", data.email);
    if (old && (now - old.sent_at < 60000 || old.sends >= 5)) fail(429, "Vui lòng chờ trước khi yêu cầu mã mới.");
    const browser = randomBytes(32).toString("hex"), hash = tokenHash(browser);
    run(db, `INSERT INTO pending_signups(email,browser_hash,payload,code_hash,expires,sent_at,sends,attempts,created_at)
      VALUES (?,?,?,'',0,0,?,0,?) ON CONFLICT(email) DO UPDATE SET browser_hash=excluded.browser_hash,payload=excluded.payload,code_hash='',expires=0,attempts=0`,
      data.email, hash, JSON.stringify(data), old?.sends || 0, old?.created_at || now);
    res.cookie(cookieName, browser, cookieOptions);
    await deliver(one(db, "SELECT * FROM pending_signups WHERE browser_hash=?", hash));
  }
  app.get("/api/auth/signup", (req, res) => {
    const row = pending(req);
    res.json({ pending: !!row, email: row?.email || "", retry_at: row ? row.sent_at + 60000 : 0 });
  });
  app.post("/api/auth/signup/resend", async (req, res) => {
    const row = pending(req);
    if (!row) fail(400, "Phiên đăng ký đã hết hạn. Vui lòng bắt đầu lại.");
    await deliver(row); res.json({ ok: true });
  });
  app.post("/api/auth/signup/verify", (req, res) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const row = pending(req);
    if (!row || row.expires <= Date.now()) fail(400, "Mã đã hết hạn. Vui lòng yêu cầu mã mới.");
    if (row.attempts >= 5) fail(429, "Bạn đã nhập sai 5 lần. Vui lòng bắt đầu đăng ký lại.");
    run(db, "UPDATE pending_signups SET attempts=attempts+1 WHERE email=?", row.email);
    if (row.code_hash !== tokenHash(`${row.browser_hash}:${code}`)) fail(400, "Mã xác minh chưa đúng.");
    const data = JSON.parse(row.payload);
    const user = transaction(db, () => {
      if (one(db, "SELECT id FROM users WHERE email=?", row.email) || (data.googleSubject && one(db, "SELECT user_id FROM oauth_identities WHERE provider='google' AND subject=?", data.googleSubject))) fail(409, "Tài khoản đã tồn tại. Vui lòng đăng nhập.");
      const id = Number(run(db, "INSERT INTO users(name,email,password,role,onboarding_step,email_verified_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)", data.name, row.email, data.password || "", data.role || "student", data.role === "admin" ? 3 : 0).lastInsertRowid);
      if (data.role === "tutor") run(db, "INSERT INTO tutors(user_id) VALUES (?)", id);
      if (data.googleSubject) run(db, "INSERT INTO oauth_identities VALUES ('google',?,?)", data.googleSubject, id);
      run(db, "DELETE FROM pending_signups WHERE email=?", row.email);
      return one(db, "SELECT * FROM users WHERE id=?", id);
    });
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    res.status(201).json({ user: session(res, user), next: data.next || "" });
  });
  return { start, configured: !!sendEmail };
}
