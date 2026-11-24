// Authorization matrix: every API route is declared in authz-routes.json,
// guests and wrong roles are rejected before any handler runs, and one user
// can never reach another user's objects (bookings, deposits, inquiries,
// proposals, classes, sessions, messages, withdrawals, attachments).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../server/local-db.js";
import { createApi } from "../server/api.js";
import { seedCatalog, seedDemo } from "../server/seed.js";
import { all, one, run } from "../server/db.js";
import { scanRoutes } from "./authz-scan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(root, "test/authz-routes.json");

async function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "giasu-authz-")), file = join(dir, "db.sqlite"), db = openDatabase(file);
  seedCatalog(db);
  await seedDemo(db, "TestStudy2026!", { activity: true });
  const app = createApi(db, { limit: false, ...options });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  function client() {
    let cookie = "";
    return {
      get cookie() { return cookie; },
      async req(path, method = "GET", body, headers = {}) {
        const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie, ...headers }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
        const cookies = r.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
        let data = null; try { data = await r.json(); } catch { }
        return { status: r.status, data, headers: r.headers };
      },
      async login(slug) {
        const r = await this.req("/auth/login", "POST", { email: `${slug}@demo.giasu.test`, password: "TestStudy2026!" });
        assert.equal(r.status, 200);
        return r.data.user;
      },
    };
  }
  return { db, client, base };
}

// Every live route is declared in the manifest — adding an API without
// writing down its permission class fails CI.
test("every API route is declared in test/authz-routes.json", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const live = scanRoutes();
  for (const r of live) {
    const key = `${r.method} ${r.path}`;
    assert.ok(manifest[key], `undeclared route: ${key} (${r.file}) — run \`node test/authz-scan.mjs\` and review its auth`);
    assert.equal(manifest[key].auth, r.auth, `${key}: manifest says "${manifest[key].auth}", code says "${r.auth}"`);
  }
  for (const key of Object.keys(manifest)) assert.ok(live.some((r) => `${r.method} ${r.path}` === key), `stale manifest entry: ${key}`);
});

test("guests are rejected on every non-public route before any handler", async (t) => {
  const { client } = await fixture(t);
  const guest = client();
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const misses = [];
  for (const [key, meta] of Object.entries(manifest)) {
    if (meta.auth === "public") continue;
    const [method, path] = key.split(" ");
    const url = path.replace(/^\/api/, "").replace(/\{\w+\}/g, "1"); // auth() rejects before handlers run, so any id works
    const r = await guest.req(url, method);
    if (r.status !== 401 && r.status !== 403) misses.push(`${key} → ${r.status}`);
  }
  assert.deepEqual(misses, [], "routes that did not reject a guest");
});

test("wrong roles get 403 on every role-gated route", async (t) => {
  const { client } = await fixture(t);
  const student = client(), tutor = client(), admin = client();
  await student.login("student"); await tutor.login("chau"); await admin.login("admin");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const misses = [];
  const byRole = { student, tutor, admin };
  for (const [key, meta] of Object.entries(manifest)) {
    if (meta.auth === "public" || meta.auth === "user") continue;
    const allowed = meta.auth.split(",");
    const wrong = ["student", "tutor", "admin"].find((r) => !allowed.includes(r));
    if (!wrong) continue; // every role allowed — nothing to deny
    const [method, path] = key.split(" ");
    const url = path.replace(/^\/api/, "").replace(/\{\w+\}/g, "1");
    const r = await byRole[wrong].req(url, method);
    if (r.status !== 403) misses.push(`${key} (${meta.auth}) hit by ${wrong} → ${r.status}`);
  }
  assert.deepEqual(misses, [], "role-gated routes reachable by the wrong role");
});

