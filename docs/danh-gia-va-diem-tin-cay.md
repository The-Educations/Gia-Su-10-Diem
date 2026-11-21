# Đánh giá gia sư và điểm tin cậy — Thiết kế và prompt xây dựng

Tài liệu gồm hai phần:

- **Phần 1 — Logic và thiết kế**: chức năng chạy như thế nào, từ lúc học sinh học xong một buổi đến lúc số sao hiện trên hồ sơ gia sư.
- **Phần 2 — Prompt** để gửi cho Agent triển khai.

Bối cảnh: hiện mỗi cặp học sinh–gia sư có **một đánh giá công khai**, viết được sau buổi hoàn thành đầu tiên ([loi-04-danh-gia-gan-voi-buoi-hoc.md](loi-04-danh-gia-gan-voi-buoi-hoc.md)). Điểm trên hồ sơ là trung bình cộng các đánh giá đó. Tài liệu này thay bằng hai lớp đánh giá (sau từng buổi và cuối khóa) cộng một công thức điểm tin cậy quy về thang 5 sao. Đã bàn và chốt với chủ dự án ngày 21/11/2026.

Trạng thái: **bản thảo thiết kế, chưa có dòng code nào được viết.**

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Chủ dự án đã đồng ý rõ ràng. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Chi tiết cần để chạy được nhưng chưa được hỏi riêng. Cứ làm theo, nêu trong báo cáo cuối để chủ dự án xác nhận. |
| **[KHÔNG LÀM]** | Đã loại ra hoặc chưa được duyệt. Không được thêm. |

---

# PHẦN 1 — LOGIC VÀ THIẾT KẾ

## 1. Mục tiêu và nguyên tắc

### 1.1 Mục tiêu [CHỐT]

1. Đánh giá gắn với **việc học thật**: chấm sau từng buổi đã hoàn thành, và chấm tổng kết khi khóa học kết thúc.
2. Số sao trên hồ sơ là **điểm tin cậy** tính theo công thức, không phải trung bình cộng thô. Gia sư ít đánh giá không thể nhảy lên 5.0 chỉ nhờ một lượt chấm.
3. Điểm phản ánh cả **chất lượng** (học sinh chấm) lẫn **độ giữ hẹn** (gia sư có đến dạy đúng lịch không).
4. Một học sinh không thể một mình kéo điểm của gia sư lên hay xuống.

### 1.2 Tóm tắt luồng

```
Buổi học hoàn thành
  └─> Học sinh chấm nhanh buổi đó (1–5 sao + nhãn)   ── riêng tư, chỉ vào công thức
Khóa học kết thúc (hết ngày, hoặc bấm "Kết thúc khóa sớm")
  └─> Học sinh viết đánh giá cuối khóa (sao + nhận xét) ── công khai
Mọi đánh giá + lịch sử giữ hẹn của gia sư
  └─> Công thức điểm tin cậy ──> số sao trên thẻ gia sư và hồ sơ
```

### 1.3 Danh sách [KHÔNG LÀM]

- Không công khai nội dung đánh giá từng buổi, không cho gia sư thấy ai chấm buổi nào mấy sao.
- Không có nhãn tiêu cực.
- Không đưa câu "Có muốn học tiếp không?" vào công thức hay hiển thị công khai.
- Không cho admin sửa điểm bằng tay.
- Không gửi email mời đánh giá (chờ Lỗi 1 — thông báo email, đang hoãn).
- Không đụng đến phí nền tảng ([tutor-fees.md](tutor-fees.md)), không làm điểm danh hai chiều, hàng "cần xác minh" hay chống gian lận đầy đủ.
- Không làm tính năng gia sư trả lời đánh giá, không hàng duyệt đánh giá, không gỡ đánh giá (thuộc Lỗi 5).
- Không lưu sẵn điểm vào bảng riêng, không thêm job chạy định kỳ.

## 2. Khái niệm

| Khái niệm | Định nghĩa |
| --- | --- |
| **Buổi học** | Một dòng trong `bookings`. |
| **Buổi hoàn thành** | `bookings.status = 'completed'`. |
| **Khóa học** [CHỐT] | Một đề nghị học `offers.kind = 'course'` đã được gia sư nhận (`accepted_at` có giá trị). |
| **Học thử** [CHỐT] | `offers.kind = 'trial'`. Chỉ có đánh giá từng buổi, **không** có đánh giá cuối khóa. |
| **Yêu cầu học hằng tuần (cũ)** [CHỐT] | `weekly_requests`. Không có đánh giá cuối khóa. |
| **Buổi lẻ kiểu cũ** [ĐỀ XUẤT] | Buổi có `offer_id IS NULL` (luồng đặt từng khung giờ trước đây). Giữ nguyên luồng đánh giá theo cặp hiện có (mục 5.4) để không ai mất quyền đánh giá. |
| **Người chấm** [CHỐT] | Tài khoản đã đặt buổi học, tức `bookings.student_id` (học sinh hoặc phụ huynh). |
| **Cặp** | Một học sinh và một gia sư (`student_id`, `tutor_id`). |

## 3. Đánh giá từng buổi [CHỐT]

### 3.1 Khi nào được chấm

