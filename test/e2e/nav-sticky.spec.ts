import { test, expect } from "@playwright/test";

// Thanh điều hướng phải đi theo khi cuộn: thanh trên dính ở đỉnh, thanh bên cố định, thanh dưới cố định ở đáy.
test("desktop: the top bar and sidebar stay in view while the page scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/app/tutors");
  await page.waitForSelector(".sidebar");
  await page.waitForSelector(".topbar");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY > 200);
  const box = await page.evaluate(() => ({
    topbarTop: document.querySelector(".topbar")!.getBoundingClientRect().top,
    sidebarTop: document.querySelector(".sidebar")!.getBoundingClientRect().top,
    sidebarBottom: document.querySelector(".sidebar")!.getBoundingClientRect().bottom,
    height: window.innerHeight,
  }));
  expect(Math.abs(box.topbarTop)).toBeLessThanOrEqual(1);
  expect(box.sidebarTop).toBeGreaterThanOrEqual(0);
  expect(box.sidebarBottom).toBeLessThanOrEqual(box.height + 1);
});

test("mobile: the top bar sticks and the bottom bar stays at the bottom while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/app/tutors");
  await page.waitForSelector(".mobile-bar");
  await page.waitForSelector(".topbar");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => window.scrollY > 200);
  const box = await page.evaluate(() => ({
    topbarTop: document.querySelector(".topbar")!.getBoundingClientRect().top,
    barBottom: document.querySelector(".mobile-bar")!.getBoundingClientRect().bottom,
    height: window.innerHeight,
  }));
  expect(Math.abs(box.topbarTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.barBottom - box.height)).toBeLessThanOrEqual(1);
});
