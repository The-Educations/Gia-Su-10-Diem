> Cập nhật theo yêu cầu người dùng ngày 02/11/2026: bài viết dùng trình soạn thảo rich text, hỗ trợ ảnh tải lên và liên kết HTTP(S). Yêu cầu mới này thay thế các giới hạn văn bản thuần/không ảnh/không link trong tài liệu gốc bên dưới. Quy trình duyệt, quyền riêng tư và bình luận văn bản thuần được giữ nguyên. Chi tiết: [community-implementation.md](community-implementation.md).

# Cộng đồng — Thiết kế và prompt xây dựng

Tài liệu gồm hai phần:

- **Phần 1 — Thiết kế và logic** của mục [Cộng đồng], viết đủ chi tiết để một người khác xây đúng mà không phải đoán.
- **Phần 2 — Prompt** để gửi cho Agent bắt đầu xây dựng.

Trạng thái: **chỉ là thiết kế, chưa có dòng code nào được viết.** Nội dung được chốt qua thảo luận từng vai trò; mọi chỗ nào chưa được chốt đều ghi rõ.

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Người dùng đã đồng ý rõ ràng trong thảo luận. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Chi tiết cần thiết để chạy được nhưng chưa được hỏi riêng. Cứ làm theo, nhưng nêu trong báo cáo cuối để người dùng xác nhận. |
| **[PHỤ THUỘC]** | Phụ thuộc vào việc khác chưa làm hoặc chưa bàn (ví dụ form đăng ký). |
| **[KHÔNG LÀM]** | Người dùng đã loại ra, hoặc đã nêu nhưng chưa được duyệt. Không được thêm. |

---

# PHẦN 1 — THIẾT KẾ VÀ LOGIC

## 1. Mục tiêu và nguyên tắc

### 1.1 Mục tiêu [CHỐT]

Một không gian giống Facebook, nơi học sinh và phụ huynh đăng bài hỏi ý kiến hoặc xin tư vấn để **chọn gia sư phù hợp**, xin review gia sư, xin và chia sẻ kinh nghiệm học tập. Mục nằm trong menu bên trái, tên **"Cộng đồng"**, đặt **ngay dưới "Môn học & kỳ thi"**.

### 1.2 Nguyên tắc thiết kế

1. **Đúng phạm vi dự án [CHỐT].** Dự án là nền tảng *tìm gia sư*. Cộng đồng chỉ cho nội dung về học tập. Không biến thành mạng xã hội chung, không có quiz, ngân hàng đáp án hay chấm điểm. Việc bài nào hợp hay không do **admin đọc và quyết**; hệ thống không tự áp thêm phân loại.
2. **Không có loại bài [CHỐT].** Người đăng không phải chọn thể loại. Soạn nội dung rồi đăng. Không có thẻ môn, thẻ cấp học, thẻ gia sư khi soạn bài.
3. **Mọi học sinh có quyền như nhau [CHỐT].** Không phân cấp, không "tài khoản mới phải qua duyệt riêng". Phụ huynh có quyền như học sinh.
4. **Bài duyệt trước, bình luận hiện ngay [CHỐT].** Hệ thống kiểm duyệt thủ công bởi admin.
5. **Họ tên thật của học sinh và phụ huynh không bao giờ hiện công khai [CHỐT]** (bài còn lên Google).
6. **Đơn giản trước.** Chỉ chữ. Không ảnh. Không email. Không realtime. Những thứ này cần hạ tầng trả phí hoặc làm tăng rủi ro, dự án chủ trương làm nền tảng trước.

### 1.3 Danh sách [KHÔNG LÀM]

Không làm trong lần xây dựng này, kể cả khi thấy "tiện":

- Loại bài / thể loại bài, thẻ môn / cấp học khi soạn bài.
- Gắn thẻ hoặc nhắc tên gia sư trong bài, thẻ hồ sơ gia sư chèn trong bài.
- Đăng ảnh, video, tệp đính kèm.
- Email, SMS, thông báo đẩy, realtime (WebSocket/SSE), nhắn tin riêng từ bài đăng.
- Tùy chọn "tắt hiện trên Google" cho từng bài. Mọi bài được duyệt đều có thể lên Google.
- Điểm uy tín, huy hiệu, bảng xếp hạng, đánh giá sao trong Cộng đồng.
- Chat nhóm, sự kiện, nhóm con, bài ghim ngoài bài Quy tắc.
- Thanh toán, video, AI.

---

## 2. Vai trò, nhãn tư cách và tên hiển thị

### 2.1 Dữ liệu sẵn có trong hệ thống

Đã kiểm tra trong mã nguồn:

- `users.role` ∈ `student | tutor | admin`.
- `users.learner_type` ∈ `student | parent` (đã có; hàm `accountRole()` trong `app/src/lib/types.ts` đã cho ra "Phụ huynh").
- `users.status` ∈ `active | suspended` (tài khoản bị khóa bị chặn đăng nhập).
- `tutors.status` (`pending`, `approved`, ...). Chỉ `approved` là gia sư công khai.
- `users.name` là **họ và tên** (riêng tư với học sinh/phụ huynh).
- **Chưa có** `display_name` (tên hiển thị).

### 2.2 Cột mới: `users.display_name` [CHỐT] / [PHỤ THUỘC]

- Người dùng đã chốt: form đăng ký sẽ có **hai ô: Họ và tên** và **Tên hiển thị**. Bài và bình luận hiện `[Tên hiển thị] - [Tư cách]`.
- **Form đăng ký sẽ được thống nhất sau**, nên Cộng đồng phải tự đứng vững mà không cần form mới. Cột `display_name` được thêm bằng migration; tài khoản đã có sẽ có giá trị rỗng.
- **[ĐỀ XUẤT] Cách xử lý tạm cho tài khoản chưa có tên hiển thị:** khi bấm Đăng bài hoặc Bình luận mà `display_name` rỗng, hiện hộp thoại một ô "Tên hiển thị" (gợi ý sẵn từ tên cuối của họ tên), lưu qua endpoint riêng rồi tiếp tục. Khi form đăng ký mới có ô này thì hộp thoại tự không còn xuất hiện vì đã có giá trị.
- Quy tắc kiểm tra tên hiển thị:
  - Độ dài 2–30 ký tự sau khi trim.
  - Không chứa (không phân biệt hoa thường, bỏ dấu): `admin`, `quản trị`, `quan tri`, `administrator`, `ban quản trị`. Mục đích: không giả mạo quản trị viên. [CHỐT: không chứa chữ như "Admin", "Quản trị"]
  - Không chứa số điện thoại, email, link (dùng cùng bộ lọc ở mục 8).
  - **Không cần duy nhất** [ĐỀ XUẤT] — nhiều người trùng tên "Minh" là bình thường.
- Đổi tên hiển thị **không** được kéo theo việc đặt hồ sơ gia sư về `pending`. Hiện tại `PATCH /api/account` làm vậy khi gia sư đổi `name`; tên hiển thị phải đi qua endpoint riêng, không đi qua đó.

### 2.3 Quy tắc suy ra nhãn tư cách [CHỐT]

Nhãn **được tính khi đọc (live), không lưu cứng** [ĐỀ XUẤT: chưa bị phản đối]. Hệ quả: khi hồ sơ gia sư được duyệt, mọi bài và bình luận cũ của họ đổi sang nhãn gia sư; khi hồ sơ bị thu hồi thì quay lại nhãn học sinh.

| Điều kiện (kiểm tra theo thứ tự) | Hiển thị | Ghi chú |
| --- | --- | --- |
| `role = admin` | `{users.name} - Quản trị viên` | Huy hiệu riêng, nổi bật. [ĐỀ XUẤT] Admin dùng `users.name`, không dùng `display_name`. |
| `role = tutor` và `tutors.status = approved` | `{users.name} - Gia sư` | **Họ tên thật**. Bấm vào tên sang `/tutors/{id}` (hồ sơ công khai). [CHỐT] |
| `role = tutor` và chưa `approved` | `{display_name} - Học sinh` | Hồ sơ đang chờ duyệt thì tham gia như học sinh. [CHỐT] |
| `role = student` và `learner_type = parent` | `{display_name} - Phụ huynh` | [CHỐT] |
| `role = student` còn lại | `{display_name} - Học sinh` | |

Định dạng chuỗi: `Tên - Tư cách` (dấu gạch ngang có khoảng trắng hai bên).

### 2.4 Quyền riêng tư trong dữ liệu trả về

API công khai (cả khi chưa đăng nhập) **chỉ được trả**:

```
author: { label: "Minh - Học sinh", name_part: "Minh", tier: "student|parent|tutor|admin", tutor_id?: number }
```

- `tutor_id` chỉ có khi `tier = tutor` (hồ sơ đã công khai sẵn).
- **Không** trả `users.id`, `users.name`, `email` của học sinh/phụ huynh/gia sư chưa duyệt trong bất kỳ endpoint công khai nào.
- Admin (trong hàng đợi duyệt và báo cáo) thấy thêm họ tên thật và email của người đăng, để xử lý vi phạm [CHỐT: hàng đợi duyệt cho thấy người đăng, có họ tên thật].
- Cờ `mine: true` do server tính, để giao diện biết được sửa/xóa mà không cần id người dùng.

