# Lỗi 4: Buổi học chỉ do gia sư bấm hoàn thành, đánh giá không gắn với xác nhận hai phía

Issue: [#48](https://github.com/The-Educations/Gia-Su-10-Diem/issues/48). PR: [#67](https://github.com/The-Educations/Gia-Su-10-Diem/pull/67) (đánh giá) và [#68](https://github.com/The-Educations/Gia-Su-10-Diem/pull/68) (điểm danh ở Tổng quan). Tài liệu này ghi lại lỗi, quyết định phạm vi và cách đã sửa.

## Tóm tắt

**Lỗi là gì.** Buổi học chỉ do gia sư bấm "hoàn thành", học sinh không xác nhận, và đánh giá dựa vào trạng thái đó nên không có gì cho biết buổi học có thật. Đi kèm là hai vấn đề thật với người dùng bình thường: gia sư quên bấm thì học sinh không đánh giá được, và đánh giá tính theo từng buổi nên một khóa 8 buổi bị đếm thành 8 đánh giá.

**Quyết định.** Ở giai đoạn đầu, rủi ro gian lận đánh giá rất thấp (chỉ học sinh mới viết được đánh giá, và gia sư mất công mới lập tài khoản giả). Ưu tiên là dùng thật suôn sẻ, không tạo lỗi và lỗ hổng. Vì vậy hoãn phần chống gian lận (điểm danh hai phía đầy đủ, hàng cần xác minh) cho lúc làm phí, và chọn mô hình **một đánh giá công khai cho mỗi cặp học sinh–gia sư**, viết được sau buổi hoàn thành đầu tiên, sửa được về sau, kèm "Đã học N buổi".

**Đã làm.**

| Việc | PR |
|---|---|
| Học sinh cũng bấm được "Đã học xong" khi buổi đã hết giờ | #67 |
| Mỗi cặp một đánh giá, sửa được; điểm và số đánh giá tính theo số học sinh | #67 |
| Mỗi đánh giá công khai kèm "Đã học N buổi" | #67 |
| Khu "Buổi dạy hôm nay" ở Tổng quan: Bắt đầu buổi, Học sinh vắng, Hoàn thành (chỉ khi hết giờ); học sinh thấy "gia sư đã bắt đầu" | #68 |

**Còn lại (cố ý chưa làm).** Học sinh điểm danh phía mình, trạng thái "cần xác minh", tự xác nhận sau 48 giờ, phát hiện tài khoản liên quan, admin gỡ đánh giá (Lỗi 5). Điểm danh hai phía làm cùng thiết kế phí (`docs/tutor-fees.md` mục 3).

## 1. Lỗi

Theo issue gốc: buổi học chỉ chuyển sang "hoàn thành" khi gia sư bấm, học sinh không xác nhận, và đánh giá dựa vào trạng thái đó. Hệ thống không có cơ chế nào kiểm tra buổi học có thật.

### Nhìn lại khi rà soát

Phần "chống gian lận" của issue (điểm danh hai phía, hàng cần xác minh, phát hiện tài khoản liên quan) **không phải rủi ro chính ở giai đoạn đầu**. Chỉ học sinh mới viết được đánh giá, nên gia sư một mình không bơm được điểm; muốn bơm phải điều khiển một tài khoản học sinh, việc rất hiếm khi mô hình còn mới. Điểm danh hai phía chủ yếu cần cho việc **tính phí**, không phải cho đánh giá.

Điều đáng sửa là hai vấn đề **xảy ra với người dùng bình thường**:

1. **Gia sư quên bấm "Hoàn thành" thì không ai đánh giá được.**
   Trước khi sửa, chỉ gia sư bấm được (`PATCH /api/bookings/:id`). Gia sư bận mà quên thì buổi học kẹt ở "đã xác nhận" mãi và học sinh không có nút đánh giá.
2. **Một khóa học nhiều buổi bị tính thành nhiều đánh giá.**
   Bảng `reviews` khóa theo `booking_id`, và điểm trung bình tính trên từng buổi. Một học sinh học 8 buổi bị mời đánh giá 8 lần; nếu viết đủ thì cả điểm trung bình lẫn "số đánh giá" đếm 8. Điều này làm lệch điểm và gây phiền cho học sinh, dù không ai gian lận.

## 2. Quyết định phạm vi

Cân nhắc hai kiểu đánh giá:

- **Mỗi buổi một đánh giá công khai:** phiền, điểm dao động theo tâm trạng từng buổi, một em dễ chiếm nhiều đánh giá.
- **Chỉ đánh giá cuối khóa:** bỏ sót đúng tín hiệu quan trọng nhất. Gia sư dạy dở thường bị bỏ sau 1 đến 2 buổi, tức là không bao giờ "kết thúc khóa". Học sinh học dài hạn cũng không có điểm cuối. Hệ thống hiện chưa có khái niệm kết thúc khóa rõ ràng (xem Lỗi 10).

**Chọn:** mỗi cặp học sinh–gia sư có **một đánh giá công khai, viết được sau buổi học hoàn thành đầu tiên và sửa được về sau**. Mỗi đánh giá hiển thị thêm **"Đã học N buổi"** để người xem biết đánh giá nào đáng tin hơn, không cần thêm dữ liệu mới.

### Không làm trong bản này

- Điểm danh hai phía (Bắt đầu, Điểm danh, Kết thúc), trạng thái `attendance`, hàng "cần xác minh", báo "buổi không diễn ra", tự xác nhận sau 48 giờ: thuộc thiết kế phí (`docs/tutor-fees.md` mục 3), làm cùng phí.
- Biện pháp phát hiện tài khoản liên quan nhau.
- Quy tắc riêng cho buổi học thử: vẫn đánh giá được như trước.
- Admin gỡ đánh giá nghi vấn: để Lỗi 5.
- Phản hồi riêng tư theo từng buổi: có thể thêm sau nếu cần.

## 3. Cách đã sửa

### 3.1 Học sinh cũng bấm được "Đã học xong"

`PATCH /api/bookings/:id` với `status: "completed"` nay cho phép **gia sư hoặc học sinh của buổi đó**, khi buổi đang `accepted` và **đã qua giờ kết thúc dự kiến**. Người ngoài cuộc không làm được (403, như mọi thao tác trên buổi học), khách chưa đăng nhập nhận 401. Hành động vẫn ghi vào nhật ký `audit` dưới tên người bấm.

Trên giao diện, học sinh thấy nút **"Đã học xong"** ở buổi đã xác nhận và đã qua giờ. Phụ huynh dùng cùng nút vì quyền đặt lịch dùng `role=student`. Nút này cũng chính là nửa "Đã học xong" của thiết kế phí về sau, nên không phải làm lại.

### 3.2 Một đánh giá cho mỗi cặp học sinh–gia sư

Module mới [`server/reviews.js`](../server/reviews.js) gom ba đoạn SQL dùng chung:

- `currentReview(b, r)`: đánh giá `r` là đánh giá hiện hành của cặp nếu không có đánh giá nào mới hơn cùng cặp.
- `pairReview(column, b)`: lấy cột của đánh giá mới nhất của cặp ứng với buổi `b`.
- `completedLessons(b)`: số buổi đã hoàn thành của cặp.

`POST /api/bookings/:id/review`:

- Vẫn yêu cầu đúng học sinh của buổi và buổi đã `completed`.
- Nếu cặp **chưa có đánh giá**: tạo mới, trả `201` với `updated: false`.
- Nếu cặp **đã có đánh giá** (dù viết qua buổi nào): **cập nhật** đánh giá đó, đặt lại `created_at`, trả `200` với `updated: true`. Trước đây trả `409 "Bạn đã đánh giá buổi học này."`.

Không đổi lược đồ bảng, không xóa dữ liệu cũ.

### 3.3 Điểm trung bình và số đánh giá tính theo số học sinh

- Danh sách và chi tiết gia sư (`tutorRows`) nối `reviews` kèm điều kiện `currentReview()`, nên `rating` và `review_count` tính một đánh giá cho mỗi cặp.
- Danh sách đánh giá công khai (`GET /api/tutors/:id`) cũng chỉ lấy đánh giá hiện hành, kèm trường `lessons` (số buổi cặp đó đã hoàn thành).
- `GET /api/bookings` trả `reviewed` và `review_body` là đánh giá hiện hành của cặp (trước đây chỉ của riêng buổi đó).

### 3.4 Dữ liệu cũ

Không cần chuyển đổi. Nếu một cặp đã có nhiều đánh giá từ trước (mỗi buổi một cái), chỉ **đánh giá mới nhất** được tính và hiển thị; các dòng cũ vẫn nằm trong cơ sở dữ liệu, không bị xóa. Học sinh có thể sửa đánh giá hiện hành qua bất kỳ buổi hoàn thành nào của cặp.

### 3.5 Giao diện

- [`Bookings.tsx`](../app/src/pages/Bookings.tsx): nút **"Đã học xong"** cho học sinh; nút **"Đánh giá"** chỉ xuất hiện khi chưa có đánh giá; nhãn "Đã đánh giá N/5" hiện ở các buổi đã hoàn thành; nút **"Sửa đánh giá"** chỉ hiện ở **buổi hoàn thành gần nhất** với gia sư đó để không lặp ở mọi buổi. Hộp thoại có sẵn điểm và nội dung cũ khi sửa, tiêu đề "Sửa đánh giá gia sư" và nút "Lưu đánh giá".
- [`tutor-profile-view.tsx`](../app/src/components/tutor-profile-view.tsx): mỗi đánh giá công khai kèm "Đã học N buổi".
- [`types.ts`](../app/src/lib/types.ts): thêm `review_body` và `lessons`.

## 4. Kiểm thử

- Typecheck sạch; `npm test` qua toàn bộ.
- [`test/api.test.js`](../test/api.test.js):
  - *students can complete finished lessons themselves and review each tutor once across lessons* (mới): học sinh không hoàn thành được buổi chưa kết thúc; người ngoài nhận 403, khách 401; học sinh hoàn thành được buổi đã kết thúc và việc này vào nhật ký; không hoàn thành lại được; không đánh giá được buổi chưa hoàn thành; đánh giá đầu tiên tạo mới, đánh giá qua buổi sau sửa đánh giá cũ (chỉ 1 dòng); `reviewed` và `review_body` đúng ở mọi buổi của cặp; điểm trung bình, số đánh giá và "số buổi" đúng; với dữ liệu cũ có nhiều đánh giá cho một cặp thì chỉ tính đánh giá mới nhất.
  - Test vòng đời đặt lịch sẵn có: đánh giá lần hai nay sửa thay vì báo 409, điểm trung bình và số đánh giá cập nhật đúng.
  - Test đánh giá công khai: thêm kiểm tra trường `lessons`.
- Đã xem thử trên giao diện thật bằng dữ liệu mẫu: danh sách buổi học hiện đúng nút "Đã học xong", "Đã đánh giá 5/5" và "Sửa đánh giá".

### Chưa kiểm tra

- Bộ e2e trình duyệt (Playwright) chưa chạy trên máy; cần xem CI "Browser journeys". Các bài e2e hiện có không dùng chữ "Đánh giá" hay "Hoàn thành" nên không bị ảnh hưởng trực tiếp.
- Chưa bấm thử luồng hộp thoại sửa đánh giá bằng tay trên trình duyệt (tránh sửa dữ liệu mẫu); logic được phủ bằng test API.

## 5. Giới hạn đã biết

- Học sinh tự bấm "Đã học xong" cho buổi gia sư chưa bấm. Hệ thống tin học sinh ở giai đoạn này; việc xác minh thật thuộc thiết kế phí.
- Gia sư mới có đánh giá sớm từ buổi học đầu tiên (kể cả học thử miễn phí), nên số sao ban đầu có thể dao động. Số "Đã học N buổi" bên cạnh giúp người xem cân nhắc. Nếu sau này cần thì đặt ngưỡng số buổi tối thiểu.
- Khi tính phí (Lỗi 4 phần điểm danh, `docs/tutor-fees.md` mục 3.5), nút "Kết thúc" của gia sư sẽ thay nút "Hoàn thành" thủ công; nút "Đã học xong" của học sinh ở đây sẽ trở thành nửa còn lại của điểm danh. Hai phần này nên làm cùng nhau.

## 6. Phần tiếp theo: điểm danh hằng buổi ở Tổng quan (PR #68)

Phần này đi theo hướng của issue (buổi học cần bằng chứng hơn một cú bấm "hoàn thành"), nhưng làm **một phía** trước, đủ để gia sư dùng thật. Chi tiết quy tắc ở [tong-quan-buoi-day-hom-nay.md](tong-quan-buoi-day-hom-nay.md).

- **Vị trí:** đầu trang Tổng quan của gia sư, vì đó là chỗ gia sư mở nhiều nhất và điểm danh gắn với "hôm nay tôi dạy ai".
- **Nút theo thời điểm:** trước giờ chỉ có dòng chữ gợi ý; Bắt đầu buổi (mở trước giờ học 15 phút), Học sinh vắng (từ giờ học, có xác nhận lần hai), Hoàn thành (chỉ khi hết giờ).
- **Dữ liệu:** cột `bookings.started_at` ghi giờ máy chủ khi gia sư bấm Bắt đầu; trạng thái mới `missed` ("Học sinh vắng") không đánh giá được và không tính là buổi đã dạy.
- **Học sinh và phụ huynh:** thấy "gia sư đã bắt đầu" khi buổi đang diễn ra và bấm "Đã học xong" sau giờ học.
- **Nối với thiết kế phí:** `started_at` và trạng thái `missed` là nền cho bước 2 (học sinh điểm danh, `needs_review`, tự xác nhận sau 48 giờ). Khi đó nút "Đã học xong" của học sinh trở thành nửa còn lại của điểm danh, và vị trí trên Tổng quan giữ nguyên.
