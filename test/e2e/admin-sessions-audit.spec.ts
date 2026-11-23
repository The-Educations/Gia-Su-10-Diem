import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin session worklist: queues, detail drawer, actions and audit deep links", async ({ browser }) => {
  const ac = await browser.newContext(), sc = await browser.newContext();
  const admin = await ac.newPage(), student = await sc.newPage();
  const errors: string[] = [];
  for (const p of [admin, student]) p.on("pageerror", (e) => errors.push(e.message));
  await login(admin, "admin"); await login(student, "student");

  // A dedicated class with a unique slug in its title: disputed, ended-pending
  // and upcoming lessons. Every assertion below filters by the slug, so other
  // specs' leftovers on the shared server cannot change the counts.
  const fx = await (await admin.request.post("/__test/session-class")).json(),
    { slug } = fx,
    own = () => admin.locator(".session-row").filter({ hasText: slug });

  // Money moves produce a real audit row to deep-link from.
  expect((await admin.request.post(`/api/admin/wallets/${fx.student_id}/adjust`, { data: { amount: 2000000, note: `Cộng ${slug}` } })).ok()).toBe(true);

  // The "Cần xử lý" queue opens by default: the disputed and the ended-unconfirmed lesson.
  await admin.goto("/app/admin?tab=sessions");
  await expect(own()).toHaveCount(2);
  const disputedRow = own().filter({ hasText: `Gia sư không vào lớp ${slug}` });
  await expect(disputedRow).toHaveCount(1);

  // Detail drawer: people, money, history; resolve the report as "lesson happened".
  await disputedRow.locator(".admin-row-title").click();
  const drawer = admin.getByRole("dialog").first();
  await expect(drawer).toContainText("Học sinh và học phí");
  await expect(drawer).toContainText(`Gia sư không vào lớp ${slug}`);
  await drawer.getByRole("button", { name: "Buổi đã diễn ra" }).click();
  await expect(drawer).toContainText("Đã xác nhận");
  await admin.keyboard.press("Escape");

  // The remaining overdue lesson can be reminded in bulk.
  await own().locator("input[type=checkbox]").check();
  await admin.getByRole("button", { name: /Nhắc xác nhận/ }).click();
  await expect(own().locator("input[type=checkbox]")).not.toBeChecked();

  // A future lesson is cancelled from its drawer with the refund spelt out.
  await admin.getByRole("button", { name: /^Sắp tới/ }).click();
  await own().locator(".admin-row-title").click();
  await drawer.getByRole("button", { name: "Hủy buổi học", exact: true }).click();
  const confirmDlg = admin.getByRole("dialog").last();
  await expect(confirmDlg).toContainText("hoàn về số dư");
  await confirmDlg.getByLabel("Lý do gửi cho hai bên").fill(`Phòng học bảo trì ${slug}`);
  await confirmDlg.getByRole("button", { name: "Xác nhận hủy và hoàn tiền" }).click();
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.getByRole("button", { name: /^Đã hủy/ }).click();
  await expect(own()).toHaveCount(1);
  await expect(own()).toContainText("Đã hủy");

  // Audit rows deep-link to the exact record.
  await admin.goto("/app/admin?tab=audit");
  const auditRows = admin.locator(".audit-table tbody tr");
  await auditRows.filter({ hasText: "Hủy buổi học" }).filter({ hasText: slug }).first().getByRole("link").first().click();
  await expect(drawer).toContainText("Đã hủy");
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.getByRole("tab", { name: "Nhật ký" }).click();
  await auditRows.filter({ hasText: "Điều chỉnh số dư" }).filter({ hasText: slug }).first().getByRole("button", { name: "Xem tài khoản" }).click();
  await expect(drawer).toContainText(fx.student_name);
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await auditRows.filter({ hasText: "Nhắc xác nhận buổi học" }).filter({ hasText: slug }).first().getByRole("link").first().click();
  await expect(drawer).toContainText("Học sinh và học phí");

  for (const width of [390, 1280]) {
    await admin.setViewportSize({ width, height: 900 });
    expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
  await ac.close(); await sc.close();
});
