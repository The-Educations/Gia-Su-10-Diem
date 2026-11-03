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
  await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
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
  await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
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

test("account entry requires explicit consent for Google, email login and signup", async ({ page }) => {
  await page.route("**/api/auth/providers", route => route.fulfill({ json: { google: true } }));
  let loginRequests = 0, signupRequests = 0;
  await page.route("**/api/auth/login", route => {
    loginRequests++;
    return route.fulfill({ status: 401, json: { error: "Email hoặc mật khẩu chưa đúng." } });
  });
  await page.route("**/api/auth/register", route => {
    signupRequests++;
    return route.fulfill({ status: 503, json: { error: "Chưa gửi được mã xác minh." } });
  });
  await page.goto("/app/auth?mode=login&next=%2Fmessages");
  const consent = page.getByRole("checkbox", { name: /Đồng ý/ });
  const google = page.getByRole("link", { name: "Tiếp tục với Google" });
  const login = page.getByRole("button", { name: "Đăng nhập", exact: true });
  await expect(consent).not.toBeChecked();
  await expect(google).toBeDisabled();
  await expect(google).not.toHaveAttribute("href");
  await expect(login).toBeDisabled();
  await page.getByLabel("Email", { exact: true }).fill("reader@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Mật khẩu", { exact: true }).press("Enter");
  expect(loginRequests).toBe(0);
  // Opening a policy must neither lose the form nor implicitly check consent.
  const popup = page.waitForEvent("popup");
  await page.locator(".auth-consent").getByRole("link", { name: "Điều khoản dịch vụ" }).click();
  const terms = await popup;
  await expect(terms.locator("h1")).toBeVisible();
  await terms.close();
  await expect(consent).not.toBeChecked();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("reader@example.test");
  await consent.focus();
  await page.keyboard.press("Space");
  await expect(google).toHaveAttribute("href", "/api/auth/google/start?next=%2Fmessages");
  await login.click();
  await expect(page.getByRole("alert")).toContainText("Email hoặc mật khẩu chưa đúng");
  expect(loginRequests).toBe(1);
  await page.getByRole("tab", { name: "Tạo tài khoản", exact: true }).click();
  await consent.uncheck();
  const signup = page.getByRole("button", { name: "Gửi mã xác minh", exact: true });
  await expect(signup).toBeDisabled();
  await expect(google).not.toHaveAttribute("href");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Bạn học mới");
  await page.getByLabel("Email", { exact: true }).fill("reader@example.test");
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).press("Enter");
  expect(signupRequests).toBe(0);
  await consent.check();
  await signup.click();
  await expect(page.getByRole("alert")).toContainText("Chưa gửi được mã xác minh");
  expect(signupRequests).toBe(1);
  await page.reload();
  await expect(consent).not.toBeChecked();
  await expect(signup).toBeDisabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    await expect(consent).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const label = page.locator('.auth-consent label');
    expect(await label.evaluate(el => el.getBoundingClientRect().height - 22)).toBeLessThan(25);
  }
  await page.route("**/api/auth/google/start?**", route => route.fulfill({ contentType: "text/html", body: "Google sign-in started" }));
  await consent.check();
  await google.click();
  await expect(page).toHaveURL(/\/api\/auth\/google\/start\?next=%2Fmessages$/);
});
