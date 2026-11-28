import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, slug: string) {
  expect((await page.request.post("/api/auth/login", { data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" } })).ok()).toBe(true);
}

test("a free trial package has no renewal: the student is invited to send a course offer, the tutor gets no reminder button", async ({ browser }) => {
  const sc = await browser.newContext(), tc = await browser.newContext();
  const student = await sc.newPage(), tutor = await tc.newPage();
  const errors: string[] = [];
  for (const p of [student, tutor]) p.on("pageerror", (e) => errors.push(e.message));
  await login(student, "profile-student"); await login(tutor, "chau");
  const made = await (await student.request.post("/__test/trial-class", { data: { student: "profile-student" } })).json() as { class_id: number; tutor_id: number };

  await student.goto(`/app/classes/${made.class_id}?tab=people`);
  const list = student.locator(".member-list");
  await expect(list).toContainText("Học thử");
  await expect(list).toContainText("Còn 1 buổi sắp tới");
  await expect(student.getByText("Đây là buổi học thử.")).toBeVisible();
  const invite = student.getByRole("link", { name: "Gửi đề nghị học tiếp" });
  await expect(invite).toHaveAttribute("href", `/app/tutors/${made.tutor_id}`);
  await expect(student.getByLabel("Gia hạn thêm (buổi)")).toHaveCount(0);
  await expect(student.getByRole("button", { name: /^Gia hạn/ })).toHaveCount(0);
  await student.screenshot({ path: "test-results/trial-package-student.png" });

  await tutor.goto(`/app/classes/${made.class_id}?tab=people`);
  await expect(tutor.locator(".member-list")).toContainText("Học thử");
  await expect(tutor.getByRole("button", { name: "Nhắc gia hạn" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an ordinary package keeps its renew form, and the tutor's reminder follows the lessons still ahead", async ({ browser }) => {
  const sc = await browser.newContext(), tc = await browser.newContext();
  const student = await sc.newPage(), tutor = await tc.newPage();
  await login(student, "profile-other"); await login(tutor, "nam");
  const nam = await (await tutor.request.get("/api/tutor/profile")).json();
  const dep = await (await student.request.post("/api/wallet/deposits", { data: { amount: 3000000 } })).json();
  expect((await student.request.post(`/api/wallet/deposits/${dep.id}/simulate`, { data: {} })).ok()).toBe(true);
  const start = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10);
  const open = async (sessions: number, weekday: number) => {
    const sent = await student.request.post("/api/proposals", { data: { tutor_id: nam.user_id, subject_id: "vat-li", mode: "online", sessions, minutes: 60, rate: 200000, schedule: [{ weekday, hour: 19, minute: 0 }], start_date: start, message: "" } });
    const offer = await sent.json();
    expect(sent.status(), JSON.stringify(offer)).toBe(201);
    return (await (await tutor.request.patch(`/api/proposals/${offer.id}`, { data: { action: "accept" } })).json()).class_id as number;
  };
  // Two lessons ahead: the reminder is offered. The student can renew, and is not told it is a trial.
  const two = await open(2, 3);
  await tutor.goto(`/app/classes/${two}?tab=people`);
  await expect(tutor.locator(".member-list")).toContainText("Còn 2 buổi sắp tới");
  await expect(tutor.getByRole("button", { name: "Nhắc gia hạn" })).toBeVisible();
  await student.goto(`/app/classes/${two}?tab=people`);
  await expect(student.getByLabel("Gia hạn thêm (buổi)")).toBeVisible();
  await expect(student.getByText("Đây là buổi học thử.")).toHaveCount(0);
  await expect(student.locator(".member-list")).not.toContainText("Học thử");
});
