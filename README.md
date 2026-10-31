# Gia Sư 10 Điểm

Website tìm gia sư tại Việt Nam cho học sinh / phụ huynh, gia sư và quản trị viên. Landing tại `/`, ứng dụng tại các route `/app/*`, API tại `/api/`.

Ứng dụng có tìm kiếm, lọc theo môn / cấp học / mục tiêu kỳ thi, hồ sơ gia sư, đặt lịch, liên hệ trước khi đặt lịch, nhắn tin theo buổi học, đánh giá, quản lý giờ trống và quản trị. Dữ liệu lưu trong SQLite. **Không có quiz, đáp án hoặc chấm điểm.**

## Chạy local

Yêu cầu Node `>=24.13.0`; phiên kiểm tra dùng Node `26.12.1`.

```bash
npm ci
npm run seed:demo
npm run dev
```

Mở **http://127.0.0.1:4174/app/**. Bỏ qua `seed:demo` nếu muốn bắt đầu với danh mục và không có tài khoản mẫu. Server tự tạo database tại `.data/marketplace.sqlite`.

| Vai trò mẫu | Email |
| --- | --- |
| Học sinh | `student@demo.giasu.test` |
| Gia sư | `chau@demo.giasu.test` |
| Quản trị | `admin@demo.giasu.test` |

Mật khẩu mặc định cho các tài khoản minh họa: `DemoStudy2026!`. Có thể đặt `DEMO_PASSWORD` trước lần seed đầu tiên; seed lại không đổi mật khẩu hoặc đặt lại dữ liệu tài khoản đã tồn tại. Các hồ sơ đều hư cấu và có nhãn mẫu. Seed demo bị chặn trong production.

Demo gồm 6 hồ sơ với bio riêng, ảnh minh họa do dự án tạo, CV PDF mẫu, một buổi hoàn thành có đánh giá, một buổi đã nhận, một yêu cầu đang chờ, favorites và hội thoại tư vấn. Seed có dấu mốc để chạy lại không nhân đôi dữ liệu hoặc ghi đè hồ sơ đã sửa. Các test dùng hồ sơ mẫu nhưng tắt activity để kiểm tra lifecycle riêng.

## Ảnh hồ sơ, CV và liên hệ

Gia sư vào **Hồ sơ & giờ trống → Ảnh & CV** để chọn tệp, xem trước ảnh rồi lưu. Hỗ trợ JPG/PNG/WebP (tối đa 5 MB, 16 triệu pixel) và CV PDF (tối đa 5 MB, 20 trang, không khóa mật khẩu). Ảnh được crop giữa thành 640×640 WebP và bỏ metadata. Tệp lưu trong SQLite, có thay thế / xóa; xử lý bằng Sharp local hoặc Cloudflare Images trên production.

Upload mới đưa hồ sơ về chờ duyệt. Gia sư và admin xem được tệp trong lúc xét duyệt; sau khi công bố, ảnh và CV xuất hiện công khai. **CV công khai nên chỉ chứa thông tin bạn muốn chia sẻ.** CV được tải dưới dạng attachment, không nhúng PDF vào trang. Kiểm tra định dạng không phải quét malware; chưa có dịch vụ quét tệp cho production.

Nút **Liên hệ gia sư** mở hội thoại trước khi đặt lịch. Chỉ student và tutor của hội thoại đọc / gửi được; admin không đọc các inquiry này. Tin nhắn theo booking giữ phân quyền cũ. Liên hệ trong ứng dụng, chưa gửi email/SMS hoặc công khai số điện thoại.

Để xem bản build:

```bash
npm run build
npm run preview
```

`preview` dùng cùng database local và cổng 4174; dừng dev trước khi chạy. Tạo admin riêng bằng `npm run create:admin`, với `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` cung cấp qua môi trường. Không có đăng ký admin công khai.

## Chức năng

