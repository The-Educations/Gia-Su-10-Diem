// A student gives a tutor one public review, however many lessons they take.
// The review can be edited later. Reviews are stored per lesson, so a pair that
// somehow has several (older data) counts only its latest one.
const samePair = (x, y) => `${x}.student_id=${y}.student_id AND ${x}.tutor_id=${y}.tutor_id`;

// Condition for review `r` of lesson `b`: no later review exists for the same pair.
export const currentReview = (b = "b", r = "r") =>
  `NOT EXISTS (SELECT 1 FROM reviews r2 JOIN bookings b2 ON b2.id=r2.booking_id WHERE ${samePair("b2", b)} AND (r2.created_at>${r}.created_at OR (r2.created_at=${r}.created_at AND r2.booking_id>${r}.booking_id)))`;

// A column of the pair's latest review, for lesson `b`.
export const pairReview = (column, b = "b") =>
  `(SELECT r2.${column} FROM reviews r2 JOIN bookings b2 ON b2.id=r2.booking_id WHERE ${samePair("b2", b)} ORDER BY r2.created_at DESC, r2.booking_id DESC LIMIT 1)`;

// Number of completed lessons the pair has had, shown next to a review.
export const completedLessons = (b = "b") =>
  `(SELECT COUNT(*) FROM bookings x WHERE ${samePair("x", b)} AND x.status='completed')`;
