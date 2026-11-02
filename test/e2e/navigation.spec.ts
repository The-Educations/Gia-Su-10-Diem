import { test, expect } from "@playwright/test";

test("desktop collapse persists and mobile navigation stays expanded", async ({ page }) => {
  await page.goto("/app/tutors");
  const sidebar = page.getByRole("complementary", { name: "Thanh điều hướng" });
  const toggle = page.getByRole("button", { name: "Thu gọn thanh điều hướng" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Mở rộng thanh điều hướng" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => sidebar.evaluate(e => e.getBoundingClientRect().width)).toBe(76);
  await sidebar.getByRole("link", { name: "Môn học & kỳ thi" }).click();
  await expect(page).toHaveURL(/library$/);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "76px");
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(sidebar).not.toBeVisible();
  const menu = page.getByRole("button", { name: "Mở điều hướng" });
  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Môn học & kỳ thi", { exact: true })).toBeVisible();
  expect(await drawer.getByText("Môn học & kỳ thi", { exact: true }).evaluate(e => getComputedStyle(e).opacity)).toBe("1");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole("link", { name: "Môn học & kỳ thi" }).click();
  await expect(drawer).not.toBeVisible();
  await menu.click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(drawer).not.toBeVisible();
  await expect(sidebar).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();
  await expect(sidebar).toHaveCSS("width", "216px");
  expect(await sidebar.evaluate(e => parseFloat(getComputedStyle(e).transitionDuration))).toBeLessThan(0.01);
});

test("public app pages fit small phones, tablets and desktops", async ({ page }) => {
  for (const path of ["/app/tutors", "/app/library", "/app/auth?mode=register"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (path === "/app/tutors") await expect(page.getByRole("combobox", { name: "Sắp xếp", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
