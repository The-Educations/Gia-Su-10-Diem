import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password, hash) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || "")) return false;
  const [salt, stored] = hash.split(":");
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(stored, "hex"));
}
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export function migrateDatabase(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','tutor','admin')),
      status TEXT NOT NULL DEFAULT 'active', goal TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL, stage TEXT NOT NULL, description TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tutors (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), headline TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT 'Trực tuyến', mode TEXT NOT NULL DEFAULT 'online', rate INTEGER NOT NULL DEFAULT 150000,
      experience INTEGER NOT NULL DEFAULT 0, education TEXT NOT NULL DEFAULT '', subjects TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending', moderation_note TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS slots (id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES tutors(user_id), starts_at TEXT NOT NULL, UNIQUE(tutor_id, starts_at));
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id), tutor_id INTEGER NOT NULL REFERENCES tutors(user_id),
      slot_id INTEGER NOT NULL REFERENCES slots(id), subject_id TEXT NOT NULL REFERENCES subjects(id),
      starts_at TEXT NOT NULL, rate INTEGER NOT NULL, mode TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', lesson_note TEXT NOT NULL DEFAULT '', meeting_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX IF NOT EXISTS reserved_slot ON bookings(slot_id) WHERE status IN ('pending','accepted','completed');
    CREATE TABLE IF NOT EXISTS favorites (student_id INTEGER NOT NULL REFERENCES users(id), tutor_id INTEGER NOT NULL REFERENCES tutors(user_id), PRIMARY KEY(student_id,tutor_id));
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS reviews (booking_id INTEGER PRIMARY KEY REFERENCES bookings(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, subject_id TEXT NOT NULL REFERENCES subjects(id), category TEXT NOT NULL,
      level TEXT NOT NULL, year INTEGER NOT NULL,
      description TEXT NOT NULL, source_name TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, target TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  `);
  // Additive migration: keep existing accounts and bookings intact.
  const tutorColumns = db
    .prepare("PRAGMA table_info(tutors)")
    .all()
    .map((c) => c.name);
  for (const name of ["levels", "goals"]) {
    if (!tutorColumns.includes(name))
      db.exec(
        `ALTER TABLE tutors ADD COLUMN ${name} TEXT NOT NULL DEFAULT '[]'`,
      );
  }
  for (const [name, fallback] of Object.entries({
    teaching_style: "",
    lesson_plan: "",
    profile_theme: "paper",
  })) {
    if (!tutorColumns.includes(name))
      db.exec(
        `ALTER TABLE tutors ADD COLUMN ${name} TEXT NOT NULL DEFAULT '${fallback}'`,
      );
  }
  db.exec(`CREATE TABLE IF NOT EXISTS tutor_uploads (
    id TEXT PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES tutors(user_id),
    kind TEXT NOT NULL CHECK(kind IN ('photo','cv')), data BLOB NOT NULL, mime TEXT NOT NULL,
    name TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tutor_id,kind));
    CREATE TABLE IF NOT EXISTS inquiries (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id),
    tutor_id INTEGER NOT NULL REFERENCES tutors(user_id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id,tutor_id));
    CREATE TABLE IF NOT EXISTS inquiry_messages (id INTEGER PRIMARY KEY, inquiry_id INTEGER NOT NULL REFERENCES inquiries(id),
    sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS tutor_gallery (id TEXT PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES tutors(user_id), caption TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS gallery_tutor ON tutor_gallery(tutor_id);
    CREATE TABLE IF NOT EXISTS gallery_chunks (image_id TEXT NOT NULL REFERENCES tutor_gallery(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(image_id,part));
    CREATE TABLE IF NOT EXISTS demo_seeds (key TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS oauth_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(provider,subject), UNIQUE(provider,user_id));
    CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, role TEXT NOT NULL, next TEXT NOT NULL, link_user_id INTEGER REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS upload_chunks (upload_id TEXT NOT NULL REFERENCES tutor_uploads(id) ON DELETE CASCADE, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(upload_id,part));
`);
  return db;
}
export const all = (db, sql, ...args) => db.prepare(sql).all(...args);
export const one = (db, sql, ...args) => db.prepare(sql).get(...args);
export const run = (db, sql, ...args) => db.prepare(sql).run(...args);
export const publicUser = (u) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        goal: u.goal,
        demo: !!u.demo,
      }
    : null;

export function transaction(db, callback) {
  if (db.transactionSync) return db.transactionSync(callback);
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
