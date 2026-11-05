# Lỗi 2: Sửa hồ sơ gia sư làm hồ sơ bị ẩn và không nhận được đề nghị học

Issue: [#47](https://github.com/The-Educations/Gia-Su-10-Diem/issues/47). Tài liệu này ghi lại lỗi, nguyên nhân, các quyết định thiết kế và cách đã sửa.

## 1. Lỗi

Bất kỳ lần lưu nào trong form hồ sơ gia sư đều đưa hồ sơ về trạng thái **chờ duyệt** (`pending`), kể cả khi gia sư chỉ đổi học phí, bật học thử, sửa chính tả hoặc bấm lưu mà không đổi gì. Hồ sơ `pending` không nằm trong tìm kiếm và không nhận được đề nghị học, nên gia sư biến mất cho đến khi admin duyệt lại.

### Kịch bản gây hại

Gia sư đang có 3 đề nghị học chờ xác nhận, đổi học phí từ 200.000đ lên 220.000đ:

1. Hồ sơ về `pending`.
2. Cả 3 đề nghị không xác nhận được (báo "Tài khoản hiện không thể xác nhận lịch học").
3. Học sinh mới không tìm thấy gia sư trong danh sách.
4. Gia sư mất khách cho đến khi admin duyệt, dù không sửa gì cần kiểm duyệt.

### Nguyên nhân trong mã (trước khi sửa)

| Vị trí | Hành vi cũ |
|---|---|
| `PUT /api/tutor/profile` (`server/api.js`) | Câu `UPDATE tutors` luôn gán `status='pending'` và tăng `review_revision`. |
| `PATCH /api/account` (`server/api.js`) | Gia sư đổi **tên hoặc múi giờ** đều về `pending`. Múi giờ chỉ để hiển thị nhưng vẫn kích hoạt duyệt lại. |
| `server/uploads.js`, `server/gallery.js` | Tải ảnh đại diện, banner, CV hoặc ảnh gallery đều về `pending`. |
| Danh sách công khai (`server/api.js`) | Chỉ lấy `t.status='approved'`. |
| `server/offers.js`, `server/weekly-requests.js`, `server/inquiries.js` | Tạo và nhận đề nghị yêu cầu `status='approved'`. |
| `TutorStudio.tsx` | Gửi cả hồ sơ lẫn lịch tuần trong một lần gọi, nên ô "Nhận học thử" và học phí nằm chung form với phần nội dung. |

Điểm không nhất quán đi kèm: `PATCH /api/bookings/:id` không kiểm tra trạng thái hồ sơ khi gia sư nhận buổi lẻ, trong khi đề nghị học thì có. Cùng một gia sư bị chặn ở đề nghị nhưng vẫn nhận được buổi lẻ.

Ghi chú: tab "Giờ trống" lưu riêng qua `/tutor/availability` nên không bị ẩn. Lỗi nằm ở form hồ sơ.

## 2. Quyết định thiết kế

Nguyên tắc: **chỉ nội dung học sinh đọc để quyết định chọn gia sư mới cần duyệt**. Cài đặt vận hành thì không.

### Phân loại trường

| Nhóm | Trường | Xử lý |
|---|---|---|
| Áp dụng ngay | học phí, hình thức dạy, địa chỉ (tỉnh/phường), múi giờ, nhận học thử, giờ trống, giao diện hồ sơ | Không đổi trạng thái hồ sơ |
| Cần duyệt lại | tiêu đề, giới thiệu, trường/chuyên ngành, số năm kinh nghiệm, học vấn, mục tự đặt tên, phương pháp, giáo án, môn dạy, cấp học, mục tiêu luyện thi | Duyệt lại, giữ bản cũ hiển thị |
| Vẫn ẩn đến khi duyệt | tên hiển thị, ảnh đại diện, banner, ảnh gallery | Về `pending`, ẩn hồ sơ (như trước) |

Lý do cho từng quyết định (ba điểm 1-3 là đề xuất chưa được bạn trả lời nên theo mặc định đề xuất):

1. **Môn, cấp học, mục tiêu luyện thi cần duyệt lại.** Đây là thứ học sinh dùng để tìm gia sư; nếu tự do thì gia sư có thể thêm một môn mà admin chưa kiểm tra.
2. **Tên hiển thị cần duyệt lại và vẫn ẩn hồ sơ.** Tên xuất hiện ở nhiều nơi ngoài trang hồ sơ (trò chuyện, lịch học). Nếu chỉ phủ tên cũ lên trang hồ sơ thì tên mới chưa duyệt vẫn lộ ở chỗ khác.
3. **Gia sư không còn công khai thì không xác nhận buổi lẻ mới.** Đồng bộ với đề nghị học.
4. **Số năm kinh nghiệm cần duyệt lại** vì là lời tự khai về năng lực.
5. **Múi giờ áp dụng ngay.** Chỉ mang tính hiển thị.
6. **Ảnh, banner, gallery chưa giữ bản cũ.** Chúng nằm ở bảng riêng (`tutor_uploads`, `tutor_banners`, `tutor_gallery`); giữ bản cũ đòi hỏi thêm phiên bản cho từng bảng, tốn công hơn nhiều. Tạm giữ hành vi cũ (ẩn đến khi duyệt).

### Quy tắc khi từ chối và gỡ hồ sơ

- Admin **từ chối bản sửa** của gia sư đã được duyệt: bản cũ vẫn công khai (giống quy tắc của bài Cộng đồng). Gia sư sửa rồi gửi duyệt lại.
- Muốn đưa gia sư ra khỏi tìm kiếm, admin dùng **"Gỡ hồ sơ"** (`withdrawn`). Khi gỡ, bản cũ cũng bị xóa để gia sư không thể tự sửa rồi xuất hiện lại.

## 3. Cách đã sửa

Chia hai giai đoạn trong cùng một thay đổi.

### Giai đoạn 1: server so sánh nội dung

Trước khi cập nhật, `PUT /api/tutor/profile` đọc hồ sơ hiện tại và so từng trường nội dung với dữ liệu gửi lên (`changedContent`). Chỉ khi có trường nội dung thật sự khác thì mới cần duyệt.

Chuyển trạng thái:

| Trạng thái hiện tại | Có đổi nội dung | Kết quả |
|---|---|---|
| `approved` | Không | Giữ `approved` (đổi học phí, học thử, địa chỉ, giờ trống, lưu không đổi gì) |
| `approved` | Có | Thành `pending`, lưu bản đã duyệt vào `published` |
| `pending` | Bất kỳ | Giữ `pending`; `published` không bị ghi đè |
| `rejected` / `withdrawn` | Bất kỳ | Thành `pending` (gửi duyệt lại, như trước) |

Chi tiết:

- `location` chỉ tính là nội dung nếu là chữ tự nhập (không có mã phường); khi sinh từ địa chỉ thì áp dụng ngay.
- `review_revision` và `moderation_note` chỉ thay đổi khi hồ sơ thực sự cần duyệt, để hộp thoại duyệt của admin không báo xung đột oan khi gia sư chỉ đổi học phí.
- `PATCH /api/account`: chỉ **đổi tên** mới ẩn hồ sơ; đổi múi giờ không còn kích hoạt duyệt.
- Phản hồi của `PUT /api/tutor/profile` có thêm `review: { status, changed, published }` để giao diện nói đúng điều đã xảy ra.

### Giai đoạn 2: giữ bản cũ hiển thị trong lúc chờ duyệt

**Cột mới `tutors.published`** (`TEXT`, thêm tự động trong `server/db.js`): chứa JSON bản nội dung đã duyệt gần nhất khi có bản sửa chờ duyệt. Các cột còn lại của bảng luôn chứa **bản nháp mới nhất** của gia sư. Cách này giữ nguyên Studio và trang admin (cả hai đọc bản nháp), và chỉ cần "phủ" bản cũ lên chỗ học sinh nhìn thấy.

Vòng đời của `published`:

| Sự kiện | `published` |
|---|---|
| Gia sư đang `approved` sửa nội dung | Ghi lại bản cũ, trạng thái thành `pending` |
| Gia sư sửa tiếp khi đang chờ | Giữ nguyên bản cũ |
| Admin duyệt (`approved`) | Xóa (bản nháp thành bản công khai) |
| Admin từ chối (`rejected`) | Giữ, bản cũ vẫn công khai |
| Admin gỡ hồ sơ (`withdrawn`) | Xóa |
| Đổi tên, đổi ảnh/banner/gallery | Xóa, hồ sơ ẩn đến khi duyệt |
| Xóa tài khoản | Xóa |
| Admin xóa môn/mục tiêu khỏi danh mục | Dọn cả trong `published` |

Module mới [`server/tutor-visibility.js`](../server/tutor-visibility.js) gom toàn bộ quy tắc:

- `CONTENT_FIELDS`: danh sách trường nội dung.
- `liveTutorSql(alias)` và `isLiveTutor(row)`: gia sư học sinh được thấy và gửi yêu cầu = `approved`, hoặc `pending`/`rejected` nhưng còn `published`. `withdrawn` không bao giờ công khai.
- `publicView(row)`: thay nội dung nháp bằng bản đã duyệt khi đang chờ.
- `changedContent`, `contentSnapshot`, `publishedView`: so sánh, chụp và chuyển bản chụp cho giao diện.

### Nơi áp dụng điều kiện hiển thị mới

Mọi chỗ trước đây kiểm tra `status='approved'` nay dùng điều kiện "đang công khai":

- Danh sách và chi tiết gia sư công khai, danh sách yêu thích.
- Đặt buổi lẻ (`POST /api/bookings`), kiểm tra môn học theo **bản đã duyệt**.
- Đề nghị học (`offers.js`), yêu cầu theo tuần (`weekly-requests.js`), trò chuyện hỏi gia sư (`inquiries.js`): tạo mới, nhận, và kiểm tra môn theo bản đã duyệt.
- Phục vụ ảnh đại diện, banner (`uploads.js`) và ảnh gallery (`gallery.js`).
- Nhãn "Gia sư" cùng tên thật của tác giả trong Cộng đồng (`community.js`, `community-profile.js`): trước đó gia sư đang chờ duyệt bị đổi sang nhãn học sinh ẩn danh.

### Đồng bộ buổi lẻ

`PATCH /api/bookings/:id`: gia sư chỉ xác nhận (`accepted`) buổi lẻ khi hồ sơ còn công khai. Hồ sơ mới chưa duyệt, bị từ chối hoặc bị gỡ nhận mã 409 "Tài khoản hiện không thể xác nhận lịch học." Hủy, từ chối và hoàn thành buổi cũ vẫn được.

### Giao diện

- **Studio** ([`TutorStudio.tsx`](../app/src/pages/TutorStudio.tsx)): dòng cảnh báo nói rõ phần nào áp dụng ngay, phần nào chờ duyệt; khi đang chờ thì nói học sinh vẫn thấy bản cũ. Thông báo sau khi lưu có ba dạng: "Đã lưu. Thay đổi áp dụng ngay." / "Đã gửi duyệt. Học sinh vẫn thấy bản đã duyệt trước đó." / "Hồ sơ đã gửi quản trị viên duyệt." (hồ sơ mới). Liên kết "Xem hồ sơ công khai" hiện cả khi đang chờ duyệt.
- **Admin** ([`Admin.tsx`](../app/src/pages/Admin.tsx), [`tutor-review-dialog.tsx`](../app/src/components/tutor-review-dialog.tsx)): dòng gia sư có thêm "Chỉnh sửa chờ duyệt"; hộp thoại duyệt có khối "Thay đổi so với bản học sinh đang xem" liệt kê từng trường đã đổi (gạch bản cũ, in đậm bản mới).
- API quản trị và API của chính gia sư trả thêm `published` (đã parse); API công khai **không** trả trường này.

## 4. Kiểm thử

- Typecheck sạch.
- Toàn bộ `npm test`: **104/104** qua (102 trước đó cộng 2 test mới).
- Test mới trong [`test/api.test.js`](../test/api.test.js):
  - *operational settings apply at once and content edits keep the approved version public until reviewed*: lưu không đổi gì và đổi học phí/hình thức/học thử/múi giờ không rời tìm kiếm; sửa tiêu đề giữ bản cũ công khai, tác giả thấy bản nháp, admin thấy bản cũ; sửa tiếp không ghi đè bản chụp; học sinh gửi và gia sư nhận đề nghị trong lúc chờ; từ chối giữ bản cũ; gửi lại; duyệt xóa bản chụp; đổi tên ẩn hồ sơ; gỡ hồ sơ xóa bản cũ và tự sửa sau khi bị gỡ không xuất hiện lại.
  - *a tutor without a published version cannot confirm new lessons*: gia sư chưa có bản công khai không xác nhận được buổi lẻ, nhưng vẫn từ chối được.
- Ba test cũ vốn mã hóa hành vi cũ ("sửa là bị ẩn") đã được cập nhật: đổi học phí giữ hồ sơ công khai; sửa phương pháp/giáo án/học vấn giữ bản cũ công khai và múi giờ áp dụng ngay.
- Đã xem thử trên giao diện thật: Studio hiển thị đúng cảnh báo, dòng admin và hộp thoại duyệt hiển thị đúng khác biệt. Dữ liệu mẫu đã được trả về như cũ.

### Chưa kiểm tra

- Bộ e2e trình duyệt (Playwright) chưa chạy trên máy vì rất chậm; cần xem kết quả CI "Browser journeys" khi đẩy lên. Các luồng e2e đang kiểm tra thông báo "Hồ sơ đã gửi quản trị viên duyệt." (gia sư mới hoặc gia sư bị từ chối gửi lại) vẫn đúng theo logic mới, nhưng chưa được chạy.
- Chưa kiểm tra trên môi trường Cloudflare Worker; cột `published` thêm qua migration chung ở `server/db.js`.

## 5. Giới hạn đã biết và việc có thể làm sau

- Đổi **tên hiển thị, ảnh đại diện, banner, ảnh gallery** vẫn ẩn hồ sơ đến khi được duyệt. Muốn giữ bản cũ cho các phần này cần thêm phiên bản cho các bảng ảnh.
- Chưa có tự động duyệt khi gia sư sửa lại đúng bằng bản đang công khai (hiện vẫn chờ admin).
- Học phí áp dụng ngay nên có thể bị dùng để câu khách (đặt giá thấp rồi tăng). Chưa có quy tắc nào về việc này; nên bàn nếu thấy cần.
- Văn bản `lesson_plan`, `teaching_style` và các mục tùy chỉnh tính là nội dung cần duyệt; không thay đổi so với trước.
