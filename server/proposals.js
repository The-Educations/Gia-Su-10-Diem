import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { notifyParents } from "./family-notify.js";
import { isLiveTutor } from "./tutor-visibility.js";
import { move, settings, spendCredits, wallet } from "./wallet.js";
import { startClass } from "./classes.js";
import { childrenOf } from "./family.js";
import { isVerifiedStudent } from "./student-verification.js";
import { insertChatEvent } from "./chat-media.js";

// An offer (Upwork-style proposal) for a package of lessons. A student's offer
// holds the whole package from their balance until the tutor answers; a tutor's
// offer costs credits and holds the money only when the student accepts.
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const proposalSchema = z.object({
  student_id: z.number().int().positive().optional(),
  tutor_id: z.number().int().positive().optional(),
  subject_id: z.string().min(1).max(50),
  level: z.string().trim().max(40).default(""),
  mode: z.enum(["online", "offline"]),
  area: z.string().trim().max(160).default(""),
  sessions: z.number().int().min(1).max(60),
  minutes: z.number().int().refine((m) => [60, 90, 120].includes(m), "Chọn 60, 90 hoặc 120 phút."),
  rate: z.number().int().min(0).max(3000000),
  trial: z.boolean().default(false),
  schedule: z.array(z.object({ weekday: z.number().int().min(0).max(6), hour: z.number().int().min(6).max(22), minute: z.number().int().refine((m) => m === 0 || m === 30).default(0) })).min(1).max(14),
  start_date: date.refine((d) => d >= new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10), "Ngày bắt đầu không được ở quá khứ."),
  message: z.string().trim().max(2000).default(""),
});

export function proposalView(db, rows, viewer) {
  const fee = settings(db).fee_percent;
  return rows.map((p) => ({
    ...p,
    schedule: JSON.parse(p.schedule),
    payout: Math.round(p.total * (1 - fee / 100)),
    fee_percent: fee,
    incoming: (p.sender === "student" ? p.tutor_id : p.student_id) === viewer.id,
  }));
}

