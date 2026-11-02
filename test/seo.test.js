import test from "node:test";
import assert from "node:assert/strict";
import { pageSeo, renderSeo, robots, sitemap } from "../server/seo.js";

test("only the public entry and policy pages are indexable and included in the sitemap", () => {
  for (const path of ["/", "/app/tutors", "/app/library", "/privacy", "/terms"]) {
    assert.match(pageSeo(path).robots, /^index,/);
    assert.equal(pageSeo(path).canonical, `https://giasudiem10.online${path}`);
    assert.ok(sitemap.includes(`<loc>https://giasudiem10.online${path}</loc>`));
  }
  assert.equal((sitemap.match(/<loc>/g) || []).length, 5);
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
