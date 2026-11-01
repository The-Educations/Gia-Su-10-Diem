import { all, one, run, transaction } from "./db.js";
import { z, text } from "./validation.js";
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
      .object({ tutor_id: z.number().int().positive(), body: text(3000) })
      .parse(req.body);
    if (
      !one(
        db,
        "SELECT user_id FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=? AND t.status='approved' AND u.status='active' AND u.role='tutor'",
        d.tutor_id,
      )
    )
      return res.status(404).json({ error: "Gia sư chưa có hồ sơ công khai." });
    const result = transaction(db, () => {
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
        d.body,
      );
      return { id };
    });
    res.status(201).json(result);
  });
  app.get(
    "/api/inquiries/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      if (!participant(req, res)) return;
      res.json(
        all(
          db,
          "SELECT m.*,u.name FROM inquiry_messages m JOIN users u ON u.id=m.sender_id WHERE inquiry_id=? ORDER BY m.id",
          req.params.id,
        ),
      );
    },
  );
  app.post(
    "/api/inquiries/:id/messages",
    auth("student", "tutor"),
    (req, res) => {
      const thread = participant(req, res);
      if (!thread) return;
      const { body } = z.object({ body: text(3000) }).parse(req.body);
      const recipient =
        req.user.id === thread.student_id ? thread.tutor_id : thread.student_id;
      if (
        !one(
          db,
          "SELECT id FROM users WHERE id=? AND status='active'",
          recipient,
        )
      )
        return res
          .status(409)
          .json({ error: "Tài khoản nhận hiện không hoạt động." });
      run(
        db,
        "INSERT INTO inquiry_messages(inquiry_id,sender_id,body) VALUES (?,?,?)",
        thread.id,
        req.user.id,
        body,
      );
      res.status(201).json({ ok: true });
    },
  );
}
