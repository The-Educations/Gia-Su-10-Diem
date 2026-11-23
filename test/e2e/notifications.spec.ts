import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}
// Specs that read a user's notification rows must own the user — demo accounts
// accumulate threads and pending proposals from earlier runs in the same shard.
async function freshStudent(page: Page, name = "Bell Check") {
  const email = `bell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@browser.test`,
    password = "BrowserStudy2026!";
  await page.request.post("/api/auth/register", { data: { name, email, password } });
  const mail = await (await page.request.get(`/__test/email?email=${encodeURIComponent(email)}`)).json();
  await page.request.post("/api/auth/signup/verify", { data: { code: mail.code } });
  expect((await page.request.post("/api/auth/login", { data: { email, password } })).ok()).toBe(true);
  // Finish onboarding or /app routes bounce to the wizard.
  expect((await page.request.put("/api/account/onboarding", { data: { step: 0, role: "student" } })).ok()).toBe(true);
  expect((await page.request.put("/api/account/onboarding", { data: { step: 1, name, display_name: name, school: "THPT", goal: "Test", timezone: "Asia/Ho_Chi_Minh", province_code: "1", ward_code: "4" } })).ok()).toBe(true);
  return (await (await page.request.get("/api/auth/me")).json()).user;
}

test("bell: new notice arrives, badge ticks up, click lands on the right page and reads it", async ({ page, playwright }) => {
  await login(page, "student");
  await page.goto("/app/messages");
  // A second user (the tutor) in a separate request context sends a real message
  // into the student's thread — the student's poll must see it without a reload.
  const tutor = await playwright.request.newContext();
  expect((await tutor.post("/api/auth/login", { data: { email: "chau@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  // Student opens a thread to the tutor first so the pair always exists.
  const open = await page.request.post("/api/inquiries", { data: { tutor_id: 3, body: "Xin chào ạ" } });
  const openJson = await open.json();
  const threadId = openJson?.id ?? (await (await tutor.get("/api/inquiries")).json())[0]?.id;
  const send = await tutor.post(`/api/inquiries/${threadId}/messages`, { data: { body: "Xin chào, kiểm tra chuông nhé" } });
  expect([200, 201]).toContain(send.status());

  const badge = page.locator(".notification-count");
  await expect(badge).toBeVisible({ timeout: 20000 });
  await page.locator(".notification-trigger").click();
  const panel = page.locator(".notification-panel");
  await expect(panel).toBeVisible();
  const rows = await (await page.request.get("/api/notifications")).json();
  const mine = rows.find((r) => r.link?.includes(`inquiry=${threadId}`));
  expect(mine).toBeTruthy();
  const item = panel.locator(`a[data-unread][href*="inquiry=${threadId}"]`);
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/app\/(messages|bookings|inquiries)/);
  await page.locator(".notification-trigger").click();
  await expect(panel.locator(`a[data-unread][href*="inquiry=${threadId}"]`)).toHaveCount(0);
  await tutor.dispose();
});

test("toasts fire only for notices that arrive after the page is open", async ({ page, playwright }) => {
  const me = await freshStudent(page, "Toast Check");
  const password = "BrowserStudy2026!";
  const tutors = [];
  const propose = async (tutorEmail) => {
    const ctx = await playwright.request.newContext();
    await ctx.post("/api/auth/login", { data: { email: tutorEmail, password } });
    const r = await ctx.post("/api/proposals", { data: { student_id: me.id, subject_id: "toan", mode: "online", sessions: 1, minutes: 60, rate: 200000, schedule: [{ weekday: 0, hour: 18, minute: 0 }], start_date: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10) } });
    const pid = (await r.json()).id;
    if (r.ok()) tutors.push({ ctx, pid }); else await ctx.dispose();
    return r;
  };
  try {
    // A notice that exists before the app loads is seeded, not toasted.
    expect((await propose("chau@demo.giasu.test")).status()).toBe(201);
    await page.goto("/app/messages");
    await page.waitForTimeout(2000);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    // The next important arrival — from the second poll on — toasts exactly once.
    expect((await propose("nam@demo.giasu.test")).status()).toBe(201);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(1, { timeout: 20000 });
  } finally {
    for (const { ctx, pid } of tutors) {
      await ctx.patch(`/api/proposals/${pid}`, { data: { action: "withdraw" } });
      await ctx.dispose();
    }
  }
});
