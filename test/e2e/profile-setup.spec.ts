import { test, expect } from "@playwright/test";
import sharp from "sharp";

test("searchable address, crop preview and tutor steps preserve edits and save together", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A dedicated tutor keeps the shared marketplace fixtures unchanged.
  const email = "profile-setup@browser.test";
  expect(
    (
      await page.request.post("/api/auth/register", {
        data: {
          name: "Gia sư thiết lập",
          email,
          password: "BrowserStudy2026!",
        },
      })
    ).status(),
  ).toBe(202);
  const mail = await (
    await page.request.get(`/__test/email?email=${email}`)
  ).json();
  expect(
    (
      await page.request.post("/api/auth/signup/verify", {
        data: { code: mail.code },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.put("/api/account/onboarding", {
        data: { step: 0, role: "tutor" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put("/api/account/onboarding", {
        data: { step: 1, name: "Gia sư thiết lập" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.put("/api/tutor/profile", {
        data: {
          headline: "Gia sư Toán",
          bio: "Học theo mục tiêu cá nhân",
          education: "Sư phạm Toán",
          location: "Hà Nội",
          mode: "both",
          rate: 150000,
          experience: 2,
          subjects: ["toan"],
          levels: ["THCS"],
          goals: [],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/app/studio");
  await expect(page).toHaveURL(/studio/);
  await page.getByLabel("Tiêu đề hồ sơ").fill("Học Toán theo mục tiêu của bạn");
  await page
    .getByRole("combobox", { name: "Tỉnh / Thành phố", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tìm tỉnh / thành phố", exact: true })
    .fill("ha noi");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await page
    .getByRole("combobox", { name: "Phường / Xã / Đặc khu", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tìm phường / xã / đặc khu", exact: true })
    .fill("ba dinh");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  // Selecting a new province must discard the previous ward.
  await page
    .getByRole("combobox", { name: "Tỉnh / Thành phố", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Thành phố Hồ Chí Minh", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Phường / Xã / Đặc khu", exact: true }),
  ).toHaveText(/Chọn phường/);
  await page
    .getByRole("combobox", { name: "Phường / Xã / Đặc khu", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tìm phường / xã / đặc khu", exact: true })
    .fill("zzzz");
  await expect(page.getByText("Không tìm thấy địa chỉ.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Phường / Xã / Đặc khu", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("combobox", { name: "Phường / Xã / Đặc khu", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tìm phường / xã / đặc khu", exact: true })
    .fill("ben thanh");
  await page
    .getByRole("option", { name: "Phường Bến Thành", exact: true })
    .click();
  const original = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#864049" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Chọn ảnh bìa", { exact: true })
    .setInputFiles({
      name: "banner.png",
      mimeType: "image/png",
      buffer: original,
    });
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Điều chỉnh ảnh" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await dialog.evaluate(
      (el) => el.getBoundingClientRect().width <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("slider", { name: "Thu phóng" }).focus();
  await page.keyboard.press("ArrowRight");
  await dialog.getByRole("slider", { name: "Vị trí ngang" }).focus();
  await page.keyboard.press("ArrowRight");
  const canvasSize = await dialog
    .locator("canvas")
    .evaluate((el) => [el.width, el.height]);
  expect(canvasSize[0] / canvasSize[1]).toBe(4);
  await dialog.getByRole("button", { name: "Dùng ảnh này" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Lưu ảnh bìa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lưu ảnh bìa", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Xem ảnh bìa", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Tiêu đề hồ sơ")).toHaveValue(
    "Học Toán theo mục tiêu của bạn",
  );
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByLabel("Học vấn / Chuyên môn")).toBeVisible();
  await page
    .getByLabel("Học vấn / Chuyên môn")
    .fill("Đại học Sư phạm – Toán học");
  await page.getByRole("button", { name: "Quay lại", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề hồ sơ")).toHaveValue(
    "Học Toán theo mục tiêu của bạn",
  );
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByLabel("Học vấn / Chuyên môn")).toHaveValue(
    "Đại học Sư phạm – Toán học",
  );
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await page
    .getByRole("button", { name: "Thứ 3, 18:00–19:00", exact: true })
    .click();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Lưu & gửi duyệt", exact: true })
    .click();
  await expect(page).toHaveURL(/workspace/);
  const saved = await (await page.request.get("/api/tutor/profile")).json();
  expect(saved.headline).toBe("Học Toán theo mục tiêu của bạn");
  expect(saved.education).toBe("Đại học Sư phạm – Toán học");
  expect(saved.location).toBe("Phường Bến Thành, Thành phố Hồ Chí Minh");
  expect(saved.weekly_schedule.blocks).toContainEqual({ weekday: 1, hour: 18 });
  await page.getByRole("link", { name: "Lịch dạy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Thứ 3, 18:00–19:00", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("admin calendar and reversible take-down dialog work without deleting the tutor", async ({
  page,
}) => {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page.getByLabel("Email", { exact: true }).fill("admin@demo.giasu.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Tìm trong danh sách" })
    .fill("Lê Thảo Linh");
  const row = page.locator(".admin-list article").first();
  await row.getByRole("button", { name: "Gỡ hồ sơ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy", exact: true })
    .click();
  await expect(
    row.getByRole("button", { name: "Gỡ hồ sơ", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Gỡ hồ sơ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận gỡ hồ sơ", exact: true })
    .click();
  await expect(row).toContainText("Đã gỡ hồ sơ");
  await row.getByRole("button", { name: "Xem & duyệt", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Duyệt & công bố", exact: true })
    .click();
  await expect(row).toContainText("Đã công bố");
  await page.getByRole("link", { name: "Lịch dạy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Lịch dạy", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".availability-grid")).toBeVisible();
  expect((await page.reload())?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Lịch dạy", exact: true }),
  ).toBeVisible();
});
