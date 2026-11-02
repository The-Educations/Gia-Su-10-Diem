import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { one, run } from "../server/db.js";
import { createApi } from "../server/api.js";
import { createMailflareSender } from "../server/email-verification.js";

async function fixture(t, deliveryFails = false, configured = true) {
  const db = openDatabase(":memory:"), emails = [];
  const app = createApi(db, { limit: false, sendEmail: configured ? async email => { if (deliveryFails) throw new Error("offline"); emails.push(email); } : undefined });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(async () => { await new Promise(r => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = "";
  const request = async (path, method = "GET", body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
  return { db, emails, request, token: () => new URL(emails.at(-1).link).hash.slice(7) };
}
const signup = { name: "Email test", email: "learner@example.test", password: "VerifyStudy2026!" };
test("new password accounts require ownership verification before protected actions", async t => {
  const { db, emails, request, token } = await fixture(t);
  assert.equal((await request("/auth/register", "POST", { ...signup, email: "not-email" })).status, 400);
  const r = await request("/auth/register", "POST", signup);
  assert.equal(r.status, 201); assert.equal(r.data.verification_sent, true);
  assert.equal(r.data.user.email_verification_required, true);
  assert.equal(emails[0].to, signup.email);
  assert.equal(new URL(emails[0].link).search, "");
  assert.notEqual(one(db, "SELECT token_hash FROM email_verifications").token_hash, token());
  assert.equal((await request("/account/onboarding", "PUT", { step: 0, role: "tutor" })).status, 403);
  assert.equal((await request("/favorites")).status, 403);
  assert.equal((await request("/auth/verify-email", "POST", { token: token() }, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/auth/verify-email", "POST", { token: "not-a-token" })).status, 400);
  run(db, "UPDATE users SET status='suspended' WHERE email=?", signup.email);
  assert.equal((await request("/auth/verify-email", "POST", { token: token() })).status, 400);
  run(db, "UPDATE users SET status='active' WHERE email=?", signup.email);
  const verified = await request("/auth/verify-email", "POST", { token: token() });
  assert.equal(verified.status, 200); assert.equal(verified.data.user.email_verified, true);
  assert.equal(verified.data.user.email_verification_required, false);
  assert.equal((await request("/auth/verify-email", "POST", { token: token() })).status, 400);
  assert.equal((await request("/account/onboarding", "PUT", { step: 0, role: "parent" })).status, 200);
});
test("resends are throttled and replace old links; expiry and cross-browser confirmation do not create sessions", async t => {
  const { db, request, token } = await fixture(t);
  await request("/auth/register", "POST", signup); const old = token();
  assert.equal((await request("/auth/resend-verification", "POST", {})).status, 429);
  run(db, "UPDATE email_verifications SET sent_at=0");
  assert.equal((await request("/auth/resend-verification", "POST", {})).status, 200);
  assert.notEqual(token(), old);
  assert.equal((await request("/auth/verify-email", "POST", { token: old })).status, 400);
  run(db, "UPDATE email_verifications SET expires=0");
  assert.equal((await request("/auth/verify-email", "POST", { token: token() })).status, 400);
  run(db, "UPDATE email_verifications SET expires=?,sent_at=0,attempts=5", Date.now()+60000);
  assert.equal((await request("/auth/resend-verification", "POST", {})).status, 429);
  const r = await request("/auth/verify-email", "POST", { token: token() }, { Cookie: "" });
  assert.equal(r.status, 200); assert.equal(r.data.user, null); assert.equal(r.headers.get("set-cookie"), null);
});
test("delivery failure keeps an unverified account and reports retry honestly", async t => {
  const { request } = await fixture(t, true);
  const r = await request("/auth/register", "POST", signup);
  assert.equal(r.status, 201); assert.equal(r.data.verification_sent, false);
  assert.equal(r.data.user.email_verification_required, true);
  assert.equal((await request("/bookings")).status, 403);
});
test("Mailflare sender uses scoped authentication, no tracking and contact sender", async t => {
  const original = globalThis.fetch; let payload, headers;
  globalThis.fetch = async (_url, options) => { payload = JSON.parse(options.body); headers = options.headers; return new Response("{}", { status: 200 }); };
  t.after(() => { globalThis.fetch = original; });
  await createMailflareSender({ key: "test-only", mailboxId: "contact-mailbox" })({ to: signup.email, link: 'https://giasudiem10.online/app/verify-email#token=abc' });
  assert.equal(payload.from, "contact@giasudiem10.online");
  assert.deepEqual(payload.to, [signup.email]);
  assert.equal(headers.Authorization, "Bearer test-only");
  assert.equal(payload.trackOpens, false); assert.equal(payload.undoSend, false);
  assert.match(payload.html, /Xác nhận email/);
  await createMailflareSender({ key: "test-only", mailboxId: "contact-mailbox" })({ to: signup.email, link: "https://giasudiem10.online/app/studio?tab=profile", kind: "profile_update" });
  assert.equal(payload.from, "contact@giasudiem10.online");
  assert.match(payload.subject, /Cập nhật hồ sơ gia sư/);
  assert.match(payload.text, /Lưu & gửi duyệt/);
  assert.match(payload.html, /app\/studio\?tab=profile/);
  assert.equal(payload.trackOpens, false);
  globalThis.fetch = async () => new Response("failure", { status: 503 });
  await assert.rejects(createMailflareSender({ key: "test-only", mailboxId: "contact-mailbox" })({ to: signup.email, link: "https://example.test" }), /unavailable/);
});

test("missing mail configuration fails before creating an unusable account", async t => {
  const { request, db } = await fixture(t, false, false);
  assert.equal((await request("/auth/register", "POST", signup)).status, 503);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM users").n, 0);
});
