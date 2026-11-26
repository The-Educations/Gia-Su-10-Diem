import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { move, settings, sepayConfig } from "./wallet.js";
import { childrenOf } from "./family.js";
import { notifyParents, subjectName } from "./family-notify.js";
import { sessionChatEvent } from "./chat-media.js";
import { flaggedList, flaggedThread, reviewQueue, warnThread } from "./trust-safety.js";
import { attachSessionNotes, classExtrasPayload, memberProgressStats, tutorClassStats, assignmentBadge } from "./class-extras.js";

// A class has one tutor, one or more students and a weekly rhythm. Each student
// brings their own package (an accepted offer): a number of lessons paid in
// advance and held. After every lesson both sides confirm; the tutor is paid
// for confirmed lessons minus the platform fee when the package ends, or at the
// end of each month for longer packages. Lessons that never happened go back
// to the student.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const COLORS = ["rose", "sky", "sage", "butter", "lilac", "peach", "mint", "sand"];
const HOUR = 3600000;
// A lesson may be rated once it is over, unless it was cancelled or is under report; only a lesson that
// was confirmed counts towards the published rating and the tutor's trust score (trust.js applies the same rule).
const RATEABLE = ["pending", "confirmed"];
const vnMonth = (iso) => new Date(Date.parse(iso) + 7 * HOUR).toISOString().slice(0, 7);

export function migrateClasses(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY, tutor_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL,
    subject_id TEXT NOT NULL, mode TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT 'rose',
    minutes INTEGER NOT NULL, schedule TEXT NOT NULL DEFAULT '[]', meeting_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS class_members (
    id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), student_id INTEGER NOT NULL REFERENCES users(id),
    proposal_id INTEGER, sessions_total INTEGER NOT NULL, rate INTEGER NOT NULL, held INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active', review TEXT NOT NULL DEFAULT '', reviewed_at TEXT, published_rating REAL,
    reminded_at TEXT, joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at TEXT);
  CREATE INDEX IF NOT EXISTS class_members_student ON class_members(student_id, status);
  CREATE TABLE IF NOT EXISTS class_sessions (
    id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), starts_at TEXT NOT NULL, minutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled', moved_from TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS class_sessions_time ON class_sessions(class_id, starts_at);
  CREATE TABLE IF NOT EXISTS session_members (
    session_id INTEGER NOT NULL REFERENCES class_sessions(id), member_id INTEGER NOT NULL REFERENCES class_members(id),
    tutor_confirmed_at TEXT, student_confirmed_at TEXT, outcome TEXT NOT NULL DEFAULT 'pending',
    rating INTEGER, settled INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', PRIMARY KEY(session_id, member_id));
  CREATE TABLE IF NOT EXISTS class_materials (
    id INTEGER PRIMARY KEY, class_id INTEGER NOT NULL REFERENCES classes(id), session_id INTEGER, title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS platform_revenue (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, amount INTEGER NOT NULL, ref TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS session_moves (
    id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES class_sessions(id), requested_by INTEGER NOT NULL,
    starts_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const sm = db.prepare("PRAGMA table_info(session_members)").all().map((c) => c.name);
  if (!sm.includes("survey")) db.exec("ALTER TABLE session_members ADD COLUMN survey TEXT NOT NULL DEFAULT '{}'");
  if (!sm.includes("comment")) db.exec("ALTER TABLE session_members ADD COLUMN comment TEXT NOT NULL DEFAULT ''");
  if (!db.prepare("PRAGMA table_info(tutors)").all().some((c) => c.name === "violations"))
    db.exec("ALTER TABLE tutors ADD COLUMN violations INTEGER NOT NULL DEFAULT 0");
  const cm = db.prepare("PRAGMA table_info(class_members)").all().map((c) => c.name);
  for (const [col, ddl] of [["reported", "INTEGER NOT NULL DEFAULT 0"], ["reported_reason", "TEXT"], ["reported_by", "INTEGER"], ["hidden", "INTEGER NOT NULL DEFAULT 0"], ["reply", "TEXT"], ["reply_at", "TEXT"]])
    if (!cm.includes(col)) db.exec(`ALTER TABLE class_members ADD COLUMN ${col} ${ddl}`);
  repairPublishedRatings(db);
}

// Ended packages once averaged stars given to lessons that never happened (cancelled or reported).
// Recompute only those, and write only when the number actually changes, so repeating it is harmless.
function repairPublishedRatings(db) {
  for (const m of all(db, `SELECT DISTINCT m.id,m.published_rating FROM class_members m JOIN session_members sm ON sm.member_id=m.id
    WHERE m.status='ended' AND sm.rating IS NOT NULL AND sm.outcome<>'confirmed'`)) {
    const avg = one(db, "SELECT AVG(rating) a FROM session_members WHERE member_id=? AND rating IS NOT NULL AND outcome='confirmed'", m.id).a;
    const fixed = avg === null ? null : Math.round(avg * 10) / 10;
    if (fixed !== m.published_rating) run(db, "UPDATE class_members SET published_rating=? WHERE id=?", fixed, m.id);
  }
}

// Lesson start times from a weekly rhythm, in Vietnam time, from a start date.
export function lessonTimes(schedule, startDate, count, after = 0) {
  const out = [], start = Date.parse(`${startDate}T00:00:00+07:00`);
  for (let day = 0; out.length < count && day < 800; day++) {
    const midnight = start + day * 24 * HOUR, weekday = (new Date(midnight + 7 * HOUR).getUTCDay() + 6) % 7;
    for (const s of schedule.filter((b) => b.weekday === weekday).sort((a, b) => a.hour * 60 + a.minute - b.hour * 60 - b.minute)) {
      const at = midnight + (s.hour * 60 + (s.minute || 0)) * 60000;
      if (at > after && out.length < count) out.push(new Date(at).toISOString());
    }
  }
  return out;
}

// Lessons already booked, as [start, end) in ms: a tutor's lessons that still have a student waiting, or a student's own.
function bookedLessons(db, who, id, { skipMember = null, skipSession = null } = {}) {
  const from = new Date(Date.now() - 6 * HOUR).toISOString();
  const rows = who === "tutor"
    ? all(db, `SELECT cs.starts_at,cs.minutes FROM class_sessions cs JOIN classes c ON c.id=cs.class_id
        WHERE c.tutor_id=? AND cs.status='scheduled' AND cs.starts_at>? AND (? IS NULL OR cs.id<>?)
        AND EXISTS (SELECT 1 FROM session_members sm WHERE sm.session_id=cs.id AND sm.outcome='pending')`, id, from, skipSession, skipSession)
    : all(db, `SELECT cs.starts_at,cs.minutes FROM class_sessions cs JOIN session_members sm ON sm.session_id=cs.id JOIN class_members m ON m.id=sm.member_id
        WHERE m.student_id=? AND cs.status='scheduled' AND sm.outcome='pending' AND cs.starts_at>? AND (? IS NULL OR cs.id<>?) AND (? IS NULL OR sm.member_id<>?)`,
        id, from, skipSession, skipSession, skipMember, skipMember);
  return rows.map((r) => [Date.parse(r.starts_at), Date.parse(r.starts_at) + r.minutes * 60000]);
}

// Two lessons clash when each starts before the other ends. A slot with tutor:false is one of the tutor's own
// class lessons being shared, so only the student can clash with it.
function findClash(db, { tutorId, studentId, slots, skipMember = null, skipSession = null }) {
  const booked = {};
  for (const slot of slots) {
    const start = Date.parse(slot.at), end = start + slot.minutes * 60000;
    for (const who of slot.tutor === false ? ["student"] : ["tutor", "student"]) {
      booked[who] ??= bookedLessons(db, who, who === "tutor" ? tutorId : studentId, { skipMember, skipSession });
      const hit = booked[who].find(([a, b]) => start < b && a < end);
      if (hit) return { who, at: new Date(hit[0]).toISOString() };
    }
  }
  return null;
}
const when = (iso) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function failOnClash(db, query, tail) {
  const clash = findClash(db, query);
  if (clash) fail(409, `${clash.who === "tutor" ? "Gia sư" : "Học sinh"} đã có buổi học khác lúc ${when(clash.at)}. ${tail}`);
}

// The new hour of a moved lesson must be free for the tutor and for every student in it (the lesson itself is ignored).
function failOnMoveClash(db, session, rows, startsAt) {
  for (const studentId of new Set(rows.map((r) => r.student_id).filter(Boolean)))
    failOnClash(db, { tutorId: session.tutor_id, studentId, skipSession: session.id, slots: [{ at: startsAt, minutes: session.minutes, tutor: true }] }, "Không thể dời buổi học sang giờ này.");
}

function attachSessions(db, cls, memberId, count, studentId) {
  const future = all(db, "SELECT id,starts_at FROM class_sessions WHERE class_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at", cls.id, new Date().toISOString());
  const shared = future.slice(0, count), ids = shared.map((s) => s.id);
  let fresh = [];
  if (ids.length < count) {
    // New lessons start after the last shared one, and never sooner than an hour from now.
    const after = Math.max(future.length ? Date.parse(future.at(-1).starts_at) : 0, Date.now() + HOUR);
    const startDate = new Date(after + 7 * HOUR).toISOString().slice(0, 10);
    fresh = lessonTimes(JSON.parse(cls.schedule), startDate, count - ids.length, after);
  }
  failOnClash(db, { tutorId: cls.tutor_id, studentId, skipMember: memberId, slots: [
    ...shared.map((s) => ({ at: s.starts_at, minutes: cls.minutes, tutor: false })),
    ...fresh.map((at) => ({ at, minutes: cls.minutes, tutor: true })),
  ] }, "Không thể nhận đề nghị này.");
  for (const at of fresh) ids.push(Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cls.id, at, cls.minutes).lastInsertRowid));
  for (const id of ids) run(db, "INSERT OR IGNORE INTO session_members(session_id,member_id) VALUES (?,?)", id, memberId);
}

// Called inside the transaction that accepts an offer.
export function startClass(db, p, classId = null) {
  let cls;
  if (classId) {
    cls = one(db, "SELECT * FROM classes WHERE id=? AND tutor_id=? AND status='active'", classId, p.tutor_id);
    if (!cls) fail(404, "Không tìm thấy lớp để thêm học sinh.");
  }
  // A new class follows the offer's own weekly rhythm from its start date, but only from an hour ahead: an
  // offer answered late must not create lessons that are already over.
  const times = classId ? [] : lessonTimes(JSON.parse(p.schedule), p.start_date, p.sessions, Date.now() + HOUR);
  if (!classId) {
    failOnClash(db, { tutorId: p.tutor_id, studentId: p.student_id, slots: times.map((at) => ({ at, minutes: p.minutes, tutor: true })) }, "Không thể nhận đề nghị này.");
    const subject = one(db, "SELECT name FROM subjects WHERE id=?", p.subject_id)?.name || p.subject_id;
    const student = one(db, "SELECT name FROM users WHERE id=?", p.student_id).name;
    const color = COLORS[one(db, "SELECT COUNT(*) n FROM classes WHERE tutor_id=?", p.tutor_id).n % COLORS.length];
    const id = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,area,color,minutes,schedule) VALUES (?,?,?,?,?,?,?,?)",
      p.tutor_id, `${subject} · ${student}`, p.subject_id, p.mode, p.area, color, p.minutes, p.schedule).lastInsertRowid);
    cls = one(db, "SELECT * FROM classes WHERE id=?", id);
  }
  const memberId = Number(run(db, "INSERT INTO class_members(class_id,student_id,proposal_id,sessions_total,rate,held) VALUES (?,?,?,?,?,?)", cls.id, p.student_id, p.id, p.sessions, p.rate, p.total).lastInsertRowid);
  if (classId) attachSessions(db, cls, memberId, p.sessions, p.student_id);
  else
    for (const at of times) {
      const sid = run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cls.id, at, p.minutes).lastInsertRowid;
      run(db, "INSERT INTO session_members(session_id,member_id) VALUES (?,?)", sid, memberId);
    }
  return cls.id;
}

