import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// Public tutor profile: the identity column holds cover, hero and the sticky
// booking card; every section scrolls in the wider right column. Screenshots
// cover desktop/mobile in both languages for visual review.
test("tutor profile: two-column layout on desktop, stacked on mobile, vi + en", async ({ page }) => {
  await login(page);
  await page.goto("/app/tutors/3");
  const split = page.locator(".tutor-presentation.tutor-split");
  await expect(split).toBeVisible();
  await expect(page.locator(".tutor-aside .booking-card")).toBeVisible();
  await expect(page.locator(".tutor-body").first()).toBeVisible();
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
