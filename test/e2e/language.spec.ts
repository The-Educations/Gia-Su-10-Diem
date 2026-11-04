import { test, expect } from "@playwright/test";

test("language switch changes the shell, persists after reload and defaults to Vietnamese", async ({ page }) => {
  await page.goto("/app/tutors");
  const sidebar = page.getByRole("complementary", { name: "Thanh điều hướng" });
  const language = page.getByRole("group", { name: "Ngôn ngữ" });
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(language.getByRole("button", { name: "Tiếng Việt" })).toHaveAttribute("aria-pressed", "true");
  await expect(sidebar.getByRole("link", { name: "Tìm môn học" })).toBeVisible();

  await language.getByRole("button", { name: "Tiếng Anh" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("complementary", { name: "Navigation bar" }).getByRole("link", { name: "Find subjects" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Find tutors" }).first()).toBeVisible();

  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "Vietnamese" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page.getByRole("complementary", { name: "Thanh điều hướng" }).getByRole("link", { name: "Tìm gia sư" })).toBeVisible();
});

test("language switch fits the top bar at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/app/tutors");
  const language = page.getByRole("group", { name: "Ngôn ngữ" });
  await expect(language).toBeVisible();
  const box = await language.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
