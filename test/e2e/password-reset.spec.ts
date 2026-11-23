import { test, expect, type Page } from "@playwright/test";

// The spec must own its account: resetting the password revokes every session
// of that user, so it must never run against a shared seed account.
async function freshStudent(page: Page) {
  const slug = `reset-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    email = `${slug}@demo.giasu.test`,
    password = "BrowserStudy2026!";
  const registered = await page.request.post("/api/auth/register", {
    data: { name: "Reset Test", email, password },
  });
  expect(registered.status()).toBe(202);
  const message = await (await page.request.get(`/__test/email?email=${email}`)).json();
  const verified = await page.request.post("/api/auth/signup/verify", { data: { code: String(message.code) } });
  expect(verified.ok()).toBe(true);
  return { email, password };
}

async function login(page: Page, email: string, password: string) {
  return page.request.post("/api/auth/login", { data: { email, password } });
}

test("forgot password → emailed link → new password signs in, the old one is dead", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { email, password } = await freshStudent(page);
  expect((await login(page, email, password)).ok()).toBe(true);
  await page.goto("/app/forgot-password");

  await page.locator("#email").fill(email);
  await page.getByRole("button", { name: /Gửi liên kết đặt lại/ }).click();
  await expect(page.getByText(/đã gửi hướng dẫn đặt lại mật khẩu/)).toBeVisible();

  // Pull the real reset link out of the fake mailbox and open it.
  const message = await (await page.request.get(`/__test/email?email=${email}`)).json();
  const url = new URL(message.link);
  await page.goto(url.pathname + url.search);
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu mới" })).toBeVisible();

  await page.locator("#password").fill("NewPass12345");
  await page.locator("#confirm-password").fill("NewPass12345");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByText(/Mật khẩu đã được đổi/)).toBeVisible();

  // The reset killed every earlier session, old password refused, new one works.
  expect((await page.request.get("/api/wallet")).status()).toBe(401);
  expect((await login(page, email, password)).status()).toBe(401);
  expect((await login(page, email, "NewPass12345")).ok()).toBe(true);

  // A used or made-up token shows the invalid-link state.
  await page.goto(url.pathname + url.search);
  await page.locator("#password").fill("NewPass12345");
  await page.locator("#confirm-password").fill("NewPass12345");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page.getByText(/đã hết hạn hoặc đã được sử dụng/)).toBeVisible();

  expect(errors).toEqual([]);
});
