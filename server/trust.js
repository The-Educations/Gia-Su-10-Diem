// Lesson ratings, end-of-course reviews and the trust score, read from the database.
// Formulas and constants live in trust-policy.js; nothing here is stored, scores are computed on read.
import { all, one, run, transaction } from "./db.js";
import { z } from "./validation.js";
import { findContactInfo, authorLabel } from "./community-policy.js";
import {
  LESSON_TAGS, lessonTagCodes, MAX_TAGS_PER_LESSON, LESSON_RATING_DAYS, LESSON_RATING_EDIT_HOURS, COURSE_REVIEW_DAYS,
  trustScore, isLateCancel, publicTrust, PRIOR_MEAN, PRIOR_WEIGHT, COURSE_WEIGHT, QUALITY_SHARE, RELIABILITY_SHARE,
  LATE_CANCEL_HOURS, NEW_MIN_RATINGS, NEW_MIN_RATERS, PUNCTUALITY_MIN_LESSONS, PUBLIC_TAG_MIN,
} from "./trust-policy.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const dayMs = 86400000, hourMs = 3600000;
// SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
const sqlTime = value => Date.parse(String(value).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? "" : "Z"));
const lessonEnd = b => Date.parse(b.starts_at) + b.duration_minutes * 60000;

// When an accepted course is over: ended early on request, or past its last day (Vietnam time).
export function courseEnd(offer, now = Date.now()) {
  if (offer.kind !== "course" || !offer.accepted_at) return { ended: false, ends_at: null, review_open_until: null };
  let endsAt = null;
  if (offer.ended_at) endsAt = Date.parse(offer.ended_at);
  else if (offer.status === "accepted") endsAt = Date.parse(`${offer.end_date}T00:00:00+07:00`) + dayMs;
  if (endsAt === null || endsAt > now) return { ended: false, ends_at: null, review_open_until: null };
  return { ended: true, ends_at: new Date(endsAt).toISOString(), review_open_until: new Date(endsAt + COURSE_REVIEW_DAYS * dayMs).toISOString() };
}

// Course fields added to each offer. Tutors get no private answers (continue_intent).
export function withCourseState(db, offers, user) {
  const ids = offers.map(o => o.id);
  const done = new Map(), mine = new Map();
  if (ids.length) {
    const marks = ids.map(() => "?").join(",");
    for (const r of all(db, `SELECT offer_id,COUNT(*) AS n FROM bookings WHERE status='completed' AND offer_id IN (${marks}) GROUP BY offer_id`, ...ids)) done.set(r.offer_id, r.n);
    if (user.role === "student")
      for (const r of all(db, `SELECT * FROM course_reviews WHERE offer_id IN (${marks})`, ...ids)) mine.set(r.offer_id, r);
  }
  const now = Date.now();
  return offers.map(o => {
    const end = courseEnd(o, now), lessons = done.get(o.id) || 0, review = mine.get(o.id);
    return {
      ...o, ...end, completed_lessons: lessons,
      review_eligible: user.id === o.student_id && end.ended && lessons > 0 && now <= Date.parse(end.review_open_until),
      ...(user.role === "student" && { my_review: review ? { rating: review.rating, body: review.body, continue_intent: review.continue_intent, updated_at: review.updated_at } : null }),
    };
  });
}

// ---- Reading: one set of grouped queries for every tutor ----

// Latest end-of-course review of each student-tutor pair. Reviews written before courses existed
// count as end-of-course reviews. Returns every row too: each one is a rating given.
function courseReviewRows(db, tutorId = null) {
  const filter = tutorId === null ? "" : " WHERE tutor_id=?", args = tutorId === null ? [] : [tutorId];
  const rows = all(db, `SELECT * FROM (
    SELECT o.student_id,o.tutor_id,cr.rating,cr.body,NULL AS reply,cr.created_at,cr.offer_id AS ref,1 AS fresh FROM course_reviews cr JOIN offers o ON o.id=cr.offer_id
    UNION ALL
    SELECT b.student_id,b.tutor_id,r.rating,r.body,r.reply,r.created_at,r.booking_id AS ref,0 AS fresh FROM reviews r JOIN bookings b ON b.id=r.booking_id WHERE r.hidden=0
    UNION ALL
    SELECT m.student_id,c.tutor_id,m.published_rating AS rating,m.review AS body,m.reply AS reply,COALESCE(m.reviewed_at,m.ended_at) AS created_at,m.id AS ref,2 AS fresh
      FROM class_members m JOIN classes c ON c.id=m.class_id WHERE m.status='ended' AND m.published_rating IS NOT NULL AND m.hidden=0
  )${filter}`, ...args);
  rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.fresh - a.fresh || b.ref - a.ref));
  const latest = new Map();
  for (const r of rows) if (!latest.has(`${r.student_id}:${r.tutor_id}`)) latest.set(`${r.student_id}:${r.tutor_id}`, r);
  return { rows, latest: [...latest.values()] };
}

