import { test, expect } from "@playwright/test";

test("search metadata is present without JavaScript and follows app navigation", async ({ page, request }) => {
  for (const path of ["/", "/app/tutors", "/app/library", "/privacy", "/terms"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`rel="canonical" href="https://giasudiem10.online${path}"`);
  }
  const missing = await request.get("/app/missing-page");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["x-robots-tag"]).toContain("noindex");
  await page.goto("/app/tutors?subject=toan");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://giasudiem10.online/app/tutors");
  await page.locator(".sidebar").getByRole("link", { name: "Môn học & kỳ thi" }).click();
  await expect(page).toHaveTitle("Môn học và kỳ thi | Gia Sư 10 Điểm");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://giasudiem10.online/app/library");
  await page.locator(".sidebar").getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await page.locator(".sidebar").getByRole("link", { name: "Tìm gia sư", exact: true }).click();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow, max-image-preview:large");
});


test("policies are readable without signing in and linked before Google consent", async ({ page }) => {
  await page.goto("/app/auth?mode=register");
  await expect(page.locator(".auth-policy").getByRole("link", { name: "Chính sách quyền riêng tư" })).toHaveAttribute("href", "/privacy");
  await expect(page.locator(".auth-policy").getByRole("link", { name: "Điều khoản dịch vụ" })).toHaveAttribute("href", "/terms");
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: "contact@giasudiem10.online", exact: true }).first()).toHaveAttribute("href", "mailto:contact@giasudiem10.online");
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
