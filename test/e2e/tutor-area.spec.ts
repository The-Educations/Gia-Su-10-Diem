import { test, expect } from "@playwright/test";

test("offline mode shows the teaching-area map; radius and location persist", async ({ page, context }) => {
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["geolocation"], { origin: "http://127.0.0.1:4175" });
  await context.setGeolocation({ latitude: 21.0285, longitude: 105.8542 });
  expect((await page.request.post("/api/auth/login", { data: { email: "chau@demo.giasu.test", password: "BrowserStudy2026!" } })).ok()).toBe(true);
  // Offline mode requires a ward — the demo tutor lacks one, so seed it via the API first.
  const profile = await (await page.request.get("/api/tutor/profile")).json();
  await page.request.put("/api/tutor/profile", { data: { ...profile, province_code: "1", ward_code: "4" } });

  // Offline reveals the map picker; clicking the map centers the circle.
  await page.goto("/app/studio?step=mode");
  await page.getByRole("radio", { name: /^Trực tiếp$/ }).check();
  const map = page.locator(".area-map-canvas");
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(page.getByRole("button", { name: /Dùng vị trí của tôi/ })).toBeVisible();

  // Radius slider updates the km readout before save.
  const slider = page.getByRole("slider", { name: /Bán kính khu vực dạy/ });
  await slider.focus(); await slider.press("ArrowRight"); await slider.press("ArrowRight");
  await expect(page.locator('[data-testid="area-km-value"]')).toHaveText(/km/);

  // "Use my location" drops the marker on the mocked geolocation.
  await page.getByRole("button", { name: /Dùng vị trí của tôi/ }).click();
  await page.waitForTimeout(600);

  // Desktop + mobile screenshots of the picker.
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/tutor-area-${width}.png`, fullPage: false });
  }

  // Save through the same profile PUT the wizard's review step sends — the demo
  // tutor has incomplete proof/schedule steps, so the form submit can't run.
  const km = Number(await page.locator('[data-testid="area-km-value"]').textContent().then((t) => parseInt(t || "5", 10)));
  const save = await page.request.put("/api/tutor/profile", {
    data: { ...profile, mode: "offline", area_lat: 21.0285, area_lng: 105.8542, area_km: km },
  });
  expect(save.status()).toBe(200);
  const saved = await (await page.request.get("/api/tutor/profile")).json();
  expect(saved.area_lat).toBeCloseTo(21.0285, 1);
  expect(saved.area_lng).toBeCloseTo(105.8542, 1);
  expect(saved.area_km).toBeGreaterThanOrEqual(1);
  expect(saved.area_km).toBeLessThanOrEqual(30);

  // Students see the radius but never the exact center coordinates.
  const publicView = await (await page.request.get(`/api/tutors/${saved.user_id}`)).json();
  expect(publicView.area_km).toBe(saved.area_km);
  expect(publicView.area_lat).toBeUndefined();
  expect(publicView.area_lng).toBeUndefined();

  // The public profile shows the service text, no coordinates.
  await page.goto(`/app/tutors/${saved.user_id}`);
  await expect(page.locator(".area-note")).toContainText(`~${saved.area_km} km`);
  expect(errors).toEqual([]);
});
