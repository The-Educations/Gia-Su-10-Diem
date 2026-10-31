# Kiến trúc và bản đồ mã nguồn

Trạng thái: bản local đã qua typecheck, build, API và browser tests; xem [bằng chứng](development-handoff.md). Thông tin deployment hiện hành ở [Cloudflare](cloudflare-deployment.md).

## Topology

```text
Trình duyệt
  /                  landing index.html được sinh từ nguồn
  /assets/*          hình ảnh landing
  /app/*             React SPA + React Router (basename /app)
  /api/*             Express JSON API
                         |
                         +-- SQLite: .data/marketplace.sqlite
```

Trong development, Express gắn Vite middleware. Trong production hoặc local preview (`SERVE_BUILD=1`), Express phục vụ `dist/app/`. Cùng một origin để dùng cookie phiên. Cloudflare Worker production dùng cùng Express API qua Node HTTP adapter và Durable Object SQLite; xem [deployment](cloudflare-deployment.md).

## Các file sở hữu chức năng

| File / thư mục | Trách nhiệm |
| --- | --- |
| `inputs.json`, `styles.css` | Nội dung và style landing; độc lập với app CSS |
| `scripts/build-page.js` | Sinh `index.html`; giữ các cải tiến landing trước đó |
| `scripts/site.js` | Tìm chương trình, menu, bản nháp tư vấn landing |
| `app/index.html` | Entry HTML của SPA |
| `app/src/main.tsx` | Shell, router, menu theo vai trò, lazy-loaded pages |
| `app/src/lib/api.tsx` | Fetch API, trạng thái người dùng, tải dữ liệu, format VND / giờ Việt Nam |
| `app/src/lib/types.ts` | Các kiểu frontend; chưa tự động sinh từ server schema |
| `app/src/components/common.tsx` | Heading, field chọn, loading / lỗi / trống, avatar, trạng thái |
| `app/src/components/ui/` | Component shadcn được CLI thêm; một số primitive đã được Animate UI CLI chuyển đổi |
| `app/src/styles.css` | Tailwind tokens, theme giấy ấm / đỏ sẫm, layout responsive, reduced motion |
| `server/index.js` | Khởi tạo SQLite, seed catalogue, ghép API và frontend, chạy HTTP server |
| `server/db.js` | Schema SQLite, query helpers, scrypt password hashing, session-token hashing |
| `server/validation.js` | Zod schema cho account, tutor, subject và exam entry |
| `server/api.js` | Auth, role/ownership, booking, messaging, moderation và catalogue API |
| `server/uploads.js` | Validate, lưu BLOB, tải ảnh / CV với quyền theo trạng thái profile |
| `server/inquiries.js` | Liên hệ trước booking; chỉ student/tutor tham gia |
| `server/demo-content.js` | Bio, ảnh minh họa, PDF mẫu và activity idempotent |
| `server/catalog.js` | Môn học và liên kết kỳ thi khởi đầu |
| `server/seed.js` | Seed danh mục và demo opt-in, không đặt lại tài khoản đã có |
| `server/create-admin.js` | Tạo admin qua môi trường server; không qua public signup |
| `test/verify.js` | Kiểm tra cấu trúc, assets và tương tác landing |
| `test/api.test.js` | Integration: quyền, lifecycle, persistence, migration bằng DB tạm |
| `test/e2e/marketplace.spec.ts` | Playwright: student / tutor / admin, responsive và focus |

## Routes SPA

Các đường dẫn sau đều có tiền tố `/app`.

| Route | Trang | Quyền |
| --- | --- | --- |
| `/tutors` | `Tutors.tsx` | Công khai |
| `/tutors/:id` | `TutorDetail.tsx` | Công khai; đặt lịch yêu cầu student |
| `/library` | `Library.tsx` | Công khai; môn / mục tiêu kỳ thi để tìm gia sư |
| `/auth` | `Auth.tsx` | Đăng nhập / đăng ký |
| `/workspace` | `Dashboard.tsx` | Đã đăng nhập |
| `/bookings` | `Bookings.tsx` | Lịch theo vai trò / quyền sở hữu |
| `/messages` | `Messages.tsx` | Hội thoại của các buổi học được phép xem |
| `/favorites` | `Tutors.tsx` | Student |
| `/settings` | `Settings.tsx` | Đã đăng nhập |
| `/studio` | `TutorStudio.tsx` | Tutor |
| `/admin` | `Admin.tsx`, `ResourceEditor.tsx` | Admin |