---

## 3. Ma trận quyền

Một người "tham gia được" khi: đã đăng nhập, `users.status = active`, và **không bị khóa quyền Cộng đồng** (mục 9.3).

| Hành động | Khách | Học sinh / Phụ huynh | Gia sư (cả đã duyệt và chờ duyệt) | Admin |
| --- | --- | --- | --- | --- |
| Xem danh sách, bài, bình luận | Có | Có | Có | Có |
| Lọc, tìm kiếm, sắp xếp | Có | Có | Có | Có |
| Đăng bài | Không | Có (qua duyệt) | Có (qua duyệt) | Đăng "Thông báo" (không qua duyệt) |
| Bình luận / trả lời | Không | Có (hiện ngay) | Có (hiện ngay) | Có |
| "Hữu ích" cho bình luận | Không | Có | Có | Không |
| Báo cáo bài / bình luận | Không | Có | Có | – (xử lý trực tiếp) |
| Sửa / xóa bài của mình | – | Có | Có | Có (bài của mình) |
| Sửa / xóa bình luận của mình | – | Có | Có | Có |
| Đánh dấu "Đã giải quyết", chọn câu trả lời hay nhất (bài của mình) | – | Có | Có | Có |
| Theo dõi bài | – | Có | Có | Có |
| Duyệt / từ chối / ẩn bài; gỡ bình luận; khóa quyền; sửa Quy tắc | Không | Không | Không | Có |

Ghi chú:

- **Khách [CHỐT]:** chỉ xem. Bấm vào bất kỳ nút nào cần quyền (Đăng bài, Bình luận, Hữu ích, Báo cáo) thì được mời đăng nhập hoặc tạo tài khoản, **rồi quay lại đúng bài đang xem** (dùng cơ chế `/auth?next=` đã có trong `Require`).
- **Gia sư [CHỐT]:** quyền đầy đủ như học sinh, không bị hạn chế riêng. Được bình luận ở mọi bài, kể cả bài nhắc hoặc chê mình. Việc canh quảng cáo trá hình là việc của admin khi duyệt.
- **Tự bấm "Hữu ích" [ĐỀ XUẤT]:** không ai được bấm "Hữu ích" cho bình luận của chính mình (luật chung, không riêng gia sư).
- Quyền của admin không được phụ thuộc vào `display_name`.

---

## 4. Bài viết

### 4.1 Trường dữ liệu của người soạn [ĐỀ XUẤT]

| Trường | Giới hạn | Ghi chú |
| --- | --- | --- |
| Tiêu đề | 1–120 ký tự | Cần để làm tiêu đề trang Google và dòng trong danh sách. Nếu người dùng không muốn có tiêu đề, phương án thay thế là lấy dòng đầu của nội dung; hãy hỏi lại trước khi đổi. |
| Nội dung | 1–5000 ký tự, văn bản thuần | Xuống dòng được giữ. Không HTML, không markdown, không ảnh. |

Chưa có con số giới hạn do người dùng chốt; hai giá trị trên là mặc định để đặt trần, đặt thành hằng số dễ đổi.

### 4.2 Dòng lưu ý khi soạn và khi đăng [CHỐT]

Hiện trong form soạn bài (trên đầu form, luôn thấy) và nhắc lại ở nút gửi:

> **Lưu ý:** Chỉ đăng nội dung về học tập — tìm gia sư, xin review, kinh nghiệm học, trò chuyện và chia sẻ kiến thức. Bài không liên quan đến giáo dục sẽ không được đăng. Bài được quản trị viên đọc và duyệt trước khi hiện, và sau khi được duyệt sẽ hiển thị công khai (có thể xuất hiện trên Google). Đừng ghi số điện thoại, email, Zalo hay địa chỉ nhà.

Nội dung nên là hằng số dễ sửa; câu chữ là bản nháp để người dùng chỉnh.

### 4.3 Trạng thái và vòng đời bài

Một bài có một trạng thái duy nhất `status`:

| `status` | Ý nghĩa | Ai thấy |
| --- | --- | --- |
| `pending` | Mới gửi, chưa từng được duyệt, đang chờ admin | Chỉ tác giả và admin. **Không ai khác, không Google.** |
| `approved` | Đã duyệt, đang hiển thị công khai | Mọi người, Google lập chỉ mục |
| `rejected` | Admin từ chối bản gửi lần đầu, kèm lý do | Chỉ tác giả và admin |
| `hidden` | Admin ẩn một bài đã đăng (vi phạm) | Chỉ tác giả (thấy lý do) và admin; công khai trả 404 |
| `deleted` | Tác giả tự xóa (xóa mềm) | Không ai (admin thấy trong lịch sử/audit) |

```
              gửi                 duyệt
 (soạn) ─────────────► pending ─────────────► approved ◄──────────────┐
                          │                      │  ▲                  │
                          │ từ chối              │  │ duyệt phiên bản │
                          ▼                      │  │ sửa             │
                       rejected                  │  │                  │
                          │                      ▼  │                  │
                          │ sửa & gửi lại   (sửa bài đã đăng:         │
                          └──► pending       tạo "bản sửa" chờ duyệt) ─┘
                                             │
                          admin ẩn           │ admin khôi phục
                 approved ─────────► hidden ─┘ (về approved)
```

**Quy tắc chuyển trạng thái:**

1. **Gửi bài:** tạo `pending`. Tác giả thấy trong "Bài của tôi" với nhãn *Đang chờ duyệt*. Có chấm đỏ khi có kết quả.
2. **Admin duyệt** `pending → approved`: gán `published_at` = thời điểm duyệt (dùng để sắp xếp "mới nhất", không dùng thời điểm gửi). Gửi thông báo cho tác giả.
3. **Admin từ chối** `pending → rejected`: bắt buộc nhập `lý do` (không rỗng); lý do hiện cho tác giả. Tác giả sửa nội dung rồi **gửi lại** → `pending` (lý do cũ giữ trong lịch sử, không hiện công khai).
4. **Sửa bài đã đăng [CHỐT]:** bài `approved` được sửa không làm thay đổi bản đang hiển thị. Hệ thống tạo **bản sửa chờ duyệt** (`revision_*`); **bản cũ vẫn hiển thị công khai** trong lúc chờ. Admin duyệt → bản sửa thay thế bản đang hiển thị, `revision_*` được xóa. Admin từ chối → giữ bản cũ, bản sửa chuyển `revision_status = rejected` kèm lý do; tác giả sửa tiếp hoặc hủy bản sửa.
   - Nếu tác giả sửa bản sửa đang chờ duyệt thì thay nội dung bản sửa (vẫn chờ duyệt).
   - Bản sửa **không** thay đổi `published_at` (bài không nhảy lên đầu danh sách chỉ vì sửa).
   - Trong lúc bản sửa chờ duyệt, Google chỉ thấy bản đang hiển thị.
5. **Admin ẩn** `approved → hidden`: bắt buộc `lý do`. Công khai trả 404, gỡ khỏi sitemap, trang trả `noindex` (để Google dần xóa). Tác giả thấy trạng thái và lý do. Bình luận của bài vẫn lưu nhưng không hiện.
6. **Admin khôi phục** `hidden → approved`: quay lại như cũ, đưa lại vào sitemap.
7. **Tác giả xóa** → `deleted` (xóa mềm). Áp dụng cho mọi trạng thái trừ `hidden`. Công khai 404.
8. **Bài của tài khoản bị khóa (`users.status = suspended`)** không hiển thị công khai (như cách ảnh gallery chỉ hiện khi tài khoản `active`); mở khóa thì hiển thị lại.
9. **Gia sư bị thu hồi duyệt:** nhãn đổi theo quy tắc 2.3; bài vẫn giữ nguyên.

### 4.4 Bài đặc biệt do admin tạo

| `kind` | Mô tả |
| --- | --- |
| `user` | Bài thường. Mặc định. |
| `announcement` | **Thông báo** của quản trị viên. Admin đăng, **không qua hàng đợi** (vì admin chính là người duyệt), `status = approved` ngay. Nhãn `Quản trị viên`. [CHỐT] |
| `rules` | **Quy tắc cộng đồng.** Đúng **một** bài. Xem 4.5. |

### 4.5 Bài "Quy tắc cộng đồng" [CHỐT]

- **Ghim cố định ở đầu danh sách.** Ai muốn xuống đọc bài của mọi người đều phải lướt qua nó. Không ẩn được, không thu nhỏ vĩnh viễn, không đóng được.
- Hiện **ở đầu trang đầu tiên** của danh sách, **kể cả khi đang lọc hoặc tìm kiếm** (luôn ở trên cùng). Không tính vào số bài, không chiếm chỗ trong phân trang, không hiện ở trang 2 trở đi.
- Khách xem được.
- Chỉ admin sửa được (sửa trực tiếp, không qua duyệt).
- Đúng một bài: ràng buộc duy nhất ở mức CSDL (chỉ một dòng `kind = 'rules'`).
- Mặc định **thu gọn bằng "Xem thêm"** như mọi bài dài (mục 6.2), nhưng nằm ở đầu danh sách.
- Migration tạo sẵn bài này với nội dung mặc định (idempotent: chỉ tạo khi chưa có). Nội dung mặc định bên dưới là bản nháp để người dùng chỉnh; độ dài do người dùng quyết ("đủ dài vừa đủ").

