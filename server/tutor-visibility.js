// A tutor profile has two kinds of fields.
//
// Content fields describe the tutor to students (text, qualifications and the
// subjects they can be found by). Changing one needs an administrator's review.
// Everything else (rate, teaching mode, address, time zone, trial lessons and
// weekly hours) is an operational setting that applies immediately.
//
// While a revised profile waits for review, students keep seeing the last
// approved content: `tutors.published` holds that snapshot as JSON. The columns
// themselves always hold the tutor's latest draft.
export const CONTENT_FIELDS = [
  "headline",
  "bio",
  "education",
  "experience",
  "education_history",
  "profile_sections",
  "teaching_style",
  "lesson_plan",
  "subjects",
  "levels",
  "goals",
];

const JSON_FIELDS = new Set(["education_history", "profile_sections", "subjects", "levels", "goals"]);

// SQL for tutors whose profile students may see and send requests to: approved
// ones, plus tutors whose edit is under review but who still have a published
// version. `alias` is the tutors table alias in the surrounding query.
export const liveTutorSql = (alias = "t") =>
  `(${alias}.status='approved' OR (${alias}.published IS NOT NULL AND ${alias}.status IN ('pending','rejected')))`;

export const isLiveTutor = (row) =>
  !!row && (row.status === "approved" || (row.published != null && ["pending", "rejected"].includes(row.status)));

export const contentSnapshot = (row) => JSON.stringify(Object.fromEntries(CONTENT_FIELDS.map((f) => [f, row[f]])));

// Returns the row as students should see it: the published snapshot replaces
// the draft content while a revision awaits review.
export function publicView(row) {
  if (!row || row.status === "approved" || row.published == null) return row;
  return { ...row, ...JSON.parse(row.published) };
}

const normal = (field, value) => (JSON_FIELDS.has(field) ? JSON.stringify(JSON.parse(value)) : value);

// Fields of `next` (a validated body, JSON fields as arrays) that differ from
// the stored row. Fields missing from `next` are left unchanged.
export function changedContent(current, next) {
  return CONTENT_FIELDS.filter((field) => {
    if (next[field] === undefined) return false;
    const incoming = JSON_FIELDS.has(field) ? JSON.stringify(next[field]) : next[field];
    return normal(field, current[field]) !== incoming;
  });
}

// The snapshot as the interface receives it: JSON fields as real arrays.
export function publishedView(raw) {
  if (!raw) return null;
  const snapshot = JSON.parse(raw);
  return Object.fromEntries(Object.entries(snapshot).map(([field, value]) => [field, JSON_FIELDS.has(field) ? JSON.parse(value) : value]));
}
