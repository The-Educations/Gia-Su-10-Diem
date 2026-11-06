# Lỗi 3: Tên thật của học sinh lộ trong đánh giá và bình luận gallery

Issue: [#59](https://github.com/The-Educations/Gia-Su-10-Diem/issues/59). PR: [#64](https://github.com/The-Educations/Gia-Su-10-Diem/pull/64). Tài liệu này ghi lại lỗi, nguyên nhân và cách đã sửa.

## 1. Lỗi

Hai nơi hiển thị công khai trả về **họ tên thật** (`users.name`) của học sinh:

1. **Đánh giá gia sư** trong `GET /api/tutors/:id`, hiển thị trên trang hồ sơ gia sư.
2. **Bình luận ảnh gallery** trong `GET /api/gallery/:id/social`, hiển thị dưới ảnh trong hồ sơ gia sư.

Cả hai API đều đọc được **khi chưa đăng nhập**. Bất kỳ ai mở trang hồ sơ gia sư cũng thấy họ tên thật của những em đã đánh giá hoặc bình luận.

### Vì sao nghiêm trọng

- Học sinh có thể là **trẻ vị thành niên**; tên thật gắn với nội dung đánh giá và thời điểm học là thông tin cá nhân.
- **Mâu thuẫn với quy tắc đã chốt của Cộng đồng**: học sinh và phụ huynh chỉ hiện tên hiển thị, họ tên là riêng tư (`authorLabel` trong `server/community-policy.js`). Cùng một người ẩn danh ở Cộng đồng nhưng lộ tên thật ở hồ sơ gia sư.
- Học sinh gửi đánh giá mà không biết đánh giá sẽ gắn với họ tên thật của mình.

### Dữ liệu bị lộ thêm ngoài tên

| API | Trường lộ | Hậu quả |
|---|---|---|
| Đánh giá | `name` (họ tên thật) | Lộ danh tính |
| Đánh giá | `booking_id` (do câu truy vấn dùng `r.*`) | Lộ mã nội bộ của buổi học |
| Bình luận gallery | `name` (họ tên thật) | Lộ danh tính |
| Bình luận gallery | `student_id` | Lộ mã tài khoản nội bộ; client dùng nó chỉ để biết bình luận có phải của mình không |

## 2. Nguyên nhân trong mã (trước khi sửa)

- Đánh giá (`server/api.js`, hàm `tutorDetail`):
  `SELECT r.*,u.name FROM reviews r JOIN bookings b ... JOIN users u ON u.id=b.student_id`
  Trả nguyên kết quả: `booking_id`, `rating`, `body`, `created_at`, `name`.
- Bình luận (`server/gallery.js`, `GET /api/gallery/:id/social`):
  `SELECT c.id,c.student_id,c.body,c.created_at,u.name FROM gallery_comments c JOIN users u ...`
- Client: `tutor-profile-view.tsx` in `r.name`; `gallery-social.tsx` in `comment.name` và so `user?.id === comment.student_id` để hiện nút xóa.

Hai tính năng này được viết trước khi Cộng đồng chốt quy tắc tên hiển thị, nên chưa dùng chung cách tạo nhãn tác giả.

## 3. Cách đã sửa

### Dùng chung `authorLabel` với Cộng đồng

Tên hiển thị cho đánh giá và bình luận được tạo bằng chính hàm `authorLabel` của Cộng đồng, để một người luôn hiện giống nhau ở mọi nơi:

| Người viết | Nhãn |
|---|---|
| Học sinh có tên hiển thị | `Minh An - Học sinh` |
| Phụ huynh có tên hiển thị | `Minh An - Phụ huynh` |
| Chưa đặt tên hiển thị | `Thành viên - Học sinh` hoặc `Thành viên - Phụ huynh` |

Truy vấn chỉ lấy các cột `authorLabel` cần (`role`, `learner_type`, `display_name`, `profile_code`) và **không lấy `users.name`**, nên tên thật không có mặt trong dữ liệu ở bất kỳ bước nào.

### Thay đổi API

**Đánh giá** (`server/api.js`): mỗi phần tử trả về chỉ gồm bốn trường:

```json
{ "rating": 5, "body": "...", "created_at": "...", "author": "Minh An - Học sinh" }
```

Không còn `name` và `booking_id`.

**Bình luận gallery** (`server/gallery.js`): mỗi phần tử gồm `id`, `body`, `created_at`, `author` và `mine`.

- Bỏ `name` và `student_id`.
- `mine` do server tính (`student_id === req.user?.id`), bằng `false` với khách. Nhờ đó nút xóa của người viết vẫn hoạt động mà mã tài khoản không rời khỏi server.
- Quyền xóa thật sự vẫn do server kiểm tra như trước (người viết, chủ hồ sơ hoặc admin).

### Thay đổi giao diện

- [`tutor-profile-view.tsx`](../app/src/components/tutor-profile-view.tsx): hiển thị `r.author`.
- [`gallery-social.tsx`](../app/src/components/gallery-social.tsx): hiển thị `comment.author`, nút xóa dùng `comment.mine`; nhãn trợ năng "Xóa bình luận của …" dùng nhãn công khai.
- [`types.ts`](../app/src/lib/types.ts): kiểu `reviews` đổi thành `{ author, rating, body, created_at }`.
- [`Bookings.tsx`](../app/src/pages/Bookings.tsx): hộp thoại "Đánh giá buổi học" nói rõ đánh giá sẽ hiện công khai là gì, ví dụ: *Đánh giá hiển thị công khai là “Minh An - Học sinh”.* Học sinh biết trước khi gửi.

### Dữ liệu cũ

Không cần chuyển đổi dữ liệu. Nhãn được **tạo lúc đọc**, không lưu trong cơ sở dữ liệu, nên mọi đánh giá và bình luận đã có đều hết lộ tên ngay khi phát hành. Đây cũng là câu trả lời cho câu hỏi "có cần xử lý lại dữ liệu cũ ngay khi phát hành không" trong issue.

Hệ quả cần biết: đánh giá cũ của người chưa đặt tên hiển thị sẽ hiện là "Thành viên - Học sinh" (hoặc "Phụ huynh"), cho đến khi họ đặt tên hiển thị trong Cộng đồng.

## 4. Kiểm thử

- Typecheck sạch.
- `npm test`: **105/105** qua (104 trước đó cộng 1 test mới; thêm kiểm tra vào test gallery sẵn có).
- [`test/api.test.js`](../test/api.test.js):
  - *tutor reviews show the reviewer's display name and label, never the real name or ids*: dùng dữ liệu mẫu có hoạt động; kiểm tra nhãn "Thành viên - Học sinh" khi chưa có tên hiển thị, "Minh An - Học sinh" khi đã đặt, "Minh An - Phụ huynh" khi là phụ huynh; mỗi đánh giá chỉ có đúng bốn trường `author`, `body`, `created_at`, `rating`; toàn bộ phản hồi không chứa họ tên thật của người đánh giá.
  - Test gallery sẵn có được mở rộng: bình luận mang nhãn "… - Học sinh", không chứa tên thật, không có `name` và `student_id`; `mine` bằng `true` với người viết, `false` với học sinh khác và khách.

### Chưa kiểm tra

- Bộ e2e trình duyệt (Playwright) chưa chạy trên máy vì rất chậm. Test e2e hiện có bấm nút "Xóa bình luận của …" bằng biểu thức chính quy nên không phụ thuộc tên; cần xem CI "Browser journeys".
- Chưa xem trực quan trang hồ sơ gia sư và hộp thoại đánh giá trên trình duyệt sau khi sửa.

## 5. Giới hạn đã biết

- Tên hiển thị do người dùng tự đặt. Hệ thống chỉ chặn tên chứa "Admin" hoặc "Quản trị" (`displayNameSchema`); không ngăn ai đó tự đặt tên giống tên thật của mình. Đó là lựa chọn của chính họ, nhưng nên cân nhắc nhắc trong màn hình đặt tên hiển thị.
- Mình mới rà hai nơi công khai nêu trong issue. Các nơi riêng tư (trò chuyện, lịch học, danh sách buổi học, trang admin) vẫn dùng tên thật có chủ đích vì chỉ hai bên liên quan hoặc admin nhìn thấy.
- Nhãn không kèm `profile_code`, nên khách không liên kết được nhiều đánh giá về cùng một người. Nếu sau này muốn bấm vào tên để mở hồ sơ Cộng đồng thì cần thêm trường này, và theo [docs/community-profile.md](community-profile.md) khách chưa đăng nhập không xem được hồ sơ cộng đồng.
- Người được đánh giá (gia sư) cũng chỉ thấy nhãn ẩn danh, không còn thấy tên thật học sinh trong danh sách đánh giá công khai. Gia sư vẫn biết học sinh qua lịch học và tin nhắn riêng.