> **Quy tắc cộng đồng** (bản nháp)
>
> 1. Chỉ đăng nội dung về học tập: tìm gia sư, xin review, kinh nghiệm học, chia sẻ kiến thức.
> 2. Không đăng số điện thoại, email, Zalo, link ngoài, địa chỉ nhà.
> 3. Không quảng cáo, không chèo kéo, không tự khen mình.
> 4. Góp ý tôn trọng, không lăng mạ, không bôi nhọ cá nhân.
> 5. Bài được admin duyệt trước khi hiện. Bài bị từ chối sẽ có lý do để bạn sửa lại.
> 6. Vi phạm lặp lại có thể bị khóa quyền đăng.

---

## 5. Bình luận

### 5.1 Cấu trúc

- **Hiện ngay khi gửi [CHỐT]**, không qua duyệt.
- Hai cấp: bình luận gốc và **trả lời cho bình luận gốc** (một cấp). Trả lời một trả lời thì gắn vào bình luận gốc, không tạo cấp thứ ba. [ĐỀ XUẤT: "một cấp" đã nêu trong đề xuất sơ bộ]
- Độ dài 1–1000 ký tự, văn bản thuần (giống bình luận gallery hiện có).
- Chỉ bình luận được trên bài `approved`. Bài `hidden/deleted/pending/rejected` không nhận bình luận.
- Trạng thái bình luận: `visible`, `removed_by_author`, `removed_by_admin`.
- Bình luận bị gỡ: nếu có trả lời bên dưới thì hiện chỗ giữ "*Bình luận đã bị gỡ*" để giữ mạch; nếu không có trả lời thì ẩn hẳn. Nội dung gốc vẫn lưu cho audit. [ĐỀ XUẤT]
- Tác giả sửa bình luận của mình được, hiện nhãn "(đã sửa)". Bản sửa cũng phải qua bộ lọc thông tin liên hệ. [ĐỀ XUẤT]

### 5.2 Thứ tự hiển thị và phân trang [ĐỀ XUẤT]

- Bình luận gốc xếp **cũ → mới**, 20 bình luận gốc mỗi lần tải, nút "Tải thêm".
- Trả lời hiện ngay dưới bình luận gốc, cũ → mới; nếu quá 3 trả lời thì thu gọn, có "Xem thêm trả lời".
- **Câu trả lời hay nhất** (do tác giả bài chọn) luôn được ghim ở đầu danh sách bình luận với huy hiệu.

### 5.3 "Hữu ích"

- Mỗi người bấm một lần cho mỗi bình luận, bấm lại thì bỏ. Không tự bấm cho bình luận của mình. Khách không bấm được.
- Số "Hữu ích" hiện cạnh bình luận.

### 5.4 Đã giải quyết và câu trả lời hay nhất

- Tác giả bài có thể đánh dấu **Đã giải quyết** (bật/tắt) và chọn **một** bình luận làm câu trả lời hay nhất (bỏ chọn được; không được chọn bình luận của chính mình).
- Danh sách hiện nhãn "Đã giải quyết" trên bài.

### 5.5 Theo dõi bài

- Tác giả bài và người đã bình luận được **tự động theo dõi** bài; ai cũng bật/tắt theo dõi được.
- Khi có bình luận mới trong bài đang theo dõi, người theo dõi nhận một thông báo trong ứng dụng (xem mục 10). Không gửi cho chính người viết bình luận.

---

## 6. Danh sách bài, tìm kiếm, lọc, sắp xếp

### 6.1 Bố cục danh sách (`/app/community`)

Từ trên xuống:

1. **Bài Quy tắc cộng đồng (ghim)** — chỉ ở trang đầu.
2. Thanh công cụ: ô **Đăng bài** (khách thấy nút nhưng bấm sẽ được mời đăng nhập), ô **tìm kiếm**, bộ lọc **môn**, bộ lọc **cấp học**, bộ chọn **sắp xếp**.
3. Danh sách bài: mỗi mục có tiêu đề, phần trích nội dung (có "Xem thêm"), nhãn tác giả, thời gian đăng, số bình luận, tổng "Hữu ích", nhãn "Đã giải quyết" nếu có.
4. Phân trang: 20 bài mỗi trang, nút "Tải thêm"/trang sau.
5. Trạng thái rỗng, đang tải, lỗi: dùng `Blank`, `Loading`, `ErrorState` có sẵn trong `components/common.tsx`.

Khách được xem toàn bộ trang này. Với người đã đăng nhập thêm liên kết **Bài của tôi**.

### 6.2 "Xem thêm" cho bài dài [CHỐT]

- Áp dụng cho **mọi bài**, kể cả bài Quy tắc cộng đồng. Bài dài chỉ hiện khoảng **5–6 dòng đầu**, cuối có nút **Xem thêm**; bấm thì mở hết ngay tại chỗ và đổi thành **Thu gọn**.
- Bài ngắn thì không có nút. Phát hiện "dài" bằng cách đo thực tế (nội dung bị cắt) chứ không đếm ký tự cố định, vì bề rộng khác nhau trên điện thoại và máy tính.
- Áp dụng cho bình luận dài, cùng cách. [ĐỀ XUẤT: chưa bị phản đối]
- Phải dùng được bằng bàn phím và trình đọc màn hình (`aria-expanded`, nút thật, không phải `div`).
- Trên trang chi tiết của bài, nội dung bài hiện đầy đủ, không cần "Xem thêm".

### 6.3 Lọc theo từ khóa [CHỐT]

Người dùng đã chốt: **bộ lọc chọn "Anh văn" thì hiện các bài có chứa chữ "Anh văn"** trong nội dung. **Không** có ô chọn môn/cấp học khi soạn bài.

- **Bỏ dấu và không phân biệt hoa thường** khi so khớp, giống ô tìm kiếm ở trang giới thiệu và hàm `fold()` trong `app/src/lib/api.tsx`.
- Server lưu thêm cột `search_text` = tiêu đề + nội dung (bản đang hiển thị) đã bỏ dấu và hạ chữ thường, tính lại mỗi khi bản hiển thị thay đổi. Lọc bằng `LIKE '%từ khóa%'` trên cột này.
- **Bộ lọc môn:** lấy danh sách từ bảng `subjects` (đã có, 25 nhóm). Mỗi môn khớp với **tên môn** và vài cách viết phổ biến [ĐỀ XUẤT: bảng đồng nghĩa nhỏ trong mã]. Ví dụ: Tiếng Anh → `tieng anh`, `anh van`, `english`; Toán → `toan`; Ngữ văn → `ngu van`, `van`; ... Chỉ khớp thêm các từ thật sự phổ biến, không đoán rộng.
- **Bộ lọc cấp học:** `Tiểu học`, `THCS`, `THPT`, `Người đi làm` (đúng 4 giá trị đã dùng ở hồ sơ gia sư). Khớp từ khóa tương ứng, ví dụ THCS → `thcs`, `cap 2`, `lop 6..9`; THPT → `thpt`, `cap 3`, `lop 10..12`. [ĐỀ XUẤT]
- Nhiều bộ lọc cùng lúc thì **và** (AND) với nhau và với ô tìm kiếm.
- **Ô tìm kiếm** tự do dùng cùng cơ chế.
- Giới hạn hợp lý: độ dài từ khóa ≤ 80 ký tự; thoát ký tự đặc biệt của `LIKE`.

### 6.4 Sắp xếp [CHỐT]

- **Mới nhất:** theo `published_at` giảm dần (mặc định).
- **Hữu ích:** theo **tổng số "Hữu ích" của các bình luận trong bài** giảm dần, hòa thì mới hơn lên trước. [ĐỀ XUẤT cách tính: đã mô tả trong thảo luận là "bài có nhiều bình luận được bấm Hữu ích lên trước"]

### 6.5 Phân trang [ĐỀ XUẤT]

- 20 bài mỗi trang; dùng tham số `page` và lấy `limit + 1` để biết còn trang sau. (Cursor `before` đơn giản kiểu gallery không dùng được khi sắp theo "Hữu ích".)
- Danh sách hiện tại của dự án chưa phân trang ở nhiều chỗ (ghi trong tài liệu bàn giao); Cộng đồng phải **phân trang ngay từ đầu**.

---

## 7. Trang chi tiết bài (`/app/community/:id`)

- Tiêu đề, nhãn tác giả, thời gian đăng, nội dung đầy đủ, "Đã giải quyết" nếu có.
- Khu bình luận (mục 5) và ô soạn bình luận (khách thấy lời mời đăng nhập).
- Nút **Báo cáo** (người đã đăng nhập), **Theo dõi**.
- Nếu là tác giả: Sửa, Xóa, Đánh dấu Đã giải quyết, chọn câu trả lời hay nhất; thấy trạng thái nếu có bản sửa đang chờ hoặc bị từ chối kèm lý do.
- Nếu bài không hiển thị công khai (pending/rejected/hidden) mà người xem là tác giả/admin thì hiện trạng thái rõ ràng; người khác nhận 404.

