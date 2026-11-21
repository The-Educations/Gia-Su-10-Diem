# Đánh giá gia sư và điểm tin cậy — Ghi chú triển khai

Thiết kế gốc: [danh-gia-va-diem-tin-cay.md](danh-gia-va-diem-tin-cay.md). Tài liệu này ghi phần đã làm, các [ĐỀ XUẤT] đã áp dụng, quyết định kỹ thuật tự đưa ra và kết quả kiểm chứng. Nhánh: `feat/danh-gia-diem-tin-cay`. **Chưa commit, chưa push.**

## Đã làm

| Giai đoạn | Nội dung | File chính |
| --- | --- | --- |
| 1. Chính sách, công thức, dữ liệu | Mọi hằng số, bộ nhãn, các hàm thuần `pairScore`, `quality`, `reliability`, `isLateCancel`, `trustScore`. Migration idempotent (`lesson_ratings`, `course_reviews`, cột mới của `offers`, `bookings`). | `server/trust-policy.js`, `server/trust-schema.js`, `server/db.js` |
| 2. Ai hủy, kết thúc sớm, gia sư không đến | Hủy buổi ghi `cancelled_by`/`cancelled_at`. Hủy khóa học đã chấp nhận = “Kết thúc khóa sớm” (`ended_at`, `ended_by`, buổi tương lai `cancel_reason='course_ended'`). Trạng thái `tutor_missed`. | `server/api.js` (PATCH booking), `server/offers.js` |
| 3. Chấm từng buổi | `PUT /api/bookings/:id/rating`; `GET /api/bookings` trả `my_rating`, `my_tags`, `rating_open_until`, `rating_edit_until`, `rating_editable` cho học sinh. Gia sư và admin không nhận. | `server/trust.js` |
| 4. Đánh giá cuối khóa | `PUT /api/offers/:id/review`; `GET /api/offers` thêm `ended`, `ends_at`, `review_open_until`, `review_eligible`, `completed_lessons`, và `my_review` (chỉ học sinh). Endpoint cũ `POST /api/bookings/:id/review` trả 409 với buổi thuộc đề nghị. | `server/trust.js`, `server/offers.js`, `server/api.js` |
| 5. Điểm tin cậy | Điểm tính khi đọc bằng các truy vấn gộp (không truy vấn từng gia sư); `trust` trong `/api/tutors`, `/api/tutors/:id`; danh sách đánh giá công khai mỗi cặp một đánh giá mới nhất; `GET /api/tutor/trust`; tab “Đánh giá & điểm” ở `/studio`. | `server/trust.js`, `app/src/components/trust.tsx`, `tutor-trust-panel.tsx` |
| 6. Kiểm thử, tài liệu | Test hàm thuần, test API, e2e; cập nhật `marketplace.md`, `architecture.md`. | `test/trust-policy.test.js`, `test/api.test.js`, `test/e2e/ratings.spec.ts` |

## [ĐỀ XUẤT] đã áp dụng

- Buổi lẻ kiểu cũ (`offer_id IS NULL`) giữ nguyên luồng đánh giá theo cặp; buổi thuộc đề nghị bị endpoint cũ từ chối (409).
- Nhận xét cuối khóa chặn số điện thoại, email, Zalo, liên kết bằng `findContactInfo`.
- Nút “Gia sư không đến”: từ 15 phút sau giờ bắt đầu đến 48 giờ sau giờ kết thúc, chỉ khi gia sư chưa bấm Bắt đầu; ai báo trước thì giữ.
- Admin xem tổng hợp: `GET /api/admin/tutors/:id/trust` (cùng số liệu như tab của gia sư). Chưa có màn hình admin riêng; hồ sơ xem trước của admin đã hiện `trust` và nhãn công khai.
- Câu giải thích dưới tiêu đề mục Đánh giá; tên tab “Đánh giá & điểm”.

## Quyết định kỹ thuật tự đưa ra

- Chấm từng buổi áp dụng cho **mọi buổi hoàn thành** của học sinh đó, kể cả buổi lẻ cũ (hai lớp cùng tồn tại, điểm cặp gộp cả hai).
- “Lượt chấm” cho nhãn **Mới** = số dòng chấm buổi + số dòng đánh giá cuối khóa (gồm `reviews` cũ); “học sinh” = số học sinh khác nhau trong các dòng đó.
- Khóa học đã bị hủy **trước** khi có tính năng (không có `ended_at`) không được coi là đã kết thúc, nên không mở đánh giá.
- Hủy buổi `pending` bởi gia sư trong vòng 24 giờ cũng bị tính hủy sát giờ (không phân biệt buổi đã chấp nhận hay chưa, vì không lưu thông tin đó).
- Buổi `tutor_missed` không thuộc chỉ mục `reserved_slot`, nên khung giờ không còn bị giữ.
- Mốc thời gian chấm buổi lưu dạng ISO; `course_reviews.created_at` dùng `CURRENT_TIMESTAMP` giống `reviews` để so sánh “mới nhất” cùng định dạng.
- `rating` cũ trên đối tượng gia sư đã **bỏ**; `review_count` giữ (= số cặp có đánh giá cuối khóa). Giao diện chuyển hết sang `trust`.
- Route test-only `POST /__test/course` trong `test/e2e-server.js` dựng khóa học đã kết thúc cho e2e; không có trong server thật.
- Dòng giờ hiện tại trên thẻ gia sư **không đổi** (chờ chủ dự án xác nhận mục 7.1).

## Kiểm chứng (chạy thật, 21/11/2026)

| Lệnh | Kết quả |
| --- | --- |
| `npm run typecheck` | sạch |
| `npm test` | 122 test đạt, 0 lỗi (gồm 9 test hàm thuần và 5 test API mới) |
| `npm run build` | thành công |
| `npx playwright test` (toàn bộ) | 61 đạt, 6 thất bại; 6 test về trang giới thiệu / điều khoản / đăng nhập thất bại **chỉ vì** thư mục làm việc nằm dưới `.claude/` (Express `sendFile` từ chối đường dẫn có đoạn bắt đầu bằng dấu chấm). Chạy lại 6 test đó từ bản sao ngoài `.claude/` thì đạt cả 6, và chúng cũng đạt trên `origin/main`. |
| Worker (`npm run build:cloudflare`, `wrangler dev`, `npm run test:cloudflare`) | đạt, gồm migration trên SQLite của Durable Object (cần truyền biến `MAILFLARE_*` giả khi chạy local) |
| Duyệt tay trên trình duyệt | Hộp thoại chấm buổi và đánh giá khóa học, thẻ “Khóa học cần đánh giá”; màn hình 360 px không tràn ngang |

## Còn lại / rủi ro

- Chưa có màn hình admin riêng cho tổng hợp điểm; chỉ có endpoint.
- Hằng số là giá trị khởi đầu, cần xem lại khi có dữ liệu thật.
- Điểm tính mỗi lần đọc danh sách gia sư bằng các truy vấn gộp toàn bảng; khi số gia sư/đánh giá lớn cần lưu sẵn hoặc lọc theo trang.
- Chống gian lận chưa đầy đủ như đã nêu ở mục 12 của thiết kế (buổi hoàn thành do một bên bấm; “Gia sư không đến” chưa có phản đối).
