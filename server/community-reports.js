import { run } from "./db.js";

// Closes every open report on one piece of content once an admin has dealt with it.
// `part` narrows a profile report to one part (avatar, cover, bio); leave it out to close all parts.
export function resolveReports(db, targetType, targetId, actorId, resolution, part) {
  return run(
    db,
    `UPDATE community_reports SET status='resolved',resolved_by=?,resolution=?
     WHERE status='open' AND target_type=? AND target_id=? ${part === undefined ? "" : "AND part=?"}`,
    actorId,
    resolution,
    targetType,
    targetId,
    ...(part === undefined ? [] : [part]),
  ).changes;
}
