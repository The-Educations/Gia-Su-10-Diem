export function migrateGoogleCalendar(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS google_calendar_states (
      state TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, session_hash TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS google_calendars (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      generation TEXT NOT NULL, subject TEXT NOT NULL, email TEXT NOT NULL,
      refresh_token TEXT NOT NULL, calendar_id TEXT NOT NULL DEFAULT '',
      last_synced INTEGER, next_sync INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS google_calendar_events (
      user_id INTEGER NOT NULL REFERENCES google_calendars(user_id) ON DELETE CASCADE,
      booking_id INTEGER NOT NULL, event_id TEXT NOT NULL, content_hash TEXT NOT NULL,
      PRIMARY KEY(user_id,booking_id)
    );
    CREATE INDEX IF NOT EXISTS google_calendar_due ON google_calendars(next_sync);
  `);
  if (!db.prepare("PRAGMA table_info(google_calendar_states)").all().some(c => c.name === "claimed")) db.exec("ALTER TABLE google_calendar_states ADD COLUMN claimed INTEGER NOT NULL DEFAULT 0");
}
