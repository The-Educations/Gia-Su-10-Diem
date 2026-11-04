# Phí nền tảng thu từ gia sư — Thiết kế và prompt xây dựng

Tài liệu gồm hai phần:

- **Phần 1 — Kiến trúc, thiết kế và logic** của cơ chế thu phí gia sư.
- **Phần 2 — Prompt** để gửi cho Agent bắt đầu xây dựng.

Bối cảnh: sản phẩm là website tìm gia sư ([marketplace.md](marketplace.md)); hiện **chưa thu tiền qua website**, hai bên tự thống nhất học phí. Tài liệu này mô tả cách đơn vị thu phí nền tảng từ gia sư, đã bàn và chốt với chủ dự án ngày 03/11/2026.

Trạng thái: **chỉ là thiết kế, chưa có dòng code nào được viết.** Việc đăng ký hoạt động thương mại với cơ quan quản lý và các nội dung pháp lý/thuế do chủ dự án tự lo; chủ dự án quyết định thời điểm phát hành tính năng (mục 14).

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Chủ dự án đã đồng ý rõ ràng. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Chi tiết cần thiết để chạy được nhưng chưa được hỏi riêng. Cứ làm theo, nhưng nêu trong báo cáo cuối để chủ dự án xác nhận. |
| **[KHÔNG LÀM]** | Chủ dự án đã loại ra, hoặc chưa được duyệt. Không được thêm. |

---

# PHẦN 1 — KIẾN TRÚC, THIẾT KẾ VÀ LOGIC

## 1. Mục tiêu và nguyên tắc

### 1.1 Mục tiêu [CHỐT]

- **Học sinh/phụ huynh không trả phí.** Phí chỉ thu từ gia sư.
- Gia sư trả phí **theo kết quả**: chỉ khi thực sự dạy học sinh.
- Mức thấp để (1) gia sư thoải mái đặt học phí cao, (2) gia sư thấy nền tảng công bằng và gắn bó lâu hơn, (3) có nhiều gia sư thì học sinh vào tìm nhiều hơn.
- Tiền học phí **vẫn đi thẳng từ học sinh sang gia sư**; nền tảng không giữ và không chuyển hộ học phí.

### 1.2 Công thức phí [CHỐT]

> **Phí tháng của một gia sư = tổng, trên từng học sinh, của min(làm tròn 1.000đ của 2% × học phí học sinh đó trong tháng, 40.000đ).**

- Tính **riêng từng học sinh**; gia sư dạy nhiều học sinh thì cộng các khoản lại.
- Trần 40.000đ áp cho **một học sinh**, không phải cho cả gia sư. Chạm trần khi một học sinh mang về từ 2.000.000đ trong tháng.
- Học phí của một học sinh trong tháng = **tổng (học phí/giờ đã khóa lúc đặt × thời lượng/60) của các buổi tính phí** của học sinh đó với gia sư đó trong tháng [ĐỀ XUẤT: cách tính từ dữ liệu sẵn có].
- Làm tròn: mỗi dòng học sinh làm tròn đến 1.000đ (nửa trở lên làm tròn lên) [CHỐT]. Ví dụ 875.000đ → 17.500đ → 18.000đ.
- Tổng phí tháng **dưới 10.000đ thì cộng dồn sang tháng sau**, chưa phải chuyển [CHỐT].
- Học phí/giờ dùng giá ghi lúc đặt (bảng `bookings.rate` đã khóa giá), nên đổi giá hồ sơ sau đó không ảnh hưởng buổi cũ.

Ví dụ:

| Gia sư dạy | Học phí tháng mỗi học sinh | Phí mỗi học sinh | Tổng |
| --- | --- | --- | --- |
| 1 học sinh | 1.200.000 | 24.000 | 24.000 |
| 2 học sinh | 1.200.000 và 3.000.000 | 24.000 và 40.000 (trần) | 64.000 |
| 3 học sinh | 800.000, 1.500.000, 2.500.000 | 16.000, 30.000, 40.000 (trần) | 86.000 |

### 1.3 Danh sách [KHÔNG LÀM]

- **Giữ/ký quỹ học phí, trả 98% cho gia sư, ví tiền, nạp trước** [CHỐT: đã thử rồi bỏ, không đưa lại].
- Công tắc bật/tắt thu phí trên giao diện admin, tháng chạy thử, ưu đãi/miễn phí cho gia sư mới [CHỐT].
- Ngoại lệ cho tài khoản demo: mọi tài khoản đều bị tính phí [CHỐT].
- Hóa đơn điện tử [CHỐT: chủ dự án có cách riêng; không đưa vào].
- Hiệu ứng chúc mừng và video quy định [CHỐT: đội chủ dự án tự làm; chỉ xây bước tích đồng ý, mục 9].
- Miễn phí cho học sinh gia sư tự mang vào; đường dẫn giới thiệu [ĐỀ XUẤT: không làm].
- Trang công khai về phí, hiển thị phí cho học sinh/phụ huynh [CHỐT: chỉ công bố khi gia sư được duyệt và trong khu vực gia sư].
- Công cụ admin "miễn/giảm/điều chỉnh tùy ý" và xuất file kế toán [CHỐT: không chọn]. Chỉ có việc sửa/hủy một dòng khi xử lý khiếu nại (mục 11).
- Kiểm tra tự động học phí báo thấp trên nền tảng [CHỐT: xử lý bằng điều khoản và báo cáo của học sinh].
- Thanh toán phí qua cổng khác ngoài chuyển khoản ngân hàng (SePay chỉ nhận biết giao dịch).

