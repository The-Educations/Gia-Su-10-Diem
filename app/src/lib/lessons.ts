import type { Booking } from "./types";

// Mirrors server/trust-policy.js: a student can report "tutor did not come" from
// 15 minutes after the start until 48 hours after the end, if the tutor never pressed Start.
const WAIT_MINUTES = 15;
const WINDOW_HOURS = 48;

export function canReportTutorAbsent(b: Booking, now = Date.now()) {
  const start = Date.parse(b.starts_at), end = start + b.duration_minutes * 60000;
  return b.status === "accepted" && !b.started_at && start + WAIT_MINUTES * 60000 <= now && now < end + WINDOW_HOURS * 3600000;
}
