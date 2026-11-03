import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { all, one, run } from "./db.js";

export const calendarScope = "https://www.googleapis.com/auth/calendar.app.created";
const hash = value => createHash("sha256").update(value).digest("hex");
const pauseErrors = new Set(["reconnect", "permission", "calendar_missing", "setup_uncertain"]);
export class CalendarError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}
export function createCalendarSync(db, { origin, google = {} }) {
  const { clientId, clientSecret, calendarTokenKey, calendarFetch = fetch } = google;
  const key = Buffer.from(calendarTokenKey || "", "base64");
  const enabled = !!(clientId && clientSecret && key.length === 32);
  const accessTokens = new Map();
  const current = (c) => one(db, "SELECT c.* FROM google_calendars c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND c.generation=? AND u.status='active' AND u.role IN ('student','tutor')", c.user_id, c.generation);
  function encrypt(token, userId) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`${origin}:${userId}`));
    const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return [iv, data, cipher.getAuthTag()].map(b => b.toString("base64url")).join(".");
  }
  function decrypt(value, userId) {
    const [iv, data, tag] = value.split(".").map(s => Buffer.from(s, "base64url"));
    const cipher = createDecipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(`${origin}:${userId}`)); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
  }
  async function request(url, options = {}) {
    let response;
    try { response = await calendarFetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(10000) }); }
    catch { throw new CalendarError("temporary"); }
    const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason;
      const code = data.error === "invalid_grant" || response.status === 401 ? "reconnect"
        : reason === "accessNotConfigured" || reason === "serviceDisabled" ? "api_disabled"
        : response.status === 403 && !["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"].includes(reason) ? "permission"
        : "temporary";
      throw new CalendarError(code, response.status);
    }
    return data;
  }
  async function token(c) {
    const cached = accessTokens.get(c.generation);
    if (cached && cached.expires > Date.now()) return cached.value;
    let refresh;
    try { refresh = decrypt(c.refresh_token, c.user_id); } catch { throw new CalendarError("reconnect"); }
    const data = await request("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refresh }),
    });
    if (typeof data.access_token !== "string" || data.access_token.length > 16384 || !data.access_token) throw new CalendarError("reconnect");
    accessTokens.set(c.generation, { value: data.access_token, expires: Date.now() + Math.max(0, Math.min(Number(data.expires_in) || 0, 3600) - 60) * 1000 });
    return data.access_token;
  }
  async function api(c, path, method = "GET", body) {
    if (!current(c)) throw new CalendarError("disconnected");
    const bearer = await token(c);
    if (!current(c)) throw new CalendarError("disconnected");
    return request(`https://www.googleapis.com/calendar/v3${path}`, {
      method, headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  function eventFor(b, userId) {
    return {
      summary: `${b.subject_name} · ${b.tutor_id === userId ? b.student_name : b.tutor_name}`,
      description: [b.mode === "online" ? "Trực tuyến" : "Trực tiếp", b.note, b.lesson_note, b.meeting_url, `${origin}/app/bookings?lesson=${b.id}`].filter(Boolean).join("\n\n"),
      start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: "Asia/Ho_Chi_Minh" },
      end: { dateTime: new Date(Date.parse(b.starts_at) + b.duration_minutes * 60000).toISOString(), timeZone: "Asia/Ho_Chi_Minh" },
      extendedProperties: { private: { giasuBooking: String(b.id), giasuOwner: hash(`${origin}:${userId}`) } },
    };
  }
  async function syncUser(userId) {
    if (!enabled) return;
    const c = one(db, "SELECT c.* FROM google_calendars c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND u.status='active' AND u.role IN ('student','tutor')", userId);
    if (!c || pauseErrors.has(c.error)) return;
    if (!run(db, "UPDATE google_calendars SET lease_until=? WHERE user_id=? AND generation=? AND lease_until<?", Date.now() + 600000, userId, c.generation, Date.now()).changes) return;
    try {
      if (c.calendar_id === "creating") throw new CalendarError("setup_uncertain");
      if (!c.calendar_id) {
        // Do not automatically create a second calendar after an ambiguous timeout/crash.
        await token(c);
        if (!current(c)) return;
        run(db, "UPDATE google_calendars SET calendar_id='creating' WHERE user_id=? AND generation=?", userId, c.generation);
        let calendar;
        try { calendar = await api(c, "/calendars", "POST", { summary: "Gia Sư 10 Điểm", timeZone: "Asia/Ho_Chi_Minh" }); }
        catch (e) {
          if (e.status >= 400 && e.status < 500) run(db, "UPDATE google_calendars SET calendar_id='' WHERE user_id=? AND generation=?", userId, c.generation);
          else throw new CalendarError("setup_uncertain");
          throw e;
        }
        if (typeof calendar.id !== "string" || !calendar.id || calendar.id.length > 1024) throw new CalendarError("setup_uncertain");
        if (!current(c)) return;
        c.calendar_id = calendar.id;
        run(db, "UPDATE google_calendars SET calendar_id=? WHERE user_id=? AND generation=?", c.calendar_id, userId, c.generation);
      }
      const lessons = all(db, `SELECT b.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name
        FROM bookings b JOIN users s ON s.id=b.student_id JOIN users t ON t.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id
        WHERE (b.student_id=? OR b.tutor_id=?) AND b.status IN ('accepted','completed') ORDER BY b.starts_at,b.id`, userId, userId);
      const stored = all(db, "SELECT * FROM google_calendar_events WHERE user_id=?", userId);
      const ids = new Set(lessons.map(b => b.id));
      const changes = lessons.map(b => {
        const event = eventFor(b, userId), digest = hash(JSON.stringify(event));
        return { booking: b, event, digest, stored: stored.find(row => row.booking_id === b.id) };
      }).filter(row => row.digest !== row.stored?.content_hash);
      const removals = stored.filter(row => !ids.has(row.booking_id));
      let count = 0;
      const path = `/calendars/${encodeURIComponent(c.calendar_id)}/events`;
      for (const row of removals) {
        if (count++ >= 10) break;
        try { await api(c, `${path}/${row.event_id}?sendUpdates=none`, "DELETE"); }
        catch (e) { if (![404, 410].includes(e.status)) throw e; }
        if (!current(c)) return;
        run(db, "DELETE FROM google_calendar_events WHERE user_id=? AND booking_id=?", userId, row.booking_id);
      }
      for (const row of changes) {
        if (count++ >= 10) break;
        if (!current(c)) return;
        // Persist the ID before the network call so a lost response is safe to retry.
        let eventId = row.stored?.event_id || `gs${hash(`${c.generation}:${row.booking.id}`)}`;
        if (!row.stored) run(db, "INSERT INTO google_calendar_events VALUES (?,?,?,'')", userId, row.booking.id, eventId);
        const checkCalendar = async () => {
          try { await api(c, `/calendars/${encodeURIComponent(c.calendar_id)}`); }
          catch (e) { if ([404, 410].includes(e.status)) throw new CalendarError("calendar_missing"); throw e; }
        };
        const insert = async () => {
          try { await api(c, `${path}?sendUpdates=none`, "POST", { id: eventId, ...row.event }); }
          catch (e) {
            if ([404, 410].includes(e.status)) { await checkCalendar(); throw e; }
            if (e.status !== 409) throw e;
            const existing = await api(c, `${path}/${eventId}`);
            if (existing.extendedProperties?.private?.giasuOwner !== row.event.extendedProperties.private.giasuOwner || existing.extendedProperties?.private?.giasuBooking !== String(row.booking.id)) throw new CalendarError("permission");
            await api(c, `${path}/${eventId}?sendUpdates=none`, "PATCH", row.event);
          }
        };
        if (row.stored?.content_hash) {
          try { await api(c, `${path}/${eventId}?sendUpdates=none`, "PATCH", row.event); }
          catch (e) {
            if (![404, 410].includes(e.status)) throw e;
            await checkCalendar();
            if (!current(c)) return;
            eventId = `gs${randomBytes(24).toString("hex")}`;
            run(db, "UPDATE google_calendar_events SET event_id=?,content_hash='' WHERE user_id=? AND booking_id=?", eventId, userId, row.booking.id);
            await insert();
          }
        } else await insert();
        if (!current(c)) return;
        run(db, "UPDATE google_calendar_events SET content_hash=? WHERE user_id=? AND booking_id=?", row.digest, userId, row.booking.id);
      }
      const complete = changes.length + removals.length <= 10;
      run(db, "UPDATE google_calendars SET error='',next_sync=?,last_synced=CASE WHEN ? THEN ? ELSE last_synced END WHERE user_id=? AND generation=?", Date.now() + (complete ? 60000 : 1000), complete ? 1 : 0, Date.now(), userId, c.generation);
    } catch (e) {
      const code = e instanceof CalendarError ? e.code : "temporary";
      if (code === "reconnect") accessTokens.delete(c.generation);
      run(db, "UPDATE google_calendars SET error=?,next_sync=? WHERE user_id=? AND generation=?", code, Date.now() + 300000, userId, c.generation);
    } finally {
      run(db, "UPDATE google_calendars SET lease_until=0 WHERE user_id=? AND generation=?", userId, c.generation);
    }
  }
  async function syncDue() {
    if (!enabled) return;
    const due = all(db, "SELECT c.user_id FROM google_calendars c JOIN users u ON u.id=c.user_id WHERE c.next_sync<=? AND c.lease_until<? AND c.error NOT IN ('reconnect','permission','calendar_missing','setup_uncertain') AND u.status='active' AND u.role IN ('student','tutor') ORDER BY c.next_sync LIMIT 5", Date.now(), Date.now());
    await Promise.all(due.map(row => syncUser(row.user_id)));
  }
  function hasConnections() { return enabled && !!one(db, "SELECT user_id FROM google_calendars LIMIT 1"); }
  function status(userId) {
    const c = one(db, "SELECT email,calendar_id,last_synced,error FROM google_calendars WHERE user_id=?", userId);
    return { available: enabled, connected: !!c, email: c?.email || "", lastSynced: c?.last_synced || null, error: c?.error || "", calendarUrl: c?.calendar_id && c.calendar_id !== "creating" ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.calendar_id)}` : "" };
  }
  async function disconnect(userId) {
    const c = one(db, "SELECT * FROM google_calendars WHERE user_id=?", userId);
    run(db, "DELETE FROM google_calendar_states WHERE user_id=?", userId);
    run(db, "DELETE FROM google_calendars WHERE user_id=?", userId);
    if (c) {
      accessTokens.delete(c.generation);
      try { await request("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(c.refresh_token, userId) }) }); } catch { /* Local authorization has already been removed. */ }
    }
  }
  return { enabled, encrypt, decrypt, request, syncUser, syncDue, hasConnections, status, disconnect };
}
