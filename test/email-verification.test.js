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
    if (r.headers.getSetCookie().length) cookie = r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    return { status: r.status, data: await r.json(), headers: r.headers };
  };
  return { db, emails, request, code: () => emails.at(-1).code };
}
const signup = { name: "Email test", email: "learner@example.test", password: "VerifyStudy2026!" };
test("no account or session exists until a browser-bound code is verified", async t => {
  const { db, emails, request, code } = await fixture(t);
  assert.equal((await request("/auth/register", "POST", { ...signup, email: "not-email" })).status, 400);
  const r = await request("/auth/register", "POST", signup);
  assert.equal(r.status, 202);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM users").n, 0);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM sessions").n, 0);
  assert.equal(emails[0].to, signup.email);
  assert.match(code(), /^\d{6}$/);
  assert.equal(one(db, "SELECT payload FROM pending_signups").payload.includes(signup.password), false);
  assert.notEqual(one(db, "SELECT code_hash FROM pending_signups").code_hash, code());
  assert.equal((await request("/account/onboarding", "PUT", { step: 0, role: "tutor" })).status, 401);
  assert.equal((await request("/auth/signup/verify", "POST", { code: code() }, { Cookie: "" })).status, 400);
  assert.equal((await request("/auth/signup/verify", "POST", { code: code() }, { Origin: "https://evil.test" })).status, 403);
  assert.equal((await request("/auth/signup/verify", "POST", { code: "000000" })).status, 400);
  const verified = await request("/auth/signup/verify", "POST", { code: code() });
  assert.equal(verified.status, 201); assert.equal(verified.data.user.email_verified, true);
  assert.equal((await request("/auth/me")).data.user.id, verified.data.user.id);
  assert.equal((await request("/auth/signup/verify", "POST", { code: code() })).status, 400);
  assert.equal((await request("/account/onboarding", "PUT", { step: 0, role: "parent" })).status, 200);
});
test("codes expire, resends invalidate old codes and guessing is capped", async t => {
  const { db, request, code } = await fixture(t);
  await request("/auth/register", "POST", signup); const old = code();
  assert.equal((await request("/auth/signup/resend", "POST", {})).status, 429);
  run(db, "UPDATE pending_signups SET expires=0");
  assert.equal((await request("/auth/signup/verify", "POST", { code: old })).status, 400);
  run(db, "UPDATE pending_signups SET sent_at=0");
  assert.equal((await request("/auth/signup/resend", "POST", {})).status, 200);
  if (old !== code()) assert.equal((await request("/auth/signup/verify", "POST", { code: old })).status, 400);
  for (let i = 0; i < 5; i++) await request("/auth/signup/verify", "POST", { code: "000000" });
  assert.equal((await request("/auth/signup/verify", "POST", { code: code() })).status, 429);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM users").n, 0);
  run(db, "UPDATE pending_signups SET sent_at=0,sends=5");
  assert.equal((await request("/auth/signup/resend", "POST", {})).status, 429);
});
test("delivery failure never creates an account", async t => {
  const { request, db } = await fixture(t, true);
  assert.equal((await request("/auth/register", "POST", signup)).status, 503);
  assert.equal(one(db, "SELECT COUNT(*) AS n FROM users").n, 0);
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
  await assert.rejects(createMailflareSender({ key: "test-only", mailboxId: "contact-mailbox" })({ to: signup.email, kind: "profile_update" }), /admin mailbox/);
  await createMailflareSender({ key: "test-admin-only", mailboxId: "admin-mailbox", from: "admin@giasudiem10.online" })({ to: signup.email, link: "https://giasudiem10.online/app/studio?tab=profile", kind: "profile_update" });
  assert.equal(payload.from, "admin@giasudiem10.online");
  assert.equal(payload.mailboxId, "admin-mailbox");
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
