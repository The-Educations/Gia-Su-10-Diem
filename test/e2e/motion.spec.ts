import { test, expect, type Page } from "@playwright/test";

async function admin(page: Page) {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByLabel("Email", { exact: true }).fill("admin@demo.giasu.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("textbox", { name: "Tìm trong danh sách" }).fill("Nguyễn Minh Châu");
}

function recordDialog(page: Page) {
  return page.evaluate(() => new Promise<{ width: number; height: number; opacity: number; flat: boolean; filter: string; text: string; state: string | null }[]>(resolve => {
    const frames: { width: number; height: number; opacity: number; flat: boolean; filter: string; text: string; state: string | null }[] = [];
    const start = performance.now();
    function frame() {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const rect = dialog.getBoundingClientRect(), style = getComputedStyle(dialog), matrix = new DOMMatrixReadOnly(style.transform);
        frames.push({ width: rect.width, height: rect.height, opacity: Number(style.opacity), flat: matrix.is2D && matrix.a === 1 && matrix.d === 1, filter: style.filter, text: dialog.textContent || "", state: dialog.getAttribute("data-state") });
      }
      if (performance.now() - start < 700) requestAnimationFrame(frame); else resolve(frames);
    }
    requestAnimationFrame(frame);
  }));
}

test("tutor review opens without tilt or resizing, retains content on exit and restores focus", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await admin(page);
  const trigger = page.getByRole("button", { name: "Xem & duyệt", exact: true });
  await trigger.focus();
  const entering = recordDialog(page);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Xem & duyệt hồ sơ" })).toBeFocused();
  const frames = await entering;
  expect(frames.length).toBeGreaterThan(2);
  expect(frames.every(f => f.flat && f.filter === "none")).toBe(true);
  expect(Math.max(...frames.map(f => f.width)) - Math.min(...frames.map(f => f.width))).toBeLessThan(1);
  expect(Math.max(...frames.map(f => f.height)) - Math.min(...frames.map(f => f.height))).toBeLessThan(1);
  await dialog.locator("summary").filter({ hasText: "Kho giao diện" }).scrollIntoViewIfNeeded();
  const leaving = recordDialog(page);
  await page.keyboard.press("Escape");
  const exitFrames = (await leaving).filter(f => f.state === "closed");
  expect(exitFrames.length).toBeGreaterThan(0);
  expect(exitFrames.every(f => f.text.includes("Nguyễn Minh Châu") && f.flat && Math.abs(f.height - frames.at(-1)!.height) < 1)).toBe(true);
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  // Repeated keyboard opens/closes must release the focus trap and overlay.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Xem & duyệt hồ sơ" })).toBeFocused();
    expect(await page.locator(".tutor-review-body").evaluate(el => el.scrollTop)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  }
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("review stays stable during delivery failures and focuses the list after a filtered row disappears", async ({ page }) => {
  await admin(page);
  await page.request.patch("/api/admin/tutors/3", { data: { status: "pending" } });
  await page.reload();
  await page.getByRole("textbox", { name: "Tìm trong danh sách" }).fill("Nguyễn Minh Châu");
  await page.getByRole("combobox", { name: "Trạng thái hồ sơ", exact: true }).click();
  await page.getByRole("option", { name: "Chờ duyệt", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Xem & duyệt", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  let finish!: () => void;
  const hold = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/admin/tutors/*", async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    await hold;
    await route.fulfill({ status: 503, json: { error: "Chưa gửi được email. Vui lòng thử lại." } });
  });
  const before = await dialog.boundingBox();
  await dialog.getByRole("button", { name: "Duyệt & công bố", exact: true }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(dialog.getByRole("button", { name: "Đóng", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  expect((await dialog.boundingBox())!.height).toBeCloseTo(before!.height, 2);
  finish();
  await expect(dialog.getByText("Chưa gửi được email. Vui lòng thử lại.", { exact: true })).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/admin/tutors/*");
  await dialog.getByRole("button", { name: "Duyệt & công bố", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Tìm trong danh sách" })).toBeFocused();
  await expect(trigger).toHaveCount(0);
  // Restore the fixture for the remaining journeys.
  expect((await page.request.patch("/api/admin/tutors/3", { data: { status: "approved" } })).ok()).toBe(true);
});

test("review and shared dialogs fit mobile and reduced motion keeps text still", async ({ page }) => {
  await admin(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole("button", { name: "Xem & duyệt", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Xem & duyệt hồ sơ" })).toBeFocused();
    const state = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      const actions = el.querySelector(".tutor-review-actions")!.getBoundingClientRect();
      return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, controls: actions.bottom <= r.bottom, transform: css.transform, filter: css.filter, duration: parseFloat(css.animationDuration) };
    });
    expect(state.fits && state.controls).toBe(true);
    expect(state.transform).toBe("none"); expect(state.filter).toBe("none"); expect(state.duration).toBeLessThan(.001);
    await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/app/admin?tab=subjects");
  const add = page.getByRole("button", { name: "Thêm môn", exact: true });
  await add.click();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng", exact: true }).click();
  await expect(add).toBeFocused();
});
