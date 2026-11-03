import { test, expect } from "@playwright/test";

test("offer and dated lesson messages keep context for both people, with direct links and scoped replies", async ({ page, browser }) => {
  const tutorContext = await browser.newContext(), tutor = await tutorContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); tutor.on("pageerror", error => errors.push(error.message));
  expect((await page.request.post("/api/auth/login", { data: { email: "community-parent@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  expect((await tutor.request.post("/api/auth/login", { data: { email: "nam@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  const profile = await (await tutor.request.get("/api/tutor/profile")).json();
  const blocks = [{ weekday: 0, hour: 19 }];
  expect((await tutor.request.put("/api/tutor/availability", { data: { revision: profile.weekly_schedule.revision, blocks } })).ok()).toBe(true);
  const start = new Date(Date.now() + 70 * 86400000);
  start.setUTCDate(start.getUTCDate() + (8 - start.getUTCDay()) % 7);
  const start_date = start.toISOString().slice(0, 10);
  const end_date = new Date(+start + 7 * 86400000).toISOString().slice(0, 10);
  const response = await page.request.post("/api/offers", { data: { tutor_id: profile.user_id, subject_id: "vat-li", mode: "online", blocks, start_date, end_date } });
  expect(response.ok()).toBe(true);
  const offer = await response.json();
  try {
    await page.goto(`/app/offers?id=${offer.id}`);
    await page.getByRole("dialog").getByRole("link", { name: "Nhắn tin", exact: true }).click();
    await expect(page.locator(".message-context-draft")).toContainText(`Đề nghị học #${offer.id}`);
    await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Mình muốn trao đổi về đề nghị này.");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await page.reload();
    await expect(page.locator(".conversation-body")).toContainText("Mình muốn trao đổi về đề nghị này.");
    await expect(page.locator(".conversation-body .message-context a")).toHaveAttribute("href", `/app/offers?id=${offer.id}`);
    // The receiver opens their regular inbox, without the sender's URL context.
    await tutor.goto("/app/messages");
    await tutor.locator(".conversation-list button").filter({ hasText: "Private community-parent" }).click();
    await expect(tutor.locator(".conversation-body .message-context")).toContainText(`Đề nghị học #${offer.id}`);
    await tutor.locator(".conversation-body .message-context a").click();
    await expect(tutor.getByRole("dialog")).toContainText(`Chi tiết đề nghị học #${offer.id}`);
    await tutor.getByRole("button", { name: "Chấp nhận", exact: true }).click();
    await tutor.getByRole("link", { name: "Mở lịch dạy", exact: true }).click();
    await tutor.locator(".dated-lesson").first().click();
    await tutor.getByRole("dialog").getByRole("link", { name: "Nhắn tin", exact: true }).click();
    const lessonId = new URL(tutor.url()).searchParams.get("contextId");
    await expect(tutor.locator(".message-context-draft")).toContainText(`Buổi học #${lessonId}`);
    await tutor.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Chuẩn bị bài tập cho buổi này nhé.");
    await tutor.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.locator(".conversation-body")).toContainText("Chuẩn bị bài tập cho buổi này nhé.", { timeout: 12000 });
    const lessonCard = page.locator(".conversation-body").getByRole("article", { name: `Buổi học #${lessonId}`, exact: true });
    await lessonCard.getByRole("button", { name: /Trả lời/ }).click();
    await expect(page.locator(".message-context-draft")).toContainText(`Buổi học #${lessonId}`);
    await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Đã rõ lịch của buổi này.");
    await page.route(`**/api/inquiries/${offer.inquiry_id}/messages`, route => route.request().method() === "POST" ? route.fulfill({ status: 503, json: { error: "Chưa gửi được tin nhắn." } }) : route.continue());
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Chưa gửi được tin nhắn");
    await expect(page.getByRole("textbox", { name: "Tin nhắn", exact: true })).toHaveValue("Đã rõ lịch của buổi này.");
    await expect(page.locator(".message-context-draft")).toContainText(`Buổi học #${lessonId}`);
    await page.unroute(`**/api/inquiries/${offer.inquiry_id}/messages`);
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    const stored = await (await page.request.get(`/api/inquiries/${offer.inquiry_id}/messages`)).json();
    expect(stored.at(-1).context).toMatchObject({ kind: "lesson", id: Number(lessonId) });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await lessonCard.first().getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`bookings\\?lesson=${lessonId}$`));
    await expect(page.locator(".dated-lesson")).toHaveCount(1);
    // A bad context cannot silently send a context-free message; it can be removed.
    await page.goto(`/app/messages?inquiry=${offer.inquiry_id}&context=offer&contextId=999999`);
    await expect(page.locator(".message-context-draft").getByRole("alert")).toBeVisible();
    await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Câu hỏi chung");
    await expect(page.getByRole("button", { name: "Gửi", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Bỏ ngữ cảnh tin nhắn" }).click();
    await expect(page.getByRole("textbox", { name: "Tin nhắn", exact: true })).toHaveValue("Câu hỏi chung");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.locator(".conversation-body")).toContainText("Câu hỏi chung");
    const plain = await (await page.request.get(`/api/inquiries/${offer.inquiry_id}/messages`)).json();
    expect(plain.at(-1).context).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    await page.request.patch(`/api/offers/${offer.id}`, { data: { status: "cancelled" } });
    const current = await (await tutor.request.get("/api/tutor/profile")).json();
    await tutor.request.put("/api/tutor/availability", { data: { revision: current.weekly_schedule.revision, blocks: profile.weekly_schedule.blocks } });
    await tutorContext.close();
  }
});

test("existing weekly requests link their messages back to the exact weekly card", async ({ page, browser }) => {
  const context = await browser.newContext(), tutor = await context.newPage();
  await page.request.post("/api/auth/login", { data: { email: "community-parent@demo.giasu.test", password: "BrowserStudy2026!" } });
  await tutor.request.post("/api/auth/login", { data: { email: "nam@demo.giasu.test", password: "BrowserStudy2026!" } });
  const profile = await (await tutor.request.get("/api/tutor/profile")).json();
  const blocks = [{ weekday: 3, hour: 18 }];
  await tutor.request.put("/api/tutor/availability", { data: { revision: profile.weekly_schedule.revision, blocks } });
  const response = await page.request.post("/api/weekly-requests", { data: { tutor_id: profile.user_id, subject_id: "vat-li", mode: "online", blocks } });
  expect(response.ok()).toBe(true);
  const weekly = await response.json();
  try {
    await page.goto(`/app/offers?request=${weekly.id}`);
    const card = page.getByRole("article", { name: `Lịch học hằng tuần #${weekly.id}`, exact: true });
    await expect(card).toBeFocused();
    await card.getByRole("link", { name: "Nhắn tin", exact: true }).click();
    await expect(page.locator(".message-context-draft")).toContainText(`Lịch học hằng tuần #${weekly.id}`);
    await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill("Trao đổi lịch tuần này");
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await tutor.goto(`/app/messages?inquiry=${weekly.inquiry_id}`);
    const message = tutor.locator(".conversation-body").getByRole("article", { name: `Lịch học hằng tuần #${weekly.id}`, exact: true }).last();
    await message.getByRole("link").click();
    await expect(tutor).toHaveURL(new RegExp(`offers\\?request=${weekly.id}$`));
    await expect(tutor.getByRole("article", { name: `Lịch học hằng tuần #${weekly.id}`, exact: true })).toBeFocused();
  } finally {
    await page.request.patch(`/api/weekly-requests/${weekly.id}`, { data: { status: "cancelled" } });
    const current = await (await tutor.request.get("/api/tutor/profile")).json();
    await tutor.request.put("/api/tutor/availability", { data: { revision: current.weekly_schedule.revision, blocks: profile.weekly_schedule.blocks } });
    await context.close();
  }
});
