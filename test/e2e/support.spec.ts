import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}

test("students, parents and tutors get pinned admin support with private two-way replies", async ({ browser }) => {
  const adminContext = await browser.newContext(), admin = await adminContext.newPage();
  await login(admin, "admin");
  await expect(admin.getByRole("link", { name: "Tin nhắn", exact: true })).toBeVisible();
  for (const slug of ["student", "community-parent", "chau"]) {
    const context = await browser.newContext(), page = await context.newPage();
    await login(page, slug);
    const { user } = await (await page.request.get("/api/auth/me")).json();
    await page.goto("/app/messages");
    await expect(page.getByRole("complementary", { name: "Tin nhắn được ghim" })).toContainText("admin@giasudiem10.online");
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const question = `Hỗ trợ riêng cho ${slug}`;
    await page.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill(question);
    await page.getByRole("button", { name: "Gửi", exact: true }).click();
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    await admin.goto("/app/messages");
    await admin.locator(".conversation-list button").filter({ hasText: user.name }).filter({ hasText: "Hỗ trợ" }).click();
    await expect(admin.getByText(question, { exact: true })).toBeVisible();
    await admin.getByRole("textbox", { name: "Tin nhắn", exact: true }).fill(`Đã hỗ trợ ${slug}`);
    await admin.getByRole("button", { name: "Gửi", exact: true }).click();
    await page.reload();
    await expect(page.getByText(`Đã hỗ trợ ${slug}`, { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Cuộc trò chuyện", exact: true }).click();
    await expect(page.locator(".conversation-list button").first()).toContainText("Hỗ trợ Gia Sư 10 Điểm");
    await context.close();
  }
  await adminContext.close();
});

test("admin deletion requires matching email and preserves the account when cancelled or failed", async ({ browser, page }) => {
  const context = await browser.newContext();
  const email = "delete-test@browser.test";
  expect((await context.request.post("/api/auth/register", {data:{name:"Tài khoản kiểm tra xóa",email,password:"BrowserStudy2026!"}})).status()).toBe(202);
  const code = (await (await context.request.get(`/__test/email?email=${email}`)).json()).code;
  const result = await context.request.post("/api/auth/signup/verify", {data:{code}});
  const { user } = await result.json();
  await login(page,"admin");
  await page.goto("/app/admin?tab=users");
  await page.getByLabel("Tìm trong danh sách").fill(email);
  const row=page.locator(".admin-list article").filter({hasText:email});
  await row.getByRole("button",{name:"Xóa tài khoản",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Xóa tài khoản?"});
  await expect(dialog).toContainText("Tài khoản đã xóa");
  await dialog.getByRole("button",{name:"Hủy",exact:true}).click();
  expect((await (await context.request.get("/api/auth/me")).json()).user.id).toBe(user.id);
  await row.getByRole("button",{name:"Xóa tài khoản",exact:true}).click();
  const confirm=dialog.getByRole("button",{name:"Xác nhận xóa tài khoản",exact:true});
  await dialog.getByLabel("Nhập lại email tài khoản để xác nhận").fill("wrong@example.test");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Nhập lại email tài khoản để xác nhận").fill(email);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.route(`**/api/admin/users/${user.id}`,route=>route.fulfill({status:503,json:{error:"Chưa xóa được tài khoản."}}));
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("Chưa xóa được");
  expect((await (await context.request.get("/api/auth/me")).json()).user.id).toBe(user.id);
  await page.unroute(`**/api/admin/users/${user.id}`);
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toHaveCount(0);
  expect((await (await context.request.get("/api/auth/me")).json()).user).toBeNull();
  await context.close();
});
