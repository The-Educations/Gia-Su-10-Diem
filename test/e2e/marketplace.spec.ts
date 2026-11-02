import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, slug: string) {
  await page.goto("/app/auth");
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}
async function verifyEmail(page: Page, email: string) {
  await expect(page).toHaveURL(/verify-email/);
  const next = new URL(page.url()).search;
  const response = await page.request.get(`/__test/email?email=${encodeURIComponent(email)}`);
  const mail = await response.json();
  const link = new URL(mail.link); link.search = next;
  await page.goto(link.href);
  await expect(page.getByRole("heading", { name: "Xác nhận email của bạn" })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận email", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email đã được xác nhận" })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
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
  await tutor.getByRole("link", { name: "Tài khoản", exact: true }).click();
  await tutor.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await tutor.getByRole("tab", { name: "Tạo tài khoản" }).click();
  await tutor.getByLabel("Họ và tên", { exact: true }).fill("Gia sư kiểm thử");
  await tutor
    .getByLabel("Email", { exact: true })
    .fill("new-tutor@browser.test");
  await tutor.getByLabel(/Mật khẩu/).fill("BrowserStudy2026!");
  await tutor.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await tutor
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await verifyEmail(tutor, "new-tutor@browser.test");
  await expect(tutor).toHaveURL(/onboarding/);
  await tutor.getByRole("radio", { name: "Gia sư", exact: true }).click();
  await tutor.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await tutor.getByLabel("Tiêu đề hồ sơ", { exact: true }).fill("Gia sư Toán tận tâm");
  await tutor.getByLabel("Giới thiệu cách bạn dạy", { exact: true }).fill("Luyện tập theo năng lực của từng học sinh.");
  await tutor.getByLabel("Học vấn / Chuyên môn", { exact: true }).fill("Đại học Sư phạm");
  await tutor.getByLabel("Tên trường 1", { exact: true }).fill("Đại học Sư phạm Hà Nội");
  await tutor.getByLabel("Năm bắt đầu 1", { exact: true }).fill("2020");
  await tutor.getByLabel("Múi giờ của bạn").fill("Asia/Tokyo");
  await tutor.getByRole("checkbox", { name: "Toán", exact: true }).check();
  await tutor.getByRole("button", { name: "Lưu và tiếp tục", exact: true }).click();
  await expect(tutor.getByRole("heading", { name: "Sẵn sàng bắt đầu" })).toBeVisible();
  await tutor.reload();
  await expect(tutor.getByText("Hồ sơ đang chờ duyệt.", { exact: false })).toBeVisible();
  await tutor.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(tutor).toHaveURL(/studio/);
  await tutor.setViewportSize({ width: 390, height: 844 });
  await tutor.getByLabel("Chọn ảnh bìa", { exact: true }).setInputFiles({
    name: "banner.png",
    mimeType: "image/png",
    buffer: await sharp({ create: { width: 800, height: 200, channels: 3, background: "#527158" } }).png().toBuffer(),
  });
  await tutor.getByRole("button", { name: "Lưu ảnh bìa", exact: true }).click();
  await expect(
    tutor.getByRole("link", { name: "Xem ảnh bìa", exact: true }),
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
    tutor.getByRole("img", { name: "Ảnh bìa của bạn", exact: true }),
  ).toBeVisible();
  await tutor.setViewportSize({ width: 1440, height: 1000 });
  await tutor.getByLabel("Chọn ảnh bìa", { exact: true }).setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid file"),
  });
  await tutor.getByRole("button", { name: "Lưu ảnh bìa", exact: true }).click();
  await expect(
    tutor
      .locator(".upload-card")
      .filter({ hasText: "Chọn ảnh bìa" })
      .getByRole("alert"),
  ).toContainText("Ảnh không hợp lệ");
  await tutor.reload();
  await expect(
    tutor.getByRole("img", { name: "Ảnh bìa của bạn", exact: true }),
  ).toBeVisible();
  const galleryImage = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#527158" } }).png().toBuffer();
  await tutor.getByLabel("Thêm ảnh vào hồ sơ").setInputFiles([
    { name: "study.png", mimeType: "image/png", buffer: galleryImage },
    { name: "classroom.png", mimeType: "image/png", buffer: galleryImage },
  ]);
  await tutor.getByRole("button", { name: "Tải 2 ảnh lên", exact: true }).click();
  await expect(tutor.locator(".gallery-editor-item")).toHaveCount(2);
  await tutor.getByLabel("Chú thích ảnh 1", { exact: true }).fill("Góc học tập của tôi");
  await tutor.locator(".gallery-editor-item").first().getByRole("button", { name: "Lưu chú thích", exact: true }).click();
  await expect(tutor.getByText("Đã lưu chú thích. Hồ sơ sẽ được duyệt lại.", { exact: true })).toBeVisible();
  await tutor.reload();
  await expect(tutor.getByLabel("Chú thích ảnh 1", { exact: true })).toHaveValue("Góc học tập của tôi");
  await tutor.getByRole("tab", { name: "Hồ sơ nhận dạy" }).click();
  await tutor.getByLabel("Tiêu đề hồ sơ").fill("Gia sư Toán lớp 9");
  await tutor
    .getByLabel("Giới thiệu & phương pháp dạy")
    .fill("Học từ cơ bản, giải thích từng bước.");
  await tutor.getByLabel("Học vấn / Chuyên môn").fill("Sư phạm Toán");
  await tutor
    .getByLabel("Phương pháp giảng dạy", { exact: true })
    .fill("Dùng hình vẽ để hiểu bản chất trước khi làm bài.");
  await tutor
    .getByLabel("Một buổi học cùng tôi", { exact: true })
    .fill("Ôn mục tiêu, luyện theo năng lực và nhận phản hồi.");
  await tutor.getByRole("radio", { name: "Xanh lá", exact: true }).click();
  await choose(tutor, "Thêm thông tin", "Mục tùy chỉnh");
  await tutor.getByRole("button", { name: "Thêm mục", exact: true }).click();
  await tutor.getByLabel("Tiêu đề mục 1", { exact: true }).fill("Hoạt động giáo dục");
  await tutor.getByLabel("Nội dung mục 1", { exact: true }).fill("Hướng dẫn câu lạc bộ Toán từ năm 2022.");
  await tutor.getByRole("button", { name: "Thêm học vấn", exact: true }).click();
  await expect(tutor.getByLabel("Tên trường 2", { exact: true })).toBeFocused();
  await tutor.getByLabel("Tên trường 2", { exact: true }).fill("THPT Nguyễn Trãi");
  await choose(tutor, "Bậc học 2", "THPT");
  await tutor.getByLabel("Năm bắt đầu 2", { exact: true }).fill("2017");
  await tutor.getByRole("checkbox", { name: "Đang theo học", exact: true }).nth(1).uncheck();
  await tutor.getByLabel("Năm kết thúc 2", { exact: true }).fill("2020");
  const preview = tutor.getByRole("complementary", { name: "Xem trước hồ sơ" });
  await expect(preview.locator(".education-timeline li")).toHaveCount(2);
  await expect(preview.locator(".education-timeline li").first()).toContainText("THPT Nguyễn Trãi");
  await expect(preview.locator(".timezone-tag")).toContainText("Asia/Tokyo");
  await expect(preview.locator(".tutor-cover img")).toBeVisible();
  await expect(preview).toContainText("Hướng dẫn câu lạc bộ Toán từ năm 2022.");
  for (const width of [320, 768, 1024, 1440]) {
    await tutor.setViewportSize({ width, height: 900 });
    expect(await tutor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await expect(preview).toContainText("Gia sư Toán lớp 9");
  await expect(preview).toContainText(
    "Dùng hình vẽ để hiểu bản chất trước khi làm bài.",
  );
  await expect(preview.locator(".tutor-presentation")).toHaveAttribute(
    "data-theme",
    "sage",
  );

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
  await tutor.getByRole("button", { name: "Thứ 2, 18:00–20:00", exact: true }).click();
  await tutor.getByRole("button", { name: "Lưu lịch hằng tuần", exact: true }).click();
  await expect(tutor.getByText("Đã lưu lịch hằng tuần", { exact: true })).toBeVisible();
  await login(admin, "admin");
  await admin
    .getByRole("textbox", { name: "Tìm trong danh sách" })
    .fill("Gia sư kiểm thử");
  await admin.getByRole("button", { name: "Xem & duyệt" }).click();
  await expect(
    admin.getByRole("img", { name: "Ảnh bìa của Gia sư kiểm thử" }),
  ).toBeVisible();
  await expect(admin.getByRole("dialog")).toContainText(
    "Dùng hình vẽ để hiểu bản chất trước khi làm bài.",
  );
  await expect(admin.getByRole("dialog")).toContainText(
    "Ôn mục tiêu, luyện theo năng lực và nhận phản hồi.",
  );
  await expect(admin.getByRole("dialog").locator(".gallery-tile")).toHaveCount(2);
  await admin.getByRole("button", { name: "Duyệt & công bố" }).click();
  await expect(admin.getByRole("dialog")).not.toBeVisible();
  await expect(admin.locator(".admin-list")).toContainText("Đã công bố");
  await tutor.goto("/app/tutors?q=Gia+sư+kiểm+thử");
  await expect(tutor.locator(".tutor-card")).toHaveCount(1);
  await tutor.getByRole("link", { name: "Xem hồ sơ", exact: true }).click();
  await expect(tutor.locator(".tutor-cover img")).toBeVisible();
  await expect(tutor.getByRole("link", { name: "Tải CV", exact: true })).toHaveCount(0);
  await expect(tutor.getByText("Hướng dẫn câu lạc bộ Toán từ năm 2022.")).toBeVisible();
  await expect(tutor.locator(".profile-hero img")).toBeVisible();
  await expect(tutor.locator(".gallery-tile")).toHaveCount(2);
  await tutor.locator(".gallery-tile").first().click();
  await expect(tutor.getByRole("dialog")).toContainText("Góc học tập của tôi");
  await expect(tutor.locator(".gallery-full-image")).toBeVisible();
  await tutor.keyboard.press("ArrowRight");
  await expect(tutor.getByRole("dialog")).toContainText("Ảnh 2 / 2");
  await tutor.keyboard.press("Escape");
  await expect(tutor.locator(".gallery-tile").first()).toBeFocused();

  await expect(tutor.locator(".tutor-presentation")).toHaveAttribute(
    "data-theme",
    "sage",
  );
  await expect(tutor.locator(".tutor-presentation")).toContainText(
    "Ôn mục tiêu, luyện theo năng lực và nhận phản hồi.",
  );
  await tutor.setViewportSize({ width: 390, height: 844 });
  expect(
    await tutor.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const sc = await browser.newContext(), student = await sc.newPage();
  await login(student, "student");
  await student.goto(tutor.url());
  await student.locator(".gallery-tile").first().click();
  const studentDialog = student.getByRole("dialog");
  await studentDialog.getByRole("button", { name: "Thích · 0", exact: true }).click();
  await expect(studentDialog.getByRole("button", { name: "Đã thích · 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await studentDialog.getByLabel("Bình luận công khai").fill("Em thích góc học tập này <b>rất nhiều</b>.");
  await studentDialog.getByRole("button", { name: "Gửi bình luận", exact: true }).click();
  await expect(studentDialog.getByText("Em thích góc học tập này <b>rất nhiều</b>.", { exact: true })).toBeVisible();
  await student.reload();
  await student.locator(".gallery-tile").first().click();
  await expect(student.getByRole("dialog")).toContainText("Em thích góc học tập này <b>rất nhiều</b>.");
  await tutor.locator(".gallery-tile").first().click();
  await tutor.getByRole("dialog").getByRole("button", { name: /Xóa bình luận của/ }).click();
  await expect(tutor.getByRole("dialog")).toContainText("Chưa có bình luận.");
  await student.reload();
  await student.locator(".gallery-tile").first().click();
  await expect(student.getByRole("dialog")).toContainText("Chưa có bình luận.");
  await sc.close();
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
  await page.getByLabel("Múi giờ của bạn").fill("Asia/Tokyo");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(page.getByText("Đã lưu hồ sơ", { exact: true })).toBeVisible();
  await expect(page.locator(".account-timezone")).toContainText("Tokyo · GMT+9");
  await page.reload();
  await expect(page.getByLabel("Mục tiêu học tập")).toHaveValue(
    "Tìm gia sư Toán lớp 9",
  );
  await expect(page.getByLabel("Múi giờ của bạn")).toHaveValue("Asia/Tokyo");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 800 });
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
    for (const width of [320, 768, 1024, 1440]) {
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
      for (const name of ["Hồ sơ nhận dạy", "Giờ trống"]) {
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
  for (const path of [
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/assets/brand-icon-20261031.svg",
  ]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/image/);
  }
  await page.goto("/app/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#hero-title")).toBeVisible();
  const heroBefore = await page
    .locator(".hero-notebook")
    .evaluate((e) => getComputedStyle(e).translate);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() =>
      page
        .locator(".hero-notebook")
        .evaluate((e) => getComputedStyle(e).translate),
    )
    .not.toBe(heroBefore);
  await page.locator("#course-search").fill("ngu van");
  await expect(page.locator("#labs-container .lab:visible")).toHaveCount(1);
  await expect(page.locator("#labs-container .lab:visible")).toContainText(
    "Ngữ văn",
  );
  await page.locator("#course-search").fill("");
  await expect(page.locator("#labs-container .lab:visible")).toHaveCount(5);
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
    .getByRole("link", { name: "Tài khoản", exact: true })
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

test("Google-first unified account entry defers role choice and preserves return route", async ({
  page,
}) => {
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  await page.goto("/app/auth?mode=register&role=tutor&next=%2Fmessages");
  const google = page.getByRole("link", { name: "Tiếp tục với Google" });
  await expect(google).toHaveAttribute("href", "/api/auth/google/start?next=%2Fmessages");
  await expect(page.getByRole("combobox", { name: "Bạn tham gia với vai trò" })).toHaveCount(0);
  await page.goto("/app/auth?oauth_error=email_exists");
  await expect(page.getByRole("alert")).toContainText(
    "Email này đã có tài khoản",
  );
});

test("session connection failure preserves protected route and retries", async ({
  page,
}) => {
  await login(page, "student");
  await page.route("**/api/auth/me", (route) => route.abort("failed"));
  await page.goto("/app/settings");
  await expect(page.getByRole("alert")).toContainText(
    "Không thể kiểm tra phiên đăng nhập",
  );
  await expect(page).toHaveURL(/settings/);
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByLabel("Mục tiêu học tập")).toBeVisible();
});

test("Google provider failures stay visible and can be retried", async ({
  page,
}) => {
  await page.route("**/api/auth/providers", (route) => route.abort("failed"));
  await page.goto("/app/auth");
  await expect(page.getByRole("alert")).toContainText(
    "Không tải được đăng nhập Google.",
  );
  await page.unroute("**/api/auth/providers");
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { google: true } }),
  );
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Tiếp tục với Google" }),
  ).toBeVisible();
  await page.unroute("**/api/auth/providers");
  await page.route("**/api/auth/providers", (route) =>
    route.fulfill({ json: { google: false } }),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Google chưa được cấu hình" }),
  ).toBeDisabled();
});

