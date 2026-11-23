import test from "node:test";
import assert from "node:assert/strict";
import { pageSeo, renderSeo, robots, sitemap, newsSitemap, newsPath } from "../server/seo.js";

test("only the public entry and policy pages are indexable and included in the sitemap", () => {
  for (const path of ["/", "/app/tutors", "/app/library", "/privacy", "/terms", "/app/news", "/app/community"]) {
    assert.match(pageSeo(path).robots, /^index,/);
    assert.equal(pageSeo(path).canonical, `https://giasudiem10.online${path}`);
    assert.ok(sitemap.includes(`<loc>https://giasudiem10.online${path}</loc>`));
  }
  assert.equal((sitemap.match(/<loc>/g) || []).length, 7);
  for (const path of ["/app/auth", "/app/onboarding", "/app/admin", "/app/workspace", "/app/messages", "/app/settings", "/app/studio", "/app/bookings", "/app/sessions", "/app/calendar", "/app/offers", "/app/favorites", "/app/tutors/3"]) {
    assert.match(pageSeo(path).robots, /^noindex,/);
    assert.equal(pageSeo(path).canonical, null);
    assert.equal(pageSeo(path).status, 200);
    assert.ok(!sitemap.includes(`<loc>https://giasudiem10.online${path}</loc>`));
  }
  assert.match(robots, /Sitemap: https:\/\/giasudiem10.online\/sitemap.xml/);
  assert.ok(!robots.includes("Disallow: /app"), "Google must be able to read noindex and render public pages");
});

test("unknown paths are real 404s and untrusted path text is never injected", () => {
  for (const path of ["/app/typo", "/app/tutors/<script>alert(1)</script>", "/index.html", "/constructor", "/toString"]) {
    assert.equal(pageSeo(path).status, 404);
    assert.match(pageSeo(path).robots, /^noindex,/);
    assert.ok(!renderSeo("<head></head>", path).includes("alert(1)"));
  }
});

test("metadata is delivered in HTML once, with valid website schema and escaped text", () => {
  const original = '<html><head><title>Old</title><meta name="description" content="Old"></head><body>Visible content</body></html>';
  const html = renderSeo(renderSeo(original, "/"), "/app/library");
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/name="description"/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes("Visible content"));
  assert.ok(!html.includes("application/ld+json"));
  assert.match(html, /og:image/);
  const landing = renderSeo(original, "/");
  const schema = JSON.parse(landing.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema["@type"], "WebSite");
  assert.equal(schema.url, "https://giasudiem10.online/");
  const privatePage = renderSeo(landing, "/app/admin");
  assert.match(privatePage, /noindex, follow/);
  assert.ok(!privatePage.includes('rel="canonical"'));
  assert.ok(!privatePage.includes('property="og:'));
});

 test("published news gets escaped metadata and drafts stay unindexable", () => {
  const post = { id: 12, title: '<script>alert("x")</script>', summary: 'A "quote" & text' };
  assert.equal(pageSeo("/app/news/12", post).status, 200);
  assert.match(pageSeo("/app/news/12", post).robots, /^index,/);
  assert.equal(pageSeo("/app/news/12").status, 404);
  assert.match(pageSeo("/app/news/12").robots, /^noindex,/);
  assert.ok(!renderSeo("<head></head>", "/app/news/12", post).includes('<script>alert'));
  assert.match(newsSitemap([post]), /\/app\/news\/12<\/loc>/);
});

test("community metadata and schema escape content and use only public names", () => {
  const post = { id: 8, title: 'Học <tốt>', body: 'Nội dung </script><script>alert(1)</script>', author: { name_part: "Minh" }, published_at: "2026-11-02 10:00:00", updated_at: "2026-11-02 10:00:00" };
  const html=renderSeo("<head></head>","/app/community/8",null,post);
  assert.match(html,/Học &lt;tốt&gt;/);
  assert.equal(pageSeo("/app/community/8",null,post).status,200);
  assert.equal(pageSeo("/app/community/8").status,404);
  assert.match(pageSeo("/app/community/8").robots,/noindex/);
  assert.ok(!html.includes('</script><script>alert'));
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(schema["@type"],"DiscussionForumPosting");
  assert.deepEqual(schema.author,{"@type":"Person",name:"Minh"});
  assert.match(newsSitemap([], [post]),/\/app\/community\/8<\/loc>/);
});

test("member profiles never emit indexable metadata or image/schema identities", () => {
  const path = "/app/community/members/k7x2m9qa";
  assert.equal(pageSeo(path).status, 200);
  assert.match(pageSeo(path).robots, /^noindex/);
  const html = renderSeo(renderSeo("<head></head>", "/"), path);
  assert.ok(!html.includes("og:image")); assert.ok(!html.includes("application/ld+json"));
  assert.ok(!newsSitemap([], []).includes("/members/"));
});

const article = {
  id: 12, slug: "lich-thi-2027", title: "Lịch thi 2027", summary: "Bộ GD công bố lịch thi.",
  cover_url: "", cover_alt: "", published_at: "2026-11-23 08:00:00", updated_at: "2026-11-23 09:00:00", revised_at: null,
};
const ldOf = (html) => html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];

