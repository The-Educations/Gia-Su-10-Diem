# Tổng quan: khu "Buổi dạy hôm nay" và điểm danh một phía

Trạng thái: **đã làm (bước 1)**. Bước 2 (điểm danh hai phía) làm cùng thiết kế phí, xem `docs/tutor-fees.md` mục 3.

## 1. Vì sao đặt ở Tổng quan

Điểm danh là việc làm trong khoảng 15 phút quanh giờ học. Lúc đó gia sư mở app cần thấy ngay buổi đang diễn ra, không nên phải vào danh sách học sinh rồi tìm đúng em. Tổng quan là trang gia sư mở nhiều nhất, nên khu này nằm ở **đầu trang Tổng quan**, trước các ô thống kê.

Phân vai các trang cho gia sư:

| Câu hỏi | Chỗ trả lời |
|---|---|
| "Hôm nay tôi dạy ai, đã xong chưa?" | **Tổng quan**: khu "Buổi dạy hôm nay" (có nút điểm danh) |
| "Lịch cả tuần, cả tháng?" | **Lịch dạy** |
| "Em này đang học thế nào?" | Mục "Học sinh của tôi" (chưa làm, đợt sau) |
| "Ai muốn học với tôi?" | **Đề nghị học** |

## 2. Khu "Buổi dạy hôm nay"

Component: [`today-lessons.tsx`](../app/src/components/today-lessons.tsx), gắn vào [`Dashboard.tsx`](../app/src/pages/Dashboard.tsx).

**Hiển thị:** mọi buổi (đã xác nhận, hoàn thành, vắng) có ngày hôm nay theo giờ Việt Nam, cộng các buổi **đã qua giờ mà chưa chốt** của những ngày trước (hiện kèm ngày). Tối đa 8 dòng, sắp theo giờ. Không có buổi nào thì khu này ẩn. Danh sách tự cập nhật nút mỗi 30 giây, không cần tải lại trang.

Mỗi dòng gồm giờ bắt đầu và kết thúc, tên đối phương, môn, trạng thái, liên kết "Vào phòng học" (nếu có), "Nhắn tin" và nút điểm danh phù hợp.

### Nút của gia sư

Mỗi buổi hôm nay là một dòng riêng trong ô "Buổi dạy hôm nay" và tự đổi theo thời điểm. **Trước khi điểm danh mở (sớm hơn 15 phút trước giờ học), dòng đó chỉ có ghi chú "Chưa đến giờ · điểm danh mở lúc HH:mm", không có nút nào.** Không đóng được buổi nào trước khi hết giờ. Học sinh thấy ghi chú "Chưa đến giờ học".

| Thời điểm | Gia sư thấy |
|---|---|
| Sớm hơn 15 phút trước giờ học | Chỉ ghi chú "Chưa đến giờ · điểm danh mở lúc HH:mm", không có nút |
| Từ 15 phút trước giờ học, chưa bắt đầu | Nút **Bắt đầu buổi**; từ đúng giờ học thêm nút **Học sinh vắng** |
| Đã bắt đầu, chưa hết giờ | Chỉ dòng chữ "Hoàn thành mở lúc HH:mm" |
| Đã hết giờ | Nút **Hoàn thành**; nếu chưa bấm bắt đầu thì thêm **Học sinh vắng** |

"Học sinh vắng" cần bấm xác nhận lần hai để tránh bấm nhầm.

### Nút của học sinh và phụ huynh

- Buổi đã hết giờ mà chưa chốt: **Đã học xong**.
- Gia sư đã bấm bắt đầu và chưa hết giờ: dòng ghi "Đang diễn ra, gia sư đã bắt đầu".
- Buổi đã hoàn thành mà chưa đánh giá: liên kết **Đánh giá gia sư** (mở trang lịch học).

## 3. Máy chủ

- Cột mới `bookings.started_at` (giờ máy chủ khi gia sư bấm Bắt đầu), thêm tự động khi khởi động (`server/db.js`). Giờ do máy chủ ghi, không tin giờ của trình duyệt.
- `POST /api/bookings/:id/start`: chỉ gia sư của buổi, buổi đang `accepted` và chưa bắt đầu, trong khung từ 15 phút trước đến hết giờ học. Ghi nhật ký `booking.started`.
- `PATCH /api/bookings/:id` với `status: "completed"`:
  - gia sư hoặc học sinh của buổi, **chỉ khi buổi đã hết giờ** (không đóng sớm, kể cả khi đã bấm bắt đầu).
- `PATCH /api/bookings/:id` với `status: "missed"` (trạng thái mới, "Học sinh vắng"): chỉ gia sư, từ giờ học trở đi, và chưa bấm bắt đầu.
- Trạng thái `missed` không đánh giá được, không thuộc buổi đã dạy (không vào số "Đã học N buổi" và sau này không tính phí), và giải phóng khung giờ như buổi hủy. Nó xuất hiện ở bộ lọc trạng thái trang Lịch học.

## 4. Trang vào của gia sư

Đăng nhập xong, gia sư vào **Tổng quan** (trước đây vào Hồ sơ gia sư) để thấy ngay các buổi hôm nay. Gia sư mới vừa hoàn tất đăng ký vẫn được đưa tới Hồ sơ gia sư để hoàn thiện hồ sơ.

## 5. Chưa làm (bước 2, cùng thiết kế phí)

- Học sinh **Điểm danh** (nửa còn lại), trạng thái `needs_review` và hàng "cần xác minh" cho admin, tự xác nhận sau 48 giờ.
- Nhắc điểm danh bằng email (Lỗi 1, đang chờ nhóm bàn).
- Mục "Học sinh của tôi" (danh sách học sinh, ghi chú, báo cáo cho phụ huynh).

Khi làm bước 2, vị trí ở Tổng quan giữ nguyên; chỉ thêm nút và cột dữ liệu.

## 6. Kiểm thử

- Test API mới: *tutors start, finish or mark lessons missed from the overview with time limits* (khung giờ bắt đầu, quyền từng bên, không đóng buổi trước khi hết giờ, vắng, buổi vắng không đánh giá được, nhật ký).
- Đã xem trên giao diện thật với dữ liệu tạm (đã xóa): gia sư thấy đủ bốn trạng thái nút; học sinh thấy "Đã học xong" và "gia sư đã bắt đầu"; vừa ở 320 px không tràn ngang.
- Chưa chạy e2e Playwright trên máy; cần xem CI.
