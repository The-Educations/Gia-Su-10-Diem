import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  TOPICS, slugify, readingMinutes, splitLegacyBody, cleanNewsHtml,
  publishProblems, postWarnings, buildCta, searchText,
} from "../server/news-policy.js";
import { migrateDatabase } from "../server/db.js";
import { migrateNews } from "../server/news-schema.js";

const UUID = "0b9a7c3e-1d2f-4a5b-8c6d-7e8f9a0b1c2d";
const legacyBody =
  "![Bộ GD công bố lịch thi](https://cdn.tuoitre.vn/a.jpg)\nẢnh: Tuổi Trẻ\n\nĐoạn một.\n\nĐoạn hai.\n\nNguồn: Tuổi Trẻ - https://tuoitre.vn/x.htm";

test("topics are defined once in shared/news-topics.json with the three agreed codes", () => {
  assert.deepEqual(TOPICS.map((t) => t.id), ["admissions", "policy", "study"]);
  assert.ok(TOPICS.every((t) => t.label && t.cta.heading && t.cta.button));
});

test("slugify folds Vietnamese, keeps a-z0-9, caps at 80 chars and never returns empty", () => {
  assert.equal(slugify("Bộ GD&ĐT công bố lịch thi 2027!"), "bo-gd-dt-cong-bo-lich-thi-2027");
  assert.equal(slugify("  Đại học   Quốc gia  "), "dai-hoc-quoc-gia");
  const long = slugify("tin ".repeat(60));
  assert.ok(long.length <= 80 && !long.endsWith("-") && !long.startsWith("-"));
  assert.equal(slugify("!!! ???"), "tin-tuc");
});

test("reading time is max(1, round(words/200))", () => {
  assert.equal(readingMinutes(""), 1);
  assert.equal(readingMinutes("một hai ba"), 1);
  assert.equal(readingMinutes("từ ".repeat(500)), 3);
  assert.equal(readingMinutes("từ ".repeat(1000)), 5);
});

test("splitLegacyBody moves the leading image and trailing Nguồn line into fields", () => {
  assert.deepEqual(splitLegacyBody(legacyBody), {
    body: "Đoạn một.\n\nĐoạn hai.",
    cover_url: "https://cdn.tuoitre.vn/a.jpg",
    cover_alt: "Bộ GD công bố lịch thi",
    cover_credit: "Tuổi Trẻ",
    source_name: "Tuổi Trẻ",
    source_url: "https://tuoitre.vn/x.htm",
  });
  const plain = "Chỉ có chữ.\n\nKhông ảnh, không nguồn.";
  assert.deepEqual(splitLegacyBody(plain), { body: plain, cover_url: "", cover_alt: "", cover_credit: "", source_name: "", source_url: "" });
  assert.equal(splitLegacyBody("![x](http://insecure/a.jpg)\nChữ").cover_url, "", "only https covers are lifted");
  const mid = "Đầu.\n\n![x](https://cdn.tuoitre.vn/a.jpg)\n\nCuối.";
  assert.equal(splitLegacyBody(mid).cover_url, "", "an image in the middle stays in the text");
});

test("cleanNewsHtml keeps only news-hosted images and strips scripts, handlers and bad links", () => {
  const dirty = `<h2>Tiêu đề</h2><p onclick="x()">Chữ <a href="javascript:alert(1)">link</a> <a href="https://vnexpress.net">ok</a></p>
    <img src="/api/news/images/${UUID}" alt="Ảnh bài" onerror="x()"><img src="https://evil.test/x.png"><img src="/api/community/images/${UUID}"><script>alert(1)</script>`;
  const clean = cleanNewsHtml(dirty);
  assert.ok(!/script|onclick|onerror|javascript:|evil\.test|community\/images/.test(clean.body_html), clean.body_html);
  assert.match(clean.body_html, new RegExp(`<img src="/api/news/images/${UUID}"`));
  assert.match(clean.body_html, /<a [^>]*href="https:\/\/vnexpress\.net"[^>]*rel="noopener noreferrer nofollow ugc"/);
  assert.deepEqual(clean.image_ids, [UUID]);
  assert.equal(clean.body, "Tiêu đề\nChữ link ok");
});

