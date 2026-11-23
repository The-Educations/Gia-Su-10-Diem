import { all, one, run } from "./db.js";
import { z } from "./validation.js";

// Personal events on a person's own calendar: study blocks, exams, meetings.
// They sit beside lessons but never change them, and only their owner sees them.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const EVENT_COLORS = ["rose", "sky", "sage", "butter", "lilac", "peach", "mint", "sand"];

export function migrateCalendarEvents(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'sky', note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS calendar_events_user ON calendar_events(user_id, starts_at);`);
}

const schema = z.object({
  title: z.string().trim().min(1, "Nhập tên sự kiện.").max(120),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  color: z.enum(EVENT_COLORS).default("sky"),
  note: z.string().trim().max(1000).default(""),
}).refine((d) => Date.parse(d.ends_at) > Date.parse(d.starts_at), { message: "Giờ kết thúc phải sau giờ bắt đầu.", path: ["ends_at"] })
  .refine((d) => Date.parse(d.ends_at) - Date.parse(d.starts_at) <= 14 * 86400000, { message: "Một sự kiện dài tối đa 14 ngày.", path: ["ends_at"] });

export function registerCalendarEvents(app, db, auth) {
  const own = (req) => {
    const e = one(db, "SELECT * FROM calendar_events WHERE id=? AND user_id=?", z.coerce.number().int().positive().parse(req.params.id), req.user.id);
    if (!e) fail(404, "Không tìm thấy sự kiện.");
    return e;
  };
  app.get("/api/calendar-events", auth(), (req, res) => {
    const q = z.object({ from: z.string().max(30), to: z.string().max(30) }).parse(req.query);
    res.json(all(db, "SELECT * FROM calendar_events WHERE user_id=? AND ends_at>? AND starts_at<? ORDER BY starts_at", req.user.id, q.from, q.to));
  });
  app.post("/api/calendar-events", auth(), (req, res) => {
    const d = schema.parse(req.body);
    if (one(db, "SELECT COUNT(*) n FROM calendar_events WHERE user_id=?", req.user.id).n >= 2000) fail(409, "Lịch đã đủ 2.000 sự kiện. Xóa bớt sự kiện cũ.");
    const id = run(db, "INSERT INTO calendar_events(user_id,title,starts_at,ends_at,color,note) VALUES (?,?,?,?,?,?)", req.user.id, d.title, d.starts_at, d.ends_at, d.color, d.note).lastInsertRowid;
    res.status(201).json(one(db, "SELECT * FROM calendar_events WHERE id=?", id));
  });
  app.put("/api/calendar-events/:id", auth(), (req, res) => {
    const e = own(req), d = schema.parse(req.body);
    run(db, "UPDATE calendar_events SET title=?,starts_at=?,ends_at=?,color=?,note=? WHERE id=?", d.title, d.starts_at, d.ends_at, d.color, d.note, e.id);
    res.json(one(db, "SELECT * FROM calendar_events WHERE id=?", e.id));
  });
  app.delete("/api/calendar-events/:id", auth(), (req, res) => {
    const e = own(req);
    run(db, "DELETE FROM calendar_events WHERE id=?", e.id);
    res.json({ ok: true });
  });
}