const emptyFacts = () => ({ pairs: new Map(), held: 0, bad: 0, ratingCount: 0, raters: new Set(), tagCounts: {}, lessonSum: 0, lessonCount: 0 });

function loadFacts(db) {
  const facts = new Map(), of = id => facts.get(id) || facts.set(id, emptyFacts()).get(id);
  const pair = (f, student) => f.pairs.get(student) || f.pairs.set(student, { course: null, lessonSum: 0, lessonN: 0 }).get(student);
  const { rows, latest } = courseReviewRows(db);
  for (const r of rows) { const f = of(r.tutor_id); f.ratingCount++; f.raters.add(r.student_id); }
  for (const r of latest) pair(of(r.tutor_id), r.student_id).course = r.rating;
  for (const r of all(db, `SELECT b.student_id,b.tutor_id,lr.rating,lr.tags AS tags FROM lesson_ratings lr JOIN bookings b ON b.id=lr.booking_id WHERE b.status='completed'
    UNION ALL
    SELECT m.student_id,c.tutor_id,sm.rating,'[]' AS tags FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id WHERE sm.rating IS NOT NULL AND sm.outcome='confirmed'`)) {
    const f = of(r.tutor_id), p = pair(f, r.student_id);
    p.lessonSum += r.rating; p.lessonN++;
    f.lessonSum += r.rating; f.lessonCount++; f.ratingCount++; f.raters.add(r.student_id);
    for (const code of JSON.parse(r.tags)) f.tagCounts[code] = (f.tagCounts[code] || 0) + 1;
  }
  for (const r of all(db, `SELECT tutor_id,COUNT(*) AS n FROM bookings WHERE status='completed' GROUP BY tutor_id
    UNION ALL
    SELECT c.tutor_id,COUNT(*) AS n FROM session_members sm JOIN class_sessions cs ON cs.id=sm.session_id JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id WHERE sm.outcome IN ('confirmed','charged') GROUP BY c.tutor_id`)) of(r.tutor_id).held += r.n;
  // A tutor who cancels late (not because the course was ended) or does not show up.
  for (const r of all(db, `SELECT tutor_id,status,starts_at,cancelled_at FROM bookings WHERE status='tutor_missed'
    OR (status='cancelled' AND cancelled_by=tutor_id AND cancel_reason<>'course_ended' AND cancelled_at IS NOT NULL)`))
    if (r.status === "tutor_missed" || isLateCancel(r)) of(r.tutor_id).bad++;
  // New flow: late tutor cancels are counted on tutors.violations, and a no-show
  // the student reports sits at outcome='disputed' until admin resolution.
  for (const r of all(db, "SELECT user_id AS tutor_id,violations FROM tutors WHERE violations>0")) of(r.tutor_id).bad += r.violations;
  for (const r of all(db, `SELECT c.tutor_id,COUNT(*) AS n FROM session_members sm JOIN class_members m ON m.id=sm.member_id JOIN classes c ON c.id=m.class_id WHERE sm.outcome='disputed' GROUP BY c.tutor_id`)) of(r.tutor_id).bad += r.n;
  return facts;
}

const toScore = f => trustScore({
  pairs: [...f.pairs.values()].map(p => ({ course: p.course, lessonAvg: p.lessonN ? p.lessonSum / p.lessonN : null })),
  held: f.held, bad: f.bad, ratingCount: f.ratingCount, raterCount: f.raters.size, tagCounts: f.tagCounts,
});

