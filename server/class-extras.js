import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { childrenOf } from "./family.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idParam = (value) => z.coerce.number().int().positive().parse(value);

export function migrateClassExtras(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS session_notes (
    session_id INTEGER PRIMARY KEY REFERENCES class_sessions(id), body TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), session_id INTEGER REFERENCES class_sessions(id),
    title TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', due_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS assignments_class ON assignments(class_id, due_at);
  CREATE TABLE IF NOT EXISTS assignment_submissions (
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE, member_id INTEGER NOT NULL REFERENCES class_members(id),
    status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '', feedback TEXT NOT NULL DEFAULT '',
    submitted_at TEXT, reviewed_at TEXT, PRIMARY KEY(assignment_id, member_id));
  CREATE TABLE IF NOT EXISTS class_posts (
    id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS class_posts_class ON class_posts(class_id, id);`);
}

function classOf(db, classId) {
  const c = one(db, "SELECT c.*,t.name AS tutor_name FROM classes c JOIN users t ON t.id=c.tutor_id WHERE c.id=?", classId);
  if (!c) fail(404, "Không tìm thấy lớp.");
  return c;
}
function canSeeClass(db, user, c) {
  if (user.role === "admin" || c.tutor_id === user.id) return true;
  const kids = childrenOf(db, user.id);
  return !!one(db, `SELECT 1 FROM class_members WHERE class_id=? AND student_id IN (${[user.id, ...kids].map(() => "?").join(",") || "NULL"}) LIMIT 1`, c.id, user.id, ...kids);
}
function visibleClass(db, user, classId) {
  const c = classOf(db, classId);
  if (!canSeeClass(db, user, c)) fail(404, "Không tìm thấy lớp.");
  return c;
}
function ownTutorClass(db, user, classId) {
  const c = classOf(db, classId);
  if (c.tutor_id !== user.id) fail(404, "Không tìm thấy lớp.");
  return c;
}
function createSubmissionRows(db, assignmentId, classId) {
  for (const m of all(db, "SELECT id FROM class_members WHERE class_id=? AND status='active'", classId))
    run(db, "INSERT OR IGNORE INTO assignment_submissions(assignment_id,member_id) VALUES (?,?)", assignmentId, m.id);
}
export function backfillAssignmentRows(db) {
  for (const a of all(db, "SELECT id,class_id FROM assignments")) createSubmissionRows(db, a.id, a.class_id);
}

function submissionCounts(db, assignmentId) {
  return one(db, `SELECT COUNT(*) total,
    COUNT(*) FILTER (WHERE status IN ('submitted','reviewed')) submitted,
    COUNT(*) FILTER (WHERE status='submitted') waiting_review,
    COUNT(*) FILTER (WHERE status='reviewed') reviewed
    FROM assignment_submissions WHERE assignment_id=?`, assignmentId) || { total: 0, submitted: 0, waiting_review: 0, reviewed: 0 };
}
export function assignmentBadge(db, classId, user) {
  const kids = childrenOf(db, user.id);
  if (user.role === "tutor" || user.role === "admin")
    return one(db, `SELECT COUNT(*) n FROM assignments a JOIN assignment_submissions s ON s.assignment_id=a.id
      WHERE a.class_id=? AND s.status='submitted'`, classId).n;
  return one(db, `SELECT COUNT(*) n FROM assignments a JOIN assignment_submissions s ON s.assignment_id=a.id
    JOIN class_members m ON m.id=s.member_id WHERE a.class_id=? AND s.status='pending'
    AND m.student_id IN (${[user.id, ...kids].map(() => "?").join(",") || "NULL"})`, classId, user.id, ...kids).n;
}
export function classExtrasPayload(db, classId, user) {
  backfillAssignmentRows(db);
  const kids = childrenOf(db, user.id), privileged = user.role === "admin" || one(db, "SELECT 1 FROM classes WHERE id=? AND tutor_id=?", classId, user.id);
  const assignments = all(db, `SELECT a.*,cs.starts_at AS session_starts_at FROM assignments a LEFT JOIN class_sessions cs ON cs.id=a.session_id
    WHERE a.class_id=? ORDER BY COALESCE(a.due_at,'9999') , a.id DESC`, classId).map((a) => {
    const rows = all(db, `SELECT s.*,m.student_id,u.name AS student_name FROM assignment_submissions s
      JOIN class_members m ON m.id=s.member_id JOIN users u ON u.id=m.student_id WHERE s.assignment_id=? ORDER BY u.name`, a.id);
    return {
      ...a,
      ...submissionCounts(db, a.id),
      submissions: privileged ? rows : rows.filter((s) => s.student_id === user.id || kids.includes(s.student_id)),
    };
  });
  const posts = all(db, `SELECT p.*,u.name AS author_name FROM class_posts p JOIN users u ON u.id=p.author_id
    WHERE p.class_id=? ORDER BY p.id DESC LIMIT 30`, classId);
  return { assignments, posts, assignment_badge: assignmentBadge(db, classId, user) };
}
export function attachSessionNotes(db, sessions) {
  if (!sessions.length) return sessions;
  const marks = sessions.map(() => "?").join(",");
  const notes = new Map(all(db, `SELECT session_id,body,updated_at FROM session_notes WHERE session_id IN (${marks})`, ...sessions.map((s) => s.id))
    .map((n) => [n.session_id, n]));
  for (const s of sessions) {
    const n = notes.get(s.id);
    s.teacher_note = n?.body || "";
    s.teacher_note_updated_at = n?.updated_at || null;
  }
  return sessions;
}
export function memberProgressStats(db, classId) {
  return new Map(all(db, `SELECT m.id,
    COUNT(sm.session_id) FILTER (WHERE sm.outcome IN ('confirmed','charged')) done,
    COALESCE(SUM(cs.minutes) FILTER (WHERE sm.outcome IN ('confirmed','charged')),0) minutes_done,
    COUNT(sm.session_id) FILTER (WHERE sm.outcome='pending' AND cs.starts_at>?) upcoming
    FROM class_members m LEFT JOIN session_members sm ON sm.member_id=m.id LEFT JOIN class_sessions cs ON cs.id=sm.session_id
    WHERE m.class_id=? GROUP BY m.id`, new Date().toISOString(), classId).map((r) => [r.id, r]));
}
export function tutorClassStats(db, classId) {
  const week = new Date(Date.now() + 7 * 86400000).toISOString(), now = new Date().toISOString();
  const row = one(db, `SELECT COUNT(DISTINCT cs.id) FILTER (WHERE cs.status='scheduled' AND cs.starts_at>? AND cs.starts_at<=?) upcoming_7d,
    COALESCE(SUM(m.rate) FILTER (WHERE sm.outcome IN ('confirmed','charged')),0) gross_confirmed,
    COALESCE(SUM(m.rate) FILTER (WHERE sm.outcome IN ('confirmed','charged') AND sm.settled=1),0) gross_settled
    FROM class_sessions cs LEFT JOIN session_members sm ON sm.session_id=cs.id LEFT JOIN class_members m ON m.id=sm.member_id
    WHERE cs.class_id=?`, now, week, classId) || {};
  return { upcoming_7d: row.upcoming_7d || 0, gross_confirmed: row.gross_confirmed || 0, gross_settled: row.gross_settled || 0 };
}

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const icsText = (text) => String(text || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function registerClassExtras(app, db, auth) {
  app.put("/api/sessions/:id/note", auth("tutor"), (req, res) => {
    const id = idParam(req.params.id), { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    const s = one(db, "SELECT cs.*,c.tutor_id FROM class_sessions cs JOIN classes c ON c.id=cs.class_id WHERE cs.id=?", id);
    if (!s || s.tutor_id !== req.user.id) fail(404, "Không tìm thấy buổi học.");
    run(db, `INSERT INTO session_notes(session_id,body,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET body=excluded.body,updated_at=CURRENT_TIMESTAMP`, id, body);
    res.json(one(db, "SELECT * FROM session_notes WHERE session_id=?", id));
  });

  const assignmentSchema = z.object({
    title: z.string().trim().min(2).max(160), note: z.string().trim().max(2000).default(""),
    due_at: z.union([z.literal(""), z.string().max(40)]).default(""), session_id: z.number().int().positive().nullable().default(null),
  });
  app.post("/api/classes/:id/assignments", auth("tutor"), (req, res) => {
    const c = ownTutorClass(db, req.user, idParam(req.params.id)), d = assignmentSchema.parse(req.body);
    if (d.session_id && !one(db, "SELECT 1 FROM class_sessions WHERE id=? AND class_id=?", d.session_id, c.id)) fail(400, "Buổi học không thuộc lớp này.");
    let id;
    transaction(db, () => {
      id = Number(run(db, "INSERT INTO assignments(class_id,session_id,title,note,due_at) VALUES (?,?,?,?,?)", c.id, d.session_id, d.title, d.note, d.due_at || null).lastInsertRowid);
      createSubmissionRows(db, id, c.id);
      for (const m of all(db, "SELECT student_id FROM class_members WHERE class_id=? AND status='active'", c.id))
        notify(db, m.student_id, "assignment_new", { actor: req.user.name, subject: d.title, link: `/classes/${c.id}?tab=assignments` });
    });
    res.status(201).json(one(db, "SELECT * FROM assignments WHERE id=?", id));
  });
  app.delete("/api/classes/:id/assignments/:aid", auth("tutor"), (req, res) => {
    const c = ownTutorClass(db, req.user, idParam(req.params.id));
    run(db, "DELETE FROM assignment_submissions WHERE assignment_id=? AND member_id IN (SELECT id FROM class_members WHERE class_id=?)", idParam(req.params.aid), c.id);
    run(db, "DELETE FROM assignments WHERE id=? AND class_id=?", idParam(req.params.aid), c.id);
    res.json({ ok: true });
  });
  app.post("/api/assignments/:id/submit", auth("student"), (req, res) => {
    const id = idParam(req.params.id), { note } = z.object({ note: z.string().trim().max(1000).default("") }).parse(req.body);
    const a = one(db, "SELECT a.*,c.tutor_id,c.id class_id FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=?", id);
    const m = a && one(db, "SELECT * FROM class_members WHERE class_id=? AND student_id=? AND status='active'", a.class_id, req.user.id);
    if (!a || !m) fail(404, "Không tìm thấy bài tập.");
    createSubmissionRows(db, id, a.class_id);
    const changed = run(db, "UPDATE assignment_submissions SET status='submitted',note=?,submitted_at=CURRENT_TIMESTAMP,feedback='',reviewed_at=NULL WHERE assignment_id=? AND member_id=?", note, id, m.id).changes;
    if (!changed) fail(404, "Không tìm thấy bài tập.");
    notify(db, a.tutor_id, "assignment_submitted", { actor: req.user.name, subject: a.title, link: `/classes/${a.class_id}?tab=assignments` });
    res.json({ ok: true });
  });
  app.post("/api/assignments/:id/review", auth("tutor"), (req, res) => {
    const id = idParam(req.params.id), d = z.object({ member_id: z.number().int().positive(), feedback: z.string().trim().max(1000).default("") }).parse(req.body);
    const a = one(db, "SELECT a.*,c.tutor_id,c.id class_id FROM assignments a JOIN classes c ON c.id=a.class_id WHERE a.id=?", id);
    if (!a || a.tutor_id !== req.user.id) fail(404, "Không tìm thấy bài tập.");
    const changed = run(db, "UPDATE assignment_submissions SET status='reviewed',feedback=?,reviewed_at=CURRENT_TIMESTAMP WHERE assignment_id=? AND member_id=? AND status='submitted'", d.feedback, id, d.member_id).changes;
    if (!changed) fail(409, "Bài làm này chưa ở trạng thái chờ nhận xét.");
    const m = one(db, "SELECT student_id FROM class_members WHERE id=?", d.member_id);
    if (m) notify(db, m.student_id, "assignment_reviewed", { actor: req.user.name, subject: a.title, link: `/classes/${a.class_id}?tab=assignments` });
    res.json({ ok: true });
  });

  app.post("/api/classes/:id/posts", auth("tutor"), (req, res) => {
    const c = ownTutorClass(db, req.user, idParam(req.params.id));
    const { body } = z.object({ body: z.string().trim().min(2).max(1000) }).parse(req.body);
    let id;
    transaction(db, () => {
      id = Number(run(db, "INSERT INTO class_posts(class_id,author_id,body) VALUES (?,?,?)", c.id, req.user.id, body).lastInsertRowid);
      for (const m of all(db, "SELECT student_id FROM class_members WHERE class_id=? AND status='active'", c.id))
        notify(db, m.student_id, "class_post_new", { actor: req.user.name, subject: c.title, link: `/classes/${c.id}` });
    });
    res.status(201).json(one(db, "SELECT * FROM class_posts WHERE id=?", id));
  });

  app.get("/api/classes/:id/ics", auth(), (req, res) => {
    const c = visibleClass(db, req.user, idParam(req.params.id));
    const rows = all(db, "SELECT * FROM class_sessions WHERE class_id=? AND status='scheduled' ORDER BY starts_at", c.id);
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gia Su 10 Diem//Classes//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    for (const s of rows) {
      const end = new Date(Date.parse(s.starts_at) + s.minutes * 60000).toISOString();
      lines.push("BEGIN:VEVENT", `UID:class-${c.id}-session-${s.id}@giasu10diem`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(s.starts_at)}`, `DTEND:${icsDate(end)}`, `SUMMARY:${icsText(c.title)}`, `DESCRIPTION:${icsText(`Buổi học ${c.title} với ${c.tutor_name}`)}`, s.moved_from ? `LAST-MODIFIED:${icsDate(new Date().toISOString())}` : null, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    res.set({ "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="lop-${c.id}.ics"` }).send(lines.filter(Boolean).join("\r\n") + "\r\n");
  });
}
