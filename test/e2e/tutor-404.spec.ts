import { test, expect } from "@playwright/test";

// Tutor profile error states (việc J): an id with no tutors row is a true
// 404, a profile that exists but is not live gets its own message, and only
// a network failure offers a retry.
test("tutor detail: bad id shows not-found with a find-another link", async ({ page }) => {
  await page.request.post("/api/auth/login", {
    data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" },
  });
  await page.goto("/app/tutors/99999");
  await expect(page.getByText("Không tìm thấy gia sư này.")).toBeVisible();
  const other = page.getByRole("link", { name: "Tìm gia sư khác" });
  await expect(other).toBeVisible();
  await other.click();
  await expect(page).toHaveURL(/\/app\/tutors$/);
});
