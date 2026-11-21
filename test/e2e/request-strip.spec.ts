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
const strip = (page: Page) => page.getByRole("region", { name: "Đang tìm gia sư" });
const animation = (page: Page) =>
  page.locator(".request-strip-track").evaluate((el) => getComputedStyle(el).animationName);

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => {
  await request.post("/__test/community-posts/clear");
});
test.afterAll(async ({ request }) => {
  await request.post("/__test/community-posts/clear");
});

const SEEKING = ["Tìm gia sư Toán lớp 9", "Cần gia sư Tiếng Anh", "Kiếm gia sư Hóa học", "Cần người dạy Vật lí", "Tìm giáo viên IELTS", "Cần gia sư Ngữ văn lớp 11"];

test("tutor sees the strip under today's lessons; student does not; empty hides it", async ({ page, request }) => {
  await login(page, "chau");
  const loaded = () => page.waitForResponse((r) => r.url().endsWith("/api/community/requests"));
  let response = loaded();
  await page.reload();
  expect((await response).status()).toBe(200);
  await expect(page.getByText("Buổi dạy tiếp theo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đang tìm gia sư" })).toHaveCount(0);
  await add(request, { author: "profile-student", title: SEEKING[0] });
  response = loaded();
  await page.reload();
  await response;
  await expect(strip(page)).toBeVisible();
  // Placed before the next-lesson panel.
  const order = await page.evaluate(() => {
    const s = document.querySelector(".request-strip")!, n = document.querySelector(".workspace-overview")!;
    return !!(s.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);

  const student = await page.context().browser()!.newContext();
  const studentPage = await student.newPage();
  await login(studentPage, "profile-student");
  await expect(studentPage.getByText("Buổi học tiếp theo")).toBeVisible();
  await expect(studentPage.getByRole("heading", { name: "Đang tìm gia sư" })).toHaveCount(0);
  await student.close();
});

test("two cards stay still; the card opens the post; 'Xem tất cả' pre-fills the search", async ({ page, request }) => {
  const first = await add(request, { author: "profile-student", title: SEEKING[0], days_ago: 1 });
  await add(request, { author: "profile-parent", title: SEEKING[1] });
  await add(request, { author: "profile-student", title: "Tìm gia sư đã giải quyết", solved: 1 });
  await add(request, { author: "profile-student", title: "Tìm gia sư quá cũ", days_ago: 20 });
  await login(page, "chau");
  await expect(strip(page).getByRole("listitem")).toHaveCount(2);
  expect(await animation(page)).toBe("none");
  await expect(strip(page).getByText("Toán · THCS")).toBeVisible();
  await expect(strip(page).getByText("Phụ huynh")).toBeVisible();
  await strip(page).getByRole("link", { name: /Toán lớp 9/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/community/${first}$`));
  await page.goBack();
  await strip(page).getByRole("link", { name: /Xem tất cả/ }).click();
  await expect(page).toHaveURL(/\/app\/community\?q=t%C3%ACm%20gia%20s%C6%B0$/);
  await expect(page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Tìm/ })).first()).toHaveValue("tìm gia sư");
});

test("many cards run, pause on hover and keep one tab stop per card", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title });
  await login(page, "chau");
  await expect(strip(page).getByRole("link")).toHaveCount(7); // 6 cards + "Xem tất cả"
  await expect(page.locator(".request-strip-track ul")).toHaveCount(2);
  expect(await animation(page)).toBe("request-strip-scroll");
  await expect(page.locator(".request-strip-track ul[aria-hidden='true'] a[tabindex='-1']")).toHaveCount(6);
  const state = () => page.locator(".request-strip-track").evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(await state()).toBe("running");
  await page.locator(".request-strip-frame").hover();
  expect(await state()).toBe("paused");
  await page.mouse.move(5, 5);
  expect(await state()).toBe("running");
  // Keyboard focus pauses it, and Tab visits each real card exactly once.
  await page.locator(".request-strip-track ul:first-child a").first().focus();
  expect(await state()).toBe("paused");
  const hrefs = new Set<string>();
  for (let i = 0; i < 6; i++) {
    hrefs.add(await page.evaluate(() => (document.activeElement as HTMLAnchorElement).href));
    await page.keyboard.press("Tab");
  }
  expect(hrefs.size).toBe(6);
  await expect(page.locator(".request-strip-track ul:first-child a").first()).not.toBeFocused();
  expect(await page.evaluate(() => !!document.activeElement?.closest("[aria-hidden='true']"))).toBe(false);
});

test("reduced motion and a 360px screen: no animation, scrolls sideways, no page overflow", async ({ page, request }) => {
  for (const title of SEEKING) await add(request, { author: "profile-student", title });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, "chau");
  await expect(strip(page)).toBeVisible();
  expect(await animation(page)).toBe("none");
  await expect(page.locator(".request-strip-track ul")).toHaveCount(1);
  const frame = await page.locator(".request-strip-frame").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, x: getComputedStyle(el).overflowX }));
  expect(frame.scroll).toBeGreaterThan(frame.client);
  expect(frame.x).toBe("auto");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a failed request hides the strip without breaking the dashboard", async ({ page, request }) => {
  await add(request, { author: "profile-student", title: SEEKING[0] });
  await page.route("**/api/community/requests", (route) => route.fulfill({ status: 500, json: { error: "x" } }));
  await login(page, "chau");
  await expect(page.getByText("Buổi dạy tiếp theo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đang tìm gia sư" })).toHaveCount(0);
});
