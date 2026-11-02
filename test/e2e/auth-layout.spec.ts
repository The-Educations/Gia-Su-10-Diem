import { test, expect } from "@playwright/test";

test("illustrated login stays usable across desktop, mobile, email and registration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  await page.goto("/app/auth?next=%2Fcommunity%2Fwrite");
  await expect(
    page.getByRole("heading", { name: "Chào mừng bạn." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Tiếp tục với Google" }),
  ).toHaveAttribute("href", "/api/auth/google/start?next=%2Fcommunity%2Fwrite");
  await expect(page.locator("#desktop-navigation")).not.toBeVisible();
  const art = page.locator(".auth-illustration img");
  await expect(art).toBeVisible();
  await expect
    .poll(() =>
      art.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Dùng email và mật khẩu" }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByLabel("Email", { exact: true }).fill("reader@example.test");
  await page.getByRole("tab", { name: "Tạo tài khoản", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Tạo tài khoản", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Xác nhận mật khẩu", { exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe("/community/write");
  await expect(
    page
      .locator(".auth-policy")
      .getByRole("link", { name: "Chính sách quyền riêng tư" }),
  ).toHaveAttribute("href", "/privacy");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Tìm gia sư", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/tutors$/);
  await expect(
    page.getByRole("button", { name: "Mở điều hướng" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
