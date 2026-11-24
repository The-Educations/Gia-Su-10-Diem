import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crawlLinks, tutorSeoProfile, tutorSitemapIds } from "../server/seo-data.js";

test("tutorSeoProfile normalizes both db rows and /api payloads", () => {
  const map = (id) => ({ toan: "Toán", van: "Văn" }[id] || "");
  // Db row: subjects a JSON string, rating the classRatings object.
  const db = tutorSeoProfile(
    { user_id: 3, name: "Châu", bio: "bio", headline: "h", education: "e", subjects: '["toan","van"]', rating: { average: 4.6, count: 9 }, review_count: 9 },
    map,
  );
  assert.equal(db.subject_name, "Toán");
  assert.deepEqual(db.subjects, ["Toán", "Văn"]);
  assert.equal(db.rating, 4.6);
  assert.equal(db.review_count, 9);
  // API row: subjects already an array, no rating object.
  const api = tutorSeoProfile({ user_id: 5, name: "Nam", subjects: ["van"], rating: 4.2, review_count: 3 }, map);
  assert.deepEqual(api.subjects, ["Văn"]);
  assert.equal(api.rating, 4.2);
  assert.equal(api.review_count, 3);
  assert.equal(tutorSeoProfile(null), null);
  const noRating = tutorSeoProfile({ user_id: 7, name: "X", subjects: "[]" });
  assert.equal(noRating.rating, null);
  assert.equal(noRating.review_count, 0);
});

test("crawlLinks builds one heading+links per list page and fetches lazily", async () => {
  const calls = [];
  const fetch = {
    tutors: async () => { calls.push("tutors"); return [{ user_id: 1, name: "Châu" }, { user_id: 2, name: "Nam" }]; },
    posts: async () => { calls.push("posts"); return [{ id: 4, slug: "bai-viet", title: "Bài viết" }]; },
    community: async () => { calls.push("community"); return [{ id: 9, title: "Hỏi đáp" }]; },
    subjects: async () => { calls.push("subjects"); return [{ id: "toan", name: "Toán" }]; },
  };
  assert.deepEqual(await crawlLinks("/app/tutors", fetch), {
    heading: "Tìm gia sư theo môn học và mục tiêu",
    links: [{ href: "/app/tutors/1", text: "Gia sư Châu" }, { href: "/app/tutors/2", text: "Gia sư Nam" }],
  });
  assert.deepEqual(calls, ["tutors"], "only the tutors source was fetched");
  calls.length = 0;
  const news = await crawlLinks("/app/news", fetch);
  assert.equal(news.links[0].href, "/app/news/4-bai-viet");
  assert.deepEqual(calls, ["posts"]);
  calls.length = 0;
  assert.deepEqual((await crawlLinks("/app/community", fetch)).links, [{ href: "/app/community/9", text: "Hỏi đáp" }]);
  assert.deepEqual(calls, ["community"]);
  calls.length = 0;
  assert.deepEqual((await crawlLinks("/app/library", fetch)).links, [{ href: "/app/tutors?subject=toan", text: "Toán" }]);
  assert.deepEqual(calls, ["subjects"]);
  assert.equal(await crawlLinks("/app/settings", fetch), null);
  assert.deepEqual((await crawlLinks("/app/tutors", {})).links, [], "missing sources yield empty links, not a crash");
});

test("tutorSitemapIds keeps only the profile id", () => {
  assert.deepEqual(tutorSitemapIds([{ user_id: 3, name: "x" }]), [{ user_id: 3 }]);
});

test("the worker drives pageSeo/renderSeo with tutor+crawl like server/index.js", () => {
  const worker = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  for (const source of [worker, server]) {
    assert.match(source, /import \{ crawlLinks, tutorSeoProfile, tutorSitemapIds \} from "\.\.?\/(?:server\/)?seo-data\.js"/, "imports the shared seo-data builders");
    assert.match(source, /pageSeo\([^)]*,\s*tutor\s*\)/, "pageSeo gets the tutor argument");
    assert.match(source, /renderSeo\([\s\S]*?,\s*tutor\s*,\s*crawl\s*\)/, "renderSeo gets tutor+crawl");
    assert.ok(source.includes("tutorSitemapIds(") && source.includes("newsSitemap("), "newsSitemap gets tutor urls");
  }
});
