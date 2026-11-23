import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin sessions page: nav badge, merged worklist, drawers and audit deep links", async ({ browser }) => {
  const ac = await browser.newContext(), sc = await browser.newContext();
  const admin = await ac.newPage(), student = await sc.newPage();
  const errors: string[] = [];
  for (const p of [admin, student]) p.on("pageerror", (e) => errors.push(e.message));
  await login(admin, "admin"); await login(student, "student");

  // A dedicated class with a unique slug in its title: disputed, ended-pending,
  // upcoming lessons and one standalone booking. Assertions filter by the slug
  // so leftovers on the shared server cannot change the counts.
  const fx = await (await admin.request.post("/__test/session-class")).json(),
    { slug } = fx,
    own = () => admin.locator(".session-row").filter({ hasText: slug });

  // Money moves produce a real audit row to deep-link from.
  expect((await admin.request.post(`/api/admin/wallets/${fx.student_id}/adjust`, { data: { amount: 2000000, note: `Cộng ${slug}` } })).ok()).toBe(true);

  // Sidebar item with the needs-work badge; the tracking strip carries real numbers.
  await admin.goto("/app/sessions");
  const navItem = admin.getByRole("link", { name: /Buổi học/ });
  await expect(navItem.first()).toBeVisible();
  await expect(navItem.first().locator(".nav-badge")).toBeVisible();
  await expect(admin.locator(".sessions-track")).toContainText("Hôm nay");

  // The "Cần xử lý" queue opens by default: the disputed and the ended-unconfirmed lesson.
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
  await drawer.getByRole("button", { name: "Đóng" }).click();

  // The remaining overdue lesson can be reminded in bulk.
  await own().locator("input[type=checkbox]").check();
  await admin.getByRole("button", { name: /Nhắc xác nhận/ }).click();
  await expect(own().locator("input[type=checkbox]")).not.toBeChecked();

  // The standalone booking shows up with its source label and opens its own drawer.
  await admin.getByRole("button", { name: /^Sắp tới/ }).click();
  const bookingRow = admin.locator(".session-row").filter({ hasText: "Đặt lịch lẻ" });
  await expect(bookingRow).toContainText(slug);
  await bookingRow.locator(".admin-row-title").click();
  await expect(drawer).toContainText("Hai bên tham gia");
  await expect(drawer).toContainText(`Lịch lẻ ${slug}`);
  await expect(drawer.getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("href", `/app/messages?c=lesson-${fx.booking_id}`);
  await drawer.getByRole("button", { name: "Đóng" }).click();

  // A future lesson is cancelled from its drawer with the refund spelt out.
  await own().filter({ hasNotText: "Đặt lịch lẻ" }).locator(".admin-row-title").click();
  await drawer.getByRole("button", { name: "Hủy buổi học", exact: true }).click();
  const confirmDlg = admin.getByRole("dialog").last();
  await expect(confirmDlg).toContainText("hoàn về số dư");
  await confirmDlg.getByLabel("Lý do gửi cho hai bên").fill(`Phòng học bảo trì ${slug}`);
  await confirmDlg.getByRole("button", { name: "Xác nhận hủy và hoàn tiền" }).click();
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.getByRole("button", { name: /^Đã hủy/ }).click();
  await expect(own()).toHaveCount(1);
  await expect(own()).toContainText("Đã hủy");

  // Old entry points redirect to the new page.
  await admin.goto("/app/admin?tab=sessions&scope=attention");
  await expect(admin).toHaveURL(/\/app\/sessions\?scope=attention/);
  await admin.goto("/app/bookings");
  await expect(admin).toHaveURL(/\/app\/sessions/);
  // A student keeps the real bookings page.
  await student.goto("/app/bookings");
  await expect(student).toHaveURL(/\/app\/bookings/);

  // Audit rows deep-link to the exact record on the new page.
  await admin.goto("/app/admin?tab=audit");
  const auditRows = admin.locator(".audit-table tbody tr");
  await auditRows.filter({ hasText: "Hủy buổi học" }).filter({ hasText: slug }).first().getByRole("link").first().click();
  await expect(admin).toHaveURL(/\/app\/sessions\?session=\d+/);
  await expect(drawer).toContainText("Đã hủy");
  await drawer.getByRole("button", { name: "Đóng" }).click();
  await admin.goto("/app/admin?tab=audit");
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
