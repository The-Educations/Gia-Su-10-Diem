import { test, expect } from "@playwright/test";

const pages = ["/app/tutors", "/app/auth", "/app/community", "/app/news", "/app/library"];

for (const path of pages) {
  test(`${path} loads, does not scroll sideways and has no script errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await page.waitForSelector("main h1, main h2");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test("the navigation follows the page while scrolling", async ({ page, isMobile }) => {
  await page.goto("/app/tutors");
  await page.waitForSelector(".topbar");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY > 200);
  const top = await page.evaluate(() => document.querySelector(".topbar")!.getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThanOrEqual(1);
  if (isMobile) {
    const gap = await page.evaluate(() => window.innerHeight - document.querySelector(".mobile-bar")!.getBoundingClientRect().bottom);
    expect(Math.abs(gap)).toBeLessThanOrEqual(1);
  } else {
    const side = await page.evaluate(() => document.querySelector(".sidebar")!.getBoundingClientRect().top);
    expect(side).toBeGreaterThanOrEqual(0);
  }
});

test("text fields do not trigger iOS zoom: 16px on touch screens", async ({ page, hasTouch }) => {
  test.skip(!hasTouch, "Chỉ áp cho màn cảm ứng");
  await page.goto("/app/tutors");
  await page.waitForSelector("main h1, main h2");
  const sizes = await page.$$eval('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea', (els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
});
