import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/local-db.js";
import { one, all, run, tokenHash } from "../server/db.js";
import { seedCatalog } from "../server/seed-catalog.js";
import { createApi } from "../server/api.js";
import { calendarScope } from "../server/google-calendar-sync.js";

async function setup(t, { configured = true } = {}) {
  const db = openDatabase(":memory:"); seedCatalog(db);
  for (const [id, role] of [[1, "admin"], [2, "student"], [3, "tutor"], [4, "student"]]) {
    run(db, "INSERT INTO users(id,name,email,password,role,onboarding_step) VALUES (?,?,?,?,?,3)", id, `Person ${id}`, `user${id}@example.test`, "", role);
    run(db, "INSERT INTO sessions VALUES (?,?,?)", tokenHash(`session-${id}`), id, Date.now() + 3600000);
  }
  run(db, "INSERT INTO tutors(user_id,status) VALUES (3,'approved')");
  const lesson = (id, status = "accepted", student = 2) => {
    const start = new Date(Date.parse("2030-01-07T16:30:00Z") + (id - 1) * 86400000).toISOString();
    run(db, "INSERT INTO slots(id,tutor_id,starts_at) VALUES (?,3,?)", id, start);
    return run(db, "INSERT INTO bookings(id,slot_id,student_id,tutor_id,subject_id,starts_at,rate,mode,note,status,duration_minutes) VALUES (?,?,?,3,'toan',?,150000,'online','Mục tiêu',?,90)", id, id, student, start, status);
  };
  lesson(1); lesson(2, "completed"); lesson(3, "pending"); lesson(4, "cancelled"); lesson(5, "accepted", 4);
  const fake = { calls: [], calendars: new Map(), nonce: "", sub: "google-2", fail: "", lostEvent: false, delay: null, verified: true };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const calendarFetch = async (url, options) => {
    const u = new URL(url); const method = options.method || "GET";
    const body = options.body instanceof URLSearchParams ? Object.fromEntries(options.body) : options.body ? JSON.parse(options.body) : undefined;
    fake.calls.push({ url: u.href, method, body });
    if (fake.delay) { const delay = fake.delay; fake.delay = null; await delay; }
    if (u.pathname === "/token") {
      if (fake.fail === "revoked") return json({ error: "invalid_grant" }, 400);
      if (body.grant_type === "authorization_code") return json({ id_token: "signed-test", refresh_token: "test-refresh-token", scope: fake.fail === "scope" ? "openid email" : calendarScope });
      return json({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (u.pathname === "/revoke") return json({});
    assert.equal(options.headers.Authorization, "Bearer test-access-token");
    if (fake.fail === "disabled") return json({ error: { errors: [{ reason: "accessNotConfigured" }] } }, 403);
    if (u.pathname === "/calendar/v3/calendars") {
      const id = `calendar-${fake.calendars.size + 1}@example.test`;
      fake.calendars.set(id, new Map()); return json({ id });
    }
    const calendarMatch = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)$/);
    if (calendarMatch) return fake.calendars.has(decodeURIComponent(calendarMatch[1])) ? json({id: decodeURIComponent(calendarMatch[1])}) : json({}, 404);
    const match = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    assert.ok(match, u.pathname);
    const calendar = fake.calendars.get(decodeURIComponent(match[1])), id = match[2];
    if (!calendar) return json({}, 404);
    if (method === "POST") {
      assert.match(body.id, /^[a-v0-9]{5,1024}$/);
      if (calendar.has(body.id)) return json({}, 409);
      calendar.set(body.id, body);
      if (fake.lostEvent) { fake.lostEvent = false; throw new Error("Response lost after insert"); }
      return json(body);
    }
    if (!calendar.has(id)) return json({}, 404);
    if (method === "GET") return json(calendar.get(id));
    if (method === "DELETE") { calendar.delete(id); return new Response(null, { status: 204 }); }
    if (method === "PATCH") { calendar.set(id, { ...calendar.get(id), ...body }); return json(calendar.get(id)); }
    throw new Error(`Unexpected ${method}`);
  };
  const app = createApi(db, { limit: false, google: { clientId: "calendar-client", clientSecret: "test-secret", calendarTokenKey: configured ? Buffer.alloc(32, 7).toString("base64") : "", calendarFetch, calendarVerifyToken: async () => ({ sub: fake.sub, email: `${fake.sub}@example.test`, email_verified: fake.verified, nonce: fake.nonce }) } });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", user = 2, data = {}) => fetch(base + path, { method, redirect: "manual", headers: { Cookie: `giasu_session=session-${user}`, "Content-Type": "application/json" }, ...(method !== "GET" ? { body: JSON.stringify(data) } : {}) });
  async function start(user = 2) {
    const response = await request("/api/account/google-calendar/connect", "POST", user);
    assert.equal(response.status, 200);
    const url = new URL((await response.json()).url); fake.nonce = url.searchParams.get("nonce");
    return { url, user, cookie: response.headers.getSetCookie()[0].split(";")[0] };
  }
  async function callback(flow, { cookie, query = "", session = flow.user } = {}) {
    return fetch(`${base}/api/auth/google/callback?state=${flow.url.searchParams.get("state")}&code=test${query}`, { redirect: "manual", headers: { Cookie: `${cookie ?? flow.cookie}; giasu_session=session-${session}` } });
  }
  return { db, app, fake, request, start, callback, lesson, base };
}

test("calendar consent requires the current verified session, PKCE, browser state, nonce and exact narrow scope", async t => {
  const { db, fake, request, start, callback, base } = await setup(t);
  assert.equal((await request("/api/account/google-calendar/connect", "POST", 0)).status, 401);
  assert.equal((await request("/api/account/google-calendar/connect", "POST", 1)).status, 403);
  assert.equal((await fetch(base + "/api/account/google-calendar/connect", { method: "POST", headers: { Origin: "https://evil.test", Cookie: "giasu_session=session-2", "Content-Type": "application/json" }, body: "{}" })).status, 403);
  const flow = await start();
  assert.equal(flow.url.origin, "https://accounts.google.com");
  assert.equal(flow.url.searchParams.get("scope"), `openid email ${calendarScope}`);
  assert.equal(flow.url.searchParams.get("access_type"), "offline");
  assert.equal(flow.url.searchParams.get("code_challenge_method"), "S256");
  assert.match((await callback(flow, { cookie: "wrong=browser" })).headers.get("location"), /expired/);
  assert.match((await callback(flow, { session: 4 })).headers.get("location"), /expired/);
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendars").n, 0);
  assert.match((await callback(flow)).headers.get("location"), /calendar=connected/);
  assert.match((await callback(flow)).headers.get("location"), /expired/);
  assert.equal(one(db, "SELECT COUNT(*) n FROM oauth_identities").n, 0, "Calendar consent does not link or change login identities");
  let retry = await start(); fake.nonce = "wrong";
  assert.match((await callback(retry)).headers.get("location"), /failed/);
  retry = await start(); fake.fail = "scope";
  assert.match((await callback(retry)).headers.get("location"), /permission/);
  fake.fail = ""; retry = await start();
  assert.match((await callback(retry, { query: "&error=access_denied" })).headers.get("location"), /cancelled/);
  retry = await start(); run(db, "DELETE FROM sessions WHERE user_id=2");
  assert.match((await callback(retry)).headers.get("location"), /expired/);
});

test("calendar sync exports only the user's confirmed lessons, encrypts credentials and reuses its own calendar", async t => {
  const { db, app, fake, request, start, callback } = await setup(t);
  await callback(await start());
  const connection = one(db, "SELECT * FROM google_calendars WHERE user_id=2");
  assert.notEqual(connection.refresh_token, "test-refresh-token");
  assert.equal(app.locals.calendarSync.decrypt(connection.refresh_token, 2), "test-refresh-token");
  assert.throws(() => app.locals.calendarSync.decrypt(connection.refresh_token, 4));
  const status = await (await request("/api/account/google-calendar")).json();
  assert.equal(status.connected, true); assert.ok(status.lastSynced);
  assert.ok(!JSON.stringify(status).includes("token"));
  const events = [...fake.calendars.get(connection.calendar_id).values()];
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, "Toán · Person 3");
  assert.equal(events[0].start.dateTime, "2030-01-07T16:30:00.000Z");
  assert.equal(events[0].end.dateTime, "2030-01-07T18:00:00.000Z");
  assert.ok(!events[0].attendees, "No invitations are sent to other users");
  await app.locals.calendarSync.syncUser(2);
  assert.equal(fake.calls.filter(c => c.method === "POST" && c.url.includes("/events")).length, 2);
  await callback(await start()); assert.equal(fake.calendars.size, 1);
  fake.sub = "another-account";
  assert.match((await callback(await start())).headers.get("location"), /account_changed/);
  assert.equal(one(db, "SELECT subject FROM google_calendars WHERE user_id=2").subject, "google-2");
  await callback(await start(3));
  const tutor = one(db, "SELECT * FROM google_calendars WHERE user_id=3");
  assert.equal(fake.calendars.get(tutor.calendar_id).size, 3);
  assert.match([...fake.calendars.get(tutor.calendar_id).values()][0].summary, /Person 2/);
});