test("publish problems are the hard rules; warnings are soft and computed from the row", () => {
  const words = (n) => "từ ".repeat(n).trim();
  const ok = { title: "Tiêu đề", summary: "Tóm tắt", body: words(60), topic: "study" };
  assert.deepEqual(publishProblems(ok), []);
  assert.deepEqual(publishProblems({ ...ok, title: "", summary: " ", body: words(10), topic: "x" }), [
    "Thiếu tiêu đề", "Thiếu tóm tắt", "Nội dung cần ít nhất 50 chữ", "Chủ đề không hợp lệ",
  ]);
  assert.deepEqual(postWarnings({ ...ok, origin: "manual", cover_url: "https://a/b.jpg", source_name: "" }), ["Bài ngắn (dưới 150 chữ)"]);
  assert.deepEqual(
    postWarnings({ ...ok, body: words(200), origin: "auto", cover_url: "", source_name: "", title: "t".repeat(101), summary: "s".repeat(301) }),
    ["Thiếu ảnh bìa", "Bài tự động chưa ghi nguồn", "Tiêu đề dài hơn 100 ký tự", "Tóm tắt dài hơn 300 ký tự"],
  );
});

test("CTA is computed per topic, drops empty params and ignores the goal on policy", () => {
  assert.deepEqual(buildCta({ topic: "admissions", cta_level: "THCS", cta_goal: "" }), {
    heading: "Cần người kèm ôn thi?", text: "Tìm gia sư đã xác minh, học thử trước khi đăng ký.",
    button: "Tìm gia sư ôn thi →", href: "/tutors?level=THCS",
  });
  assert.equal(buildCta({ topic: "study", cta_level: "", cta_goal: "" }).href, "/tutors");
  const goal = buildCta({ topic: "admissions", cta_level: "THCS", cta_goal: "Thi vào 10" });
  assert.equal(goal.heading, "Cần người kèm Thi vào 10?");
  assert.equal(new URL(goal.href, "https://x.test").searchParams.get("goal"), "Thi vào 10");
  const policy = buildCta({ topic: "policy", cta_level: "THPT", cta_goal: "Thi vào 10" });
  assert.equal(policy.href, "/tutors?level=THPT");
  assert.equal(policy.heading, "Cần người đồng hành việc học của con?");
});

test("searchText folds diacritics across title, summary and body", () => {
  assert.equal(searchText({ title: "Điểm chuẩn", summary: "Tuyển sinh", body: "Hà Nội" }), "diem chuan tuyen sinh ha noi");
});

const oldPosts = `CREATE TABLE posts (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), author_id INTEGER NOT NULL REFERENCES users(id),
  published_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`;

test("migration upgrades an old posts table, splits legacy source and cover once, and is safe to rerun", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(oldPosts);
  const insert = db.prepare("INSERT INTO posts(title,summary,body,published,author_id,published_at) VALUES (?,?,?,?,1,?)");
  insert.run("Lịch thi tốt nghiệp 2027", "Tóm tắt", legacyBody, 1, "2026-11-01 08:00:00");
  insert.run("Bài tự viết", "Tóm tắt", "Chữ thuần.", 0, null);
  insert.run("Đã đăng chưa slug", "Tóm tắt", "Chữ thuần khác.", 1, "2026-11-02 08:00:00");
  migrateDatabase(db);
  const rows = Object.fromEntries(db.prepare("SELECT * FROM posts").all().map((r) => [r.id, r]));
  const columns = db.prepare("PRAGMA table_info(posts)").all().map((c) => c.name);
  for (const c of ["topic", "origin", "slug", "body_html", "cover_url", "cover_alt", "cover_credit", "source_name", "source_url", "pinned", "cta_level", "cta_goal", "search_text", "revised_at"])
    assert.ok(columns.includes(c), c);
  assert.equal(rows[1].body, "Đoạn một.\n\nĐoạn hai.");
  assert.equal(rows[1].source_name, "Tuổi Trẻ");
  assert.equal(rows[1].source_url, "https://tuoitre.vn/x.htm");
  assert.equal(rows[1].cover_url, "https://cdn.tuoitre.vn/a.jpg");
  assert.equal(rows[1].cover_credit, "Tuổi Trẻ");
  assert.equal(rows[1].slug, "lich-thi-tot-nghiep-2027");
  assert.equal(rows[1].topic, "study");
  assert.equal(rows[1].origin, "manual");
  assert.equal(rows[1].body_html, "");
  assert.equal(rows[1].search_text, "lich thi tot nghiep 2027 tom tat doan mot. doan hai.");
  assert.equal(rows[2].slug, "", "drafts get their slug on first publish");
  assert.equal(rows[2].source_name, "");
  assert.equal(rows[3].slug, "da-dang-chua-slug");
  const before = JSON.stringify(db.prepare("SELECT * FROM posts ORDER BY id").all());
  migrateDatabase(db);
  migrateNews(db);
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM posts ORDER BY id").all()), before);
  assert.throws(() => db.prepare("UPDATE posts SET topic='nope' WHERE id=1").run(), /CHECK/);
  db.prepare("UPDATE posts SET pinned=1 WHERE id=1").run();
  assert.throws(() => db.prepare("UPDATE posts SET pinned=1 WHERE id=3").run(), /UNIQUE/, "at most one pinned post");
});
