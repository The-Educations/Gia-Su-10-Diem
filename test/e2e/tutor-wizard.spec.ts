import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("the tutor profile asks one question per screen, jumps to what is missing and previews proof files", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  expect((await page.request.post("/api/auth/login", { data: { email: "chau@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  // Pretend the weekly free hours are still empty (and the rest complete).
  await page.route("**/api/tutor/profile", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch(), profile = await response.json();
    await route.fulfill({ response, json: { ...profile, mode: "online", weekly_schedule: { ...profile.weekly_schedule, blocks: [] } } });
  });
  await page.goto("/app/studio");
  await expect(page.getByRole("heading", { name: "Bạn đang là ai?" })).toBeVisible();
  await page.getByRole("button", { name: "Còn 1 mục chưa xong" }).click();
  await expect(page).toHaveURL(/step=schedule/);
  await expect(page.getByRole("heading", { name: "Khi nào bạn rảnh?" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest(".availability-grid"))).toBe(true);
  await page.getByRole("button", { name: "Thứ 2, 18:00–19:00", exact: true }).click();
  await expect(page.getByText("Đã đủ thông tin")).toBeVisible();

  // The progress bar names each step; proof files show before they are sent.
  await page.getByRole("button", { name: /^Học vấn & minh chứng/ }).click();
  await expect(page.getByRole("heading", { name: "Bạn học ở đâu?" })).toBeVisible();
  await page.getByRole("button", { name: "Thêm trường", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const png = await sharp({ create: { width: 200, height: 140, channels: 3, background: "#f5f0e6" } }).png().toBuffer();
  await dialog.locator('input[type="file"]').setInputFiles([{ name: "the-sinh-vien.png", mimeType: "image/png", buffer: png }, { name: "bang-diem.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }]);
  await expect(dialog.getByRole("img", { name: "the-sinh-vien.png" })).toBeVisible();
  await expect(dialog.locator(".proof-pdf")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Bỏ bang-diem.pdf" }).click();
  await expect(dialog.locator(".proof-previews li")).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /^Xem lại & gửi duyệt/ }).click();
  await expect(page.getByRole("heading", { name: "Học sinh sẽ thấy hồ sơ như thế này" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Xem trước hồ sơ" }).locator(".tutor-presentation")).toBeVisible();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
