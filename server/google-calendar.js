import { randomBytes, createHash } from "node:crypto";
import { one, run, tokenHash } from "./db.js";
import { verifyGoogleToken } from "./google-auth.js";
import { calendarScope, createCalendarSync } from "./google-calendar-sync.js";
const random = () => randomBytes(32).toString("base64url");
const cookieName = "giasu_calendar_state";

export function registerGoogleCalendar(app, db, auth, { origin, production, google = {}, wakeCalendar = async () => {} }) {
  const sync = createCalendarSync(db, { origin, google });
  const { clientId, clientSecret, calendarVerifyToken = verifyGoogleToken } = google;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const cookieOptions = { httpOnly: true, secure: production, sameSite: "lax", path: "/api/auth/google", maxAge: 600000 };
  const liveUser = state => one(db, "SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.user_id=? AND s.expires>? AND u.status='active' AND u.role IN ('student','tutor')", state.session_hash, state.user_id, Date.now());

  app.get("/api/account/google-calendar", auth(), (req, res) => res.json(req.user.role === "admin" ? { available: false, connected: false } : sync.status(req.user.id)));
  app.post("/api/account/google-calendar/connect", auth("student", "tutor"), (req, res) => {
    if (!sync.enabled) return res.status(503).json({ error: "Google Calendar chưa được cấu hình." });
    const state = `cal_${random()}`, browser = random(), verifier = random(), nonce = random();
    run(db, "DELETE FROM google_calendar_states WHERE expires<? OR user_id=?", Date.now(), req.user.id);
    run(db, "INSERT INTO google_calendar_states(state,browser_hash,session_hash,user_id,verifier,nonce,expires) VALUES (?,?,?,?,?,?,?)", tokenHash(state), tokenHash(browser), tokenHash(req.sessionToken), req.user.id, verifier, nonce, Date.now() + 600000);
    res.cookie(cookieName, browser, cookieOptions);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: `openid email ${calendarScope}`,
      state, nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
      access_type: "offline", prompt: "consent select_account",
    }).toString();
    res.json({ url: url.href });
  });
  // Reuse the already registered Google redirect URI without changing login behavior.
  app.get("/api/auth/google/callback", async (req, res, next) => {
    if (typeof req.query.state !== "string" || !req.query.state.startsWith("cal_")) return next();
    const fail = code => res.redirect(`/app/bookings?calendar_error=${code}`);
    const browser = req.headers.cookie?.split(";").map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    if (!sync.enabled) return fail("unavailable");
    const state = req.query.state.length < 200 ? one(db, "SELECT * FROM google_calendar_states WHERE state=?", tokenHash(req.query.state)) : null;
    if (!state || state.claimed || !browser || state.browser_hash !== tokenHash(browser) || state.expires < Date.now() || !req.sessionToken || tokenHash(req.sessionToken) !== state.session_hash || !liveUser(state)) return fail("expired");
    if (!run(db, "UPDATE google_calendar_states SET claimed=1 WHERE state=? AND claimed=0", state.state).changes) return fail("expired");
    try {
      if (req.query.error) return fail("cancelled");
      if (typeof req.query.code !== "string" || req.query.code.length > 4096) return fail("failed");
      const tokens = await sync.request("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: req.query.code, code_verifier: state.verifier, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code" }),
      });
      if (typeof tokens.scope !== "string" || !tokens.scope.split(" ").includes(calendarScope) || typeof tokens.id_token !== "string") return fail("permission");
      const claims = await calendarVerifyToken(tokens.id_token, clientId);
      if (claims.nonce !== state.nonce || claims.email_verified !== true || typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255 || typeof claims.email !== "string" || claims.email.length > 254 || !claims.email.includes("@")) return fail("failed");
      if (!liveUser(state) || !one(db, "SELECT state FROM google_calendar_states WHERE state=? AND claimed=1", state.state)) return fail("expired");
      const existing = one(db, "SELECT * FROM google_calendars WHERE user_id=?", state.user_id);
      if (existing && existing.subject !== claims.sub) return fail("account_changed");
      if (existing?.lease_until > Date.now()) return fail("busy");
      const refresh = typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0 && tokens.refresh_token.length < 16384 ? sync.encrypt(tokens.refresh_token, state.user_id) : existing?.refresh_token;
      if (!refresh) return fail("permission");
      if (existing) run(db, "UPDATE google_calendars SET refresh_token=?,email=?,error='',next_sync=0 WHERE user_id=?", refresh, claims.email, state.user_id);
      else run(db, "INSERT INTO google_calendars(user_id,generation,subject,email,refresh_token) VALUES (?,?,?,?,?)", state.user_id, random(), claims.sub, claims.email, refresh);
      await wakeCalendar();
      await sync.syncUser(state.user_id);
      return res.redirect("/app/bookings?calendar=connected");
    } catch { return fail("failed"); }
    finally { run(db, "DELETE FROM google_calendar_states WHERE state=?", state.state); }
  });
  app.post("/api/account/google-calendar/sync", auth("student", "tutor"), async (req, res) => {
    if (!sync.enabled) return res.status(503).json({ error: "Google Calendar chưa được cấu hình." });
    await sync.syncUser(req.user.id);
    await wakeCalendar();
    res.json(sync.status(req.user.id));
  });
  app.delete("/api/account/google-calendar", auth("student", "tutor"), async (req, res) => {
    await sync.disconnect(req.user.id);
    res.json({ ok: true });
  });
  return sync;
}