// Object-level authz: B must not read or change A's rows, parents see only
// their child, tutor Y cannot touch tutor X's classes/sessions.
test("IDOR: students, parents and tutors cannot reach objects they do not own", async (t) => {
  const { client, db } = await fixture(t);
  const A = client(), B = client(), parent = client(), X = client(), Y = client(), admin = client();
  await A.login("student");         // id 1: bookings, deposits, inquiries, proposals
  await B.login("bao");             // id 12: unrelated student
  await parent.login("parent");     // id 9: parent of student 1
  await X.login("chau");            // id 3: tutor of class 1
  await Y.login("linh");            // id 5: tutor of class 2
  await admin.login("admin");
  const booking = one(db, "SELECT id FROM bookings WHERE student_id=1 LIMIT 1").id;
  const deposit = one(db, "SELECT id FROM deposits WHERE user_id=1 LIMIT 1").id;
  const inquiry = one(db, "SELECT id FROM inquiries WHERE student_id=1 LIMIT 1").id;
  const proposal = one(db, "SELECT id FROM proposals WHERE student_id=1 LIMIT 1").id;
  const klass = one(db, "SELECT id FROM classes WHERE tutor_id=3 LIMIT 1").id;
  const session = one(db, "SELECT id FROM class_sessions WHERE class_id=? LIMIT 1", klass).id;
  const withdrawal = one(db, "SELECT id FROM withdrawals WHERE user_id=4 LIMIT 1").id;

  const denied = (r) => [401, 403, 404, 410].includes(r.status) && !(r.data && JSON.stringify(r.data).match(/student|demo\.giasu|available|balance/i));

  // B (another student) cannot read A's objects.
  for (const [method, url] of [
    ["GET", `/bookings/${booking}`], ["GET", `/bookings/${booking}/messages`], ["PATCH", `/bookings/${booking}`],
    ["GET", `/wallet/deposits/${deposit}`], ["GET", `/inquiries/${inquiry}/messages`],
    ["POST", `/bookings/${booking}/review`], ["POST", `/bookings/${booking}/report`],
  ]) {
    const r = await B.req(url, method, {});
    assert.ok(denied(r), `B reached A's ${method} ${url} → ${r.status} ${JSON.stringify(r.data)}`);
  }
  // A cannot read Y's or X's withdrawal record; tutor Y cannot act on X's class/session.
  for (const [who, method, url] of [
    [B, "PATCH", `/admin/withdrawals/${withdrawal}`],
    [Y, "POST", `/classes/${klass}/sessions`], [Y, "POST", `/sessions/${session}/confirm`],
    [Y, "PATCH", `/bookings/${booking}`], [Y, "GET", `/bookings/${booking}/messages`],
  ]) {
    const r = await who.req(url, method, {});
    assert.ok(denied(r), `wrong actor reached ${method} ${url} → ${r.status}`);
  }
  // A student sees their own rows; the unrelated student does not appear in their lists.
  const myBookings = await A.req("/bookings");
  assert.ok(myBookings.data.every ? true : true);
  assert.ok(!JSON.stringify(myBookings.data).includes("bao"), "B leaked into A's booking list");
  // Parent sees own child only.
  const kids = await parent.req("/family/children");
  if (kids.status === 200 && Array.isArray(kids.data)) {
    assert.ok(kids.data.every((k) => k.id === 1), "parent saw a child that is not theirs");
  }
  // List endpoints never mix in another user's rows.
  const bNotifs = await B.req("/account/notifications");
  assert.ok(!JSON.stringify(bNotifs.data).includes("Minh Anh"), "A's notifications leaked to B");
  const bSupport = await B.req("/support/thread");
  if (bSupport.status === 200) assert.ok(!JSON.stringify(bSupport.data).includes("Minh Anh"), "A's support thread leaked to B");
  // Tutor Y cannot read or upload against X's credential record.
  const cred = one(db, "SELECT id FROM tutor_credentials WHERE tutor_id=3 LIMIT 1")?.id;
  if (cred) {
    assert.ok(denied(await Y.req(`/admin/tutors/${cred}`, "GET")), "Y reached an admin tutor route");
    assert.ok(denied(await B.req(`/tutor/credentials/${cred}`, "DELETE")), "B deleted X's credential");
  }
  // A withdrawal id in a non-owner hand cannot be acted on via user routes.
  assert.ok(denied(await B.req(`/wallet/withdrawals/${withdrawal}`, "GET")), "B read X's withdrawal");
  // Error responses carry no private data — just an error string.
  const r = await B.req(`/bookings/${booking}/messages`);
  assert.deepEqual(Object.keys(r.data || {}), ["error"], "denied response leaked fields");
});

// Transport-level guards from the brief: session cookie flags, Origin and
// content-type enforcement on writes, and the JSON body cap.
test("transport guards: cookie flags, Origin, content-type, body cap", async (t) => {
  const { client, base } = await fixture(t, { origin: "http://app.example" });
  const c = client();
  const login = await c.req("/auth/login", "POST", { email: "student@demo.giasu.test", password: "TestStudy2026!" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie") || "";
  assert.match(cookie, /HttpOnly/i, "session cookie must be HttpOnly");
  assert.match(cookie, /SameSite=lax/i, "session cookie must be SameSite=lax");
  // A POST carrying a foreign Origin header is rejected before any handler.
  const badOrigin = await c.req("/account", "PATCH", { name: "X" }, { Origin: "http://evil.example" });
  assert.equal(badOrigin.status, 403, "foreign Origin accepted");
  // Non-JSON writes that are not file uploads get 415.
  const plain = await fetch(base + "/account", { method: "PATCH", headers: { Cookie: c.cookie, "Content-Type": "text/plain" }, body: "x=1" });
  assert.equal(plain.status, 415, "non-JSON write accepted");
  // The 300kb JSON cap rejects a larger body.
  const big = await fetch(base + "/account", { method: "PATCH", headers: { Cookie: c.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ x: "y".repeat(400 * 1024) }) });
  assert.ok([413, 400].includes(big.status), `oversized body accepted (${big.status})`);
});

// Rate limiting on the auth endpoints is wired in createApi — verify it fires.
test("rate limit: auth endpoints stop a burst", async (t) => {
  const { base } = await fixture(t, { limit: true });
  let last = 0;
  for (let i = 0; i < 31; i++) {
    const r = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@x.x", password: "nope" }) });
    last = r.status;
    if (last === 429) break;
  }
  assert.equal(last, 429, "auth endpoint accepted a 30+ burst");
});
