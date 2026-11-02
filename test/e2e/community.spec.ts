import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function login(page: Page, slug: string, next = "/community") {
  await page.goto(`/app/auth?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Dùng email và mật khẩu" }).click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${slug}@demo.giasu.test`);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("BrowserStudy2026!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname + url.search === `/app${next}`,
  );
}
async function requestLogin(request: APIRequestContext, slug: string) {
  const r = await request.post("/api/auth/login", {
    data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" },
  });
  expect(r.status()).toBe(200);
}
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("community submission, rejection, revisions, tutor comments and moderation", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  const tutorContext = await browser.newContext(),
    tutor = await tutorContext.newPage();
  await login(page, "student");
  await page.getByRole("button", { name: "Đăng bài", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tên hiển thị của bạn" }),
  ).toBeVisible();
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Minh học tập");
  await page.getByRole("button", { name: "Lưu tên và tiếp tục" }).click();
  const title = `Kinh nghiệm học Anh văn ${Date.now()}`;
  await page.getByLabel("Tiêu đề", { exact: true }).fill(title);
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("Mình đang học lớp 8. Nên chọn gia sư có cách dạy như thế nào?");
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Gửi bài chờ duyệt", exact: true })
    .click();
  await expect(page.getByText("Đang chờ duyệt", { exact: true })).toBeVisible();
  const path = new URL(page.url()).pathname,
    postId = path.split("/").at(-1)!;
  await login(admin, "admin", "/admin?tab=community");
  let card = admin
    .locator(".community-card")
    .filter({ has: admin.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Từ chối", exact: true }).click();
  await admin
    .getByLabel("Lý do", { exact: true })
    .fill("Bổ sung mục tiêu học của bạn.");
  await confirm(admin);
  await page.reload();
  await expect(
    page.getByText("Bổ sung mục tiêu học của bạn.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sửa và gửi lại", exact: true })
    .click();
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("Mình học lớp 8 và muốn cải thiện kỹ năng đọc tiếng Anh.");
  await page
    .getByRole("button", { name: "Gửi bài chờ duyệt", exact: true })
    .click();
  await admin.reload();
  card = admin
    .locator(".community-card")
    .filter({ has: admin.getByRole("heading", { name: title, exact: true }) });
  await card.getByRole("button", { name: "Duyệt", exact: true }).click();
  await confirm(admin);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Bình luận (0)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa bài", exact: true }).click();
  await page
    .getByLabel("Nội dung", { exact: true })
    .fill("Bản sửa cần thêm bài đọc phù hợp trình độ.");
  await page
    .getByRole("button", { name: "Gửi bài chờ duyệt", exact: true })
    .click();
  await expect(
    page.getByText("Bản sửa đang chờ duyệt", { exact: true }),
  ).toBeVisible();
  const publicPost = await browser.newContext();
  const response = await publicPost.request.get(
    `/api/community/posts/${postId}`,
  );
  expect((await response.json()).body).toContain("cải thiện kỹ năng đọc");
  await publicPost.close();
  await admin.reload();
  await expect(
    admin.getByRole("heading", { name: "Bản đang hiển thị" }),
  ).toBeVisible();
  await admin.getByRole("button", { name: "Duyệt", exact: true }).click();
  await confirm(admin);
  await login(tutor, "chau", `/community/${postId}`);
  await tutor
    .getByLabel("Bình luận", { exact: true })
    .fill("Bạn có thể bắt đầu với một bài đọc ngắn mỗi ngày.");
  await tutor
    .getByRole("button", { name: "Gửi bình luận", exact: true })
    .click();
  if (
    await tutor
      .getByRole("dialog", { name: "Tên hiển thị của bạn" })
      .isVisible()
  ) {
    await tutor.getByLabel("Tên hiển thị", { exact: true }).fill("Châu");
    await tutor.getByRole("button", { name: "Lưu tên và tiếp tục" }).click();
  }
  await expect(
    tutor.getByText("Bạn có thể bắt đầu với một bài đọc ngắn mỗi ngày.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".community-comment").getByRole("link", { name: /Gia sư/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hữu ích (0)", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hữu ích (1)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Chọn câu trả lời hay nhất", exact: true })
    .click();
  await expect(page.locator(".community-best")).toBeVisible();
  await page
    .getByRole("button", { name: "Đánh dấu đã giải quyết", exact: true })
    .click();
  await expect(page.getByText("Đã giải quyết", { exact: true })).toBeVisible();
  await admin.goto(path);
  await admin
    .getByRole("button", { name: "Gỡ bình luận", exact: true })
    .click();
  await admin.getByLabel("Lý do", { exact: true }).fill("Kiểm thử quản trị");
  await confirm(admin);
  await admin.getByRole("button", { name: "Ẩn bài", exact: true }).click();
  await admin.getByLabel("Lý do", { exact: true }).fill("Nội dung cần xem lại");
  await confirm(admin);
  await expect(admin.getByText("Đã bị ẩn", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Nội dung cần xem lại", { exact: true }),
  ).toBeVisible();
  const adminApi = adminContext.request;
  const student = await page.request.get("/api/auth/me");
  const user = (await student.json()).user;
  await adminApi.patch(`/api/admin/community/users/${user.id}/lock`, {
    data: { locked: true, reason: "Kiểm thử khóa quyền" },
  });
  await page.goto("/app/community");
  await page.getByRole("button", { name: "Đăng bài", exact: true }).click();
  await expect(
    page.getByText(/Quyền đăng bài của bạn đang bị khóa/),
  ).toBeVisible();
  await adminApi.patch(`/api/admin/community/users/${user.id}/lock`, {
    data: { locked: false, reason: "Kết thúc kiểm thử" },
  });
  const audit = await adminApi.get("/api/admin");
  expect(
    (await audit.json()).audit.some(
      (a: { action: string }) => a.action === "community.user.lock",
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await adminContext.close();
  await tutorContext.close();
});

test("community guest, SEO, pinned rules, keyboard expansion and responsive widths", async ({
  page,
  browser,
}) => {
  const admin = await browser.newContext();
  await requestLogin(admin.request, "admin");
  const body = Array.from(
    { length: 12 },
    (_, i) =>
      `Kinh nghiệm ${i + 1}: dành thời gian đọc và ôn lại bài học mỗi ngày.`,
  ).join("\n");
  const created = await admin.request.post("/api/admin/community/posts", {
    data: { title: "Chia sẻ cách học tiếng Anh", body },
  });
  expect(created.status()).toBe(201);
  const post = await created.json();
  await page.goto("/app/community");
  const nav = page.locator("#desktop-navigation nav a");
  const names = await nav.allTextContents();
  expect(names.findIndex((n) => n.includes("Cộng đồng"))).toBe(
    names.findIndex((n) => n.includes("Tìm môn học")) + 1,
  );
  await expect(page.locator(".community-card").first()).toHaveClass(
    /community-rules/,
  );
  const more = page
    .locator(".community-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Chia sẻ cách học tiếng Anh",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Xem thêm", exact: true });
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Thu gọn", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Tìm bài viết", exact: true })
    .fill("khong-khop");
  await page.getByRole("button", { name: "Tìm kiếm", exact: true }).click();
  await expect(page.locator(".community-rules")).toBeVisible();
  await expect(page.getByText("Chưa có bài viết phù hợp")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".community-rules")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(page.locator(".page")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "test-results/community-desktop.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.locator(".page")).toHaveCSS("opacity", "1");
  await expect(page.locator(".page")).toHaveCSS("transform", "none");
  await page.locator("#main").focus();
  await page.screenshot({
    path: "test-results/community-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đăng bài", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Tham gia cộng đồng" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`/app/community/${post.id}`);
  await page
    .getByRole("button", { name: "Đăng nhập để bình luận", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Đăng nhập / Tạo tài khoản", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("next")).toBe(
    `/community/${post.id}`,
  );
  const html = await page.request.get(`/app/community/${post.id}`);
  expect(html.status()).toBe(200);
  expect(await html.text()).toContain("DiscussionForumPosting");
  const pending = await admin.request.get(
    "/api/admin/community/posts?status=hidden",
  );
  for (const p of (await pending.json()).items) {
    const hidden = await page.request.get(`/app/community/${p.id}`);
    expect(hidden.status()).toBe(404);
    expect(await hidden.text()).toContain("noindex");
  }
  await admin.close();
});