---

## 8. Chặn thông tin liên hệ [CHỐT: chặn số điện thoại, email, Zalo, link ngoài]

Áp dụng cho **tiêu đề, nội dung bài, bình luận và tên hiển thị**, kiểm tra ở server (client chỉ báo sớm). Nếu phát hiện thì **từ chối gửi** và báo rõ lý do ("Vui lòng không đăng số điện thoại / email / link / Zalo").

Mẫu cần bắt (viết thành hàm thuần `findContactInfo(text)` có test riêng):

- **Số điện thoại Việt Nam:** dãy 9–11 chữ số, kể cả có khoảng trắng/dấu chấm/gạch giữa các nhóm số (`0912 345 678`, `0912.345.678`, `+84 912 345 678`, `84912345678`). Bỏ ký tự phân cách rồi kiểm tra độ dài và tiền tố (`0`, `84`, `+84`).
- **Email:** `.+@.+\..+` theo kiểu thực dụng.
- **Link:** `http://`, `https://`, `www.`, và tên miền trần (`abc.com`, `abc.vn`, ...).
- **Nền tảng liên hệ:** `zalo`, `facebook`, `fb.com`, `messenger`, `telegram`, `tele` đi kèm chuỗi số hoặc đường dẫn/tên tài khoản (tránh chặn nhầm câu như "mình học qua Zalo meeting" thì chấp nhận được một ít báo nhầm; ưu tiên chặn đúng hơn là bỏ sót).

Hệ thống này **không bắt được hết** (người dùng cố tình viết chữ "không chín..."); admin duyệt bài và nút Báo cáo là lớp bảo vệ còn lại. Nói rõ điều này trong báo cáo cuối.

---

## 9. Kiểm duyệt (Admin)

### 9.1 Hàng đợi duyệt bài [CHỐT]

Vị trí: tab **"Cộng đồng"** mới trong `/app/admin` (cùng hàng với Gia sư, Tài khoản, Kỳ thi, Môn học, Tin tức, Nhật ký).

- Danh sách chờ duyệt gồm: bài `pending` **và** bản sửa chờ duyệt của bài `approved`. Sắp xếp cũ nhất trước (xử lý theo thứ tự gửi).
- Mỗi mục hiển thị: nội dung đầy đủ, người đăng (**kèm họ tên thật và email** để xử lý), loại (bài mới / bản sửa), với bản sửa thì hiện so sánh bản cũ và bản sửa.
- Hai hành động:
  - **Duyệt.**
  - **Từ chối** — bắt buộc nhập lý do; lý do hiện cho người đăng.
- Sau khi xử lý, mục rời khỏi hàng đợi; ghi `audit` (bảng `audit` đã có: `audit(actor, action, target)`) với `community.post.approve`, `community.post.reject`, ...
- Hiển thị số mục đang chờ trên tab và trong số liệu tổng quan admin. [ĐỀ XUẤT]

### 9.2 Sau khi bài đã đăng [CHỐT]

- **Ẩn bài** (lý do bắt buộc) và **khôi phục**.
- **Gỡ bình luận** (lý do bắt buộc), ghi audit.
- **Hàng đợi báo cáo** (mục 9.4).
- Người bị gỡ bài/bình luận phải thấy lý do (trong "Bài của tôi" với bài; với bình luận thì chỗ giữ chỗ chỉ nói "đã bị quản trị viên gỡ"). [ĐỀ XUẤT cho phần bình luận]

### 9.3 Khóa quyền Cộng đồng [CHỐT: khóa quyền đăng người vi phạm lặp lại]

- Admin khóa/mở khóa **quyền đăng bài và bình luận** của một tài khoản, kèm lý do bắt buộc, ghi audit.
- Khác với "tạm khóa tài khoản" (`users.status = suspended`, chặn đăng nhập): khóa Cộng đồng **chỉ** chặn đăng bài/bình luận/Hữu ích/báo cáo, vẫn xem được và vẫn dùng phần còn lại của ứng dụng.
- Cột mới: `users.community_locked INTEGER 0/1`, `community_lock_reason TEXT`. [ĐỀ XUẤT: khóa cho đến khi admin mở, chưa có hết hạn tự động]
- Người bị khóa thấy thông báo rõ khi thử đăng ("Quyền đăng bài của bạn đang bị khóa: {lý do}").
- Gợi ý thao tác: nút khóa nằm ở hàng đợi duyệt, báo cáo và danh sách tài khoản.

### 9.4 Báo cáo [CHỐT: có nút báo cáo]

- Người đã đăng nhập báo cáo một **bài** hoặc một **bình luận**: chọn lý do (danh sách ngắn cố định, ví dụ *Quảng cáo / Thông tin liên hệ / Xúc phạm / Không liên quan học tập / Khác*) và ghi chú tùy chọn (≤ 300 ký tự).
- Mỗi người chỉ báo cáo một lần cho mỗi đối tượng (ràng buộc duy nhất).
- **Không tự động ẩn** theo số lượng báo cáo [ĐỀ XUẤT]; chỉ đưa mục có báo cáo lên đầu hàng đợi báo cáo. Admin xem xét rồi chọn: bỏ qua / ẩn bài / gỡ bình luận / khóa quyền.
- Báo cáo trạng thái `open` hoặc `resolved` (kèm ai xử lý, kết quả).

### 9.5 Đăng Thông báo [CHỐT]

Admin soạn thông báo ngay trong tab Cộng đồng, đăng thẳng (không qua duyệt), nhãn Quản trị viên. Thông báo hiện trong danh sách như bài thường. Không dùng chung với mục **Tin tức** có sẵn (`/app/news`, bảng `posts`): hai nơi tách biệt.

### 9.6 Sửa Quy tắc cộng đồng

Admin sửa nội dung bài `rules` trong cùng tab (một form tiêu đề + nội dung). Sửa là có hiệu lực ngay, ghi audit `community.rules.update`.

---

## 10. Thông báo trong ứng dụng

- **Chỉ chấm đỏ trong ứng dụng [CHỐT], không email, không realtime.** Không có hạ tầng thông báo hiện tại; phải làm bảng mới.
- Chấm đỏ + số hiển thị trên mục "Cộng đồng" của menu trái và trong "Bài của tôi".
- Cập nhật khi: tải trang, chuyển trang trong ứng dụng, và khi tab được kích hoạt lại (`visibilitychange`). **Không** dùng WebSocket hay polling dày. [ĐỀ XUẤT]
- Loại thông báo:

| `kind` | Gửi cho | Khi nào |
| --- | --- | --- |
| `post_approved` | Tác giả | Bài được duyệt |
| `post_rejected` | Tác giả | Bài bị từ chối (kèm lý do trong chi tiết) [CHỐT] |
| `revision_approved` | Tác giả | Bản sửa được duyệt |
| `revision_rejected` | Tác giả | Bản sửa bị từ chối |
| `post_hidden` | Tác giả | Bài bị ẩn |
| `new_comment` | Người theo dõi bài | Có bình luận mới (gộp theo bài; không gửi cho người viết) |

- Bấm vào thông báo dẫn tới bài tương ứng và đánh dấu đã đọc. Có nút "Đánh dấu đã đọc tất cả".

### 10.1 "Bài của tôi" [CHỐT]

Trang liệt kê bài của mình, chia theo trạng thái hiển thị rõ ràng:

- **Đang chờ duyệt** (`pending`, và bài `approved` có bản sửa chờ).
- **Đã đăng** (`approved`).
- **Bị từ chối** kèm lý do (`rejected`, hoặc bản sửa bị từ chối). Có nút sửa và gửi lại.
- Bài `hidden` hiện kèm lý do (không sửa được).

---

## 11. Giới hạn tốc độ và chống lạm dụng

- **Bình luận:** tối đa 5 bình luận mỗi phút cho mỗi tài khoản (cùng cơ chế đếm trong CSDL như `gallery_comments`, trả 429 kèm câu thông báo tiếng Việt). [ĐỀ XUẤT: tái dùng con số của gallery]
- **Bài:** tối đa 3 bài gửi mỗi 24 giờ cho mỗi tài khoản, đếm cả bài đang chờ duyệt (tránh lấp hàng đợi). [ĐỀ XUẤT: chưa có con số do người dùng chốt]
- **Báo cáo:** ví dụ 10 báo cáo mỗi giờ mỗi tài khoản. [ĐỀ XUẤT]
- Giới hạn chung 240 yêu cầu/phút/IP của API vẫn áp dụng. (Lưu ý: bộ giới hạn đó nằm trong bộ nhớ tiến trình; không đủ cho bảo vệ lâu dài, nhưng đó là hiện trạng chung của dự án, không thuộc phạm vi Cộng đồng.)
- Mọi giới hạn là hằng số đặt tên rõ ràng ở đầu module để dễ chỉnh.
- Xác thực đầu vào bằng `zod` (đã dùng trong `server/validation.js`), cắt khoảng trắng, từ chối chuỗi rỗng.

