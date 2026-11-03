import { all, one } from "./db.js";
import { z } from "./validation.js";

export const messageContextSchema = z.object({
  kind: z.enum(["offer", "lesson", "weekly-request"]),
  id: z.number().int().positive(),
}).strict();

const sources = {
  offer: { table: "offers", fields: "r.start_date,r.end_date,r.blocks" },
  lesson: { table: "bookings", fields: "r.starts_at,r.duration_minutes" },
  "weekly-request": { table: "weekly_requests", fields: "r.blocks" },
};
function query(kind) {
  const source = sources[kind];
  return `SELECT r.id,r.status,s.name AS subject_name,${source.fields}
    FROM ${source.table} r JOIN subjects s ON s.id=r.subject_id`;
}
function serialize(kind, row) {
  return row ? { ...row, kind, ...(row.blocks ? { blocks: JSON.parse(row.blocks) } : {}) } : null;
}

export function inquiryMessageContext(db, thread, reference) {
  const { kind, id } = messageContextSchema.parse(reference);
  return serialize(kind, one(db, `${query(kind)} WHERE r.id=? AND r.student_id=? AND r.tutor_id=?`, id, thread.student_id, thread.tutor_id));
}

export function withInquiryContexts(db, thread, messages) {
  const contexts = new Map();
  // One query per context kind, regardless of how many messages reference it.
  for (const kind of Object.keys(sources)) {
    if (!messages.some(m => m.context_kind === kind)) continue;
    const rows = all(db, `${query(kind)} WHERE r.student_id=? AND r.tutor_id=? AND r.id IN
      (SELECT context_id FROM inquiry_messages WHERE inquiry_id=? AND context_kind=?)`, thread.student_id, thread.tutor_id, thread.id, kind);
    for (const row of rows) contexts.set(`${kind}:${row.id}`, serialize(kind, row));
  }
  return messages.map(m => ({ ...m, context: contexts.get(`${m.context_kind}:${m.context_id}`) || null }));
}

export function lessonMessageContext(db, id) {
  return serialize("lesson", one(db, `${query("lesson")} WHERE r.id=?`, id));
}