test("background sync updates notes, removes cancelled lessons and survives ambiguous event responses without duplicates", async t => {
  const { db, app, fake, start, callback } = await setup(t);
  fake.lostEvent = true; await callback(await start());
  assert.equal(one(db, "SELECT error FROM google_calendars").error, "temporary");
  await app.locals.calendarSync.syncUser(2);
  const calendar = [...fake.calendars.values()][0]; assert.equal(calendar.size, 2);
  run(db, "UPDATE bookings SET lesson_note='Bài 1–5',meeting_url='https://meet.google.com/example' WHERE id=1");
  run(db, "UPDATE bookings SET status='cancelled' WHERE id=2");
  run(db, "UPDATE google_calendars SET next_sync=0");
  await app.locals.calendarSync.syncDue();
  assert.equal(calendar.size, 1);
  assert.match([...calendar.values()][0].description, /Bài 1–5/);
  assert.match([...calendar.values()][0].description, /meet.google.com/);
  assert.equal(all(db, "SELECT * FROM google_calendar_events WHERE user_id=2").length, 1);
});

test("calendar jobs have a bounded batch, serialize concurrent requests and stop after disconnect", async t => {
  const { db, app, fake, start, callback, lesson, request } = await setup(t);
  for (let id = 10; id < 23; id++) lesson(id);
  await callback(await start());
  assert.equal([...fake.calendars.values()][0].size, 10);
  assert.equal(one(db, "SELECT last_synced FROM google_calendars").last_synced, null);
  let release; fake.delay = new Promise(resolve => { release = resolve; });
  const first = app.locals.calendarSync.syncUser(2);
  await app.locals.calendarSync.syncUser(2);
  release(); await first;
  assert.equal([...fake.calendars.values()][0].size, 15);
  assert.ok(one(db, "SELECT last_synced FROM google_calendars").last_synced);
  await request("/api/account/google-calendar", "DELETE");
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendars").n, 0);
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendar_events").n, 0);
  const before = fake.calls.length; await app.locals.calendarSync.syncDue();
  assert.equal(fake.calls.length, before);
  assert.equal([...fake.calendars.values()][0].size, 15, "Disconnect preserves existing Google events");
});

