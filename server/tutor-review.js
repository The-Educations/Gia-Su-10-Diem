import { one, run } from "./db.js";
import { z, tutorSchema } from "./validation.js";

export function registerTutorReview(app, db, auth, audit, { sendEmail, origin }) {
  const sending = new Set();
  app.patch("/api/admin/tutors/:id", auth("admin"), async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = z.object({ status: z.enum(["approved", "rejected", "pending", "withdrawn"]), revision: z.number().int().nonnegative().optional() }).parse(req.body);
    const t = one(db, "SELECT t.*,u.email FROM tutors t JOIN users u ON u.id=t.user_id WHERE t.user_id=?", id);
    if (!t) return res.status(404).json({ error: "Không tìm thấy gia sư." });
    if ((d.revision !== undefined && d.revision !== t.review_revision) || sending.has(id))
      return res.status(409).json({ error: "Hồ sơ đang thay đổi. Đóng và mở lại để xem phiên bản mới." });
    if (d.status === "approved") tutorSchema.parse({ ...t, subjects: JSON.parse(t.subjects), levels: JSON.parse(t.levels), goals: JSON.parse(t.goals), education_history: JSON.parse(t.education_history), profile_sections: JSON.parse(t.profile_sections) });
    if (d.status === "rejected") {
      if (t.status === "rejected") return res.status(409).json({ error: "Đã yêu cầu bổ sung. Chờ gia sư gửi lại hồ sơ." });
      sending.add(id);
      try {
        if (!sendEmail) throw new Error("Mail unavailable");
        await sendEmail({ to: t.email, kind: "profile_update", link: `${origin}/app/studio?tab=profile` });
      } catch {
        return res.status(503).json({ error: "Chưa gửi được email. Hồ sơ chưa thay đổi; vui lòng thử lại." });
      } finally { sending.delete(id); }
      audit(req.user.id, "tutor.update_email_sent", id);
    }
    const current = one(db, "SELECT review_revision FROM tutors WHERE user_id=?", id);
    if (current.review_revision !== t.review_revision)
      return res.status(409).json({ error: "Email đã gửi nhưng hồ sơ vừa được cập nhật. Đóng và mở lại để duyệt bản mới." });
    run(db, "UPDATE tutors SET status=?,moderation_note='',review_revision=review_revision+1 WHERE user_id=?", d.status, id);
    audit(req.user.id, `tutor.${d.status}`, id);
    res.json({ ok: true });
  });
}
