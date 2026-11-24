import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pageSeo, renderSeo, robots, sitemap, newsSitemap } from "../server/seo.js";

const tutor = {
  user_id: 3, name: "Nguyễn Minh Châu", headline: "Gia sư Toán 5 năm kinh nghiệm",
  bio: "<p>Dạy Toán và Văn THPT tại Hà Nội từ 2019, tập trung nền tảng và luyện thi theo lộ trình rõ ràng cho từng học viên.</p>",
  location: "Hà Nội", mode: "online", rate: 200000, subjects: ["Toán", "Văn"],
  subject_name: "Toán", rating: 4.8, review_count: 12,
};

const ldOf = (html, type) =>
  html.split('<script type="application/ld+json">').slice(1)
    .map((part) => JSON.parse(part.split("</script>")[0]))
    .find((s) => s["@type"] === type);

test("live tutor profiles are indexable with a clean title, description and canonical", () => {
  const seo = pageSeo("/app/tutors/3", null, null, tutor);
  assert.equal(seo.status, 200);
  assert.match(seo.robots, /^index,/);
  assert.equal(seo.canonical, "https://giasudiem10.online/app/tutors/3");
  assert.equal(seo.title, "Gia sư Toán Nguyễn Minh Châu | Gia Sư 10 Điểm");
  assert.ok(seo.title.length <= 60);
  assert.ok(seo.description.length >= 70 && seo.description.length <= 160, seo.description);
  // Missing/unpublished tutors stay exactly as before: a soft noindex page.
  assert.match(pageSeo("/app/tutors/9999").robots, /^noindex,/);
  assert.equal(pageSeo("/app/tutors/9999", null, null, null).canonical, null);
});

test("tutor profile HTML carries a Person/ProfilePage schema with only public fields", () => {
  const html = renderSeo("<head></head><body></body>", "/app/tutors/3", null, null, tutor);
  assert.match(html, /<meta name="theme-color" content="#852f36">/);
  assert.match(html, /<meta name="twitter:title" content="Gia sư Toán/);
  assert.match(html, /<meta name="twitter:description" content="[^"]{70,160}">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/giasudiem10\.online\/assets\/social-preview\.png">/);
  const schema = ldOf(html, "ProfilePage");
  assert.equal(schema.mainEntity["@type"], "Person");
  assert.equal(schema.mainEntity.name, "Nguyễn Minh Châu");
  assert.deepEqual(schema.mainEntity.knowsAbout, ["Toán", "Văn"]);
  assert.equal(schema.mainEntity.aggregateRating.ratingValue, 4.8);
  assert.ok(!html.includes("@demo") && !html.includes("moderation_note"), "no private fields leak");
});

test("sitemap lists published tutor profiles under the 50k cap", () => {
  assert.match(newsSitemap([], [], [{ user_id: 3 }]), /<loc>https:\/\/giasudiem10\.online\/app\/tutors\/3<\/loc>/);
  const many = newsSitemap([], [], Array.from({ length: 60000 }, (_, i) => ({ user_id: i + 1 })));
  assert.ok((many.match(/\/app\/tutors\/\d+/g) || []).length <= 50000);
  // Static pages keep their loc count and carry a real lastmod, not now().
  assert.equal((sitemap.match(/<loc>/g) || []).length, 7);
  assert.match(sitemap, /<lastmod>20\d\d-\d\d-\d\d<\/lastmod>/);
});

test("robots.txt disallows api and private app routes but never the public pages", () => {
  const lines = robots.split("\n");
  for (const line of ["Disallow: /api/", "Disallow: /app/admin", "Disallow: /app/wallet", "Disallow: /app/messages", "Disallow: /app/studio"])
    assert.ok(lines.includes(line), `missing ${line}`);
  for (const line of ["Disallow: /app", "Disallow: /app/tutors", "Disallow: /app/news", "Disallow: /app/community", "Disallow: /assets/"])
    assert.ok(!lines.includes(line), `forbidden ${line}`);
  assert.ok(lines.includes("Allow: /") && lines.includes("Sitemap: https://giasudiem10.online/sitemap.xml"));
});

test("a <noscript> block gives crawlers a heading and real links on the list pages", () => {
  const crawl = { heading: "Tìm gia sư", links: [{ href: "/app/tutors/3", text: 'Gia sư <script>x</script> Châu' }, { href: "/app/tutors/7", text: "Gia sư Nam" }] };
  const html = renderSeo('<head></head><body><div id="root"></div></body>', "/app/tutors", null, null, null, crawl);
  assert.match(html, /<noscript><h1>Tìm gia sư<\/h1>/);
  assert.match(html, /<a href="\/app\/tutors\/7">Gia sư Nam<\/a>/);
  assert.ok(html.indexOf("<noscript>") > html.indexOf('id="root"'), "noscript sits outside the SPA root");
  assert.ok(!html.includes("Gia sư <script>"), "link text is escaped");
  // Pages without crawl data get no noscript block.
  assert.ok(!renderSeo("<head></head><body></body>", "/app/news").includes("<noscript>"));
});

test("landing gets WebSite + Organization + SearchAction schemas; articles get breadcrumbs", () => {
  const landing = renderSeo("<head></head><body></body>", "/");
  assert.equal(ldOf(landing, "WebSite").potentialAction["@type"], "SearchAction");
  assert.match(ldOf(landing, "WebSite").potentialAction.target.urlTemplate, /\/app\/tutors\?q=/);
  assert.equal(ldOf(landing, "Organization").name, "Gia Sư 10 Điểm");
  const post = { id: 1, slug: "a", title: "Bài", summary: "Tóm tắt", published_at: "2026-11-01 00:00:00" };
  const crumbs = ldOf(renderSeo("<head></head><body></body>", "/app/news/1-a", post), "BreadcrumbList");
  assert.equal(crumbs.itemListElement.length, 3);
  assert.equal(crumbs.itemListElement[1].item, "https://giasudiem10.online/app/news");
});

test("seo-pages.json titles fit 60 chars and descriptions fit the 70-160 window", () => {
  const pages = JSON.parse(readFileSync(new URL("../shared/seo-pages.json", import.meta.url), "utf8"));
  for (const [path, p] of Object.entries(pages)) {
    assert.ok(p.title.length <= 60, `${path}: title ${p.title.length} chars`);
    assert.ok(p.description.length >= 70 && p.description.length <= 160, `${path}: description ${p.description.length} chars`);
    const seo = pageSeo(path);
    assert.equal(seo.canonical, `https://giasudiem10.online${path}`, `${path} canonicals to itself regardless of query`);
  }
});
