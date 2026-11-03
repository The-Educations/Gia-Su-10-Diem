import { test, expect } from "@playwright/test";
import { lessonCalendarFile } from "../../app/src/lib/lesson-export";
import type { Booking } from "../../app/src/lib/types";

const base: Booking = {
  id: 901, offer_id: 71, inquiry_id: 81, student_id: 2, tutor_id: 3,
  student_name: "Minh Anh", tutor_name: "Nguyễn Minh Châu", subject_name: "Toán",
  starts_at: "2030-01-07T23:30:00+07:00", duration_minutes: 90, rate: 150000,
  mode: "online", note: "Mục tiêu, học; hiểu\\nhớ\r\nEND:VEVENT\r\nBEGIN:VEVENT",
  status: "accepted", lesson_note: "Ôn phương trình và bất đẳng thức. ".repeat(12),
  meeting_url: "https://meet.google.com/example", reviewed: null,
};
const fixtures: Booking[] = [
  base,
  { ...base, id: 902, offer_id: 72, inquiry_id: 82, tutor_name: "Trần Văn Nam", subject_name: "Vật lý", starts_at: "2030-01-09T12:00:00Z" },
  { ...base, id: 903, status: "completed", starts_at: "2020-01-06T12:00:00Z" },
  ...["pending", "cancelled", "declined"].map((status, i) => ({ ...base, id: 904 + i, status })),
];