- Buổi đã ở trạng thái hoàn thành.
- Trong vòng **14 ngày** kể từ giờ kết thúc buổi học (`starts_at + duration_minutes`). Lý do dùng giờ kết thúc: hệ thống chưa lưu thời điểm bấm "hoàn thành".
- Mỗi buổi chấm **một lần**. Sửa được trong **24 giờ** kể từ lúc chấm, sau đó khóa.
- Được phép bỏ qua: không chấm cũng không sao, không ảnh hưởng gì.

### 3.2 Nội dung

- Sao 1–5 (bắt buộc khi chấm).
- Tối đa **3 nhãn** trong bộ cố định, đều là nhãn tích cực:

| Mã | Nhãn hiển thị |
| --- | --- |
| `de_hieu` | Dễ hiểu |
| `kien_nhan` | Kiên nhẫn |
| `nhiet_tinh` | Nhiệt tình |
| `dung_gio` | Đúng giờ |
| `chuan_bi` | Chuẩn bị bài kỹ |
| `hieu_y` | Hiểu ý học sinh |

- Không có ô nhận xét bằng chữ.

### 3.3 Ai thấy gì

| Người xem | Thấy |
| --- | --- |
| Học sinh đã chấm | Số sao và nhãn mình đã chấm cho buổi đó. |
| Gia sư | Chỉ số liệu tổng hợp: trung bình sao từng buổi, số lượt chấm, số lần mỗi nhãn được chọn. **Không** thấy buổi nào, ai chấm mấy sao. |
| Khách, học sinh khác | Chỉ các nhãn có **từ 3 lượt** trở lên, tối đa 4 nhãn nhiều nhất, trên hồ sơ gia sư. |
| Admin | Như gia sư (tổng hợp). [ĐỀ XUẤT] |

### 3.4 Nơi chấm trên giao diện

- Khu "Buổi học hôm nay" ở Tổng quan: sau khi buổi hoàn thành, nút "Đánh giá gia sư" hiện nay được thay bằng **chấm nhanh buổi này** (mở hộp thoại nhỏ, chọn sao và nhãn).
- Trang Lịch học: mỗi buổi hoàn thành có nút "Chấm buổi học" khi còn trong hạn; đã chấm thì hiện "Bạn chấm 4★" và nút sửa khi còn trong 24 giờ.

## 4. Đánh giá cuối khóa [CHỐT]

### 4.1 Khóa học kết thúc khi nào

Một khóa học được coi là **đã kết thúc** khi một trong hai điều xảy ra:

1. **Hết hạn tự nhiên**: đề nghị vẫn ở trạng thái `accepted` và ngày hôm nay (giờ Việt Nam) đã qua `end_date`. Thời điểm kết thúc = 00:00 ngày sau `end_date`, giờ Việt Nam.
2. **Kết thúc sớm**: học sinh hoặc gia sư bấm "Kết thúc khóa sớm". Thời điểm kết thúc = lúc bấm.

Hệ thống không cần job định kỳ: trạng thái "đã kết thúc" được suy ra mỗi lần đọc dữ liệu.

### 4.2 Kết thúc sớm [CHỐT]

- Học sinh hoặc gia sư đều bấm được, trên đề nghị khóa học đang ở trạng thái đã chấp nhận.
- Hiện nay nút "Hủy đề nghị" trên một đề nghị đã chấp nhận đã có tác dụng hủy các buổi chưa diễn ra. Với **khóa học đã chấp nhận**, nút này đổi tên thành **"Kết thúc khóa sớm"**, kèm câu xác nhận: "Các buổi chưa diễn ra sẽ bị hủy. Buổi đã học và ghi chú được giữ lại. Học sinh sẽ được mời đánh giá khóa học."
- Các buổi tương lai bị hủy theo cách này **không** tính vào độ giữ hẹn của gia sư (mục 6.3), dù ai bấm.
- Ghi lại `offers.ended_at` và `offers.ended_by`.
- Đề nghị đang chờ và học thử giữ nguyên nút "Hủy đề nghị" như cũ.

### 4.3 Điều kiện và thời hạn đánh giá

- Khóa đã kết thúc (mục 4.1) và có **ít nhất 1 buổi hoàn thành** thuộc khóa.
- Người viết là học sinh của khóa (`offers.student_id`).
- Mở trong **30 ngày** kể từ thời điểm kết thúc. Trong 30 ngày đó được viết và sửa; sau đó khóa.
- Mỗi khóa một đánh giá.

### 4.4 Nội dung

- Sao 1–5: bắt buộc.
- Nhận xét: tùy chọn; nếu viết thì từ 10 đến 1.000 ký tự.
- Câu hỏi "Em có muốn học tiếp với gia sư này không?": Có / Không / Chưa chắc, tùy chọn. Chỉ lưu nội bộ.
- [ĐỀ XUẤT] Nhận xét bị chặn nếu chứa số điện thoại, email, Zalo, liên kết (dùng cùng hàm lọc của Cộng đồng `findContactInfo`), giống quy tắc "không liên hệ ngoài nền tảng".

### 4.5 Lời mời đánh giá

- Thẻ **"Khóa học cần đánh giá"** trên Tổng quan của học sinh, liệt kê các khóa đủ điều kiện mà chưa đánh giá, kèm số ngày còn lại.
- Trên trang Đề nghị học, khóa đủ điều kiện có nút **"Đánh giá khóa học"** (hoặc "Sửa đánh giá" khi đã viết và còn hạn).
- Không gửi email.

### 4.6 Hiển thị công khai [CHỐT]