Tên `Library`, `ResourceEditor` và API `resources` được giữ từ scaffold, nhưng dữ liệu hiện chỉ là danh mục / liên kết kỳ thi. Không có route quiz hoặc lab trong phạm vi mới.

## Dữ liệu

| Bảng | Dữ liệu chính / quan hệ |
| --- | --- |
| `users` | Tên, email duy nhất, password hash, role, active/suspended, mục tiêu, nhãn demo |
| `sessions` | Hash token, user, thời hạn phiên |
| `subjects` | Mã môn, tên, cấp học, mô tả |
| `tutors` | 1:1 với user tutor; profile, giá, mode, subject IDs, levels và goals dạng JSON, trạng thái duyệt |
| `slots` | Tutor + giờ UTC; unique theo tutor/giờ |
| `bookings` | Student, tutor, slot, subject, giờ / giá được chụp tại lúc đặt, trạng thái, ghi chú, meeting URL |
| `favorites` | Khóa ghép student/tutor |
| `messages` | Booking, sender, nội dung, thời điểm |
| `reviews` | Một review / booking; số sao và nội dung |
| `resources` | Mục kỳ thi, một subject liên quan, cấp học, năm, nguồn, HTTPS URL, công bố / nháp |
| `tutor_uploads` | Một ảnh và một CV mỗi tutor; UUID, BLOB, MIME, filename, size; replace loại bỏ bản cũ |
| `inquiries`, `inquiry_messages` | Một thread/student/tutor và tin nhắn trước booking |
| `demo_seeds` | Dấu mốc seed, tránh ghi đè hoặc nhân đôi dữ liệu minh họa |
| `audit` | Actor, action, target và thời điểm |

Schema nền dùng `CREATE TABLE IF NOT EXISTS`; migration cộng thêm `levels`, `goals` sau khi kiểm tra `PRAGMA table_info(tutors)`, sau đó thêm bảng upload / inquiry / demo markers với `user_version=3`. Có test migration bảo toàn account/profile và chạy lại an toàn; chưa có framework migrations tổng quát. Không tự xóa database để giải quyết schema drift nếu đã có dữ liệu cần giữ. Không có bảng quiz / attempts trong schema sau lần chỉnh phạm vi.

## Nhóm API

Tất cả dưới `/api`. Chi tiết payload hiện nằm trong `server/validation.js` và từng handler; integration tests nằm trong `test/api.test.js`; frontend types chưa tự sinh từ schema.

| Nhóm | Endpoints chính |
| --- | --- |
| Health / auth | `GET health`, `GET auth/me`, `POST auth/register`, `POST auth/login`, `POST auth/logout` |
| Account | `PATCH account`, `POST account/password` |
| Discovery | `GET subjects`, `GET tutors`, `GET tutors/:id`, `GET resources` |
| Favorites | `GET favorites`, `PUT/DELETE favorites/:id` |
| Tutor | `GET/PUT tutor/profile`, `POST tutor/slots`, `DELETE tutor/slots/:id` |
| Booking | `GET/POST bookings`, `PATCH bookings/:id`, `PATCH bookings/:id/lesson` |
| Upload | `PUT/DELETE tutor/uploads/:kind`, `GET uploads/:uuid`; kind = photo hoặc cv |
| Inquiry | `GET/POST inquiries`, `GET/POST inquiries/:id/messages` |
| Messages / review | `GET/POST bookings/:id/messages`, `POST bookings/:id/review` |
| Admin | `GET admin`, `PATCH admin/tutors/:id`, `PATCH admin/users/:id`, `PUT admin/subjects/:id`, `POST admin/resources`, `PUT admin/resources/:id` |

## Authorization và lifecycle