// Returns tutorId -> public trust object (and, for the tutor's own page, the private detail).
export function trustReader(db) {
  const facts = loadFacts(db);
  return {
    public: id => publicTrust(toScore(facts.get(id) || emptyFacts())),
    full: id => {
      const f = facts.get(id) || emptyFacts();
      return { ...toScore(f), tag_counts: f.tagCounts, lesson_avg: f.lessonCount ? f.lessonSum / f.lessonCount : null, lesson_count: f.lessonCount };
    },
  };
}

// One public review per student-tutor pair: their latest end-of-course review.
export function publicReviews(db, tutorId, forTutor = false) {
  const { latest } = courseReviewRows(db, tutorId);
  return latest.map(r => {
    const u = one(db, "SELECT role,learner_type,display_name,profile_code FROM users WHERE id=?", r.student_id) || {};
    const lessons = one(db, "SELECT COUNT(*) AS n FROM bookings WHERE student_id=? AND tutor_id=? AND status='completed'", r.student_id, r.tutor_id).n;
    return { rating: r.rating, body: r.body || "", created_at: r.created_at, lessons, author: authorLabel(u).label, ...(forTutor ? { kind: r.fresh === 2 ? "member" : "booking", ref: r.ref } : {}), ...(r.reply ? { reply: r.reply } : {}) };
  }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// ---- Writing ----

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.enum(lessonTagCodes)).max(MAX_TAGS_PER_LESSON, `Chọn tối đa ${MAX_TAGS_PER_LESSON} nhãn.`).default([]),
}).refine(d => new Set(d.tags).size === d.tags.length, "Nhãn bị lặp.");
const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000, "Nhận xét tối đa 1.000 ký tự.").default("").refine(s => !s || s.length >= 10, "Nhận xét cần từ 10 ký tự, hoặc để trống."),
  continue_intent: z.enum(["yes", "no", "unsure"]).nullable().optional(),
});

export function registerTrust(app, db, auth, audit) {
  app.put("/api/bookings/:id/rating", auth("student"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = ratingSchema.parse(req.body);
    const result = transaction(db, () => {
      const b = one(db, "SELECT * FROM bookings WHERE id=? AND student_id=?", id, req.user.id);
      if (!b) fail(404, "Không tìm thấy buổi học.");
      if (b.status !== "completed") fail(409, "Chỉ chấm được buổi học đã hoàn thành.");
      const now = Date.now(), existing = one(db, "SELECT * FROM lesson_ratings WHERE booking_id=?", id);
      if (existing) {
        if (now - sqlTime(existing.created_at) > LESSON_RATING_EDIT_HOURS * hourMs) fail(409, `Chỉ sửa được trong ${LESSON_RATING_EDIT_HOURS} giờ sau khi chấm.`);
        run(db, "UPDATE lesson_ratings SET rating=?,tags=?,updated_at=? WHERE booking_id=?", d.rating, JSON.stringify(d.tags), new Date(now).toISOString(), id);
        return { updated: true };
      }
      if (now > lessonEnd(b) + LESSON_RATING_DAYS * dayMs) fail(409, `Đã quá ${LESSON_RATING_DAYS} ngày kể từ buổi học nên không thể chấm.`);
      const at = new Date(now).toISOString();
      run(db, "INSERT INTO lesson_ratings(booking_id,rating,tags,created_at,updated_at) VALUES (?,?,?,?,?)", id, d.rating, JSON.stringify(d.tags), at, at);
      return { updated: false };
    });
    res.status(result.updated ? 200 : 201).json({ ok: true, ...result });
  });

  app.put("/api/offers/:id/review", auth("student"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const d = reviewSchema.parse(req.body);
    if (d.body) {
      const contact = findContactInfo(d.body);
      if (contact) fail(400, `Vui lòng không ghi ${contact} trong đánh giá. Hãy giữ trao đổi trên nền tảng.`);
    }
    const result = transaction(db, () => {
      const o = one(db, "SELECT * FROM offers WHERE id=? AND student_id=?", id, req.user.id);
      if (!o) fail(404, "Không tìm thấy khóa học.");
      if (o.kind !== "course" || !o.accepted_at) fail(409, "Chỉ khóa học đã được chấp nhận mới có đánh giá cuối khóa.");
      const end = courseEnd(o);
      if (!end.ended) fail(409, "Khóa học chưa kết thúc.");
      if (!one(db, "SELECT 1 AS ok FROM bookings WHERE offer_id=? AND status='completed' LIMIT 1", id)) fail(409, "Khóa học chưa có buổi nào hoàn thành.");
      if (Date.now() > Date.parse(end.review_open_until)) fail(409, `Đã quá ${COURSE_REVIEW_DAYS} ngày kể từ khi khóa học kết thúc.`);
      const intent = d.continue_intent ?? null;
      if (one(db, "SELECT 1 AS ok FROM course_reviews WHERE offer_id=?", id)) {
        run(db, "UPDATE course_reviews SET rating=?,body=?,continue_intent=?,updated_at=CURRENT_TIMESTAMP WHERE offer_id=?", d.rating, d.body, intent, id);
        return { updated: true };
      }
      run(db, "INSERT INTO course_reviews(offer_id,rating,body,continue_intent) VALUES (?,?,?,?)", id, d.rating, d.body, intent);
      return { updated: false };
    });
    audit(req.user.id, result.updated ? "course.review.update" : "course.review", id);
    res.status(result.updated ? 200 : 201).json({ ok: true, ...result });
  });

  // The tutor's own breakdown (and the same totals for admins). Only totals: never which student gave which lesson rating.
  const breakdown = tutorId => {
    const t = trustReader(db).full(tutorId), { detail } = t;
    const { detail: _d, tag_counts, ...rest } = t;
    return {
      ...rest,
      quality: detail.quality, pairs: detail.pairs, reliability: detail.reliability,
      held: detail.held, bad: detail.bad, rating_count: detail.rating_count, rater_count: detail.rater_count,
      progress: { ratings: detail.rating_count, raters: detail.rater_count, need_ratings: NEW_MIN_RATINGS, need_raters: NEW_MIN_RATERS },
      tag_counts: LESSON_TAGS.map(tag => ({ ...tag, count: tag_counts[tag.code] || 0 })),
      bad_breakdown: tutorBad(db, tutorId),
      reviews: publicReviews(db, tutorId, true),
      policy: { PRIOR_MEAN, PRIOR_WEIGHT, COURSE_WEIGHT, QUALITY_SHARE, RELIABILITY_SHARE, LATE_CANCEL_HOURS, NEW_MIN_RATINGS, NEW_MIN_RATERS, PUNCTUALITY_MIN_LESSONS, PUBLIC_TAG_MIN },
    };
  };
  app.get("/api/tutor/trust", auth("tutor"), (req, res) => res.json(breakdown(req.user.id)));
  app.get("/api/admin/tutors/:id/trust", auth("admin"), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (!one(db, "SELECT 1 AS ok FROM tutors WHERE user_id=?", id)) fail(404, "Không tìm thấy gia sư.");
    res.json(breakdown(id));
  });
}

