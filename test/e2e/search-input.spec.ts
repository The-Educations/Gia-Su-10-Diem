import { test, expect, type Page } from "@playwright/test";

// Vietnamese typists use an IME (Telex/VNI): the browser composes each syllable in the
// field and commits it with the space key. A search box whose value round-trips through
// the router rewrites the field mid-composition and the text multiplies ("nngngu…").
// CDP lets us drive a real composition instead of faking keystrokes.
async function compose(page: Page, field: string, syllable: string) {
  const cdp = await page.context().newCDPSession(page);
  for (let i = 1; i <= syllable.length; i++) {
    const text = syllable.slice(0, i);
    await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
    await page.waitForTimeout(60);
  }
  await cdp.send("Input.insertText", { text: `${syllable} ` });
}

const FIELDS = [
  ["tutor search", "/app/tutors", "#tutor-search"],
  ["library search", "/app/library", "#catalog-search"],
] as const;

for (const [name, path, field] of FIELDS) {
  test(`${name} keeps exactly what an IME commits`, async ({ page }) => {
    await page.goto(path);
    await page.waitForSelector(field);
    await page.click(field);
    await compose(page, field, "nguyên");
    await compose(page, field, "văn");
    await expect(page.locator(field)).toHaveValue("nguyên văn ");
    // The URL catches up with the final text, not with an intermediate rewrite.
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("nguyên văn ");
    await expect(page.locator(field)).toHaveValue("nguyên văn ");
    await expect(page.locator(".search-input svg")).toHaveCount(1);
  });

  test(`${name} does not drop letters when typed fast`, async ({ page }) => {
    await page.goto(path);
    await page.waitForSelector(field);
    await page.click(field);
    await page.keyboard.type("nguyen van a");
    await expect(page.locator(field)).toHaveValue("nguyen van a");
  });
}

test("tutor search starts from the URL and clears with the filter chip", async ({ page }) => {
  await page.goto("/app/tutors?q=toan");
  await page.waitForSelector("#tutor-search");
  await expect(page.locator("#tutor-search")).toHaveValue("toan");
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await expect(page.locator("#tutor-search")).toHaveValue("");
});