---

## 12. Google và SEO [CHỐT: bài lên Google; PHỤ THUỘC kỹ thuật]

### 12.1 Nguyên tắc

- Chỉ bài `approved` (bản đang hiển thị) lên Google. `pending/rejected/hidden/deleted`, và bản sửa chưa duyệt, **không bao giờ** xuất hiện.
- Chỉ **tên hiển thị** và tư cách xuất hiện trong trang công khai và dữ liệu có cấu trúc. Họ tên thật của học sinh/phụ huynh không bao giờ.

### 12.2 Cách làm (theo mẫu của mục Tin tức đã có)

Ứng dụng là SPA vẽ bằng JavaScript tại `/app/*`. Mục Tin tức đã giải quyết bằng cách để server chèn thẻ `<title>`, mô tả, canonical, `robots`, Open Graph vào HTML shell trước khi trả (`server/seo.js` + `renderSeo` + nhánh tương ứng trong `server/index.js` và `worker/index.js`) và đưa URL vào `sitemap.xml`. Cộng đồng làm **y hệt cơ chế đó**:

- Thêm đường dẫn `/app/community` (danh sách; mô tả chung, vào `shared/seo-pages.json`) và `/app/community/:id` (mỗi bài).
- `pageSeo` / `renderSeo` nhận thêm dữ liệu bài cộng đồng: `title = "{tiêu đề} | Cộng đồng Gia Sư 10 Điểm"`, `description` = ~160 ký tự đầu của nội dung (bỏ xuống dòng), canonical, `index, follow`.
- Bài không công khai (hoặc không tồn tại) → HTTP **404** và `noindex`, không rò rỉ nội dung.
- `sitemap.xml` thêm URL của mọi bài `approved` (`newsSitemap` mở rộng hoặc hàm sitemap tổng hợp). `worker/index.js` lấy dữ liệu từ Durable Object qua `/api/...` giống nhánh news (và trả 503 nếu API tạm lỗi thay vì trả sitemap thiếu).
- Dữ liệu có cấu trúc JSON-LD loại `DiscussionForumPosting` với tác giả là **tên hiển thị** (không dùng họ tên thật của học sinh/phụ huynh). [ĐỀ XUẤT]
- Cần endpoint công khai nhẹ để Worker lấy tiêu đề/mô tả/danh sách id (ví dụ `GET /api/community/posts/:id` đã đủ; thêm `GET /api/community/sitemap` trả `[{id, updated_at}]`).

### 12.3 Giới hạn cần nói thẳng

Giống Tin tức, **phần thân bài vẫn do JavaScript vẽ ở trình duyệt**; server chỉ đảm bảo phần đầu trang (tiêu đề, mô tả, canonical, robots) đúng. Googlebot có chạy JavaScript nên thường vẫn lập chỉ mục, nhưng không bảo đảm. Nếu cần chắc chắn hơn thì phải chèn thêm nội dung bài dạng văn bản vào HTML do server trả (chưa làm; để người dùng quyết sau).

---

## 13. Mô hình dữ liệu

Tất cả thay đổi là **bổ sung**, vào `migrateDatabase(db)` trong `server/db.js` (chạy cả ở local lẫn Durable Object của Cloudflare). **Không xóa, không đổi tên, không tạo lại bảng cũ.** Bảng `posts` hiện có là của mục **Tin tức**; bảng của Cộng đồng đặt tên có tiền tố `community_` để không nhầm.

### 13.1 Thay đổi bảng `users`

```sql
ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN community_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN community_lock_reason TEXT NOT NULL DEFAULT '';
```

Mỗi `ALTER` bọc trong kiểm tra `PRAGMA table_info(users)` như cách các cột `onboarding_step`, `learner_type` đã làm (migration phải chạy lặp lại không lỗi).

### 13.2 Bảng mới

```sql
CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'user' CHECK(kind IN ('user','announcement','rules')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','hidden','deleted')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT '',          -- title+body đã bỏ dấu, chữ thường
  review_note TEXT NOT NULL DEFAULT '',          -- lý do từ chối / ẩn mới nhất
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  solved INTEGER NOT NULL DEFAULT 0,
  best_comment_id INTEGER,
  revision_title TEXT,                           -- bản sửa chờ duyệt
  revision_body TEXT,
  revision_status TEXT CHECK(revision_status IN ('pending','rejected')),
  revision_note TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS one_rules_post ON community_posts(kind) WHERE kind='rules';
CREATE INDEX IF NOT EXISTS community_posts_feed ON community_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_author ON community_posts(author_id, created_at);

CREATE TABLE IF NOT EXISTS community_comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES community_comments(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK(status IN ('visible','removed_by_author','removed_by_admin')),
  removal_note TEXT NOT NULL DEFAULT '',
  edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS community_comments_post ON community_comments(post_id, id);
CREATE INDEX IF NOT EXISTS community_comments_author_time ON community_comments(author_id, created_at);

CREATE TABLE IF NOT EXISTS community_helpful (
  comment_id INTEGER NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_follows (
  post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  resolved_by INTEGER REFERENCES users(id),
  resolution TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(reporter_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS community_notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS community_notifications_user ON community_notifications(user_id, read_at, id);
```

Ghi chú:

- Đây là phác thảo logic; người xây có thể điều chỉnh cú pháp cho phù hợp bộ chạy SQLite của Durable Object (đã dùng `exec` nhiều câu trong `migrateDatabase`), miễn là giữ ngữ nghĩa và tính cộng thêm.
- `ON DELETE CASCADE` cần `PRAGMA foreign_keys` — kiểm tra xem bật chưa như các bảng gallery đang dựa vào; không dựa vào cascade cho đúng đắn nghiệp vụ (xóa mềm là chính).
- **Bài Quy tắc:** sau khi tạo bảng, chèn bài `kind='rules'`, `status='approved'`, `author_id` = một tài khoản admin hiện có, **chỉ khi chưa có** (migration chạy lại mỗi lần khởi động DO). Nếu chưa có admin nào thì trì hoãn việc tạo đến khi có admin đầu tiên hoặc dùng cơ chế "tạo khi truy cập đầu tiên" — không được làm migration thất bại. [ĐỀ XUẤT: xử lý ở chỗ đọc: nếu chưa có bài rules thì trả bản mặc định cố định trong mã, và tạo dòng thật khi admin sửa lần đầu.]
- Tính số bình luận, tổng "Hữu ích" bằng truy vấn con có chỉ mục (quy mô nhỏ), chưa cần cột đếm phi chuẩn hóa.

---

## 14. API

Tiền tố `/api/community`, đăng ký bằng một module mới `server/community.js` theo mẫu `registerPosts(app, db, auth, audit)` / `registerGallery`, nối vào `createApi` trong `server/api.js`. Lưu ý: phần xác thực của `createApi` chặn mọi yêu cầu ghi không phải JSON (415) và kiểm tra `Origin`, giữ nguyên.

Mọi lỗi trả JSON `{ "error": "..." }` bằng tiếng Việt, mã HTTP đúng (400/401/403/404/409/429).

### 14.1 Công khai (không cần đăng nhập)

| Phương thức, đường dẫn | Mô tả |
| --- | --- |
| `GET /posts?q=&subject=&level=&sort=new\|helpful&page=` | Danh sách bài `approved` (và `kind announcement`). Phản hồi: `{ rules, items, more }`, trong đó `rules` là bài Quy tắc (chỉ ở `page=1`, luôn có), `items` không chứa bài rules. |
| `GET /posts/:id` | Chi tiết bài `approved`. Tác giả/admin còn xem được bài ở trạng thái khác (kèm trạng thái, lý do, bản sửa); người khác nhận 404. |
| `GET /posts/:id/comments?after=` | 20 bình luận gốc kèm trả lời; ghim câu trả lời hay nhất; cờ `helpful_count`, và (nếu đăng nhập) `helpful_by_me`, `mine`. |
| `GET /sitemap` | `[{ id, updated_at }]` của bài `approved`, cho sitemap (Worker và server dùng). |

### 14.2 Người dùng đã đăng nhập và được phép tham gia

| Phương thức, đường dẫn | Mô tả |
| --- | --- |
| `PUT /me/display-name` `{ display_name }` | Đặt/đổi tên hiển thị (kiểm tra mục 2.2). Không làm hồ sơ gia sư về `pending`. |
| `POST /posts` `{ title, body }` | Gửi bài mới → `pending`. Kiểm tra: tên hiển thị đã có, không bị khóa, bộ lọc liên hệ, giới hạn 3 bài/24 giờ. |
| `PUT /posts/:id` `{ title, body }` | Sửa bài của mình: `rejected → pending` (sửa & gửi lại); `approved` → tạo/cập nhật bản sửa chờ duyệt; `pending` → sửa trực tiếp; `hidden/deleted` → 409. |
| `DELETE /posts/:id` | Xóa mềm bài của mình. |
| `DELETE /posts/:id/revision` | Hủy bản sửa của mình. |
| `POST /posts/:id/solve` `{ solved, best_comment_id? }` | Chỉ tác giả. |
| `PUT /posts/:id/follow`, `DELETE /posts/:id/follow` | Theo dõi. |
| `POST /posts/:id/comments` `{ body, parent_id? }` | Chỉ trên bài `approved`; giới hạn 5/phút; bộ lọc liên hệ; tự theo dõi bài; thông báo cho người theo dõi. |
| `PATCH /comments/:id` `{ body }` | Sửa bình luận của mình. |
| `DELETE /comments/:id` | Xóa bình luận của mình. |
| `PUT /comments/:id/helpful`, `DELETE ...` | Hữu ích (không cho bình luận của chính mình). |
| `POST /reports` `{ target_type, target_id, reason, detail? }` | Báo cáo. |
| `GET /mine` | "Bài của tôi" theo trạng thái. |
| `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read` | Chấm đỏ và danh sách. |