- Mỗi cặp học sinh–gia sư hiện **một** đánh giá công khai: đánh giá cuối khóa **mới nhất** của cặp đó. Đánh giá cũ (bảng `reviews`) được coi như đánh giá cuối khóa.
- Mỗi đánh giá hiện: nhãn tác giả công khai như hiện nay ("Tên hiển thị - Học sinh/Phụ huynh"), sao, nhận xét (nếu có), ngày, "Đã học N buổi" (N = tổng buổi hoàn thành của cặp).
- Đánh giá không có nhận xét chỉ hiện sao và "Đã học N buổi".

## 5. Dữ liệu cũ và tương thích

### 5.1 Đánh giá cũ [CHỐT]

Giữ nguyên bảng `reviews` và dữ liệu trong đó. Mỗi đánh giá cũ được tính như một **đánh giá cuối khóa** của cặp đó, cả khi hiển thị lẫn khi tính điểm.

### 5.2 Không mời học sinh đánh giá lại

Cặp đã có đánh giá cũ vẫn được mời đánh giá khi một khóa mới kết thúc. Đánh giá mới hơn sẽ thay thế khi hiển thị (mục 4.6). Không có bước bắt buộc chấm lại.

### 5.3 Thay đổi so với Lỗi 4

Trước đây học sinh viết đánh giá công khai ngay sau buổi hoàn thành đầu tiên. Từ nay, với buổi thuộc **khóa học**, đánh giá công khai chỉ mở khi khóa kết thúc. Trong lúc khóa còn chạy, học sinh chấm từng buổi.

### 5.4 Buổi lẻ kiểu cũ [ĐỀ XUẤT]

Buổi có `offer_id IS NULL` giữ nguyên nút "Đánh giá" / "Sửa đánh giá" theo cặp như hiện tại (endpoint cũ). Với buổi thuộc một đề nghị (khóa học hoặc học thử), endpoint cũ trả lỗi 409 và hướng sang chấm buổi / đánh giá khóa học.

## 6. Công thức điểm tin cậy [CHỐT]

### 6.1 Hằng số

| Tên | Giá trị | Ý nghĩa |
| --- | --- | --- |
| `PRIOR_MEAN` (C) | 4,3 | Mức nền: điểm giả định của một gia sư khi chưa có dữ liệu. |
| `PRIOR_WEIGHT` (m) | 5 | Số cặp "ảo" ở mức nền; càng ít cặp thật, điểm càng kéo về C. |
| `COURSE_WEIGHT` | 3 | Đánh giá cuối khóa nặng gấp 3 lần trung bình chấm từng buổi. |
| `QUALITY_SHARE` | 0,7 | Tỉ trọng chất lượng trong điểm. |
| `RELIABILITY_SHARE` | 0,3 | Tỉ trọng độ giữ hẹn trong điểm. |
| `LATE_CANCEL_HOURS` | 24 | Gia sư hủy trong vòng 24 giờ trước giờ học bị tính là hủy sát giờ. |
| `NEW_MIN_RATINGS` | 3 | Ngưỡng thoát nhãn "Mới": số lượt chấm. |
| `NEW_MIN_RATERS` | 2 | Ngưỡng thoát nhãn "Mới": số học sinh khác nhau. |
| `PUNCTUALITY_MIN_LESSONS` | 5 | Số buổi tối thiểu để hiện "Đúng hẹn %". |
| `PUBLIC_TAG_MIN` | 3 | Số lượt tối thiểu để một nhãn hiện công khai. |

Các giá trị là số khởi đầu; nên xem lại khi đã có dữ liệu thật. Đặt tất cả trong một file chính sách để sửa một chỗ.

### 6.2 Q — chất lượng (thang 1–5)

Với **mỗi cặp** của gia sư:

- `c` = sao của đánh giá cuối khóa **mới nhất** của cặp (gồm cả đánh giá cũ). Có thể không có.
- `l` = trung bình sao chấm từng buổi của cặp (chỉ buổi hoàn thành). Có thể không có.
- Điểm cặp `s`:
  - có cả hai: `s = (3·c + l) / 4`
  - chỉ có `c`: `s = c`
  - chỉ có `l`: `s = l`
  - không có gì: cặp không được tính.

Gọi `n` là số cặp có điểm, `Σs` là tổng điểm các cặp:

```
Q = (Σs + m·C) / (n + m)        với m = 5, C = 4,3
```

Gộp theo cặp trước rồi mới tính chung là điều kiện để **một học sinh chỉ đóng góp một phiếu**, dù học bao nhiêu buổi hay bao nhiêu khóa.

### 6.3 R — độ giữ hẹn (0–1)

- `held` = số buổi hoàn thành của gia sư.
- `bad` = số lần gia sư **hủy sát giờ** + số lần **gia sư không đến**:
  - Hủy sát giờ: buổi bị hủy, người hủy là gia sư, thời điểm hủy cách giờ bắt đầu dưới 24 giờ, và **không** phải do kết thúc khóa sớm.
  - Gia sư không đến: học sinh báo "Gia sư không đến" (mục 6.6).
- Không tính: học sinh hủy, học sinh vắng (`missed`), buổi hủy do kết thúc khóa sớm, buổi hủy trước khi có dữ liệu "ai hủy" (dữ liệu cũ).

```
R = held / (held + bad)          nếu held + bad = 0 thì R = 1
```

