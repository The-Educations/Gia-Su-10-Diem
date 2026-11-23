import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}
// Serious/critical must be zero everywhere; moderate is reported, not failed.
async function axe(page: Page, label: string, moderate: string[]) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""));
  for (const v of r.violations.filter((v) => v.impact === "moderate")) moderate.push(`${label}: ${v.id} ×${v.nodes.length}`);
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join("")).join(" | ")}`), `axe on ${label}`).toEqual([]);
}

const moderate: string[] = [];

test.afterAll(() => { if (moderate.length) console.log("MODERATE:", moderate.join("\n")); });

test("a11y: main pages pass axe with no serious violations", async ({ page }) => {
  // The landing animates reveals on load — let it paint before scanning.
  await page.goto("/"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
  await axe(page, "landing");
  await page.goto("/app/auth"); await page.waitForLoadState("networkidle"); await axe(page, "auth");
  await login(page, "student");
  for (const [url, label] of [["/app", "dashboard"], ["/app/tutors", "tutors"], ["/app/schedule", "schedule"], ["/app/classes", "classes"], ["/app/messages", "messages"], ["/app/wallet", "wallet"], ["/app/offers", "offers"]] as const) {
    await page.goto(url); await page.waitForLoadState("networkidle"); await axe(page, `student ${label}`);
  }
  const t = await page.request.get("/api/tutors");
  const tid = (await t.json())[0]?.id;
  if (tid) { await page.goto(`/app/tutors/${tid}`); await page.waitForLoadState("networkidle"); await axe(page, "tutor detail"); }
});

test("a11y: tutor and admin roles", async ({ page }) => {
  await login(page, "chau");
  for (const url of ["/app", "/app/schedule", "/app/classes"]) { await page.goto(url); await page.waitForLoadState("networkidle"); await axe(page, `tutor ${url}`); }
});

test("a11y: admin tabs", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/app/admin"); await page.waitForLoadState("networkidle"); await axe(page, "admin today");
  for (const tab of ["finance", "classes", "safety", "audit"]) {
    const t = page.getByRole("tab", { name: new RegExp({ finance: "Tài chính", classes: "Lớp học", safety: "An toàn", audit: "Nhật ký" }[tab]!) });
    if (await t.count()) { await t.click(); await page.waitForTimeout(400); await axe(page, `admin ${tab}`); }
  }
});

test("a11y: dialogs trap focus, Esc closes, focus returns", async ({ page }) => {
  await login(page, "student");
  await page.goto("/app/wallet"); await page.waitForLoadState("networkidle");
  const depositBtn = page.getByRole("button", { name: /Nạp|nạp/ }).first();
  if (!(await depositBtn.count())) return;
  await depositBtn.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await axe(page, "deposit dialog", moderate);
  // Focus trap: Tabbing past the last control returns to the first.
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  const inside = await page.evaluate(() => document.activeElement && !!document.querySelector("[role=dialog]")?.contains(document.activeElement));
  expect(inside, "focus escaped the dialog").toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent)).toMatch(/Nạp|nạp/);
});

test("a11y: icon buttons are labelled, reduced-motion is honoured", async ({ page }) => {
  await login(page, "student");
  await page.goto("/app"); await page.waitForLoadState("networkidle");
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => !b.textContent?.trim() && !b.getAttribute("aria-label") && !b.getAttribute("title") && !b.getAttribute("aria-labelledby")).length);
  expect(unlabelled, "icon buttons without a label").toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/app/schedule");
  const anim = await page.evaluate(() => getComputedStyle(document.body).animationDuration);
  // With reduced motion honoured, animations collapse to ~0s.
  const secs = parseFloat(anim) || 1;
  expect(secs <= 0.05 || anim === "none", `animation not reduced (${anim})`).toBe(true);
});