### 14.3 Admin (`auth("admin")`)

| Phương thức, đường dẫn | Mô tả |
| --- | --- |
| `GET /api/admin/community/queue` | Bài `pending` + bản sửa chờ, kèm họ tên thật, email, cũ nhất trước. |
| `POST /api/admin/community/posts/:id/approve` | Duyệt bài hoặc bản sửa. |
| `POST /api/admin/community/posts/:id/reject` `{ note }` | `note` bắt buộc. |
| `POST /api/admin/community/posts/:id/hide` `{ note }`, `.../restore` | Ẩn / khôi phục. |
| `POST /api/admin/community/posts` `{ title, body }` | Đăng Thông báo (`announcement`, `approved` ngay). |
| `PUT /api/admin/community/rules` `{ title, body }` | Sửa bài Quy tắc. |
| `DELETE /api/admin/community/comments/:id` `{ note }` | Gỡ bình luận. |
| `GET /api/admin/community/reports?status=open`, `POST .../reports/:id/resolve` `{ resolution }` | Hàng đợi báo cáo. |
| `PATCH /api/admin/community/users/:id/lock` `{ locked, reason }` | Khóa/mở quyền Cộng đồng. |

Mọi thao tác ghi của admin gọi `audit(...)` với `action` có tiền tố `community.` để hiện trong tab Nhật ký sẵn có.

### 14.4 Ràng buộc nghiệp vụ phải kiểm tra ở server

1. Mọi hành động đăng/bình luận/Hữu ích/báo cáo yêu cầu: đã đăng nhập, `status=active`, `community_locked=0`.
2. Không bao giờ tin vào nhãn hay tư cách từ client; luôn tính từ CSDL.
3. Chuyển trạng thái chỉ theo bảng ở mục 4.3; chuyển trái phép trả 409.
4. Một số thao tác phải nằm trong `transaction(db, ...)` (đã có sẵn trong `db.js`): duyệt bản sửa, chọn câu trả lời hay nhất, thông báo kèm đổi trạng thái.
5. Đối tượng không hiển thị công khai trả **404** cho người không có quyền (không phải 403, để không lộ sự tồn tại).

---

## 15. Giao diện (React 19, Vite, react-router-dom 7, shadcn + Animate UI)

### 15.1 Điều hướng

- Thêm mục **"Cộng đồng"** vào mảng `nav` trong `Shell()` ở `app/src/main.tsx`, **ngay sau `{ to: "/library", label: "Môn học & kỳ thi", icon: BookOpen }`**, hiển thị cho **cả khách**. Biểu tượng gợi ý `MessagesSquare` (lucide-react).
- Chấm đỏ số thông báo chưa đọc cạnh mục (chỉ khi đăng nhập).
- Tuyến (trong `Routes` của `Shell`, tải lười bằng `lazy` như các trang khác):
  - `/community` — danh sách.
  - `/community/:id` — chi tiết.
  - `/community/mine` — Bài của tôi (bọc `Require`).
  - Soạn bài: hộp thoại/biểu mẫu mở từ danh sách (không cần tuyến riêng), hoặc `/community/new` bọc `Require`. [ĐỀ XUẤT: hộp thoại]
- Thêm các đường dẫn vào danh sách đường dẫn mà `pageSeo` biết (xem 12.2) và `topbar-location` hiển thị đúng tiêu đề.

### 15.2 Các màn hình và thành phần

| Thành phần | Mô tả |
| --- | --- |
| `Community.tsx` | Danh sách: bài ghim Quy tắc, thanh công cụ, danh sách, phân trang. |
| `CommunityPost.tsx` | Chi tiết bài + bình luận. |
| `CommunityMine.tsx` | Bài của tôi theo trạng thái. |
| `community/Compose` | Biểu mẫu soạn/sửa bài: tiêu đề, nội dung, dòng lưu ý, bộ đếm ký tự, báo lỗi theo trường. |
| `community/AuthorLabel` | Hiển thị `Tên - Tư cách`; với gia sư là liên kết tới hồ sơ; huy hiệu riêng cho Quản trị viên. |
| `community/ReadMore` | Thu gọn 5–6 dòng + "Xem thêm / Thu gọn", đo thực tế phần bị cắt, bàn phím/ARIA. |
| `community/CommentThread` | Bình luận gốc + trả lời, Hữu ích, sửa, xóa, báo cáo. |
| `community/GuestGate` | Lời mời đăng nhập/tạo tài khoản cho khách, giữ `next`. |
| `Admin.tsx` → thêm `TabsTrigger value="community"` | Nội dung tab là `AdminCommunity.tsx`: Hàng đợi duyệt, Báo cáo, Thông báo & Quy tắc, Khóa quyền. Theo mẫu `AdminPosts.tsx` / tab hiện có. |

Kiểu dữ liệu thêm vào `app/src/lib/types.ts`. Dùng `api()` và `useLoad()` trong `app/src/lib/api.tsx`.

### 15.3 Yêu cầu giao diện chung

- Toàn bộ chữ tiếng Việt, có dấu; văn phong thân thiện, ngắn.
- Bố cục dùng được ở **360, 390, 768, 1024, 1440 px**, không tràn ngang; hỗ trợ `prefers-reduced-motion` (không phụ thuộc chuyển động).
- Điều hướng và thao tác dùng được bằng bàn phím; mục tiêu bấm đủ lớn trên điện thoại; tương phản đủ (tối thiểu WCAG AA).
- Tái dùng thành phần có sẵn (`Page`, `Heading`, `Blank`, `Loading`, `ErrorState`, `Person`, `Button`, hộp thoại, thông báo `sonner`) thay vì viết mới.
- Mọi hành động có trạng thái đang xử lý, thông báo thành công, và thông báo lỗi rõ nghĩa (không im lặng thất bại).
- Với bài đang chờ/bị từ chối/bị ẩn, trạng thái phải **hiển thị rõ bằng chữ**, không chỉ bằng màu.

---

## 16. Kiểm thử cần có

### 16.1 Kiểm thử API (`node --test`, theo `test/api.test.js`)

- Nhãn tư cách: học sinh, phụ huynh, gia sư đã duyệt (họ tên thật), gia sư chờ duyệt (hiện tên hiển thị + Học sinh), admin; và việc đổi trạng thái hồ sơ gia sư đổi nhãn.
- Rò rỉ riêng tư: phản hồi công khai không chứa `users.name`/email/id của học sinh, phụ huynh, gia sư chờ duyệt.
- Khách: GET được; mọi thao tác ghi bị 401.
- Vòng đời bài: gửi → pending (khách không thấy, người khác không thấy, tác giả thấy) → duyệt → hiện, có `published_at` → sửa tạo bản sửa, **bản cũ vẫn hiện** → duyệt bản sửa thay thế, từ chối bản sửa giữ bản cũ → admin ẩn → công khai 404 → khôi phục → tác giả xóa.
- Từ chối bắt buộc có lý do; lý do hiện cho tác giả.
- Bình luận hiện ngay; chỉ trên bài `approved`; trả lời một cấp; sửa, xóa; gỡ bởi admin có chỗ giữ.
- Hữu ích: một lần mỗi người, không tự bấm.
- Đã giải quyết và câu trả lời hay nhất: chỉ tác giả, không chọn bình luận của mình.
- Giới hạn tốc độ: bình luận (429 sau 5/phút), bài (3/24 giờ).
- Bộ lọc liên hệ: bộ test riêng cho `findContactInfo` gồm số có dấu cách/chấm/+84, email, link, tên miền trần, Zalo kèm số, và các ca không được chặn nhầm.
- Tên hiển thị: từ chối chứa "admin"/"quản trị" (có và không dấu, hoa thường), độ dài; đổi tên hiển thị **không** đặt hồ sơ gia sư về pending.
- Khóa quyền Cộng đồng: người bị khóa không đăng/bình luận được nhưng vẫn đăng nhập và xem được; có audit.
- Báo cáo: một lần mỗi đối tượng; hàng đợi; xử lý.
- Lọc: từ khóa không dấu ("anh van" khớp "Anh văn"), môn/cấp học, kết hợp, thoát ký tự `%`/`_`; sắp xếp mới nhất/hữu ích; Quy tắc luôn đứng đầu ở trang 1 kể cả khi lọc, không có ở trang 2.
- Tài khoản bị tạm khóa (`suspended`): bài và bình luận ẩn công khai; mở khóa hiện lại.
- Quyền admin: các endpoint admin trả 403 cho người khác.
- **Migration**: chạy hai lần không lỗi; dữ liệu cũ (tài khoản, bài Tin tức, gallery) nguyên vẹn; bài Quy tắc không bị tạo trùng.

