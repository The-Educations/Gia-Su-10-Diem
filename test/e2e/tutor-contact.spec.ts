import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}

test("student matches free hours and contacts a tutor without creating a booking", async ({ browser, page }) => {
  const tc = await browser.newContext(), tutor = await tc.newPage();
  await login(tutor, "chau");
  const original = await (await tutor.request.get("/api/tutor/profile")).json();
  const blocks = [{ weekday: 0, hour: 19 }, { weekday: 2, hour: 19 }];
  expect((await tutor.request.put("/api/tutor/availability", { data: { revision: original.weekly_schedule.revision, blocks } })).ok()).toBe(true);
  await login(page, "student");
  const saved = await (await page.request.get("/api/account/availability")).json();
  expect((await page.request.put("/api/account/availability", { data: { revision: saved.revision, blocks } })).ok()).toBe(true);
  await page.goto("/app/tutors");
  await page.getByRole("button", { name: "Trùng lịch rảnh của tôi", exact: true }).click();
  await expect(page.locator(".tutor-card")).toHaveCount(1);
  await expect(page.locator(".tutor-card")).toContainText("Trùng 2 giờ / tuần");
  await page.getByRole("link", { name: "Xem hồ sơ", exact: true }).click();
  const calendar = page.locator(".weekly-booking-panel");
  await expect(calendar.getByRole("heading", { name: "Liên hệ gia sư" })).toBeVisible();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(calendar.locator("tbody tr")).toHaveCount(1);
  await expect(calendar.locator("tbody button")).toHaveCount(2);
  await expect(calendar.getByRole("button", { name: "Thứ 3, 19:00–20:00", exact: true })).toHaveCount(0);
  await calendar.locator("tbody button").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(calendar.locator("tbody button").last()).toBeFocused();
  for (const day of ["Thứ 2", "Thứ 4"]) {
    const cell = calendar.getByRole("button", { name: `${day}, 19:00–20:00, trùng lịch của bạn`, exact: true });
    await cell.focus(); await page.keyboard.press("Space");
    await expect(cell).toHaveAttribute("aria-pressed", "true");
  }
  await calendar.getByLabel("Lời nhắn của bạn").fill("Ôn Toán theo lịch tuần");
  await calendar.getByRole("button", { name: "Gửi lời nhắn", exact: true }).click();
  await expect(page).toHaveURL(/messages\?inquiry=/);
  await expect(page.getByText(/Giờ muốn trao đổi.*Thứ 2 19:00/)).toBeVisible();
  expect(await (await page.request.get("/api/weekly-requests")).json()).toEqual([]);
  const inquiry = new URL(page.url()).searchParams.get("inquiry");
  await tutor.goto(`/app/messages?inquiry=${inquiry}`);
  await tutor.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Mình bắt đầu tuần tới nhé.");
  await tutor.getByRole("button", { name: "Gửi", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Mình bắt đầu tuần tới nhé.", { exact: true })).toBeVisible();
  const current = await (await tutor.request.get("/api/tutor/profile")).json();
  await tutor.request.put("/api/tutor/availability", { data: { revision: current.weekly_schedule.revision, blocks: original.weekly_schedule.blocks } });
  await page.request.put("/api/account/availability", { data: { revision: saved.revision + 1, blocks: saved.blocks } });
  await tc.close();
});
