import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { move, settings } from "./wallet.js";
import { childrenOf } from "./family.js";

// A class has one tutor, one or more students and a weekly rhythm. Each student
// brings their own package (an accepted offer): a number of lessons paid in
// advance and held. After every lesson both sides confirm; the tutor is paid
// for confirmed lessons minus the platform fee when the package ends, or at the
// end of each month for longer packages. Lessons that never happened go back
// to the student.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const COLORS = ["rose", "sky", "sage", "butter", "lilac", "peach", "mint", "sand"];
const HOUR = 3600000;
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
  if (!db.prepare("PRAGMA table_info(tutors)").all().some((c) => c.name === "violations"))
    db.exec("ALTER TABLE tutors ADD COLUMN violations INTEGER NOT NULL DEFAULT 0");
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

function attachSessions(db, cls, memberId, count) {
  const future = all(db, "SELECT id,starts_at FROM class_sessions WHERE class_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at", cls.id, new Date().toISOString());
  const ids = future.slice(0, count).map((s) => s.id);
  if (ids.length < count) {
    const last = future.at(-1)?.starts_at || new Date().toISOString();
    const startDate = new Date(Date.parse(last) + 7 * HOUR).toISOString().slice(0, 10);
    for (const at of lessonTimes(JSON.parse(cls.schedule), startDate, count - ids.length, Date.parse(last)))
      ids.push(Number(run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cls.id, at, cls.minutes).lastInsertRowid));
  }
  for (const id of ids) run(db, "INSERT OR IGNORE INTO session_members(session_id,member_id) VALUES (?,?)", id, memberId);
}

// Called inside the transaction that accepts an offer.
export function startClass(db, p, classId = null) {
  let cls;
  if (classId) {
    cls = one(db, "SELECT * FROM classes WHERE id=? AND tutor_id=? AND status='active'", classId, p.tutor_id);
    if (!cls) fail(404, "Không tìm thấy lớp để thêm học sinh.");
  } else {
    const subject = one(db, "SELECT name FROM subjects WHERE id=?", p.subject_id)?.name || p.subject_id;
    const student = one(db, "SELECT name FROM users WHERE id=?", p.student_id).name;
    const color = COLORS[one(db, "SELECT COUNT(*) n FROM classes WHERE tutor_id=?", p.tutor_id).n % COLORS.length];
    const id = Number(run(db, "INSERT INTO classes(tutor_id,title,subject_id,mode,area,color,minutes,schedule) VALUES (?,?,?,?,?,?,?,?)",
      p.tutor_id, `${subject} · ${student}`, p.subject_id, p.mode, p.area, color, p.minutes, p.schedule).lastInsertRowid);
    cls = one(db, "SELECT * FROM classes WHERE id=?", id);
  }
  const memberId = Number(run(db, "INSERT INTO class_members(class_id,student_id,proposal_id,sessions_total,rate,held) VALUES (?,?,?,?,?,?)", cls.id, p.student_id, p.id, p.sessions, p.rate, p.total).lastInsertRowid);
  if (classId) attachSessions(db, cls, memberId, p.sessions);
  else
    // A new class follows the offer's own dates, whatever day it is accepted.
    for (const at of lessonTimes(JSON.parse(p.schedule), p.start_date, p.sessions)) {
      const sid = run(db, "INSERT INTO class_sessions(class_id,starts_at,minutes) VALUES (?,?,?)", cls.id, at, p.minutes).lastInsertRowid;
      run(db, "INSERT INTO session_members(session_id,member_id) VALUES (?,?)", sid, memberId);
    }
  return cls.id;
}

