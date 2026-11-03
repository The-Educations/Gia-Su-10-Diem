import { test, expect } from "@playwright/test";
async function login(page: import("@playwright/test").Page) {
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
}
test("Google Calendar starts real consent directly without an import-instructions dialog", async ({ page }) => {
  await login(page);
  await page.route("**/api/account/google-calendar", route => route.fulfill({ json: { available: true, connected: false } }));
  let connected = 0;
  await page.route("**/api/account/google-calendar/connect", route => { connected++; expect(route.request().method()).toBe("POST"); return route.fulfill({ json: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=test-calendar-consent" } }); });
  await page.route("https://accounts.google.com/**", route => route.fulfill({ body: "Google consent test boundary" }));
  await page.goto("/app/bookings");
  await expect(page.getByRole("button", { name: "Google Calendar", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Google Calendar", exact: true }).click();
  await expect(page).toHaveURL(/accounts.google.com\/o\/oauth2\/v2\/auth/);
  expect(connected).toBe(1);
});
test("connected Calendar offers one-click sync, honest failures and disconnect on mobile", async ({ page }) => {
  await login(page);
  let connected = true, syncs = 0;
  const status = () => ({ available: true, connected, email: "calendar@example.test", lastSynced: Date.now(), error: "", calendarUrl: "https://calendar.google.com/calendar/u/0/r?cid=test" });
  await page.route("**/api/account/google-calendar", route => {
    if (route.request().method() === "DELETE") { connected = false; return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: status() });
  });
  await page.route("**/api/account/google-calendar/sync", route => { syncs++; return route.fulfill({ json: { ...status(), error: "temporary" } }); });
  await page.goto("/app/bookings?calendar=connected");
  await expect(page).not.toHaveURL(/calendar=connected/);
  await page.getByRole("button", { name: "Đồng bộ Google Calendar", exact: true }).click();
  expect(syncs).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Hệ thống sẽ tự thử lại");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole("button", { name: "Cài đặt Google Calendar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("calendar@example.test");
  await expect(page.getByRole("dialog")).toContainText("Các sự kiện đã có trên Google được giữ lại");
  await page.getByRole("button", { name: "Ngắt kết nối", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Google Calendar", exact: true })).toBeEnabled();
});
test("Calendar cancellation stays visible and retry does not disturb course filters", async ({ page }) => {
  await login(page);
  await page.route("**/api/account/google-calendar", route => route.fulfill({ json: { available: true, connected: false } }));
  await page.goto("/app/bookings?calendar_error=cancelled&status=completed&view=list");
  await expect(page.getByRole("alert")).toContainText("Bạn chưa cấp quyền Google Calendar");
  await expect(page).toHaveURL(/status=completed&view=list/);
  await expect(page).not.toHaveURL(/calendar_error/);
  await expect(page.getByRole("button", { name: "Google Calendar", exact: true })).toBeEnabled();
});
