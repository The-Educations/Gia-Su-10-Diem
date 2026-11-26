# Bàn giao 11/2026 — trạng thái hệ thống sau đợt thiết kế lại

Tài liệu này mô tả những gì đang chạy trên production sau các PR #82–#88. Quyết định sản phẩm chi tiết nằm ở `redesign-2026-11.md`; cấu hình Cloudflare và SePay ở `cloudflare-deployment.md`.

## Vai trò và quyền

| Vai trò | Làm được | Không làm được |
|---|---|---|
| Khách | Xem gia sư, môn học, cộng đồng, trang giới thiệu | Mọi thứ cần tài khoản |
| Tài khoản chưa thiết lập | Bấm "Để sau" để xem gia sư, môn học, cộng đồng | Các trang khác hiện thẻ "Hoàn tất thiết lập" |
| Học sinh | Tìm gia sư, gửi/nhận offer, học thử, lớp học, lịch, số dư, đánh giá, cộng đồng | Gửi/nhận offer khi **chưa xác minh** học bạ |
| Phụ huynh | Liên kết con bằng mã 6 ký tự, xem lớp, lịch và số dư của con, nạp tiền cho con; được báo (chuông, một số kèm email) khi đề nghị, lịch học, tiền hoặc xác minh của con thay đổi, bấm vào mở đúng thẻ con ở `/family` (`server/family-notify.js`) | Gửi hoặc trả lời offer (con làm từ tài khoản học sinh) |
| Gia sư | Hồ sơ 7 bước có minh chứng, nhận offer, gửi hồ sơ vào bài Tìm gia sư (credit), lớp học, bài giảng, lịch, số dư, rút tiền | Gửi offer khi hết credit |
| Admin | Hôm nay (việc cần làm), Lớp học, Gia sư, Tài khoản (Tổng quan từng người), Tài chính, Cộng đồng, Nhật ký, lịch toàn hệ thống | — (một vai trò, toàn quyền, mọi thao tác ghi nhật ký) |

## Luồng chính

1. **Học sinh tìm gia sư** (`/tutors`): lọc môn, hình thức, học phí; thẻ có dấu Đã xác minh. Hồ sơ (`/tutors/:id`) có thẻ đặt gia sư: Gửi offer, Nhắn tin trước, học thử nếu gia sư bật.
2. **Offer** (`/proposals`): số buổi × thời lượng × học phí, lịch tuần, ngày bắt đầu. Học sinh gửi thì tổng gói bị tạm giữ; gia sư từ chối hoặc 48 giờ không trả lời thì hoàn. Học thử: 1 buổi 60 phút, miễn phí, mỗi cặp một lần.
3. **Lớp học** (`/classes`): offer được nhận thành lớp, buổi học sinh ra theo lịch tuần. Bài giảng là liên kết YouTube/Drive/web. Gói còn ≤2 buổi thì gia sư nhắc gia hạn, học sinh gia hạn từ số dư.
4. **Buổi học**: sau giờ học cả hai bấm "Đã học xong"; một bên im lặng 48 giờ thì tự xác nhận; "Báo vấn đề" khóa buổi và gửi admin. Hủy trước 12 giờ được hoàn; học sinh hủy sát giờ vẫn tính phí; gia sư hủy sát giờ bị ghi vi phạm. Dời buổi cần bên kia đồng ý.
5. **Đối chiếu tiền**: khi hết gói (hoặc cuối tháng nếu gói dài), buổi đã xác nhận trả cho gia sư trừ 5% phí; phần còn lại hoàn học sinh. Phí ghi ở bảng `platform_revenue`.
6. **Đánh giá**: học sinh khảo sát riêng tư sau mỗi buổi (sao, 3 câu hỏi nhanh, góp ý). Khi gói kết thúc, sao trung bình được công khai, học sinh có thể thêm nhận xét.
7. **Lịch** (`/schedule`): Ngày / Tuần / Tháng, vạch giờ hiện tại, màu pastel theo lớp. Kéo trên ô trống để tạo **sự kiện riêng** (chỉ chủ sở hữu thấy), kéo để dời, bấm để sửa/xóa. Kéo buổi học thì gửi đề nghị dời.
8. **Cộng đồng** (`/community`): bắt buộc chọn chủ đề (có kiểm tra khớp nội dung), lọc Thịnh hành / Mới nhất / Liên quan. Bài Tìm gia sư nhận hồ sơ của gia sư (2 credit, đặt thêm credit để vào top 3). Trình viết bài kiểu blog, tự lưu nháp.

## Tiền và SePay

- Nạp tiền qua **Cổng thanh toán SePay**: form ký HMAC-SHA256 → trang SePay → IPN `/api/sepay/ipn` (xác thực `X-Secret-Key`) cộng số dư đúng số tiền, mỗi giao dịch một lần. Đã bật trên production (Worker secrets `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY`, `SEPAY_IPN_SECRET`).
- Tiền không khớp (sai mã, sai số tiền) hiện ở **Quản trị → Tài chính → Tiền về chưa khớp mã**. Có một bản ghi `PROBE` do kiểm tra IPN lúc bàn giao, bỏ qua được.
- Rút tiền: người dùng gửi yêu cầu (vào hội thoại hỗ trợ), admin chuyển khoản tay rồi bấm "Đã chuyển".
- Credit gia sư: 10 credit miễn phí mỗi tháng (reset, không cộng dồn), mua thêm gói credit bằng số dư. Cài đặt phí, credit, số giờ trong **Quản trị → Tài chính → Cài đặt kinh doanh**.

