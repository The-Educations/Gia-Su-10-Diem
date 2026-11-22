import { test, expect } from "@playwright/test";

const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

test("English mode shows English across the app and switching back restores Vietnamese", async ({ page }) => {
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  await page.goto("/app/tutors");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("link", { name: "Find tutors" }).first()).toBeVisible();
  await expect(page.getByRole("searchbox").or(page.getByRole("textbox")).first()).toHaveAttribute("placeholder", /[A-Za-z]/);
  for (const path of ["/app/wallet", "/app/schedule", "/app/proposals", "/app/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Interface chrome (navigation and headings) carries no Vietnamese.
    const chrome = await page.locator("nav, h1, h2, button, label").evaluateAll((els) => els.map((e) => (e.closest('[translate="no"]') ? "" : e.textContent || "")));
    expect(chrome.filter((t) => VI.test(t.replace(/Gia Sư 10 Điểm|Minh Anh|Nguyễn Minh Châu|Lê Thảo Linh|Trần Hoàng Nam/g, "")))).toEqual([]);
  }
  await page.getByRole("button", { name: "Tiếng Việt", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tài khoản của tôi" })).toBeVisible();
});