function settle(db, memberId, { final = false } = {}) {
  const m = one(db, "SELECT m.*,c.tutor_id,c.subject_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=?", memberId);
  if (!m || m.status !== "active") return;
  const due = all(db, "SELECT session_id FROM session_members WHERE member_id=? AND settled=0 AND outcome IN ('confirmed','charged')", memberId);
  const pay = Math.min(m.held, due.length * m.rate);
  if (pay > 0) {
    const fee = Math.round((pay * settings(db).fee_percent) / 100);
    move(db, m.student_id, "lesson_paid", { held: -pay, ref: `member:${memberId}` });
    move(db, m.tutor_id, "lesson_payout", { amount: pay - fee, ref: `member:${memberId}`, note: `${due.length} buổi · phí ${fee.toLocaleString("vi-VN")}đ` });
    run(db, "INSERT INTO platform_revenue(kind,amount,ref) VALUES ('lesson_fee',?,?)", fee, `member:${memberId}`);
    run(db, "UPDATE class_members SET held=held-? WHERE id=?", pay, memberId);
  }
  run(db, "UPDATE session_members SET settled=1 WHERE member_id=? AND outcome IN ('confirmed','charged','refunded')", memberId);
  if (final) {
    // What was never taught goes back to the child.
    const left = one(db, "SELECT held FROM class_members WHERE id=?", memberId).held;
    if (left > 0) move(db, m.student_id, "lesson_refund", { amount: left, held: -left, ref: `member:${memberId}` });
    // Lessons still ahead are no longer this student's.
    run(db, "DELETE FROM session_members WHERE member_id=? AND outcome='pending' AND session_id IN (SELECT id FROM class_sessions WHERE starts_at>?)", memberId, new Date().toISOString());
    const avg = one(db, "SELECT AVG(rating) a FROM session_members WHERE member_id=? AND rating IS NOT NULL AND outcome='confirmed'", memberId).a;
    run(db, "UPDATE class_members SET held=0,status='ended',ended_at=CURRENT_TIMESTAMP,published_rating=? WHERE id=?", avg ? Math.round(avg * 10) / 10 : null, memberId);
    notify(db, m.student_id, "package_ended", { link: `/classes/${m.class_id}` });
    notify(db, m.tutor_id, "package_settled", { subject: String(pay), link: "/wallet" });
    notifyParents(db, m.student_id, "child_package_ended", { subject: subjectName(db, m.subject_id), detail: { amount: left } });
  }
}

// Lazy upkeep on every read: auto-confirm after the window, settle finished
// packages, and pay last month's confirmed lessons on long packages.
export function upkeep(db) {
  const s = settings(db), now = Date.now();
  const cutoff = new Date(now - s.confirm_hours * HOUR).toISOString();
  transaction(db, () => {
    run(db, `UPDATE session_members SET outcome='confirmed' WHERE outcome='pending' AND (tutor_confirmed_at IS NOT NULL OR student_confirmed_at IS NOT NULL)
      AND session_id IN (SELECT id FROM class_sessions WHERE status='scheduled' AND datetime(starts_at, '+' || minutes || ' minutes') < datetime(?))`, cutoff);
    for (const m of all(db, `SELECT m.id FROM class_members m WHERE m.status='active' AND NOT EXISTS (
      SELECT 1 FROM session_members sm WHERE sm.member_id=m.id AND sm.outcome IN ('pending','disputed'))`)) settle(db, m.id, { final: true });
    const month = vnMonth(new Date(now).toISOString());
    for (const m of all(db, `SELECT DISTINCT sm.member_id id FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id
      JOIN class_members m ON m.id=sm.member_id WHERE m.status='active' AND sm.settled=0 AND sm.outcome='confirmed' AND substr(datetime(cs.starts_at,'+7 hours'),1,7) < ?`, month)) settle(db, m.id);
  });
}

const sessionSql = `SELECT cs.*, c.title, c.color, c.tutor_id, c.subject_id, c.mode, c.meeting_url, sm.member_id, sm.tutor_confirmed_at, sm.student_confirmed_at, sm.outcome, sm.rating, sm.survey, sm.comment, sm.note, sm.settled,
  m.student_id, u.name AS student_name, t.name AS tutor_name
  FROM class_sessions cs JOIN classes c ON c.id=cs.class_id LEFT JOIN session_members sm ON sm.session_id=cs.id
  LEFT JOIN class_members m ON m.id=sm.member_id LEFT JOIN users u ON u.id=m.student_id JOIN users t ON t.id=c.tutor_id`;