### 16.2 SEO (`test/seo.test.js`, `test/seo-routing.mjs`, `test/production-routing.mjs`)

- `/app/community` có tiêu đề/mô tả/canonical, `index`.
- `/app/community/:id` của bài `approved` đúng thẻ, không có thông tin cá nhân; bài ẩn/pending/không tồn tại → 404 và `noindex`.
- `sitemap.xml` chứa bài `approved`, không chứa bài ẩn/xóa/chờ.
- Worker (nhánh Cloudflare) cho kết quả tương đương server local.

### 16.3 End-to-end (Playwright, theo `test/e2e/marketplace.spec.ts`)

1. **Khách**: thấy mục "Cộng đồng" dưới "Môn học & kỳ thi", xem được danh sách và bài, bấm "Đăng bài"/"Bình luận" được mời đăng nhập và quay lại đúng bài sau khi đăng nhập.
2. **Học sinh**: đặt tên hiển thị, đăng bài → "Đang chờ duyệt", không thấy trong danh sách công khai; admin duyệt → bài xuất hiện; học sinh nhận chấm đỏ.
3. **Từ chối**: admin từ chối kèm lý do → học sinh thấy lý do, sửa và gửi lại.
4. **Sửa bài đã đăng**: bản cũ vẫn hiện trong lúc chờ duyệt.
5. **Bình luận** của học sinh khác và gia sư; nhãn đúng; gia sư đã duyệt hiện họ tên thật và liên kết hồ sơ.
6. **Admin**: gỡ bình luận, ẩn bài, khóa quyền; ghi vào Nhật ký.
7. **Xem thêm**: bài dài thu gọn và mở rộng được bằng bàn phím.
8. **Quy tắc**: luôn ở đầu danh sách kể cả khi lọc.
9. **Responsive** ở 360 px và 1440 px, không tràn ngang; reduced motion.

### 16.4 Lệnh phải chạy trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra.

---

## 17. Phụ thuộc và việc để sau

| Mục | Trạng thái |
| --- | --- |
| Form đăng ký có ô **Tên hiển thị** | Chưa làm, bàn sau. Cộng đồng dùng hộp thoại bổ sung (mục 2.2) để không phụ thuộc. |
| Thiết kế **tài khoản và dashboard Phụ huynh** | Người dùng muốn tra cứu mô hình nước ngoài rồi đề xuất cho Việt Nam, **sau khi chốt Cộng đồng**. Cộng đồng chỉ dùng `learner_type = parent` có sẵn để hiện nhãn "Phụ huynh". |
| Email thông báo, realtime | Cần hạ tầng trả phí; để sau. |
| Chèn nội dung bài vào HTML cho Google (mục 12.3) | Chưa làm; người dùng quyết sau. |
| Con số giới hạn chính xác (độ dài, số bài/ngày) | Đề xuất ở mục 4.1 và 11; người dùng có thể đổi. |

---

# PHẦN 2 — PROMPT CHO AGENT XÂY DỰNG

> Sao chép nguyên khối bên dưới gửi cho Agent. Prompt giả định Agent được mở trong thư mục dự án và có tài liệu này ở `docs/community-design.md`.

````text
Bạn là kỹ sư phần mềm cấp cao, làm việc trong repo "Gia Sư 10 Điểm" (nền tảng tìm gia sư của Việt Nam). Nhiệm vụ: xây dựng mục "Cộng đồng" theo đúng bản thiết kế đã được người dùng chốt.

# 0. Nguồn sự thật

Tài liệu thiết kế đầy đủ: `docs/community-design.md` (Phần 1). Đọc toàn bộ trước khi viết bất kỳ dòng code nào. Mọi quyết định trong đó gắn nhãn:
- [CHỐT]: người dùng đã đồng ý, KHÔNG được tự ý đổi.
- [ĐỀ XUẤT]: làm theo, nhưng ghi lại trong báo cáo cuối để người dùng xác nhận.
- [PHỤ THUỘC]: phụ thuộc phần khác chưa làm.
- [KHÔNG LÀM]: tuyệt đối không thêm (mục 1.3 của tài liệu).
Nếu tài liệu mâu thuẫn với mã nguồn hiện tại, hoặc bạn gặp điểm chưa rõ mà không có nhãn [ĐỀ XUẤT] để dựa vào, HÃY DỪNG LẠI VÀ HỎI người dùng thay vì đoán. Người dùng đã nhiều lần nhấn mạnh: không tự thêm tính năng họ chưa yêu cầu.

# 1. Bối cảnh dự án (đã xác minh trong repo)

- Backend: Express 5 + SQLite. Local dùng `node:sqlite` (`server/local-db.js`); production dùng Cloudflare Worker + Durable Object SQLite (`worker/index.js` bọc cùng `createApi`). Vì vậy mọi thay đổi CSDL phải chạy được ở CẢ HAI môi trường.
- Migration nằm trong `migrateDatabase(db)` ở `server/db.js`, chạy mỗi lần khởi động; phải CỘNG THÊM và idempotent (mẫu: kiểm tra `PRAGMA table_info` trước `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`). Không xóa/đổi tên/tạo lại bảng cũ. Không xóa file CSDL để sửa schema.
- API: `server/api.js` (`createApi`), các mô-đun đăng ký route theo mẫu `registerPosts(app, db, auth, audit)` trong `server/posts.js` và `registerGallery` trong `server/gallery.js`. Dùng `auth(...)`, `audit(actor, action, target)`, `transaction(db, fn)`, `all/one/run` từ `server/db.js`, `z/text` từ `server/validation.js`. Lỗi trả `{ error }` tiếng Việt.
- Bảng `posts` hiện có là của mục TIN TỨC (admin viết). Cộng đồng dùng bảng riêng tiền tố `community_`. Không dùng lẫn.
- Vai trò: `users.role` ∈ student|tutor|admin; `users.learner_type` ∈ student|parent (hàm `accountRole()` trong `app/src/lib/types.ts`); `tutors.status` = 'approved' mới là gia sư công khai; `users.status` ∈ active|suspended.
- SEO: `server/seo.js` (`pageSeo`, `renderSeo`, `newsSitemap`), `shared/seo-pages.json`, nhánh tin tức trong `server/index.js` và `worker/index.js`. Cộng đồng phải làm giống cơ chế `/app/news/:id`.
- Frontend: React 19 + Vite + react-router-dom 7 (app gắn ở `/app/*`), shadcn + Animate UI, `app/src/main.tsx` (mảng `nav`, `Routes`, `lazy`), `app/src/lib/api.tsx` (`api`, `useLoad`, `fold`), `app/src/components/common.tsx`, trang mẫu `app/src/pages/News.tsx`, `AdminPosts.tsx`, `Admin.tsx` (các `TabsTrigger`), `components/gallery-social.tsx` (mẫu bình luận).
- `index.html` ở thư mục gốc là FILE SINH RA (từ `inputs.json`, `styles.css`, `scripts/build-page.js`, `scripts/site.js`). Không sửa tay; chỉ chạy `npm run build:page` nếu thật sự đụng tới landing (thường là không cần).
- Phạm vi dự án: chỉ tìm gia sư. Không quiz/đáp án/chấm điểm, không thanh toán, không video.
- Quy ước repo: đọc `docs/development-handoff.md` và `docs/architecture.md`. Commit KHÔNG thêm dòng đồng tác giả AI (theo tài liệu bàn giao). Giao diện tiếng Việt có dấu.

# 2. Cách làm việc

1. Tạo nhánh mới từ `origin/main` mới nhất (ví dụ `feat/community`). Không làm trên nhánh `Hung`. Không đẩy lên remote và không mở PR trừ khi người dùng yêu cầu.
2. Làm theo các giai đoạn dưới đây, mỗi giai đoạn một commit rõ ràng (tiếng Anh, kiểu `feat:`/`test:`; có thể kèm mô tả ngắn). Sau mỗi giai đoạn chạy các kiểm tra liên quan và sửa đến khi sạch trước khi sang giai đoạn sau.
3. Trước giai đoạn 1, viết ngắn gọn kế hoạch của bạn (file nào sẽ tạo/sửa, rủi ro) rồi tiến hành; chỉ dừng hỏi khi gặp mâu thuẫn hoặc điểm mơ hồ nêu ở mục 0.
4. Chạy thử thật: khởi động server, thao tác qua trình duyệt cho các luồng chính, chụp/ghi lại bằng chứng. Không báo "xong" khi chưa chạy.
5. Viết code đọc như phần mã xung quanh: cùng cách đặt tên, cùng mật độ chú thích, dùng lại tiện ích có sẵn. Không thêm thư viện mới nếu không thật sự cần; nếu cần thì nêu lý do.

# 3. Các giai đoạn

## Giai đoạn 1 — Nền dữ liệu và lõi API

