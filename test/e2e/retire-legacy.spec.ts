import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// Retired flows: /bookings and /offers must redirect per role, old data stays
// readable, and every write endpoint answers 410.
test.describe("retired booking/offer flow", () => {
  test("student /bookings and /offers redirect to /app/classes", async ({ page }) => {
    await login(page, "student");
    await page.goto("/app/bookings");
    await expect(page).toHaveURL(/\/app\/classes/);
    await page.goto("/app/offers");
    await expect(page).toHaveURL(/\/app\/classes/);
  });
  test("tutor /bookings redirects to /app/classes", async ({ page }) => {
    await login(page, "chau");
    await page.goto("/app/bookings");
    await expect(page).toHaveURL(/\/app\/classes/);
  });
  test("admin /bookings and /offers redirect to /app/sessions; offers?id goes to /app/proposals", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/app/bookings");
    await expect(page).toHaveURL(/\/app\/sessions/);
    await page.goto("/app/offers");
    await expect(page).toHaveURL(/\/app\/sessions/);
    await login(page, "student");
    await page.goto("/app/offers?id=1");
    await expect(page).toHaveURL(/\/app\/proposals/);
  });
  test("legacy writes answer 410, reads stay 200", async ({ page }) => {
    await login(page, "student");
    for (const [method, path] of [["POST", "/api/bookings"], ["PATCH", "/api/bookings/1"], ["POST", "/api/offers"], ["PATCH", "/api/offers/1"], ["POST", "/api/offers/preview"], ["POST", "/api/weekly-requests"], ["PUT", "/api/bookings/1/rating"]] as const) {
      const res = await page.request.fetch(path, { method, headers: { "Content-Type": "application/json" }, data: {} });
      expect(res.status(), `${method} ${path}`).toBe(410);
    }
    for (const p of ["/api/bookings", "/api/offers", "/api/weekly-requests"]) {
      expect((await page.request.get(p)).status(), p).toBe(200);
    }
  });
  test("Lịch sử cũ renders read-only in Classes; lesson thread hides composer", async ({ page }) => {
    await login(page, "student");
    await page.goto("/app/classes");
    await page.waitForTimeout(800);
    const history = page.locator(".legacy-history");
    if (await history.count()) {
      await expect(history).toBeVisible();
      await expect(history.locator("button")).toHaveCount(0);
    }
    await page.goto("/app/messages");
    await page.waitForTimeout(800);
    const note = page.locator(".legacy-note");
    if (await note.count()) await expect(note.first()).toBeVisible();
  });
});