- Role xác định từ session server; client menu không phải ranh giới bảo mật.
- Session cookie `giasu_session`: HttpOnly, SameSite=Lax, Secure khi production; thời hạn 7 ngày.
- Scrypt cho mật khẩu; token phiên ngẫu nhiên được hash trước khi lưu.
- Mutation kiểm tra Origin / Sec-Fetch-Site. JSON cho endpoint thường; riêng PUT upload nhận binary body với MIME và X-File-Name (encodeURIComponent), tối đa 5 MB sau auth; test chặn Origin khác đã pass, deployment origin / proxy chưa được kiểm tra.
- Giới hạn tốc độ chung và giới hạn auth riêng; hiện store trong process.
- Tạo booking dùng transaction SQLite và kiểm tra chồng giờ; partial unique index giữ slot cho pending / accepted / completed.
- Client nhắn tin polling mỗi 6 giây khi tab hiển thị; chưa có websocket, push hay trạng thái đã đọc.
- Upload: Sharp decode / rotate / crop 640×640 / WebP, không giữ metadata. PDF-lib kiểm tra parse, 1–20 trang, không encrypted; không có malware scanner. Download PDF attachment + CSP sandbox + nosniff; public chỉ khi tutor approved và active, owner/admin xem được pending. Upload đưa profile về pending; delete không thay trạng thái.
- CV và ảnh ở SQLite BLOB để replace/delete cùng DB; backup có chứa tệp cá nhân. Khi triển khai cần quota tổng, lịch retention/backup và dịch vụ quét tệp. Chưa có object storage.
- Inquiry auth chỉ student/tutor đúng thread, không cho admin. Thread tồn tại khi profile về pending; không gửi tiếp đến tài khoản suspended.
- API error trả message cho người dùng; chưa có tracing hay hệ thống cảnh báo vận hành.

## Cấu hình môi trường

| Biến | Mặc định / mục đích |
| --- | --- |
| `PORT` | `4174` |
| `HOST` | `127.0.0.1`; cần cấu hình theo hosting khi triển khai |
| `APP_ORIGIN` | `http://127.0.0.1:<PORT>` trong dev; production yêu cầu HTTPS |
| `DB_PATH` | `.data/marketplace.sqlite` |
| `NODE_ENV` | `production` để phục vụ bản build và bật Secure cookie |
| `SERVE_BUILD` | `1` để phục vụ bản build local qua HTTP; không bật production cookies |
| `DEMO_PASSWORD` | Cho seed demo; mã hiện có mật khẩu demo fallback công khai trong source; không dùng cho dữ liệu thật |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Tạo tài khoản admin bằng CLI; cung cấp qua môi trường an toàn |

Seed demo định nghĩa `student@demo.giasu.test`, `chau@demo.giasu.test` và `admin@demo.giasu.test` cho ba vai trò; cùng năm hồ sơ tutor mẫu khác. Các tài khoản đã được seed và kiểm tra đăng nhập local. Seed demo từ chối khi `NODE_ENV=production`.

## Phụ thuộc và lưu ý

- Cài React, Vite, TypeScript, Tailwind, shadcn/Radix, Animate UI, Express, Zod, SQLite qua Node và Playwright.
- SQLite là thư viện tích hợp Node, không cần server DB riêng cho local.
- App không dùng dependency Three.js. Landing giữ Three.js CDN độc lập từ trước.
- Vite chia route lazy, chunk React và motion riêng. Middleware dev phục vụ HTML khi Accept là text/html, giữ đường dẫn JS cho Vite; HMR dùng cổng HTTP + 1000.
- MessageScroller cần Provider bao quanh Root; page-level error boundary có tải lại / về discovery.
- Component registry đã cài có thể chứa primitive chưa dùng; tránh sửa đồng loạt mã vendor.
- Node 26.12.1 được quan sát; minimum Node khai báo chưa được xác minh.

### Role workspaces (31/10/2026)

`components/workspace.tsx` cung cấp metrics (Animate UI CountingNumber), panel entrances (Effects) và lịch tuần theo múi giờ Việt Nam. Dashboard dùng booking/inquiry/profile thật từ API, không thêm số liệu mẫu vào giao diện. `/workspace` của admin chuyển sang `/admin`.

Studio lưu tab trong `?tab=files|profile|slots`; panel `forceMount` giữ draft khi đổi tab, inactive panel ẩn và không nhận focus. Admin lưu tab và bộ lọc hồ sơ trong query string; `/bookings?status=...` nhận deep link từ workspace. `useLoad` giữ dữ liệu khi refresh cùng user/path để tránh unmount form; đổi user hoặc path bỏ dữ liệu cũ và hủy callback response cũ. Draft chỉ giữ trong phiên trang, chưa tự lưu qua reload.

Calendar highlight và studio panel motion được clip tại container với khoảng dư cho focus outline, tránh tràn ngang khi resize hoặc chuyển tab. Primitive Animate UI tôn trọng reduced motion.

Google OAuth và adapter Cloudflare: `server/google-auth.js`, `server/local-db.js`, `worker/index.js`. Schema bổ sung `oauth_identities`, `oauth_states`, `upload_chunks`; local schema version 3.
