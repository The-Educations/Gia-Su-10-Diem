import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("account settings show one section at a time and only the sections each role needs", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "student");
  await page.goto("/app/settings");
  const nav = page.getByRole("navigation", { name: "Mục cài đặt" });
  await expect(nav.getByRole("button")).toHaveText(["Hồ sơ", "Xác minh học sinh", "Gia đình", "Bảo mật", "Thông báo"]);
  await expect(page.getByLabel("Họ và tên")).toBeVisible();
  await nav.getByRole("button", { name: "Gia đình" }).click();
  await expect(page).toHaveURL(/section=family/);
  await expect(page.getByRole("heading", { name: "Liên kết với phụ huynh" })).toBeVisible();
  await expect(page.getByLabel("Họ và tên")).toHaveCount(0);
  await nav.getByRole("button", { name: "Bảo mật" }).click();
  await expect(page.getByLabel("Mật khẩu mới")).toBeVisible();
  await nav.getByRole("button", { name: "Thông báo" }).click();
  const money = page.getByRole("switch", { name: "Tiền vào số dư và rút tiền" });
  await expect(money).toBeChecked();
  await money.click();
  await expect(money).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Tiền vào số dư và rút tiền" })).not.toBeChecked();
  await page.getByRole("switch", { name: "Tiền vào số dư và rút tiền" }).click();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await login(page, "chau");
  await page.goto("/app/settings?section=verify");
  await expect(nav.getByRole("button")).toHaveText(["Hồ sơ", "Bảo mật", "Thông báo"]);
  await expect(page.getByLabel("Họ và tên")).toBeVisible();
  expect(errors).toEqual([]);
});