## Xác minh và chống trùng

- Gia sư: mỗi trường/giải/chứng chỉ cần tệp minh chứng; admin đối chiếu từng mục. Học sinh chỉ thấy dòng "Đã xác minh", không thấy tệp.
- Học sinh: ảnh/PDF học bạ hoặc bảng điểm + trường, lớp, mã học sinh; admin duyệt ở **Hôm nay**.
- Một tệp (so bằng SHA-256), một mã học sinh, một số báo danh chứng chỉ chỉ chứng minh được **một tài khoản**.

## Ngôn ngữ

- Thuật ngữ trong giao diện tiếng Việt: **Đề nghị** (trước đây "offer") và **Xu** (trước đây "credit"). Tên kỹ thuật trong mã (`proposals`, `credits_*`) giữ nguyên.

- Tiếng Việt là ngôn ngữ gốc. Chế độ English dịch toàn bộ giao diện bằng `app/src/lib/page-translator.ts` và từ điển `app/src/lib/locales/en.ts` + `en-more.ts`. Nội dung người dùng viết không bị dịch.
- Thêm chữ mới: viết tiếng Việt như bình thường, rồi thêm một dòng `"Tiếng Việt": "English"` vào `en-more.ts`. Trang giới thiệu dùng cùng từ điển (lọc lúc build trong `scripts/build-page.js`).
- Kiểm tra: `test/e2e/language.spec.ts`; script quét chữ sót nằm trong lịch sử phát triển (`.taste-skill/scan-en.mjs`, không commit).

## Chạy local

```bash
npm install
npm run seed:demo
SERVE_BUILD=1 npm start   # hoặc npm run dev
```

Mở http://127.0.0.1:4174/app/, dùng nút **Đăng nhập nhanh** (học sinh, phụ huynh, gia sư, quản trị). Mật khẩu mẫu `DemoStudy2026!`. Ở local, nạp tiền được giả lập bằng nút "Giả lập tiền đã về".

## Kiểm tra trước khi merge

```bash
npm run typecheck
npm test            # API (≈200 test)
npm run test:e2e    # Playwright (≈77 hành trình)
```

CI: `.github/workflows/ci.yml` chạy ở PR (build + API test, Playwright chia 4 phần song song, Cloudflare runtime, check bắt buộc **Validate**). Merge vào `main` chạy `.github/workflows/deploy.yml`: Validate nhanh trên commit đã merge (API test, build, `wrangler deploy --dry-run`, chạy thử Worker) rồi Deploy Cloudflare. Không chạy lại Playwright ở `main` vì branch protection bắt PR cập nhật theo `main` trước khi merge (strict), nên commit vào `main` chính là commit đã qua test.

## Mã nguồn chính

| Phần | Server | Giao diện |
|---|---|---|
| Số dư, nạp, rút, credit | `server/wallet.js` | `pages/Wallet.tsx`, `components/balance-chip.tsx` |
| Offer | `server/proposals.js` | `pages/Proposals.tsx`, `components/proposal-composer.tsx` |
| Lớp, buổi, đối chiếu | `server/classes.js` | `pages/Classes.tsx`, `components/session-actions.tsx` |
| Lịch, sự kiện riêng | `server/calendar-events.js` | `pages/Schedule.tsx`, `components/event-dialog.tsx` |
| Minh chứng gia sư | `server/credentials.js` | `pages/TutorStudio.tsx`, `components/credentials-editor.tsx` |
| Xác minh học sinh | `server/student-verification.js` | `components/student-verification.tsx` |
| Phụ huynh | `server/family.js` | `pages/Family.tsx` |
| Cộng đồng chủ đề, hồ sơ gửi bài | `server/community-topics.js` | `components/community/Pitches.tsx`, `Compose.tsx`, `RichEditor.tsx` |
| Admin | `server/classes.js` (admin/*), `server/wallet.js` (admin/*) | `components/admin-today.tsx`, `admin-classes.tsx`, `admin-finance.tsx` |
| Tổng quan | — | `components/today-panel.tsx`, `pages/Dashboard.tsx` |

## Việc còn mở

- Luồng "Đề nghị học" cũ (`/offers`, `/bookings`, `/availability`) không còn trong menu nhưng route và dữ liệu cũ vẫn giữ để xem lịch sử. Có thể gỡ hẳn khi không còn dữ liệu cũ.
- Trang **Cài đặt tài khoản** chưa được thiết kế lại theo mục (hồ sơ, xác minh, gia đình, bảo mật, thông báo).
- Thông báo qua email cho các việc quan trọng (offer mới, tiền về, buổi cần xác nhận) mới có trong app, chưa gửi email.
- Đối chiếu định kỳ với API giao dịch của SePay (phòng IPN bị lỡ) chưa có; hiện dựa vào IPN và danh sách "chưa khớp mã".
