import { all, one, run, transaction } from "./db.js";
import { weeklySchedule } from "./availability.js";
import { availabilitySchema, z } from "./validation.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const key = b => `${b.weekday}:${b.hour}`;
const labels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
export function registerWeeklyRequests(app, db, auth) {
  app.get("/api/weekly-requests", auth("student", "tutor"), (req, res) => {
    res.json(all(db, `SELECT r.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name
      FROM weekly_requests r JOIN users s ON s.id=r.student_id JOIN users t ON t.id=r.tutor_id JOIN subjects sub ON sub.id=r.subject_id
      WHERE r.student_id=? OR r.tutor_id=? ORDER BY r.id DESC`, req.user.id, req.user.id).map(r => ({ ...r, blocks: JSON.parse(r.blocks) })));
  });
  app.post("/api/weekly-requests", auth("student"), (req, res) => {
    const d = z.object({ tutor_id: z.number().int().positive(), subject_id: z.string(), mode: z.enum(["online", "offline"]), note: z.string().trim().max(2000).default("") }).parse(req.body);
    const { blocks } = availabilitySchema.parse({ revision: 0, blocks: req.body.blocks });
    if (!blocks.length) fail(400, "Chọn ít nhất một giờ học.");
    const result = transaction(db, () => {
      const tutor = one(db, "SELECT t.* FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND t.status='approved' AND u.status='active' AND u.role='tutor'", d.tutor_id);
      if (!tutor) fail(404, "Gia sư chưa có hồ sơ công khai.");
      if (!JSON.parse(tutor.subjects).includes(d.subject_id) || (tutor.mode !== "both" && tutor.mode !== d.mode)) fail(400, "Môn học hoặc hình thức không phù hợp.");
      const available = new Set(weeklySchedule(db, d.tutor_id).blocks.map(key));
      if (blocks.some(b => !available.has(key(b)))) fail(409, "Lịch gia sư đã thay đổi. Vui lòng tải lại và chọn giờ trống.");
      const occupied = all(db, "SELECT blocks FROM weekly_requests WHERE status='accepted' AND (tutor_id=? OR student_id=?)", d.tutor_id, req.user.id);
      if (occupied.some(row => JSON.parse(row.blocks).some(b => blocks.some(wanted => key(wanted) === key(b))))) fail(409, "Giờ này trùng một lịch tuần đã xác nhận.");
      if (one(db, "SELECT id FROM weekly_requests WHERE student_id=? AND tutor_id=? AND status IN ('pending','accepted')", req.user.id, d.tutor_id)) fail(409, "Bạn đã có yêu cầu tuần với gia sư này. Mở Lịch học để trao đổi hoặc hủy yêu cầu cũ.");
      run(db, "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)", req.user.id, d.tutor_id);
      const { id: inquiry } = one(db, "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?", req.user.id, d.tutor_id);
      const id = Number(run(db, "INSERT INTO weekly_requests(student_id,tutor_id,inquiry_id,subject_id,mode,blocks,note,rate) VALUES (?,?,?,?,?,?,?,?)", req.user.id, d.tutor_id, inquiry, d.subject_id, d.mode, JSON.stringify(blocks), d.note, tutor.rate).lastInsertRowid);
      const hours = blocks.map(b => `${labels[b.weekday]} ${String(b.hour).padStart(2, "0")}:00–${String(b.hour + 1).padStart(2, "0")}:00`).join(", ");
      run(db, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id) VALUES (?,?,?,'weekly-request',?)", inquiry, req.user.id, `Yêu cầu học hằng tuần #${id}: ${hours} (giờ Việt Nam).${d.note ? `\n${d.note}` : ""}`, id);
      return { id, inquiry_id: inquiry };
    });
    res.status(201).json(result);
  });
  app.patch("/api/weekly-requests/:id", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { status } = z.object({ status: z.enum(["accepted", "declined", "cancelled"]) }).parse(req.body);
    transaction(db, () => {
      const r = one(db, "SELECT * FROM weekly_requests WHERE id=?", id);
      if (!r || ![r.student_id, r.tutor_id].includes(req.user.id)) fail(404, "Không tìm thấy yêu cầu.");
      if (status !== "cancelled" && req.user.id !== r.tutor_id) fail(403, "Chỉ gia sư có thể xác nhận yêu cầu.");
      if (!(status === "cancelled" ? ["pending", "accepted"] : ["pending"]).includes(r.status)) fail(409, "Yêu cầu đã được xử lý. Vui lòng tải lại.");
      if (status === "accepted") {
        const tutor = one(db, "SELECT t.status,t.subjects,t.mode FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND u.status='active' AND u.role='tutor'", r.tutor_id);
        if (tutor?.status !== "approved" || !one(db, "SELECT id FROM users WHERE id=? AND status='active' AND role='student'", r.student_id)) fail(409, "Tài khoản hiện không thể xác nhận lịch học.");
        if (!JSON.parse(tutor.subjects).includes(r.subject_id) || (tutor.mode !== "both" && tutor.mode !== r.mode)) fail(409, "Môn học hoặc hình thức dạy đã thay đổi.");
        const blocks = JSON.parse(r.blocks), available = new Set(weeklySchedule(db, r.tutor_id).blocks.map(key));
        if (blocks.some(b => !available.has(key(b)))) fail(409, "Lịch dạy đã thay đổi. Hãy trao đổi với học sinh trước khi xác nhận.");
        const wanted = new Set(blocks.map(key));
        const existing = all(db, "SELECT blocks FROM weekly_requests WHERE status='accepted' AND (tutor_id=? OR student_id=?)", r.tutor_id, r.student_id);
        if (existing.some(item => JSON.parse(item.blocks).some(b => wanted.has(key(b))))) fail(409, "Giờ này trùng một lịch tuần đã xác nhận.");
      }
      run(db, "UPDATE weekly_requests SET status=? WHERE id=?", status, id);
      const label = { accepted: "Đã xác nhận", declined: "Đã từ chối", cancelled: "Đã hủy" }[status];
      run(db, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id) VALUES (?,?,?,'weekly-request',?)", r.inquiry_id, req.user.id, `${label} yêu cầu học hằng tuần #${id}.`, id);
    });
    res.json({ ok: true });
  });
}