- **Khách:** tìm có / không dấu; lọc môn, hình thức, địa điểm, mức phí, cấp học, mục tiêu kỳ thi; sắp xếp; xem hồ sơ và giờ trống.
- **Học sinh / phụ huynh:** đăng ký, lưu gia sư, tải CV công khai, nhắn hỏi gia sư trước khi đặt lịch, gửi yêu cầu học, theo dõi / hủy lịch, nhắn tin, xuất lịch `.ics`, đánh giá buổi đã hoàn thành, cập nhật tài khoản và mật khẩu.
- **Gia sư:** tải ảnh đại diện và CV PDF, khai báo chuyên môn / mục tiêu, gửi duyệt hồ sơ, thêm giờ trống, nhận / từ chối / hủy / hoàn thành buổi, nhắn tin và ghi chú / liên kết phòng học.
- **Quản trị:** duyệt hoặc yêu cầu bổ sung hồ sơ, khóa / mở tài khoản, chỉnh môn học và mục kỳ thi, xem lịch và nhật ký thao tác.
- **Không gian theo vai trò:** lịch tuần và buổi tiếp theo cho học sinh; yêu cầu chờ và mức hoàn thiện hồ sơ cho gia sư; hàng đợi duyệt có bộ lọc cho admin. Studio chia tab Ảnh & CV / Hồ sơ / Giờ trống, giữ bản nháp khi đổi tab.
- **Giao diện:** nền giấy ấm, đỏ sẫm, Be Vietnam Pro / Lora, shadcn + Animate UI, menu di động, trạng thái tải / lỗi / trống và reduced motion.

## Kiểm tra

```bash
npm run typecheck
npm test
npm run test:e2e
```

`npm test` gồm kiểm tra landing và 11 API/OAuth integration tests bằng database tạm. `test:e2e` build ứng dụng rồi chạy 8 luồng Playwright trên cổng 4175, database riêng; cần Chrome đã cài (hoặc `npx playwright install chrome`). Bao gồm booking giữa hai browser context, nhắn tin sau reload, upload ảnh / CV, admin duyệt và public download, liên hệ trước khi đặt lịch, responsive 360–1440 px, focus menu, lịch tuần bằng bàn phím, giữ bản nháp studio và giữ tab admin sau khi lưu. Các lệnh này được kiểm tra local; không thay thế kiểm tra hosting thực tế.

## Mã nguồn & tài liệu

| Nguồn | Trách nhiệm |
| --- | --- |
| `inputs.json`, `styles.css`, `scripts/build-page.js` | Nguồn landing → `index.html`; chạy `npm run build:page` sau khi sửa |
| `scripts/site.js`, `assets/` | Tương tác và hình ảnh landing |
| `scripts/generate-landing-assets.js` | Sinh SVG giáo dục và favicon SVG/PNG/ICO; chạy bằng Node |
| `app/src/` | React, TypeScript, các trang và UI |
| `server/` | Express, SQLite, xác thực và nghiệp vụ |
| `test/` | Landing, API và browser tests |
| [Phạm vi](docs/marketplace.md) | Luồng, vai trò, quy tắc và giới hạn |
| [Kiến trúc](docs/architecture.md) | Routes, API, dữ liệu, cấu hình |
| [Bàn giao](docs/development-handoff.md) | Bằng chứng kiểm tra và việc còn lại |

## Giới hạn hiện tại

Danh mục khởi đầu có 25 nhóm môn và 8 nguồn tham khảo kỳ thi; chưa bao phủ hoặc xác minh mọi kỳ thi tại Việt Nam. Mục tiêu luyện thi do gia sư khai báo, không phải chứng nhận năng lực. Admin công bố hồ sơ không đồng nghĩa đã xác minh danh tính / bằng cấp.

Chưa có thanh toán, email xác thực / khôi phục mật khẩu, thông báo gửi ra ngoài, video tích hợp, tải chứng chỉ hoặc lịch lặp. Form landing mở tìm gia sư theo môn học và hình thức học.

Production dùng HTTPS `APP_ORIGIN` và Durable Object SQLite; xem tài liệu Cloudflare để triển khai và khôi phục.

## Cloudflare & Google OAuth

Cấu hình triển khai tại [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md). Worker phục vụ landing ở `/`; `/app/` mở landing, các route cụ thể vẫn mở workspace. Google sign-in hỗ trợ student/tutor và liên kết tài khoản trong Settings; admin được cấp qua email Google đã xác minh trong secret cấu hình.

`npm run build:cloudflare` tạo assets; `npm run deploy` build và triển khai theo `wrangler.jsonc`. Production dùng Durable Object SQLite và Cloudflare Images; local vẫn dùng Node SQLite/Sharp. Không seed tài khoản mẫu lên production.
