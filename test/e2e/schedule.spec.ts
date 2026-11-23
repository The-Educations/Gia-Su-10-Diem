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

// /app/schedule renders class_sessions for each role. A routed fixture proves the
// page maps every session into a chip and survives empty + failed loads.
const session = (id: number, extra = {}) => ({
  id, class_id: 10 + id, starts_at: new Date(Date.now() + (id - 900) * 86400000).toISOString(), minutes: 60,
  status: "scheduled", moved_from: null, title: `Toán · nhóm ${id}`, color: "sky", tutor_id: 3,
  subject_id: "toan", mode: "online", meeting_url: "", member_id: 50 + id, tutor_confirmed_at: null,
  student_confirmed_at: null, outcome: "pending", rating: null, survey: null, comment: "", note: "", kind: "session",
  student_id: 2, student_name: "Minh Anh", tutor_name: "Nguyễn Minh Châu", ...extra,
});

for (const slug of ["student", "community-parent", "chau"]) {
  test(`${slug} sees class sessions on the shared schedule`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
    await page.route("**/api/schedule**", route => route.fulfill({ json: [session(901), session(902)] }));
    await page.route("**/api/calendar-events**", route => route.fulfill({ json: [] }));
    await page.goto("/app/schedule");
    await page.getByRole("button", { name: "Tháng" }).click();
    await expect(page.locator(".cal-chip")).not.toHaveCount(0, { timeout: 15000 });
    expect(errors).toEqual([]);
  });
}

test("empty and failed schedules show the right states", async ({ page }) => {
  await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } });
  await page.route("**/api/schedule**", route => route.fulfill({ json: [] }));
  await page.route("**/api/calendar-events**", route => route.fulfill({ json: [] }));
  await page.goto("/app/schedule");
  await expect(page.locator(".cal-chip")).toHaveCount(0);
  await page.route("**/api/schedule**", route => route.fulfill({ status: 503, json: { error: "Không tải được lịch" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Không tải được lịch");
});