### 6.4 Điểm sao

```
Điểm = 5 × (0,7 × Q/5 + 0,3 × R)   = 0,7·Q + 1,5·R
```

Làm tròn 1 chữ số thập phân để hiển thị (ví dụ 4,6). Biểu tượng sao làm tròn đến nửa sao.

### 6.5 Ví dụ

| Trường hợp | n | Σs | Q | R | Điểm |
| --- | --- | --- | --- | --- | --- |
| 2 cặp, đều 4,8 | 2 | 9,6 | (9,6 + 21,5) / 7 = 4,44 | 1 | 0,7·4,44 + 1,5 = **4,6** |
| 20 cặp, đều 4,8 | 20 | 96 | (96 + 21,5) / 25 = 4,70 | 1 | **4,8** |
| 10 cặp, đều 4,5; 38 buổi hoàn thành, 2 lần hủy sát giờ | 10 | 45 | (45 + 21,5) / 15 = 4,43 | 38/40 = 0,95 | 3,10 + 1,425 = **4,5** |

Điểm một cặp: cuối khóa 5★ và trung bình chấm buổi 4★ → `s = (3·5 + 4) / 4 = 4,75`.

### 6.6 Báo "Gia sư không đến" [CHỐT ý; ĐỀ XUẤT chi tiết]

- Học sinh (người đặt buổi) thấy nút **"Gia sư không đến"** khi: buổi đang `accepted`, gia sư **chưa bấm Bắt đầu**, và đã qua giờ bắt đầu 15 phút. Nút còn đến 48 giờ sau giờ kết thúc buổi.
- Có bước xác nhận. Sau khi báo: buổi chuyển trạng thái mới `tutor_missed`; gia sư không còn bấm Bắt đầu, Hoàn thành hay Học sinh vắng cho buổi đó.
- Nếu gia sư đã báo "Học sinh vắng" trước thì học sinh không báo được, và ngược lại (ai báo trước thì giữ). Tranh chấp để cho admin xử lý ở Lỗi 5.
- Admin thấy buổi này với nhãn "Gia sư không đến" trong danh sách lịch.
- Buổi `tutor_missed` không giữ chỗ khung giờ, không được chấm, không tính phí sau này.

### 6.7 Nhãn "Mới" [CHỐT]

Gia sư được coi là **Mới** cho đến khi có **ít nhất 3 lượt chấm** đến từ **ít nhất 2 học sinh khác nhau**. Lượt chấm = lượt chấm từng buổi + đánh giá cuối khóa (gồm đánh giá cũ). Khi còn Mới:

- Thẻ và hồ sơ hiện nhãn **"Mới"** thay cho số sao.
- Khi sắp xếp "Đánh giá cao" / "Đề xuất", gia sư Mới được xếp như có điểm **4,3** (mức nền C).

## 7. Hiển thị

### 7.1 Thẻ gia sư (trang Tìm gia sư)

- Đủ dữ liệu: "★ 4,6 · 12 đánh giá" (số đánh giá = số cặp có đánh giá cuối khóa, gồm đánh giá cũ).
- Còn Mới: nhãn "Mới".
- Có từ 5 buổi tính độ giữ hẹn (`held + bad ≥ 5`): thêm "Đúng hẹn 97%" (`R` làm tròn phần trăm). [CHỐT]
- [ĐỀ XUẤT] Bỏ dòng giờ hiện tại của gia sư ("09:59 (UTC+07:00)") trên thẻ để dành chỗ, vì thông tin này không giúp chọn gia sư. **Chỉ làm nếu chủ dự án xác nhận**; mặc định giữ nguyên.

### 7.2 Hồ sơ gia sư

- Phần đầu: sao + số đánh giá, hoặc "Mới"; "Đúng hẹn %" khi đủ dữ liệu.
- Mục **Đánh giá**: các nhãn công khai (mục 3.3), rồi danh sách đánh giá theo mục 4.6.
- Một dòng nhỏ dưới tiêu đề mục: "Điểm tính từ đánh giá sau từng buổi, đánh giá cuối khóa và việc giữ lịch hẹn." [ĐỀ XUẤT]

### 7.3 Gia sư xem điểm của mình [CHỐT]

Trong **Hồ sơ gia sư** (`/studio`) thêm tab **"Đánh giá & điểm"** [ĐỀ XUẤT tên tab], gồm:

- Điểm hiện tại, hoặc "Mới" kèm tiến độ ("2/3 lượt chấm, 1/2 học sinh").
- Q với số cặp được tính; R với số buổi hoàn thành, số lần hủy sát giờ, số lần không đến.
- Trung bình sao chấm từng buổi và số lượt; số lần mỗi nhãn được chọn.
- Danh sách đánh giá cuối khóa công khai.
- Đoạn giải thích công thức bằng lời, kèm hằng số.

## 8. Quyền admin [CHỐT]

- Không sửa điểm bằng tay.
- Xem được số liệu tổng hợp như gia sư, và các buổi "Gia sư không đến".
- Gỡ đánh giá vi phạm: thuộc Lỗi 5, chưa làm. Khi làm, điểm tự tính lại vì luôn được tính khi đọc.

## 9. Mô hình dữ liệu [ĐỀ XUẤT]

Chỉ cộng thêm, chạy được hai lần (idempotent), trong `migrateDatabase` ở `server/db.js` hoặc một file schema riêng gọi từ đó.

