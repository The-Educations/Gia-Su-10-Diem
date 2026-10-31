import { sampleCV } from "../../server/demo-content.js";
import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  await page.goto("/app/auth");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
test("guest filters, subject navigation and responsive layouts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/tutors");
  await expect(
    page.getByRole("heading", { name: "6 gia sư", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tìm gia sư", exact: true })
    .fill("nguyen minh chau");
  await expect(page.locator(".tutor-card")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Tìm gia sư", exact: true })
    .fill("zzzzz");
  await expect(page.getByText("Chưa tìm thấy gia sư phù hợp")).toBeVisible();
  await page
    .getByRole("region", { name: "Bộ lọc gia sư" })
    .getByRole("button", { name: "Xóa bộ lọc" })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Cấp học", exact: true }),
  ).not.toBeVisible();
  const filterToggle = page.getByRole("button", {
    name: "Bộ lọc thêm",
    exact: true,
  });
  await filterToggle.focus();
  await page.keyboard.press("Space");
  await expect(filterToggle).toHaveAttribute("aria-expanded", "true");
  await choose(page, "Cấp học", "THCS");
  await expect(page.locator(".tutor-card")).toHaveCount(4);
  await page
    .getByRole("region", { name: "Bộ lọc gia sư" })
    .getByRole("button", { name: "Xóa bộ lọc" })
    .click();
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute("aria-expanded", "false");
  await choose(page, "Môn học", "Toán");
  await expect(page.locator(".tutor-card")).toHaveCount(3);
  await choose(page, "Học phí / giờ", "Đến 150.000 ₫");
  await expect(page.locator(".tutor-card")).toHaveCount(1);
  await page.goto("/app/library");
  await expect(
    page.getByRole("heading", { name: "25 nhóm môn học" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Mục tiêu kỳ thi" }).click();
  await expect(page.locator(".resource-row")).toHaveCount(8);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app/tutors");
    await expect(page.locator(".tutor-card").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở điều hướng" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mở điều hướng" }),
  ).toBeFocused();
  expect(errors).toEqual([]);
});
test("student booking, tutor acceptance and persistent two-way messages", async ({
  browser,
}) => {
  const studentContext = await browser.newContext(),
    tutorContext = await browser.newContext(),
    student = await studentContext.newPage(),
    tutor = await tutorContext.newPage();
  await login(student, "student");
  await student.goto("/app/tutors/3");
  await student.getByRole("combobox", { name: "Giờ học (Việt Nam)" }).click();
  await student.getByRole("option").nth(1).click();
  await student.getByLabel("Bạn muốn học gì?").fill("Ôn phương trình bậc hai");
  await student.getByRole("button", { name: "Xem lại yêu cầu" }).click();
  await expect(student.getByRole("dialog")).toBeVisible();
  await student.getByRole("button", { name: "Gửi yêu cầu học" }).click();
  await expect(student).toHaveURL(/bookings/);
  await expect(student.locator(".lesson-card")).toHaveCount(1);
  await login(tutor, "chau");
  await tutor.goto("/app/bookings");
  await tutor.getByRole("button", { name: "Nhận buổi học" }).click();
  await tutor.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(tutor.locator(".lesson-card")).toContainText("Đã xác nhận");
  await tutor.getByRole("link", { name: "Trao đổi" }).click();
  await tutor
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Chào em, mình sẽ ôn phương trình.");
  await tutor.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(
    tutor.getByText("Chào em, mình sẽ ôn phương trình.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(student.locator(".lesson-card")).toContainText("Đã xác nhận");
  const download = student.waitForEvent("download");
  await student.getByRole("button", { name: "Lưu lịch" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await student.getByRole("link", { name: "Trao đổi" }).click();
  await expect(
    student.getByText("Chào em, mình sẽ ôn phương trình.", { exact: true }),
  ).toBeVisible();
  await student
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Em cảm ơn cô.");
  await student.getByRole("button", { name: "Gửi", exact: true }).click();
  await student.reload();
  await expect(
    student.getByText("Em cảm ơn cô.", { exact: true }),
  ).toBeVisible();
  await tutor.reload();
  await expect(tutor.getByText("Em cảm ơn cô.", { exact: true })).toBeVisible();
  await student.goto("/app/bookings");
  await student.getByRole("button", { name: "Hủy buổi", exact: true }).click();
  await student.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(student.locator(".lesson-card")).toContainText("Đã hủy");
  await studentContext.close();
  await tutorContext.close();
});
test("new tutor onboarding, availability and admin approval", async ({
  browser,
}) => {
  const tc = await browser.newContext(),
    ac = await browser.newContext(),
    tutor = await tc.newPage(),
    admin = await ac.newPage();
  await tutor.goto("/app/tutors");
  await tutor.getByRole("link", { name: "Đăng ký làm gia sư" }).click();
  await expect(
    tutor.getByRole("combobox", { name: "Bạn tham gia với vai trò" }),
  ).toContainText("Gia sư");
  await tutor.getByLabel("Họ và tên", { exact: true }).fill("Gia sư kiểm thử");
  await tutor
    .getByLabel("Email", { exact: true })
    .fill("new-tutor@browser.test");
  await tutor.getByLabel(/Mật khẩu/).fill("BrowserStudy2026!");
  await tutor
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await expect(tutor).toHaveURL(/studio/);
  await tutor.setViewportSize({ width: 390, height: 844 });
  await tutor.getByLabel("Chọn CV (PDF)", { exact: true }).setInputFiles({
    name: "Teaching CV.pdf",
    mimeType: "application/pdf",
    buffer: await sampleCV("Browser Tutor"),
  });
  await tutor.getByRole("button", { name: "Tải CV lên", exact: true }).click();
  await expect(
    tutor.getByRole("link", { name: "Tải CV", exact: true }),
  ).toBeVisible();
  await tutor.getByLabel("Chọn ảnh đại diện", { exact: true }).setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: { width: 80, height: 80, channels: 3, background: "#852f36" },
    })
      .png()
      .toBuffer(),
  });
  await tutor.getByRole("button", { name: "Lưu ảnh", exact: true }).click();
  await expect(
    tutor.getByRole("link", { name: "Xem ảnh", exact: true }),
  ).toBeVisible();
  expect(
    await tutor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await tutor.reload();
  await expect(
    tutor.getByText("Teaching CV.pdf", { exact: true }),
  ).toBeVisible();
  await tutor.setViewportSize({ width: 1440, height: 1000 });
  await tutor.getByLabel("Chọn CV (PDF)", { exact: true }).setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid file"),
  });
  await tutor.getByRole("button", { name: "Tải CV lên", exact: true }).click();
  await expect(
    tutor
      .locator(".upload-card")
      .filter({ hasText: "CV của bạn" })
      .getByRole("alert"),
  ).toContainText("CV phải là PDF hợp lệ");
  await tutor.reload();
  await expect(
    tutor.getByText("Teaching CV.pdf", { exact: true }),
  ).toBeVisible();
  await tutor.getByRole("tab", { name: "Hồ sơ nhận dạy" }).click();
  await tutor.getByLabel("Tiêu đề hồ sơ").fill("Gia sư Toán lớp 9");
  await tutor
    .getByLabel("Giới thiệu & phương pháp dạy")
    .fill("Học từ cơ bản, giải thích từng bước.");
  await tutor.getByLabel("Học vấn / Chuyên môn").fill("Sư phạm Toán");
  await tutor.getByRole("checkbox", { name: "Toán", exact: true }).check();
  await tutor.getByRole("checkbox", { name: "THCS", exact: true }).check();
  await tutor
    .getByRole("checkbox", { name: "Tuyển sinh lớp 10", exact: true })
    .check();
  await tutor.getByRole("button", { name: "Lưu & gửi duyệt" }).click();
  await expect(
    tutor.getByText("Hồ sơ đã gửi quản trị viên duyệt."),
  ).toBeVisible();
  await tutor.getByRole("tab", { name: "Giờ trống", exact: true }).click();
  const day = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
  await tutor.getByLabel("Giờ bắt đầu (giờ Việt Nam)").fill(`${day}T18:00`);
  await tutor.getByRole("button", { name: "Thêm giờ trống" }).click();
  await expect(tutor.locator(".slot-list>div")).toHaveCount(1);
  await login(admin, "admin");
  await admin
    .getByRole("textbox", { name: "Tìm trong danh sách" })
    .fill("Gia sư kiểm thử");
  await admin.getByRole("button", { name: "Xem & duyệt" }).click();
  await expect(
    admin.getByRole("link", { name: "Tải CV · Teaching CV.pdf" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Duyệt & công bố" }).click();
  await expect(admin.getByRole("dialog")).not.toBeVisible();
  await expect(admin.locator(".admin-list")).toContainText("Đã công bố");
  await tutor.goto("/app/tutors?q=Gia+sư+kiểm+thử");
  await expect(tutor.locator(".tutor-card")).toHaveCount(1);
  await tutor.getByRole("link", { name: "Xem hồ sơ", exact: true }).click();
  const download = tutor.waitForEvent("download");
  await tutor.getByRole("link", { name: "Tải CV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("Teaching CV.pdf");
  await expect(tutor.locator(".profile-hero img")).toBeVisible();
  await tc.close();
  await ac.close();
});
test("student favorites, profile and reduced-motion account layouts", async ({
  page,
}) => {
  await login(page, "student");
  await page.goto("/app/tutors");
  await page
    .getByRole("button", { name: "Lưu Nguyễn Minh Châu", exact: true })
    .click();
  await page.goto("/app/favorites");
  await expect(page.locator(".tutor-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Bỏ lưu Nguyễn Minh Châu", exact: true })
    .click();
  await expect(
    page.getByText("Chưa lưu gia sư nào", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/settings");
  await page.getByLabel("Mục tiêu học tập").fill("Tìm gia sư Toán lớp 9");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(page.getByText("Đã lưu hồ sơ", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Mục tiêu học tập")).toHaveValue(
    "Tìm gia sư Toán lớp 9",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of [
    "/app/settings",
    "/app/bookings",
    "/app/messages",
    "/app/library",
    "/app/tutors/3",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("student contacts a tutor before booking and receives a private reply", async ({
  browser,
}) => {
  const sc = await browser.newContext(),
    tc = await browser.newContext(),
    student = await sc.newPage(),
    tutor = await tc.newPage();
  const errors: string[] = [];
  student.on("pageerror", (e) => errors.push(e.message));
  tutor.on("pageerror", (e) => errors.push(e.message));
  await login(student, "student");
  await student.goto("/app/tutors/3");
  await student
    .getByRole("button", { name: "Liên hệ gia sư", exact: true })
    .click();
  await student
    .getByLabel("Lời nhắn của bạn")
    .fill("Cô có nhận học sinh lớp 9 vào cuối tuần không ạ?");
  await student
    .getByRole("button", { name: "Gửi lời nhắn", exact: true })
    .click();
  await expect(student).toHaveURL(/messages\?inquiry=/);
  await expect(
    student.getByText("Cô có nhận học sinh lớp 9 vào cuối tuần không ạ?", {
      exact: true,
    }),
  ).toBeVisible();
  await login(tutor, "chau");
  await tutor.goto("/app/messages");
  await tutor
    .locator(".conversation-list button")
    .filter({ hasText: "Tư vấn trước buổi học" })
    .click();
  await tutor
    .getByRole("textbox", { name: "Tin nhắn", exact: true })
    .fill("Cô còn lịch sáng thứ bảy nhé.");
  await tutor.getByRole("button", { name: "Gửi", exact: true }).click();
  await expect(
    tutor.getByText("Cô còn lịch sáng thứ bảy nhé.", { exact: true }),
  ).toBeVisible();
  await student.reload();
  await expect(
    student.getByText("Cô còn lịch sáng thứ bảy nhé.", { exact: true }),
  ).toBeVisible();
  await student.setViewportSize({ width: 360, height: 800 });
  expect(
    await student.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await sc.close();
  await tc.close();
});

test("role workspaces, studio drafts and admin tab persistence", async ({
  browser,
}) => {
  for (const [slug, heading] of [
    ["student", "Góc học tập"],
    ["chau", "Không gian gia sư"],
    ["admin", "Quản trị nền tảng"],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, slug);
    await page.goto("/app/workspace");
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    if (slug !== "admin") {
      const firstDay = await page
        .locator(".week-day")
        .first()
        .getAttribute("aria-label");
      await page.getByRole("button", { name: "Tuần sau", exact: true }).click();
      await expect(page.locator(".week-day").first()).not.toHaveAttribute(
        "aria-label",
        firstDay!,
      );
      await page
        .getByRole("button", { name: "Tuần trước", exact: true })
        .click();
      await expect(page.locator(".week-day").first()).toHaveAttribute(
        "aria-label",
        firstDay!,
      );
      await page.locator(".week-day").first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(".week-day").nth(1)).toBeFocused();
    } else {
      await expect(page).toHaveURL(/\/admin$/);
      await choose(page, "Trạng thái hồ sơ", "Chờ duyệt");
      await page
        .getByRole("textbox", { name: "Tìm trong danh sách" })
        .fill("no matching tutor");
      await expect(page.getByText("Không có kết quả phù hợp")).toBeVisible();
      await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
      await page.getByRole("tab", { name: "Môn học", exact: true }).click();
      await page
        .locator(".admin-list article")
        .first()
        .getByRole("button", { name: "Chỉnh sửa" })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Lưu môn học" })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Môn học", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.locator(".admin-list article").first()).toBeVisible();
    }
    for (const width of [360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    if (slug === "chau") {
      await page.goto("/app/studio?tab=profile");
      await page.getByLabel("Tiêu đề hồ sơ").fill("Bản nháp chưa lưu");
      await page.getByRole("tab", { name: "Giờ trống", exact: true }).click();
      await expect(page.getByLabel("Tiêu đề hồ sơ")).not.toBeVisible();
      await page
        .getByRole("tab", { name: "Hồ sơ nhận dạy", exact: true })
        .click();
      await expect(page.getByLabel("Tiêu đề hồ sơ")).toHaveValue(
        "Bản nháp chưa lưu",
      );
      await page.setViewportSize({ width: 360, height: 800 });
      for (const name of ["Ảnh & CV", "Hồ sơ nhận dạy", "Giờ trống"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/workspace");
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});

test("landing entry, education parallax, mobile navigation and real tutor search", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ['/favicon.ico', '/apple-touch-icon.png', '/assets/icon-v2.svg']) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/image/);
  }
  await page.goto("/app/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hero-title")).toBeVisible();
  const heroBefore = await page.locator('.hero-notebook').evaluate(e => getComputedStyle(e).translate);
  await page.keyboard.press('PageDown');
  await expect.poll(() => page.locator('.hero-notebook').evaluate(e => getComputedStyle(e).translate)).not.toBe(heroBefore);
  await page.locator('#course-search').fill('ngu van');
  await expect(page.locator('#labs-container .lab:visible')).toHaveCount(1);
  await expect(page.locator('#labs-container .lab:visible')).toContainText('Ngữ văn');
  await page.locator('#course-search').fill('');
  await expect(page.locator('#labs-container .lab:visible')).toHaveCount(5);
  await page.locator("#journey").scrollIntoViewIfNeeded();
  const before = await page
    .locator(".desk-notebook")
    .evaluate((e) => getComputedStyle(e).transform);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() =>
      page
        .locator(".desk-notebook")
        .evaluate((e) => getComputedStyle(e).transform),
    )
    .not.toBe(before);
  await page.locator("#form-subject").selectOption("toan");
  await page.locator("#form-mode").selectOption("online");
  await page.getByRole("button", { name: "Tìm gia sư phù hợp" }).click();
  await expect(page).toHaveURL(/subject=toan&mode=online/);
  await expect(
    page.getByRole("combobox", { name: "Môn học", exact: true }),
  ).toContainText("Toán");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator("#hero-title")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page
    .locator("#mobile-nav")
    .getByRole("link", { name: "Đăng nhập", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/auth$/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#journey").scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".desk-notebook")
      .evaluate((e) => getComputedStyle(e).transform),
  ).toBe("none");
  expect(errors).toEqual([]);
});

test("Google sign-in role choice and callback error are accessible", async ({
  page,
}) => {
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  await page.goto("/app/auth?mode=register&role=tutor&next=%2Fmessages");
  const google = page.getByRole("link", { name: "Tiếp tục với Google" });
  await expect(google).toHaveAttribute(
    "href",
    "/api/auth/google/start?role=tutor&next=%2Fmessages",
  );
  await choose(page, "Bạn tham gia với vai trò", "Học sinh / Phụ huynh");
  await expect(google).toHaveAttribute(
    "href",
    "/api/auth/google/start?role=student&next=%2Fmessages",
  );
  await page.goto("/app/auth?oauth_error=email_exists");
  await expect(page.getByRole("alert")).toContainText(
    "Email này đã có tài khoản",
  );
});
