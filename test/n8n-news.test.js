import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, parseState, todayVN, pickNew, settle } from "../scripts/n8n/lib/select.js";

const TODAY = "2026-11-22";
const opts = { perRun: 5, perDay: 10, today: TODAY };
const item = (n, extra = {}) => ({
  title: `Tin ${n}`,
  link: `https://baao.example/tin-${n}`,
  source: "Báo thử",
  isoDate: `2026-11-22T${String(10 + (n % 10)).padStart(2, "0")}:00:00Z`,
  ...extra,
});
const items = (count) => Array.from({ length: count }, (_, i) => item(i + 1));
const seenState = (links = ["https://old.example/x"], daily = { date: TODAY, count: 0 }) => ({ seen: links, daily });

test("pickNew bỏ tin thiếu link hoặc title", () => {
  const { pick } = pickNew([{ title: "", link: "a", source: "s" }, { title: "x", link: "", source: "s" }], seenState(), opts);
  assert.deepEqual(pick, []);
});

test("pickNew bỏ link trùng giữa các nguồn", () => {
  const { pick } = pickNew([item(1), item(1, { source: "Báo khác" })], seenState(), opts);
  assert.equal(pick.length, 1);
});

test("pickNew bỏ tin đã seen", () => {
  const { pick } = pickNew(items(3), seenState([item(2).link]), opts);
  assert.deepEqual(pick.map((p) => p.link).sort(), [item(1).link, item(3).link].sort());
});

test("pickNew xếp mới nhất trước theo isoDate", () => {
  const older = item(1, { isoDate: "2026-11-20T00:00:00Z" });
  const newer = item(2, { isoDate: "2026-11-22T09:00:00Z" });
  const { pick } = pickNew([older, newer], seenState(), opts);
  assert.deepEqual(pick.map((p) => p.link), [newer.link, older.link]);
});

test("pickNew chọn tối đa perRun", () => {
  assert.equal(pickNew(items(8), seenState(), opts).pick.length, 5);
});

test("pickNew tôn trọng hạn mức ngày", () => {
  const { pick } = pickNew(items(8), seenState(["x"], { date: TODAY, count: 8 }), opts);
  assert.equal(pick.length, 2);
});

test("pickNew sang ngày mới thì đặt lại số đếm", () => {
  const { pick } = pickNew(items(8), seenState(["x"], { date: "2026-11-21", count: 10 }), opts);
  assert.equal(pick.length, 5);
});

test("pickNew lần chạy đầu giữ 5 tin mới nhất và markSeen phần còn lại", () => {
  const { pick, markSeen } = pickNew(items(12), emptyState(), opts);
  assert.equal(pick.length, 5);
  assert.equal(markSeen.length, 7);
  const picked = new Set(pick.map((p) => p.link));
  assert.ok(markSeen.every((l) => !picked.has(l)));
});

test("pickNew không markSeen khi không phải lần chạy đầu", () => {
  assert.deepEqual(pickNew(items(12), seenState(), opts).markSeen, []);
});

test("pickNew không sửa state đầu vào", () => {
  const state = seenState();
  const copy = JSON.stringify(state);
  pickNew(items(3), state, opts);
  assert.equal(JSON.stringify(state), copy);
});

test("todayVN theo giờ Việt Nam", () => {
  assert.equal(todayVN(new Date("2026-11-22T17:30:00Z")), "2026-11-23");
  assert.equal(todayVN(new Date("2026-11-22T16:59:00Z")), "2026-11-22");
});

test("settle chỉ đánh dấu posted, skipped, rejected; error thì không", () => {
  const out = settle(emptyState(), [
    { link: "a", kind: "posted" },
    { link: "b", kind: "skipped" },
    { link: "c", kind: "rejected" },
    { link: "d", kind: "error" },
  ], TODAY);
  assert.deepEqual(out.seen, ["a", "b", "c"]);
});

test("settle đếm daily chỉ cho posted", () => {
  const out = settle(seenState([], { date: TODAY, count: 1 }), [
    { link: "a", kind: "posted" },
    { link: "b", kind: "posted" },
    { link: "c", kind: "skipped" },
  ], TODAY);
  assert.deepEqual(out.daily, { date: TODAY, count: 3 });
});

test("settle đặt lại count khi sang ngày", () => {
  const out = settle(seenState([], { date: "2026-11-21", count: 9 }), [{ link: "a", kind: "posted" }], TODAY);
  assert.deepEqual(out.daily, { date: TODAY, count: 1 });
});

test("settle giữ tối đa 2000 link seen, giữ link mới nhất", () => {
  const many = Array.from({ length: 1999 }, (_, i) => `old-${i}`);
  const out = settle(seenState(many), ["n1", "n2", "n3"].map((link) => ({ link, kind: "posted" })), TODAY);
  assert.equal(out.seen.length, 2000);
  assert.equal(out.seen.at(-1), "n3");
  assert.ok(!out.seen.includes("old-0"));
});

test("settle không thêm link trùng vào seen", () => {
  const out = settle(seenState(["a"]), [{ link: "a", kind: "posted" }], TODAY);
  assert.deepEqual(out.seen, ["a"]);
});

test("parseState trả emptyState khi JSON hỏng hoặc rỗng", () => {
  assert.deepEqual(parseState("{not json"), emptyState());
  assert.deepEqual(parseState(null), emptyState());
  assert.deepEqual(parseState(""), emptyState());
});

test("parseState đọc lại đúng trạng thái đã lưu", () => {
  const state = seenState(["a", "b"], { date: TODAY, count: 4 });
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});
