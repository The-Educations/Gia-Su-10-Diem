import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// /app/sessions is the admin worklist — other roles must not see the raw 403
// error page; Require role="admin" redirects them to their own home.
test("non-admin roles are redirected away from /app/sessions, admins see the worklist", async ({ browser }) => {
  for (const slug of ["student", "chau"]) {
    const page = await (await browser.newContext()).newPage();
    await login(page, slug);
    await page.goto("/app/sessions");
    await page.waitForURL("**/app/workspace", { timeout: 8000 });
    await expect(page).toHaveURL(/\/app\/workspace$/);
    await expect(page.getByText("Tài khoản không có quyền thực hiện thao tác này")).toHaveCount(0);
    await page.close();
  }
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin");
  await admin.goto("/app/sessions");
  await expect(admin).toHaveURL(/\/app\/sessions/);
  await expect(admin.getByRole("heading", { name: "Buổi học" })).toBeVisible();
  await expect(admin.getByText("Tài khoản không có quyền thực hiện thao tác này")).toHaveCount(0);
});
