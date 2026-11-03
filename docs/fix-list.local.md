# Danh sách lỗi cần sửa

Tài liệu này ghi lại các lỗi đã bàn và thống nhất với chủ dự án. Mỗi mục mô tả hiện trạng, hướng sửa đã thống nhất, phạm vi ảnh hưởng và tiêu chí nghiệm thu. Mục nào còn điểm chưa chốt được đánh dấu **[CHƯA CHỐT]** kèm đề xuất mặc định.

Quy ước trạng thái: `Chờ duyệt hướng sửa` → `Đã duyệt` → `Đang sửa` → `Hoàn thành`.

| # | Lỗi | Trạng thái |
| --- | --- | --- |
| 1 | Form "Đề nghị học" hiện ngày kết thúc, không phù hợp với học sinh | Chờ duyệt hướng sửa |

---

## Lỗi 1. Bỏ "Ngày kết thúc" ở form đề nghị học, thay bằng số tuần và thêm học thử

**Góc nhìn:** học sinh. **Vị trí:** Tìm gia sư → Hồ sơ gia sư → tab yêu cầu học (form "Đề nghị học").

### 1.1 Mô tả lỗi

Học sinh phải nhập "Ngày kết thúc" để gửi đề nghị học. Cách này không phù hợp với cách học sinh nghĩ về một khóa học (họ nghĩ "học mấy tuần", không nghĩ "đến ngày nào").

### 1.2 Hiện trạng trong code

- Form: `app/src/components/tutor-contact-schedule.tsx`. Trạng thái `dates = { start_date, end_date }` và hai ô ngày "Ngày bắt đầu", "Ngày kết thúc". Nút "Xem lịch dự kiến" và nút gửi đều yêu cầu có `end_date`.
- Server: `server/offers.js`. Schema `offers` nhận `start_date` và `end_date`. Hàm `offerDates()` sinh mọi buổi học rơi vào các ô giờ đã chọn trong khoảng đó (tối đa 365 ngày, tối đa 1.000 buổi). Khi gia sư chấp nhận, các buổi này được tạo thành lịch học thật (bảng `bookings`, mỗi buổi 60 phút).
- Cột `offers.start_date`, `offers.end_date` trong `server/db.js`. Ngày kết thúc cũng được hiển thị ở `app/src/pages/Offers.tsx` và `app/src/pages/Bookings.tsx` dưới dạng "ngày bắt đầu – ngày kết thúc".
- Kiểu dữ liệu: `app/src/lib/offers.ts`.

Vì ngày kết thúc quyết định số buổi được sinh ra, chỉ ẩn ô nhập là không đủ.

### 1.3 Hướng sửa đã thống nhất

**A. Thay ngày kết thúc bằng số tuần**

- Học sinh chọn ngày bắt đầu, các ô giờ trong tuần và **số tuần** (đề xuất các lựa chọn 4, 8, 12 tuần, mặc định 4 tuần **[CHƯA CHỐT: danh sách số tuần]**).
- Ngày kết thúc được hệ thống tự tính: `ngày bắt đầu + số tuần × 7 − 1 ngày`. Vẫn lưu vào `offers.end_date` nên `offerDates()`, tạo `bookings` và dữ liệu cũ không đổi.
- Form không còn ô "Ngày kết thúc". API nhận `weeks` thay cho `end_date` ở endpoint tạo và xem trước đề nghị. Cần quyết định có tiếp tục chấp nhận `end_date` cũ để tương thích hay không **[CHƯA CHỐT]**; đề xuất chỉ nhận `weeks`.
- Trang danh sách đề nghị và khóa học (`Offers.tsx`, `Bookings.tsx`): giữ hiển thị khoảng ngày hay chuyển sang "N tuần từ ngày …" **[CHƯA CHỐT]**.

**B. Thêm "Học thử"**

- **Gia sư bật/tắt khi tạo hồ sơ:** thêm lựa chọn "Nhận học thử" trong form hồ sơ gia sư (`app/src/pages/TutorStudio.tsx`, lưu qua `PUT /api/tutor/profile` trong `server/api.js`). Cần một cột mới trên bảng `tutors` (ví dụ `accepts_trial INTEGER NOT NULL DEFAULT 0`) bằng migration `ALTER TABLE` theo kiểu `server/db.js`. Mặc định **tắt**, nên hồ sơ cũ không tự nhận học thử.
- **Học sinh gửi đề nghị học thử:** nếu gia sư bật, hồ sơ gia sư hiển thị lựa chọn "Học thử" bên cạnh "Học theo khóa". Học thử là **một buổi 60 phút**: học sinh chọn đúng một ô giờ rảnh của gia sư.
- **Gia sư chấp nhận hoặc từ chối** bằng cùng luồng đề nghị hiện có (`server/offers.js`, trạng thái pending/accepted/rejected). Gợi ý triển khai: đề nghị có thêm thuộc tính loại `trial`, số buổi bằng 1, tái sử dụng bảng `offers` và tạo 1 `booking` khi chấp nhận.
- Server phải kiểm tra: gia sư đang bật học thử, đề nghị học thử chỉ có đúng 1 buổi, và ô giờ được chọn đang rảnh (dùng lại logic kiểm tra trùng lịch của `preview()`).

