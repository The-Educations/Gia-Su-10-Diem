import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { notify } from "./notifications.js";
import { isLiveTutor } from "./tutor-visibility.js";
import { move, settings, spendCredits, wallet } from "./wallet.js";
import { startClass } from "./classes.js";

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
  rate: z.number().int().min(50000).max(3000000),
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
    res.json(proposalView(db, all(db, `${select} WHERE p.student_id=? OR p.tutor_id=? ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 200`, req.user.id, req.user.id), req.user));
  });

  app.post("/api/proposals", auth("student", "tutor"), (req, res) => {
    const d = proposalSchema.parse(req.body), s = settings(db), byStudent = req.user.role === "student";
    const studentId = byStudent ? req.user.id : d.student_id, tutorId = byStudent ? d.tutor_id : req.user.id;
    if (!studentId || !tutorId) fail(400, byStudent ? "Chọn gia sư." : "Chọn học sinh.");
    if (!one(db, "SELECT 1 FROM subjects WHERE id=? AND archived=0", d.subject_id)) fail(400, "Môn học không có trong danh mục.");
    const tutor = one(db, "SELECT t.status,t.published FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND u.status='active' AND u.role='tutor'", tutorId);
    if (!isLiveTutor(tutor)) fail(409, "Gia sư hiện chưa nhận offer.");
    if (!one(db, "SELECT 1 FROM users WHERE id=? AND role='student' AND status='active'", studentId)) fail(409, "Tài khoản học sinh không hoạt động.");
    const total = d.sessions * d.rate;
    const id = transaction(db, () => {
      if (one(db, "SELECT 1 FROM proposals WHERE student_id=? AND tutor_id=? AND status='pending'", studentId, tutorId)) fail(409, "Đang có một offer chờ trả lời giữa hai bạn.");
      const expires = new Date(Date.now() + s.offer_hours * 3600000).toISOString();
      const pid = Number(run(db, `INSERT INTO proposals(sender,student_id,tutor_id,subject_id,level,mode,area,sessions,minutes,rate,total,schedule,start_date,message,expires_at,held,credits)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, byStudent ? "student" : "tutor", studentId, tutorId, d.subject_id, d.level, d.mode, d.area, d.sessions, d.minutes, d.rate, total,
        JSON.stringify(d.schedule), d.start_date, d.message, expires, byStudent ? total : 0, byStudent ? 0 : s.offer_credits).lastInsertRowid);
      if (byStudent) move(db, studentId, "offer_hold", { amount: -total, held: total, ref: `proposal:${pid}` });
      else spendCredits(db, tutorId, s.offer_credits, `proposal:${pid}`);
      notify(db, byStudent ? tutorId : studentId, "proposal_new", { actor: req.user.name, subject: one(db, "SELECT name FROM subjects WHERE id=?", d.subject_id).name, link: `/proposals?id=${pid}` });
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
      if (!p || ![p.student_id, p.tutor_id].includes(req.user.id)) fail(404, "Không tìm thấy offer.");
      if (p.status !== "pending") fail(409, "Offer đã được xử lý hoặc hết hạn.");
      const recipient = p.sender === "student" ? p.tutor_id : p.student_id, sender = p.sender === "student" ? p.student_id : p.tutor_id;
      if (action === "withdraw" ? req.user.id !== sender : req.user.id !== recipient) fail(403, action === "withdraw" ? "Chỉ người gửi rút được offer." : "Chỉ người nhận trả lời được offer.");
      const status = { accept: "accepted", decline: "declined", withdraw: "withdrawn" }[action];
      if (!run(db, "UPDATE proposals SET status=?,decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", status, id).changes) fail(409, "Offer vừa thay đổi. Tải lại trang.");
      if (action === "accept" && p.sender === "tutor") {
        // The student pays in when accepting a tutor's offer.
        const w = wallet(db, p.student_id);
        if (w.available < p.total) fail(402, `Số dư còn thiếu ${(p.total - w.available).toLocaleString("vi-VN")}đ. Nạp thêm để nhận offer.`);
        move(db, p.student_id, "offer_hold", { amount: -p.total, held: p.total, ref: `proposal:${id}` });
        run(db, "UPDATE proposals SET held=? WHERE id=?", p.total, id);
      }
      if (action !== "accept" && p.held) move(db, p.student_id, "offer_released", { amount: p.held, held: -p.held, ref: `proposal:${id}` });
      // An accepted offer becomes a class (or joins one of the tutor's classes).
      if (action === "accept") classId = startClass(db, get(id), req.user.id === p.tutor_id ? class_id : null);
      notify(db, req.user.id === p.student_id ? p.tutor_id : p.student_id, `proposal_${status}`, { actor: req.user.name, subject: p.subject_name, link: `/proposals?id=${id}` });
    });
    audit(req.user.id, `proposal.${action}`, id);
    res.json({ ...proposalView(db, [get(id)], req.user)[0], class_id: classId });
  });
}