test("student signup validates confirmation, resumes setup, retries saving and preserves the return route", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/auth?mode=register&next=%2Fmessages");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Học sinh mới");
  await page.getByLabel("Email", { exact: true }).fill("new-student@browser.test");
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("WrongPassword2026!");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Mật khẩu xác nhận chưa khớp.");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await verifyEmail(page, "new-student@browser.test");
  await expect(page).toHaveURL(/onboarding\?next=%2Fmessages/);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("button", { name: "Tiếp tục", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Học sinh", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Mục tiêu học tập")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Mục tiêu học tập")).toBeVisible();
  await page.getByLabel("Mục tiêu học tập").fill("Thi vào lớp 10, môn Toán");
  await page.route("**/api/account/onboarding", (route) => route.fulfill({ status: 503, json: { error: "Không thể lưu. Vui lòng thử lại." } }));
  await page.getByRole("button", { name: "Lưu và tiếp tục", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Không thể lưu");
  await expect(page.getByLabel("Mục tiêu học tập")).toHaveValue("Thi vào lớp 10, môn Toán");
  await page.unroute("**/api/account/onboarding");
  await page.getByRole("button", { name: "Lưu và tiếp tục", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sẵn sàng bắt đầu" })).toBeVisible();
  await page.getByRole("button", { name: "Sửa hồ sơ", exact: true }).click();
  await expect(page.getByLabel("Mục tiêu học tập")).toHaveValue("Thi vào lớp 10, môn Toán");
  await page.getByRole("button", { name: "Lưu và tiếp tục", exact: true }).click();
  await page.getByRole("button", { name: "Hoàn tất thiết lập", exact: true }).click();
  await expect(page).toHaveURL(/app\/messages$/);
  await page.reload();
  await expect(page).toHaveURL(/app\/messages$/);
  await page.goto("/app/onboarding");
  await expect(page).toHaveURL(/app\/workspace$/);
  expect(errors).toEqual([]);
});

test("administrator confirms or cancels promotion and the new administrator signs in again", async ({ browser }) => {
  const ac = await browser.newContext(), uc = await browser.newContext();
  const admin = await ac.newPage(), user = await uc.newPage();
  const errors: string[] = [];
  admin.on("pageerror", (e) => errors.push(e.message));
  const email = "promoted-admin@browser.test";
  const signup = await uc.request.post("/api/auth/register", { data: {
    name: "Quản trị viên mới", email, password: "BrowserStudy2026!", role: "student",
  } });
  expect(signup.status()).toBe(201);
  const target = (await signup.json()).user;
  await user.goto("/app/verify-email");
  await verifyEmail(user, email);
  await login(admin, "admin");
  await admin.goto("/app/admin?tab=users");
  await admin.getByLabel("Tìm trong danh sách").fill(email);
  const row = admin.locator(".admin-list article").filter({ hasText: email });
  await row.getByRole("button", { name: "Cấp quyền quản trị", exact: true }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog).toContainText(email);
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await uc.request.get("/api/auth/me")).json()).user.role).toBe("student");
  await admin.setViewportSize({ width: 390, height: 844 });
  await row.getByRole("button", { name: "Cấp quyền quản trị", exact: true }).click();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await admin.route(`**/api/admin/users/${target.id}/role`, (route) => route.fulfill({ status: 503, json: { error: "Không thể lưu. Vui lòng thử lại." } }));
  await dialog.getByRole("button", { name: "Xác nhận cấp quyền", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Không thể lưu");
  await admin.unroute(`**/api/admin/users/${target.id}/role`);
  await dialog.getByRole("button", { name: "Xác nhận cấp quyền", exact: true }).focus();
  await admin.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText("Quản trị viên");
  await expect(row.getByRole("button", { name: "Cấp quyền quản trị", exact: true })).toHaveCount(0);
  expect((await uc.request.get("/api/admin")).status()).toBe(401);
  await user.goto("/app/auth");
  await user.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await user.getByLabel("Email", { exact: true }).fill(email);
  await user.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await user.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(user).toHaveURL(/app\/admin$/);
  await expect(user.getByRole("heading", { name: "Quản trị nền tảng" })).toBeVisible();
  await admin.goto("/app/admin?tab=audit");
  await expect(admin.getByText(`user.promoted_to_admin · #${target.id}`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await ac.close();
  await uc.close();
});

test("parent chooses a separate setup and reaches shared booking tools", async ({ page }) => {
  await page.goto("/app/auth?mode=register");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Phụ huynh mới");
  await page.getByLabel("Email", { exact: true }).fill("parent@browser.test");
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await verifyEmail(page, "parent@browser.test");
  await page.getByRole("radio", { name: "Phụ huynh", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tìm gia sư cho con" })).toBeVisible();
  await page.getByLabel("Mục tiêu học tập của con").fill("Con ôn thi Toán lớp 9");
  await page.getByRole("button", { name: "Lưu và tiếp tục", exact: true }).click();
  await page.reload();
  await expect(page.getByText("Chọn môn học và gia sư phù hợp với mục tiêu của con.")).toBeVisible();
  await page.getByRole("button", { name: "Hoàn tất thiết lập" }).click();
  await expect(page).toHaveURL(/workspace/);
  await expect(page.locator(".sidebar").getByText("Phụ huynh", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Không gian phụ huynh", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar").getByRole("link", { name: "Lịch học của con", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar .brand")).toHaveAttribute("href", "/app/workspace");
  await page.getByRole("link", { name: "Xem buổi học sắp tới: 0", exact: true }).click();
  await expect(page).toHaveURL(/bookings$/);
  await page.goto("/app/bookings");
  await expect(page.locator("main h1")).toBeVisible();
  await page.goto("/app/settings");
  await expect(page.getByLabel("Mục tiêu học tập của con")).toHaveValue("Con ôn thi Toán lớp 9");
});

test("admin creates, publishes and unpublishes a safe public news article", async ({ page, browser }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await login(page, "admin");
  await page.getByRole("tab", { name: "Tin tức", exact: true }).click();
  await page.getByRole("button", { name: "Viết bài mới" }).click();
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Cách học Toán hiệu quả");
  await page.getByLabel("Tóm tắt", { exact: true }).fill("Bắt đầu với mục tiêu học tập.");
  await page.getByLabel("Nội dung", { exact: true }).fill('<script>alert("unsafe")</script>\nChọn một mục tiêu mỗi tuần.');
  await page.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page.getByText("Bản nháp", { exact: true })).toBeVisible();
  await guest.goto("/app/news");
  await expect(guest.getByText("Chưa có bài viết", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sửa bài viết" }).click();
  await page.getByLabel("Tiêu đề", { exact: true }).fill("Không lưu thay đổi này");
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cách học Toán hiệu quả", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sửa bài viết" }).click();
  await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue("Cách học Toán hiệu quả");
  await page.getByLabel("Công khai bài viết").check();
  await page.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page.getByText("Đã công khai", { exact: true })).toBeVisible();
  await guest.reload();
  await guest.getByRole("link", { name: "Cách học Toán hiệu quả" }).click();
  await expect(guest.locator(".news-body")).toContainText('<script>alert("unsafe")</script>');
  await expect(guest.locator(".news-body script")).toHaveCount(0);
  await expect(guest).toHaveTitle("Cách học Toán hiệu quả | Gia Sư 10 Điểm");
  const url = guest.url();
  const published = await guest.request.get(url);
  expect(published.status()).toBe(200);
  expect(await published.text()).toContain('name="robots" content="index, follow');
  await page.getByRole("button", { name: "Sửa bài viết" }).click();
  await page.getByLabel("Công khai bài viết").uncheck();
  await page.getByRole("button", { name: "Lưu bài viết" }).click();
  await expect(page.getByText("Bản nháp", { exact: true })).toBeVisible();
  expect((await guest.request.get(url)).status()).toBe(404);
  await guest.reload();
  await expect(guest.getByRole("alert")).toContainText("Không tìm thấy bài viết");
  await guestContext.close();
});

test("verification handles delivery errors, cross-browser activation and an already-open tab", async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  const page = await first.newPage(), other = await second.newPage();
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/auth/register", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), verification_sent: false } });
  });
  await page.goto("/app/auth?mode=register");
  await page.getByLabel("Họ và tên", { exact: true }).fill("Email ownership test");
  await page.getByLabel("Email", { exact: true }).fill("verify-browser@browser.test");
  await page.getByLabel("Mật khẩu (ít nhất 10 ký tự)", { exact: true }).fill("BrowserStudy2026!");
  await page.getByLabel("Xác nhận mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Chưa gửi được email");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Gửi lại email xác nhận" }).click();
  await expect(page.getByRole("alert")).toContainText("Vui lòng chờ");
  const captured = await (await page.request.get("/__test/email?email=verify-browser%40browser.test")).json();
  await other.goto(captured.link);
  // Loading the link alone must not activate the account.
  expect((await (await first.request.get("/api/auth/me")).json()).user.email_verification_required).toBe(true);
  await other.getByRole("button", { name: "Xác nhận email", exact: true }).focus();
  await other.keyboard.press("Enter");
  await expect(other.getByRole("heading", { name: "Email đã được xác nhận" })).toBeVisible();
  expect((await (await second.request.get("/api/auth/me")).json()).user).toBeNull();
  await other.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(other).toHaveURL(/\/auth$/);
  await page.getByRole("button", { name: "Tôi đã xác nhận email" }).click();
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(captured.link);
  await page.getByRole("button", { name: "Xác nhận email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("đã được sử dụng");
  expect(errors).toEqual([]);
  await first.close(); await second.close();
});

test("weekly grid supports rectangle drag, keyboard, touch, persistence and two-hour booking export", async ({ browser, page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await login(page, "chau");
  await page.goto("/app/studio?tab=files");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByLabel("Tiêu đề hồ sơ")).toBeVisible();
  await expect(page.locator("#studio-files")).toBeVisible();
  await page.getByRole("tab", { name: "Giờ trống", exact: true }).click();
  const cell = (day: string, time: string) => page.getByRole("button", { name: `${day}, ${time}`, exact: true });
  const first = cell("Thứ 2", "00:00–02:00"), end = cell("Thứ 4", "02:00–04:00");
  await first.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!, b = (await end.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.availability-grid button[aria-pressed="true"]')).toHaveCount(6);
  await first.focus(); await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowRight");
  await expect(cell("Thứ 3", "00:00–02:00")).toBeFocused();
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(page.locator('.availability-grid button[aria-pressed="true"]')).toHaveCount(0);
  await cell("Chủ nhật", "00:00–02:00").click();
  await page.getByRole("button", { name: "Lưu lịch hằng tuần", exact: true }).click();
  await expect(page.getByText("Đã lưu lịch hằng tuần", { exact: true })).toBeVisible();
  await page.reload();
  await expect(cell("Chủ nhật", "00:00–02:00")).toHaveAttribute("aria-pressed", "true");
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await first.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  await login(mobile, "chau"); await mobile.goto("/app/studio?tab=slots");
  const mobileCell = mobile.getByRole("button", { name: "Thứ 2, 00:00–02:00", exact: true });
  await mobileCell.tap(); await expect(mobileCell).toHaveAttribute("aria-pressed", "true");
  await mobileCell.tap(); await expect(mobileCell).toHaveAttribute("aria-pressed", "false");
  await mobileContext.close();
  const me = await (await page.request.get("/api/auth/me")).json();
  const profile = await (await page.request.get(`/api/tutors/${me.user.id}`)).json();
  const weekly = profile.slots.find((s: { source: string }) => s.source === "weekly");
  const studentContext = await browser.newContext(), student = await studentContext.newPage();
  await login(student, "student"); await student.goto(`/app/tutors/${me.user.id}`);
  await student.getByRole("combobox", { name: "Giờ học (Việt Nam)", exact: true }).click();
  await student.getByRole("option").filter({ hasText: "120 phút" }).first().click();
  await student.getByLabel("Bạn muốn học gì?").fill("Weekly browser test");
  await student.getByRole("button", { name: "Xem lại yêu cầu", exact: true }).click();
  const dialog = student.getByRole("dialog");
  await expect(dialog).toContainText("Học phí / 120 phút");
  await expect(dialog).toContainText(new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(profile.rate * 2));
  const bookedResponse = student.waitForResponse(r => r.url().endsWith("/api/bookings") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Gửi yêu cầu học", exact: true }).click();
  const booked = await bookedResponse;
  expect(booked.status()).toBe(201); const booking = await booked.json();
  const accepted = await page.request.patch(`/api/bookings/${booking.id}`, { data: { status: "accepted" } });
  expect(accepted.status()).toBe(200);
  await student.goto("/app/bookings");
  const lesson = student.locator(".lesson-card").filter({ hasText: "Weekly browser test" });
  await expect(lesson).toContainText("120 phút");
  const downloadPromise = student.waitForEvent("download");
  await lesson.getByRole("button", { name: /Lưu lịch/ }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream(); let ics = "";
  for await (const chunk of stream!) ics += chunk.toString();
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  expect(ics).toContain(`DTSTART:${stamp(new Date(weekly.starts_at))}`);
  expect(ics).toContain(`DTEND:${stamp(new Date(Date.parse(weekly.starts_at) + 7200000))}`);
  await student.request.patch(`/api/bookings/${booking.id}`, { data: { status: "cancelled" } });
  const schedule = (await (await page.request.get("/api/tutor/profile")).json()).weekly_schedule;
  await page.request.put("/api/tutor/availability", { data: { revision: schedule.revision, blocks: [] } });
  await studentContext.close();
  expect(errors).toEqual([]);
});
