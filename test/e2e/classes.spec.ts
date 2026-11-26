import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("an accepted offer opens a class with lessons on the calendar, materials and confirmation", async ({ browser }) => {
  const sc = await browser.newContext(), tc = await browser.newContext();
  const student = await sc.newPage(), tutor = await tc.newPage();
  const errors: string[] = [];
  for (const p of [student, tutor]) p.on("pageerror", (e) => errors.push(e.message));
  await login(student, "profile-other"); await login(tutor, "nam");
  const nam = await (await tutor.request.get("/api/tutor/profile")).json();
  const dep = await (await student.request.post("/api/wallet/deposits", { data: { amount: 2000000 } })).json();
  expect((await student.request.post(`/api/wallet/deposits/${dep.id}/simulate`, { data: {} })).ok()).toBe(true);
  const start = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  const offerResponse = await student.request.post("/api/proposals", { data: { tutor_id: nam.user_id, subject_id: "vat-li", mode: "online", sessions: 3, minutes: 60, rate: 200000, schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, hour: 19, minute: 0 })), start_date: start } });
  const offer = await offerResponse.json();
  expect(offerResponse.status(), JSON.stringify(offer)).toBe(201);
  const accepted = await (await tutor.request.patch(`/api/proposals/${offer.id}`, { data: { action: "accept" } })).json();

  // The tutor adds a lesson resource; the student sees it with the schedule.
  await tutor.goto(`/app/classes/${accepted.class_id}?tab=materials`);
  await tutor.getByRole("button", { name: "Thêm bài giảng" }).click();
  await tutor.getByLabel("Tiêu đề").fill("Định luật Ôm");
  await tutor.getByLabel("Liên kết YouTube, Google Drive hoặc trang web").fill("https://youtu.be/dQw4w9WgXcQ");
  await tutor.getByRole("button", { name: "Lưu bài giảng" }).click();
  await expect(tutor.locator(".material-list")).toContainText("Định luật Ôm");
  await student.goto(`/app/classes/${accepted.class_id}`);
  await expect(student.locator(".session-row")).toHaveCount(3);
  await student.getByRole("link", { name: "Bài giảng" }).click();
  await expect(student.locator(".material-list a")).toHaveAttribute("href", "https://youtu.be/dQw4w9WgXcQ");

  // The calendar shows the lessons in the class colour; a lesson opens its actions.
  await student.goto("/app/schedule");
  await student.getByRole("button", { name: "Tuần" }).click();
  await student.waitForLoadState("networkidle");
  // Tomorrow can fall in next week (on a Sunday).
  if (!(await student.locator(".cal-event").count())) await student.getByRole("button", { name: "Sau" }).click();
  const event = student.locator(".cal-event").first();
  await expect(event).toBeVisible();
  await event.click();
  await expect(student.locator(".cal-popover")).toContainText(nam.name ?? "");
  await expect(student.locator(".cal-popover").getByRole("button", { name: "Hủy buổi" })).toBeVisible();
  await student.keyboard.press("Escape");
  await student.getByRole("button", { name: "Tháng" }).click();
  await expect(student.locator(".cal-month-cell[data-today]")).toBeVisible();
  for (const width of [360, 820]) {
    await student.setViewportSize({ width, height: 900 });
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  await sc.close(); await tc.close();
});

test("a parent follows the child's classes read-only on mobile", async ({ page }) => {
  const made = await (await page.request.post("/__test/session-class", { data: {} })).json();
  await login(page, "nam");
  await page.request.put(`/api/sessions/${made.upcoming}/note`, { data: { body: `Ghi chú ${made.slug}` } });
  await page.request.post(`/api/classes/${made.class_id}/assignments`, { data: { title: `Bài tập ${made.slug}`, note: "", due_at: "", session_id: made.upcoming } });
  await page.request.post(`/api/classes/${made.class_id}/posts`, { data: { body: `Thông báo ${made.slug}` } });
  await login(page, "student");
  const family = await (await page.request.get("/api/family")).json();
  await login(page, "profile-parent");
  expect((await page.request.post("/api/family/link", { data: { code: family.code } })).status()).toBe(201);

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/classes");
  await expect(page.getByRole("link", { name: "Lớp học" }).first()).toBeVisible();
  await expect(page.locator(".class-card").first()).toBeVisible();
  await page.goto(`/app/classes/${made.class_id}`);
  await expect(page.locator(".class-stats-strip")).toBeVisible();
  await expect(page.locator(".session-row").first()).toBeVisible();
  await expect(page.locator(".class-posts")).toContainText(`Thông báo ${made.slug}`);
  await expect(page.locator(".session-note")).toContainText(`Ghi chú ${made.slug}`);
  for (const name of ["Xác nhận", "Hủy buổi", "Báo vấn đề", "Dời lịch"]) await expect(page.getByRole("button", { name })).toHaveCount(0);

  await page.getByRole("link", { name: "Bài tập" }).click();
  await expect(page.locator(".assignment-submission").first()).toBeVisible();
  await expect(page.locator(".assignment-submission")).toContainText("Minh Anh");
  await expect(page.getByRole("button", { name: "Nộp bài" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Giao bài tập" })).toHaveCount(0);
  await page.getByRole("link", { name: "Bài giảng" }).click();
  await expect(page.getByRole("button", { name: "Thêm bài giảng" })).toHaveCount(0);
  await page.getByRole("link", { name: "Gói học" }).click();
  await expect(page.locator(".member-list")).toContainText("Minh Anh");
  await expect(page.getByRole("button", { name: /Gia hạn/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
