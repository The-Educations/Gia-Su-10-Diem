import { liveTutorSql, publicView } from "./tutor-visibility.js";
import { all, one, run, transaction } from "./db.js";
import { overlaps, weeklySchedule } from "./availability.js";
import { availabilitySchema, z } from "./validation.js";
import { legacyWeeklyBlocks } from "./legacy-weekly.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const dayMs = 86400000;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}, "Ngày không hợp lệ.");
const schema = z.object({ tutor_id: z.number().int().positive(), subject_id: z.string(), mode: z.enum(["online", "offline"]), start_date: date, kind: z.enum(["course", "trial"]).default("course"), weeks: z.number().int().min(1).max(52).optional(), end_date: z.never().optional(), note: z.string().trim().max(2000).default("") });
const blockKey = b => b.weekday * 24 + b.hour;

export function offerDates(offer) {
  const start = Date.parse(`${offer.start_date}T00:00:00+07:00`), end = Date.parse(`${offer.end_date}T00:00:00+07:00`);
  if (end < start || end - start > 365 * dayMs) fail(400, "Ngày kết thúc không được trước ngày bắt đầu, trong tối đa 1 năm.");
  const sessions = [];
  for (let day = start; day <= end; day += dayMs) {
    const weekday = (new Date(day + 7 * 3600000).getUTCDay() + 6) % 7;
    for (const b of offer.blocks.filter(b => b.weekday === weekday)) sessions.push({ starts_at: new Date(day + b.hour * 3600000).toISOString(), duration_minutes: 60 });
  }
  if (!sessions.length || sessions.length > 1000) fail(400, "Chọn lịch có từ 1 đến 1.000 buổi học.");
  return sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function preview(db, offer) {
  const available = new Set(weeklySchedule(db, offer.tutor_id).blocks.map(blockKey));
  const bookings = all(db, "SELECT student_id,tutor_id,starts_at,duration_minutes FROM bookings WHERE (student_id=? OR tutor_id=?) AND status IN ('pending','accepted','completed') AND (offer_id IS NULL OR offer_id<>?)", offer.student_id, offer.tutor_id, offer.id || 0);
  const legacy = legacyWeeklyBlocks(db, { tutorId: offer.tutor_id, studentId: offer.student_id });
  const slots = all(db, "SELECT starts_at,duration_minutes FROM slots WHERE tutor_id=? AND duration_minutes<>60", offer.tutor_id);
  const sessions = offerDates(offer).map(session => {
    const local = new Date(Date.parse(session.starts_at) + 7 * 3600000);
    const b = { weekday: (local.getUTCDay() + 6) % 7, hour: local.getUTCHours() };
    let conflict = "";
    if (offer.status === "pending" || !offer.status) {
      if (Date.parse(session.starts_at) <= Date.now() + 3600000) conflict = "Buổi học đã qua hoặc bắt đầu trong vòng 1 giờ.";
      else if (!available.has(blockKey(b))) conflict = "Gia sư không còn mở giờ này.";
      else if (legacy.some(other => blockKey(other) === blockKey(b))) conflict = "Trùng lịch tuần đã xác nhận.";
      else if (slots.some(slot => slot.starts_at === session.starts_at)) conflict = "Khung giờ hiện có thời lượng khác 1 giờ.";
    }
    const occupied = bookings.find(other => overlaps(other, session));
    if (occupied) conflict = occupied.tutor_id === offer.tutor_id ? "Gia sư đã có buổi học trong giờ này." : "Học sinh đã có buổi học trong giờ này.";
    return { ...session, conflict };
  });
  return { sessions, conflict_count: sessions.filter(s => s.conflict).length };
}

export function registerOffers(app, db, auth) {
  const select = `SELECT o.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name FROM offers o JOIN users s ON s.id=o.student_id JOIN users t ON t.id=o.tutor_id JOIN subjects sub ON sub.id=o.subject_id`;
  function owned(req) {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const offer = one(db, `${select} WHERE o.id=? AND (o.student_id=? OR o.tutor_id=?)`, id, req.user.id, req.user.id);
    if (!offer) fail(404, "Không tìm thấy đề nghị học.");
    return { ...offer, blocks: JSON.parse(offer.blocks) };
  }
  function trialEligible(studentId, tutorId) {
    if (one(db, "SELECT id FROM offers WHERE student_id=? AND tutor_id=? AND kind='trial' AND accepted_at IS NOT NULL", studentId, tutorId)) fail(409, "Bạn đã được nhận học thử với gia sư này. Hãy gửi đề nghị học theo khóa.");
  }
  function input(req) {
    const d = schema.parse(req.body);
    const { blocks } = availabilitySchema.parse({ revision: 0, blocks: req.body.blocks });
    if (!blocks.length) fail(400, "Chọn ít nhất một giờ học mỗi tuần.");
    const tutor = publicView(one(db, `SELECT t.* FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND ${liveTutorSql("t")} AND u.status='active' AND u.role='tutor'`, d.tutor_id));
    if (!tutor) fail(404, "Gia sư chưa có hồ sơ công khai.");
    if (!JSON.parse(tutor.subjects).includes(d.subject_id) || (tutor.mode !== "both" && tutor.mode !== d.mode)) fail(400, "Môn học hoặc hình thức không phù hợp.");
    if (d.kind === "trial") {
      if (!tutor.accepts_trial) fail(409, "Gia sư hiện không nhận học thử.");
      if (blocks.length !== 1 || d.weeks !== undefined) fail(400, "Học thử chỉ gồm một buổi 60 phút.");
      trialEligible(req.user.id, d.tutor_id);
      const start = new Date(`${d.start_date}T00:00:00Z`);
      const weekday = (start.getUTCDay() + 6) % 7;
      start.setUTCDate(start.getUTCDate() + (blocks[0].weekday - weekday + 7) % 7);
      d.start_date = start.toISOString().slice(0, 10);
      d.end_date = d.start_date;
    } else {
      if (d.weeks === undefined) fail(400, "Chọn số tuần học từ 1 đến 52.");
      d.end_date = new Date(Date.parse(`${d.start_date}T00:00:00Z`) + (d.weeks * 7 - 1) * dayMs).toISOString().slice(0, 10);
    }
    return { ...d, blocks, student_id: req.user.id, rate: d.kind === "trial" ? 0 : tutor.rate, status: "pending" };
  }
  app.get("/api/offers", auth("student", "tutor"), (req, res) => {
    res.json(all(db, `${select} WHERE o.student_id=? OR o.tutor_id=? ORDER BY o.id DESC`, req.user.id, req.user.id).map(o => ({ ...o, blocks: JSON.parse(o.blocks) })));
  });
  app.post("/api/offers/preview", auth("student"), (req, res) => res.json(preview(db, input(req))));
  app.get("/api/offers/:id", auth("student", "tutor"), (req, res) => {
    const offer = owned(req);
    res.json({ ...offer, ...preview(db, offer) });
  });
  app.post("/api/offers", auth("student"), (req, res) => {
    const result = transaction(db, () => {
      const d = input(req), check = preview(db, d);
      if (check.conflict_count) fail(409, "Lịch có buổi không khả dụng. Xem lịch dự kiến và điều chỉnh ngày hoặc giờ học.");
      if (one(db, "SELECT id FROM offers WHERE student_id=? AND tutor_id=? AND status='pending'", req.user.id, d.tutor_id)) fail(409, "Bạn đã có đề nghị đang chờ gia sư này. Hãy mở Đề nghị học để trao đổi hoặc hủy.");
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", d.student_id, d.tutor_id);
      const { id: inquiry_id } = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", d.student_id, d.tutor_id);
      const id = Number(run(db, "INSERT INTO offers(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,note,rate,start_date,end_date,kind,weeks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", d.student_id, d.tutor_id, inquiry_id, d.subject_id, d.mode, JSON.stringify(d.blocks), d.note, d.rate, d.start_date, d.end_date, d.kind, d.weeks ?? null).lastInsertRowid);
      return { id, inquiry_id };
    });
    res.status(201).json(result);
  });
  app.patch("/api/offers/:id", auth("student", "tutor"), (req, res) => {
    const { status } = z.object({ status: z.enum(["accepted", "declined", "cancelled"]) }).parse(req.body);
    transaction(db, () => {
      const o = owned(req);
      if (status !== "cancelled" && req.user.id !== o.tutor_id) fail(403, "Chỉ gia sư có thể chấp nhận hoặc từ chối đề nghị.");
      if (!(status === "cancelled" ? ["pending", "accepted"] : ["pending"]).includes(o.status)) fail(409, "Đề nghị đã được xử lý. Vui lòng tải lại.");
      if (status === "accepted") {
        const tutor = publicView(one(db, `SELECT t.* FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND ${liveTutorSql("t")} AND u.status='active' AND u.role='tutor'`, o.tutor_id));
        if (!tutor || !one(db, "SELECT id FROM users WHERE id=? AND status='active' AND role='student'", o.student_id)) fail(409, "Tài khoản hiện không thể xác nhận lịch học.");
        if (!JSON.parse(tutor.subjects).includes(o.subject_id) || (tutor.mode !== "both" && tutor.mode !== o.mode)) fail(409, "Môn học hoặc hình thức dạy đã thay đổi.");
        if (o.kind === "trial") {
          if (!tutor.accepts_trial) fail(409, "Gia sư hiện không nhận học thử.");
          trialEligible(o.student_id, o.tutor_id);
          if (o.rate !== 0 || offerDates(o).length !== 1) fail(409, "Học thử phải là một buổi miễn phí.");
        }
        const check = preview(db, o);
        if (check.conflict_count) fail(409, "Lịch đã thay đổi hoặc bị trùng. Vui lòng xem lại đề nghị trước khi chấp nhận.");
        for (const session of check.sessions) {
          run(db, "INSERT OR IGNORE INTO slots(tutor_id,starts_at,duration_minutes,source,available) VALUES (?,?,60,'offer',0)", o.tutor_id, session.starts_at);
          const slot = one(db, "SELECT id FROM slots WHERE tutor_id=? AND starts_at=?", o.tutor_id, session.starts_at);
          run(db, "INSERT INTO bookings(student_id,tutor_id,slot_id,subject_id,starts_at,rate,mode,note,duration_minutes,status,offer_id) VALUES (?,?,?,?,?,?,?,?,60,'accepted',?)", o.student_id, o.tutor_id, slot.id, o.subject_id, session.starts_at, o.rate, o.mode, o.note, o.id);
        }
      }
      if (status === "cancelled") run(db, "UPDATE bookings SET status='cancelled' WHERE offer_id=? AND status IN ('pending','accepted') AND starts_at>?", o.id, new Date().toISOString());
      run(db, "UPDATE offers SET status=?,accepted_at=CASE WHEN ?='accepted' THEN CURRENT_TIMESTAMP ELSE accepted_at END WHERE id=?", status, status, o.id);
    });
    res.json({ ok: true });
  });
}