export function registerProposals(app, db, auth, audit, { expireProposals }) {
  const select = `SELECT p.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name
    FROM proposals p JOIN users s ON s.id=p.student_id JOIN users t ON t.id=p.tutor_id LEFT JOIN subjects sub ON sub.id=p.subject_id`;
  const get = (id) => one(db, `${select} WHERE p.id=?`, id);

  app.get("/api/proposals", auth("student", "tutor"), (req, res) => {
    expireProposals();
    const people = [req.user.id, ...childrenOf(db, req.user.id)];
    const rows = all(db, `${select} WHERE p.student_id IN (${people.map(() => "?").join(",")}) OR p.tutor_id=? ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 200`, ...people, req.user.id);
    res.json(proposalView(db, rows, req.user).map((p) => ({ ...p, incoming: p.incoming || (p.sender === "tutor" && people.includes(p.student_id)) })));
  });

  app.post("/api/proposals", auth("student", "tutor"), (req, res) => {
    const d = proposalSchema.parse(req.body), s = settings(db), byStudent = req.user.role === "student";
    // Parents follow their child's learning; offers are between the student and the tutor.
    if (req.user.learner_type === "parent") fail(403, "Phụ huynh theo dõi tài khoản của con. Con gửi đề nghị từ tài khoản học sinh.");
    if (req.user.onboarding_step < 3) fail(403, "Hoàn tất thiết lập tài khoản để gửi đề nghị.");
    if (byStudent && !isVerifiedStudent(db, req.user.id)) fail(403, "Xác minh tài khoản học sinh (học bạ hoặc bảng điểm) để gửi đề nghị.");
    const studentId = byStudent ? req.user.id : d.student_id, tutorId = byStudent ? d.tutor_id : req.user.id;
    if (!studentId || !tutorId) fail(400, byStudent ? "Chọn gia sư." : "Chọn học sinh.");
    if (!one(db, "SELECT 1 FROM subjects WHERE id=? AND archived=0", d.subject_id)) fail(400, "Môn học không có trong danh mục.");
    const tutor = one(db, "SELECT t.status,t.published FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND u.status='active' AND u.role='tutor'", tutorId);
    if (!isLiveTutor(tutor)) fail(409, "Gia sư hiện chưa nhận đề nghị.");
    if (!one(db, "SELECT 1 FROM users WHERE id=? AND role='student' AND status='active'", studentId)) fail(409, "Tài khoản học sinh không hoạt động.");
    // A free trial is one 60-minute lesson, once per student and tutor, when the tutor offers trials.
    if (d.trial) {
      if (!byStudent) fail(400, "Chỉ học sinh gửi được yêu cầu học thử.");
      if (!one(db, "SELECT accepts_trial FROM tutors WHERE user_id=?", tutorId)?.accepts_trial) fail(409, "Gia sư hiện không nhận học thử.");
      if (one(db, "SELECT 1 FROM proposals WHERE student_id=? AND tutor_id=? AND trial=1 AND status IN ('pending','accepted')", studentId, tutorId)) fail(409, "Bạn đã học thử với gia sư này.");
      Object.assign(d, { sessions: 1, minutes: 60, rate: 0, schedule: d.schedule.slice(0, 1) });
    } else if (d.rate < 50000) fail(400, "Học phí tối thiểu 50.000đ / buổi.");
    // Two weekly slots on one day must not overlap: the second lesson would start before the first ends.
    const slots = [...d.schedule].sort((a, b) => a.weekday - b.weekday || a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    for (let i = 1; i < slots.length; i++)
      if (slots[i].weekday === slots[i - 1].weekday && slots[i].hour * 60 + slots[i].minute - (slots[i - 1].hour * 60 + slots[i - 1].minute) < d.minutes)
        fail(400, "Các khung giờ trong tuần không được chồng lên nhau.");
    const total = d.sessions * d.rate;
    const id = transaction(db, () => {
      if (one(db, "SELECT 1 FROM proposals WHERE student_id=? AND tutor_id=? AND status='pending'", studentId, tutorId)) fail(409, "Đang có một đề nghị chờ trả lời giữa hai bạn.");
      const expires = new Date(Date.now() + s.offer_hours * 3600000).toISOString();
      const pid = Number(run(db, `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,level,mode,area,sessions,minutes,rate,total,schedule,start_date,message,expires_at,held,credits,trial)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, byStudent ? "student" : "tutor", studentId, tutorId, d.subject_id, d.level, d.mode, d.area, d.sessions, d.minutes, d.rate, total,
        JSON.stringify(d.schedule), d.start_date, d.message, expires, byStudent ? total : 0, byStudent ? 0 : s.offer_credits, Number(d.trial)).lastInsertRowid);
      // Xu are the fee a tutor pays for sending an offer. A student's offer holds their own money
      // (a free trial holds none) and never touches the tutor's Xu.
      if (byStudent) {
        if (total) move(db, studentId, "offer_hold", { amount: -total, held: total, ref: `proposal:${pid}` });
      } else spendCredits(db, tutorId, s.offer_credits, `proposal:${pid}`);
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", studentId, tutorId);
      const thread = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", studentId, tutorId);
      insertChatEvent(db, "inquiry", thread.id, req.user, "đã gửi đề nghị học", { kind: "proposal", id: pid });
      const subject = one(db, "SELECT name FROM subjects WHERE id=?", d.subject_id).name;
      notify(db, byStudent ? tutorId : studentId, "proposal_new", { actor: req.user.name, subject, link: `/proposals?id=${pid}` });
      if (byStudent) notifyParents(db, studentId, "child_proposal_sent", { actor: one(db, "SELECT name FROM users WHERE id=?", tutorId).name, subject, link: `/proposals?id=${pid}`, detail: { amount: total } });
      else {
        // A tutor's offer is paid on acceptance, so the parent learns how much the child is short.
        const short = Math.max(0, total - wallet(db, studentId).available);
        notifyParents(db, studentId, "child_proposal_new", { actor: req.user.name, subject, link: short ? `/wallet?for=${studentId}` : `/proposals?id=${pid}`, detail: { amount: total, short } });
      }
      return pid;
    });
    audit(req.user.id, "proposal.created", id);
    res.status(201).json(proposalView(db, [get(id)], req.user)[0]);
  });

  app.patch("/api/proposals/:id", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { action, class_id } = z.object({ action: z.enum(["accept", "decline", "withdraw"]), class_id: z.number().int().positive().optional() }).parse(req.body);
    let classId = null;
    expireProposals();
    transaction(db, () => {
      const p = get(id);
      const actor = req.user.id;
      if (!p || ![p.student_id, p.tutor_id].includes(actor)) fail(404, "Không tìm thấy đề nghị.");
      if (p.status !== "pending") fail(409, "Đề nghị đã được xử lý hoặc hết hạn.");
      const recipient = p.sender === "student" ? p.tutor_id : p.student_id, sender = p.sender === "student" ? p.student_id : p.tutor_id;
      if (action === "withdraw" ? actor !== sender : actor !== recipient) fail(403, action === "withdraw" ? "Chỉ người gửi rút được đề nghị." : "Chỉ người nhận trả lời được đề nghị.");
      const status = { accept: "accepted", decline: "declined", withdraw: "withdrawn" }[action];
      if (!run(db, "UPDATE proposals SET status=?,decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", status, id).changes) fail(409, "Đề nghị vừa thay đổi. Tải lại trang.");
      if (action === "accept" && p.sender === "tutor") {
        if (!isVerifiedStudent(db, p.student_id)) fail(403, "Xác minh tài khoản học sinh (học bạ hoặc bảng điểm) để nhận đề nghị.");
        // The student pays in when accepting a tutor's offer.
        const w = wallet(db, p.student_id);
        if (w.available < p.total) fail(402, `Số dư còn thiếu ${(p.total - w.available).toLocaleString("vi-VN")}đ. Nạp thêm để nhận đề nghị.`);
        move(db, p.student_id, "offer_hold", { amount: -p.total, held: p.total, ref: `proposal:${id}` });
        run(db, "UPDATE proposals SET held=? WHERE id=?", p.total, id);
      }
      if (action !== "accept" && p.held) move(db, p.student_id, "offer_released", { amount: p.held, held: -p.held, ref: `proposal:${id}` });
      // An accepted offer becomes a class (or joins one of the tutor's classes).
      if (action === "accept") classId = startClass(db, get(id), req.user.id === p.tutor_id ? class_id : null);
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", p.student_id, p.tutor_id);
      const thread = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", p.student_id, p.tutor_id);
      insertChatEvent(db, "inquiry", thread.id, req.user, { accepted: "đã chấp nhận đề nghị học", declined: "đã từ chối đề nghị học", withdrawn: "đã rút đề nghị học" }[status], { kind: "proposal", id });
      notify(db, req.user.id === p.student_id ? p.tutor_id : p.student_id, `proposal_${status}`, { actor: req.user.name, subject: p.subject_name, link: `/proposals?id=${id}` });
      if (action === "accept") notifyParents(db, p.student_id, "child_class_started", { actor: p.tutor_name, subject: p.subject_name });
      else notifyParents(db, p.student_id, "child_proposal_closed", { subject: p.subject_name, link: `/proposals?id=${id}`, detail: { amount: p.held, outcome: status } });
    });
    audit(req.user.id, `proposal.${action}`, id);
    res.json({ ...proposalView(db, [get(id)], req.user)[0], class_id: classId });
  });
}
