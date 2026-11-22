import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
  await page.getByLabel("Email", { exact: true }).fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("lesson ratings, end-of-course review and the trust score", async ({ browser, page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  const seed = async (student: string) => (await (await page.request.post("/__test/course", { data: { student, tutor: "chau", lessons: 3 } })).json()) as { offer: number; bookings: number[] };
  const mine = await seed("student"), other = await seed("profile-student");
  await login(page, "student");

  // A tutor with no ratings is "Mới".
  await page.goto("/app/tutors");
  const card = page.locator(".tutor-card", { hasText: "Nguyễn Minh Châu" });
  await expect(card).toContainText("Mới");

  // Quick lesson rating from the schedule list: stars and tags, then the result stays visible.
  await page.goto("/app/bookings?view=list&status=completed");
  await page.getByRole("button", { name: "Chấm buổi học" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "4 sao" }).click();
  for (const tag of ["Dễ hiểu", "Kiên nhẫn", "Nhiệt tình"]) await dialog.getByRole("button", { name: tag, exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Đúng giờ", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(page.getByText("Bạn chấm 4★").first()).toBeVisible();

  // A second student rates: 2 ratings is still "Mới", the third rating from 2 students is enough.
  const second = await browser.newContext(), peer = await second.newPage();
  await login(peer, "profile-student");
  const isNew = async () => ((await (await page.request.get("/api/tutors")).json()) as { name: string; trust: { is_new: boolean } }[]).find(t => t.name === "Nguyễn Minh Châu")!.trust.is_new;
  expect(await isNew()).toBe(true);
  expect((await peer.request.put(`/api/bookings/${other.bookings[0]}/rating`, { data: { rating: 5, tags: ["de_hieu"] } })).ok()).toBe(true);
  expect(await isNew()).toBe(true);
  expect((await peer.request.put(`/api/bookings/${other.bookings[1]}/rating`, { data: { rating: 5, tags: ["de_hieu"] } })).ok()).toBe(true);
  await peer.close();
  expect(await isNew()).toBe(false);

  // The course ended early: a review card appears on the overview and the review goes public.
  await page.goto("/app/workspace");
  const todo = page.getByRole("region", { name: "Khóa học cần đánh giá" });
  await expect(todo).toContainText("Toán");
  await todo.getByRole("button", { name: "Đánh giá khóa học" }).click();
  const review = page.getByRole("dialog");
  await review.getByRole("radio", { name: "5 sao" }).click();
  await review.getByLabel("Nhận xét (không bắt buộc)").fill("Gọi em 0912 345 678 nhé");
  await review.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect(review).toContainText("số điện thoại");
  await review.getByLabel("Nhận xét (không bắt buộc)").fill("Cô giảng dễ hiểu và rất kiên nhẫn.");
  await review.getByRole("button", { name: "Có", exact: true }).click();
  await review.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect(todo).toHaveCount(0);

  // Enough ratings now: the public profile shows a number, tags stay hidden below 3 uses, the review is listed.
  const tutors = await (await page.request.get("/api/tutors")).json() as { user_id: number; name: string; trust: { is_new: boolean; score: number | null; tags: { label: string }[] } }[];
  const chau = tutors.find(t => t.name === "Nguyễn Minh Châu")!;
  expect(chau.trust.is_new).toBe(false);
  expect(chau.trust.tags.map(t => t.label)).toEqual(["Dễ hiểu"]);
  await page.goto(`/app/tutors/${chau.user_id}`);
  await expect(page.getByText("Cô giảng dễ hiểu và rất kiên nhẫn.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Học sinh thường nhận xét" })).toContainText("Dễ hiểu");
  await expect(page.getByRole("list", { name: "Học sinh thường nhận xét" })).not.toContainText("Kiên nhẫn");
  await expect(page.getByText("Có muốn học tiếp")).toHaveCount(0);
  await page.goto("/app/tutors");
  await expect(page.locator(".tutor-card", { hasText: "Nguyễn Minh Châu" })).toContainText(/\d,\d · 1 đánh giá/);

  // The tutor sees the breakdown, never which lesson got how many stars.
  const tutorContext = await browser.newContext(), tutor = await tutorContext.newPage();
  await login(tutor, "chau");
  await tutor.goto("/app/studio?tab=ratings");
  await expect(tutor.getByRole("heading", { name: "Điểm hiện tại" })).toBeVisible();
  await expect(tutor.getByText("Chất lượng (Q)")).toBeVisible();
  await expect(tutor.getByText("Bạn chỉ thấy số liệu tổng hợp")).toBeVisible();
  await expect(tutor.getByText("Bạn chấm")).toHaveCount(0);
  const seen = JSON.stringify(await (await tutor.request.get("/api/bookings")).json());
  expect(seen).not.toContain("my_rating");

  for (const [width, height] of [[360, 800], [1440, 1000]] as const) {
    for (const target of [page, tutor]) {
      await target.setViewportSize({ width, height });
      expect(await noOverflow(target)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
