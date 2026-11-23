import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}
const HOUR = 48;

test("dragging makes an event at once, its panel edits it, the bottom edge resizes it and the grid zooms", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "student");
  await page.goto("/app/schedule");
  await page.getByRole("button", { name: "Tuần", exact: true }).click();
  await page.locator(".cal-body").evaluate((el) => { el.scrollTop = 0; });
  const col = (await page.locator(".cal-col").nth(2).boundingBox())!, top = (await page.locator(".cal-columns").boundingBox())!.y;
  // 06:00 is the first row: drag from 09:00 to 10:30.
  await page.mouse.move(col.x + 30, top + 3 * HOUR + 4);
  await page.mouse.down();
  await page.mouse.move(col.x + 30, top + 4.5 * HOUR, { steps: 6 });
  await page.mouse.up();
  const block = page.locator(".cal-event", { hasText: "Sự kiện mới" });
  await expect(block).toContainText("09:00–10:30");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(block).not.toHaveAttribute("data-new", "true");

  await block.click();
  const panel = page.locator(".event-pop");
  await expect(panel.getByLabel("Tên sự kiện")).toBeFocused();
  await panel.getByLabel("Tên sự kiện").fill("Ôn thi Toán");
  await panel.getByRole("button", { name: "Tím" }).click();
  await panel.getByRole("button", { name: "Xong" }).click();
  await expect(panel).toHaveCount(0);
  const renamed = page.locator(".cal-event", { hasText: "Ôn thi Toán" });
  await expect(renamed).toHaveAttribute("data-color", "lilac");

  // The bottom edge sets the end time.
  const box = (await renamed.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + HOUR, { steps: 6 });
  await page.mouse.up();
  await expect(renamed).toContainText("09:00–11:30");
  const from = new Date(Date.now() - 14 * 86400000).toISOString(), to = new Date(Date.now() + 14 * 86400000).toISOString();
  const saved = (await (await page.request.get(`/api/calendar-events?from=${from}&to=${to}`)).json()).find((e: { title: string }) => e.title === "Ôn thi Toán");
  expect([saved.color, (Date.parse(saved.ends_at) - Date.parse(saved.starts_at)) / 60000]).toEqual(["lilac", 150]);

  const height = async () => (await page.locator(".cal-columns").boundingBox())!.height;
  const before = await height();
  await page.getByRole("button", { name: "Phóng to" }).click();
  expect(await height()).toBeCloseTo(before * 1.5, 0);

  await renamed.click();
  await page.locator(".event-pop").getByRole("button", { name: "Xóa sự kiện" }).click();
  await expect(renamed).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a tutor's free hours are one block on the calendar and in the offer composer", async ({ browser }) => {
  const tc = await browser.newContext(), sc = await browser.newContext();
  const tutor = await tc.newPage(), student = await sc.newPage();
  await login(tutor, "chau"); await login(student, "student");
  const profile = await (await tutor.request.get("/api/tutor/profile")).json();
  const blocks = [17, 18, 19, 20].map((hour) => ({ weekday: 0, hour }));
  expect((await tutor.request.put("/api/tutor/availability", { data: { blocks, revision: profile.weekly_schedule.revision } })).ok()).toBe(true);
  await tutor.goto("/app/schedule");
  await tutor.getByRole("button", { name: "Tuần", exact: true }).click();
  await expect(tutor.locator(".cal-col").first().locator(".cal-free")).toHaveText("Rảnh 17:00–21:00");

  await student.goto(`/app/tutors/${profile.user_id}`);
  await student.getByRole("button", { name: "Gửi offer", exact: true }).click();
  const week = student.locator(".free-week");
  await expect(week.getByRole("button", { name: /^Chọn giờ T2/ })).toHaveCount(1);
  await week.getByRole("button", { name: "Chọn giờ T2 17:00" }).press("Enter");
  await expect(week.locator(".free-week-verdict")).toHaveText("T3, T5 nằm ngoài giờ rảnh");
  for (const day of ["T3", "T5"]) await student.getByRole("button", { name: day, exact: true }).click();
  await expect(student.getByLabel("Giờ bắt đầu")).toHaveValue("17:00");
  await expect(week.locator(".free-week-verdict")).toHaveText(/trùng giờ rảnh/);
  // Leave the tutor's weekly hours as other journeys expect them.
  const now = (await (await tutor.request.get("/api/tutor/profile")).json()).weekly_schedule;
  expect((await tutor.request.put("/api/tutor/availability", { data: { blocks: profile.weekly_schedule.blocks, revision: now.revision } })).ok()).toBe(true);
  await tc.close(); await sc.close();
});