## 2. Kiến trúc tổng quan

```
Học sinh/phụ huynh (tài khoản đặt lịch) ── Điểm danh / Đã học xong ──┐
Gia sư ───────────────────────────── Bắt đầu / Kết thúc ───────────┤
                                                                    ▼
                                         bookings (+ dấu thời gian điểm danh)
                                                                    │ phiên đánh giá buổi (job)
                                                                    ▼
                                         fee_lines  (1 dòng / buổi tính phí)
                                                                    │ job chốt ngày 1 hằng tháng
                                                                    ▼
                         fee_statements (1 bảng kê / gia sư / tháng, mã chuyển khoản riêng)
                              │  QR VietQR  ▲  webhook SePay
                              ▼             │
                  Gia sư chuyển khoản ──► tài khoản ngân hàng của đơn vị ──► fee_payments
                                                                    │ job theo ngày: tính tuổi nợ
                                                                    ▼
                              users.billing_state: ok → restricted → hidden → banned
```

- **Backend:** Express 5 + SQLite (local `node:sqlite`; production Cloudflare Worker + Durable Object). Mô-đun mới theo mẫu các mô-đun `community*.js`: `server/fees.js` (route), `server/fees-policy.js` (hằng số và hàm thuần), `server/fees-schema.js` (migration cộng thêm), `server/fees-jobs.js` (đánh giá buổi, chốt tháng, tuổi nợ).
- **Frontend:** React 19 + Vite. Trang gia sư **Phí nền tảng**, nút điểm danh trong Lịch học, thẻ admin **Phí**.
- **SePay:** chỉ phát hiện chuyển khoản vào tài khoản của đơn vị và gọi webhook; không giữ tiền ([sepay.vn](https://sepay.vn/bang-gia.html), [tài liệu webhook](https://developer.sepay.vn/vi/sepay-webhooks/bat-dau-nhanh)).
- **Email:** gửi qua Mailflare đã có (`createMailflareSender` ở `server/email-verification.js`); cần mở rộng cho thư thông báo chung.

## 3. Vòng đời một buổi học và điểm danh [CHỐT]

Hệ thống hiện chỉ có `bookings.status` ∈ `pending | accepted | declined | cancelled | completed`, gia sư tự bấm "hoàn thành" (xem `server/api.js` quanh dòng 610–640). Điểm danh hai phía bổ sung bằng chứng cho buổi tính phí.

### 3.1 Các nút

| Ai | Nút | Khi nào |
| --- | --- | --- |
| Gia sư | **Bắt đầu** | Buổi `accepted`, trong khung từ **15 phút trước đến 30 phút sau** giờ bắt đầu. |
| Học sinh / phụ huynh (tài khoản đã đặt buổi) | **Điểm danh** | Cùng khung giờ. |
| Gia sư | **Kết thúc** | Sau khi đã bấm Bắt đầu. |
| Học sinh / phụ huynh | **Đã học xong** | Sau khi đã Điểm danh. |

- Ngoài khung giờ thì nút bắt đầu/điểm danh bị khóa (tránh bấm bù).
- Phụ huynh thao tác thay con vì quyền đặt lịch dùng `role=student`.
- Dấu thời gian lưu ở máy chủ, không tin giờ của trình duyệt.

### 3.2 Khi nào buổi được tính phí

Một buổi **tính phí** khi **cả hai phía đã có mặt**: `tutor_started_at` và `student_checkin_at` cùng tồn tại, và học sinh không báo sai trong 48 giờ.

- Nếu học sinh đã điểm danh mà **quên bấm "Đã học xong"**, sau 48 giờ kể từ giờ kết thúc dự kiến, buổi **tự xác nhận** (trừ khi học sinh báo "buổi này không diễn ra") [CHỐT].
- Nếu **thiếu điểm danh** của một bên (gia sư bấm Bắt đầu nhưng học sinh không điểm danh, hoặc ngược lại) thì sau 48 giờ buổi chuyển **"cần xác minh"**: chưa tính phí cho đến khi admin quyết định [CHỐT].
- **Buổi bị hủy hoặc vắng** (`cancelled`, `declined`, không ai bấm gì) **không tính phí** [CHỐT].
- Học sinh báo "không diễn ra" trong 48 giờ → chuyển "cần xác minh".
- Gia sư không bấm Kết thúc nhưng cả hai đã có mặt thì vẫn tính phí (thời lượng tính theo buổi đã đặt, không theo phút thực dạy) [ĐỀ XUẤT].

### 3.3 Trạng thái điểm danh mới (`bookings.attendance`) [ĐỀ XUẤT]

`none` (mặc định) → `started` (một bên đã bấm) → `confirmed` (tính phí) | `needs_review` (cần xác minh) | `void` (admin quyết định không tính).

### 3.4 Nhắc nhở [CHỐT]

- Học sinh/phụ huynh được nhắc **điểm danh** (khi nút mở) và **bấm đã học xong** (sau buổi) **trong ứng dụng và bằng email**.
- Gia sư được nhắc bấm Bắt đầu/Kết thúc trong ứng dụng.
- Mỗi sự kiện gửi một email, không lặp lại [ĐỀ XUẤT].

### 3.5 Tương thích với luồng cũ [ĐỀ XUẤT]

- Nút Kết thúc của gia sư thay thế nút "hoàn thành" thủ công; đặt `status = completed` để luồng đánh giá hiện có tiếp tục chạy. Giữ endpoint cũ cho tương thích nhưng không dùng nó làm cơ sở tính phí.
- **Mốc áp dụng:** phí chỉ tính cho buổi có `starts_at` từ ngày phát hành trở đi (hằng số cấu hình `FEES_EFFECTIVE_FROM`, mục 14). Đây là mốc ngày, không phải công tắc bật/tắt.

## 4. Chốt tháng và bảng kê

### 4.1 Dòng phí và bảng kê [CHỐT trình tự; ĐỀ XUẤT chi tiết]

- Mỗi buổi tính phí tạo một **dòng phí** (booking, gia sư, học sinh, tiền học ghi lúc đặt, thời lượng).
- Tháng tính theo **tháng dương lịch, giờ Việt Nam (`Asia/Ho_Chi_Minh`)**, theo giờ bắt đầu buổi.
- **Ngày 1 hằng tháng (00:00 giờ VN)** hệ thống chốt phí tháng trước: gom dòng theo từng học sinh, áp công thức mục 1.2, tạo **bảng kê** cho từng gia sư có phí > 0, sinh **mã chuyển khoản** riêng và hạn trả **10 ngày** (hết ngày 10) [CHỐT].
- Dòng đang cần xác minh hoặc đang khiếu nại **không nằm trong số phải trả** cho đến khi xử lý xong. Dòng được xử lý muộn sẽ vào **bảng kê kế tiếp** với ghi chú "bổ sung" và ngày buổi học gốc [ĐỀ XUẤT].
- Tổng dưới 10.000đ: bảng kê ở trạng thái `carried`, cộng dồn sang tháng sau [CHỐT].

### 4.2 Phí tạm tính [CHỐT]

Trang **Phí nền tảng** của gia sư luôn hiện phí tạm tính của tháng đang chạy, theo từng học sinh (số buổi, tiền học, phí đến hiện tại). Số này tính từ dữ liệu sống, không lưu cứng.

## 5. Thu tiền qua SePay

- Mỗi bảng kê có **mã chuyển khoản duy nhất** (ví dụ `PHI` + mã ngắn của gia sư + `YYYYMM`) [ĐỀ XUẤT: định dạng], kèm mã QR VietQR có sẵn số tiền và nội dung.
- Gia sư chuyển khoản vào tài khoản ngân hàng của **đơn vị đã đăng ký** (tài khoản này chủ dự án chuẩn bị). Không nhận về tài khoản cá nhân.
- **Webhook** `POST /api/sepay/webhook`: xác thực khóa/API key cấu hình trong SePay; chỉ xử lý giao dịch tiền vào; **chống trùng** theo mã giao dịch của SePay (SePay gọi lại tối đa 7 lần trong 5 giờ nếu không nhận phản hồi thành công); trả phản hồi đúng quy ước để SePay không gọi lại. Đối chiếu tên trường và cách xác thực với tài liệu SePay hiện hành trước khi viết.
- Khớp giao dịch với bảng kê theo mã chuyển khoản trong nội dung:
  - Đủ hoặc dư tiền → bảng kê `paid`; phần dư được **ghi nợ có** sang bảng kê kế tiếp [ĐỀ XUẤT].
  - Thiếu tiền → ghi nhận một phần, bảng kê vẫn còn nợ phần thiếu.
  - Không khớp mã → lưu thành giao dịch **chưa khớp** để admin gán thủ công (mục 12).
- Mọi giao dịch lưu bản ghi gốc để đối soát.

## 6. Tuổi nợ và xử lý quá hạn [CHỐT]

Tính từ **ngày chốt (ngày 1)** của bảng kê chưa trả đầy đủ có tiền đang phải trả:

| Mốc | Trạng thái `billing_state` | Hiệu lực |
| --- | --- | --- |
| Từ ngày 1 đến hết ngày 10 | `ok` | Hạn trả. Nhắc trước hạn. |
| **Từ ngày 11** | `restricted` | Không nhận yêu cầu mới (không tạo được yêu cầu mới tới gia sư này; không nhận thêm yêu cầu đang chờ). Buổi đã xác nhận vẫn diễn ra. |
| **Từ ngày 31** | `hidden` | Giảm đề xuất: **ẩn khỏi danh sách và tìm kiếm** gia sư. |
| **Từ ngày 61** | `banned` | **Ban**: khóa chức năng. Vẫn vào được **trang Phí** để trả, và các việc cần cho buổi đã xác nhận (điểm danh, nhắn tin của buổi đó, đăng xuất). |

- **Trả đủ thì mở lại ngay** về `ok` (khi không còn bảng kê nợ quá hạn).
- Buổi đã xác nhận trong tương lai **vẫn diễn ra bình thường và vẫn tính phí** khi gia sư bị ban [CHỐT].
- Ban **không** dùng `users.status = 'suspended'` (vì suspend thu hồi phiên đăng nhập, gia sư không vào trả được). Dùng cột riêng `billing_state` [ĐỀ XUẤT].
- **Tài khoản còn nợ không xóa được** (kể cả còn phí tháng đang chạy chưa chốt) [CHỐT].
- Quá hạn tính theo số tiền **không đang khiếu nại** (mục 11).
- Gia sư bị admin tạm khóa vẫn bị tính phí và vẫn chạy tuổi nợ [ĐỀ XUẤT].

## 7. Nhắc phí và thông báo [CHỐT]

Trong ứng dụng (chấm đỏ + thẻ thông báo) **và email**:

| Sự kiện | Gửi cho gia sư |
| --- | --- |
| Chốt bảng kê (ngày 1) | Tổng phí, hạn trả, mã QR |
| Trước hạn (ngày 8) | Nhắc |
| Quá hạn (ngày 11) | Thông báo bị tạm không nhận yêu cầu mới |
| Ngày 31 | Thông báo bị ẩn khỏi tìm kiếm |
| Ngày 61 | Thông báo bị ban và cách trả |
| Đã nhận tiền | Xác nhận đã trả |
| Khiếu nại đã xử lý | Kết quả |

Mỗi email một sự kiện, tiếng Việt có dấu, theo khung email hiện có; không có liên kết lạ, chỉ liên kết về `giasudiem10.online` [ĐỀ XUẤT].

## 8. Khu vực gia sư: trang "Phí nền tảng" [CHỐT thành phần]

1. **Tháng này:** phí tạm tính theo từng học sinh.
2. **Bảng kê:** danh sách theo tháng, trạng thái (chưa chốt, chờ trả, đã trả, cộng dồn, quá hạn), từng dòng, mã QR và nội dung chuyển khoản, nút **Khiếu nại** trên từng dòng.
3. **Điều khoản phí:** nội dung điều khoản và trạng thái đồng ý.
4. Dải cảnh báo khi `billing_state` ≠ `ok`.

Chính sách "2%, tối đa 40.000đ mỗi học sinh" được công bố **khi gia sư đăng ký/được duyệt và trong khu vực gia sư** [CHỐT]. Học sinh không thấy gì về phí.

## 9. Đồng ý điều khoản phí [CHỐT phần tích đồng ý]

- Hệ thống có **bước tích "Đồng ý điều khoản phí"** và lưu `phiên bản điều khoản` + thời điểm đồng ý.
- Gia sư chưa đồng ý bản điều khoản hiện hành thì **không nhận yêu cầu mới**; hồ sơ vẫn xem được [ĐỀ XUẤT].
- Áp dụng cho gia sư mới (khi được duyệt) **và cả gia sư đã duyệt từ trước** (ở lần đăng nhập kế tiếp) [ĐỀ XUẤT].
- Hiệu ứng chúc mừng và video quy định do đội chủ dự án tự làm; chúng chỉ cần gắn vào bước này. Nội dung điều khoản/cảnh báo nên được luật sư duyệt (xem mục 14).

## 10. Học phí báo thấp trên nền tảng [CHỐT]

Gia sư có thể ghi học phí thấp trên nền tảng và thu thật cao ngoài nền tảng. Cách xử lý duy nhất: điều khoản ghi rõ học phí trên nền tảng phải là giá thật; học sinh có nút báo cáo (dùng luồng báo cáo/hỗ trợ đã có); admin xem xét và có thể cảnh cáo hoặc khóa. **Không** xây công cụ kiểm tra tự động.

## 11. Khiếu nại phí [CHỐT]

- Trên từng dòng bảng kê có nút **Khiếu nại** (kèm lý do), trong **7 ngày** kể từ khi chốt [ĐỀ XUẤT: số ngày].
- Dòng đang khiếu nại **tạm không tính** vào số phải trả và vào tuổi nợ.
- Admin xem bằng chứng (dấu thời gian điểm danh, tin nhắn buổi học mà admin vốn đã có quyền đọc) rồi **giữ nguyên** hoặc **hủy dòng** (có lý do, có nhật ký). Hủy dòng tính lại bảng kê; nếu đã trả dư thì ghi nợ có sang tháng sau.

## 12. Công cụ admin [CHỐT]

Thẻ **Phí** trong khu admin:

1. **Bảng theo dõi phí:** theo tháng, theo gia sư: phải trả, đã trả, còn nợ, hạn, `billing_state`, số khiếu nại; lọc theo trạng thái; tổng thu.
2. **Đánh dấu đã trả thủ công:** gán giao dịch **chưa khớp** vào đúng bảng kê, hoặc ghi nhận một khoản thu thủ công (số tiền, mã tham chiếu ngân hàng, ghi chú); ghi nhật ký.
3. **Buổi cần xác minh:** hàng đợi buổi thiếu điểm danh hoặc bị báo sai; admin chọn tính phí hoặc không tính (`confirmed` / `void`) kèm ghi chú.
4. **Khiếu nại:** hàng đợi như mục 11.

Mọi thao tác ghi vào nhật ký (hàm `audit` có sẵn). Không có xuất file kế toán, không có sửa số tiền tùy ý.

## 13. Mô hình dữ liệu [ĐỀ XUẤT]

Migration cộng thêm, idempotent (mẫu `PRAGMA table_info` rồi `ALTER TABLE`; `CREATE TABLE IF NOT EXISTS`), trong `migrateDatabase` / `fees-schema.js`, chạy được ở cả Node và Worker.

- `bookings`: thêm `tutor_started_at`, `tutor_ended_at`, `student_checkin_at`, `student_done_at`, `student_reported_at`, `attendance TEXT NOT NULL DEFAULT 'none'`, `attendance_note TEXT`.
- `users`: thêm `billing_state TEXT NOT NULL DEFAULT 'ok'`, `fee_terms_version INTEGER`, `fee_terms_accepted_at TEXT`.
- `fee_lines (id, booking_id UNIQUE, tutor_id, student_id, lesson_starts_at, base_amount, status, statement_id, void_reason, created_at)`; `status` ∈ `pending | included | complaint | void`.
- `fee_statements (id, tutor_id, period 'YYYY-MM', closed_at, due_at, total_fee, credit_applied, amount_due, status, pay_code UNIQUE, paid_at)`; `status` ∈ `open | closed | carried | paid`.
- `fee_payments (id, tutor_id, statement_id NULL, amount, sepay_tx_id UNIQUE, content, received_at, matched_by 'auto|manual', raw)`; giao dịch chưa khớp có `statement_id` rỗng.
- `fee_complaints (id, line_id, tutor_id, reason, status, resolved_by, resolution, created_at, resolved_at)`.
- `fee_terms_acceptances (user_id, version, accepted_at)`.
- Hằng số trong `fees-policy.js`: `RATE=0.02`, `CAP=40000`, `ROUND=1000`, `MIN_PAYABLE=10000`, `DUE_DAYS=10`, `LADDER=[11,31,61]`, `COMPLAINT_DAYS=7`, `VERIFY_HOURS=48`, `WINDOW_BEFORE=15`, `WINDOW_AFTER=30`, `FEES_EFFECTIVE_FROM`.

Bảng cũ (bookings, users) được giữ nguyên dữ liệu. Không xóa/đổi tên bảng cũ.

## 14. API [ĐỀ XUẤT]

**Điểm danh (cần đăng nhập, đúng chủ buổi)**

- `POST /api/bookings/:id/start`, `/end` (gia sư); `/checkin`, `/done`, `/report` (tài khoản đặt lịch). Kiểm tra khung giờ, trạng thái và quyền phía máy chủ.

**Gia sư (`auth("tutor")`)**

- `GET /api/tutor/fees/current` (tạm tính), `GET /api/tutor/fees/statements`, `GET /api/tutor/fees/statements/:id`.
- `POST /api/tutor/fees/lines/:id/complaint`.
- `GET/POST /api/tutor/fees/terms` (xem/đồng ý).

**SePay:** `POST /api/sepay/webhook` (xác thực khóa; không dùng phiên đăng nhập).

**Admin (`auth("admin")`)**

- `GET /api/admin/fees/overview`, `/payments/unmatched`, `/attendance/review`, `/complaints`.
- `POST` gán giao dịch chưa khớp, ghi nhận thu thủ công, quyết định buổi cần xác minh, xử lý khiếu nại.

**Ràng buộc nghiệp vụ phải kiểm tra ở máy chủ**

- Gia sư `restricted/hidden/banned` hoặc chưa đồng ý điều khoản không nhận được yêu cầu mới (kiểm tra ở API tạo yêu cầu/duyệt yêu cầu); `hidden` bị loại khỏi `tutorRows` công khai (`server/api.js` quanh dòng 205); `banned` chỉ gọi được nhóm API cho phép ở mục 6.
- Xóa tài khoản bị chặn khi còn nợ (`server/account-deletion.js`).
- Không bao giờ để lộ phí/bảng kê cho học sinh hoặc khách.

**Công việc định kỳ** (`fees-jobs.js`): đánh giá buổi (xác nhận/cần xác minh) sau 48 giờ; chốt tháng ngày 1; cập nhật tuổi nợ và gửi thông báo; dùng cơ chế định kỳ phù hợp từng môi trường (Cloudflare cron trigger hoặc Durable Object alarm trên Worker; bộ hẹn giờ tương đương khi chạy local). **Xác minh cơ chế hiện có của repo trước** (`worker/index.js`, `wrangler.jsonc`) và dùng lại nếu có.

## 15. Giao diện [ĐỀ XUẤT]

- Gia sư: Lịch học thêm nút **Bắt đầu / Kết thúc**; trang **Phí nền tảng** (mục 8); dải cảnh báo theo `billing_state`.
- Học sinh/phụ huynh: Lịch học thêm nút **Điểm danh / Đã học xong / Báo không diễn ra**, chấm đỏ nhắc.
- Admin: thẻ **Phí** (mục 12).
- Tiếng Việt có dấu; không tràn ngang ở 360–1440 px; trạng thái tải/lỗi/trống rõ; hỗ trợ bàn phím và `prefers-reduced-motion`; số tiền hiển thị theo định dạng VND.

## 16. Kiểm thử cần có

### 16.1 Hàm thuần và API (`node --test`, theo `test/*.test.js`)

- Công thức: ví dụ ở mục 1.2, làm tròn nửa lên, trần 40.000đ theo từng học sinh, ngưỡng cộng dồn 10.000đ, nhiều học sinh cộng dồn, tháng không có buổi.
- Điểm danh: khung giờ −15/+30 phút, bấm sai thời điểm bị từ chối, sai chủ buổi bị từ chối, phụ huynh bấm thay con; tự xác nhận sau 48 giờ khi đã điểm danh; thiếu điểm danh → cần xác minh; học sinh báo sai → cần xác minh; hủy/vắng không tính.
- Chốt tháng: múi giờ VN và ranh giới tháng, dòng bổ sung, bảng kê và mã chuyển khoản duy nhất, chạy lại job không tạo trùng.
- SePay: chống trùng giao dịch, khớp mã, thừa/thiếu tiền, không khớp → chưa khớp, khóa xác thực sai bị từ chối, giao dịch tiền ra bị bỏ qua.
- Tuổi nợ: mốc ngày 11/31/61 chính xác, trả đủ mở lại ngay, dòng khiếu nại không tính vào nợ, buổi đã xác nhận vẫn diễn ra khi banned, banned vẫn vào được trang Phí.
- Quyền: học sinh/khách không thấy phí; gia sư chỉ thấy phí của mình; admin-only endpoint trả 403 cho người khác.
- Xóa tài khoản bị chặn khi còn nợ; điều khoản chưa đồng ý chặn yêu cầu mới.
- Mốc `FEES_EFFECTIVE_FROM`: buổi trước mốc không tính.
- **Migration:** chạy hai lần không lỗi; dữ liệu cũ nguyên vẹn.

### 16.2 End-to-end (Playwright, theo `test/e2e/*.spec.ts`)

1. Học sinh đặt lịch → gia sư duyệt → đến giờ cả hai bấm → buổi tính phí → thấy trong Phí tạm tính.
2. Thiếu điểm danh → "cần xác minh" → admin quyết định.
3. Chốt tháng → bảng kê, QR; giả lập webhook → bảng kê đã trả.
4. Khiếu nại một dòng → admin hủy → bảng kê tính lại.
5. Quá hạn 11/31/61 ngày (đẩy thời gian bằng hàm test) → hạn chế, ẩn, ban; trả xong mở lại.
6. Responsive 360 và 1440 px; không lỗi console.

### 16.3 Lệnh phải chạy trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra.

## 17. Phụ thuộc, rủi ro và việc để sau

| Mục | Trạng thái |
| --- | --- |
| Đăng ký hoạt động thương mại và thông báo/đăng ký website thương mại điện tử | Chủ dự án tự làm trước khi phát hành. Luật Thương mại điện tử 2025 đã có hiệu lực từ 01/07/2026 và phân loại cả nền tảng trung gian. |
| Phát hành tính năng | Chủ dự án quyết định. `FEES_EFFECTIVE_FROM` đặt đúng ngày phát hành. Không phát hành khi đơn vị chưa đăng ký và chưa có tài khoản ngân hàng của đơn vị nhận tiền. |
| Công bố điều kiện giao dịch/mức phí | Chủ dự án chọn chỉ công bố khi gia sư được duyệt và trong khu gia sư. Cần luật sư xác nhận luật có buộc công bố công khai hay không. |
| Câu chữ cảnh báo trong video quy định | Nên nhờ luật sư duyệt; tránh nói quá mức; cách an toàn hơn là "nền tảng sẽ thực hiện các biện pháp thu hồi theo quy định pháp luật". |
| Hóa đơn và thuế của khoản phí | Chủ dự án có cách riêng; ngoài phạm vi tài liệu này. |
| Xác thực ngày/số liệu | Mức phí 2% và 40.000đ là giả định kinh doanh, chưa có dữ liệu thị trường Việt Nam đủ tin cậy; nên đo sau khi chạy. |
| Rò rỉ ngoài nền tảng | Buổi học hai bên tự thỏa thuận ngoài nền tảng không thấy được và không thu được; chấp nhận vì phí thấp. |
| Hồ sơ thành viên, Cộng đồng | Không liên quan, xem [community-profile.md](community-profile.md). |

---

# PHẦN 2 — PROMPT CHO AGENT XÂY DỰNG

> Sao chép nguyên khối bên dưới gửi cho Agent. Prompt giả định Agent được mở trong thư mục dự án và có tài liệu này ở `docs/tutor-fees.md`.

````text
Bạn là kỹ sư phần mềm cấp cao, làm việc trong repo "Gia Sư 10 Điểm" (nền tảng tìm gia sư của Việt Nam). Nhiệm vụ: xây dựng cơ chế THU PHÍ NỀN TẢNG TỪ GIA SƯ theo đúng bản thiết kế đã được chủ dự án chốt.

# 0. Nguồn sự thật

- Thiết kế đầy đủ: `docs/tutor-fees.md` (Phần 1). Đọc toàn bộ trước khi viết bất kỳ dòng code nào.
- Đọc thêm: `docs/marketplace.md` (phạm vi, quy tắc lịch học/đặt lịch), `docs/architecture.md`, `docs/development-handoff.md`, `docs/community-implementation.md` (mẫu mô-đun cộng thêm).
- Nhãn trong tài liệu:
  - [CHỐT]: chủ dự án đã đồng ý, KHÔNG được tự ý đổi.
  - [ĐỀ XUẤT]: làm theo, nhưng ghi lại trong báo cáo cuối để chủ dự án xác nhận.
  - [KHÔNG LÀM]: tuyệt đối không thêm (mục 1.3).
- Nếu tài liệu mâu thuẫn với mã nguồn thực tế, hoặc gặp điểm chưa rõ mà không có nhãn [ĐỀ XUẤT] để dựa vào, HÃY DỪNG LẠI VÀ HỎI chủ dự án thay vì đoán. Chủ dự án nhiều lần nhấn mạnh: không tự thêm tính năng họ chưa yêu cầu (ví dụ: đã bị từ chối công tắc bật/tắt và tháng chạy thử do chính trợ lý tự đề ra).

# 1. Bối cảnh dự án (đã xác minh trong repo)

- Backend: Express 5 + SQLite. Local dùng `node:sqlite` (`server/local-db.js`); production dùng Cloudflare Worker + Durable Object SQLite (`worker/index.js` bọc cùng `createApi`). Mọi thay đổi CSDL phải chạy được ở CẢ HAI.
- Migration nằm trong `migrateDatabase(db)` ở `server/db.js` và `server/community-schema.js` (mẫu `PRAGMA table_info` rồi `ALTER TABLE`; `CREATE TABLE IF NOT EXISTS`). Chỉ CỘNG THÊM, idempotent; không xóa/đổi tên bảng cũ; không xóa file CSDL để sửa schema.
- API: `server/api.js` (`createApi`, `auth(...)`, `audit(...)`), các mô-đun cộng đồng `server/community*.js` đăng ký route theo mẫu `registerX(app, db, auth, audit)`. Dùng `transaction(db, fn)`, `all/one/run`, `z/text` (`server/validation.js`). Lỗi trả `{ error }` tiếng Việt.
- Lịch học: bảng `slots` (có `duration_minutes`), `bookings` (`rate` khóa giá lúc đặt, `status` ∈ pending|accepted|declined|cancelled|completed), chuyển trạng thái ở `server/api.js` quanh dòng 610–640; còn có `offers`, `weekly_requests` (lịch tuần). Đọc kỹ các luồng này để xác định đúng thời lượng và học phí mỗi buổi trước khi tính phí.
- Danh sách gia sư công khai: `tutorRows()` ở `server/api.js` quanh dòng 205 (`t.status='approved' AND u.status='active'`). Gia sư bị `hidden/banned` phải bị loại ở đây.
- Email: `createMailflareSender` ở `server/email-verification.js` (Mailflare). Hiện có vài loại thư cố định; cần thêm đường gửi thư thông báo chung mà không phá các loại cũ.
- Xóa tài khoản: `server/account-deletion.js`. Tài khoản `suspended` bị thu hồi phiên đăng nhập, vì vậy KHÔNG dùng `suspended` để ban gia sư nợ phí; dùng cột `billing_state` riêng.
- Frontend: React 19 + Vite + react-router-dom 7 (basename `/app`), shadcn + Animate UI; `app/src/main.tsx` (nav, Routes, `Require`), `app/src/pages/Bookings.tsx`, `Dashboard.tsx`, `Admin.tsx` (các tab quản trị), `app/src/lib/api.tsx`, `app/src/lib/types.ts`.
- `index.html` ở thư mục gốc là FILE SINH RA; không sửa tay.
- Phạm vi dự án: chỉ tìm gia sư. Không quiz/đáp án, không video, không ví tiền.
- Quy ước repo: giao diện tiếng Việt có dấu; không thêm AI co-author vào commit (xem `docs/development-handoff.md`).

# 2. Cách làm việc

1. Làm trên nhánh hiện tại (hoặc nhánh con nếu thấy cần). Không đẩy lên remote và không mở PR trừ khi chủ dự án yêu cầu. Commit nhỏ, rõ ràng.
2. Làm theo các giai đoạn ở mục 3, mỗi giai đoạn một commit. Sau mỗi giai đoạn chạy kiểm tra liên quan và sửa đến khi sạch.
3. Trước giai đoạn 1, viết ngắn gọn kế hoạch (file sẽ tạo/sửa, rủi ro). Chỉ dừng hỏi khi gặp mâu thuẫn hoặc điểm mơ hồ nêu ở mục 0.
4. Chạy thử thật: khởi động server, thao tác qua trình duyệt cho các luồng chính, kiểm tra console/network. Không báo "xong" khi chưa chạy.
5. Viết code đọc như phần mã xung quanh: cùng cách đặt tên, cùng mật độ chú thích, dùng lại tiện ích có sẵn. Không thêm thư viện mới nếu không thật sự cần.
6. SePay: đối chiếu cấu trúc webhook, cách xác thực và định dạng phản hồi với tài liệu hiện hành tại developer.sepay.vn trước khi viết (không đoán tên trường).

# 3. Các giai đoạn

## Giai đoạn 1 — Cấu hình, dữ liệu và công thức
- `server/fees-policy.js`: hằng số (RATE, CAP, ROUND, MIN_PAYABLE, DUE_DAYS, LADDER, COMPLAINT_DAYS, VERIFY_HOURS, WINDOW_BEFORE/AFTER, `FEES_EFFECTIVE_FROM`) và hàm thuần: tính phí từng học sinh, làm tròn, cộng dồn, ranh giới tháng giờ VN, tính tuổi nợ.
- `server/fees-schema.js`: migration cộng thêm theo mục 13, nối vào `migrateDatabase`.
- Test hàm thuần theo mục 16.1, test migration chạy hai lần.

## Giai đoạn 2 — Điểm danh
- Cột điểm danh trên `bookings`, endpoint start/end/checkin/done/report với kiểm tra khung giờ, quyền, trạng thái.
- Job đánh giá buổi: tự xác nhận / cần xác minh / không tính theo mục 3.2; tạo `fee_lines`.
- Nút trên Lịch học cho gia sư và học sinh/phụ huynh; tương thích luồng hoàn thành/đánh giá cũ; mốc `FEES_EFFECTIVE_FROM`.
- Nhắc nhở trong ứng dụng và email cho học sinh/phụ huynh.

## Giai đoạn 3 — Chốt tháng, bảng kê, khiếu nại
- Job chốt ngày 1, `fee_statements`, mã chuyển khoản, cộng dồn dưới 10.000đ, dòng bổ sung.
- Phí tạm tính; trang **Phí nền tảng** của gia sư; khiếu nại từng dòng (7 ngày), loại khỏi nợ khi đang khiếu nại.

## Giai đoạn 4 — SePay và đối soát
- Webhook với xác thực khóa, chống trùng, khớp theo mã, thừa/thiếu, giao dịch chưa khớp; QR VietQR cho bảng kê.
- Admin gán giao dịch chưa khớp, ghi nhận thu thủ công (có nhật ký).

## Giai đoạn 5 — Tuổi nợ, điều khoản, thông báo
- `billing_state` theo mốc 11/31/61 ngày; chặn yêu cầu mới, ẩn khỏi `tutorRows`, ban nhưng vẫn vào được trang Phí; mở lại ngay khi trả đủ.
- Chặn xóa tài khoản khi còn nợ.
- Bước tích Đồng ý điều khoản phí (phiên bản + thời điểm); chặn yêu cầu mới nếu chưa đồng ý; áp dụng cả gia sư đã duyệt từ trước.
- Thông báo trong ứng dụng và email theo bảng ở mục 7.

## Giai đoạn 6 — Admin, kiểm thử toàn bộ, tài liệu
- Thẻ **Phí** trong Admin: theo dõi, giao dịch chưa khớp, buổi cần xác minh, khiếu nại.
- Viết đủ test theo mục 16; chạy lại toàn bộ.
- Cập nhật `docs/marketplace.md` (quy tắc "Thanh toán" và phạm vi) và thêm `docs/tutor-fees-implementation.md` (phần đã làm, [ĐỀ XUẤT] đã áp dụng, kết quả kiểm chứng).

# 4. Ràng buộc bắt buộc

- Không làm bất cứ thứ gì trong mục 1.3 [KHÔNG LÀM]: không giữ tiền/ví/nạp trước, không công tắc bật/tắt hay tháng chạy thử, không ưu đãi miễn phí, không ngoại lệ tài khoản demo, không hóa đơn, không hiệu ứng chúc mừng/video, không hiển thị phí cho học sinh, không công cụ chỉnh số tiền tùy ý, không xuất file kế toán.
- Học sinh/phụ huynh và khách không bao giờ thấy phí hay bảng kê.
- Không dùng `users.status='suspended'` để ban.
- Số tiền lưu là số nguyên VND; mọi mốc ngày theo giờ Việt Nam.
- Webhook chỉ xử lý tiền vào, idempotent.
- Không sửa tay `index.html`. Không thêm giao diện tiếng Anh. Không bỏ qua hook/kiểm tra để "cho qua".

# 5. Kiểm chứng trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Thêm: chạy local, duyệt tay các luồng ở mục 16.2 trên trình duyệt (desktop và 360 px), kiểm tra console/network không lỗi; giả lập webhook SePay bằng dữ liệu mẫu đúng định dạng tài liệu; nếu có thể, chạy smoke Cloudflare local để xác nhận migration và job định kỳ trên Worker. Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra.

# 6. Báo cáo cuối (bằng tiếng Việt, ngắn gọn)

1. Đã làm gì theo từng giai đoạn; các file chính.
2. Danh sách mọi chi tiết [ĐỀ XUẤT] đã áp dụng, để chủ dự án xác nhận.
3. Điểm nào lệch với tài liệu và vì sao.
4. Kết quả kiểm tra (lệnh nào đạt, lệnh nào không, cái gì chưa kiểm tra).
5. Việc chủ dự án còn phải tự làm trước khi phát hành: đăng ký thương mại, tài khoản ngân hàng của đơn vị nhận tiền, cấu hình SePay (webhook, khóa), đặt `FEES_EFFECTIVE_FROM`, nội dung điều khoản/hiệu ứng/video, luật sư duyệt câu chữ.
````
