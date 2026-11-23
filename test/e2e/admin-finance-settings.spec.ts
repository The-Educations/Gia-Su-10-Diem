import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("admin finance splits into sections and saves a Xu pack price", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin");

  // Default section is the payout queue; the sub-nav keeps tab=finance in the URL.
  await page.goto("/app/admin?tab=finance");
  const nav = page.getByRole("navigation", { name: "Mục tài chính" });
  await expect(nav.getByRole("link", { name: /Chuyển tiền/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Cần chuyển tiền" })).toBeVisible();
  await nav.getByRole("link", { name: /Nạp tiền/ }).click();
  await expect(page).toHaveURL(/tab=finance&fin=deposits/);
  await expect(page.getByRole("heading", { name: "Nạp tiền thành công" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kiểm tra lại với SePay" })).toBeVisible();

  await page.goto("/app/admin?tab=finance&fin=settings");
  const save = page.getByRole("button", { name: "Lưu cài đặt" }), undo = page.getByRole("button", { name: "Hoàn tác" });
  await expect(save).toBeDisabled();
  const price = page.getByLabel("Giá gói 1 (VND)");
  await price.fill("60000");
  await expect(save).toBeEnabled();
  await undo.click();
  await expect(price).toHaveValue("50000");
  await expect(save).toBeDisabled();

  // Two packs with the same Xu count cannot be saved.
  await page.getByRole("button", { name: "Thêm gói" }).click();
  await page.getByLabel("Số Xu của gói 3").fill("10");
  await page.getByLabel("Giá gói 3 (VND)").fill("40000");
  await expect(page.getByRole("alert").filter({ hasText: "Mỗi gói cần số Xu khác nhau." })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Xóa gói 3" }).click();

  await price.fill("60000");
  await save.click();
  await expect(page.getByText("Đã lưu cài đặt")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Giá gói 1 (VND)")).toHaveValue("60000");
  await expect(page.getByRole("button", { name: "Lưu cài đặt" })).toBeDisabled();
  const packs = (await (await page.request.get("/api/admin/finance")).json()).settings.credit_packs;
  expect(packs[0]).toEqual({ credits: 10, price: 60000 });

  // Put the default back so later browser tests see the seeded packs.
  expect((await page.request.put("/api/admin/settings", { data: { credit_packs: [{ credits: 10, price: 50000 }, ...packs.slice(1)] } })).ok()).toBe(true);
  expect(errors).toEqual([]);
});
