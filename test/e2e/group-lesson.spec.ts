import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}
const fund = async (page: Page) => {
  const dep = await (await page.request.post("/api/wallet/deposits", { data: { amount: 2000000 } })).json();
  expect((await page.request.post(`/api/wallet/deposits/${dep.id}/simulate`, { data: {} })).ok()).toBe(true);
};

// In a group class the tutor's page used to keep only the FIRST student's row of each lesson. If that
// student had cancelled, the tutor saw "Đã hủy, hoàn tiền" and lost the "Đã học xong" button for everyone else.
test("group lesson: the tutor still confirms it for the students who did not cancel, and sees each student's state", async ({ browser }) => {
  const [a, b, t] = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const first = await a.newPage(), second = await b.newPage(), tutor = await t.newPage();
  const errors: string[] = [];
  for (const p of [first, second, tutor]) p.on("pageerror", (e) => errors.push(e.message));
  await login(first, "profile-student"); await login(second, "profile-other"); await login(tutor, "nam");
  await fund(first); await fund(second);
  const nam = await (await tutor.request.get("/api/tutor/profile")).json();
  // An hour of the day other specs do not use, every day, so nothing on the shared database clashes with it.
  const start = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const offer = { tutor_id: nam.user_id, subject_id: "vat-li", mode: "online", sessions: 3, minutes: 60, rate: 200000, schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, hour: 6, minute: 0 })), start_date: start, message: "" };
  const send = async (page: Page) => { const r = await page.request.post("/api/proposals", { data: offer }); const j = await r.json(); expect(r.status(), JSON.stringify(j)).toBe(201); return j.id as number; };
  const created = await (await tutor.request.patch(`/api/proposals/${await send(first)}`, { data: { action: "accept" } })).json();
  const joined = await tutor.request.patch(`/api/proposals/${await send(second)}`, { data: { action: "accept", class_id: created.class_id } });
  expect(joined.status(), await joined.text()).toBe(200);

  // The first student (the first row of every lesson) cancels the first lesson; then that lesson is over.
  const detail = async () => await (await tutor.request.get(`/api/classes/${created.class_id}`)).json() as { sessions: { id: number; student_id: number; outcome: string; tutor_confirmed_at: string | null; student_name: string }[]; members: { student_id: number; name: string }[] };
  const rowsNow = (await detail()).sessions;
  const lesson = rowsNow[0].id;
  // Whoever owns the first row of the lesson (the row the old page kept) is the one who cancels.
  const idOf = async (page: Page) => (await (await page.request.get("/api/auth/me")).json()).user.id as number;
  const canceller = rowsNow[0].student_id === (await idOf(first)) ? first : second;
  const cancelled = await canceller.request.post(`/api/sessions/${lesson}/cancel`, { data: {} });
  expect(cancelled.status(), await cancelled.text()).toBe(200);
  expect((await tutor.request.post("/__test/class-session", { data: { session_id: lesson, hours_from_now: -3, keep_outcome: true } })).ok()).toBe(true);
  const rows = (await detail()).sessions.filter((s) => s.id === lesson);
  expect(rows.map((r) => r.outcome).sort()).toEqual(["pending", "refunded"]);

  await tutor.goto(`/app/classes/${created.class_id}`);
  const row = tutor.locator(".session-row", { hasText: "Đã hủy, hoàn tiền" }).first();
  await expect(row).toBeVisible();
  // Each student's own state is listed.
  await expect(row).toContainText("Chờ xác nhận");
  for (const r of rows) await expect(row).toContainText(r.student_name);
  // And the tutor can still confirm the lesson for the student who is waiting.
  await row.scrollIntoViewIfNeeded(); await row.screenshot({ path: "test-results/group-lesson-tutor.png" });
  await row.getByRole("button", { name: "Đã học xong" }).click();
  await expect.poll(async () => (await detail()).sessions.filter((s) => s.id === lesson).map((r) => [r.outcome, !!r.tutor_confirmed_at]).sort().join("|")).toBe("pending,true|refunded,false");

  // Students are unchanged: each sees only their own row, as before.
  await canceller.goto(`/app/classes/${created.class_id}`);
  await expect(canceller.locator(".session-row", { hasText: "Đã hủy, hoàn tiền" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
