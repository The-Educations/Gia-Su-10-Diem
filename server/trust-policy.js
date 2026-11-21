// Trust score of a tutor: one place for every number and every pure function.
// Design: docs/danh-gia-va-diem-tin-cay.md. The values are starting points to
// review once there is real data; change them here and nowhere else.
export const PRIOR_MEAN = 4.3;          // C: score assumed for a tutor with no data
export const PRIOR_WEIGHT = 5;          // m: imaginary pairs sitting at PRIOR_MEAN
export const COURSE_WEIGHT = 3;         // end-of-course rating counts 3x the lesson average
export const QUALITY_SHARE = 0.7;
export const RELIABILITY_SHARE = 0.3;
export const LATE_CANCEL_HOURS = 24;
export const NEW_MIN_RATINGS = 3;
export const NEW_MIN_RATERS = 2;
export const PUNCTUALITY_MIN_LESSONS = 5;
export const PUBLIC_TAG_MIN = 3;
export const PUBLIC_TAG_LIMIT = 4;
export const MAX_TAGS_PER_LESSON = 3;
export const LESSON_RATING_DAYS = 14;
export const LESSON_RATING_EDIT_HOURS = 24;
export const COURSE_REVIEW_DAYS = 30;
export const TUTOR_NO_SHOW_WAIT_MINUTES = 15;
export const TUTOR_NO_SHOW_WINDOW_HOURS = 48;

export const LESSON_TAGS = [
  { code: "de_hieu", label: "Dễ hiểu" },
  { code: "kien_nhan", label: "Kiên nhẫn" },
  { code: "nhiet_tinh", label: "Nhiệt tình" },
  { code: "dung_gio", label: "Đúng giờ" },
  { code: "chuan_bi", label: "Chuẩn bị bài kỹ" },
  { code: "hieu_y", label: "Hiểu ý học sinh" },
];
export const lessonTagCodes = LESSON_TAGS.map(t => t.code);
const tagLabel = Object.fromEntries(LESSON_TAGS.map(t => [t.code, t.label]));

const round1 = n => Math.round(n * 10) / 10;
const has = n => typeof n === "number" && Number.isFinite(n);

// Score of one student-tutor pair, so a student gets one vote however much they study.
export function pairScore({ course, lessonAvg }) {
  if (has(course) && has(lessonAvg)) return (COURSE_WEIGHT * course + lessonAvg) / (COURSE_WEIGHT + 1);
  if (has(course)) return course;
  if (has(lessonAvg)) return lessonAvg;
  return null;
}

// Q: pair scores pulled towards PRIOR_MEAN while there are few of them (1-5 scale).
export function quality(pairScores) {
  const scores = pairScores.filter(has);
  return (scores.reduce((sum, s) => sum + s, 0) + PRIOR_WEIGHT * PRIOR_MEAN) / (scores.length + PRIOR_WEIGHT);
}

// R: share of promised lessons the tutor actually kept (0-1).
export function reliability({ held, bad }) {
  return held + bad === 0 ? 1 : held / (held + bad);
}

// A tutor cancelling less than LATE_CANCEL_HOURS before the lesson starts. Exactly on the boundary is still fine.
export function isLateCancel({ starts_at, cancelled_at }) {
  const start = Date.parse(starts_at), at = Date.parse(cancelled_at);
  if (!Number.isFinite(start) || !Number.isFinite(at)) return false;
  return start - at < LATE_CANCEL_HOURS * 3600000;
}

// Display: one decimal. Stars: nearest half.
export const displayScore = score => (score === null ? null : round1(score));
export const halfStars = score => Math.round(score * 2) / 2;

// pairs: [{ course, lessonAvg }] one per student; held/bad: lesson counts;
// ratingCount/raterCount: lesson ratings + course reviews, and distinct students giving them;
// tagCounts: { code: times chosen }.
export function trustScore({ pairs = [], held = 0, bad = 0, ratingCount = 0, raterCount = 0, tagCounts = {} }) {
  const scores = pairs.map(pairScore).filter(has);
  const Q = quality(scores), R = reliability({ held, bad });
  const isNew = ratingCount < NEW_MIN_RATINGS || raterCount < NEW_MIN_RATERS;
  const raw = 5 * (QUALITY_SHARE * Q / 5 + RELIABILITY_SHARE * R);
  const tags = Object.entries(tagCounts)
    .filter(([code, count]) => tagLabel[code] && count >= PUBLIC_TAG_MIN)
    .sort((a, b) => b[1] - a[1] || lessonTagCodes.indexOf(a[0]) - lessonTagCodes.indexOf(b[0]))
    .slice(0, PUBLIC_TAG_LIMIT)
    .map(([code, count]) => ({ code, label: tagLabel[code], count }));
  return {
    score: isNew ? null : round1(raw),
    is_new: isNew,
    sort_score: isNew ? PRIOR_MEAN : round1(raw),
    review_count: pairs.filter(p => has(p.course)).length,
    punctuality: held + bad >= PUNCTUALITY_MIN_LESSONS ? Math.round(R * 100) / 100 : null,
    tags,
    // Private detail for the tutor's own page; never sent to students.
    detail: { quality: Q, pairs: scores.length, reliability: R, held, bad, rating_count: ratingCount, rater_count: raterCount },
  };
}

// The public object: the same without the private detail.
export const publicTrust = ({ detail, ...trust }) => trust;
