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
| `/messages` | `Messages.tsx` | Hỗ trợ admin được ghim, liên hệ gia sư và hội thoại buổi học |
| `/favorites` | `Tutors.tsx` | Student |
| `/settings` | `Settings.tsx` | Đã đăng nhập |
| `/studio` | `TutorStudio.tsx` | Tutor |
| `/admin` | `Admin.tsx`, `ResourceEditor.tsx` | Admin |

Tên `Library`, `ResourceEditor` và API `resources` được giữ từ scaffold, nhưng dữ liệu hiện chỉ là danh mục / liên kết kỳ thi. Không có route quiz hoặc lab trong phạm vi mới.

## Dữ liệu

| Bảng | Dữ liệu chính / quan hệ |
| --- | --- |
| `users` | Tên, email duy nhất, password hash, role, learner_type (student/parent), onboarding_step, active/suspended, mục tiêu, nhãn demo |
| `posts` | Tiêu đề, tóm tắt, nội dung văn bản, trạng thái công khai, tác giả và thời gian |
| `sessions` | Hash token, user, thời hạn phiên |
| `subjects` | Mã môn, tên, cấp học, mô tả |
| `tutors` | 1:1 với user tutor; profile, giá, mode, subject IDs, levels và goals dạng JSON, trạng thái duyệt |
| `slots` | Tutor + giờ UTC; unique theo tutor/giờ |
| `bookings` | Student, tutor, slot, subject, giờ / giá được chụp tại lúc đặt, trạng thái, ghi chú, meeting URL |
| `favorites` | Khóa ghép student/tutor |
| `messages` | Booking, sender, nội dung, thời điểm |
| `reviews` | Đánh giá cũ (một / cặp); coi như đánh giá cuối khóa |
| `lesson_ratings` | Chấm từng buổi (sao + nhãn), riêng tư |
| `course_reviews` | Đánh giá cuối khóa (sao, nhận xét, ý định học tiếp nội bộ) |
| `resources` | Mục kỳ thi, một subject liên quan, cấp học, năm, nguồn, HTTPS URL, công bố / nháp |
| `tutor_uploads` | Một ảnh và một CV mỗi tutor; UUID, BLOB, MIME, filename, size; replace loại bỏ bản cũ |
| `support_threads`, `support_messages` | Hội thoại riêng giữa chủ tài khoản và đội ngũ admin |
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
| Support | `GET support`, `GET/POST support/:id/messages` |
| Delete account | `DELETE admin/users/:id` (admin, xác nhận email, ẩn danh lịch sử) |
| Inquiry | `GET/POST inquiries`, `GET/POST inquiries/:id/messages` |
| Messages / review | `GET/POST bookings/:id/messages`, `POST bookings/:id/review` (buổi lẻ cũ), `PUT bookings/:id/rating`, `PUT offers/:id/review`, `GET tutor/trust` |
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

### Account entry and news (2026-11-02)

New UI registrations omit role; new Google identities start at onboarding step 0. Step 0 explicitly chooses student, parent or tutor. Parent maps to student permissions plus `learner_type=parent`; existing users default to `student` learner type without changing their role or onboarding progress. New accounts remain in `pending_signups` until email code verification; the registration role input never assigns a role. Both Google and password signups use this gate. Quick setup needs only role, name, timezone and an optional goal.

### News completion (2026-11)

Design and rules: [tin-tuc-thiet-ke.md](tin-tuc-thiet-ke.md). Posts gain `topic` (`admissions|policy|study`, defined once in `shared/news-topics.json`), `origin` (`manual|auto`), `slug`, `body_html`, cover/source fields, `pinned`, `cta_level/cta_goal`, `search_text` and `revised_at`. `server/news-schema.js` adds them additively (checks `PRAGMA table_info`) and lifts the legacy leading image / trailing `Nguồn:` line into fields; it is safe to rerun. Pure rules (slug, reading time, sanitizing, publish checks, CTA) live in `server/news-policy.js`.

State: `published=0` splits into "Chờ duyệt" (`origin=auto`) and "Nháp" (`origin=manual`) by origin. The slug is fixed at first publish and never follows title edits; unpublishing keeps `published_at` and slug. At most one post is pinned (partial unique index plus transaction); only published posts can be pinned; unpublish and delete unpin. `revised_at` is set only when a live post's title, summary or content changes.

`server/posts.js`: public `GET /api/posts` (array, used by the Worker sitemap), `GET /api/news?topic=&page=` (12 per page, pinned post only on the unfiltered first page and never repeated), `GET /api/posts/:id` (adds `cta`, `related`, `reading_minutes`; never returns drafts, `origin`, `pinned`, `search_text`). Admin: `GET /api/admin/posts?tab=review|drafts|published`, `GET/POST/PUT/DELETE /api/admin/posts[/:id]`, `POST .../publish|unpublish|pin`; publishing without title, summary, 50 words or a valid topic returns 422 `{error,problems}`. Every write is audited (`save_post_draft`, `publish_post`, `unpublish_post`, `pin_post`, `unpin_post`, `delete_post`, `upload_news_image`).

`body_html` is sanitized on save (`cleanPostHtml` with the news image route) and only then rendered with `dangerouslySetInnerHTML`; posts with an empty `body_html` (n8n, older posts) render from plain `body`. `server/news-images.js` keeps uploads in `news_images`/`news_image_chunks` (separate from Cộng đồng, so its cleanup never touches them); an image is public only while linked to a published post, admins see all; unattached uploads are removed after one day on the next upload.

SEO: canonical is `/app/news/<id>-<slug>`; old `/app/news/<id>` and wrong slugs get a 301 on both the Node server and the Worker (`pageSeo` returns `redirect`). Articles emit `og:type=article`, `og:image` (cover, absolute for uploads), published/modified times and a `NewsArticle` JSON-LD whose `<` is escaped. The sitemap lists canonical URLs with `lastmod`. Drafts and unknown posts stay 404 + noindex. Admin UI: `app/src/components/news-admin/`; public pages: `app/src/pages/News.tsx` with the shared `NewsArticle` component also used for the admin preview.

### Cộng đồng (2026-11-02)

`server/community-schema.js` được gọi từ migration chung, bổ sung `users.display_name`, khóa quyền cộng đồng và sáu bảng `community_*`; độc lập với Tin tức. `community.js` quản lý public/member routes; `community-admin.js` quản lý kiểm duyệt/audit; `community-policy.js` giữ kiểm tra liên hệ, nhãn tác giả và giới hạn. API công khai chỉ phát danh tính công khai, không trả ID/email/họ tên thật của học sinh, phụ huynh hoặc gia sư chưa duyệt. Bản sửa chờ duyệt nằm riêng trên bài, không thay bản công khai.

Routes SPA `/community`, `/community/:id`, `/community/mine`; admin có tab Cộng đồng. Chỉ số thông báo được tải theo điều hướng/visibilitychange, không polling. Node/Worker cùng trả metadata, JSON-LD, sitemap theo trạng thái công khai. Xem [bàn giao và mặc định đề xuất](community-implementation.md).
