import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function registerWeeklyRequests(app, db, auth) {
  app.get("/api/weekly-requests", auth("student", "tutor"), (req, res) => {
    res.json(all(db, `SELECT r.*,s.name AS student_name,t.name AS tutor_name,sub.name AS subject_name
      FROM weekly_requests r JOIN users s ON s.id=r.student_id JOIN users t ON t.id=r.tutor_id JOIN subjects sub ON sub.id=r.subject_id
      WHERE r.student_id=? OR r.tutor_id=? ORDER BY r.id DESC`, req.user.id, req.user.id).map(r => ({ ...r, blocks: JSON.parse(r.blocks) })));
  });
  // Retired: lessons are created only through Offers. Kept as 410 so stale tabs and scripts get a clear message.
  app.post("/api/weekly-requests", auth("student"), () => fail(410, "Lịch học hằng tuần đã ngừng. Hãy gửi Đề nghị học từ hồ sơ gia sư."));
  app.patch("/api/weekly-requests/:id", auth("student", "tutor"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { status } = z.object({ status: z.enum(["accepted", "declined", "cancelled"]) }).parse(req.body);
    transaction(db, () => {
      const r = one(db, "SELECT * FROM weekly_requests WHERE id=?", id);
      if (!r || ![r.student_id, r.tutor_id].includes(req.user.id)) fail(404, "Không tìm thấy yêu cầu.");
      if (status !== "cancelled" && req.user.id !== r.tutor_id) fail(403, "Chỉ gia sư có thể xác nhận yêu cầu.");
      // Old weekly templates can only be wound down now; new schedules go through Offers.
      if (status === "accepted") fail(409, "Lịch tuần mẫu cũ không còn nhận mới. Hãy trao đổi và gửi Đề nghị học.");
      if (!(status === "cancelled" ? ["pending", "accepted"] : ["pending"]).includes(r.status)) fail(409, "Yêu cầu đã được xử lý. Vui lòng tải lại.");
      run(db, "UPDATE weekly_requests SET status=? WHERE id=?", status, id);
      const label = { declined: "Đã từ chối", cancelled: "Đã hủy" }[status];
      run(db, "INSERT INTO inquiry_messages(inquiry_id,sender_id,body,context_kind,context_id) VALUES (?,?,?,'weekly-request',?)", r.inquiry_id, req.user.id, `${label} yêu cầu học hằng tuần #${id}.`, id);
    });
    res.json({ ok: true });
  });
}
