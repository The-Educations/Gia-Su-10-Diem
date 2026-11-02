import sharp from "sharp";
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
  await login(admin, "admin", `/community/${postId}`);
  await expect(
    admin.getByRole("button", { name: "Ẩn bài", exact: true }),
  ).toHaveCount(0);
  await admin.getByRole("link", { name: "Xét duyệt bài viết" }).click();
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
  let identityRequests = 0;
  await tutor.route("**/api/community/me", async (route) => {
    identityRequests++;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await tutor
    .getByRole("button", { name: "Gửi bình luận", exact: true })
    .dblclick();
  await expect(
    tutor.getByRole("dialog", { name: "Tên hiển thị của bạn" }),
  ).toHaveCount(0);
  await expect(
    tutor.getByText("Bạn có thể bắt đầu với một bài đọc ngắn mỗi ngày.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    tutor.getByRole("heading", { name: "Bình luận (1)", exact: true }),
  ).toBeVisible();
  expect(identityRequests).toBe(1);
  await tutor.unroute("**/api/community/me");
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
  const anotherRevision = await page.request.put(
    `/api/community/posts/${postId}`,
    {
      data: { title, body: "Bản sửa cần xem lại trước khi khôi phục." },
    },
  );
  expect(anotherRevision.status()).toBe(200);
  await admin.reload();
  await admin.getByRole("button", { name: "Ẩn bài", exact: true }).click();
  await admin.getByLabel("Lý do", { exact: true }).fill("Nội dung cần xem lại");
  await confirm(admin);
  await expect(admin.getByText("Đã bị ẩn", { exact: true })).toBeVisible();
  await expect(
    admin.getByRole("link", { name: "Xét duyệt bài viết" }),
  ).toHaveCount(0);
  await admin
    .getByRole("link", { name: "Quản lý cộng đồng", exact: true })
    .click();
  await expect(
    admin.getByRole("combobox", { name: "Trạng thái bài" }),
  ).toContainText("Đã ẩn");
  await expect(
    admin.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
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

test("role workspaces, public identity and persistent admin navigation", async ({
  browser,
}) => {
  for (const [slug, tier] of [
    ["student", "Học sinh"],
    ["community-parent", "Phụ huynh"],
    ["community-pending", "Học sinh"],
    ["chau", "Gia sư"],
    ["admin", "Quản trị viên"],
  ]) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, slug);
    const workspace = page.getByRole("region", {
      name: "Không gian cộng đồng của bạn",
    });
    await expect(workspace.locator(".community-author")).toContainText(tier);
    await expect(workspace).not.toContainText("Private");
    await expect(
      workspace.getByRole("link", { name: "Thảo luận", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    if (slug === "admin") {
      await workspace.getByRole("link", { name: "Quản lý cộng đồng" }).click();
      await expect(
        page.getByRole("heading", { name: "Quản lý cộng đồng" }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Báo cáo", exact: true }).click();
      await page.reload();
      await expect(
        page.getByRole("tab", { name: "Báo cáo", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await page.getByRole("link", { name: /^Xem đã ẩn:/ }).click();
      await expect(
        page.getByRole("combobox", { name: "Trạng thái bài" }),
      ).toContainText("Đã ẩn");
      await page.reload();
      await expect(
        page.getByRole("combobox", { name: "Trạng thái bài" }),
      ).toContainText("Đã ẩn");
      await page.getByRole("tab", { name: "Thông báo & Quy tắc" }).focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", { name: "Sửa Quy tắc cộng đồng" }),
      ).toBeVisible();
    } else {
      await expect(
        workspace.getByRole("link", { name: "Quản lý cộng đồng" }),
      ).toHaveCount(0);
      if (slug === "chau") {
        await expect(
          workspace.getByRole("link", { name: /Gia sư/ }),
        ).toHaveAttribute("href", /\/app\/tutors\/\d+/);
        await page
          .getByRole("button", { name: "Đăng bài", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Đăng bài", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "← Bài của tôi", exact: true })
          .click();
      } else if (slug !== "student") {
        await page
          .getByRole("button", { name: "Đăng bài", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", { name: "Tên hiển thị của bạn" }),
        ).toBeVisible();
        await page
          .getByLabel("Tên hiển thị", { exact: true })
          .fill("Tên cộng đồng");
        await page.getByRole("button", { name: "Lưu tên và tiếp tục" }).click();
        await expect(
          page.getByRole("heading", { name: "Đăng bài", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "← Bài của tôi", exact: true })
          .click();
        await expect(workspace.locator(".community-author")).toContainText(
          `Tên cộng đồng - ${tier}`,
        );
      }
      await workspace.getByRole("link", { name: /Bài của tôi/ }).click();
      await expect(
        page.getByRole("heading", { name: "Bài của tôi", exact: true }),
      ).toBeVisible();
      await expect(
        workspace.getByRole("link", { name: /Bài của tôi/ }),
      ).toHaveAttribute("aria-current", "page");
    }
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
    }
    expect(errors).toEqual([]);
    await context.close();
  }
});

test("rich editor publishes formatting, links and uploaded images only after review", async ({
  page,
  browser,
}) => {
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  const guestContext = await browser.newContext(),
    guest = await guestContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "community-parent");
  await page.getByRole("button", { name: "Đăng bài", exact: true }).click();
  if (
    await page.getByRole("dialog", { name: "Tên hiển thị của bạn" }).isVisible()
  ) {
    await page
      .getByLabel("Tên hiển thị", { exact: true })
      .fill("Phụ huynh học tập");
    await page.getByRole("button", { name: "Lưu tên và tiếp tục" }).click();
  }
  const title = `Chia sẻ tài liệu học tập ${Date.now()}`;
  await page.getByLabel("Tiêu đề", { exact: true }).fill(title);
  const editor = page.getByRole("textbox", { name: "Nội dung", exact: true });
  await editor.fill("Cùng học hình học");
  await editor.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "In đậm", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("Cùng học hình học");
  await expect(editor).toBeFocused();
  await editor.press("ArrowRight");
  await editor.press("Enter");
  await page
    .getByRole("button", { name: "Chèn liên kết", exact: true })
    .click();
  await page.getByLabel("Địa chỉ liên kết").fill("https://example.org/hoc-tap");
  await page.getByLabel("Chữ hiển thị").fill("Tài liệu tham khảo");
  await page.getByRole("button", { name: "Chèn liên kết vào bài" }).click();
  await expect(editor.locator("a")).toHaveAttribute(
    "href",
    "https://example.org/hoc-tap",
  );
  await page.getByRole("button", { name: "Chèn ảnh", exact: true }).click();
  await page.getByLabel("Mô tả ảnh", { exact: true }).fill("Sơ đồ hình học");
  const buffer = await sharp({
    create: { width: 300, height: 180, channels: 3, background: "#852f36" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel(/Chọn ảnh/)
    .setInputFiles({ name: "hinh-hoc.png", mimeType: "image/png", buffer });
  await expect(
    editor.getByRole("img", { name: "Sơ đồ hình học" }),
  ).toBeVisible();
  const imageUrl = await editor.locator("img").getAttribute("src");
  expect((await guest.request.get(imageUrl!)).status()).toBe(404);
  await page.setViewportSize({ width: 360, height: 900 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Gửi bài chờ duyệt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const path = new URL(page.url()).pathname;
  await login(admin, "admin", "/admin?tab=community");
  const card = admin
    .locator(".community-card")
    .filter({ has: admin.getByRole("heading", { name: title, exact: true }) });
  await expect(card.getByRole("img", { name: "Sơ đồ hình học" })).toBeVisible();
  await expect(
    card.locator("strong").filter({ hasText: "Cùng học hình học" }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Duyệt", exact: true }).click();
  await confirm(admin);
  await guest.goto(path);
  await expect(
    guest.getByRole("img", { name: "Sơ đồ hình học" }),
  ).toBeVisible();
  expect((await guest.request.get(imageUrl!)).status()).toBe(200);
  await expect(
    guest.getByRole("link", { name: "Tài liệu tham khảo" }),
  ).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
  await page.reload();
  await page.getByRole("button", { name: "Sửa bài", exact: true }).click();
  await expect(
    page
      .getByRole("textbox", { name: "Nội dung", exact: true })
      .locator("strong"),
  ).toHaveText("Cùng học hình học");
  await expect(
    page.getByRole("dialog").getByRole("img", { name: "Sơ đồ hình học" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const postId = path.split("/").at(-1);
  const imageOnly = await page.request.put(`/api/community/posts/${postId}`, {
    data: {
      title,
      body_html: `<img src="${imageUrl}" alt="Ảnh trong bản sửa">`,
    },
  });
  expect(imageOnly.status()).toBe(200);
  await page.reload();
  await page.getByText("Xem bản sửa", { exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Ảnh trong bản sửa" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sửa bài", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("0/5000", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("img", { name: "Ảnh trong bản sửa" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await adminContext.close();
  await guestContext.close();
});

test("dedicated composer saves private drafts, reopens them and submits for each role", async ({
  browser,
}) => {
  for (const slug of ["student", "community-parent", "chau", "admin"]) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await login(page, slug);
    if (slug === "admin") {
      await page
        .getByRole("link", { name: "Quản lý cộng đồng", exact: true })
        .click();
    }
    await page
      .getByRole("button", {
        name: slug === "admin" ? "Viết bài" : "Đăng bài",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/app\/community\/write$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const editor = page.getByRole("textbox", { name: "Nội dung", exact: true });
    await editor.fill("Ý tưởng học tập còn đang viết");
    await editor.press("ControlOrMeta+A");
    await page.getByRole("button", { name: "In đậm", exact: true }).click();
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/community\/write\?draft=/);
    await expect(page.getByText("Đã lưu nháp", { exact: true })).toBeVisible();
    const draftPath = new URL(page.url()).pathname + new URL(page.url()).search;
    await page.reload();
    await expect(editor.locator("strong")).toHaveText(
      "Ý tưởng học tập còn đang viết",
    );
    const title = `Nháp học tập ${slug} ${Date.now()}`;
    await page.getByLabel("Tiêu đề", { exact: true }).fill(title);
    await page.goBack();
    await expect(
      page.getByRole("dialog", { name: "Bản nháp chưa được lưu" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tiếp tục viết", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp("draft="));
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
      title,
    );
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await expect(page.getByText("Đã lưu nháp", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "← Bài của tôi", exact: true })
      .click();
    const drafts = page.getByRole("region", { name: "Bản nháp", exact: true });
    await expect(
      drafts.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await drafts.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname + url.search === draftPath,
    );
    await expect(page.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
      title,
    );
    const seo = await page.request.get(draftPath);
    expect(seo.status()).toBe(200);
    expect(await seo.text()).toContain("noindex");
    for (const width of [360, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page
      .getByRole("button", {
        name: slug === "admin" ? "Lưu và công khai" : "Gửi bài chờ duyệt",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/app\/community\/\d+$/);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (slug !== "admin")
      await expect(
        page.getByText("Đang chờ duyệt", { exact: true }),
      ).toBeVisible();
    const remaining = await page.request.get("/api/community/drafts");
    expect(
      (await remaining.json()).items.some(
        (d: { title: string }) => d.title === title,
      ),
    ).toBe(false);
    await context.close();
  }
});
