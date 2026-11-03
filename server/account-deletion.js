import { one, run, transaction } from "./db.js";
import { z } from "./validation.js";

export function registerAccountDeletion(app, db, auth, audit) {
  app.delete("/api/admin/users/:id", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { email } = z.object({ email: z.string().trim().toLowerCase() }).strict().parse(req.body);
    transaction(db, () => {
      const user = one(db, "SELECT * FROM users WHERE id=?", id);
      if (!user || user.status === "deleted") throw Object.assign(new Error("Không tìm thấy tài khoản."), { status: 404 });
      if (user.role === "admin") throw Object.assign(new Error("Không thể xóa tài khoản quản trị viên."), { status: 403 });
      if (email !== user.email.toLowerCase()) throw Object.assign(new Error("Email xác nhận không khớp."), { status: 400 });
      for (const table of ["sessions", "oauth_identities", "google_calendar_states", "google_calendars", "email_verifications", "learner_availability", "community_notifications", "community_mail"]) run(db, `DELETE FROM ${table} WHERE user_id=?`, id);
      run(db, "DELETE FROM user_image_chunks WHERE image_id IN (SELECT id FROM user_images WHERE user_id=?)", id);
      run(db, "DELETE FROM user_images WHERE user_id=?", id);
      run(db, "DELETE FROM community_profile_changes WHERE user_id=?", id);
      run(db, "DELETE FROM chat_attachments WHERE owner_id=?", id);
      run(db, "DELETE FROM oauth_states WHERE link_user_id=?", id);
      run(db, "DELETE FROM pending_signups WHERE email=?", user.email);
      for (const table of ["tutor_uploads", "tutor_banners", "tutor_gallery", "tutor_theme_inventory", "weekly_availability"]) run(db, `DELETE FROM ${table} WHERE tutor_id=?`, id);
      for (const table of ["community_drafts", "community_images"]) run(db, `DELETE FROM ${table} WHERE author_id=?`, id);
      run(db, "DELETE FROM favorites WHERE student_id=? OR tutor_id=?", id, id);
      run(db, "UPDATE slots SET available=0 WHERE tutor_id=?", id);
      for (const table of ["bookings", "weekly_requests", "offers"]) run(db, `UPDATE ${table} SET status='cancelled' WHERE (student_id=? OR tutor_id=?) AND status IN ('pending','accepted')`, id, id);
      run(db, `UPDATE tutors SET headline='',bio='',province_code='',ward_code='',location='',education='',education_history='[]',profile_sections='[]',subjects='[]',levels='[]',goals='[]',teaching_style='',lesson_plan='',moderation_note='',profile_theme='paper',status='rejected' WHERE user_id=?`, id);
      run(db, `UPDATE users SET name='Tài khoản đã xóa',email=?,password='',status='deleted',school='',province_code='',ward_code='',goal='',display_name='',bio='',timezone='Asia/Ho_Chi_Minh',community_lock_reason='',email_verified_at=NULL WHERE id=?`, `deleted-${id}@account.invalid`, id);
      audit(req.user.id, "user.deleted", id);
    });
    res.json({ ok: true });
  });
}