```sql
CREATE TABLE IF NOT EXISTS lesson_ratings (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',              -- mảng JSON mã nhãn, tối đa 3
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_reviews (
  offer_id INTEGER PRIMARY KEY REFERENCES offers(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  continue_intent TEXT CHECK(continue_intent IN ('yes','no','unsure')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- offers: kết thúc sớm
ALTER TABLE offers ADD COLUMN ended_at TEXT;
ALTER TABLE offers ADD COLUMN ended_by INTEGER REFERENCES users(id);

-- bookings: ai hủy, lúc nào, vì sao; gia sư không đến
ALTER TABLE bookings ADD COLUMN cancelled_by INTEGER REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN cancelled_at TEXT;
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT '';   -- '' | 'course_ended'
ALTER TABLE bookings ADD COLUMN tutor_missed_at TEXT;
```

Trạng thái buổi học có thêm giá trị `tutor_missed`. Mọi `ALTER` phải kiểm tra cột tồn tại trước (mẫu `PRAGMA table_info` đang dùng trong repo).

## 10. API [ĐỀ XUẤT]

| Phương thức | Đường dẫn | Ai | Việc |
| --- | --- | --- | --- |
| `PUT` | `/api/bookings/:id/rating` | Học sinh của buổi | Tạo hoặc sửa chấm buổi `{ rating, tags }`. Kiểm tra: buổi `completed`, trong 14 ngày, sửa trong 24 giờ, nhãn hợp lệ, tối đa 3. |
| `PATCH` | `/api/bookings/:id` | Học sinh | Thêm `status: "tutor_missed"` với điều kiện mục 6.6. |
| `PATCH` | `/api/bookings/:id` | Cả hai | Khi `status: "cancelled"`: ghi `cancelled_by`, `cancelled_at`. |
| `PATCH` | `/api/offers/:id` | Cả hai | Khi hủy đề nghị **khóa học đã chấp nhận**: ghi `ended_at`, `ended_by`; các buổi tương lai bị hủy ghi `cancel_reason='course_ended'`, `cancelled_by`, `cancelled_at`. Học thử và đề nghị đang chờ: buổi hủy ghi `cancel_reason=''`. |
| `PUT` | `/api/offers/:id/review` | Học sinh của khóa | Tạo hoặc sửa đánh giá cuối khóa `{ rating, body, continue_intent }`. Kiểm tra mục 4.3, 4.4. |
| `GET` | `/api/offers` | Cả hai | Mỗi khóa thêm: `ended` (bool), `ends_at`, `review_open_until`, `review_eligible`, và với học sinh: `my_review`. Gia sư **không** nhận `continue_intent`. |
| `GET` | `/api/bookings` | Cả hai | Học sinh: thêm `my_rating`, `rating_open_until`, `rating_editable`. Gia sư: **không** nhận chấm từng buổi. |
| `GET` | `/api/tutors`, `/api/tutors/:id` | Mọi người | Thêm `trust` (mục 10.1). Danh sách đánh giá công khai theo mục 4.6. |
| `GET` | `/api/tutor/trust` | Gia sư | Toàn bộ phân tích cho tab "Đánh giá & điểm" (mục 7.3). |
| `POST` | `/api/bookings/:id/review` (cũ) | Học sinh | Chỉ cho buổi `offer_id IS NULL`; buổi thuộc đề nghị trả 409. |

### 10.1 Đối tượng `trust` trả về công khai

```json
{
  "score": 4.6,              // null khi is_new
  "is_new": false,
  "sort_score": 4.6,         // bằng 4.3 khi is_new
  "review_count": 12,        // số cặp có đánh giá cuối khóa (gồm đánh giá cũ)
  "punctuality": 0.97,       // null khi held + bad < 5
  "tags": [{ "code": "de_hieu", "label": "Dễ hiểu", "count": 9 }]
}
```

Giữ trường `rating` và `review_count` cũ trên đối tượng gia sư cho đến khi mọi nơi trong frontend đã chuyển sang `trust`, rồi bỏ `rating` để tránh hai nguồn số liệu.

## 11. Kiểm thử cần có

### 11.1 Hàm thuần (`node --test`)

- Q: không có cặp nào → Q = C; ví dụ bảng 6.5 cho đúng kết quả; cặp chỉ có `c`, chỉ có `l`, có cả hai.
- Một học sinh chấm 20 buổi 1★ chỉ làm điểm cặp đó thấp, không chi phối các cặp khác.
- R: `held + bad = 0` → 1; hủy sát giờ đúng ranh giới 24 giờ; hủy do kết thúc khóa không bị tính; học sinh hủy không bị tính.
- Nhãn "Mới": ranh giới 3 lượt / 2 học sinh.
- Làm tròn hiển thị.

### 11.2 API

