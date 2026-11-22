import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function login(page: Page, slug: string, next = "/workspace") {
  await page.goto(`/app/auth?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
  await page.getByLabel("Email", { exact: true }).fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname + url.search === `/app${next}`);
}
const add = async (request: APIRequestContext, post: Record<string, unknown>) => {
  const r = await request.post("/__test/community-post", { data: post });
  expect(r.status()).toBe(200);
  return (await r.json()).id as number;
};
const ticker = (page: Page) => page.getByRole("region", { name: "Đang tìm gia sư" });
const animation = (page: Page) =>
  page.locator(".ticker-track").evaluate((el) => getComputedStyle(el).animationName);
const shiftX = (page: Page) =>
  page.locator(".ticker-track").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => {
  await request.post("/__test/community-posts/clear");
});
test.afterAll(async ({ request }) => {
  await request.post("/__test/community-posts/clear");
});

const SEEKING = ["Tìm gia sư Toán lớp 9", "Cần gia sư Tiếng Anh", "Kiếm gia sư Hóa học", "Cần người dạy Vật lí", "Tìm giáo viên IELTS", "Cần gia sư Ngữ văn lớp 11"];
const LONG_BODY = "Con học lớp 9 đang yếu hình học không gian, cần ôn thi vào lớp 10 trường chuyên trong sáu tháng tới nên mong tìm được thầy cô tận tâm.";

test("the ticker sits in the top bar of every tutor page; students and an empty list get nothing", async ({ page, request }) => {
  await login(page, "chau");
  await expect(page.getByText("Buổi dạy tiếp theo")).toBeVisible();
  await expect(ticker(page)).toHaveCount(0); // nothing to show: no empty box
  await add(request, { author: "profile-student", title: SEEKING[0], body: LONG_BODY });
  const loaded = page.waitForResponse((r) => r.url().endsWith("/api/community/requests"));
  await page.reload();
  expect((await loaded).status()).toBe(200);
  await expect(ticker(page)).toBeVisible();
  // It lives in the top bar, between the page name and the language switch, and not in the dashboard body.
  const place = await page.evaluate(() => {
    const t = document.querySelector(".topbar-ticker")!,
      bar = document.querySelector(".topbar")!,
      location = bar.querySelector(".topbar-location")!,
      right = bar.querySelector(".topbar-right")!,
      main = document.querySelector("main")!;
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { inBar: bar.contains(t), afterLocation: follows(location, t), beforeSwitch: follows(t, right), inMain: main.contains(t) };
  });
  expect(place).toEqual({ inBar: true, afterLocation: true, beforeSwitch: true, inMain: false });
  await expect(page.getByRole("heading", { name: "Đang tìm gia sư" })).toHaveCount(0);
  // The bar stays when the tutor moves to another page.
  await page.getByRole("link", { name: "Lịch dạy của tôi" }).first().click();
  await expect(page).toHaveURL(/\/app\/bookings/);
  await expect(ticker(page)).toBeVisible();

  const student = await page.context().browser()!.newContext();
  const studentPage = await student.newPage();
  await login(studentPage, "profile-student");
  await expect(studentPage.getByText("Buổi học tiếp theo")).toBeVisible();
  await expect(ticker(studentPage)).toHaveCount(0);
  await student.close();
});

test("each item shows the avatar, who posted, the topic and a short summary; a click opens the whole post", async ({ page, request }) => {
  const first = await add(request, { author: "profile-student", title: SEEKING[0], body: LONG_BODY });
  await add(request, { author: "profile-parent", title: SEEKING[1], body: "Học tối thứ 7.", days_ago: 1 });
  await add(request, { author: "profile-student", title: "Tìm gia sư đã giải quyết", solved: 1 });
  await add(request, { author: "profile-student", title: "Tìm gia sư quá cũ", days_ago: 20 });
  await login(page, "chau");
  const links = ticker(page).locator("ul:first-child a");
  await expect(links).toHaveCount(2); // the solved and the old post are left out
  const item = links.filter({ hasText: "Toán lớp 9" });
  await expect(item.locator(".person")).toBeVisible();
  await expect(item.locator("strong")).not.toBeEmpty();
  await expect(item.locator(".ticker-topic")).toHaveText("Toán · THCS");
  // The summary is shortened: the whole body is not shown, only its beginning.
  const summary = (await item.locator(".ticker-summary").textContent())!;
  expect(summary).toContain("Con học lớp 9");
  expect(summary).toContain("…");
  expect(summary.length).toBeLessThan(LONG_BODY.length);
  await expect(links.filter({ hasText: "Phụ huynh" })).toHaveCount(0); // the role is in the accessible name
  await expect(ticker(page).getByRole("link", { name: /Phụ huynh.*Tiếng Anh/ }).first()).toBeAttached();
  // Hovering the bar stops the run, so the item holds still for the click.
  await page.locator(".ticker-frame").hover();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/app/community/${first}$`));
  await page.goBack();
  await ticker(page).getByRole("link", { name: "Đang tìm gia sư" }).click();
  await expect(page).toHaveURL(/\/app\/community\?q=t%C3%ACm%20gia%20s%C6%B0$/);
  await expect(page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Tìm/ })).first()).toHaveValue("tìm gia sư");
});

