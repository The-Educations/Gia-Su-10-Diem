import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, slug: string, password = "BrowserStudy2026!") {
  return page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password } });
}

test("forgot password → emailed link → new password signs in, the old one is dead", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "student");
  await page.goto("/app/forgot-password");

  await page.locator("#email").fill("student@demo.giasu.test");
  await page.getByRole("button", { name: /Gửi liên kết đặt lại/ }).click();
  await expect(page.getByText(/đã gửi hướng dẫn đặt lại mật khẩu/)).toBeVisible();

  // Pull the real reset link out of the fake mailbox and open it.
  const message = await (await page.request.get("/__test/email?email=student@demo.giasu.test")).json();
  const url = new URL(message.link);
  await page.goto(url.pathname + url.search);
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu mới" })).toBeVisible();

  await page.locator("#password").fill("NewPass12345");
  await page.locator("#confirm-password").fill("NewPass12345");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByText(/Mật khẩu đã được đổi/)).toBeVisible();

  // The reset killed every earlier session, old password refused, new one works.
  expect((await page.request.get("/api/wallet")).status()).toBe(401);
  expect((await login(page, "student")).status()).toBe(401);
  expect((await login(page, "student", "NewPass12345")).ok()).toBe(true);

  // A used or made-up token shows the invalid-link state.
  await page.goto(url.pathname + url.search);
  await page.locator("#password").fill("NewPass12345");
  await page.locator("#confirm-password").fill("NewPass12345");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByText(/đã hết hạn hoặc đã được sử dụng/)).toBeVisible();

  expect(errors).toEqual([]);
});
