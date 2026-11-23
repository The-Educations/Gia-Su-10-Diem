import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("admins review school records in their own tab: zoom, ask for more, verify, withdraw", async ({ browser }) => {
  const sc = await browser.newContext(), ac = await browser.newContext();
  const student = await sc.newPage(), admin = await ac.newPage();
  const errors: string[] = []; for (const p of [student, admin]) p.on("pageerror", (e) => errors.push(e.message));
  const email = "profile-student@demo.giasu.test";
  expect((await student.request.post("/api/auth/login", { data: { email, password: "BrowserStudy2026!" } })).ok()).toBe(true);
  const name = (await (await student.request.get("/api/auth/me")).json()).user?.name as string;
  const png = await sharp({ create: { width: 600, height: 420, channels: 3, background: "#eef2ea" } }).png().toBuffer();
  expect((await student.request.post("/api/account/verification/files", { headers: { "Content-Type": "image/png" }, data: png })).ok()).toBe(true);
  expect((await student.request.put("/api/account/verification", { data: { school: "THCS Nguyễn Du", grade: "Lớp 9", student_code: `HB${Date.now()}` } })).ok()).toBe(true);

  expect((await admin.request.post("/api/auth/login", { data: { email: "admin@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  await admin.goto("/app/admin");
  await admin.getByRole("tab", { name: /^Học sinh \(\d+\)$/ }).click();
  const card = admin.locator(".student-checks li").filter({ hasText: email });
  await expect(card).toContainText("THCS Nguyễn Du · Lớp 9");
  await card.getByRole("button", { name: /Phóng to học bạ 1/ }).click();
  await expect(admin.getByRole("dialog").getByRole("img", { name: `Học bạ của ${name}` })).toBeVisible();
  await admin.keyboard.press("Escape");

  await card.getByRole("button", { name: "Yêu cầu bổ sung" }).click();
  await admin.getByRole("dialog").getByLabel("Lý do").fill("Ảnh mờ, chụp lại trang có tên");
  await admin.getByRole("button", { name: "Gửi cho học sinh" }).click();
  await admin.getByRole("button", { name: /^Cần bổ sung/ }).click();
  await expect(card).toContainText("Ảnh mờ, chụp lại trang có tên");
  await card.getByRole("button", { name: "Khớp, xác minh" }).click();
  await admin.getByRole("button", { name: /^Đã xác minh/ }).click();
  await expect(card.locator(".student-check-state")).toHaveText("Đã xác minh");
  expect((await (await student.request.get("/api/account/verification")).json()).status).toBe("approved");
  await card.getByRole("button", { name: "Thu hồi xác minh" }).click();
  await admin.getByRole("dialog").getByLabel("Lý do").fill("Mã học sinh không khớp");
  await admin.getByRole("button", { name: "Gửi cho học sinh" }).click();
  await expect(admin.locator(".student-checks li").filter({ hasText: email })).toHaveCount(0);
  expect((await (await student.request.get("/api/account/verification")).json()).status).toBe("rejected");
  for (const width of [390, 1280]) {
    await admin.setViewportSize({ width, height: 900 });
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  await sc.close(); await ac.close();
});
