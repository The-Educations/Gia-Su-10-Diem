# Dải "Đang tìm gia sư" — bàn giao triển khai bước 1

Triển khai theo `docs/dai-tim-gia-su-dashboard.md` (Phần 1). Nhánh `feat/dai-tim-gia-su`, cắt từ `origin/main` (cd4de2b). Chưa commit, chưa push.

## Đã làm

- **Bộ nhận diện** `server/community-requests.js`: `classifyRequest({ title, body, authorRole })` trả `seeking_tutor` / `seeking_student` / `null`, và `requestTopic(text)` trả `{ subject, level }`. Cụm khớp là hằng số ở đầu file. Dùng lại `fold`, `subjectAliases`, `levelAliases` và danh sách môn `subjects` trong `server/catalog.js`.
- **API** `GET /api/community/requests` trong `registerCommunity` (`server/community.js`): `auth("tutor")`, một truy vấn SQL cho điều kiện 1–5, lọc bằng `classifyRequest`, dừng khi đủ 10 bài. `author` là `authorLabel(…, req.user)`. Không trả `body` hay id tài khoản.
- **Giao diện** `RequestStrip` (`app/src/components/request-strip.tsx`), kiểu trong `app/src/lib/types.ts`, CSS cuối `app/src/styles.css`, đặt `{isTutor && <RequestStrip />}` ngay sau `<TodayLessons />` trong `Dashboard.tsx`.
- **Kiểm thử**: `test/community-requests.test.js` (hàm thuần + API, đã thêm vào `npm test`), `test/e2e/request-strip.spec.ts`. Route chỉ dành cho test (`/__test/community-post`, `/__test/community-posts/clear`) nằm trong `test/e2e-server.js`.
- Thêm bản thảo thiết kế `docs/dai-tim-gia-su-dashboard.md` vào repo (trước đó chỉ là file chưa theo dõi trong checkout chính) và một đoạn ngắn trong `docs/community-implementation.md`.

## Các mục [ĐỀ XUẤT] đã áp dụng

- Chuẩn hóa NFC, chữ thường, bỏ dấu bằng `fold()`, ký tự không phải chữ/số thành khoảng trắng, khớp trọn từ.
- "cần tìm cô" khớp trên bản còn dấu; thêm `can tim co giao`, `can tim co day` trên bản bỏ dấu cho người gõ không dấu.
- Môn: bỏ cụm ngắn dưới 4 ký tự, lấy môn xuất hiện sớm nhất, hiện tên chuẩn. Cấp: nhãn nhóm, lấy nhóm xuất hiện sớm nhất.
- Chạy ngang bằng nhân đôi danh sách (bản sau `aria-hidden`, link `tabIndex=-1`), `@keyframes` chỉ dịch `translateX` 0 → -50%, 30 px/giây, tính lại bằng `ResizeObserver`. Dừng khi `:hover` / `:focus-within`. Không chạy khi giảm chuyển động hoặc thiết bị `(hover: none)`: một hàng cuộn ngang được.
- Đang tải hoặc API lỗi: không hiện gì.
- Thẻ rộng 240 px (220 px từ 640 px trở xuống).

## Quyết định tự đưa ra ngoài tài liệu

- Danh sách cụm "cần tìm thầy" giữ nguyên `can tim thay` như tài liệu. Hệ quả đã biết: "cần tìm thấy …" (không dấu thầy) cũng khớp, rất hiếm gặp.
- Hàm `useLoad` tải lại khi `revision` của ứng dụng đổi (hành vi chung của dashboard), nên dải không tự tải theo chu kỳ nhưng có thể tải lại sau thao tác khác.
- Chế độ "cuộn ngang" và "tĩnh" dùng chung một kiểu `overflow-x: auto`; lớp mờ hai mép chỉ bật khi đang chạy ngang.
- Dashboard hiện không có chế độ tối riêng; dải dùng biến màu chung nên theo được nếu sau này có.

## Chưa làm

- Bước 2 (dải ngược cho học sinh/phụ huynh). `classifyRequest` đã có nhánh `seeking_student` và test, chưa có giao diện.
- Chưa chạy trên Cloudflare Worker (route nằm trong `registerCommunity` nên Worker nhận chung).