- Chấm buổi: chỉ học sinh của buổi; chỉ buổi `completed`; quá 14 ngày bị từ chối; sửa sau 24 giờ bị từ chối; nhãn lạ hoặc quá 3 nhãn bị từ chối.
- Gia sư không đọc được chấm từng buổi qua bất kỳ API nào.
- Kết thúc khóa sớm: ghi `ended_*`, hủy buổi tương lai với `course_ended`, không trừ R.
- Đánh giá cuối khóa: chưa kết thúc → 409; không có buổi hoàn thành → 409; quá 30 ngày → 409; nhận xét chứa số điện thoại → 400; mỗi khóa một đánh giá, sửa được trong hạn.
- `tutor_missed`: đúng khung giờ; không báo được khi gia sư đã bắt đầu hoặc đã báo học sinh vắng; gia sư không thao tác tiếp được.
- Hủy buổi ghi `cancelled_by` / `cancelled_at`.
- Đánh giá cũ vẫn hiện và vẫn tính; endpoint cũ chỉ còn cho buổi lẻ.
- Migration chạy hai lần không lỗi, dữ liệu cũ còn nguyên.

### 11.3 Trình duyệt (Playwright)

- Học sinh hoàn thành buổi → chấm nhanh từ Tổng quan → thấy "Bạn chấm …" ở Lịch học.
- Kết thúc khóa sớm → thẻ "Khóa học cần đánh giá" xuất hiện → viết đánh giá → hiện trên hồ sơ gia sư.
- Gia sư Mới hiện nhãn "Mới"; đủ ngưỡng thì hiện sao.
- Gia sư mở tab "Đánh giá & điểm" thấy phân tích, không thấy chấm từng buổi riêng lẻ.
- Màn hình 360 px không tràn.

## 12. Phụ thuộc, rủi ro, việc để sau

- **Chống gian lận chưa đầy đủ**: buổi hoàn thành hiện chỉ cần một bên bấm. Gia sư có thể tự bấm hoàn thành để tăng `held`. Điểm danh hai chiều sẽ làm cùng phần phí ([tutor-fees.md](tutor-fees.md) mục 3).
- **Báo "Gia sư không đến" có thể bị lạm dụng**: chưa có bước gia sư phản đối; admin xử lý ở Lỗi 5.
- **Hằng số** là giá trị khởi đầu, cần xem lại khi có dữ liệu thật.
- **Hiệu năng**: điểm tính khi đọc. Danh sách gia sư phải dùng truy vấn gộp theo gia sư, không truy vấn từng gia sư. Khi số gia sư lớn mới cần lưu sẵn.
- **Phí nền tảng**: buổi `tutor_missed` không được tính phí khi phần phí được làm.

---

# PHẦN 2 — PROMPT CHO AGENT XÂY DỰNG

> Sao chép nguyên khối bên dưới gửi cho Agent. Prompt giả định Agent được mở trong thư mục dự án và có tài liệu này ở `docs/danh-gia-va-diem-tin-cay.md`.

````text
Bạn là kỹ sư phần mềm cấp cao, làm việc trong repo "Gia Sư 10 Điểm" (nền tảng tìm gia sư của Việt Nam). Nhiệm vụ: xây dựng ĐÁNH GIÁ SAU TỪNG BUỔI, ĐÁNH GIÁ CUỐI KHÓA và ĐIỂM TIN CẬY 5 SAO của gia sư theo đúng bản thiết kế đã được chủ dự án chốt.

# 0. Nguồn sự thật

- Thiết kế đầy đủ: `docs/danh-gia-va-diem-tin-cay.md` (Phần 1). Đọc toàn bộ trước khi viết code.
- Đọc thêm: `docs/loi-04-danh-gia-gan-voi-buoi-hoc.md` (mô hình đánh giá hiện tại), `docs/marketplace.md`, `docs/architecture.md`, `docs/tutor-fees.md` mục 3 (điểm danh, để không làm trùng hay chặn đường phần phí sau này).
- Nhãn trong tài liệu:
  - [CHỐT]: chủ dự án đã đồng ý, KHÔNG được tự ý đổi.
  - [ĐỀ XUẤT]: làm theo, ghi lại trong báo cáo cuối.
  - [KHÔNG LÀM]: tuyệt đối không thêm (Phần 1, mục 1.3).
- Chủ dự án đã trả lời mọi câu hỏi thiết kế và yêu cầu KHÔNG hỏi thêm khi triển khai. Chỉ dừng lại hỏi khi tài liệu mâu thuẫn trực tiếp với mã nguồn đến mức không làm được. Mọi chi tiết kỹ thuật nhỏ (tên hàm, cách tách file, chữ trên giao diện) tự quyết theo phong cách repo và ghi vào báo cáo.
- Không tự thêm tính năng ngoài tài liệu.

# 1. Bối cảnh dự án (đã xác minh trong repo ngày 21/11/2026)

- Backend: Express 5 + SQLite. Local dùng `node:sqlite` (`server/local-db.js`); production dùng Cloudflare Worker + Durable Object SQLite (`worker/index.js` bọc cùng `createApi`). Mọi thay đổi CSDL phải chạy ở CẢ HAI.
- Migration: `migrateDatabase(db)` trong `server/db.js` (mẫu `PRAGMA table_info` rồi `ALTER TABLE ... ADD COLUMN`; `CREATE TABLE IF NOT EXISTS`). Chỉ cộng thêm, idempotent; không xóa hay đổi tên bảng/cột cũ; không xóa file CSDL.
- Tiện ích: `transaction(db, fn)`, `all/one/run` (`server/db.js`), `z`, `text` (`server/validation.js`), `fail(status, message)`, `audit(...)` trong `server/api.js`. Lỗi trả `{ error }` bằng tiếng Việt.
- Đánh giá hiện tại:
  - Bảng `reviews(booking_id PK, rating, body, created_at)`, một đánh giá công khai mỗi cặp; helper `currentReview`, `pairReview`, `completedLessons` trong `server/reviews.js`.
  - Endpoint `POST /api/bookings/:id/review` trong `server/api.js` (khoảng dòng 757).
  - Điểm trung bình trong `tutorRows()` (`server/api.js` khoảng dòng 211: `AVG(r.rating)`, `COUNT(r.rating)`); danh sách đánh giá công khai khoảng dòng 398 (dùng `authorLabel` từ `server/community-policy.js`).
