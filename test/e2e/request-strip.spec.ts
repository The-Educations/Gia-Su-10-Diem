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
  await expect(page.getByRole("heading", { name: "Không gian gia sư" })).toBeVisible();
  await expect(ticker(page)).toHaveCount(0); // no posts: the region of posts is not there, only the ident
  await expect(page.locator(".topbar-ticker[data-alone] .ticker-ad")).toBeVisible();
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
  await page.getByRole("link", { name: "Lịch" }).first().click();
  await expect(page).toHaveURL(/\/app\/schedule/);
  await expect(ticker(page)).toBeVisible();

  const student = await page.context().browser()!.newContext();
  const studentPage = await student.newPage();
  await login(studentPage, "profile-student");
  await expect(studentPage.getByRole("heading", { name: "Góc học tập" })).toBeVisible();
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
  expect(bar).toBe(64);
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
  await expect(page.getByRole("heading", { name: "Không gian gia sư" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Không gian gia sư" })).toBeVisible();
  await expect(page.locator(".topbar-ticker:not([data-alone])")).toHaveCount(0); // no posts: only the ident
});

// The The Educations ident (docs/quang-cao-dai-chay.md). The page clock is faked so the 45 s pause
// can be skipped; the strip's CSS run and the video still play in real time.
test.describe("the The Educations ident", () => {
test.describe.configure({ timeout: 90_000 });
const ident = (page: Page) => page.getByRole("img", { name: /The Educations.*Làm Giáo Dục, vì Giáo Dục.*Make EDU, for EDU/ });
async function skipToIdent(page: Page) {
  await page.clock.fastForward(46_000);
  // The ident then waits, in real time, for the post at the left edge to scroll out.
  await expect(ident(page)).toBeVisible({ timeout: 30_000 });
}

test("after a pause the ident takes the strip's place between two posts, does nothing on click and gives the strip back", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title, body: LONG_BODY });
  await page.clock.install();
  await login(page, "chau");
  await expect(ticker(page)).toBeVisible();
  expect(await animation(page)).toBe("ticker-scroll");
  await page.clock.fastForward(30_000);
  await expect(ident(page)).toHaveCount(0); // not before the pause is over
  await page.mouse.move(5, 5);
  await skipToIdent(page);

  // It started between two posts: none is cut by the left edge of the strip.
  const cut = await page.evaluate(() => {
    const edge = document.querySelector(".ticker-frame")!.getBoundingClientRect().left;
    return Array.from(document.querySelectorAll(".ticker-track li"), (li) => li.getBoundingClientRect())
      .filter((r) => r.left < edge - 4 && r.right > edge + 4).length;
  });
  expect(cut).toBe(0);
  // The posts are hidden and wait where they stopped; the video is the ident.
  await expect(page.locator(".ticker-frame")).toBeHidden();
  await expect(page.locator(".ticker-label")).toBeHidden();
  expect(await page.locator(".ticker-track").evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("paused");
  const video = ident(page).locator("video");
  await expect(video).toHaveAttribute("src", "/assets/video/the-educations-ident.mp4");
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 5_000 }).toBeGreaterThan(0);

  // Clicking it goes nowhere and it does not look clickable.
  const url = page.url();
  await ident(page).click();
  expect(page.url()).toBe(url);
  expect(await ident(page).evaluate((el) => getComputedStyle(el).cursor)).toBe("default");
  await expect(ident(page).locator("a, button")).toHaveCount(0);
  // The top bar keeps its height and the page does not scroll sideways.
  expect(await page.locator(".topbar").evaluate((el) => el.getBoundingClientRect().height)).toBe(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // When the 8 s video ends the posts come back and run on (once the mouse is off them).
  await page.mouse.move(5, 5);
  await expect(ident(page)).toHaveCount(0, { timeout: 12_000 });
  await expect(page.locator(".ticker-frame")).toBeVisible();
  expect(await page.locator(".ticker-track").evaluate((el) => getComputedStyle(el).animationPlayState)).toBe("running");
  // And it waits another full pause before the next showing.
  await page.clock.fastForward(30_000);
  await expect(ident(page)).toHaveCount(0);
});

test("the ident waits while the reader hovers the strip", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title, body: LONG_BODY });
  await page.clock.install();
  await login(page, "chau");
  await expect(ticker(page)).toBeVisible();
  await page.locator(".ticker-frame").hover();
  await page.clock.fastForward(46_000);
  await page.waitForTimeout(5_000); // it keeps asking every 2 s while the strip is hovered
  await expect(ident(page)).toHaveCount(0);
  await page.mouse.move(5, 5);
  await skipToIdent(page);
});

test("with reduced motion the ident is its still last frame and never replays", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await login(page, "chau");
  await expect(ident(page)).toBeVisible(); // no posts: the ident is on its own
  await expect(ident(page).locator("video")).toHaveCount(0);
  const still = ident(page).locator("img");
  await expect(still).toHaveAttribute("src", "/assets/video/the-educations-ident.png");
  await expect.poll(() => still.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1920);
  await page.clock.fastForward(120_000);
  await expect(ident(page).locator("img")).toBeVisible();
});

test("an account with no posts to scroll, like the admin, gets the ident alone: it plays, rests on its last frame and replays", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.clock.install();
  await page.goto("/app/auth?next=%2Fadmin");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
  await page.getByLabel("Email", { exact: true }).fill("admin@demo.giasu.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/admin/);
  await expect(ident(page)).toBeVisible();
  await expect(page.locator(".topbar-ticker:not([data-alone])")).toHaveCount(0);
  expect(requests.some((u) => u.endsWith("/api/community/requests"))).toBe(false); // nothing to fetch for an admin
  const video = ident(page).locator("video");
  const time = () => video.evaluate((v: HTMLVideoElement) => v.currentTime);
  // It plays on arrival, then the last frame stays on screen.
  await expect.poll(time, { timeout: 5_000 }).toBeGreaterThan(0.5);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.ended), { timeout: 15_000 }).toBe(true);
  expect(await time()).toBeGreaterThan(7.5);
  await expect(ident(page)).toBeVisible();
  // Clicking does nothing, and it does not look clickable.
  const url = page.url();
  await ident(page).click();
  expect(page.url()).toBe(url);
  expect(await ident(page).evaluate((el) => getComputedStyle(el).cursor)).toBe("default");
  // After the pause it plays again from the start.
  await page.clock.fastForward(30_000);
  expect(await video.evaluate((v: HTMLVideoElement) => v.ended)).toBe(true);
  await page.clock.fastForward(16_000);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.ended && v.currentTime < 7), { timeout: 5_000 }).toBe(true);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.ended), { timeout: 15_000 }).toBe(true);
  expect(await page.locator(".topbar").evaluate((el) => el.getBoundingClientRect().height)).toBe(64);
});
});
