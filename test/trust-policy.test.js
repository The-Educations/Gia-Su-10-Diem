import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrateDatabase } from "../server/db.js";
import {
  PRIOR_MEAN, pairScore, quality, reliability, isLateCancel, trustScore, publicTrust, displayScore, halfStars,
} from "../server/trust-policy.js";

const close = (actual, expected, eps = 0.005) => assert.ok(Math.abs(actual - expected) < eps, `${actual} !~ ${expected}`);
const pairs = (n, course) => Array.from({ length: n }, () => ({ course }));

test("pair score blends the end-of-course rating and the lesson average", () => {
  assert.equal(pairScore({ course: 5, lessonAvg: 4 }), 4.75);
  assert.equal(pairScore({ course: 5 }), 5);
  assert.equal(pairScore({ lessonAvg: 3.5 }), 3.5);
  assert.equal(pairScore({}), null);
});

test("quality with no pairs is the prior mean and matches the worked examples", () => {
  assert.equal(quality([]), PRIOR_MEAN);
  close(quality([4.8, 4.8]), 4.4428);
  close(quality(Array(20).fill(4.8)), 4.7);
  close(quality(Array(10).fill(4.5)), 4.4333);
});

test("one student cannot dominate the score however many lessons they rate", () => {
  const others = Array(9).fill(5).map(course => ({ course }));
  const withHater = trustScore({ pairs: [...others, { course: 1, lessonAvg: 1 }], ratingCount: 40, raterCount: 10 });
  const without = trustScore({ pairs: others, ratingCount: 9, raterCount: 9 });
  // A single 1-star pair is one vote of ten, not twenty ratings out of twenty-nine.
  assert.ok(without.score - withHater.score < 1.2, `${without.score} vs ${withHater.score}`);
  assert.ok(withHater.score > 3.5);
});

test("reliability handles no data, late cancellations and the 24 hour boundary", () => {
  assert.equal(reliability({ held: 0, bad: 0 }), 1);
  assert.equal(reliability({ held: 38, bad: 2 }), 0.95);
  const starts_at = "2026-12-10T10:00:00.000Z";
  assert.equal(isLateCancel({ starts_at, cancelled_at: "2026-12-10T09:00:00.000Z" }), true);
  assert.equal(isLateCancel({ starts_at, cancelled_at: "2026-12-09T10:00:01.000Z" }), true);
  assert.equal(isLateCancel({ starts_at, cancelled_at: "2026-12-09T10:00:00.000Z" }), false);
  assert.equal(isLateCancel({ starts_at, cancelled_at: "2026-12-05T10:00:00.000Z" }), false);
  assert.equal(isLateCancel({ starts_at, cancelled_at: null }), false);
});

test("trust score reproduces the worked examples", () => {
  const two = trustScore({ pairs: pairs(2, 4.8), held: 3, ratingCount: 4, raterCount: 2 });
  assert.equal(two.score, 4.6);
  const twenty = trustScore({ pairs: pairs(20, 4.8), held: 50, ratingCount: 20, raterCount: 20 });
  assert.equal(twenty.score, 4.8);
  const busy = trustScore({ pairs: pairs(10, 4.5), held: 38, bad: 2, ratingCount: 10, raterCount: 10 });
  assert.equal(busy.score, 4.5);
  assert.equal(busy.punctuality, 0.95);
  assert.equal(busy.review_count, 10);
});

test("a tutor stays new until 3 ratings from 2 different students", () => {
  const make = (ratingCount, raterCount) => trustScore({ pairs: pairs(raterCount, 5), ratingCount, raterCount });
  for (const [ratings, raters] of [[0, 0], [2, 2], [3, 1], [5, 1]]) {
    const t = make(ratings, raters);
    assert.equal(t.is_new, true, `${ratings}/${raters}`);
    assert.equal(t.score, null);
    assert.equal(t.sort_score, PRIOR_MEAN);
  }
  const ok = make(3, 2);
  assert.equal(ok.is_new, false);
  assert.ok(ok.score > 4);
});

test("punctuality needs 5 counted lessons and tags need 3 uses, top 4 only", () => {
  assert.equal(trustScore({ held: 4, bad: 0 }).punctuality, null);
  assert.equal(trustScore({ held: 4, bad: 1 }).punctuality, 0.8);
  const t = trustScore({ tagCounts: { de_hieu: 9, kien_nhan: 2, nhiet_tinh: 3, dung_gio: 5, chuan_bi: 4, hieu_y: 7, la_hoac: 99 } });
  assert.deepEqual(t.tags.map(x => x.code), ["de_hieu", "hieu_y", "dung_gio", "chuan_bi"]);
  assert.equal(t.tags[0].label, "Dễ hiểu");
});

test("display rounding and the public object hides private detail", () => {
  assert.equal(displayScore(4.64), 4.6);
  assert.equal(displayScore(null), null);
  assert.equal(halfStars(4.6), 4.5);
  assert.equal(halfStars(4.8), 5);
  const t = trustScore({ pairs: pairs(5, 5), ratingCount: 5, raterCount: 5 });
  assert.ok(t.detail);
  assert.equal("detail" in publicTrust(t), false);
});

test("trust migration is additive and runs twice without losing data", () => {
  const db = migrateDatabase(new DatabaseSync(":memory:"));
  db.exec("INSERT INTO users(id,name,email,password,role) VALUES (1,'S','s@x.vn','x','student'),(2,'T','t@x.vn','x','tutor')");
  migrateDatabase(db);
  const names = table => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  for (const column of ["cancelled_by", "cancelled_at", "cancel_reason", "tutor_missed_at"]) assert.ok(names("bookings").includes(column), column);
  for (const column of ["ended_at", "ended_by"]) assert.ok(names("offers").includes(column), column);
  assert.ok(names("lesson_ratings").includes("tags"));
  assert.ok(names("course_reviews").includes("continue_intent"));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 2);
});