- Buổi học: bảng `bookings` (`status` ∈ pending|accepted|declined|cancelled|completed|missed; `started_at`; `offer_id`; `duration_minutes`). Chuyển trạng thái ở `PATCH /api/bookings/:id` (khoảng dòng 657): hủy chỉ khi buổi chưa bắt đầu; hoàn thành do một trong hai bên sau giờ kết thúc; `missed` do gia sư báo học sinh vắng. `POST /api/bookings/:id/start` mở trước 15 phút. Hiện KHÔNG lưu ai hủy, lúc nào.
- Đề nghị học: `server/offers.js`. Bảng `offers` có `kind` ('course'|'trial'), `start_date`, `end_date`, `weeks`, `status` (pending|accepted|declined|cancelled), `accepted_at`. Chấp nhận tạo các buổi `accepted` có `offer_id`. Hủy đề nghị đã chấp nhận (`PATCH /api/offers/:id` status cancelled) hủy các buổi tương lai — đây chính là "Kết thúc khóa sớm".
- Lọc liên hệ: `findContactInfo` trong `server/community-policy.js`.
- Frontend: React 19 + Vite + react-router-dom 7 (basename `/app`), shadcn + Animate UI.
  - Chấm/đánh giá hiện có: hộp thoại đánh giá trong `app/src/pages/Bookings.tsx` (khoảng dòng 96–115 và 331–375); nút "Đánh giá gia sư" trong `app/src/components/today-lessons.tsx` (`studentActions`).
  - Đề nghị học: `app/src/pages/Offers.tsx` (nút "Hủy đề nghị" khoảng dòng 47–51), nhãn trạng thái trong `app/src/lib/offers.ts`.
  - Hiển thị điểm: `app/src/pages/Tutors.tsx` (sắp xếp khoảng dòng 80, hiển thị khoảng dòng 338), `app/src/components/tutor-presentation.tsx` (khoảng dòng 66).
  - Hồ sơ gia sư của chính gia sư: `app/src/pages/TutorStudio.tsx` (các tab).
  - Tổng quan: `app/src/pages/Dashboard.tsx`. Kiểu dữ liệu: `app/src/lib/types.ts`.
  - LƯU Ý: `app/src/components/tutor-review-dialog.tsx` là hộp thoại ADMIN DUYỆT HỒ SƠ, không liên quan đến đánh giá của học sinh.
- Test: `npm test` liệt kê từng file test trong `package.json` — file test mới phải được thêm vào script đó. E2E ở `test/e2e/*.spec.ts`, server test riêng `test/e2e-server.js`, cổng 4175.
- Chạy local: server ở `http://127.0.0.1:4174/app/` (dùng 127.0.0.1, không dùng localhost — kiểm tra origin sẽ từ chối đăng nhập). Tài khoản demo trong README.
- `index.html` ở thư mục gốc là FILE SINH RA; không sửa tay.
- Phạm vi dự án: chỉ tìm gia sư. Không quiz/đáp án.
- Quy ước repo: giao diện tiếng Việt có dấu; KHÔNG thêm dòng AI co-author vào commit.

# 2. Cách làm việc

1. Tạo git worktree riêng dưới `.claude/worktrees/`, nhánh mới cắt từ `origin/main` mới nhất (một phiên khác có thể đang làm trong thư mục chính). Một nhánh, một PR cho toàn bộ tính năng.
2. Làm theo các giai đoạn ở mục 3. Mỗi giai đoạn chạy test liên quan đến khi sạch.
3. KHÔNG commit, KHÔNG push, KHÔNG mở PR khi chủ dự án chưa đồng ý. Khi xong, báo cáo và chờ.
4. Viết code giống phần xung quanh: cùng cách đặt tên, cùng mật độ chú thích, dùng lại tiện ích có sẵn. Không thêm thư viện mới.
5. Chạy thật: khởi động server, thao tác các luồng chính trên trình duyệt (desktop và 360 px), xem console/network. Không báo "xong" khi chưa chạy.

# 3. Các giai đoạn

## Giai đoạn 1 — Chính sách, công thức, dữ liệu
- `server/trust-policy.js`: mọi hằng số của Phần 1 mục 6.1, bộ nhãn mục 3.2, và hàm THUẦN:
  - `pairScore({ course, lessonAvg })`
  - `quality(pairScores)` → Q
  - `reliability({ held, bad })` → R
  - `trustScore({ pairs, held, bad, ratingCount, raterCount, tagCounts })` → đối tượng `trust` theo mục 10.1 (gồm `is_new`, `sort_score`, `punctuality`, nhãn công khai).
- Migration theo mục 9, nối vào `migrateDatabase`.
- Test hàm thuần theo mục 11.1 (file mới, thêm vào script `npm test`), test migration chạy hai lần.