test("revoked credentials pause automatic retries and deleted accounts lose stored Calendar authorization", async t => {
  const { db, app, fake, start, callback, request } = await setup(t);
  fake.fail = "revoked";
  const flow = await start();
  assert.match((await callback(flow)).headers.get("location"), /failed/);
  fake.fail = ""; await callback(await start());
  // A fresh service has no cached access token and detects invalid_grant.
  const { createCalendarSync } = await import("../server/google-calendar-sync.js");
  const paused = createCalendarSync(db, { origin: "http://127.0.0.1:4174", google: { clientId: "client", clientSecret: "secret", calendarTokenKey: Buffer.alloc(32, 7).toString("base64"), calendarFetch: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) } });
  run(db, "UPDATE bookings SET lesson_note='Changed after revocation' WHERE id=1");
  await paused.syncUser(2);
  assert.equal(one(db, "SELECT error FROM google_calendars").error, "reconnect");
  const before = fake.calls.length; run(db, "UPDATE google_calendars SET next_sync=0");
  await app.locals.calendarSync.syncDue(); assert.equal(fake.calls.length, before);
  assert.equal((await request("/api/admin/users/2", "DELETE", 1, { email: "user2@example.test" })).status, 200);
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendars").n, 0);
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendar_events").n, 0);
});

