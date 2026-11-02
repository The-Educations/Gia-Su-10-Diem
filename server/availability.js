import { all, one, run, transaction } from "./db.js";

export function overlaps(a, b) {
  const startA = Date.parse(a.starts_at), startB = Date.parse(b.starts_at);
  return startA < startB + b.duration_minutes * 60000 && startB < startA + a.duration_minutes * 60000;
}

export function weeklySchedule(db, tutorId) {
  const row = one(db, "SELECT blocks,revision FROM weekly_availability WHERE tutor_id=?", tutorId);
  return { blocks: row ? JSON.parse(row.blocks) : [], revision: row?.revision ?? 0 };
}

// Recurrences use Vietnam time (UTC+7, no DST), matching the booking UI.
// Called inside the same transaction as a schedule edit, or on availability reads.
export function reconcileAvailability(db, tutorId, now = Date.now()) {
  const { blocks } = weeklySchedule(db, tutorId);
  const cutoff = new Date(now).toISOString();
  run(db, `DELETE FROM slots WHERE tutor_id=? AND source='weekly' AND starts_at<=?
    AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=slots.id)`, tutorId, cutoff);
  run(db, "UPDATE slots SET available=0 WHERE tutor_id=? AND source='weekly' AND starts_at>?", tutorId, cutoff);
  if (!blocks.length) return;
  // Convert future unreserved generated slots, keeping every booking snapshot intact.
  run(db, `UPDATE slots SET duration_minutes=60 WHERE tutor_id=? AND source='weekly' AND starts_at>?
    AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=slots.id AND b.status IN ('pending','accepted','completed'))`, tutorId, cutoff);
  const horizon = now + 56 * 86400000;
  const slots = all(db, `SELECT s.*, EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id
    AND b.status IN ('pending','accepted','completed')) AS reserved FROM slots s
    WHERE tutor_id=? AND starts_at>? AND starts_at<?`, tutorId,
    new Date(now - 86400000).toISOString(), new Date(horizon).toISOString());
  const local = new Date(now + 7 * 3600000);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 7 * 3600000;
  for (let day = 0; day <= 56; day++) {
    const weekday = (new Date(midnight + day * 86400000 + 7 * 3600000).getUTCDay() + 6) % 7;
    for (const block of blocks.filter(b => b.weekday === weekday)) {
      const start = midnight + day * 86400000 + block.hour * 3600000;
      if (start <= now + 3600000 || start >= horizon) continue;
      const candidate = { starts_at: new Date(start).toISOString(), duration_minutes: 60 };
      const existing = slots.find(s => s.starts_at === candidate.starts_at);
      if (slots.some(s => s.id !== existing?.id && (s.available || s.reserved) && overlaps(s, candidate))) continue;
      if (existing) {
        if (existing.source === "weekly") {
          run(db, "UPDATE slots SET available=1 WHERE id=?", existing.id);
          existing.available = 1;
        }
      } else {
        const result = run(db, "INSERT INTO slots(tutor_id,starts_at,duration_minutes,source) VALUES (?,?,60,'weekly')", tutorId, candidate.starts_at);
        slots.push({ ...candidate, id: Number(result.lastInsertRowid), available: 1, source: "weekly" });
      }
    }
  }
}

export function refreshAvailability(db, tutorId) {
  transaction(db, () => reconcileAvailability(db, tutorId));
}
