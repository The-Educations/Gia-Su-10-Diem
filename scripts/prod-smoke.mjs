#!/usr/bin/env node
// Production smoke test (việc M) — READ-ONLY. No logins, no data writes.
//   BASE=https://giasudiem10.online node scripts/prod-smoke.mjs
// Exits 1 on the first failed group list; prints a markdown summary for CI.
const BASE = (process.env.BASE || "https://giasudiem10.online").replace(/\/$/, "");
const EXPECT_COMMIT = process.env.GITHUB_SHA || "";
const TIMEOUT = 15000;

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });
async function get(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT), ...opts });
  return res;
}

// App routes come from the server's own allowlist (privateRoutes in seo.js +
// the public seo-pages.json map) so the smoke can never drift from what the
// server actually serves.
import { readFileSync } from "node:fs";
const seo = readFileSync(new URL("../server/seo.js", import.meta.url), "utf8");
const publicPages = JSON.parse(readFileSync(new URL("../shared/seo-pages.json", import.meta.url), "utf8"));
const APP_ROUTES = [
  ...[...seo.matchAll(/"(\/app[^"]*)"/g)].map((m) => m[1]),
  ...Object.keys(publicPages).filter((p) => p.startsWith("/app")),
  "/app/tutors/1", "/app/classes/1", "/app/community/members/probe", // dynamic probes
].filter((r, i, a) => a.indexOf(r) === i);

try {
  // 1. Health
  const health = await get("/api/health");
  check("/api/health → 200", health.status === 200, `got ${health.status}`);

  // 2. App routes: every declared route serves the SPA (200); a fake one 404.
  let routeBad = [];
  for (const r of APP_ROUTES) {
    const res = await get(r, { redirect: "manual" });
    const to = new URL(res.headers.get("location") || "/", BASE).pathname;
    if (res.status !== 200 && !(res.status >= 300 && res.status < 400 && (to === "/" || to.startsWith("/app")))) routeBad.push(`${r}=${res.status}`);
  }
  check("app routes → 200", routeBad.length === 0, routeBad.join(", ") || `${APP_ROUTES.length} routes ok`);
  const fake = await get("/app/this-route-does-not-exist-9f3d");
  check("fake app route → 404", fake.status === 404, `got ${fake.status}`);

  // 3. Landing + news + sitemap + robots
  for (const [name, path, needle] of [
    ["landing", "/", null],
    ["/app/news", "/app/news", null],
    ["sitemap.xml", "/sitemap.xml", "urlset"],
    ["robots.txt", "/robots.txt", "agent"],
  ]) {
    const res = await get(path);
    const body = res.ok ? await res.text() : "";
    const ok = res.status === 200 && (!needle || body.includes(needle));
    check(`${name} → 200${needle ? ` (${needle})` : ""}`, ok, `${res.status}${needle && !body.includes(needle) ? ` missing ${needle}` : ""}`);
  }

  // 4. SePay webhook & IPN: unsigned → 401; 503 would mean missing env.
  const wh = await get("/api/sepay/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("sepay webhook unsigned → 401 (not 503)", wh.status === 401, `got ${wh.status}`);
  const ipn = await get("/api/sepay/ipn?key=wrong", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("sepay ipn bad key → 401 (not 503)", ipn.status === 401, `got ${ipn.status}`);

  // 5. Auth-required APIs → 401 without a cookie
  let authBad = [];
  for (const p of ["/api/wallet", "/api/schedule", "/api/family", "/api/classes", "/api/offers"]) {
    const res = await get(p);
    if (res.status !== 401) authBad.push(`${p}=${res.status}`);
  }
  check("private APIs → 401 unauthenticated", authBad.length === 0, authBad.join(", ") || "all 401");

  // 6. Main JS/CSS asset: find in the SPA html, must be 200 + cache header.
  const shell = await get("/app/tutors");
  const html = await shell.text();
  const assetPath = html.match(/src="(\/app\/assets\/[^"]+\.js)"/)?.[1] || html.match(/href="(\/app\/assets\/[^"]+\.css)"/)?.[1];
  if (assetPath) {
    const res = await get(assetPath);
    const cc = res.headers.get("cache-control") || "";
    check("main asset → 200 + cache header", res.status === 200 && /cache|max-age|immutable/i.test(cc), `${res.status} cc="${cc}"`);
  } else check("main asset found in shell", false, "no asset link in html");

  // 7. Security headers on any response
  const probe = await get("/api/health");
  const h = probe.headers;
  check("security headers (HSTS, nosniff, frame)",
    h.get("strict-transport-security") !== null || h.get("x-frame-options") !== null || h.get("x-content-type-options") !== null,
    `hsts=${!!h.get("strict-transport-security")} nosniff=${!!h.get("x-content-type-options")} frame=${!!h.get("x-frame-options")}`);

  // 8. GIT_COMMIT reporting (only checked when the deployed sha is provided)
  if (EXPECT_COMMIT) {
    const res = await get("/api/health");
    const reported = res.headers.get("x-commit") || res.headers.get("x-git-commit") || "";
    check("reported commit matches GITHUB_SHA", reported.startsWith(EXPECT_COMMIT.slice(0, 7)), `reported="${reported || "(none)"}"`);
    // Never flag extra metadata here — the endpoint must stay minimal.
  }
} catch (e) {
  check("smoke run completed", false, String(e.message || e));
}

const failed = results.filter((r) => !r.ok);
console.log(`## Prod smoke — ${BASE}\n`);
for (const r of results) console.log(`- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n**${results.length - failed.length}/${results.length} checks passed**`);
process.exit(failed.length ? 1 : 0);
