import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("chat contact masking + admin safety queue + flagged thread", async ({ browser }) => {
  const ac = await browser.newContext(), sc = await browser.newContext();
  const admin = await ac.newPage(), student = await sc.newPage();
  const errors: string[] = [];
  for (const p of [admin, student]) p.on("pageerror", (e) => errors.push(e.message));
  await login(admin, "admin"); await login(student, "student");
  const tag = `e2e${Math.random().toString(36).slice(2, 10)}`;

  // Student starts an inquiry with a tutor and sends contact detail.
  const tutors = await (await student.request.get("/api/tutors")).json();
  const inquiry = (await student.request.post("/api/inquiries", { data: { tutor_id: tutors[0].user_id, body: `Chào cô ${tag}` } }));
  expect(inquiry.ok(), await inquiry.text()).toBe(true);
  const { id: threadId } = await inquiry.json();
  const sent = await student.request.post(`/api/inquiries/${threadId}/messages`, { data: { body: `Zalo em ${tag} 0901 234 567` } });
  expect(sent.ok(), await sent.text()).toBe(true);

  // The recipient-side copy is masked; the contact digits never leave the server.
  const msgs = await (await student.request.get(`/api/inquiries/${threadId}/messages`)).json();
  const list = Array.isArray(msgs) ? msgs : msgs.messages;
  expect(list.some((m: any) => m.body.includes("0901 234 567"))).toBe(false);
  expect(list.some((m: any) => m.body.includes("[đã ẩn"))).toBe(true);

  // Admin safety tab: flagged row -> read-only thread shows the original, audited.
  await admin.goto("/app/admin?tab=safety");
  const row = admin.locator(".admin-rows article").filter({ hasText: tag });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Thao tác tin bị cờ" }).click();
  await admin.getByRole("menuitem", { name: "Xem hội thoại" }).click();
  const drawer = admin.getByRole("dialog");
  await expect(drawer).toContainText(`Zalo em ${tag} 0901 234 567`);
  await expect(drawer).toContainText("lượt xem này được ghi nhật ký");

  // Dismiss clears the flag; the view itself left an audit row.
  await admin.keyboard.press("Escape");
  await row.getByRole("button", { name: "Thao tác tin bị cờ" }).click();
  await admin.getByRole("menuitem", { name: "Bỏ cờ" }).click();
  await expect(admin.locator(".admin-rows article").filter({ hasText: tag })).toHaveCount(0);
  expect(errors).toEqual([]);
});
