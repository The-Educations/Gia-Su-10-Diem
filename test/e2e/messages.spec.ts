import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("two-pane inbox: search, filters, open a conversation and send", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "student");
  await page.goto("/app/messages");
  await expect(page.locator(".conversation-list")).toBeVisible();
  await expect(page.getByLabel("Tìm cuộc trò chuyện")).toBeVisible();
  await page.locator(".conversation-filter").getByRole("button", { name: "Hỗ trợ" }).click();
  await expect(page.locator(".conversation-list > button").first()).toContainText("Hỗ trợ");
  await page.getByLabel("Tìm cuộc trò chuyện").fill("không tồn tại");
  await expect(page.getByText("Không có cuộc trò chuyện nào khớp.")).toBeVisible();
  await page.getByLabel("Tìm cuộc trò chuyện").fill("");
  await page.locator(".conversation-filter").getByRole("button", { name: "Tất cả" }).click();
  await page.locator(".conversation-list > button").first().click();
  await page.locator("#message").fill("Xin chào đội ngũ hỗ trợ");
  await page.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByRole("region", { name: "Nội dung trò chuyện" }).getByText("Xin chào đội ngũ hỗ trợ")).toBeVisible();
  expect(errors).toEqual([]);
});

test("booking lands as an event card in the lesson thread, its link works, and ?c=&m= deep-links", async ({ page }) => {
  await login(page, "student");
  const tutors = await (await page.request.get("/api/tutors")).json();
  let booking: { id: number } | null = null;
  for (const t of tutors) {
    const detail = await (await page.request.get(`/api/tutors/${t.user_id}`)).json();
    const subjects = typeof detail.subjects === "string" ? JSON.parse(detail.subjects) : detail.subjects;
    const mode = detail.mode === "both" ? "online" : detail.mode;
    for (const slot of detail.slots || []) {
      const res = await page.request.post("/api/bookings", { data: { slot_id: slot.id, subject_id: subjects[0], mode, note: "" } });
      if (res.status() === 201) { booking = await res.json(); break; }
    }
    if (booking) break;
  }
  expect(booking).toBeTruthy();
  const key = `lesson-${booking!.id}`;
  await page.goto(`/app/messages?c=${key}`);
  const event = page.locator(".chat-event", { hasText: "đã đặt buổi học" });
  await expect(event).toBeVisible();
  const mid = await event.getAttribute("data-mid");
  expect(mid).toBeTruthy();
  await event.locator(".message-context-link").click();
  await expect(page).toHaveURL(new RegExp(`/app/bookings\\?lesson=${booking!.id}`));
  await page.goto(`/app/messages?c=${key}&m=${mid}`);
  await expect(page.locator(".chat-event.flash")).toBeInViewport();
});
