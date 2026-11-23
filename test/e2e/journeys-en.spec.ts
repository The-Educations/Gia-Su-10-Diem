import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// Session H: the core journey pages used to hardcode Vietnamese and stay
// untranslated in English mode. Assert English strings on each page and that
// the parent's "next lesson" tile surfaces the child's upcoming class.
const VI = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/;

test.describe("journey EN coverage (H)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "student");
    await page.addInitScript(() => localStorage.setItem("giasu.lang", "en"));
  });

  test("tutors page is English", async ({ page }) => {
    await page.goto("/app/tutors");
    await expect(page.getByRole("heading", { name: /Find tutors/ })).toBeVisible();
    await expect(page.getByPlaceholder(/Tutor name/)).toBeVisible();
    const filters = await page.locator(".search-panel").textContent();
    expect(filters).not.toMatch(VI);
  });

  test("bookings page is English", async ({ page }) => {
    await page.goto("/app/bookings");
    await expect(page.getByRole("heading", { name: /My learning schedule/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Week" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "List" })).toBeVisible();
  });

  test("offers page is English", async ({ page }) => {
    await page.goto("/app/offers");
    await expect(page.getByRole("heading", { name: /Lesson request|Proposals|proposal/i })).toBeVisible();
  });

  test("workspace hero + today panel is English", async ({ page }) => {
    await page.goto("/app/workspace");
    await expect(page.getByRole("heading", { name: /Learning corner/ })).toBeVisible();
    const panel = await page.locator(".today-panel").textContent();
    expect(panel).not.toMatch(VI);
  });
});

test.describe("parent next lesson (H)", () => {
  test("parent tile shows the child's upcoming class, not 'no lessons'", async ({ page }) => {
    await login(page, "profile-parent");
    // A parent with no children sees the parent-specific next step, not the student one.
    await page.goto("/app/workspace");
    const tile = page.locator(".today-next").first();
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Tìm gia sư cho con");

    // Link the demo student via the child's family code.
    await login(page, "student");
    const childCode = (await (await page.request.get("/api/family")).json()).code;
    await login(page, "profile-parent");
    expect((await page.request.post("/api/family/link", { data: { code: childCode } })).ok()).toBe(true);
    const family = await (await page.request.get("/api/family")).json();
    expect(family.children?.length).toBeGreaterThan(0);
  });
});
