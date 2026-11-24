import { test, expect } from "@playwright/test";

// The audit's 1440 "sidebar covers content" was a fullPage-screenshot artifact —
// the DOM never overlaps. These specs lock in the real geometry so it can't regress.
test("the desktop sidebar never covers page content", async ({ page }) => {
  await page.goto("/app/tutors");
  const box = await page.evaluate(() => {
    const sidebar = document.querySelector(".sidebar")!.getBoundingClientRect();
    const heading = document.querySelector("main h1, main h2")!.getBoundingClientRect();
    const body = document.querySelector(".app-body")!.getBoundingClientRect();
    return { sidebarRight: sidebar.right, bodyLeft: body.left, headingLeft: heading.left };
  });
  expect(box.bodyLeft).toBeGreaterThanOrEqual(box.sidebarRight);
  expect(box.headingLeft).toBeGreaterThan(box.sidebarRight);
});

test("the bottom bar never covers the last content on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/app/tutors/3");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2);
  const box = await page.evaluate(() => {
    const bar = document.querySelector(".mobile-bar")!.getBoundingClientRect();
    const leaves = [...document.querySelectorAll("main *")].filter((e) => e.children.length === 0 && e.getBoundingClientRect().height > 4);
    const lastBottom = Math.max(...leaves.map((e) => e.getBoundingClientRect().bottom));
    const mainPad = parseFloat(getComputedStyle(document.querySelector("main")!).paddingBottom);
    return { barTop: bar.top, barH: bar.height, lastBottom, mainPad };
  });
  // Content must clear the fixed bar; padding must cover the bar's height.
  expect(box.lastBottom).toBeLessThanOrEqual(box.barTop);
  expect(box.mainPad).toBeGreaterThanOrEqual(box.barH);
});