test("news URLs carry the slug: the old id-only link and wrong slugs get a 301 to the canonical path", () => {
  assert.equal(pageSeo("/app/news/12-lich-thi-2027", article).status, 200);
  assert.equal(pageSeo("/app/news/12-lich-thi-2027", article).canonical, "https://giasudiem10.online/app/news/12-lich-thi-2027");
  for (const path of ["/app/news/12", "/app/news/12-sai-slug", "/app/news/12-"]) {
    const seo = pageSeo(path, article);
    assert.equal(seo.status, 301, path);
    assert.equal(seo.redirect, "/app/news/12-lich-thi-2027", path);
  }
  assert.equal(pageSeo("/app/news/12", { ...article, slug: "" }).status, 200, "a post without a slug keeps the id-only path");
  assert.equal(pageSeo("/app/news/12-lich-thi-2027").status, 404, "missing or draft post");
  assert.match(pageSeo("/app/news/12-lich-thi-2027").robots, /^noindex/);
  assert.equal(pageSeo("/app/news/12-Lich").status, 404, "uppercase slugs never match");
  assert.equal(newsPath({ id: 7, slug: "a-b" }), "/app/news/7-a-b");
  assert.equal(newsPath({ id: 7, slug: "bad slug<>" }), "/app/news/7-badslug");
});

test("news article metadata: og:article, absolute image, dates, and a NewsArticle schema that cannot break out", () => {
  const html = renderSeo("<head></head>", "/app/news/12-lich-thi-2027", { ...article, cover_url: "/api/news/images/0b9a7c3e-1d2f-4a5b-8c6d-7e8f9a0b1c2d", cover_alt: 'Ảnh "bìa"' });
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /property="og:image" content="https:\/\/giasudiem10\.online\/api\/news\/images\/0b9a7c3e-1d2f-4a5b-8c6d-7e8f9a0b1c2d"/);
  assert.match(html, /property="og:image:alt" content="Ảnh &quot;bìa&quot;"/);
  assert.match(html, /property="article:published_time" content="2026-11-23T08:00:00Z"/);
  assert.match(html, /property="article:modified_time" content="2026-11-23T08:00:00Z"/);
  const schema = JSON.parse(ldOf(html));
  assert.equal(schema["@type"], "NewsArticle");
  assert.equal(schema.headline, "Lịch thi 2027");
  assert.equal(schema.datePublished, "2026-11-23T08:00:00Z");
  assert.deepEqual(schema.image, ["https://giasudiem10.online/api/news/images/0b9a7c3e-1d2f-4a5b-8c6d-7e8f9a0b1c2d"]);
  assert.equal(schema.publisher.name, "Gia Sư 10 Điểm");
  const hotlinked = renderSeo("<head></head>", "/app/news/12-lich-thi-2027", { ...article, cover_url: "https://cdn.tuoitre.vn/a.jpg" });
  assert.match(hotlinked, /property="og:image" content="https:\/\/cdn\.tuoitre\.vn\/a\.jpg"/);
  const plain = renderSeo("<head></head>", "/app/news/12-lich-thi-2027", article);
  assert.match(plain, /og:image" content="https:\/\/giasudiem10\.online\/assets\/social-preview\.png"/, "falls back to the site image");
  assert.match(renderSeo("<head></head>", "/app/news/12-lich-thi-2027", { ...article, revised_at: "2026-11-24 10:00:00" }), /article:modified_time" content="2026-11-24T10:00:00Z"/);
  const hostile = renderSeo("<head></head>", "/app/news/12-lich-thi-2027", { ...article, title: 'Tiêu "đề" </script><script>alert(1)</script>', summary: '</script><b>"x"' });
  assert.ok(!hostile.includes("</script><script>alert"));
  assert.equal((hostile.match(/<script/g) || []).length, 1, "only the schema script exists");
  assert.equal(JSON.parse(ldOf(hostile)).headline, 'Tiêu "đề" </script><script>alert(1)</script>');
});

test("sitemap lists canonical news URLs with lastmod from the latest revision", () => {
  const map = newsSitemap([article, { ...article, id: 13, slug: "", revised_at: "2026-12-01 01:02:03" }]);
  assert.match(map, /<loc>https:\/\/giasudiem10\.online\/app\/news\/12-lich-thi-2027<\/loc><lastmod>2026-11-23T08:00:00Z<\/lastmod>/);
  assert.match(map, /<loc>https:\/\/giasudiem10\.online\/app\/news\/13<\/loc><lastmod>2026-12-01T01:02:03Z<\/lastmod>/);
});

test("every route in app/src/main.tsx answers 200, so a new route can never be forgotten", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../app/src/main.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/<Route[^>]*path="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 20, "the route table was parsed");
  const article = { id: 1, slug: "bai-viet", title: "Bài viết", summary: "Tóm tắt", published_at: "2026-11-01 00:00:00", cover_url: "" };
  const community = { id: 1, title: "Bài cộng đồng", body: "Nội dung", author: { name_part: "A" }, published_at: "2026-11-01 00:00:00", updated_at: "2026-11-01 00:00:00" };
  for (const raw of paths) {
    if (raw === "*") continue; // catch-all: unknown paths must stay 404 (see the test above)
    const concrete = ("/app" + (raw === "/" ? "" : raw)).replace(/:(\w+)\??/g, (_, name) => name === "idSlug" ? "1-bai-viet" : name === "code" ? "abc" : "1").replace(/\?/g, "");
    assert.equal(pageSeo(concrete, article, community).status, 200, `${raw} (${concrete}) returns "Không tìm thấy trang"`);
  }
});
