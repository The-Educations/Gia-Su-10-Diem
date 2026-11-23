import { test, expect } from "@playwright/test";

test("the blog writer: Tab indents, a menu follows the selection, blocks come from +, and the preview matches", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  expect((await page.request.post("/api/auth/login", { data: { email: "student@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  await page.goto("/app/community/write");
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Cách mình ôn thi vào lớp 10");
  const editor = page.getByRole("textbox", { name: "Nội dung", exact: true });
  await editor.click();

  // Tab stays in the editor: a tab stop in a paragraph, a nested item in a list.
  await page.keyboard.type("Kế hoạch");
  await page.keyboard.press("Tab");
  await page.keyboard.type("3 tháng");
  await expect(editor).toBeFocused();
  await expect(editor.locator("p").first()).toHaveText("Kế hoạch\t3 tháng");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- Toán");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Hình học");
  await expect(editor.locator("ul ul li")).toHaveText("Hình học");
  await page.keyboard.press("Shift+Tab");
  await expect(editor.locator("ul ul")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // The + on an empty line adds a divider.
  await page.getByRole("button", { name: "Thêm khối" }).click();
  await page.getByRole("group", { name: "Thêm khối" }).getByRole("button", { name: "Đường phân cách" }).click();
  await expect(editor.locator("hr")).toHaveCount(1);
  await page.keyboard.type("Chúc các bạn thi tốt");

  // Selecting text shows the floating menu; Ctrl+K opens the link fields.
  await editor.locator("p", { hasText: "Chúc các bạn" }).click({ clickCount: 3 });
  const bubble = page.locator(".editor-bubble");
  await bubble.getByRole("button", { name: "In đậm" }).click();
  await expect(editor.locator("strong")).toHaveText("Chúc các bạn thi tốt");
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByLabel("Địa chỉ liên kết")).toBeVisible();

  // Escape leaves the editor so Tab moves on.
  await editor.click();
  await page.keyboard.press("Escape");
  await expect(editor).not.toBeFocused();

  await page.getByRole("button", { name: "Xem trước", exact: true }).click();
  const preview = page.locator(".compose-preview");
  await expect(preview.getByRole("heading", { name: "Cách mình ôn thi vào lớp 10" })).toBeVisible();
  await expect(preview.locator("hr")).toHaveCount(1);
  await page.getByRole("button", { name: "Viết", exact: true }).click();
  await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã lưu nháp" })).toBeVisible();
  const draftId = new URL(page.url()).searchParams.get("draft");
  const draft = await (await page.request.get(`/api/community/drafts/${draftId}`)).json();
  expect(draft.body_html).toMatch(/<hr\s*\/?>/);
  expect(draft.body_html).toContain("Kế hoạch\t3 tháng");
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
