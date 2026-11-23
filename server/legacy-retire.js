// Retires the legacy flows: one-off bookings (/bookings), dated study offers
// (/offers) and weekly-requests. Data stays readable for history; new writes
// answer 410 Gone.
import { all, one, run } from "./db.js";
import { notify } from "./notifications.js";

// 410 for every write of the retired flow. Message stays short and points to
// the replacement page.
export const gone = (res) =>
  res.status(410).json({ message: "Luồng đặt lịch cũ đã ngừng hoạt động. Dùng đề nghị học mới tại /proposals.", retired: true });

// One-time, idempotent data conversion. Bookings/offers hold no money, so only
// statuses and notifications change — no ledger moves needed.
export function retireLegacyFlow(db) {
  const now = new Date().toISOString();
  // Pending dated offers expire — the new proposals flow replaces them.
  const expiredOffers = all(db, "SELECT id,student_id,tutor_id FROM offers WHERE status='pending'");
  for (const o of expiredOffers) {
    run(db, "UPDATE offers SET status='expired',ended_at=CURRENT_TIMESTAMP WHERE id=?", o.id);
    for (const uid of [o.student_id, o.tutor_id]) notify(db, uid, "offer_cancelled", { subject: `#${o.id}`, link: "/proposals" });
  }
  // Future pending/accepted one-off bookings are cancelled, both sides told.
  const cancelled = all(db, "SELECT id,student_id,tutor_id FROM bookings WHERE status IN ('pending','accepted') AND starts_at>?", now);
  for (const b of cancelled) {
    run(db, "UPDATE bookings SET status='cancelled',note='retire-legacy' WHERE id=?", b.id);
    for (const uid of [b.student_id, b.tutor_id]) notify(db, uid, "lesson_cancelled", { actor: "Hệ thống", subject: `#${b.id}`, link: "/classes" });
  }
  // Open weekly-requests close as declined — classes/proposals cover them now.
  for (const r of all(db, "SELECT id,student_id,tutor_id FROM weekly_requests WHERE status='pending'")) {
    run(db, "UPDATE weekly_requests SET status='declined' WHERE id=?", r.id);
    notify(db, r.student_id, "offer_declined", { actor: "Hệ thống", subject: `#${r.id}`, link: "/proposals" });
  }
}
