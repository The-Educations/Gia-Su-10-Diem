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
    json.rating = { average: 4.8, count: 12, counts: [0,0,0,0,12], reviews: [] };
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
  // The avatar frame is square and the photo fills it (no grey gap below).
  const fills = await page.evaluate(() => {
    const person = document.querySelector(".hero-on-cover .person") as HTMLElement,
      img = person?.querySelector("img"),
      b = person?.getBoundingClientRect();
    return !!b && Math.abs(b.width - b.height) <= 2 && (!img || getComputedStyle(img).objectFit === "cover");
  });
  expect(fills).toBe(true);
  // Rating lives once: a single star link in the identity rail, none in the
  // booking card, and it deep-links to the Reviews section.
  await expect(page.locator(".tutor-aside .rating-link")).toHaveCount(1);
  await expect(page.locator(".tutor-aside .rating-link")).toHaveAttribute("href", "#reviews");
  // The trust chip must not repeat the same state next to the rating link.
  await expect(page.locator(".profile-meta .trust-score")).toHaveCount(0);
  await expect(page.locator(".booking-card")).not.toContainText("đánh giá");
  await expect(page.locator("#reviews")).toBeVisible();
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
