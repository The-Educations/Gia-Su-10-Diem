import { SignJWT, generateKeyPair } from "jose";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { one, run, passwordHash } from "../server/db.js";
import { createApi } from "../server/api.js";
import { safeNext, verifyGoogleToken } from "../server/google-auth.js";

test("Google OAuth binds state to browser, enforces nonce, roles, linking and replay protection", async (t) => {
  const db = openDatabase(":memory:");
  let claims = {
    sub: "google-student",
    email: "student@example.com",
    email_verified: true,
    name: "Học sinh Google",
  };
  let badNonce = false;
  const server = createApi(db, {
    limit: false,
    google: {
      clientId: "client.apps.googleusercontent.com",
      clientSecret: "test-only",
      adminEmail: "owner@gmail.com",
      exchange: async ({ verifier }) => {
        // State is consumed before exchange, so capture its nonce at start below.
        assert.equal(typeof verifier, "string");
        return { ...claims, nonce: badNonce ? "wrong" : expectedNonce };
      },
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let expectedNonce;
  async function start(query = "", session = "") {
    const r = await fetch(base + "/api/auth/google/start" + query, {
      headers: { Cookie: session },
      redirect: "manual",
    });
    const url = new URL(r.headers.get("location"));
    expectedNonce = url.searchParams.get("nonce");
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    return {
      state: url.searchParams.get("state"),
      cookie: r.headers.getSetCookie()[0].split(";")[0],
    };
  }
  async function callback(flow, extra = "", cookie = flow.cookie) {
    return fetch(
      base + `/api/auth/google/callback?state=${flow.state}&code=test${extra}`,
      { redirect: "manual", headers: { Cookie: cookie } },
    );
  }
  const badRole = await fetch(base + "/api/auth/google/start?role=admin");
  assert.equal(badRole.status, 400);
  const reserved = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Imposter",
      email: "owner@gmail.com",
      password: "FakeOwner2026!",
      role: "student",
    }),
  });
  assert.equal(reserved.status, 403);
  let flow = await start("?role=tutor&next=//evil.test");
  assert.match(
    (await callback(flow, "", "")).headers.get("location"),
    /expired/,
  );
  let response = await callback(flow);
  assert.equal(response.headers.get("location"), "/app/onboarding");
  const tutor = one(db, "SELECT * FROM users WHERE email=?", claims.email);
  assert.equal(tutor.role, "tutor");
  assert.equal(tutor.password, "");
  assert.ok(one(db, "SELECT * FROM tutors WHERE user_id=?", tutor.id));
  assert.match((await callback(flow)).headers.get("location"), /expired/);
  assert.match(
    response.headers.getSetCookie().find((c) => c.startsWith("giasu_session=")),
    /HttpOnly/,
  );
  flow = await start("?role=student&next=/messages");
  assert.equal((await callback(flow)).headers.get("location"), "/app/onboarding?next=%2Fmessages");
  assert.equal(one(db, "SELECT count(*) AS n FROM users").n, 1);
  badNonce = true;
  flow = await start();
  assert.match((await callback(flow)).headers.get("location"), /failed/);
  badNonce = false;
  claims = { ...claims, email_verified: false, sub: "unverified" };
  flow = await start();
  assert.match((await callback(flow)).headers.get("location"), /failed/);
  claims = {
    ...claims,
    email_verified: true,
    sub: "other-google",
    email: "existing@example.com",
  };
  run(
    db,
    "INSERT INTO users(name,email,password,role) VALUES (?,?,?,'admin')",
    "Owner",
    claims.email,
    await passwordHash("OwnerPassword2026!"),
  );
  flow = await start();
  assert.match((await callback(flow)).headers.get("location"), /email_exists/);
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: claims.email,
      password: "OwnerPassword2026!",
    }),
  });
  const session = login.headers.getSetCookie()[0].split(";")[0];
  flow = await start("?intent=link", session);
  assert.equal(
    (await callback(flow, "", `${session}; ${flow.cookie}`)).headers.get(
      "location",
    ),
    "/app/settings?google=linked",
  );
  flow = await start();
  assert.equal((await callback(flow)).headers.get("location"), "/app/admin");
  run(db, "UPDATE users SET status='suspended' WHERE email=?", claims.email);
  flow = await start();
  assert.match((await callback(flow)).headers.get("location"), /suspended/);
  flow = await start();
  run(db, "UPDATE oauth_states SET expires=0");
  assert.match((await callback(flow)).headers.get("location"), /expired/);
  flow = await start();
  assert.match(
    (await callback(flow, "&error=access_denied")).headers.get("location"),
    /cancelled/,
  );
  claims = { ...claims, sub: "google-owner", email: "owner@gmail.com" };
  flow = await start("?role=tutor");
  assert.equal((await callback(flow)).headers.get("location"), "/app/admin");
  assert.equal(
    one(db, "SELECT role FROM users WHERE email='owner@gmail.com'").role,
    "admin",
  );
});
test("requested administrator is reserved and existing Google users are promoted only after verification", async (t) => {
  const db = openDatabase(":memory:");
  let verified = false, nonce;
  const email = "hungquocnguyen252@gmail.com";
  const hash = await passwordHash("OldPassword2026!");
  run(db, "INSERT INTO users(name,email,password,role,onboarding_step) VALUES (?,?,?,'student',1)", "Hung", email, hash);
  const id = one(db, "SELECT id FROM users WHERE email=?", email).id;
  run(db, "INSERT INTO oauth_identities VALUES ('google','hung-google',?)", id);
  run(db, "INSERT INTO sessions VALUES ('old-session',?,?)", id, Date.now() + 60000);
  const server = createApi(db, { limit: false, google: {
    clientId: "client", clientSecret: "test", adminEmail: "existing-owner@gmail.com",
    exchange: async () => ({ sub: "hung-google", email, email_verified: verified, nonce }),
  } }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const register = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Fake", email: email.toUpperCase(), password: "FakePassword2026!", role: "student" }) });
  assert.equal(register.status, 403);
  async function loginGoogle() {
    const start = await fetch(base + "/api/auth/google/start", { redirect: "manual" });
    const url = new URL(start.headers.get("location"));
    nonce = url.searchParams.get("nonce");
    return fetch(base + `/api/auth/google/callback?state=${url.searchParams.get("state")}&code=test`, { redirect: "manual", headers: { Cookie: start.headers.getSetCookie()[0].split(";")[0] } });
  }
  assert.match((await loginGoogle()).headers.get("location"), /failed/);
  assert.equal(one(db, "SELECT role FROM users WHERE id=?", id).role, "student");
  verified = true;
  const result = await loginGoogle();
  assert.equal(result.headers.get("location"), "/app/admin");
  assert.equal(one(db, "SELECT role FROM users WHERE id=?", id).role, "admin");
  assert.equal(one(db, "SELECT * FROM sessions WHERE token='old-session'"), undefined);
  const cookie = result.headers.getSetCookie().find((c) => c.startsWith("giasu_session=")).split(";")[0];
  assert.equal((await fetch(base + "/api/admin", { headers: { Cookie: cookie } })).status, 200);
  const passwordLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "OldPassword2026!" }) });
  assert.equal(passwordLogin.status, 403);
});
test("OAuth return paths cannot escape the application", () => {
  for (const path of [
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/\nevil",
    undefined,
  ])
    assert.equal(safeNext(path), "");
  assert.equal(safeNext("/tutors/3?from=google"), "/tutors/3?from=google");
});

test("Google ID tokens require a valid signature, issuer, audience and expiry", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const token = (overrides = {}) =>
    new SignJWT({
      sub: "subject",
      email: "person@gmail.com",
      email_verified: true,
      nonce: "nonce",
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setExpirationTime("5m")
      .sign(privateKey);
  assert.equal(
    (await verifyGoogleToken(await token(), "client", publicKey)).sub,
    "subject",
  );
  const tokenText = await token();
  await assert.rejects(() => verifyGoogleToken(tokenText, "wrong", publicKey));
  await assert.rejects(() =>
    verifyGoogleToken(tokenText.slice(0, -8) + "tampered", "client", publicKey),
  );
  const expired = await new SignJWT({
    sub: "subject",
    email: "person@gmail.com",
    email_verified: true,
    nonce: "nonce",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer("https://accounts.google.com")
    .setAudience("client")
    .setExpirationTime(1)
    .sign(privateKey);
  await assert.rejects(() => verifyGoogleToken(expired, "client", publicKey));
});
