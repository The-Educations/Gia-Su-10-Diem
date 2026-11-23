import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

// Ratings on the new class flow: per-session stars + survey, end-of-package
// review, and the trust score threshold — mirrored by live-features.test.js.
test("class session ratings feed the trust score and the end-of-package review goes public", async ({ page, browser }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  // Seed a finished class session for two different students (fixture keeps the
  // class unique per run on the shared demo database).
  const seed = async (student: string) => {
    const res = await page.request.post("/__test/rated-class", { data: { student } });
    expect(res.ok()).toBe(true);
    return await res.json() as { member: number; sessions: number[] };
  };
  const mine = await seed("student"), other = await seed("profile-student");
  await login(page, "student");
  const trust = async () => ((await (await page.request.get("/api/tutors")).json()) as { name: string; user_id: number; trust: { is_new: boolean; score: number | null } }[]).find(t => t.name === "Nguyễn Minh Châu")!;
  expect((await trust()).trust.is_new).toBe(true);

  // Student rates each finished session: stars + quick survey, private.
  for (const sid of mine.sessions) {
    expect((await page.request.put(`/api/sessions/${sid}/rating`, { data: { rating: 4, answers: { on_time: true, clear: true }, comment: "Buổi tốt" } })).ok()).toBe(true);
  }
  // One rater, 3 ratings: still "Mới" (needs 2 distinct raters).
  expect((await trust()).trust.is_new).toBe(true);

  // A second student rates: 4 ratings from 2 students passes the threshold.
  const second = await browser.newContext(), peer = await second.newPage();
  await login(peer, "profile-student");
  for (const sid of other.sessions) {
    expect((await peer.request.put(`/api/sessions/${sid}/rating`, { data: { rating: 5, answers: { on_time: true } } })).ok()).toBe(true);
  }
  expect((await trust()).trust.is_new).toBe(false);
  const chau = await trust();
  expect(chau.trust.score).not.toBeNull();

  // End-of-package review goes public on the tutor page.
  expect((await page.request.post(`/api/members/${mine.member}/end`, { data: {} })).ok()).toBe(true);
  expect((await page.request.put(`/api/members/${mine.member}/review`, { data: { body: "Cô giảng dễ hiểu và rất kiên nhẫn." } })).ok()).toBe(true);
  await page.goto(`/app/tutors/${chau.user_id}`);
  await expect(page.getByText("Cô giảng dễ hiểu và rất kiên nhẫn.").first()).toBeVisible();

  // The tutor's trust breakdown shows totals, never which session got which stars.
  const tutorContext = await browser.newContext(), tutor = await tutorContext.newPage();
  await login(tutor, "chau");
  const breakdown = await (await tutor.request.get("/api/tutor/trust")).json();
  expect(breakdown.rating_count).toBeGreaterThanOrEqual(6);
  expect(JSON.stringify(breakdown)).not.toContain("session_id");
  expect(errors).toEqual([]);
  await peer.close(); await tutorContext.close();
});
