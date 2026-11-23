import { all, one, run } from "./db.js";
import { z } from "./validation.js";

export function migrateNotifications(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, actor_name TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at TEXT);
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at, id);`);
  db.exec(`CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL,
    actor_name TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0, sending_until INTEGER NOT NULL DEFAULT 0, sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS email_outbox_pending ON email_outbox(sent_at, id);`);
  if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "email_prefs"))
    db.exec("ALTER TABLE users ADD COLUMN email_prefs TEXT NOT NULL DEFAULT '{}'");
}

// Which important events also arrive by email. Everything is on until the person turns it off.
export const EMAIL_TOPICS = ["proposals", "money", "lessons"];
export function emailPrefs(db, userId) {
  let stored = {};
  try { stored = JSON.parse(one(db, "SELECT email_prefs FROM users WHERE id=?", userId)?.email_prefs || "{}"); } catch { /* keep defaults */ }
  return Object.fromEntries(EMAIL_TOPICS.map((k) => [k, stored[k] !== false]));
}

// The important notices that also go out by email, grouped by the switch that controls them.
export const EMAIL_KINDS = {
  proposal_new: "proposals", proposal_accepted: "proposals", proposal_declined: "proposals",
  deposit_received: "money", package_settled: "money", withdrawal_paid: "money", withdrawal_rejected: "money",
  session_confirm: "lessons", session_move: "lessons",
};

// The client turns `kind` into words, so every language reads the same row.
// Unread message notices for one conversation collapse into the latest.
export function notify(db, userId, kind, { actor = "", subject = "", link = "" } = {}) {
  if (!userId) return;
  if (kind === "message_new") {
    const existing = one(db, "SELECT id FROM notifications WHERE user_id=? AND kind=? AND link=? AND read_at IS NULL", userId, kind, link);
    if (existing) return run(db, "UPDATE notifications SET actor_name=?,created_at=CURRENT_TIMESTAMP WHERE id=?", actor, existing.id);
  }
  run(db, "INSERT INTO notifications(user_id,kind,actor_name,subject,link) VALUES (?,?,?,?,?)", userId, kind, actor, subject, link);
  // Queued with the change itself; sent after the request by the mail flusher.
  if (EMAIL_KINDS[kind] && emailPrefs(db, userId)[EMAIL_KINDS[kind]])
    run(db, "INSERT INTO email_outbox(user_id,kind,actor_name,subject,link) VALUES (?,?,?,?,?)", userId, kind, actor, subject, link);
}

export function registerNotifications(app, db, auth) {
  app.get("/api/notifications", auth(), (req, res) => {
    res.json(all(db, "SELECT id,kind,actor_name,subject,link,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100", req.user.id));
  });
  app.get("/api/notifications/unread-count", auth(), (req, res) => {
    res.json(one(db, "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL", req.user.id));
  });
  app.get("/api/account/notifications", auth(), (req, res) => res.json(emailPrefs(db, req.user.id)));
  app.put("/api/account/notifications", auth(), (req, res) => {
    const d = z.object(Object.fromEntries(EMAIL_TOPICS.map((k) => [k, z.boolean()]))).partial().strict().parse(req.body);
    run(db, "UPDATE users SET email_prefs=? WHERE id=?", JSON.stringify({ ...emailPrefs(db, req.user.id), ...d }), req.user.id);
    res.json(emailPrefs(db, req.user.id));
  });
  app.post("/api/notifications/read", auth(), (req, res) => {
    const d = z.union([z.object({ id: z.number().int().positive() }).strict(), z.object({ all: z.literal(true) }).strict()]).parse(req.body);
    if ("all" in d) run(db, "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL", req.user.id);
    else run(db, "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND id=? AND read_at IS NULL", req.user.id, d.id);
    res.json({ ok: true });
  });
}