test("full calendar exports confirmed lessons with safe Unicode, stable IDs and exact instants", () => {
  const content = lessonCalendarFile(fixtures, "student", new Date("2026-01-01T00:00:00Z"));
  const unfolded = content.replace(/\r\n /g, "");
  expect(content.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(unfolded.match(/^BEGIN:VEVENT$/gm)).toHaveLength(3);
  expect(unfolded.match(/^END:VEVENT$/gm)).toHaveLength(3);
  for (const id of [901, 902, 903]) expect(unfolded).toContain(`UID:lesson-${id}@giasu10diem.local`);
  for (const id of [904, 905, 906]) expect(unfolded).not.toContain(`UID:lesson-${id}@`);
  expect(unfolded).toContain("DTSTART:20300107T163000Z");
  expect(unfolded).toContain("DTEND:20300107T180000Z");
  expect(unfolded).toContain("SUMMARY:Toán · Nguyễn Minh Châu");
  expect(unfolded).toContain("Mục tiêu\\, học\\; hiểu\\\\nhớ\\nEND:VEVENT\\nBEGIN:VEVENT");
  expect(unfolded).toContain(base.lesson_note);
  expect(unfolded).toContain(base.meeting_url);
  for (const line of content.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  expect(lessonCalendarFile([base], "tutor")).toContain("SUMMARY:Toán · Minh Anh");
  expect(lessonCalendarFile([base], "admin").replace(/\r\n /g, "")).toContain("SUMMARY:Toán · Minh Anh · Nguyễn Minh Châu");
});

for (const [slug, heading, other] of [
  ["student", "Lịch học của tôi", "Nguyễn Minh Châu"],
  ["community-parent", "Lịch học của tôi", "Nguyễn Minh Châu"],
  ["chau", "Lịch dạy của tôi", "Minh Anh"],
]) {
  test(`${slug} sees course lessons directly, contacts the right person and exports the whole schedule`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
    await page.route("**/api/bookings", route => route.fulfill({ json: fixtures }));
    await page.goto("/app/bookings");
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(page.locator(".dated-lesson")).toHaveCount(5);
    await expect(page.locator(".schedule-next")).toContainText(other);
    await expect(page.locator(".schedule-next a[href*='messages']")).toHaveAttribute("href", "/app/messages?inquiry=81");
    await page.locator(".dated-lesson").first().click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Nhắn tin", exact: true })).toHaveAttribute("href", "/app/messages?inquiry=81");
    await expect(page.getByRole("button", { name: "Viết ghi chú", exact: true })).toHaveCount(slug === "chau" ? 1 : 0);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Khóa học", exact: true }).click();
    await page.getByRole("option", { name: new RegExp("#72") }).click();
    await expect(page.locator(".dated-lesson")).toHaveCount(1);
    await page.getByRole("combobox", { name: "Trạng thái", exact: true }).click();
    await page.getByRole("option", { name: "Đã hủy", exact: true }).click();
    await expect(page.getByText("Chưa có buổi học trong mục này", { exact: true })).toBeVisible();
    // Full export must not silently truncate to the active course/status/week.
    const pendingDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Tải toàn bộ lịch", exact: true }).click();
    const download = await pendingDownload;
    expect(download.suggestedFilename()).toBe("lich-hoc-gia-su-10-diem.ics");
    const stream = await download.createReadStream(); let content = "";
    for await (const chunk of stream!) content += chunk.toString();
    expect(content.match(/^BEGIN:VEVENT$/gm)).toHaveLength(3);
    await page.getByRole("button", { name: "Google Calendar", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("không tự cập nhật");
    await expect(page.getByRole("link", { name: "Mở trang nhập lịch" })).toHaveAttribute("href", "https://calendar.google.com/calendar/u/0/r/settings/export");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
    await page.getByRole("tab", { name: "Danh sách", exact: true }).click();
    await expect(page.locator(".lesson-card")).toHaveCount(6);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Danh sách", exact: true })).toHaveAttribute("data-state", "active");
    await page.getByRole("tab", { name: "Tuần", exact: true }).click();
    await page.getByLabel("Đến ngày", { exact: true }).fill("2020-01-06");
    await expect(page.locator(".dated-lesson")).toHaveCount(1);
    await page.getByRole("button", { name: "Tuần sau", exact: true }).click();
    await expect(page.getByText("Không có buổi học trong tuần này.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Buổi tiếp theo", exact: true }).click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator(".dated-lesson").first()).toBeVisible();
    }
    await page.goto("/app/bookings?lesson=903");
    await expect(page.locator(".dated-lesson")).toHaveCount(1);
    await expect(page.locator(".dated-lesson")).toContainText("Đã hoàn thành");
    await page.goto("/app/bookings?status=completed");
    await expect(page.locator(".dated-lesson")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("empty and failed schedules cannot export an incomplete calendar", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } });
  await page.route("**/api/bookings", route => route.fulfill({ json: [] }));
  await page.goto("/app/bookings");
  await expect(page.getByRole("button", { name: "Tải toàn bộ lịch", exact: true })).toBeDisabled();
  await expect(page.getByText("Chưa có buổi học trong mục này", { exact: true })).toBeVisible();
  await page.route("**/api/bookings", route => route.fulfill({ status: 503, json: { error: "Không tải được lịch học" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Không tải được lịch học");
  await expect(page.getByRole("button", { name: "Google Calendar", exact: true })).toBeDisabled();
});

test("parent and tutor move between their shared schedule, private messages and lesson notes", async ({ page, browser }) => {
  const tutorContext = await browser.newContext(), tutor = await tutorContext.newPage();
  for (const [target, slug] of [[page, "community-parent"], [tutor, "chau"]] as const) {
    expect((await target.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
  }
  const profile = await (await tutor.request.get("/api/tutor/profile")).json();
  const blocks = [{ weekday: 3, hour: 17 }];
  expect((await tutor.request.put("/api/tutor/availability", { data: { revision: profile.weekly_schedule.revision, blocks } })).ok()).toBe(true);
  const start_date = new Date(Date.now() + 150 * 86400000).toISOString().slice(0, 10);
  const end_date = new Date(Date.now() + 163 * 86400000).toISOString().slice(0, 10);
  const created = await page.request.post("/api/offers", { data: { tutor_id: profile.user_id, subject_id: "toan", mode: "online", blocks, start_date, end_date } });
  expect(created.status()).toBe(201);
  const offer = await created.json();
  expect((await tutor.request.patch(`/api/offers/${offer.id}`, { data: { status: "accepted" } })).ok()).toBe(true);
  await page.goto(`/app/bookings?offer=${offer.id}`);
  await page.getByRole("link", { name: "Nhắn gia sư", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`inquiry=${offer.inquiry_id}`));
  await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Nhờ cô giao bài tập để gia đình cùng theo dõi.");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await tutor.goto(`/app/bookings?offer=${offer.id}`);
  await tutor.locator(".schedule-next").getByRole("link", { name: "Nhắn tin", exact: true }).click();
  await expect(tutor.getByText("Nhờ cô giao bài tập để gia đình cùng theo dõi.", { exact: true })).toBeVisible();
  await expect(tutor.getByRole("link", { name: "Xem hồ sơ", exact: true })).toHaveCount(0);
  await tutor.getByRole("link", { name: "Xem lịch dạy", exact: true }).click();
  await expect(tutor).toHaveURL(new RegExp(`bookings\\?inquiry=${offer.inquiry_id}`));
  await tutor.locator(".dated-lesson").first().click();
  await tutor.getByRole("button", { name: "Viết ghi chú", exact: true }).click();
  await tutor.getByLabel("Ghi chú & bài tập").fill("Gia đình kiểm tra bài 1–3 sau buổi học.");
  await tutor.getByRole("button", { name: "Lưu nội dung", exact: true }).click();
  await expect(tutor.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Xem lịch học", exact: true }).click();
  await page.locator(".dated-lesson").first().click();
  await expect(page.getByRole("dialog")).toContainText("Gia đình kiểm tra bài 1–3 sau buổi học.");
  await expect(page.getByRole("button", { name: "Viết ghi chú", exact: true })).toHaveCount(0);
  await page.request.patch(`/api/offers/${offer.id}`, { data: { status: "cancelled" } });
  const current = await (await tutor.request.get("/api/tutor/profile")).json();
  await tutor.request.put("/api/tutor/availability", { data: { revision: current.weekly_schedule.revision, blocks: profile.weekly_schedule.blocks } });
  await tutorContext.close();
});