export function registerClasses(app, db, auth, audit) {
  const member = (sessionId, user) => {
    const rows = all(db, `${sessionSql} WHERE cs.id=?`, sessionId);
    if (!rows.length) fail(404, "Không tìm thấy buổi học.");
    const tutor = rows[0].tutor_id === user.id;
    const mine = tutor ? rows : rows.filter((r) => r.student_id === user.id);
    if (!tutor && !mine.length && user.role !== "admin") fail(404, "Không tìm thấy buổi học.");
    return { rows, mine, tutor, session: rows[0] };
  };
  const ended = (s) => Date.parse(s.starts_at) + s.minutes * 60000 <= Date.now();
  const classFor = (id, user) => {
    const c = one(db, "SELECT c.*,t.name AS tutor_name,sub.name AS subject_name FROM classes c JOIN users t ON t.id=c.tutor_id LEFT JOIN subjects sub ON sub.id=c.subject_id WHERE c.id=?", id);
    if (!c) fail(404, "Không tìm thấy lớp.");
    const members = all(db, `SELECT m.*,u.name,
      (SELECT COUNT(*) FROM session_members WHERE member_id=m.id AND outcome IN ('confirmed','charged')) AS done,
      (SELECT COUNT(*) FROM session_members WHERE member_id=m.id AND outcome='pending') AS remaining
      FROM class_members m JOIN users u ON u.id=m.student_id WHERE m.class_id=? ORDER BY m.status, m.id`, id);
    const kids = childrenOf(db, user.id), mine = (m) => m.student_id === user.id || kids.includes(m.student_id);
    const allowed = c.tutor_id === user.id || members.some(mine) || user.role === "admin";
    if (!allowed) fail(404, "Không tìm thấy lớp.");
    return { ...c, schedule: JSON.parse(c.schedule), members: c.tutor_id === user.id || user.role === "admin" ? members : members.filter(mine) };
  };

  app.get("/api/classes", auth("student", "tutor"), (req, res) => {
    upkeep(db);
    const people = [req.user.id, ...childrenOf(db, req.user.id)], marks = people.map(() => "?").join(",");
    const ids = all(db, `SELECT id FROM classes WHERE tutor_id=? UNION SELECT class_id FROM class_members WHERE student_id IN (${marks})`, req.user.id, ...people).map((r) => r.id);
    res.json(ids.map((id) => {
      const c = classFor(id, req.user);
      const next = one(db, "SELECT starts_at FROM class_sessions WHERE class_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at LIMIT 1", id, new Date().toISOString());
      return { ...c, next_at: next?.starts_at || null, assignment_badge: assignmentBadge(db, id, req.user) };
    }).sort((a, b) => (a.status === b.status ? (a.next_at || "z").localeCompare(b.next_at || "z") : a.status === "active" ? -1 : 1)));
  });
  app.get("/api/classes/:id", auth(), (req, res) => {
    upkeep(db);
    const id = z.coerce.number().int().positive().parse(req.params.id), c = classFor(id, req.user);
    const own = new Set(c.members.map((m) => m.student_id));
    const sessions = attachSessionNotes(db, all(db, `${sessionSql} WHERE cs.class_id=? ORDER BY cs.starts_at`, id).filter((s) => c.tutor_id === req.user.id || req.user.role === "admin" || own.has(s.student_id)));
    const progress = memberProgressStats(db, id);
    for (const m of c.members) {
      const st = progress.get(m.id) || { minutes_done: 0, upcoming: 0 };
      m.minutes_done = st.minutes_done || 0;
      m.hours_done = Math.round((m.minutes_done / 60) * 10) / 10;
      m.completion_rate = Math.min(100, Math.round((m.done / Math.max(1, m.sessions_total)) * 100));
      m.paid_total = (m.done || 0) * m.rate;
    }
    res.json({ ...c, sessions, materials: all(db, "SELECT * FROM class_materials WHERE class_id=? ORDER BY id DESC", id),
      moves: all(db, "SELECT mv.* FROM session_moves mv JOIN class_sessions cs ON cs.id=mv.session_id WHERE cs.class_id=? AND mv.status='pending'", id),
      tutor_stats: tutorClassStats(db, id), ...classExtrasPayload(db, id, req.user) });
  });
  app.get("/api/schedule", auth("student", "tutor"), (req, res) => {
    upkeep(db);
    const q = z.object({ from: z.string().max(30), to: z.string().max(30) }).parse(req.query);
    res.json(all(db, `${sessionSql} WHERE cs.starts_at>=? AND cs.starts_at<? AND cs.status<>'cancelled' AND (c.tutor_id=? OR m.student_id=?) ORDER BY cs.starts_at`, q.from, q.to, req.user.id, req.user.id));
  });

  app.post("/api/sessions/:id/confirm", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    transaction(db, () => {
      const { mine, tutor, session } = member(id, req.user);
      if (!ended(session)) fail(409, "Buổi học chưa kết thúc.");
      for (const r of mine.filter((r) => r.member_id && r.outcome === "pending")) {
        run(db, `UPDATE session_members SET ${tutor ? "tutor_confirmed_at" : "student_confirmed_at"}=COALESCE(${tutor ? "tutor_confirmed_at" : "student_confirmed_at"},CURRENT_TIMESTAMP) WHERE session_id=? AND member_id=?`, id, r.member_id);
        const now = one(db, "SELECT * FROM session_members WHERE session_id=? AND member_id=?", id, r.member_id);
        if (now.tutor_confirmed_at && now.student_confirmed_at) run(db, "UPDATE session_members SET outcome='confirmed' WHERE session_id=? AND member_id=?", id, r.member_id);
        else notify(db, tutor ? r.student_id : r.tutor_id, "session_confirm", { actor: req.user.name, subject: r.title, link: `/classes/${r.class_id}` });
      }
      sessionChatEvent(db, id, req.user, "đã xác nhận buổi học");
    });
    upkeep(db);
    res.json({ ok: true });
  });
  app.post("/api/sessions/:id/dispute", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
    transaction(db, () => {
      const { mine, tutor, session } = member(id, req.user);
      if (!ended(session)) fail(409, "Chỉ báo vấn đề sau khi buổi học kết thúc.");
      for (const r of mine.filter((r) => r.outcome === "pending")) {
        run(db, "UPDATE session_members SET outcome='disputed',note=? WHERE session_id=? AND member_id=?", reason, id, r.member_id);
        // The parent learns there is a report, never what was written in it.
        notifyParents(db, r.student_id, "child_session_disputed", { subject: subjectName(db, r.subject_id), detail: { when: r.starts_at, by: tutor ? "tutor" : "student" } });
      }
      run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", req.user.id);
      const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", req.user.id);
      run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", thread.id, req.user.id, `Báo vấn đề buổi học #${id} (${session.title}): ${reason}`);
      for (const a of all(db, "SELECT id FROM users WHERE role='admin' AND status='active'")) notify(db, a.id, "session_disputed", { actor: req.user.name, subject: session.title, link: "/admin?tab=classes" });
      sessionChatEvent(db, id, req.user, "đã báo vấn đề buổi học");
    });
    res.json({ ok: true });
  });
  app.post("/api/sessions/:id/cancel", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id), s = settings(db);
    let result;
    transaction(db, () => {
      const { mine, tutor, session } = member(id, req.user);
      if (session.status !== "scheduled" || Date.parse(session.starts_at) <= Date.now()) fail(409, "Chỉ hủy được buổi chưa bắt đầu.");
      const late = Date.parse(session.starts_at) - Date.now() < s.cancel_hours * HOUR;
      // A late cancellation by the student still pays the tutor; a late one by the tutor is a violation.
      const outcome = late && !tutor ? "charged" : "refunded";
      for (const r of mine.filter((r) => r.outcome === "pending")) {
        run(db, "UPDATE session_members SET outcome=? WHERE session_id=? AND member_id=?", outcome, id, r.member_id);
        notify(db, tutor ? r.student_id : r.tutor_id, "session_cancelled", { actor: req.user.name, subject: r.title, link: `/classes/${r.class_id}` });
        // A free trial costs nothing, however late it is cancelled.
        const charged = outcome === "charged" && one(db, "SELECT rate FROM class_members WHERE id=?", r.member_id).rate > 0;
        notifyParents(db, r.student_id, "child_session_cancelled", { actor: req.user.name, subject: subjectName(db, r.subject_id), detail: { when: r.starts_at, late, charged, by: tutor ? "tutor" : "student" } });
      }
      if (tutor || !one(db, "SELECT 1 FROM session_members WHERE session_id=? AND outcome='pending'", id)) run(db, "UPDATE class_sessions SET status='cancelled' WHERE id=?", id);
      if (tutor && late) run(db, "UPDATE tutors SET violations=violations+1 WHERE user_id=?", req.user.id);
      sessionChatEvent(db, id, req.user, "đã hủy buổi học");
      result = { outcome, late };
    });
    upkeep(db);
    res.json(result);
  });
  app.post("/api/sessions/:id/move", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { starts_at } = z.object({ starts_at: z.string().datetime() }).parse(req.body);
    if (Date.parse(starts_at) <= Date.now() + HOUR) fail(400, "Chọn giờ mới cách hiện tại ít nhất 1 giờ.");
    transaction(db, () => {
      const { rows, tutor, session } = member(id, req.user);
      if (session.status !== "scheduled" || Date.parse(session.starts_at) <= Date.now()) fail(409, "Chỉ dời được buổi chưa bắt đầu.");
      failOnMoveClash(db, session, rows, starts_at);
      run(db, "UPDATE session_moves SET status='replaced' WHERE session_id=? AND status='pending'", id);
      run(db, "INSERT INTO session_moves(session_id,requested_by,starts_at) VALUES (?,?,?)", id, req.user.id, starts_at);
      for (const uid of tutor ? [...new Set(rows.map((r) => r.student_id).filter(Boolean))] : [session.tutor_id])
        notify(db, uid, "session_move", { actor: req.user.name, subject: session.title, link: `/classes/${session.class_id}` });
      sessionChatEvent(db, id, req.user, "đã đề nghị dời buổi học");
    });
    res.status(201).json({ ok: true });
  });
  app.patch("/api/moves/:id", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    transaction(db, () => {
      const mv = one(db, "SELECT * FROM session_moves WHERE id=? AND status='pending'", id);
      if (!mv) fail(404, "Đề nghị dời lịch không còn.");
      const { session, rows } = member(mv.session_id, req.user);
      if (mv.requested_by === req.user.id) fail(403, "Bên còn lại cần đồng ý.");
      if (accept) {
        // An answer that comes late: the lesson may have started and the new hour may be too close, past or taken.
        if (session.status !== "scheduled" || Date.parse(session.starts_at) <= Date.now()) fail(409, "Buổi học đã bắt đầu hoặc đã hủy nên không dời được. Bạn có thể từ chối đề nghị này.");
        if (Date.parse(mv.starts_at) <= Date.now() + HOUR) fail(409, "Giờ mới đã quá gần hoặc đã qua. Bạn có thể từ chối và đề nghị giờ khác.");
        failOnMoveClash(db, session, rows, mv.starts_at);
      }
      run(db, "UPDATE session_moves SET status=? WHERE id=?", accept ? "accepted" : "declined", id);
      if (accept) {
        run(db, "UPDATE class_sessions SET moved_from=COALESCE(moved_from,starts_at),starts_at=? WHERE id=?", mv.starts_at, mv.session_id);
        // `session` still holds the old time. Students who already left this lesson are not told.
        for (const r of all(db, "SELECT m.student_id FROM session_members sm JOIN class_members m ON m.id=sm.member_id WHERE sm.session_id=? AND sm.outcome='pending'", mv.session_id))
          notifyParents(db, r.student_id, "child_session_moved", { subject: subjectName(db, session.subject_id), detail: { from: session.starts_at, when: mv.starts_at } });
      }
      sessionChatEvent(db, mv.session_id, req.user, accept ? "đã đồng ý dời buổi học" : "đã từ chối dời buổi học");
      notify(db, mv.requested_by, accept ? "session_moved" : "session_move_declined", { actor: req.user.name, subject: session.title, link: `/classes/${session.class_id}` });
    });
    res.json({ ok: true });
  });
  app.put("/api/sessions/:id/rating", auth("student"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    // A short private survey: stars, three quick questions and an optional note.
    const d = z.object({
      rating: z.number().int().min(1).max(5),
      answers: z.object({ on_time: z.boolean().optional(), clear: z.boolean().optional(), homework: z.boolean().optional() }).default({}),
      comment: z.string().trim().max(1000).default(""),
    }).parse(req.body);
    const { mine, session } = member(id, req.user);
    if (!ended(session)) fail(409, "Chấm sau khi buổi học kết thúc.");
    const open = mine.filter((r) => r.member_id && RATEABLE.includes(r.outcome));
    if (!open.length) fail(409, mine.some((r) => r.outcome === "disputed") ? "Buổi này đang được xử lý báo cáo nên chưa chấm được." : "Buổi này đã hủy nên không chấm được.");
    for (const r of open) run(db, "UPDATE session_members SET rating=?,survey=?,comment=? WHERE session_id=? AND member_id=?", d.rating, JSON.stringify(d.answers), d.comment, id, r.member_id);
    res.json({ ok: true });
  });

  const ownClass = (req) => {
    const c = one(db, "SELECT * FROM classes WHERE id=? AND tutor_id=?", z.coerce.number().int().positive().parse(req.params.id), req.user.id);
    if (!c) fail(404, "Không tìm thấy lớp.");
    return c;
  };
  const materialSchema = z.object({ title: z.string().trim().min(2).max(160), url: z.union([z.literal(""), z.url().max(500).refine((u) => u.startsWith("https://"), "Dùng liên kết https.")]).default(""), note: z.string().trim().max(2000).default(""), session_id: z.number().int().positive().nullable().default(null) });
  app.post("/api/classes/:id/materials", auth("tutor"), (req, res) => {
    const c = ownClass(req), d = materialSchema.parse(req.body);
    if (d.session_id && !one(db, "SELECT 1 FROM class_sessions WHERE id=? AND class_id=?", d.session_id, c.id)) fail(400, "Buổi học không thuộc lớp này.");
    const id = run(db, "INSERT INTO class_materials(class_id,session_id,title,url,note) VALUES (?,?,?,?,?)", c.id, d.session_id, d.title, d.url, d.note).lastInsertRowid;
    for (const m of all(db, "SELECT student_id FROM class_members WHERE class_id=? AND status='active'", c.id)) notify(db, m.student_id, "material_new", { actor: req.user.name, subject: d.title, link: `/classes/${c.id}?tab=materials` });
    res.status(201).json(one(db, "SELECT * FROM class_materials WHERE id=?", id));
  });
  app.delete("/api/classes/:id/materials/:material", auth("tutor"), (req, res) => {
    const c = ownClass(req);
    run(db, "DELETE FROM class_materials WHERE id=? AND class_id=?", req.params.material, c.id);
    res.json({ ok: true });
  });
  app.patch("/api/classes/:id", auth("tutor"), (req, res) => {
    const c = ownClass(req);
    const d = z.object({ title: z.string().trim().min(2).max(120), meeting_url: z.union([z.literal(""), z.url().max(500)]), color: z.enum(COLORS) }).partial().parse(req.body);
    run(db, "UPDATE classes SET title=COALESCE(?,title),meeting_url=COALESCE(?,meeting_url),color=COALESCE(?,color) WHERE id=?", d.title ?? null, d.meeting_url ?? null, d.color ?? null, c.id);
    res.json({ ok: true });
  });
  app.post("/api/members/:id/remind", auth("tutor"), (req, res) => {
    const m = one(db, "SELECT m.*,c.title,c.tutor_id,c.subject_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND c.tutor_id=? AND m.status='active'", req.params.id, req.user.id);
    if (!m) fail(404, "Không tìm thấy học sinh.");
    if (m.reminded_at && Date.now() - Date.parse(m.reminded_at + "Z") < 24 * HOUR) fail(429, "Đã nhắc trong 24 giờ qua.");
    transaction(db, () => {
      run(db, "UPDATE class_members SET reminded_at=CURRENT_TIMESTAMP WHERE id=?", m.id);
      notify(db, m.student_id, "renew_reminder", { actor: req.user.name, subject: m.title, link: `/classes/${m.class_id}?renew=${m.id}` });
      notifyParents(db, m.student_id, "child_renew_reminder", { actor: req.user.name, subject: subjectName(db, m.subject_id), link: `/wallet?for=${m.student_id}` });
    });
    res.json({ ok: true });
  });
  app.post("/api/members/:id/renew", auth("student"), (req, res) => {
    const { sessions } = z.object({ sessions: z.number().int().min(1).max(60) }).parse(req.body);
    transaction(db, () => {
      const m = one(db, "SELECT m.*,c.tutor_id,c.subject_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND m.student_id=? AND m.status='active'", req.params.id, req.user.id);
      if (!m) fail(404, "Gói học đã kết thúc. Gửi đề nghị mới để học tiếp.");
      const cost = sessions * m.rate;
      move(db, req.user.id, "offer_hold", { amount: -cost, held: cost, ref: `member:${m.id}` });
      run(db, "UPDATE class_members SET sessions_total=sessions_total+?,held=held+? WHERE id=?", sessions, cost, m.id);
      attachSessions(db, one(db, "SELECT * FROM classes WHERE id=?", m.class_id), m.id, sessions, m.student_id);
      notify(db, m.tutor_id, "package_renewed", { actor: req.user.name, subject: String(sessions), link: `/classes/${m.class_id}` });
      notifyParents(db, m.student_id, "child_package_renewed", { subject: subjectName(db, m.subject_id), detail: { n: sessions, amount: cost } });
    });
    res.json({ ok: true });
  });
  app.post("/api/members/:id/end", auth("student", "tutor"), (req, res) => {
    transaction(db, () => {
      const m = one(db, "SELECT m.*,c.tutor_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND m.status='active' AND (m.student_id=? OR c.tutor_id=?)", req.params.id, req.user.id, req.user.id);
      if (!m) fail(404, "Không tìm thấy gói học.");
      // Lessons already held but unconfirmed stay for the 48-hour window; future ones are refunded.
      run(db, `UPDATE session_members SET outcome='refunded' WHERE member_id=? AND outcome='pending' AND session_id IN (SELECT id FROM class_sessions WHERE starts_at>?)`, m.id, new Date().toISOString());
      notify(db, req.user.id === m.student_id ? m.tutor_id : m.student_id, "package_ending", { actor: req.user.name, link: `/classes/${m.class_id}` });
    });
    upkeep(db);
    res.json({ ok: true });
  });
  // Administrators settle a reported lesson: it happened (tutor paid) or not (refunded).
  app.get("/api/admin/today", auth("admin"), (req, res) => {
    upkeep(db);
    res.json({
      students: one(db, "SELECT COUNT(*) n FROM student_verifications WHERE status='pending'").n,
      tutors: one(db, "SELECT COUNT(*) n FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.status='pending' AND u.status='active'").n,
      credentials: one(db, "SELECT COUNT(*) n FROM tutor_credentials c WHERE c.status='pending' AND EXISTS(SELECT 1 FROM credential_files f WHERE f.credential_id=c.id)").n,
      withdrawals: one(db, "SELECT COUNT(*) n FROM withdrawals WHERE status='requested'").n,
      community: one(db, "SELECT COUNT(*) n FROM community_posts WHERE status='pending'").n,
      violations: all(db, "SELECT t.user_id,u.name,t.violations FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.violations>=3 ORDER BY t.violations DESC"),
      flagged_messages: one(db, "SELECT (SELECT COUNT(*) FROM messages WHERE flagged=1)+(SELECT COUNT(*) FROM inquiry_messages WHERE flagged=1) n").n,
      reported_reviews: one(db, "SELECT (SELECT COUNT(*) FROM reviews WHERE reported=1 AND hidden=0)+(SELECT COUNT(*) FROM class_members WHERE reported=1 AND hidden=0) n").n,
      disputes: all(db, `SELECT sm.session_id,sm.member_id,sm.note,cs.starts_at,c.id AS class_id,c.title,u.name AS student_name,t.name AS tutor_name
        FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id JOIN classes c ON c.id=cs.class_id
        JOIN class_members m ON m.id=sm.member_id JOIN users u ON u.id=m.student_id JOIN users t ON t.id=c.tutor_id WHERE sm.outcome='disputed' ORDER BY cs.starts_at`),
      // Ended lessons nobody confirmed and nobody reported: they auto-confirm soon, so an admin should see them first.
      sessions_waiting: one(db, `SELECT COUNT(DISTINCT sm.session_id) n FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id
        WHERE sm.outcome='pending' AND cs.status='scheduled' AND datetime(cs.starts_at,'+'||cs.minutes||' minutes')<datetime('now')
        AND NOT EXISTS(SELECT 1 FROM session_members x WHERE x.session_id=sm.session_id AND x.outcome='disputed')`).n,
    });
  });
  // Booking rows shaped like session rows so one worklist can show both flows.
  const bookingSql = `SELECT b.id,'booking' AS source,NULL AS class_id,b.starts_at,b.duration_minutes AS minutes,b.status,NULL AS moved_from,
    (sub.name || ' · ' || su.name) AS title,'amber' AS color,b.status AS class_status,b.tutor_id,tu.name AS tutor_name,
    NULL AS member_id,b.student_id,'active' AS member_status,b.rate,NULL AS held,NULL AS sessions_total,
    NULL AS outcome,b.note,NULL AS tutor_confirmed_at,NULL AS student_confirmed_at,NULL AS rating,NULL AS settled,
    su.name AS student_name
    FROM bookings b JOIN users su ON su.id=b.student_id JOIN users tu ON tu.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id`;
  // Safety queue: off-platform contact attempts flagged inside chat.
  app.get("/api/admin/safety/flagged", auth("admin"), (req, res) => res.json(flaggedList(db)));
  app.get("/api/admin/safety/thread/:kind/:id", auth("admin"), (req, res) => {
    const thread = flaggedThread(db, req.params.kind === "inquiry" ? "inquiry" : "lesson", Number(req.params.id));
    // Viewing a private conversation is itself audited.
    audit(req.user.id, "safety.view", `${req.params.kind}:${req.params.id}`, { parties: thread.parties });
    res.json(thread);
  });
  app.post("/api/admin/safety/dismiss", auth("admin"), (req, res) => {
    const d = z.object({ kind: z.enum(["lesson", "inquiry"]), message_id: z.number().int() }).parse(req.body);
    const table = d.kind === "inquiry" ? "inquiry_messages" : "messages";
    run(db, `UPDATE ${table} SET flagged=0 WHERE id=?`, d.message_id);
    audit(req.user.id, "safety.dismiss", `${d.kind}:${d.message_id}`, {});
    res.json({ ok: true });
  });
  app.post("/api/admin/safety/warn", auth("admin"), (req, res) => {
    const d = z.object({ kind: z.enum(["lesson", "inquiry"]), thread_id: z.number().int(), note: z.string().max(300).optional() }).parse(req.body);
    const warned = warnThread(db, req.user, d.kind, d.thread_id, d.note || "");
    audit(req.user.id, "safety.warn", `${d.kind}:${d.thread_id}`, { user_id: warned });
    res.json({ ok: true, warned });
  });
  // Reported reviews queue + moderation.
  app.get("/api/admin/reviews/queue", auth("admin"), (req, res) => res.json(reviewQueue(db)));
  app.post("/api/admin/reviews/:bookingId/visibility", auth("admin"), (req, res) => {
    const d = z.object({ hidden: z.boolean(), kind: z.enum(["member"]).optional() }).parse(req.body);
    if (d.kind === "member") {
      if (!run(db, "UPDATE class_members SET hidden=?,reported=0 WHERE id=?", d.hidden ? 1 : 0, Number(req.params.bookingId)).changes) fail(404, "Không tìm thấy đánh giá.");
      audit(req.user.id, d.hidden ? "review.hidden" : "review.shown", `member:${req.params.bookingId}`, {});
    } else {
      run(db, "UPDATE reviews SET hidden=?,reported=0 WHERE booking_id=?", d.hidden ? 1 : 0, Number(req.params.bookingId));
      audit(req.user.id, d.hidden ? "review.hidden" : "review.shown", `booking:${req.params.bookingId}`, {});
    }
    res.json({ ok: true });
  });
  app.post("/api/admin/reviews/:bookingId/reply", auth("admin"), (req, res) => {
    const d = z.object({ body: z.string().min(1).max(500), kind: z.enum(["member"]).optional() }).parse(req.body);
    if (d.kind === "member") {
      if (!run(db, "UPDATE class_members SET reply=?,reply_at=CURRENT_TIMESTAMP WHERE id=?", d.body, Number(req.params.bookingId)).changes) fail(404, "Không tìm thấy đánh giá.");
      audit(req.user.id, "review.reply", `member:${req.params.bookingId}`, { body: d.body.slice(0, 80) });
    } else {
      run(db, "UPDATE reviews SET reply=?,reply_at=CURRENT_TIMESTAMP WHERE booking_id=?", d.body, Number(req.params.bookingId));
      audit(req.user.id, "review.reply", `booking:${req.params.bookingId}`, { body: d.body.slice(0, 80) });
    }
    res.json({ ok: true });
  });
  // The sessions worklist: one row per (lesson, student) pair; the client groups them back by lesson.
  // System health: real operational numbers, read-only except the email resend.
  app.get("/api/admin/health", auth("admin"), (req, res) => {
    const sepay = sepayConfig();
    const day = Date.now() - 86400000, since = new Date(day).toISOString();
    const lastEvent = one(db, "SELECT created_at,status,verdict FROM sepay_events ORDER BY created_at DESC LIMIT 1")
      || one(db, "SELECT created_at,status,verdict FROM gateway_events ORDER BY created_at DESC LIMIT 1");
    const evts = Object.fromEntries(all(db, "SELECT key,value FROM system_events").map((r) => [r.key, r.value]));
    const lastReceived = [evts.last_sepay_ipn, evts.last_sepay_webhook].filter(Boolean).sort().pop() || null;
    const pendingDeposits = one(db, "SELECT COUNT(*) n FROM deposits WHERE status='pending'").n;
    const unmatched = one(db, "SELECT (SELECT COUNT(*) FROM sepay_events WHERE status='unmatched')+(SELECT COUNT(*) FROM gateway_events WHERE status='unmatched') n").n;
    const rejected24 = one(db, "SELECT (SELECT COUNT(*) FROM sepay_events WHERE status='rejected_key' AND created_at>?)+(SELECT COUNT(*) FROM gateway_events WHERE status='rejected_key' AND created_at>?) n", since, since).n;
    const outbox = one(db, "SELECT COUNT(*) AS pending, SUM(attempts) AS tries FROM email_outbox WHERE sent_at IS NULL");
    const failed = all(db, "SELECT o.id,o.attempts,o.sending_until,u.email FROM email_outbox o LEFT JOIN users u ON u.id=o.user_id WHERE o.sent_at IS NULL AND o.attempts>=5 ORDER BY o.id DESC LIMIT 20");
    const latestMailErr = one(db, "SELECT o.attempts,u.email FROM email_outbox o LEFT JOIN users u ON u.id=o.user_id WHERE o.sent_at IS NULL AND o.attempts>0 ORDER BY o.id DESC LIMIT 1");
    const maskMail = (e) => e ? e.replace(/^(.{1,2})[^@]*@(.*)$/, "$1***@$2") : null;
    const cals = all(db, "SELECT user_id,last_synced,error FROM google_calendars");
    const calErrs = cals.filter((c) => c.error).length;
    const counts = {};
    for (const [name, table] of [["users", "users"], ["tutors", "tutors"], ["classes", "classes"], ["bookings", "bookings"], ["deposits", "deposits"], ["audit", "audit"], ["messages", "messages"]])
      counts[name] = one(db, `SELECT COUNT(*) n FROM ${table}`).n;
    const payments = {
      bank_webhook: !!(sepay.secret && sepay.account && sepay.bank),
      gateway: !!(sepay.merchant && sepay.merchantSecret && sepay.ipnSecret),
      sandbox: !!sepay.sandbox,
      simulated: !(sepay.secret || sepay.merchant),
      last_received: lastReceived,
      last_rejected: evts.last_sepay_rejected || null,
      last_event: lastEvent || null,
      rejected_24h: rejected24,
      pending_deposits: pendingDeposits,
      unmatched,
      recon_v2: !!process.env.SEPAY_API_TOKEN,
      last_recheck: one(db, "SELECT created_at FROM audit WHERE action='deposits.recheck' ORDER BY created_at DESC LIMIT 1")?.created_at || null,
    };
    // Sổ cái: the ledger is the safety net — wallets must equal their entries,
    // settled money must be released, and no outside event may credit twice.
    const entries = "(SELECT user_id,SUM(amount) a,SUM(held) h FROM wallet_entries GROUP BY user_id)";
    const mismatches = all(db, `SELECT w.user_id,u.name,w.available-COALESCE(e.a,0) d_avail,w.held-COALESCE(e.h,0) d_held
      FROM wallets w LEFT JOIN ${entries} e ON e.user_id=w.user_id LEFT JOIN users u ON u.id=w.user_id
      WHERE w.available!=COALESCE(e.a,0) OR w.held!=COALESCE(e.h,0) ORDER BY w.user_id LIMIT 20`);
    const negatives = all(db, "SELECT user_id,available,held FROM wallets WHERE available<0 OR held<0 LIMIT 20");
    const depositMismatch = all(db, `SELECT d.id,d.code,d.received,COALESCE(e.s,0) ledger
      FROM deposits d LEFT JOIN (SELECT ref,SUM(amount) s FROM wallet_entries WHERE kind='deposit' GROUP BY ref) e ON e.ref='deposit:'||d.id
      WHERE d.status='paid' AND d.received!=COALESCE(e.s,0) LIMIT 20`);
    const doubleCredits = all(db, `SELECT note,COUNT(*) n FROM wallet_entries
      WHERE kind='deposit' AND (note LIKE 'sepay:%' OR note LIKE 'gateway:%' OR note LIKE 'bank:%' OR note LIKE 'ipn:%')
      GROUP BY note HAVING COUNT(*)>1 LIMIT 20`);
    const withdrawalBad = all(db, `SELECT w.id,w.status,w.amount,COALESCE(e.h,0) held
      FROM withdrawals w LEFT JOIN (SELECT ref,SUM(held) h FROM wallet_entries WHERE ref LIKE 'withdrawal:%' GROUP BY ref) e ON e.ref='withdrawal:'||w.id
      WHERE (w.status='requested' AND COALESCE(e.h,0)!=w.amount) OR (w.status IN ('paid','rejected') AND COALESCE(e.h,0)!=0) LIMIT 20`);
    const issues = mismatches.length + negatives.length + depositMismatch.length + doubleCredits.length + withdrawalBad.length;
    const ledger = { ok: issues === 0, issues, wallet: mismatches, negatives, deposits: depositMismatch, double_credits: doubleCredits, withdrawals: withdrawalBad };
    const warnings = [];
    if (!ledger.ok) warnings.push({ kind: "ledger", n: issues, to: "system" });
    if (!payments.bank_webhook && !payments.gateway) warnings.push({ kind: "payments", n: 0, to: "finance" });
    if (pendingDeposits > 0 && (!lastReceived || Date.parse(lastReceived) < day)) warnings.push({ kind: "webhook", n: pendingDeposits, to: "finance" });
    if (unmatched > 0) warnings.push({ kind: "unmatched", n: unmatched, to: "finance" });
    if (rejected24 > 0) warnings.push({ kind: "signature", n: rejected24, to: "finance" });
    if (failed.length > 0) warnings.push({ kind: "email", n: failed.length, to: "system" });
    if (calErrs > 0) warnings.push({ kind: "calendar", n: calErrs, to: "system" });
    res.json({
      payments,
      email: { pending: outbox?.pending || 0, attempts: outbox?.tries || 0, failed: failed.map((m) => ({ ...m, email: maskMail(m.email) })), latest_error: latestMailErr ? { attempts: latestMailErr.attempts, email: maskMail(latestMailErr.email) } : null },
      calendar: { connections: cals.length, errors: calErrs, last_synced: cals.map((c) => c.last_synced).filter(Boolean).sort().pop() || null },
      data: { user_version: one(db, "PRAGMA user_version")?.user_version ?? null, counts, commit: process.env.GIT_COMMIT || process.env.GITHUB_SHA || "", deployed_at: process.env.DEPLOYED_AT || "" },
      ledger,
      warnings,
    });
  });
  app.post("/api/admin/health/email/:id/resend", auth("admin"), (req, res) => {
    const row = one(db, "SELECT id FROM email_outbox WHERE id=? AND sent_at IS NULL", Number(req.params.id));
    if (!row) fail(404, "Email không còn trong hàng đợi.");
    run(db, "UPDATE email_outbox SET attempts=0,sending_until=0 WHERE id=?", row.id);
    audit(req.user.id, "health.email_resend", `email:${row.id}`, {});
    res.json({ ok: true });
  });
  // The sessions worklist: one row per (lesson, student) pair plus one row per
  // standalone booking; the client groups lessons back by lesson.
  app.get("/api/admin/sessions", auth("admin"), (req, res) => {
    upkeep(db);
    const q = z.object({
      class: z.coerce.number().int().positive().optional(),
      member: z.coerce.number().int().positive().optional(),
      tutor: z.coerce.number().int().positive().optional(),
      student: z.coerce.number().int().positive().optional(),
      from: z.string().max(30).optional(),
      to: z.string().max(30).optional(),
    }).parse(req.query);
    const [where, args] = [
      [q.class && "cs.class_id=?", q.member && "sm.member_id=?", q.tutor && "c.tutor_id=?", q.student && "m.student_id=?", q.from && "cs.starts_at>=?", q.to && "cs.starts_at<?"].filter(Boolean).join(" AND "),
      [q.class, q.member, q.tutor, q.student, q.from, q.to].filter((v) => v !== undefined),
    ];
    const [bwhere, bargs] = [
      [q.tutor && "b.tutor_id=?", q.student && "b.student_id=?", q.from && "b.starts_at>=?", q.to && "b.starts_at<?"].filter(Boolean).join(" AND "),
      [q.tutor, q.student, q.from, q.to].filter((v) => v !== undefined),
    ];
    const lessons = all(db, `SELECT cs.id,'lesson' AS source,cs.class_id,cs.starts_at,cs.minutes,cs.status,cs.moved_from,
      c.title,c.color,c.status AS class_status,c.tutor_id,tu.name AS tutor_name,
      m.id AS member_id,m.student_id,m.status AS member_status,m.rate,m.held,m.sessions_total,
      sm.outcome,sm.note,sm.tutor_confirmed_at,sm.student_confirmed_at,sm.rating,sm.settled,
      su.name AS student_name
      FROM class_sessions cs JOIN classes c ON c.id=cs.class_id JOIN users tu ON tu.id=c.tutor_id
      LEFT JOIN session_members sm ON sm.session_id=cs.id
      LEFT JOIN class_members m ON m.id=sm.member_id LEFT JOIN users su ON su.id=m.student_id
      ${where ? `WHERE ${where}` : ""} ORDER BY cs.starts_at DESC LIMIT 500`, ...args);
    const bookings = q.class || q.member ? [] : all(db, `${bookingSql}${bwhere ? ` WHERE ${bwhere}` : ""} ORDER BY b.starts_at DESC LIMIT 500`, ...bargs);
    res.json([...lessons, ...bookings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 500));
  });
  // Small numbers for the tracking bar and the sidebar badge.
  app.get("/api/admin/sessions/summary", auth("admin"), (req, res) => {
    upkeep(db);
    const vnDaySql = (col) => `substr(datetime(${col},'+7 hours'),1,10)`;
    const lessons = one(db, `SELECT
      COUNT(*) FILTER (WHERE ${vnDaySql("cs.starts_at")}=${vnDaySql("'now'")}) AS today,
      COUNT(*) FILTER (WHERE cs.status='scheduled' AND datetime(cs.starts_at)<=datetime('now') AND datetime(cs.starts_at,'+'||cs.minutes||' minutes')>datetime('now')) AS running,
      COUNT(*) FILTER (WHERE sm.outcome='disputed' OR (sm.outcome='pending' AND cs.status='scheduled' AND datetime(cs.starts_at,'+'||cs.minutes||' minutes')<datetime('now'))) AS waiting,
      COUNT(*) FILTER (WHERE sm.outcome='confirmed' AND datetime(cs.starts_at,'+'||cs.minutes||' minutes')>datetime('now','-7 days')) AS confirmed7,
      COUNT(*) FILTER (WHERE datetime(cs.starts_at,'+'||cs.minutes||' minutes')>datetime('now','-7 days') AND datetime(cs.starts_at,'+'||cs.minutes||' minutes')<datetime('now') AND sm.outcome IN ('confirmed','charged','refunded')) AS ended7
      FROM class_sessions cs LEFT JOIN session_members sm ON sm.session_id=cs.id`);
    const bookings = one(db, `SELECT
      COUNT(*) FILTER (WHERE ${vnDaySql("starts_at")}=${vnDaySql("'now'")}) AS today,
      COUNT(*) FILTER (WHERE status='accepted' AND datetime(starts_at)<=datetime('now') AND datetime(starts_at,'+'||duration_minutes||' minutes')>datetime('now')) AS running,
      COUNT(*) FILTER (WHERE status IN ('missed','tutor_missed')) AS waiting,
      COUNT(*) FILTER (WHERE status='completed' AND datetime(starts_at,'+'||duration_minutes||' minutes')>datetime('now','-7 days')) AS confirmed7,
      COUNT(*) FILTER (WHERE datetime(starts_at,'+'||duration_minutes||' minutes')>datetime('now','-7 days') AND datetime(starts_at,'+'||duration_minutes||' minutes')<datetime('now') AND status IN ('completed','missed','tutor_missed')) AS ended7
      FROM bookings`);
    const merged = { today: 0, running: 0, waiting: 0, confirmed7: 0, ended7: 0 };
    for (const r of [lessons, bookings]) for (const k of Object.keys(merged)) merged[k] += r[k] || 0;
    res.json(merged);
  });
  // One standalone booking: people, money, messages and the audit trail.
  app.get("/api/admin/bookings/:id", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = one(db, `SELECT b.*,su.name AS student_name,su.email AS student_email,tu.name AS tutor_name,tu.email AS tutor_email,sub.name AS subject_name
      FROM bookings b JOIN users su ON su.id=b.student_id JOIN users tu ON tu.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id WHERE b.id=?`, id);
    if (!b) fail(404, "Không tìm thấy buổi đặt lịch.");
    res.json({
      booking: b,
      history: all(db, "SELECT a.id,a.action,a.created_at,u.name FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.target=? ORDER BY a.id DESC LIMIT 20", String(id)),
    });
  });
  // Admin cancels a standalone booking the same way a participant could.
  app.post("/api/admin/bookings/:id/cancel", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { note } = z.object({ note: z.string().trim().min(3).max(300) }).parse(req.body);
    transaction(db, () => {
      const b = one(db, `SELECT b.*,su.name AS student_name,tu.name AS tutor_name,sub.name AS subject_name FROM bookings b
        JOIN users su ON su.id=b.student_id JOIN users tu ON tu.id=b.tutor_id JOIN subjects sub ON sub.id=b.subject_id WHERE b.id=?`, id);
      if (!b || !["pending", "accepted"].includes(b.status)) fail(409, "Buổi đặt lịch không còn hủy được.");
      run(db, "UPDATE bookings SET status='cancelled',cancelled_by=?,cancelled_at=? WHERE id=? AND status IN ('pending','accepted')", req.user.id, new Date().toISOString(), id);
      for (const uid of [b.student_id, b.tutor_id]) notify(db, uid, "lesson_cancelled", { actor: "Quản trị viên", subject: b.subject_name || "", link: `/bookings?lesson=${id}` });
      audit(req.user.id, "booking.admin_cancel", id, { note, student: b.student_name, tutor: b.tutor_name, subject: b.subject_name, starts_at: b.starts_at, rate: b.rate });
    });
    res.json({ ok: true });
  });
  // One lesson in full: students and their money, move requests and the admin actions already taken.
  app.get("/api/admin/sessions/:id", auth("admin"), (req, res) => {
    upkeep(db);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const rows = all(db, `${sessionSql} WHERE cs.id=?`, id);
    if (!rows.length) fail(404, "Không tìm thấy buổi học.");
    res.json({
      session: rows[0],
      students: rows.filter((r) => r.member_id).map((r) => ({
        member_id: r.member_id, student_id: r.student_id, student_name: r.student_name,
        outcome: r.outcome, note: r.note, rating: r.rating, settled: r.settled,
        tutor_confirmed_at: r.tutor_confirmed_at, student_confirmed_at: r.student_confirmed_at,
        ...one(db, "SELECT status,rate,held,sessions_total,proposal_id FROM class_members WHERE id=?", r.member_id),
      })),
      moves: all(db, "SELECT mv.*,u.name AS requested_name FROM session_moves mv JOIN users u ON u.id=mv.requested_by WHERE mv.session_id=? ORDER BY mv.id DESC", id),
      history: all(db, "SELECT a.id,a.action,a.created_at,u.name FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.action LIKE 'session%' AND a.target=? ORDER BY a.id DESC LIMIT 20", String(id)),
    });
  });
  // Nudge everyone who has not confirmed an ended lesson, without deciding the outcome for them.
  app.post("/api/admin/sessions/remind", auth("admin"), (req, res) => {
    const d = z.object({ ids: z.array(z.number().int().positive()).min(1).max(50) }).parse(req.body);
    let reminded = 0;
    transaction(db, () => {
      for (const id of d.ids) {
        const rows = all(db, `${sessionSql} WHERE cs.id=?`, id);
        if (!rows.length || Date.parse(rows[0].starts_at) + rows[0].minutes * 60000 > Date.now()) continue;
        let sent = false;
        for (const r of rows.filter((x) => x.member_id && x.outcome === "pending")) {
          if (!r.student_confirmed_at) { notify(db, r.student_id, "session_remind", { actor: "Quản trị viên", subject: r.title, link: `/classes/${r.class_id}` }); sent = true; }
          if (!r.tutor_confirmed_at) { notify(db, r.tutor_id, "session_remind", { actor: "Quản trị viên", subject: r.title, link: `/classes/${r.class_id}` }); sent = true; }
        }
        if (sent) { audit(req.user.id, "session.remind", id, { session: rows[0].title }); reminded++; }
      }
    });
    res.json({ reminded });
  });
  // Administrators see every class, every lesson and one person's whole picture.
  app.get("/api/admin/classes", auth("admin"), (req, res) => {
    upkeep(db);
    res.json(all(db, `SELECT c.id,c.title,c.color,c.status,c.tutor_id,t.name AS tutor_name,
      (SELECT group_concat(u.name, ', ') FROM class_members m JOIN users u ON u.id=m.student_id WHERE m.class_id=c.id AND m.status='active') AS students,
      (SELECT COUNT(*) FROM class_sessions WHERE class_id=c.id AND status='scheduled' AND starts_at>?) AS upcoming,
      (SELECT COUNT(*) FROM session_members sm JOIN class_members m ON m.id=sm.member_id WHERE m.class_id=c.id AND sm.outcome='disputed') AS disputes,
      (SELECT MIN(starts_at) FROM class_sessions WHERE class_id=c.id AND status='scheduled' AND starts_at>?) AS next_at
      FROM classes c JOIN users t ON t.id=c.tutor_id ORDER BY disputes DESC, next_at IS NULL, next_at`, new Date().toISOString(), new Date().toISOString()));
  });
  app.get("/api/admin/schedule", auth("admin"), (req, res) => {
    const q = z.object({ from: z.string().max(30), to: z.string().max(30), user: z.coerce.number().int().positive().optional() }).parse(req.query);
    res.json(all(db, `${sessionSql} WHERE cs.starts_at>=? AND cs.starts_at<? AND cs.status<>'cancelled' ${q.user ? "AND (c.tutor_id=? OR m.student_id=?)" : ""} ORDER BY cs.starts_at`, q.from, q.to, ...(q.user ? [q.user, q.user] : [])));
  });
  app.get("/api/admin/users/:id/overview", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const u = one(db, "SELECT id,name,email,role,learner_type,status,created_at FROM users WHERE id=?", id);
    if (!u) fail(404, "Không tìm thấy tài khoản.");
    upkeep(db);
    res.json({
      user: u,
      wallet: one(db, "SELECT available,held,credits_free,credits_paid FROM wallets WHERE user_id=?", id) || { available: 0, held: 0, credits_free: 0, credits_paid: 0 },
      entries: all(db, "SELECT id,kind,amount,held,credits,note,created_at FROM wallet_entries WHERE user_id=? ORDER BY id DESC LIMIT 30", id),
      classes: all(db, `SELECT DISTINCT c.id,c.title,c.color,c.status FROM classes c LEFT JOIN class_members m ON m.class_id=c.id WHERE c.tutor_id=? OR m.student_id=? ORDER BY c.id DESC`, id, id),
      proposals: all(db, "SELECT p.id,p.status,p.total,p.sessions,p.created_at,s.name AS student_name,t.name AS tutor_name FROM proposals p JOIN users s ON s.id=p.student_id JOIN users t ON t.id=p.tutor_id WHERE p.student_id=? OR p.tutor_id=? ORDER BY p.id DESC LIMIT 30", id, id),
      family: all(db, "SELECT u.id,u.name FROM family_links f JOIN users u ON u.id=CASE WHEN f.parent_id=? THEN f.student_id ELSE f.parent_id END WHERE f.parent_id=? OR f.student_id=?", id, id, id),
      violations: one(db, "SELECT violations FROM tutors WHERE user_id=?", id)?.violations || 0,
    });
  });
  // Admin actions on a lesson or a package, each audited.
  app.post("/api/admin/sessions/:id/cancel", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { note } = z.object({ note: z.string().trim().min(3).max(300) }).parse(req.body);
    transaction(db, () => {
      if (!run(db, "UPDATE class_sessions SET status='cancelled' WHERE id=? AND status='scheduled'", id).changes) fail(409, "Buổi học không còn hoạt động.");
      const refunded = all(db, "SELECT m.student_id, m.rate AS amount FROM session_members sm JOIN class_members m ON m.id=sm.member_id WHERE sm.session_id=? AND sm.outcome IN ('pending','disputed')", id);
      const lesson = one(db, "SELECT cs.starts_at,c.subject_id FROM class_sessions cs JOIN classes c ON c.id=cs.class_id WHERE cs.id=?", id);
      run(db, "UPDATE session_members SET outcome='refunded',note=? WHERE session_id=? AND outcome IN ('pending','disputed')", note, id);
      for (const r of all(db, "SELECT DISTINCT m.student_id,c.tutor_id,c.title,m.class_id FROM session_members sm JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id WHERE sm.session_id=?", id))
        for (const uid of [r.student_id, r.tutor_id]) notify(db, uid, "session_cancelled", { actor: "Quản trị viên", subject: r.title, link: `/classes/${r.class_id}` });
      // Parents only of the students whose lesson this actually takes away.
      for (const r of refunded)
        notifyParents(db, r.student_id, "child_session_cancelled", { actor: "Quản trị viên", subject: subjectName(db, lesson.subject_id), detail: { when: lesson.starts_at, late: false, charged: false, by: "admin" } });
      audit(req.user.id, "session.admin_cancel", id, { note, refunded });
    });
    upkeep(db);
    res.json({ ok: true });
  });
  app.post("/api/admin/members/:id/end", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    transaction(db, () => {
      const member = one(db, "SELECT student_id,rate FROM class_members WHERE id=?", id);
      const future = one(db, "SELECT COUNT(*) AS n FROM session_members WHERE member_id=? AND outcome='pending' AND session_id IN (SELECT id FROM class_sessions WHERE starts_at>?)", id, new Date().toISOString());
      run(db, "UPDATE session_members SET outcome='refunded' WHERE member_id=? AND outcome='pending' AND session_id IN (SELECT id FROM class_sessions WHERE starts_at>?)", id, new Date().toISOString());
      audit(req.user.id, "member.admin_end", id, { user_id: member?.student_id, refunded: (future?.n || 0) * (member?.rate || 0) });
    });
    upkeep(db);
    res.json({ ok: true });
  });
  app.post("/api/admin/sessions/:id/resolve", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ member_id: z.number().int().positive(), outcome: z.enum(["confirmed", "refunded"]) }).parse(req.body);
    const r = one(db, "SELECT sm.*,m.student_id,m.class_id,m.rate,c.tutor_id,c.title,c.subject_id,cs.starts_at FROM session_members sm JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id JOIN class_sessions cs ON cs.id=sm.session_id WHERE sm.session_id=? AND sm.member_id=? AND sm.outcome='disputed'", id, d.member_id);
    if (!r) fail(404, "Không tìm thấy báo cáo.");
    transaction(db, () => {
      run(db, "UPDATE session_members SET outcome=? WHERE session_id=? AND member_id=?", d.outcome, id, d.member_id);
      for (const uid of [r.student_id, r.tutor_id]) notify(db, uid, "dispute_resolved", { subject: r.title, link: `/classes/${r.class_id}` });
      notifyParents(db, r.student_id, "child_dispute_resolved", { subject: subjectName(db, r.subject_id), detail: { when: r.starts_at, outcome: d.outcome, ...(r.rate ? {} : { free: true }) } });
    });
    audit(req.user.id, `session.resolve.${d.outcome}`, id, { member_id: d.member_id, outcome: d.outcome, user_id: r.student_id });
    upkeep(db);
    res.json({ ok: true });
  });
  app.put("/api/members/:id/review", auth("student"), (req, res) => {
    const { body } = z.object({ body: z.string().trim().max(1500) }).parse(req.body);
    const m = one(db, "SELECT * FROM class_members WHERE id=? AND student_id=?", req.params.id, req.user.id);
    if (!m || m.status !== "ended") fail(409, "Bình luận sau khi gói học kết thúc.");
    run(db, "UPDATE class_members SET review=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?", body, m.id);
    res.json({ ok: true });
  });
  // Report a class review for moderation — same mechanism as booking reviews.
  app.post("/api/members/:id/report", auth("student", "tutor"), (req, res) => {
    const d = z.object({ reason: z.string().min(1).max(300) }).parse(req.body);
    const m = one(db, "SELECT m.*,c.tutor_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND (m.student_id=? OR c.tutor_id=?)", req.params.id, req.user.id, req.user.id);
    if (!m) fail(404, "Không tìm thấy gói học.");
    if (!m.review && m.published_rating === null) fail(404, "Chưa có đánh giá cho gói học này.");
    run(db, "UPDATE class_members SET reported=1,reported_reason=?,reported_by=? WHERE id=?", d.reason, req.user.id, m.id);
    res.status(201).json({ ok: true });
  });
}