function settle(db, memberId, { final = false } = {}) {
  const m = one(db, "SELECT m.*,c.tutor_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=?", memberId);
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
    const left = one(db, "SELECT held FROM class_members WHERE id=?", memberId).held;
    if (left > 0) move(db, m.student_id, "lesson_refund", { amount: left, held: -left, ref: `member:${memberId}` });
    // Lessons still ahead are no longer this student's.
    run(db, "DELETE FROM session_members WHERE member_id=? AND outcome='pending' AND session_id IN (SELECT id FROM class_sessions WHERE starts_at>?)", memberId, new Date().toISOString());
    const avg = one(db, "SELECT AVG(rating) a FROM session_members WHERE member_id=? AND rating IS NOT NULL", memberId).a;
    run(db, "UPDATE class_members SET held=0,status='ended',ended_at=CURRENT_TIMESTAMP,published_rating=? WHERE id=?", avg ? Math.round(avg * 10) / 10 : null, memberId);
    notify(db, m.student_id, "package_ended", { link: `/classes/${m.class_id}` });
    notify(db, m.tutor_id, "package_settled", { subject: String(pay), link: "/wallet" });
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

const sessionSql = `SELECT cs.*, c.title, c.color, c.tutor_id, c.subject_id, c.mode, c.meeting_url, sm.member_id, sm.tutor_confirmed_at, sm.student_confirmed_at, sm.outcome, sm.rating,
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
    const ids = all(db, "SELECT id FROM classes WHERE tutor_id=? UNION SELECT class_id FROM class_members WHERE student_id=?", req.user.id, req.user.id).map((r) => r.id);
    res.json(ids.map((id) => {
      const c = classFor(id, req.user);
      const next = one(db, "SELECT starts_at FROM class_sessions WHERE class_id=? AND status='scheduled' AND starts_at>? ORDER BY starts_at LIMIT 1", id, new Date().toISOString());
      return { ...c, next_at: next?.starts_at || null };
    }).sort((a, b) => (a.status === b.status ? (a.next_at || "z").localeCompare(b.next_at || "z") : a.status === "active" ? -1 : 1)));
  });
  app.get("/api/classes/:id", auth(), (req, res) => {
    upkeep(db);
    const id = z.coerce.number().int().positive().parse(req.params.id), c = classFor(id, req.user);
    const own = new Set(c.members.map((m) => m.student_id));
    const sessions = all(db, `${sessionSql} WHERE cs.class_id=? ORDER BY cs.starts_at`, id).filter((s) => c.tutor_id === req.user.id || req.user.role === "admin" || own.has(s.student_id));
    res.json({ ...c, sessions, materials: all(db, "SELECT * FROM class_materials WHERE class_id=? ORDER BY id DESC", id),
      moves: all(db, "SELECT mv.* FROM session_moves mv JOIN class_sessions cs ON cs.id=mv.session_id WHERE cs.class_id=? AND mv.status='pending'", id) });
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
    });
    upkeep(db);
    res.json({ ok: true });
  });
  app.post("/api/sessions/:id/dispute", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { reason } = z.object({ reason: z.string().trim().min(5).max(1000) }).parse(req.body);
    transaction(db, () => {
      const { mine, session } = member(id, req.user);
      if (!ended(session)) fail(409, "Chỉ báo vấn đề sau khi buổi học kết thúc.");
      for (const r of mine.filter((r) => r.outcome === "pending")) run(db, "UPDATE session_members SET outcome='disputed',note=? WHERE session_id=? AND member_id=?", reason, id, r.member_id);
      run(db, "INSERT OR IGNORE INTO support_threads(user_id) VALUES (?)", req.user.id);
      const thread = one(db, "SELECT id FROM support_threads WHERE user_id=?", req.user.id);
      run(db, "INSERT INTO support_messages(thread_id,sender_id,body) VALUES (?,?,?)", thread.id, req.user.id, `Báo vấn đề buổi học #${id} (${session.title}): ${reason}`);
      for (const a of all(db, "SELECT id FROM users WHERE role='admin' AND status='active'")) notify(db, a.id, "session_disputed", { actor: req.user.name, subject: session.title, link: "/admin?tab=classes" });
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
      }
      if (tutor || !one(db, "SELECT 1 FROM session_members WHERE session_id=? AND outcome='pending'", id)) run(db, "UPDATE class_sessions SET status='cancelled' WHERE id=?", id);
      if (tutor && late) run(db, "UPDATE tutors SET violations=violations+1 WHERE user_id=?", req.user.id);
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
      run(db, "UPDATE session_moves SET status='replaced' WHERE session_id=? AND status='pending'", id);
      run(db, "INSERT INTO session_moves(session_id,requested_by,starts_at) VALUES (?,?,?)", id, req.user.id, starts_at);
      for (const uid of tutor ? [...new Set(rows.map((r) => r.student_id).filter(Boolean))] : [session.tutor_id])
        notify(db, uid, "session_move", { actor: req.user.name, subject: session.title, link: `/classes/${session.class_id}` });
    });
    res.status(201).json({ ok: true });
  });
  app.patch("/api/moves/:id", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    transaction(db, () => {
      const mv = one(db, "SELECT * FROM session_moves WHERE id=? AND status='pending'", id);
      if (!mv) fail(404, "Đề nghị dời lịch không còn.");
      const { session } = member(mv.session_id, req.user);
      if (mv.requested_by === req.user.id) fail(403, "Bên còn lại cần đồng ý.");
      run(db, "UPDATE session_moves SET status=? WHERE id=?", accept ? "accepted" : "declined", id);
      if (accept) run(db, "UPDATE class_sessions SET moved_from=COALESCE(moved_from,starts_at),starts_at=? WHERE id=?", mv.starts_at, mv.session_id);
      notify(db, mv.requested_by, accept ? "session_moved" : "session_move_declined", { actor: req.user.name, subject: session.title, link: `/classes/${session.class_id}` });
    });
    res.json({ ok: true });
  });
  app.put("/api/sessions/:id/rating", auth("student"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);
    const { mine, session } = member(id, req.user);
    if (!ended(session)) fail(409, "Chấm sau khi buổi học kết thúc.");
    for (const r of mine) run(db, "UPDATE session_members SET rating=? WHERE session_id=? AND member_id=?", rating, id, r.member_id);
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
    const m = one(db, "SELECT m.*,c.title,c.tutor_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND c.tutor_id=? AND m.status='active'", req.params.id, req.user.id);
    if (!m) fail(404, "Không tìm thấy học sinh.");
    if (m.reminded_at && Date.now() - Date.parse(m.reminded_at + "Z") < 24 * HOUR) fail(429, "Đã nhắc trong 24 giờ qua.");
    run(db, "UPDATE class_members SET reminded_at=CURRENT_TIMESTAMP WHERE id=?", m.id);
    notify(db, m.student_id, "renew_reminder", { actor: req.user.name, subject: m.title, link: `/classes/${m.class_id}?renew=${m.id}` });
    res.json({ ok: true });
  });
  app.post("/api/members/:id/renew", auth("student"), (req, res) => {
    const { sessions } = z.object({ sessions: z.number().int().min(1).max(60) }).parse(req.body);
    transaction(db, () => {
      const m = one(db, "SELECT m.*,c.tutor_id FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.id=? AND m.student_id=? AND m.status='active'", req.params.id, req.user.id);
      if (!m) fail(404, "Gói học đã kết thúc. Gửi offer mới để học tiếp.");
      const cost = sessions * m.rate;
      move(db, req.user.id, "offer_hold", { amount: -cost, held: cost, ref: `member:${m.id}` });
      run(db, "UPDATE class_members SET sessions_total=sessions_total+?,held=held+? WHERE id=?", sessions, cost, m.id);
      attachSessions(db, one(db, "SELECT * FROM classes WHERE id=?", m.class_id), m.id, sessions);
      notify(db, m.tutor_id, "package_renewed", { actor: req.user.name, subject: String(sessions), link: `/classes/${m.class_id}` });
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
      tutors: one(db, "SELECT COUNT(*) n FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.status='pending' AND u.status='active'").n,
      credentials: one(db, "SELECT COUNT(*) n FROM tutor_credentials c WHERE c.status='pending' AND EXISTS(SELECT 1 FROM credential_files f WHERE f.credential_id=c.id)").n,
      withdrawals: one(db, "SELECT COUNT(*) n FROM withdrawals WHERE status='requested'").n,
      community: one(db, "SELECT COUNT(*) n FROM community_posts WHERE status='pending'").n,
      violations: all(db, "SELECT t.user_id,u.name,t.violations FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.violations>=3 ORDER BY t.violations DESC"),
      disputes: all(db, `SELECT sm.session_id,sm.member_id,sm.note,cs.starts_at,c.id AS class_id,c.title,u.name AS student_name,t.name AS tutor_name
        FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id JOIN classes c ON c.id=cs.class_id
        JOIN class_members m ON m.id=sm.member_id JOIN users u ON u.id=m.student_id JOIN users t ON t.id=c.tutor_id WHERE sm.outcome='disputed' ORDER BY cs.starts_at`),
    });
  });
  app.post("/api/admin/sessions/:id/resolve", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ member_id: z.number().int().positive(), outcome: z.enum(["confirmed", "refunded"]) }).parse(req.body);
    const r = one(db, "SELECT sm.*,m.student_id,c.tutor_id,c.title FROM session_members sm JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id WHERE sm.session_id=? AND sm.member_id=? AND sm.outcome='disputed'", id, d.member_id);
    if (!r) fail(404, "Không tìm thấy báo cáo.");
    run(db, "UPDATE session_members SET outcome=? WHERE session_id=? AND member_id=?", d.outcome, id, d.member_id);
    for (const uid of [r.student_id, r.tutor_id]) notify(db, uid, "dispute_resolved", { subject: r.title, link: "/classes" });
    audit(req.user.id, `session.resolve.${d.outcome}`, id);
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
}

// Public stars: the average of each finished package's private lesson ratings.
export function classRatings(db) {
  const map = new Map();
  for (const r of all(db, `SELECT c.tutor_id, m.published_rating AS rating, m.review, m.ended_at, u.display_name, u.name,
    (SELECT COUNT(*) FROM session_members WHERE member_id=m.id AND outcome IN ('confirmed','charged')) AS lessons
    FROM class_members m JOIN classes c ON c.id=m.class_id JOIN users u ON u.id=m.student_id WHERE m.status='ended' AND m.published_rating IS NOT NULL ORDER BY m.ended_at DESC`)) {
    if (!map.has(r.tutor_id)) map.set(r.tutor_id, []);
    map.get(r.tutor_id).push(r);
  }
  return (tutorId) => {
    const rows = map.get(tutorId) || [];
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : null;
    const counts = [5, 4, 3, 2, 1].map((star) => rows.filter((r) => Math.round(r.rating) === star).length);
    return { average: avg, count: rows.length, counts, reviews: rows.slice(0, 20).map((r) => ({ rating: r.rating, body: r.review, lessons: r.lessons, author: r.display_name || "Học sinh", ended_at: r.ended_at })) };
  };
}