## Giai đoạn 2 — Ghi nhận ai hủy, kết thúc sớm, gia sư không đến
- `PATCH /api/bookings/:id` cancelled: ghi `cancelled_by`, `cancelled_at`.
- `PATCH /api/offers/:id` cancelled trên khóa học đã chấp nhận: ghi `ended_at`, `ended_by`; buổi tương lai ghi `cancel_reason='course_ended'` cùng người hủy, thời điểm. Học thử / đề nghị chờ: `cancel_reason=''`.
- Trạng thái `tutor_missed` theo mục 6.6; đảm bảo `start`, `completed`, `missed` từ chối buổi đã `tutor_missed`. Rà mọi chỗ liệt kê trạng thái buổi (server và frontend: nhãn trạng thái, bộ lọc, `today-lessons`, lịch admin, ngữ cảnh tin nhắn) để `tutor_missed` hiển thị đúng "Gia sư không đến".
- Frontend: đổi nút thành "Kết thúc khóa sớm" (khóa học đã chấp nhận) với câu xác nhận mục 4.2; nút "Gia sư không đến" cho học sinh (Tổng quan và Lịch học), có xác nhận.

## Giai đoạn 3 — Chấm từng buổi
- `PUT /api/bookings/:id/rating` theo mục 10; trường `my_rating`, `rating_open_until`, `rating_editable` cho học sinh trong `GET /api/bookings`. Gia sư không bao giờ nhận dữ liệu chấm từng buổi.
- Giao diện: hộp thoại chấm nhanh (sao + tối đa 3 nhãn) mở từ `today-lessons` và `Bookings`; hiện "Bạn chấm N★", sửa trong 24 giờ.

## Giai đoạn 4 — Đánh giá cuối khóa
- Suy ra trạng thái kết thúc (mục 4.1) trong `GET /api/offers`; `PUT /api/offers/:id/review` theo mục 4.3–4.4 (lọc liên hệ bằng `findContactInfo`).
- Endpoint cũ `POST /api/bookings/:id/review`: chỉ cho buổi `offer_id IS NULL`, còn lại 409. Giao diện cũ chỉ còn với buổi lẻ.
- Giao diện: nút "Đánh giá khóa học" / "Sửa đánh giá" trên `Offers.tsx`; thẻ "Khóa học cần đánh giá" trên Tổng quan của học sinh (kèm số ngày còn lại).

## Giai đoạn 5 — Điểm tin cậy và hiển thị
- Trong `tutorRows()`: thay `AVG/COUNT` bằng các truy vấn GỘP THEO GIA SƯ (không truy vấn từng gia sư) để lấy: điểm cặp (đánh giá cuối khóa mới nhất gồm bảng `reviews` cũ, trung bình chấm buổi), `held`, `bad`, số lượt chấm, số học sinh chấm, số lần từng nhãn; rồi gọi hàm thuần. Trả `trust` theo mục 10.1.
- Danh sách đánh giá công khai theo mục 4.6 (mỗi cặp một đánh giá mới nhất, từ `course_reviews` hoặc `reviews`, kèm "Đã học N buổi").
- Frontend: thẻ gia sư và hồ sơ theo mục 7.1–7.2; sắp xếp dùng `trust.sort_score`; chuyển hết khỏi `rating`/`review_count` cũ rồi mới bỏ chúng.
- `GET /api/tutor/trust` và tab "Đánh giá & điểm" trong `TutorStudio.tsx` theo mục 7.3.
- KHÔNG đổi dòng giờ hiện tại trên thẻ gia sư (mục 7.1 [ĐỀ XUẤT] chờ chủ dự án).

## Giai đoạn 6 — Kiểm thử toàn bộ và tài liệu
- Test API theo mục 11.2, e2e theo mục 11.3 (file mới trong `test/e2e/`).
- Cập nhật `docs/marketplace.md` (quy tắc đánh giá) và `README.md` nếu mô tả đánh giá đã cũ.
- Thêm `docs/danh-gia-va-diem-tin-cay-implementation.md`: phần đã làm, các [ĐỀ XUẤT] đã áp dụng, kết quả kiểm chứng thật.

# 4. Ràng buộc bắt buộc

- Không làm bất cứ mục nào trong Phần 1 mục 1.3 [KHÔNG LÀM].
- Gia sư, khách và học sinh khác không bao giờ thấy chấm từng buổi riêng lẻ hay câu trả lời "có muốn học tiếp".
- Không thay đổi hay xóa dữ liệu trong bảng `reviews`.
- Mọi mốc ngày theo giờ Việt Nam (UTC+7), như `server/offers.js` đang làm.
- Không sửa tay `index.html`. Không bỏ qua test hay hook để "cho qua".

# 5. Kiểm chứng trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Thêm: chạy local, duyệt tay các luồng ở mục 11.3 (desktop và 360 px), kiểm tra console/network không lỗi. Nếu có thể, chạy `npm run test:cloudflare` để xác nhận migration trên Worker. Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra được.

# 6. Báo cáo cuối (tiếng Việt, ngắn gọn)

- Đã làm gì theo từng giai đoạn; file chính đã tạo/sửa.
- Danh sách [ĐỀ XUẤT] đã áp dụng và mọi quyết định kỹ thuật tự đưa ra.
- Kết quả các lệnh ở mục 5 (dán kết quả thật).
- Việc còn lại / rủi ro.
- Nhắc: chưa commit, chưa push; chờ chủ dự án duyệt.
````