// Public stars: the average of each finished package's private lesson ratings.
export function classRatings(db) {
  const map = new Map();
  for (const r of all(db, `SELECT c.tutor_id, m.published_rating AS rating, m.review, m.reply, m.ended_at, u.display_name, u.name,
    (SELECT COUNT(*) FROM session_members WHERE member_id=m.id AND outcome IN ('confirmed','charged')) AS lessons
    FROM class_members m JOIN classes c ON c.id=m.class_id JOIN users u ON u.id=m.student_id WHERE m.status='ended' AND m.published_rating IS NOT NULL AND m.hidden=0 ORDER BY m.ended_at DESC`)) {
    if (!map.has(r.tutor_id)) map.set(r.tutor_id, []);
    map.get(r.tutor_id).push(r);
  }
  return (tutorId) => {
    const rows = map.get(tutorId) || [];
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : null;
    const counts = [5, 4, 3, 2, 1].map((star) => rows.filter((r) => Math.round(r.rating) === star).length);
    return { average: avg, count: rows.length, counts, reviews: rows.slice(0, 20).map((r) => ({ rating: r.rating, body: r.review, lessons: r.lessons, author: r.display_name || "Học sinh", ended_at: r.ended_at, ...(r.reply ? { reply: r.reply } : {}) })) };
  };
}
