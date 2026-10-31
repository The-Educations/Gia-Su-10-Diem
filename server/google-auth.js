import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { one, run, tokenHash, transaction } from "./db.js";
const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const random = () => randomBytes(32).toString("base64url");
const cookieName = "giasu_google_state";
export function safeNext(value) {
  return typeof value === "string" &&
    /^\/(?!\/)/.test(value) &&
    !/[\\\x00-\x20]/.test(value) &&
    value.length < 500
    ? value
    : "";
}
export async function exchangeGoogle({
  code,
  verifier,
  redirectUri,
  clientId,
  clientSecret,
}) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("Google token exchange failed");
  const { id_token } = await response.json();
  return verifyGoogleToken(id_token, clientId);
}
export async function verifyGoogleToken(idToken, clientId, keys = jwks) {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce", "email", "email_verified"],
    maxTokenAge: "10m",
  });
  return payload;
}
export function registerGoogleAuth(
  app,
  db,
  { origin, production, session, google = {} },
) {
  const {
    clientId,
    clientSecret,
    adminEmail,
    exchange = exchangeGoogle,
  } = google;
  const enabled = !!(clientId && clientSecret);
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60000,
  };
  const redirectUri = `${origin}/api/auth/google/callback`;
  app.get("/api/auth/providers", (req, res) => res.json({ google: enabled }));
  app.get("/api/account/auth-methods", (req, res) => {
    if (!req.user)
      return res.status(401).json({ error: "Vui lòng đăng nhập." });
    res.json({
      password: !!req.user.password,
      google: !!one(
        db,
        "SELECT subject FROM oauth_identities WHERE provider='google' AND user_id=?",
        req.user.id,
      ),
      googleAvailable: enabled,
    });
  });
  app.get("/api/auth/google/start", (req, res) => {
    if (!enabled) return res.redirect("/app/auth?oauth_error=unavailable");
    const linking = req.query.intent === "link";
    if (linking && !req.user) return res.redirect("/app/auth?next=%2Fsettings");
    if (req.query.role && !["student", "tutor"].includes(req.query.role))
      return res.status(400).json({ error: "Vai trò không hợp lệ." });
    const state = random(),
      browser = random(),
      verifier = random(),
      nonce = random();
    run(db, "DELETE FROM oauth_states WHERE expires<?", Date.now());
    run(
      db,
      "INSERT INTO oauth_states VALUES (?,?,?,?,?,?,?,?)",
      tokenHash(state),
      tokenHash(browser),
      verifier,
      nonce,
      req.query.role === "tutor" ? "tutor" : "student",
      safeNext(req.query.next),
      linking ? req.user.id : null,
      Date.now() + 10 * 60000,
    );
    res.cookie(cookieName, browser, cookieOptions);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    res.redirect(url.href);
  });
  app.get("/api/auth/google/callback", async (req, res) => {
    const fail = (reason) => res.redirect(`/app/auth?oauth_error=${reason}`);
    const browser = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    if (!enabled) return fail("unavailable");
    const state =
      typeof req.query.state === "string" && req.query.state.length < 200
        ? one(
            db,
            "SELECT * FROM oauth_states WHERE state=?",
            tokenHash(req.query.state),
          )
        : null;
    if (
      !state ||
      !browser ||
      state.browser_hash !== tokenHash(browser) ||
      state.expires < Date.now()
    )
      return fail("expired");
    run(db, "DELETE FROM oauth_states WHERE state=?", state.state);
    if (req.query.error) return fail("cancelled");
    if (typeof req.query.code !== "string" || req.query.code.length > 4096)
      return fail("failed");
    try {
      const claims = await exchange({
        code: req.query.code,
        verifier: state.verifier,
        redirectUri,
        clientId,
        clientSecret,
      });
      if (
        claims.nonce !== state.nonce ||
        claims.email_verified !== true ||
        typeof claims.sub !== "string" ||
        !claims.sub ||
        claims.sub.length > 255 ||
        typeof claims.email !== "string" ||
        claims.email.length > 254 ||
        !claims.email.includes("@")
      )
        return fail("failed");
      const email = claims.email.toLowerCase();
      const result = transaction(db, () => {
        const identity = one(
          db,
          "SELECT user_id FROM oauth_identities WHERE provider='google' AND subject=?",
          claims.sub,
        );
        if (state.link_user_id) {
          // Require the same live session, rechecked after the network exchange.
          const live =
            req.sessionToken &&
            one(
              db,
              "SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.status='active'",
              tokenHash(req.sessionToken),
              Date.now(),
            );
          if (
            live?.id !== state.link_user_id ||
            (identity && identity.user_id !== live.id)
          )
            return { error: "link_failed" };
          const linked = one(
            db,
            "SELECT subject FROM oauth_identities WHERE provider='google' AND user_id=?",
            live.id,
          );
          if (linked && linked.subject !== claims.sub)
            return { error: "link_failed" };
          run(
            db,
            "INSERT OR IGNORE INTO oauth_identities VALUES ('google',?,?)",
            claims.sub,
            live.id,
          );
          return {
            user: one(db, "SELECT * FROM users WHERE id=?", live.id),
            linked: true,
          };
        }
        if (identity)
          return {
            user: one(db, "SELECT * FROM users WHERE id=?", identity.user_id),
          };
        // Email alone never authorizes linking to a password account, especially admins.
        if (one(db, "SELECT id FROM users WHERE email=?", email))
          return { error: "email_exists" };
        const name =
          typeof claims.name === "string"
            ? claims.name.trim().slice(0, 80)
            : "";
        const role =
          adminEmail && email === adminEmail.toLowerCase()
            ? "admin"
            : state.role;
        const id = Number(
          run(
            db,
            "INSERT INTO users(name,email,password,role) VALUES (?,?,'',?)",
            name || email.split("@")[0],
            email,
            role,
          ).lastInsertRowid,
        );
        if (role === "tutor")
          run(db, "INSERT INTO tutors(user_id) VALUES (?)", id);
        run(
          db,
          "INSERT INTO oauth_identities VALUES ('google',?,?)",
          claims.sub,
          id,
        );
        return { user: one(db, "SELECT * FROM users WHERE id=?", id) };
      });
      if (result.error) return fail(result.error);
      if (!result.user || result.user.status !== "active")
        return fail("suspended");
      session(res, result.user);
      const target = result.linked
        ? "/settings?google=linked"
        : state.next ||
          (result.user.role === "tutor"
            ? "/studio"
            : result.user.role === "admin"
              ? "/admin"
              : "/workspace");
      res.redirect(`/app${target}`);
    } catch {
      return fail("failed");
    }
  });
}
