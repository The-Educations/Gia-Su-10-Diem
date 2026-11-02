import assert from "node:assert/strict";

export async function verifySeo(base) {
  for (const [path, canonical] of [["/", "/"], ["/app/tutors?subject=toan", "/app/tutors"], ["/app/library", "/app/library"], ["/app/news", "/app/news"], ["/app/community", "/app/community"], ["/privacy", "/privacy"], ["/terms", "/terms"]]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(`rel="canonical" href="https://giasudiem10.online${canonical}"`), path);
    assert.match(html, /name="robots" content="index, follow/);
    assert.match(html, /property="og:image"/);
  }
  for (const path of ["/app/auth", "/app/admin", "/app/onboarding", "/app/verify-email", "/app/community/mine"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("x-robots-tag"), /noindex/);
    assert.match(await response.text(), /name="robots" content="noindex/);
  }
  const missingPost = await fetch(base + "/app/community/999999999");
  assert.equal(missingPost.status, 404);
  assert.match(missingPost.headers.get("x-robots-tag"), /noindex/);
  const missing = await fetch(base + "/app/unknown-page");
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("x-robots-tag"), /noindex/);
  assert.match((await fetch(base + "/api/health")).headers.get("x-robots-tag"), /noindex/);
  const map = await fetch(base + "/sitemap.xml");
  assert.equal(map.status, 200);
  assert.match(map.headers.get("content-type"), /xml/);
  assert.ok(((await map.text()).match(/<loc>/g) || []).length >= 7);
  const robots = await fetch(base + "/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Sitemap: https:\/\/giasudiem10.online\/sitemap.xml/);
  const image = await fetch(base + "/assets/social-preview.png");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  console.log("SEO routes passed: canonical public pages, private noindex, 404, sitemap and share image.");
}
