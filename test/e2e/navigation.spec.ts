import { test, expect } from "@playwright/test";

test("desktop collapse persists and mobile navigation stays expanded", async ({ page }) => {
  await page.goto("/app/tutors");
  const sidebar = page.getByRole("complementary", { name: "Thanh điều hướng" });
  const logo = sidebar.getByRole("link", { name: "Gia Sư 10 Điểm", exact: true });
  await expect(logo).toBeVisible();
  const toggle = sidebar.getByRole("button", { name: "Thu gọn thanh điều hướng" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Mở rộng thanh điều hướng" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => sidebar.evaluate(e => e.getBoundingClientRect().width)).toBe(76);
  await expect(logo).toBeVisible();
  const mark = logo.locator(".brand-mark");
  await expect(mark).toBeVisible();
  const sidebarBox = await sidebar.boundingBox(), markBox = await mark.boundingBox();
  expect(markBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x);
  expect(markBox!.x + markBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width);
  await expect(logo).toHaveAttribute("href", "/app/tutors");
  await sidebar.getByRole("link", { name: "Tìm môn học" }).click();
  await expect(page).toHaveURL(/library$/);
  await page.reload();
  await expect(sidebar).toHaveCSS("width", "76px");
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(sidebar).not.toBeVisible();
  const menu = page.getByRole("button", { name: "Mở điều hướng" });
  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Tìm môn học", { exact: true })).toBeVisible();
  expect(await drawer.getByText("Tìm môn học", { exact: true }).evaluate(e => getComputedStyle(e).opacity)).toBe("1");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole("link", { name: "Tìm môn học" }).click();
  await expect(drawer).not.toBeVisible();
  await menu.click();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(drawer).not.toBeVisible();
  await expect(sidebar).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Mở rộng thanh điều hướng" }).click();
  await expect(sidebar).toHaveCSS("width", "216px");
  expect(await sidebar.evaluate(e => parseFloat(getComputedStyle(e).transitionDuration))).toBeLessThan(0.01);
});

test("public app pages fit small phones, tablets and desktops", async ({ page }) => {
  for (const path of ["/app/tutors", "/app/library", "/app/news", "/app/auth?mode=register"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (path === "/app/tutors") await expect(page.getByRole("combobox", { name: "Sắp xếp", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (path === "/app/tutors" && width <= 390) {
        const menu = await page.getByRole("button", { name: "Mở điều hướng" }).boundingBox();
        expect(menu!.width).toBeGreaterThanOrEqual(44);
        expect(menu!.height).toBeGreaterThanOrEqual(44);
        const subject = page.getByRole("combobox", { name: "Môn học", exact: true });
        expect((await subject.boundingBox())!.width).toBeGreaterThan(240);
      }
    }
  }
});

// Sample the moving surface, not just its settled position: a tilted dialog can
// look correct at rest while still being the wrong motion for edge navigation.
test("mobile drawer slides flat, restores focus and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/tutors");
  const menu = page.getByRole("button", { name: "Mở điều hướng" });
  const drawer = page.getByRole("dialog");
  const record = () => page.evaluate(() => new Promise<{ x: number; flat: boolean; filter: string; state: string | null }[]>(resolve => {
    const frames: { x: number; flat: boolean; filter: string; state: string | null }[] = [];
    const start = performance.now();
    function frame() {
      const el = document.querySelector('[data-slot="sheet-content"]');
      if (el) {
        const style = getComputedStyle(el), matrix = new DOMMatrixReadOnly(style.transform);
        frames.push({ x: el.getBoundingClientRect().x, flat: matrix.is2D && matrix.a === 1 && matrix.d === 1, filter: style.filter, state: el.getAttribute("data-state") });
      }
      if (performance.now() - start < 650) requestAnimationFrame(frame); else resolve(frames);
    }
    requestAnimationFrame(frame);
  }));
  const entering = record();
  await menu.click();
  const frames = await entering;
  expect(frames.some(f => f.x < -1)).toBe(true);
  expect(frames.every(f => f.flat && f.filter === "none" && f.x <= 0.1)).toBe(true);
  const leaving = record();
  await page.keyboard.press("Escape");
  const exitFrames = (await leaving).filter(f => f.state === "closed");
  expect(exitFrames.some(f => f.x < -1)).toBe(true);
  expect(exitFrames.every(f => f.flat && f.filter === "none")).toBe(true);
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
  // Interrupt entry repeatedly; the final close must release scroll and focus.
  for (let i = 0; i < 3; i++) {
    await menu.click();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(menu).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = record();
  await menu.click();
  expect((await reduced).every(f => Math.abs(f.x) < 0.1 && f.flat)).toBe(true);
  await drawer.getByRole("link", { name: "Tìm môn học" }).click();
  await expect(page).toHaveURL(/library$/);
  await expect(drawer).toHaveCount(0);
  await expect(page.locator("main")).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
});

for (const [slug, extra] of [
  ["student", ["availability", "favorites"]],
  ["community-parent", ["availability"]],
  ["chau", ["studio", "calendar"]],
  ["admin", ["admin", "calendar"]],
] as const) {
  test(`${slug} workspace fits phones and keeps navigation reachable in landscape`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } });
    expect(response.ok()).toBe(true);
    for (const route of ["workspace", "settings", "messages", "offers", "bookings", ...extra]) {
      await page.goto(`/app/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator('main [role="status"][aria-label="Đang tải"]')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 667, height: 375 });
    const menu = page.getByRole("button", { name: "Mở điều hướng" });
    await menu.tap();
    const drawer = page.getByRole("dialog");
    const logo = drawer.getByRole("link", { name: "Gia Sư 10 Điểm", exact: true });
    const close = drawer.getByRole("button", { name: "Đóng", exact: true });
    await expect(logo).toBeInViewport();
    await drawer.getByRole("button", { name: "Đăng xuất", exact: true }).scrollIntoViewIfNeeded();
    await expect(drawer.getByRole("button", { name: "Đăng xuất", exact: true })).toBeInViewport();
    await expect(logo).toBeInViewport();
    await expect(close).toBeInViewport();
    await close.tap();
    await expect(drawer).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.tap();
    await expect.poll(() => drawer.evaluate(el => el.getBoundingClientRect().x)).toBe(0);
    await page.touchscreen.tap(640, 150);
    await expect(drawer).toHaveCount(0);
    expect(errors).toEqual([]);
    await context.close();
  });
}