- Migration cộng thêm cho `users` (`display_name`, `community_locked`, `community_lock_reason`) và các bảng `community_*` (mục 13).
- `server/community.js` đăng ký route, nối vào `createApi`.
- Hàm thuần có test riêng: tính nhãn tư cách (mục 2.3), `findContactInfo` (mục 8), kiểm tra tên hiển thị (mục 2.2), `fold` + bảng từ khóa môn/cấp học (mục 6.3), cắt `description` cho SEO.
- Endpoint: tên hiển thị; đăng, sửa, xóa, bản sửa; bình luận, sửa, xóa; Hữu ích; Đã giải quyết/câu trả lời hay nhất; theo dõi; "Bài của tôi"; danh sách + chi tiết công khai với lọc, tìm kiếm, sắp xếp, phân trang, bài Quy tắc luôn ở đầu trang 1.
- Giới hạn tốc độ (mục 11), quyền (mục 3), không rò rỉ riêng tư (mục 2.4).
- Test API cho toàn bộ trên (mục 16.1), gồm test migration chạy hai lần.

## Giai đoạn 2 — Kiểm duyệt (backend)

- Hàng đợi duyệt (bài mới và bản sửa), duyệt/từ chối (lý do bắt buộc), ẩn/khôi phục, gỡ bình luận, đăng Thông báo, sửa Quy tắc, khóa quyền, báo cáo và hàng đợi báo cáo.
- Thông báo trong ứng dụng (bảng `community_notifications`) cho các sự kiện ở mục 10; endpoint danh sách, số chưa đọc, đánh dấu đã đọc.
- Mọi thao tác admin gọi `audit(...)` với `action` có tiền tố `community.`.
- Test API tương ứng.

## Giai đoạn 3 — Giao diện công khai và người dùng

- Mục "Cộng đồng" trong `nav` của `main.tsx`, ngay sau "Môn học & kỳ thi", hiện cả với khách; chấm đỏ thông báo khi đã đăng nhập.
- Trang danh sách (`/community`), chi tiết (`/community/:id`), "Bài của tôi" (`/community/mine`), hộp thoại soạn/sửa bài có dòng lưu ý.
- Thành phần `ReadMore` ("Xem thêm"/"Thu gọn", đo phần bị cắt thực tế, truy cập được bằng bàn phím) dùng cho mọi bài và bình luận dài, kể cả bài Quy tắc.
- `AuthorLabel`, `CommentThread`, `GuestGate` (mời đăng nhập và quay lại đúng bài bằng `next`).
- Hộp thoại đặt tên hiển thị khi người dùng chưa có (mục 2.2).
- Trạng thái đang tải/lỗi/rỗng dùng thành phần có sẵn.

## Giai đoạn 4 — Giao diện admin

- Thêm tab "Cộng đồng" vào `Admin.tsx` và `AdminCommunity.tsx`: hàng đợi duyệt (có so sánh bản cũ/bản sửa, hiện họ tên thật và email người đăng), báo cáo, đăng Thông báo, sửa Quy tắc, khóa/mở quyền.
- Hiện số mục đang chờ trên tab.

## Giai đoạn 5 — SEO và Google

- `/app/community` vào `shared/seo-pages.json`; `/app/community/:id` làm giống `/app/news/:id` trong `server/seo.js`, `server/index.js`, `worker/index.js`.
- Bài không công khai → 404 + `noindex`. `sitemap.xml` chỉ có bài `approved`. JSON-LD chỉ dùng tên hiển thị.
- Cập nhật `test/seo.test.js`, `test/seo-routing.mjs`, `test/production-routing.mjs` (và `test/cloudflare-smoke.mjs` nếu phù hợp).

## Giai đoạn 6 — Hoàn thiện và kiểm chứng

- Thêm Playwright e2e theo mục 16.3 (khách, học sinh, từ chối, sửa bài, bình luận gia sư, admin, Xem thêm, Quy tắc luôn đầu, responsive/reduced motion).
- Kiểm tra giao diện thật ở 360, 390, 768, 1024, 1440 px bằng trình duyệt; kiểm tra bàn phím, tương phản, không tràn ngang.
- Cập nhật tài liệu: thêm mục Cộng đồng vào `docs/development-handoff.md` hoặc `docs/architecture.md` (ngắn gọn, đúng sự thật).

# 4. Tiêu chí nghiệm thu

Chỉ báo hoàn tất khi TẤT CẢ đúng:

- [ ] Khách xem được danh sách, bài, bình luận, lọc, tìm kiếm; không đăng/bình luận/Hữu ích/báo cáo được; bấm các nút đó được mời đăng nhập rồi quay lại đúng bài.
- [ ] Không có loại bài, không có ô chọn môn/cấp học/thẻ khi soạn bài; không có ảnh/đính kèm.
- [ ] Bài mới `pending`, chỉ tác giả và admin thấy; chỉ hiện công khai sau khi admin duyệt; từ chối bắt buộc có lý do và tác giả thấy lý do.
- [ ] Sửa bài đã đăng: bản cũ vẫn hiện công khai trong lúc bản sửa chờ duyệt; duyệt thì thay thế; từ chối thì giữ bản cũ.
- [ ] Bình luận hiện ngay; hai cấp; Hữu ích (không tự bấm); sửa/xóa của mình; Đã giải quyết và câu trả lời hay nhất.
- [ ] Nhãn đúng: `Tên hiển thị - Học sinh/Phụ huynh`; gia sư đã duyệt `Họ tên thật - Gia sư` (liên kết hồ sơ); gia sư chờ duyệt như học sinh; admin `Quản trị viên`. Nhãn tính live.
- [ ] Không có họ tên thật/email/id của học sinh hoặc phụ huynh trong bất kỳ phản hồi công khai nào (có test).
- [ ] Số điện thoại/email/link/Zalo bị chặn ở bài, bình luận và tên hiển thị (có test, kể cả cách viết có dấu cách/chấm).
- [ ] Tên hiển thị không chứa "admin"/"quản trị" (có và không dấu); đổi tên hiển thị không đặt hồ sơ gia sư về `pending`.
- [ ] Bài Quy tắc luôn ở đầu trang đầu, kể cả khi lọc/tìm; không ở trang 2; chỉ admin sửa; khách xem được; đúng một bài.
- [ ] "Xem thêm" hoạt động cho mọi bài/bình luận dài kể cả bài Quy tắc; dùng được bằng bàn phím.
- [ ] Lọc theo từ khóa không dấu ("anh van" ra bài chứa "Anh văn"); sắp xếp Mới nhất / Hữu ích; phân trang 20 bài.
- [ ] Admin: hàng đợi duyệt, ẩn/khôi phục, gỡ bình luận, đăng Thông báo, sửa Quy tắc, khóa quyền, xử lý báo cáo; tất cả có audit.
- [ ] Chấm đỏ thông báo trong ứng dụng cho kết quả duyệt và bình luận mới ở bài đang theo dõi; "Bài của tôi" hiện 3 trạng thái rõ ràng.
- [ ] Bài `approved` có trang SEO riêng; bài không công khai → 404 + noindex; sitemap đúng; JSON-LD chỉ có tên hiển thị.
- [ ] Migration chạy hai lần không lỗi, dữ liệu cũ nguyên vẹn, hoạt động ở cả server local lẫn Worker/Durable Object.
- [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` đều qua (nếu có test lỗi do môi trường, chạy lại và nêu rõ).
- [ ] Không có tính năng nào nằm trong danh sách [KHÔNG LÀM].

# 5. Điều không được làm

- Thêm loại bài, thẻ, ô chọn môn/cấp học khi soạn, gắn thẻ gia sư, ảnh, email/SMS, realtime, tắt-Google-theo-bài, huy hiệu/điểm, nhóm, tin nhắn riêng từ bài.
- Tự ý thay đổi hành vi đã [CHỐT] hoặc "cải thiện" thiết kế khi chưa hỏi.
- Sửa tay `index.html`, xóa CSDL, đổi/xóa bảng cũ, hoặc đụng vào bảng `posts` của Tin tức ngoài việc đọc mẫu.
- Thêm dòng đồng tác giả AI vào commit; đẩy nhánh hoặc mở PR khi chưa được yêu cầu.
- Báo kết quả không đúng sự thật: nếu có test lỗi, phần chưa kiểm tra, hoặc điều nào bị làm khác thiết kế, phải nói rõ.

# 6. Báo cáo cuối

Khi xong, trả lời bằng tiếng Việt, ngắn gọn, gồm:
1. Những gì đã làm theo từng giai đoạn (liệt kê file chính).
2. Kết quả thật của `typecheck`, `npm test`, `build`, `test:e2e`, và những gì đã tự kiểm tra bằng trình duyệt.
3. Danh sách các chi tiết [ĐỀ XUẤT] bạn đã áp dụng, để người dùng xác nhận hoặc đổi.
4. Mọi chỗ bạn làm khác thiết kế hoặc chưa làm được, và lý do.
5. Rủi ro còn lại (ví dụ: bộ lọc liên hệ không bắt hết, nội dung bài do JavaScript vẽ nên lập chỉ mục không được bảo đảm).
````