test("it runs from right to left when it does not fit, pauses on hover and keeps one tab stop per item", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title, body: LONG_BODY });
  await login(page, "chau");
  await expect(ticker(page).locator("ul")).toHaveCount(2);
  expect(await animation(page)).toBe("ticker-scroll");
  // Direction: the content moves left (negative offset grows).
  const x1 = await shiftX(page);
  await page.waitForTimeout(700);
  const x2 = await shiftX(page);
  expect(x2).toBeLessThan(x1);
  await expect(ticker(page).locator("ul[aria-hidden='true'] a[tabindex='-1']")).toHaveCount(6);
  const state = () => page.locator(".ticker-track").evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(await state()).toBe("running");
  await page.locator(".ticker-frame").hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(5, 5);
  expect(await state()).toBe("running");
  // Keyboard focus pauses it, and Tab visits each real item exactly once.
  await page.locator(".topbar-ticker ul:first-child a").first().focus();
  expect(await state()).toBe("paused");
  const hrefs = new Set<string>();
  for (let i = 0; i < 6; i++) {
    hrefs.add(await page.evaluate(() => (document.activeElement as HTMLAnchorElement).href));
    await page.keyboard.press("Tab");
  }
  expect(hrefs.size).toBe(6);
  expect(await page.evaluate(() => !!document.activeElement?.closest("[aria-hidden='true']"))).toBe(false);
  // The top bar keeps its height and the page never scrolls sideways.
  const bar = await page.locator(".topbar").evaluate((el) => el.getBoundingClientRect().height);
  expect(bar).toBe(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a short list that fits stays still", async ({ page, request }) => {
  await add(request, { author: "profile-student", title: "Tìm gia sư", body: "" });
  await login(page, "chau");
  await expect(ticker(page)).toBeVisible();
  await expect(ticker(page).locator("ul")).toHaveCount(1);
  expect(await animation(page)).toBe("none");
});

test("reduced motion and a 360px screen: no animation, swipes sideways, own row, no page overflow", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title, body: LONG_BODY });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, "chau");
  await expect(ticker(page)).toBeVisible();
  expect(await animation(page)).toBe("none");
  await expect(ticker(page).locator("ul")).toHaveCount(1);
  const frame = await page.locator(".ticker-frame").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, x: getComputedStyle(el).overflowX }));
  expect(frame.scroll).toBeGreaterThan(frame.client);
  expect(frame.x).toBe("auto");
  // On a phone it sits on its own row under the menu button and the language switch.
  const rows = await page.evaluate(() => {
    const t = document.querySelector(".topbar-ticker")!.getBoundingClientRect(),
      r = document.querySelector(".topbar-right")!.getBoundingClientRect();
    return { below: t.top >= r.bottom - 1, width: Math.round(t.width) };
  });
  expect(rows.below).toBe(true);
  expect(rows.width).toBeGreaterThan(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a failed request hides the ticker without breaking the page", async ({ page, request }) => {
  await add(request, { author: "profile-student", title: SEEKING[0] });
  await page.route("**/api/community/requests", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
  await login(page, "chau");
  await expect(page.getByText("Buổi dạy tiếp theo")).toBeVisible();
  await expect(ticker(page)).toHaveCount(0);
});

test("students and parents get a ticker of tutors looking for students; tutors do not see their colleagues", async ({ page, request }) => {
  const own = await add(request, { author: "chau", title: "Nhận dạy kèm Toán lớp 9", body: "Dạy online tối thứ 2, 4, 6. Mình có 5 năm kinh nghiệm luyện thi vào lớp 10." });
  await add(request, { author: "chau", title: "Cần gia sư Tiếng Anh", body: "Chia sẻ tài liệu ôn tập cho các bạn." });
  for (const slug of ["profile-student", "profile-parent"]) {
    const context = await page.context().browser()!.newContext();
    const p = await context.newPage();
    await login(p, slug);
    const strip = p.getByRole("region", { name: "Gia sư đang tìm học sinh" });
    await expect(strip).toBeVisible();
    await expect(p.getByRole("region", { name: "Đang tìm gia sư" })).toHaveCount(0);
    const inBar = await p.evaluate(
      () => document.querySelector(".topbar")!.contains(document.querySelector(".topbar-ticker")),
    );
    expect(inBar).toBe(true);
    const links = strip.locator("ul:first-child a");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Nhận dạy kèm Toán lớp 9");
    await expect(links.first()).toHaveAttribute("aria-label", /Gia sư, Toán/);
    await expect(links.first()).toContainText("Toán");
    await strip.locator(".ticker-frame").hover();
    await links.first().click();
    await expect(p).toHaveURL(new RegExp(`/app/community/${own}$`));
    await context.close();
  }
  // The tutor's own bar shows posts from students and parents only, so with none it stays empty.
  await login(page, "chau");
  await expect(page.getByText("Buổi dạy tiếp theo")).toBeVisible();
  await expect(page.locator(".topbar-ticker")).toHaveCount(0);
});
