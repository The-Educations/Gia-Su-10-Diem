import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// Public tutor profile: the identity column holds cover, hero and the sticky
// booking card; every section scrolls in the wider right column. Screenshots
// cover desktop/mobile in both languages for visual review.
const BANNER = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a3046"/><stop offset="1" stop-color="#c98a4b"/></linearGradient></defs><rect width="800" height="200" fill="url(#g)"/></svg>');

test("tutor profile: two-column layout on desktop, stacked on mobile, vi + en", async ({ page }) => {
  await login(page);
  // Give the demo tutor a cover and admin approval so the hero-on-cover
  // overlap and the approved badge render like a real approved profile.
  await page.route("**/api/tutors/3", async (route) => {
    const res = await route.fetch(), json = await res.json();
    json.banner_url = BANNER; json.demo = 0;
    return route.fulfill({ response: res, json });
  });
  await page.goto("/app/tutors/3");
  const split = page.locator(".tutor-presentation.tutor-split");
  await expect(split).toBeVisible();
  await expect(page.locator(".tutor-aside .booking-card")).toBeVisible();
  await expect(page.locator(".tutor-body").first()).toBeVisible();
  await expect(page.locator(".hero-on-cover")).toBeVisible();
  await expect(page.locator(".approved-badge")).toBeVisible();
  // Facebook-style: the avatar's top edge sits above the cover's bottom edge.
  const overlap = await page.evaluate(() => {
    const person = document.querySelector(".hero-on-cover .person"), cover = document.querySelector(".tutor-cover");
    return person && cover && person.getBoundingClientRect().top < cover.getBoundingClientRect().bottom;
  });
  expect(overlap).toBe(true);
  for (const [width, lang] of [[1440, "vi"], [390, "vi"], [1440, "en"], [390, "en"]] as const) {
    await page.addInitScript((l) => localStorage.setItem("giasu.lang", l), lang);
    await page.reload();
    await page.setViewportSize({ width, height: 900 });
    await expect(split).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/tutor-profile-${lang}-${width}.png`, fullPage: true });
  }
});
