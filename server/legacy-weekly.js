import { all } from "./db.js";

// Retired weekly-request template ("Lịch tuần mẫu cũ"). Requests accepted before
// the retirement still hold their weekday/hour blocks until someone cancels them.
// Every reader of those held blocks goes through here, so deleting the template
// later means deleting this one file.

// Blocks held by accepted legacy requests of the given tutor and/or student.
export function legacyWeeklyBlocks(db, { tutorId, studentId } = {}) {
  const owners = [];
  if (tutorId) owners.push(["tutor_id", tutorId]);
  if (studentId) owners.push(["student_id", studentId]);
  if (!owners.length) return [];
  const where = owners.map(([column]) => `${column}=?`).join(" OR ");
  return all(db, `SELECT blocks FROM weekly_requests WHERE status='accepted' AND (${where})`, ...owners.map(([, id]) => id))
    .flatMap(row => JSON.parse(row.blocks).map(({ weekday, hour }) => ({ weekday, hour })));
}

// Accepted legacy blocks grouped by tutor, for list endpoints (one query instead of one per tutor).
export function legacyWeeklyBlocksByTutor(db) {
  const byTutor = new Map();
  for (const row of all(db, "SELECT tutor_id,blocks FROM weekly_requests WHERE status='accepted'")) {
    const list = byTutor.get(row.tutor_id) || [];
    list.push(...JSON.parse(row.blocks));
    byTutor.set(row.tutor_id, list);
  }
  return byTutor;
}

// Counts that tell an admin whether the old data is gone and the template code can be removed.
export function legacyCounts(db) {
  const count = (sql) => all(db, sql)[0].n;
  const now = new Date().toISOString();
  return {
    weekly_pending: count("SELECT COUNT(*) AS n FROM weekly_requests WHERE status='pending'"),
    weekly_accepted: count("SELECT COUNT(*) AS n FROM weekly_requests WHERE status='accepted'"),
    one_off_open: all(db, "SELECT COUNT(*) AS n FROM bookings WHERE offer_id IS NULL AND status IN ('pending','accepted') AND starts_at>?", now)[0].n,
    manual_slots: all(db, "SELECT COUNT(*) AS n FROM slots s WHERE source='manual' AND available=1 AND starts_at>? AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('pending','accepted','completed'))", now)[0].n,
  };
}
