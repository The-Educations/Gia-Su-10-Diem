import test from "node:test";
import assert from "node:assert/strict";
import { pageSeo, renderSeo, robots, sitemap, newsSitemap } from "../server/seo.js";

test("only the public entry and policy pages are indexable and included in the sitemap", () => {
  for (const path of ["/", "/app/tutors", "/app/library", "/privacy", "/terms", "/app/news", "/app/community"]) {
    assert.match(pageSeo(path).robots, /^index,/);
    assert.equal(pageSeo(path).canonical, `https://giasudiem10.online${path}`);
    assert.ok(sitemap.includes(`<loc>https://giasudiem10.online${path}</loc>`));
  }
  assert.equal((sitemap.match(/<loc>/g) || []).length, 7);
  for (const path of ["/app/auth", "/app/onboarding", "/app/admin", "/app/workspace", "/app/messages", "/app/settings", "/app/studio", "/app/bookings", "/app/favorites", "/app/tutors/3"]) {
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