function tutorBad(db, tutorId) {
  const noShows = one(db, "SELECT COUNT(*) AS n FROM bookings WHERE tutor_id=? AND status='tutor_missed'", tutorId).n;
  const late = all(db, "SELECT starts_at,cancelled_at FROM bookings WHERE tutor_id=? AND status='cancelled' AND cancelled_by=tutor_id AND cancel_reason<>'course_ended' AND cancelled_at IS NOT NULL", tutorId).filter(isLateCancel).length;
  return { late_cancels: late, no_shows: noShows };
}

// For GET /api/bookings: the student's own lesson ratings and when they can still change them.
export function lessonRatingFields(db, bookings, studentId) {
  const mine = new Map(all(db, "SELECT lr.* FROM lesson_ratings lr JOIN bookings b ON b.id=lr.booking_id WHERE b.student_id=?", studentId).map(r => [r.booking_id, r]));
  const now = Date.now();
  return bookings.map(b => {
    const r = mine.get(b.id), open = b.status === "completed" && now <= lessonEnd(b) + LESSON_RATING_DAYS * dayMs;
    return {
      ...b,
      my_rating: r ? r.rating : null,
      my_tags: r ? JSON.parse(r.tags) : [],
      rating_open_until: b.status === "completed" ? new Date(lessonEnd(b) + LESSON_RATING_DAYS * dayMs).toISOString() : null,
      rating_edit_until: r ? new Date(sqlTime(r.created_at) + LESSON_RATING_EDIT_HOURS * hourMs).toISOString() : null,
      rating_editable: b.status === "completed" && (r ? now - sqlTime(r.created_at) <= LESSON_RATING_EDIT_HOURS * hourMs : open),
    };
  });
}
