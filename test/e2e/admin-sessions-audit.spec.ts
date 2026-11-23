import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin session worklist: queues, detail drawer, actions and audit deep links", async ({ browser }) => {
  const ac = await browser.newContext(), sc = await browser.newContext(), tc = await browser.newContext();
  const admin = await ac.newPage(), student = await sc.newPage(), tutor = await tc.newPage();
  const errors: string[] = [];
  for (const p of [admin, student, tutor]) p.on("pageerror", (e) => errors.push(e.message));
  await login(admin, "admin"); await login(student, "profile-other"); await login(tutor, "nam");
  const me = (await (await student.request.get("/api/auth/me")).json()).user;
  const nam = await (await tutor.request.get("/api/tutor/profile")).json();

  // Money moves and an offer produce real audit rows to deep-link from.
  expect((await admin.request.post(`/api/admin/wallets/${me.id}/adjust`, { data: { amount: 2000000, note: "Cộng tiền kiểm tra" } })).ok()).toBe(true);
  const start = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  const offerResponse = await student.request.post("/api/proposals", { data: { tutor_id: nam.user_id, subject_id: "vat-li", mode: "online", sessions: 3, minutes: 60, rate: 200000, schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, hour: 19, minute: 0 })), start_date: start } });
  const offer = await offerResponse.json();
  expect(offerResponse.status(), JSON.stringify(offer)).toBe(201);
  const accepted = await (await tutor.request.patch(`/api/proposals/${offer.id}`, { data: { action: "accept" } })).json();
  const rows = await (await admin.request.get(`/api/admin/sessions?class=${accepted.class_id}`)).json();
  const ids = [...new Set<number>(rows.map((r: { id: number }) => r.id))].sort((a, b) => a - b);
  expect(ids.length).toBe(3);
  const [disputed, waiting, upcoming] = ids;
  await admin.request.post("/__test/class-session", { data: { session_id: disputed, hours_from_now: -3, outcome: "disputed", note: "Gia sư không vào lớp" } });
  await admin.request.post("/__test/class-session", { data: { session_id: waiting, hours_from_now: -2, outcome: "pending" } });

  // The "Cần xử lý" queue opens by default: the disputed and the ended-unconfirmed lesson.
  await admin.goto("/app/admin?tab=sessions");
  await expect(admin.locator(".session-row")).toHaveCount(2);
  const disputedRow = admin.locator(".session-row").filter({ hasText: "Gia sư không vào lớp" });
  await expect(disputedRow).toHaveCount(1);

  // Detail drawer: people, money, history; resolve the report as "lesson happened".
  await disputedRow.locator(".admin-row-title").click();
  const drawer = admin.getByRole("dialog").first();
  await expect(drawer).toContainText("Học sinh và học phí");
  await expect(drawer).toContainText("Gia sư không vào lớp");
  await drawer.getByRole("button", { name: "Buổi đã diễn ra" }).click();
  await expect(drawer).toContainText("Đã xác nhận");
  await admin.keyboard.press("Escape");

  // The remaining overdue lesson can be reminded in bulk.
  await admin.locator(".session-row input[type=checkbox]").check();
  await admin.getByRole("button", { name: /Nhắc xác nhận/ }).click();
  await expect(admin.locator(".session-row input[type=checkbox]")).not.toBeChecked();

  // A future lesson is cancelled from its drawer with the refund spelt out.
  await admin.getByRole("button", { name: /^Sắp tới/ }).click();
  await admin.locator(".session-row .admin-row-title").first().click();
  await drawer.getByRole("button", { name: "Hủy buổi học", exact: true }).click();
  const confirmDlg = admin.getByRole("dialog").last();
  await expect(confirmDlg).toContainText("hoàn về số dư");
  await confirmDlg.getByLabel("Lý do gửi cho hai bên").fill("Phòng học bảo trì");
  await confirmDlg.getByRole("button", { name: "Xác nhận hủy và hoàn tiền" }).click();
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.getByRole("button", { name: /^Đã hủy/ }).click();
  await expect(admin.locator(".session-row")).toHaveCount(1);
  await expect(admin.locator(".session-row")).toContainText("Đã hủy");

  // Audit rows deep-link to the exact record.
  await admin.goto("/app/admin?tab=audit");
  const auditRows = admin.locator(".audit-table tbody tr");
  await auditRows.filter({ hasText: "Hủy buổi học" }).first().getByRole("link").first().click();
  await expect(drawer).toContainText("Đã hủy");
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.getByRole("tab", { name: "Nhật ký" }).click();
  await auditRows.filter({ hasText: "Điều chỉnh số dư" }).first().getByRole("button", { name: "Xem tài khoản" }).click();
  await expect(drawer).toContainText(me.name);
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await auditRows.filter({ hasText: "Nhắc xác nhận buổi học" }).first().getByRole("link").first().click();
  await expect(drawer).toContainText("Học sinh và học phí");

  for (const width of [390, 1280]) {
    await admin.setViewportSize({ width, height: 900 });
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  await ac.close(); await sc.close(); await tc.close();
});
