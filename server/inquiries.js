import { withChatMedia, insertChatMessage } from "./chat-media.js";
import { all, one, run, transaction } from "./db.js";
import { z, text, availabilitySchema } from "./validation.js";
import { weeklySchedule } from "./availability.js";
import { inquiryMessageContext, messageContextSchema, withInquiryContexts } from "./message-context.js";
export function registerInquiries(app, db, auth) {
  const participant = (req, res) => {
    const thread = one(db, "SELECT * FROM inquiries WHERE id=?", req.params.id);
    if (
      !thread ||
      ![thread.student_id, thread.tutor_id].includes(req.user.id)
    ) {
      res.status(404).json({ error: "Không tìm thấy cuộc trò chuyện." });
      return null;
    }
    return thread;
  };
  app.get("/api/inquiries", auth("student", "tutor"), (req, res) =>
    res.json(
      all(
        db,
        `SELECT i.*,s.name AS student_name,t.name AS tutor_name,
    (SELECT body FROM inquiry_messages WHERE inquiry_id=i.id ORDER BY id DESC LIMIT 1) AS last_message
    FROM inquiries i JOIN users s ON s.id=i.student_id JOIN users t ON t.id=i.tutor_id
    WHERE i.student_id=? OR i.tutor_id=? ORDER BY i.id DESC`,
        req.user.id,
        req.user.id,
      ),
    ),
  );
  app.post("/api/inquiries", auth("student"), (req, res) => {
    const d = z
      .object({ tutor_id: z.number().int().positive(), body: text(3000), subject_id: z.string().optional(), mode: z.enum(["online", "offline"]).optional() })
      .parse(req.body);
    const { blocks } = availabilitySchema.parse({ revision: 0, blocks: req.body.blocks || [] });
    if (
      !one(
        db,
        "SELECT user_id FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND t.status='approved' AND u.status='active' AND u.role='tutor'",
        d.tutor_id,
      )
    )
      return res.status(404).json({ error: "Gia sư chưa có hồ sơ công khai." });
    const result = transaction(db, () => {
      const tutor = one(db, "SELECT subjects,mode FROM tutors WHERE user_id=?", d.tutor_id);
      const subject = d.subject_id && one(db, "SELECT name FROM subjects WHERE id=?", d.subject_id);
      if ((d.subject_id && (!subject || !JSON.parse(tutor.subjects).includes(d.subject_id))) || (d.mode && tutor.mode !== "both" && tutor.mode !== d.mode))
        throw Object.assign(new Error("Môn học hoặc hình thức không phù hợp."), { status: 400 });
      const key = b => b.hour * 7 + b.weekday;
      const available = new Set(weeklySchedule(db, d.tutor_id).blocks.map(key));
      const reserved = new Set(all(db, "SELECT blocks FROM weekly_requests WHERE tutor_id=? AND status='accepted'", d.tutor_id).flatMap(r => JSON.parse(r.blocks).map(key)));
      if (blocks.some(b => !available.has(key(b)) || reserved.has(key(b))))
        throw Object.assign(new Error("Lịch gia sư đã thay đổi. Vui lòng tải lại để chọn giờ rảnh."), { status: 409 });
      const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
      const hours = blocks.map(b => `${days[b.weekday]} ${String(b.hour).padStart(2, "0")}:00–${String(b.hour + 1).padStart(2, "0")}:00`).join(", ");
      const body = [d.body, subject && `Môn học: ${subject.name}`, d.mode && `Hình thức: ${d.mode === "online" ? "Trực tuyến" : "Trực tiếp"}`, hours && `Giờ muốn trao đổi (hằng tuần, giờ Việt Nam): ${hours}`].filter(Boolean).join("\n");
      run(
        db,
        "INSERT OR IGNORE INTO inquiries(student_id,tutor_id) VALUES (?,?)",
        req.user.id,
        d.tutor_id,
      );
      const { id } = one(
        db,
        "SELECT id FROM inquiries WHERE student_id=? AND tutor_id=?",
        req.user.id,
        d.tutor_id,
      );
      run(
        db,
        "INSERT INTO inquiry_messages(inquiry_id,sender_id,body) VALUES (?,?,?)",
        id,
        req.user.id,
        body,
      );
      return { id };
    });
    res.status(201).json(result);
  });
  app.get("/api/inquiries/:id/context/:kind/:contextId", auth("student", "tutor"), (req, res) => {
    const thread = participant(req, res);
    if (!thread) return;
    const context = inquiryMessageContext(db, thread, { kind: req.params.kind, id: Number(req.params.contextId) });
    if (!context) return res.status(404).json({ error: "Không tìm thấy nội dung trong cuộc trò chuyện này." });
    res.json(context);
  });
  app.get(
    "/api/inquiries/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      const thread = participant(req, res);
      if (!thread) return;
      res.json(
        withChatMedia(db, "inquiry", thread.id, withInquiryContexts(db, thread, all(
          db,
          "SELECT m.*,u.name FROM inquiry_messages m JOIN users u ON u.id=m.sender_id WHERE inquiry_id=? ORDER BY m.id",
          req.params.id,
        ))),
      );
    },
  );
  app.post(
    "/api/inquiries/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      const thread = participant(req, res);
      if (!thread) return;
      const context = messageContextSchema.nullish().parse(req.body?.context);
      if (context && !inquiryMessageContext(db, thread, context))
        return res.status(404).json({ error: "Không tìm thấy nội dung trong cuộc trò chuyện này." });
      insertChatMessage(db, "inquiry", thread.id, req.user, req.body, context);
      res.status(201).json({ ok: true });
    },
  );
}
