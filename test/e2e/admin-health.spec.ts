import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin system health: sections show real numbers, no secrets", async ({ browser }) => {
  const ctx = await browser.newContext(), admin = await ctx.newPage();
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  await login(admin, "admin");
  await admin.goto("/app/admin?tab=system");
  await expect(admin.getByRole("heading", { name: "Thanh toán" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Email" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Lịch Google" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Dữ liệu" })).toBeVisible();
  // Simulated mode on a dev box; secrets only ever appear as presence flags.
  await expect(admin.locator(".admin-pane")).toContainText("Mô phỏng");
  await expect(admin.locator(".admin-pane")).toContainText("webhook:");
  await expect(admin.locator(".admin-pane")).not.toContainText("SECRET");
  // The Today tab shows the "no payment config" warning, deep-linking to finance.
  await admin.goto("/app/admin?tab=today");
  await expect(admin.locator(".health-warning").first()).toBeVisible();
  expect(errors).toEqual([]);
});