test("missing configuration and disabled Google API are explicit and cannot leak tokens", async t => {
  const disabled = await setup(t, { configured: false });
  assert.equal((await (await disabled.request("/api/account/google-calendar")).json()).available, false);
  assert.equal((await disabled.request("/api/account/google-calendar/connect", "POST")).status, 503);
  const { db, fake, start, callback, request } = await setup(t);
  fake.fail = "disabled"; await callback(await start());
  const status = await (await request("/api/account/google-calendar")).json();
  assert.equal(status.error, "api_disabled"); assert.equal(status.lastSynced, null);
  assert.equal(one(db, "SELECT calendar_id FROM google_calendars").calendar_id, "");
});

test("disconnect cancels an in-flight authorization callback without resurrecting the connection", async t => {
  const { db, fake, start, callback, request } = await setup(t);
  const flow = await start();
  let release; fake.delay = new Promise(resolve => { release = resolve; });
  const pending = callback(flow);
  while (!fake.calls.length) await new Promise(resolve => setTimeout(resolve, 5));
  await request("/api/account/google-calendar", "DELETE");
  release();
  assert.match((await pending).headers.get("location"), /expired/);
  assert.equal(one(db, "SELECT COUNT(*) n FROM google_calendars").n, 0);
  assert.equal(fake.calendars.size, 0);
});

test("one deleted Google event is recreated without stopping sync; a deleted calendar is reported", async t => {
  const { db, app, fake, start, callback, lesson } = await setup(t);
  await callback(await start());
  const connection = one(db, "SELECT * FROM google_calendars");
  const mapping = one(db, "SELECT * FROM google_calendar_events WHERE booking_id=1");
  const calendar = fake.calendars.get(connection.calendar_id);
  calendar.delete(mapping.event_id);
  run(db, "UPDATE bookings SET lesson_note='After Google deletion' WHERE id=1");
  await app.locals.calendarSync.syncUser(2);
  assert.equal(calendar.size, 2);
  assert.notEqual(one(db, "SELECT event_id FROM google_calendar_events WHERE booking_id=1").event_id, mapping.event_id);
  assert.equal(one(db, "SELECT error FROM google_calendars").error, "");
  fake.calendars.delete(connection.calendar_id); lesson(6);
  await app.locals.calendarSync.syncUser(2);
  assert.equal(one(db, "SELECT error FROM google_calendars").error, "calendar_missing");
});

test("suspending the last connected account preserves the scheduler so reactivation resumes sync", async t => {
  const { db, app, fake, start, callback } = await setup(t);
  await callback(await start());
  run(db, "UPDATE users SET status='suspended' WHERE id=2");
  run(db, "UPDATE bookings SET lesson_note='Updated while suspended' WHERE id=1");
  run(db, "UPDATE google_calendars SET next_sync=0");
  const calls = fake.calls.length;
  await app.locals.calendarSync.syncDue();
  assert.equal(fake.calls.length, calls);
  assert.equal(app.locals.calendarSync.hasConnections(), true, "The DO must retain its next alarm");
  run(db, "UPDATE users SET status='active' WHERE id=2");
  await app.locals.calendarSync.syncDue();
  assert.ok(fake.calls.length > calls);
  assert.match([...fake.calendars.values()][0].values().next().value.description, /Updated while suspended/);
});
