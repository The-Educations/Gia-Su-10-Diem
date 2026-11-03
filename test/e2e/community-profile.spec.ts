import sharp from "sharp";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

async function signIn(request: APIRequestContext, slug: string) {
  const response = await request.post("/api/auth/login", {
    data: { email: `${slug}@demo.giasu.test`, password: "BrowserStudy2026!" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).user;
}
async function fits(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
}

test("member account menu, profile editing, cropped media, author links and responsive layouts", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const user = await signIn(page.request, "profile-student");
  const admin = await browser.newContext();
  await signIn(admin.request, "profile-admin");
  const submitted = await page.request.post("/api/community/posts", {
    data: {
      title: "Học toán cùng nhau",
      body: "Cùng trao đổi cách học hình học hiệu quả.",
    },
  });
  expect(submitted.status()).toBe(201);
  const post = await submitted.json();
  expect(
    (
      await admin.request.post(
        `/api/admin/community/posts/${post.id}/approve`,
        { data: { expected_version: 0 } },
      )
    ).status(),
  ).toBe(200);
  await page.goto("/app/community");
  const account = page.getByRole("button", {
    name: `Tài khoản: ${user.name}`,
    exact: true,
  });
  await page.getByRole("button", { name: "Thu gọn thanh điều hướng", exact:true }).click();
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Xem hồ sơ của tôi", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".account-menu a")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
  await account.click();
  await page
    .getByRole("link", { name: "Cài đặt tài khoản", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole("link", { name: "Hồ sơ cộng đồng của tôi" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/community/members/${user.profile_code}$`),
  );
  await page
    .getByRole("button", { name: "Chỉnh sửa hồ sơ", exact: true })
    .click();
  const image = await sharp({
    create: { width: 1000, height: 600, channels: 3, background: "#a94c4f" },
  })
    .png()
    .toBuffer();
  for (const label of ["Ảnh đại diện", "Ảnh bìa"]) {
    await page
      .getByLabel(label, { exact: true })
      .setInputFiles({
        name: "profile.png",
        mimeType: "image/png",
        buffer: image,
      });
    const crop = page.getByRole("dialog", { name: "Điều chỉnh ảnh" });
    await expect(crop).toBeVisible();
    await crop
      .getByRole("button", { name: /Dùng ảnh|Sử dụng|Áp dụng/ })
      .click();
    await expect(crop).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Xóa ${label.toLowerCase()}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Minh cộng đồng");
  await page.getByLabel(/Giới thiệu/).fill("Mình yêu thích hình học và sách.");
  await page.getByRole("button", { name: "Lưu hồ sơ", exact: true }).dblclick();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Minh cộng đồng", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".member-cover img")).toBeVisible();
  await expect(page.locator(".member-avatar img")).toBeVisible();
  await expect(
    page.getByText("Mình yêu thích hình học và sách.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Minh cộng đồng - Học sinh/ }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Sắp xếp bài viết" }).click();
  await page.getByRole("option", { name: "Hữu ích nhất" }).click();
  await page.reload();
  await expect(page).toHaveURL(/sort=helpful/);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Sao chép liên kết" }).click();
  await expect(
    page.getByText("Đã sao chép liên kết", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await fits(page);
  await expect(
    page.getByRole("heading", { name: "Minh cộng đồng", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await admin.close();
});

test("all author tiers link to private profiles and guests return after login", async ({
  page,
  browser,
}) => {
  const admin = await browser.newContext();
  await signIn(admin.request, "profile-admin");
  for (const slug of [
    "profile-parent",
    "profile-tutor",
    "profile-pending",
    "profile-admin",
  ]) {
    const user = await signIn(page.request, slug);
    const submitted = await page.request.post("/api/community/posts", {
      data: { title: `Chia sẻ ${slug}`, body: "Trao đổi kiến thức mỗi tuần." },
    });
    expect(submitted.status()).toBe(201);
    const post = await submitted.json();
    if (slug !== "profile-admin")
      expect(
        (
          await admin.request.post(
            `/api/admin/community/posts/${post.id}/approve`,
            { data: { expected_version: 0 } },
          )
        ).status(),
      ).toBe(200);
    const comment = await page.request.post(
      `/api/community/posts/${post.id}/comments`,
      { data: { body: "Mình cùng học nhé." } },
    );
    expect(comment.status()).toBe(201);
    await page.goto(`/app/community/${post.id}`);
    const author = page.locator(
      `a.community-author[href="/app/community/members/${user.profile_code}"]`,
    );
    await expect(author).toHaveCount(2);
    await author.last().click();
    await expect(
      page.getByRole("heading", { name: post.author.name_part, exact: true }),
    ).toBeVisible();
    if (slug === "profile-tutor") {
      await page
        .getByRole("link", { name: "Xem hồ sơ gia sư", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/tutors/${user.id}$`));
    } else if (slug === "profile-pending")
      await expect(
        page.getByRole("link", { name: "Xem hồ sơ gia sư" }),
      ).toHaveCount(0);
    if (slug === "profile-parent") {
      expect(
        (await page.request.post("/api/auth/logout", { data: {} })).status(),
      ).toBe(200);
      await page.goto(`/app/community/${post.id}`);
      await expect(page.locator(".community-author img")).toHaveCount(0);
      await page
        .locator(
          `a.community-author[href="/app/community/members/${user.profile_code}"]`,
        )
        .first()
        .click();
      await expect(page).toHaveURL(/\/auth\?next=/);
      await page
        .getByRole("button", { name: "Dùng email và mật khẩu" })
        .click();
      await page.getByRole("checkbox", { name: /Đồng ý/ }).check();
      await page
        .getByLabel("Email", { exact: true })
        .fill("profile-other@demo.giasu.test");
      await page
        .getByLabel("Mật khẩu", { exact: true })
        .fill("BrowserStudy2026!");
      await page
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/community/members/${user.profile_code}$`),
      );
      await expect(
        page.getByRole("heading", { name: post.author.name_part, exact: true }),
      ).toBeVisible();
    }
  }
  await admin.close();
});

test("profile report queue removes content with a reason and notifies only its owner", async ({
  page,
  browser,
}) => {
  const owner = await browser.newContext();
  const user = await signIn(owner.request, "profile-pending");
  expect(
    (
      await owner.request.put("/api/community/me/profile", {
        data: { bio: "Cùng chia sẻ kiến thức học tập." },
      })
    ).status(),
  ).toBe(200);
  await signIn(page.request, "profile-other");
  await page.goto(`/app/community/members/${user.profile_code}`);
  await page.getByRole("button", { name: "Báo cáo", exact: true }).click();
  await page.getByRole("combobox", { name: "Phần cần báo cáo" }).click();
  await page.getByRole("option", { name: "Giới thiệu", exact: true }).click();
  await page.getByRole("button", { name: "Gửi báo cáo", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await signIn(page.request, "profile-admin");
  await page.goto("/app/admin?tab=community&section=reports");
  await expect(
    page.getByText("Hồ sơ · Giới thiệu", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xóa giới thiệu", exact: true })
    .click();
  await page
    .getByLabel("Lý do", { exact: true })
    .fill("Vui lòng cập nhật giới thiệu phù hợp hơn.");
  await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Giới thiệu đã được xóa", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Xem hồ sơ", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Quản trị hồ sơ" }),
  ).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  const ownerPage = await owner.newPage();
  await ownerPage.goto("/app/community");
  await ownerPage.getByRole("button", { name: "Thông báo cộng đồng" }).click();
  await expect(
    ownerPage.getByText(/Giới thiệu đã được gỡ: Vui lòng cập nhật/),
  ).toBeVisible();
  await ownerPage
    .getByRole("link", { name: /Nội dung hồ sơ đã được gỡ/ })
    .click();
  await expect(ownerPage).toHaveURL(
    new RegExp(`/community/members/${user.profile_code}$`),
  );
  await expect(
    ownerPage.getByRole("region", { name: "Quản trị hồ sơ" }),
  ).toHaveCount(0);
  await owner.close();
});

test("profile links fall back to a selectable URL and private SEO on direct entry", async ({
  page,
}) => {
  const user = await signIn(page.request, "profile-other");
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("Denied")) },
      configurable: true,
    }),
  );
  const response = await page.goto(
    `/app/community/members/${user.profile_code}`,
  );
  expect(response?.status()).toBe(200);
  await page.getByRole("button", { name: "Sao chép liên kết" }).click();
  await expect(page.getByLabel("Liên kết hồ sơ", { exact: true })).toHaveValue(
    new RegExp(`/app/community/members/${user.profile_code}$`),
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(
    page.locator(
      'meta[property="og:image"],script[type="application/ld+json"]',
    ),
  ).toHaveCount(0);
});
