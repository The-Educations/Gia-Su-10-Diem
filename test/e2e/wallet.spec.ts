import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("student tops up, sends an offer that holds money, and the tutor accepts it", async ({ browser }) => {
  const sc = await browser.newContext(), tc = await browser.newContext();
  const student = await sc.newPage(), tutor = await tc.newPage();
  const errors: string[] = [];
  for (const p of [student, tutor]) p.on("pageerror", (e) => errors.push(e.message));
  await login(student, "student"); await login(tutor, "linh");
  const linh = await (await tutor.request.get("/api/tutor/profile")).json();

  // Top up through the simulated transfer (no SePay keys locally).
  await student.goto("/app/wallet");
  const before = (await (await student.request.get("/api/wallet")).json()).available;
  await student.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await student.getByRole("button", { name: "1.000.000 ₫" }).click();
  await student.getByRole("button", { name: "Tạo lệnh nạp 1.000.000 ₫" }).click();
  await expect(student.locator(".deposit-code")).toHaveText(/^GSD[A-Z0-9]{8}$/);
  // Whatever the bank config state, the simulated path is present.
  await student.getByRole("button", { name: /Giả lập tiền đã về/ }).click();
  await expect(student.getByRole("status").filter({ hasText: "Đã nhận" })).toBeVisible();
  await student.getByRole("button", { name: "Xong" }).click();
  expect((await (await student.request.get("/api/wallet")).json()).available).toBe(before + 1000000);

  // Every opening is a new order with its own code; an unpaid one is left alone.
  await student.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await student.getByLabel("Số tiền nạp").fill("200000");
  await student.getByRole("button", { name: "Tạo lệnh nạp 200.000 ₫" }).click();
  const first = await student.locator(".deposit-code").textContent();
  await student.keyboard.press("Escape");
  await student.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await student.getByRole("button", { name: /Tạo lệnh nạp/ }).click();
  await expect(student.locator(".deposit-code")).not.toHaveText(first!);
  await student.keyboard.press("Escape");

  // Withdrawing: amount, receiving account, a preview, then the request's status.
  await student.getByRole("button", { name: "Rút tiền", exact: true }).click();
  await student.getByLabel("Số tiền rút").fill("100000");
  await student.getByLabel("Ngân hàng").selectOption("MB Bank");
  await student.getByLabel("Số tài khoản").fill("0987654321");
  await student.getByLabel("Tên chủ tài khoản").fill("Nguyen Minh Anh");
  await student.getByRole("button", { name: "Xem trước" }).click();
  await expect(student.locator(".withdraw-preview")).toContainText("NGUYEN MINH ANH");
  await student.getByRole("button", { name: "Gửi yêu cầu rút 100.000 ₫" }).click();
  await expect(student.locator('.ledger li[data-kind="withdrawal_requested"]').first()).toContainText("Đang xử lý");
  await student.getByRole("button", { name: "Rút tiền", exact: true }).click();
  await expect(student.getByRole("button", { name: "MB Bank ····4321" })).toHaveAttribute("data-checked", "true");
  await student.keyboard.press("Escape");

  // The admin pays it from the queue (QR with the memo code) and attaches the bank's receipt.
  const ac = await browser.newContext(), admin = await ac.newPage();
  await login(admin, "admin");
  await admin.goto("/app/admin?tab=finance");
  const payout = admin.locator(".payout-card").filter({ hasText: "100.000" }).filter({ hasText: "0987654321" });
  await expect(payout.getByRole("img", { name: /Mã QR chuyển 100\.000/ })).toBeVisible();
  await expect(payout.locator(".deposit-code")).toHaveText(/^GSD[A-Z0-9]{8}$/);
  await payout.getByRole("button", { name: "Đã chuyển" }).click();
  await admin.locator('input[type="file"]').setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await admin.getByRole("button", { name: "Xác nhận và gửi biên lai" }).click();
  await expect(admin.getByText("Đã ghi nhận chuyển tiền")).toBeVisible();
  await ac.close();
  await student.reload();
  const line = student.locator('.ledger li[data-kind="withdrawal_requested"]').first();
  await expect(line).toContainText("Đã chuyển");
  await expect(line.getByRole("link", { name: "Xem biên lai" })).toHaveAttribute("href", /\/api\/chat\/attachments\//);
  expect((await (await student.request.get("/api/wallet")).json()).available).toBe(before + 900000);

  // The offer composer shows the total and holds it on sending.
  await student.goto(`/app/tutors/${linh.user_id}`);
  await student.getByRole("button", { name: "Gửi đề nghị", exact: true }).click();
  const dialog = student.getByRole("dialog");
  await dialog.getByLabel("Số buổi").fill("4");
  await dialog.getByLabel("Học phí / buổi").fill("200000");
  await expect(dialog.locator(".proposal-summary")).toContainText("800.000");
  await dialog.getByLabel("Lời nhắn").fill("Em muốn luyện nói tiếng Anh");
  await dialog.getByRole("button", { name: /^Gửi đề nghị 800\.000/ }).click();
  await expect(student).toHaveURL(/proposals\?id=\d+/);
  await expect(student.locator(".proposal-card[data-focused]")).toContainText("Chờ trả lời");
  const held = await (await student.request.get("/api/wallet")).json();
  expect(held.held).toBeGreaterThanOrEqual(800000);

  // The tutor sees the payout after the 5% fee and accepts.
  await tutor.goto("/app/proposals");
  const card = tutor.locator(".proposal-card").filter({ hasText: "Em muốn luyện nói tiếng Anh" });
  await expect(card).toContainText("Bạn nhận 760.000");
  await card.getByRole("button", { name: "Nhận đề nghị" }).click();
  await expect(tutor.getByText("Đã nhận đề nghị", { exact: true })).toBeVisible();
  await tutor.getByRole("link", { name: /Lịch sử/ }).click();
  await expect(tutor.locator(".proposal-card").filter({ hasText: "Em muốn luyện nói tiếng Anh" })).toContainText("Đã nhận");
  await student.goto("/app/workspace");
  await student.getByRole("button", { name: /Thông báo/ }).click();
  await expect(student.locator(".notification-panel")).toContainText("đã nhận đề nghị");
  for (const width of [360, 768, 1280]) {
    await tutor.setViewportSize({ width, height: 900 });
    await tutor.goto("/app/wallet");
    expect(await tutor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(tutor.locator(".credits-card")).toContainText("Xu");
  expect(errors).toEqual([]);
  await sc.close(); await tc.close();
});

test("a simulated transfer updates the balance chip and toasts without a reload", async ({ page }) => {
  await login(page, "student");
  const start = (await (await page.request.get("/api/wallet")).json()).available;
  const fmt = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;
  await page.goto("/app/wallet");
  await page.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await page.getByRole("button", { name: "1.000.000 ₫" }).click();
  await page.getByRole("button", { name: /Tạo lệnh nạp 1.000.000 ₫/ }).click();
  await page.waitForSelector(".deposit-code");
  // The pending order is tracked even after the dialog closes.
  const pending = async () => (await page.evaluate(() => JSON.parse(sessionStorage.getItem("giasu.pendingDeposits") || "[]"))) as { id: number }[];
  expect((await pending()).length).toBe(1);
  await page.keyboard.press("Escape");
  const chip = page.locator(".balance-chip");
  await expect(chip).toContainText(fmt(start));
  const id = (await pending())[0].id;
  const toast = page.getByText(/Đã nhận\s+1\.000\.000\s*₫\s*vào số dư/);
  await page.request.post(`/api/wallet/deposits/${id}/simulate`, { data: {} });
  await expect(toast).toBeVisible({ timeout: 8000 });
  await expect(chip).toContainText(fmt(start + 1000000), { timeout: 8000 });
  expect((await pending()).length).toBe(0);

  // And a reload while pending still picks the payment up afterwards.
  const dialog = page.locator(".topup-dialog");
  await page.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await dialog.getByRole("button", { name: "1.000.000 ₫" }).first().click();
  await dialog.getByRole("button", { name: /Tạo lệnh nạp 1.000.000 ₫/ }).click();
  await page.waitForSelector(".deposit-code");
  await page.reload();
  const id2 = (await pending())[0].id;
  await page.request.post(`/api/wallet/deposits/${id2}/simulate`, { data: {} });
  await expect(chip).toContainText(fmt(start + 2000000), { timeout: 8000 });
});

test("top-up shows an inline VietQR, never a SePay link, and simulates to Đã nhận", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "student");
  await page.goto("/app/wallet");
  await page.getByRole("button", { name: "Nạp tiền", exact: true }).click();
  await page.getByRole("button", { name: "1.000.000 ₫" }).click();
  await page.getByRole("button", { name: "Tạo lệnh nạp 1.000.000 ₫" }).click();
  // Bank config state depends on other specs; the order is always kept and
  // nothing on the page links out to SePay.
  await expect(page.locator(".deposit-code")).toBeVisible();
  expect(await page.locator('a[href*="sepay.vn"], [href*="pay.sepay"], form[action*="sepay"]').count()).toBe(0);
  await page.getByRole("button", { name: /Giả lập tiền đã về/ }).click();
  await expect(page.getByText(/Đã nhận 1.000.000/)).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