**Các điểm [CHƯA CHỐT] về học thử (đề xuất mặc định):**

1. Học phí buổi thử: hiển thị theo học phí/buổi của gia sư (app chưa xử lý thanh toán). Nếu muốn miễn phí cần thêm cách hiển thị riêng.
2. Giới hạn: mỗi học sinh chỉ học thử **một lần** với mỗi gia sư.
3. Sau buổi thử, học sinh muốn học tiếp thì gửi đề nghị theo khóa bình thường, không có bước liên kết riêng.

### 1.4 Phạm vi ảnh hưởng

| Khu vực | File |
| --- | --- |
| Form đề nghị học (UI) | `app/src/components/tutor-contact-schedule.tsx` |
| Kiểu dữ liệu client | `app/src/lib/offers.ts` |
| Danh sách đề nghị / khóa học | `app/src/pages/Offers.tsx`, `app/src/pages/Bookings.tsx` |
| Hồ sơ gia sư: bật/tắt học thử | `app/src/pages/TutorStudio.tsx`, `server/api.js` (`/api/tutor/profile`) |
| Tạo, xem trước, chấp nhận đề nghị | `server/offers.js` |
| Cột dữ liệu mới và migration | `server/db.js` |
| Tài liệu | `docs/marketplace.md` |
| Test | `test/api.test.js`, `test/e2e/marketplace.spec.ts` |

### 1.5 Tiêu chí nghiệm thu

- [ ] Form đề nghị học không còn ô "Ngày kết thúc"; có ô chọn số tuần.
- [ ] Gửi đề nghị 4 tuần sinh đúng số buổi theo các thứ trong tuần đã chọn; ngày kết thúc lưu đúng bằng ngày bắt đầu + 4 tuần − 1 ngày.
- [ ] Đề nghị cũ (đã có `end_date`) vẫn hiển thị và vẫn chấp nhận/hủy được.
- [ ] Gia sư bật "Nhận học thử" thì hồ sơ hiển thị lựa chọn học thử; tắt thì không hiển thị và API từ chối đề nghị học thử.
- [ ] Học thử chỉ gồm 1 buổi; gia sư chấp nhận hoặc từ chối được; chấp nhận thì tạo đúng 1 buổi học.
- [ ] Học sinh không gửi được đề nghị học thử lần thứ hai với cùng một gia sư (nếu giữ giới hạn mặc định).
- [ ] Test API và e2e liên quan đã được cập nhật và qua.

---

## Mẫu để thêm lỗi mới

```md
## Lỗi N. <Tên ngắn>

**Góc nhìn:** <học sinh | gia sư | phụ huynh | admin | khách>. **Vị trí:** <đường dẫn trong app>.

### N.1 Mô tả lỗi
### N.2 Hiện trạng trong code
### N.3 Hướng sửa đã thống nhất      (đánh dấu [CHƯA CHỐT] cho điểm còn mở)
### N.4 Phạm vi ảnh hưởng
### N.5 Tiêu chí nghiệm thu
```

---

## Prompt yêu cầu sửa

Sao chép khối dưới đây, thay `<N>` bằng số lỗi cần sửa, rồi gửi cho Claude Code. Quy trình có hai bước và Claude **không được sửa code trước khi người xét duyệt đồng ý**.

```text
Đọc docs/fix-list.md và xử lý "Lỗi <N>" theo hai bước dưới đây.

BƯỚC 1: Nêu hướng sửa, CHƯA sửa code.
- Đọc mục Lỗi <N> và các file trong phần "Phạm vi ảnh hưởng"; kiểm tra lại hiện trạng trong code còn đúng với mô tả không.
- Trình bày hướng sửa chi tiết: file nào đổi, đổi gì, thay đổi dữ liệu/migration (nếu có), API thay đổi thế nào, rủi ro và ảnh hưởng đến dữ liệu cũ, kế hoạch test.
- Với mỗi điểm đánh dấu [CHƯA CHỐT], nêu đề xuất của bạn và lý do, rồi hỏi người xét duyệt.
- Không chỉnh sửa file nào trong app/, server/, test/ ở bước này. Không tạo commit hay nhánh. Kết thúc bằng câu hỏi xin duyệt hướng sửa.

BƯỚC 2: Chỉ làm sau khi người xét duyệt trả lời đồng ý (có thể kèm chỉnh sửa).
- Cập nhật mục Lỗi <N> trong docs/fix-list.md theo các điểm đã chốt và đổi trạng thái thành "Đã duyệt".
- Tạo nhánh mới từ main, sửa code đúng phạm vi đã duyệt, không làm thêm tính năng ngoài danh sách.
- Cập nhật test và tài liệu liên quan; chạy test và typecheck, báo kết quả trung thực (kể cả lỗi có sẵn không liên quan).
- Đối chiếu từng ô trong "Tiêu chí nghiệm thu" và báo ô nào đã kiểm chứng, ô nào chưa.
- Chỉ commit, push và mở PR khi người dùng yêu cầu.
```
