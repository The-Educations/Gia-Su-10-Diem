# Lỗi 10: Ba cơ chế đặt lịch chồng nhau

Issue: [#54](https://github.com/The-Educations/Gia-Su-10-Diem/issues/54). Mức độ: Trung bình (nợ kỹ thuật, rủi ro tăng mạnh khi xây phí, nhắc lịch, hết hạn yêu cầu).

Tài liệu gồm hai phần:

- **Phần 1:** mô tả chi tiết lỗi, hiện trạng trong mã và phương án xử lý đã chốt.
- **Phần 2:** prompt gửi cho Agent để sửa.

Trạng thái: **đã sửa Giai đoạn 1** (11/11/2026, nhánh `fix/loi-10-booking-flows`, chưa commit). Giai đoạn 2 (xóa mã cũ) chờ số đếm `legacy` về 0 trên production. Số dòng dưới đây theo `main` tại commit `aee83c1`.

---

# PHẦN 1: MÔ TẢ LỖI VÀ PHƯƠNG ÁN

## 1. Tóm tắt

Hệ thống đang có **ba cách khác nhau để tạo lịch học**, ra đời ở ba giai đoạn. Giao diện hiện chỉ còn dùng một cách (Đề nghị học), nhưng hai cách cũ vẫn mở ở API và vẫn để lại dấu vết ở nhiều nơi. Mỗi tính năng lịch mới (điểm danh, phí, nhắc lịch, hết hạn, chính sách hủy) đều phải nhớ xử lý cả ba, nên mã ngày càng dễ sai.

Không có lỗi nào người dùng gặp ngay hôm nay. Đây là món nợ cần trả **trước** khi làm Lỗi 1, 7, 8 và thiết kế phí.

## 2. Ba cơ chế

| | A. Buổi lẻ theo slot | B. Lịch tuần (cũ) | C. Đề nghị học (hiện hành) |
|---|---|---|---|
| Bảng | `slots` + `bookings` | `weekly_requests` | `offers`, khi nhận thì sinh `bookings` |
| API tạo | `POST /api/bookings` ([server/api.js:603](../server/api.js)) | `POST /api/weekly-requests` ([server/weekly-requests.js:15](../server/weekly-requests.js)) | `POST /api/offers` ([server/offers.js:90](../server/offers.js)) |
| Mô tả | Một buổi 60 phút trên một slot giờ trống | Các khung thứ + giờ lặp hằng tuần, **không có ngày bắt đầu, không có ngày kết thúc** | Khóa học theo số tuần (1–52) hoặc một buổi học thử, có ngày cụ thể |
| Khi gia sư nhận | Buổi đó thành `accepted` | **Chỉ đổi trạng thái thành `accepted`, không tạo buổi học nào** | Sinh một `booking` `accepted` cho từng buổi |
| Giao diện còn tạo không | **Không** | **Không** | Có (form "Đề nghị học" ở hồ sơ gia sư) |
| Trạng thái | pending, accepted, declined, cancelled, completed, missed | pending, accepted, declined, cancelled | pending, accepted, declined, cancelled |

Ngoài ra còn `POST /api/tutor/slots` ([server/api.js:551](../server/api.js)) cho gia sư tự thêm một giờ trống lẻ (`slots.source='manual'`). Giờ lẻ này chỉ có ý nghĩa với cơ chế A. **Giao diện cũng không còn gọi API này**; trang giờ trống chỉ còn nút xóa giờ lẻ cũ ([weekly-availability.tsx:42](../app/src/components/weekly-availability.tsx)).

Bảng `bookings` là nơi chứa **mọi buổi học thật**: buổi lẻ cũ (`offer_id IS NULL`) và buổi sinh từ đề nghị (`offer_id` có giá trị). `PATCH /api/bookings/:id` (nhận, từ chối, hủy, hoàn thành, học sinh vắng) và `POST /api/bookings/:id/start` là máy trạng thái chung cho cả hai. Phần này **đúng và cần giữ**.

## 3. Hiện trạng đã kiểm chứng trong mã

- Tìm toàn bộ `app/src`: không có chỗ nào gọi `POST /bookings`, `POST /weekly-requests` hay `POST /tutor/slots`.
- Giao diện vẫn **đọc và xử lý** lịch tuần cũ:
  - `Offers.tsx:36` hiện khối "Yêu cầu học hằng tuần" (`components/weekly-requests.tsx`), có nút **Nhận lịch tuần**, Từ chối, Hủy.
  - `Bookings.tsx:50` tải `/weekly-requests` để che giờ trống của gia sư trên lịch tuần.
  - Tin nhắn có ngữ cảnh loại `weekly-request` (`server/message-context.js:12`, `app/src/lib/message-context.ts`).
- Lịch tuần cũ đã nhận vẫn được đối chiếu ở nhiều nơi, mỗi nơi tự viết câu truy vấn riêng:
  - `server/offers.js:30` (`preview()`): báo "Trùng lịch tuần đã xác nhận".
  - `server/inquiries.js:52`: chặn chọn giờ đã bị lịch tuần giữ.
  - `server/api.js:214` (`tutorRows`): bỏ các giờ đó khỏi `weekly_blocks` công khai.
  - `server/account-deletion.js:24`: hủy cả ba bảng khi xóa tài khoản.
- Test vẫn gọi các API cũ:
  - `test/api.test.js`: 13 lần `POST /bookings`, 18 chỗ `weekly-requests`, 5 chỗ `tutor/slots`, trong 9 test (dòng 241, 408, 1087, 1219, 1264, 1449, 1506, 1578, 1735).
  - `test/e2e/marketplace.spec.ts:115` và `:965` gọi `POST /api/bookings`.
  - `test/e2e/message-context.spec.ts:89` gọi `POST /api/weekly-requests`.
  - `test/cloudflare-smoke.mjs:90` gọi `POST /api/tutor/slots`.
- `server/demo-content.js:209` và `server/seed.js:125` ghi thẳng `bookings`/`slots` bằng SQL cho dữ liệu mẫu, không qua API.

## 4. Lỗi diễn ra thế nào

### 4.1 Lịch tuần cũ là "lịch ma"

Một yêu cầu lịch tuần được nhận **không sinh ra buổi học nào**. Nó chỉ giữ chỗ thứ + giờ **vô thời hạn**, bằng cách bắt các nơi khác phải nhớ kiểm tra nó. Hệ quả:

- Không xuất hiện trong Lịch học / Lịch dạy, không có trong file `.ics`, không đồng bộ Google Calendar.
- Không có nút Bắt đầu, Học sinh vắng, Hoàn thành; không đánh giá được.
- Khi làm phí: không có buổi nào để tính, dù hai bên có thể đang học thật.
- Giờ đó bị khóa mãi cho đến khi có người bấm Hủy.

### 4.2 Kiểm tra trùng lịch không đối xứng

Mình đọc mã thấy (chưa tái hiện trên giao diện):

- `POST /api/bookings` chỉ so với bảng `bookings` (`server/api.js`, câu `SELECT starts_at,duration_minutes FROM bookings ...`), **không** nhìn lịch tuần cũ đã nhận.
- `POST /api/weekly-requests` và nút nhận lịch tuần chỉ so với các lịch tuần khác (`weekly-requests.js:25` và `:52`), **không** nhìn các buổi học có ngày do đề nghị học sinh ra.

Vì cả hai API vẫn mở, một giờ có thể bị giữ hai lần nếu ai đó gọi API trực tiếp (hoặc một tab cũ còn mở bản giao diện trước).

### 4.3 Mỗi tính năng mới phải làm ba lần

| Việc sắp làm | Phải xử lý |
|---|---|
| Lỗi 7: hết hạn yêu cầu | đề nghị chờ, buổi lẻ chờ, lịch tuần chờ |
| Lỗi 8: chính sách hủy | hủy buổi lẻ, hủy khóa, hủy lịch tuần |
| Lỗi 1: email thông báo | ba loại "có yêu cầu mới", ba loại "đã nhận" |
| Phí gia sư, điểm danh | buổi có ngày; lịch tuần không có buổi để tính |

## 5. Các hướng đã cân nhắc

| Hướng | Ưu | Nhược | Kết luận |
|---|---|---|---|
| Giữ nguyên, chỉ vá kiểm tra trùng cho đối xứng | Ít việc | Nợ vẫn còn nguyên; mọi tính năng sau vẫn làm ba lần | Loại |
| Tự chuyển lịch tuần đã nhận thành đề nghị học có ngày | Gọn dữ liệu | Phải **tự đặt ngày kết thúc** thay hai bên, tự tạo cam kết họ chưa đồng ý; không biết dữ liệu thật có bao nhiêu | Loại |
| Xóa hẳn mã và bảng cũ ngay | Gọn nhất | Mất khả năng xử lý dữ liệu cũ còn dở; xóa schema trên Durable Object là thao tác không đảo ngược | Loại ở bước này |
| **Đóng mọi đường tạo cũ, giữ dữ liệu cũ ở chế độ "xử lý nốt", đếm cho admin, xóa mã sau khi đếm bằng 0** | Hết nợ cho mọi tính năng mới; không đổi schema; an toàn với mọi lượng dữ liệu thật | Mã cũ còn tồn tại thêm một thời gian | **Chọn** |

## 6. Phương án đã chốt

**Nguyên tắc:** chỉ còn **một cách tạo lịch học là Đề nghị học** (theo khóa hoặc học thử). Bảng `bookings` vẫn là nơi chứa mọi buổi học thật. Dữ liệu cũ được giữ nguyên và chỉ được **xử lý nốt** (từ chối, hủy, hoàn tất), không sinh thêm.

Chia hai giai đoạn. **Prompt ở Phần 2 chỉ làm Giai đoạn 1.**

### Giai đoạn 1: đóng cửa và gom lại (làm ngay)

1. **Đóng ba API tạo cũ**, trả `410 Gone` kèm thông báo tiếng Việt hướng sang Đề nghị học:
   - `POST /api/bookings`
   - `POST /api/weekly-requests`
   - `POST /api/tutor/slots`

   Dùng 410 thay vì xóa route để tab cũ và script gọi nhầm nhận thông báo rõ ràng, và test kiểm được.
2. **Lịch tuần cũ chỉ còn từ chối và hủy.** `PATCH /api/weekly-requests/:id` với `accepted` trả 409. Từ chối (gia sư) và hủy (hai bên) giữ nguyên. Lịch tuần **đã nhận từ trước** vẫn giữ chỗ như hiện nay (không tự hủy, không tự chuyển đổi), để không ai bị mất lịch đột ngột.
3. **Gom việc đọc lịch tuần cũ về một chỗ:** tạo `server/legacy-weekly.js` với một hàm trả các khung thứ + giờ đang bị lịch tuần đã nhận giữ (theo gia sư và/hoặc học sinh). Thay bốn câu truy vấn rải rác ở `offers.js`, `inquiries.js`, `api.js` (`tutorRows`) bằng hàm này. Khi xóa mã ở Giai đoạn 2 chỉ cần xóa một chỗ.
4. **Giao diện lịch tuần cũ:**
   - Đổi tiêu đề khối thành "Lịch tuần (mẫu cũ)" kèm một dòng giải thích: mẫu này đã ngừng; hãy hủy và gửi Đề nghị học để có lịch theo ngày, điểm danh và đánh giá.
   - Bỏ nút "Nhận lịch tuần". Giữ Nhắn tin, Từ chối, Hủy.
   - Với học sinh, thêm liên kết "Gửi đề nghị học" tới hồ sơ gia sư (`/tutors/:id`).
5. **Buổi lẻ cũ còn chờ hoặc sắp diễn ra** (`offer_id IS NULL`): không đổi gì. `PATCH /api/bookings/:id` vẫn nhận, từ chối, hủy, hoàn thành như hiện tại. Chúng tự cạn dần vì không còn buổi mới.
6. **Đếm dữ liệu cũ cho admin:** `GET /api/admin` trả thêm `legacy` gồm số lịch tuần `pending`, số lịch tuần `accepted`, số buổi lẻ (`offer_id IS NULL`) đang `pending` hoặc `accepted` còn ở tương lai, và số giờ lẻ thủ công còn ở tương lai. Trang Admin hiện một dòng nhắc khi có số khác 0. Đây là căn cứ để bắt đầu Giai đoạn 2.
7. **Không đổi schema, không migration.** Không xóa bảng, cột, chỉ mục hay dữ liệu nào.

### Giai đoạn 2: xóa mã cũ (làm sau, tách issue riêng)

Bắt đầu khi số đếm ở mục 6 trên production **bằng 0**. Khi đó xóa `server/weekly-requests.js`, `server/legacy-weekly.js`, `components/weekly-requests.tsx`, phần thân của ba route đã đóng, và các nhánh `offer_id IS NULL` không còn cần. Bảng cũ có thể giữ lại để tra cứu lịch sử. Giai đoạn này nằm ngoài prompt bên dưới.

### Những thứ cố ý không đổi

- Bảng `slots` và cơ chế sinh giờ trống từ lịch tuần (`availability.js`): vẫn dùng để hiển thị giờ trống, mức hoàn thiện hồ sơ ở Tổng quan, và đề nghị học dùng lại slot khi nhận.
- Payload `slots` trong `GET /api/tutors/:id` (giao diện công khai không dùng, nhưng test dùng): để Giai đoạn 2.
- Máy trạng thái `PATCH /api/bookings/:id`, điểm danh, đánh giá theo cặp: không đụng.
- Ngữ cảnh tin nhắn `weekly-request`: giữ để tin nhắn cũ vẫn mở được.
- Xóa tài khoản vẫn hủy cả ba bảng.

## 7. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Có người dùng thật đang dựa vào lịch tuần cũ đã nhận | Không tự hủy; vẫn giữ chỗ; giao diện nhắc chuyển sang đề nghị học; admin thấy số lượng |
| Tab trình duyệt cũ gọi API đã đóng | 410 kèm thông báo rõ; giao diện hiện tại không gọi các API này |
| Viết lại test làm mất độ phủ | Mỗi kiểm tra cũ phải được giữ bằng đề nghị học hoặc dữ liệu cũ gieo thẳng vào DB (xem prompt mục 4) |
| Khác biệt Node và Cloudflare Worker | Không đổi schema; chạy `test/cloudflare-smoke.mjs` nếu có điều kiện |

## 8. Tiêu chí nghiệm thu

- [ ] `POST /api/bookings`, `POST /api/weekly-requests`, `POST /api/tutor/slots` trả 410 với thông báo tiếng Việt; không có bản ghi nào được tạo.
- [ ] Lịch tuần cũ: `accepted` trả 409; từ chối và hủy vẫn được; lịch tuần đã nhận trước đó vẫn chặn đúng giờ trong xem trước đề nghị học, trò chuyện tư vấn và danh sách gia sư công khai.
- [ ] Chỉ còn một nơi trong `server/` truy vấn `weekly_requests` để lấy giờ bị giữ (ngoài `weekly-requests.js`, `account-deletion.js` và `message-context.js`).
- [ ] Buổi lẻ cũ còn chờ vẫn nhận, từ chối, hủy, hoàn thành, đánh giá được như trước.
- [ ] Khối lịch tuần cũ không còn nút "Nhận lịch tuần" và có dòng giải thích; học sinh có liên kết gửi đề nghị học.
- [ ] `GET /api/admin` trả số đếm `legacy`; trang Admin hiện dòng nhắc khi khác 0; người không phải admin không thấy.
- [ ] Không có thay đổi schema.
- [ ] `npm run typecheck`, `npm test` qua; e2e bị ảnh hưởng đã cập nhật và qua; tài liệu đã cập nhật.

## 9. Kết quả (Giai đoạn 1)

**Đã làm**

- Ba API tạo cũ trả `410 Gone` ngay sau xác thực, trước mọi kiểm tra, không tạo bản ghi: `POST /api/bookings` và `POST /api/tutor/slots` ([server/api.js](../server/api.js)), `POST /api/weekly-requests` ([server/weekly-requests.js](../server/weekly-requests.js)). Thân xử lý cũ và import không còn dùng đã xóa.
- `PATCH /api/weekly-requests/:id` với `accepted` trả 409. Từ chối và hủy giữ nguyên, kể cả tin nhắn hệ thống. Kiểm tra 409 đặt sau kiểm tra quyền, nên người ngoài vẫn nhận 404 và học sinh vẫn nhận 403.
- Tạo [server/legacy-weekly.js](../server/legacy-weekly.js): `legacyWeeklyBlocks` (theo gia sư / học sinh), `legacyWeeklyBlocksByTutor` (một truy vấn cho danh sách gia sư, tránh N+1) và `legacyCounts`. `offers.js`, `inquiries.js`, `api.js` (`tutorRows`) đều dùng chúng; ngoài `weekly-requests.js`, `account-deletion.js`, `message-context.js` không còn nơi nào truy vấn `weekly_requests` để lấy giờ bị giữ.
- `GET /api/admin` trả `legacy` (`weekly_pending`, `weekly_accepted`, `one_off_open`, `manual_slots`). Trang Admin hiện một dòng nhắc khi có số khác 0 (`role="status"`).
- Khối lịch tuần cũ: tiêu đề "Lịch tuần (mẫu cũ)" kèm dòng giải thích, bỏ nút "Nhận lịch tuần", học sinh có liên kết "Gửi đề nghị học" tới `/tutors/:id`. `id` và `aria-label` của thẻ giữ nguyên.
- Không đổi schema, không migration, không đụng máy trạng thái `PATCH /api/bookings/:id`.

**Test**

- `test/api.test.js`: thêm helper `legacyLesson` và `legacyWeekly` (gieo thẳng vào DB). 9 test cũ được viết lại; thêm 1 test mới cho số đếm `legacy` và quyền truy cập `/api/admin`.
  - Kiểm tra vòng đời buổi lẻ (nhận, từ chối, hủy, hoàn thành, tin nhắn, đánh giá, quyền người ngoài, gia sư chưa công khai) giữ nguyên, dùng `legacyLesson`.
  - Các kiểm tra riêng của `POST /bookings` được thay bằng 410 + không tạo bản ghi. Bảo vệ tương đương: hai người cùng một slot chỉ còn một người giữ được (chỉ mục `reserved_slot`, kiểm bằng `assert.throws`); sai môn (thêm `ngu-van` vào danh sách đầu vào sai của đề nghị học); học sinh trùng giờ với gia sư khác (thêm vào test xung đột của đề nghị học, cả khi gỡ trùng); luật chồng lấn 2 giờ kiểm trực tiếp qua `overlaps`, là hàm mà xem trước đề nghị học cũng dùng.
  - Test lịch tuần viết lại hoàn toàn: tạo 410 (kể cả body sai), accepted 409, lịch đã nhận vẫn chặn đúng giờ trong xem trước đề nghị học, `POST /inquiries` và `weekly_blocks` công khai, hủy thì nhả giờ, từ chối khi pending, riêng tư giữ nguyên.
- E2E: `marketplace.spec.ts` (hai luồng) chuyển sang Đề nghị học; `message-context.spec.ts` dùng lịch tuần gieo trong `test/e2e-server.js`; `cloudflare-smoke.mjs` kiểm 410. `test/e2e-server.js` thêm hai tài khoản học sinh (`legacy-weekly`, `lesson-student`) để luồng của chúng không lẫn vào hội thoại và đề nghị của học sinh mẫu mà các spec khác đếm.

**Kết quả kiểm tra (11/11/2026)**

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | qua |
| `npm test` | 109/109 qua (trước khi sửa cũng không có test lỗi sẵn) |
| `npm run build` | qua |
| Playwright 4 spec bị ảnh hưởng | 29/29 qua |
| Playwright toàn bộ | 66/66 qua |
| Trình duyệt thật (cổng 4180, DB e2e) | Admin hiện dòng nhắc đúng số; học sinh thấy khối "Lịch tuần (mẫu cũ)" với đúng ba nút (Nhắn tin, Gửi đề nghị học, Hủy yêu cầu); không tràn ngang ở 320 px |
| `test/cloudflare-smoke.mjs` | **chưa chạy** (cần môi trường Worker); chỉ đổi assertion theo 410 |

**Lưu ý và điểm lệch so với phương án**

- Không có điểm lệch nào về hành vi. Tạo `legacyWeeklyBlocksByTutor` ngoài hàm nêu trong phương án, để `tutorRows` không phải truy vấn theo từng gia sư.
- Playwright phải chạy từ thư mục không nằm trong thư mục ẩn: `express.sendFile` từ chối đường dẫn chứa `.claude/`, làm `/favicon.ico` trả 404 khi chạy ngay trong worktree. Đây là đặc thù của vị trí worktree, không liên quan đến sửa đổi này.
- Test API vẫn dùng payload `slots` của `GET /api/tutors/:id` (cố ý giữ).

**Còn lại cho Giai đoạn 2**

Khi `legacy` trên production bằng 0: xóa `server/weekly-requests.js`, `server/legacy-weekly.js`, `app/src/components/weekly-requests.tsx`, ba route trả 410, các nhánh `offer_id IS NULL`, các helper test `legacyLesson`/`legacyWeekly` và hai tài khoản gieo ở `test/e2e-server.js`. Bảng cũ có thể giữ để tra cứu.

---

# PHẦN 2: PROMPT CHO AGENT

> Sao chép nguyên khối dưới đây gửi cho Agent mở trong thư mục dự án.

````text
Bạn là kỹ sư phần mềm cấp cao làm việc trong repo "Gia Sư 10 Điểm" (website tìm gia sư ở Việt Nam; Express 5 + SQLite, React 19 + Vite; production trên Cloudflare Worker + Durable Object SQLite). Nhiệm vụ: sửa Lỗi 10 "Ba cơ chế đặt lịch chồng nhau", GIAI ĐOẠN 1, theo đúng phương án đã chốt.

# 0. Nguồn sự thật

- Đọc toàn bộ `docs/loi-10-ba-co-che-dat-lich.md` trước khi viết mã. Phần 1 mục 6 là phương án đã chốt; mục 8 là tiêu chí nghiệm thu.
- Đọc thêm: `docs/marketplace.md`, `docs/architecture.md`, `docs/loi-04-danh-gia-gan-voi-buoi-hoc.md` (máy trạng thái buổi học hiện tại).
- Số dòng trong tài liệu theo commit `aee83c1`; mã có thể đã dịch. Tự tìm lại vị trí, KHÔNG sửa theo số dòng mù quáng.
- Nếu mã thực tế mâu thuẫn với tài liệu, hoặc gặp điểm không có trong phương án, DỪNG LẠI VÀ HỎI. Không tự thêm tính năng ngoài phạm vi.

# 1. Phạm vi

LÀM (Giai đoạn 1):
1. Đóng ba API tạo cũ bằng 410 Gone, thông báo tiếng Việt hướng sang Đề nghị học. Đặt kiểm tra 410 ngay sau `auth(...)`, trước mọi validate, để không tạo bản ghi nào:
   - `POST /api/bookings` (server/api.js): "Đặt buổi lẻ đã ngừng. Hãy gửi Đề nghị học theo khóa hoặc học thử từ hồ sơ gia sư."
   - `POST /api/weekly-requests` (server/weekly-requests.js): "Lịch học hằng tuần đã ngừng. Hãy gửi Đề nghị học từ hồ sơ gia sư."
   - `POST /api/tutor/slots` (server/api.js): "Thêm giờ lẻ đã ngừng. Hãy cập nhật Giờ trống hằng tuần."
   Xóa phần thân xử lý cũ của ba route này (giữ route trả 410). Gỡ import không còn dùng.
2. `PATCH /api/weekly-requests/:id`: `status: "accepted"` trả 409 "Lịch tuần mẫu cũ không còn nhận mới. Hãy trao đổi và gửi Đề nghị học." Giữ nguyên `declined` (chỉ gia sư, khi pending) và `cancelled` (hai bên, khi pending hoặc accepted), kể cả tin nhắn hệ thống ghi vào hội thoại.
3. Tạo `server/legacy-weekly.js`, export một hàm (ví dụ `legacyWeeklyBlocks(db, { tutorId, studentId })`) trả mảng `{ weekday, hour }` của mọi `weekly_requests` có `status='accepted'` thuộc gia sư hoặc học sinh đã cho. Thay các truy vấn rải rác bằng hàm này:
   - `server/offers.js` trong `preview()` (biến `legacy`).
   - `server/inquiries.js` (biến `reserved`).
   - `server/api.js` trong `tutorRows()` (subquery `reserved_weekly_blocks`; có thể giữ subquery nếu đổi sang hàm làm chậm danh sách; nếu giữ, ghi chú vì sao).
   Hành vi phải giữ y nguyên: lịch tuần đã nhận vẫn chặn đúng các giờ đó.
4. Giao diện `app/src/components/weekly-requests.tsx`:
   - Tiêu đề khối: "Lịch tuần (mẫu cũ)". Thêm một dòng: "Mẫu này đã ngừng. Hãy hủy và gửi Đề nghị học để có lịch theo ngày, điểm danh và đánh giá."
   - Bỏ nút "Nhận lịch tuần". Giữ Nhắn tin, Từ chối (gia sư, pending), Hủy yêu cầu.
   - Học sinh: thêm liên kết "Gửi đề nghị học" tới `/tutors/<tutor_id>`.
   - Giữ `id`, `aria-label` của thẻ (`Lịch học hằng tuần #<id>`) để liên kết từ tin nhắn cũ vẫn hoạt động.
5. Đếm dữ liệu cũ cho admin:
   - `GET /api/admin` trả thêm `legacy: { weekly_pending, weekly_accepted, one_off_open, manual_slots }`:
     - `weekly_pending`, `weekly_accepted`: số `weekly_requests` theo trạng thái.
     - `one_off_open`: số `bookings` có `offer_id IS NULL`, `status IN ('pending','accepted')` và `starts_at` ở tương lai.
     - `manual_slots`: số `slots` có `source='manual'`, `available=1`, `starts_at` ở tương lai và chưa có booking giữ chỗ.
   - `app/src/pages/Admin.tsx`: khi có số khác 0, hiện một dòng nhắc ngắn phía trên các tab, ví dụ "Dữ liệu lịch mẫu cũ còn hoạt động: 2 lịch tuần đã nhận, 1 buổi lẻ sắp tới…". Không thêm tab mới.
   - Cập nhật `AdminData` trong `app/src/lib/types.ts`.
6. Không đổi gì ở: máy trạng thái `PATCH /api/bookings/:id`, `POST /api/bookings/:id/start`, đánh giá, `availability.js`, Google Calendar, `.ics`, ngữ cảnh tin nhắn `weekly-request`, `account-deletion.js`.

KHÔNG LÀM:
- Không đổi schema, không migration, không xóa bảng/cột/chỉ mục/dữ liệu.
- Không tự hủy hay tự chuyển đổi lịch tuần cũ hoặc buổi lẻ cũ.
- Không xóa `server/weekly-requests.js` hay component lịch tuần (đó là Giai đoạn 2).
- Không đổi payload `slots` của `GET /api/tutors/:id`.
- Không làm Lỗi 7, 8 hay bất kỳ tính năng nào khác.

# 2. Bối cảnh mã cần biết

- `createApi` trong `server/api.js`, helper `fail(status, message)`, `auth(...)`, `audit(...)`, `transaction`, `all/one/run` từ `server/db.js`. Lỗi trả `{ error }` tiếng Việt.
- `bookings` chứa mọi buổi học thật: buổi lẻ cũ có `offer_id IS NULL`; buổi từ đề nghị có `offer_id`. Đề nghị học (`server/offers.js`) khi nhận sẽ `INSERT OR IGNORE INTO slots(... source 'offer' ...)` rồi tạo `bookings` `accepted`.
- `weekly_requests` không có ngày; khi nhận chỉ đổi `status`, không tạo `bookings`.
- `index.html` gốc là file sinh ra; không sửa tay.
- Giao diện tiếng Việt có dấu, không tràn ngang 320–1440 px, hỗ trợ bàn phím.

# 3. Cách làm

1. Tạo nhánh mới từ `main` mới nhất (ví dụ `fix/loi-10-booking-flows`). Không push, không mở PR trừ khi chủ dự án yêu cầu.
2. Trước khi sửa, chạy `npm run typecheck` và `npm test` để biết trạng thái gốc; ghi lại test nào vốn đã lỗi.
3. Làm theo thứ tự: server (mục 1.1–1.3, 1.5 phần API) → test API → giao diện (1.4, 1.5 phần Admin) → e2e → tài liệu.
4. Viết mã giống phong cách xung quanh (đặt tên, mật độ chú thích, dùng lại tiện ích sẵn có). Không thêm thư viện.

# 4. Test phải cập nhật (giữ nguyên độ phủ)

Nguyên tắc: mỗi kiểm tra cũ hoặc được giữ, hoặc được thay bằng kiểm tra tương đương. Không được xóa kiểm tra để "cho qua".

API (`test/api.test.js`; các test ở khoảng dòng 241, 408, 1087, 1219, 1264, 1449, 1506, 1578, 1735 tại commit `aee83c1`):
- Thêm helper gieo dữ liệu cũ thẳng vào DB (dùng `run` trên `db` của `fixture`):
  - `legacyLesson(db, { studentId, tutorId, slot, subject, status })`: tạo booking `offer_id IS NULL` trên một slot có sẵn, mô phỏng buổi lẻ cũ.
  - `legacyWeekly(db, { studentId, tutorId, blocks, status })`: tạo `inquiries` (INSERT OR IGNORE) và `weekly_requests`.
- Test chỉ dùng `POST /bookings` để có một buổi rồi kiểm vòng đời (nhận, từ chối, hủy, hoàn thành, tin nhắn, đánh giá, quyền người ngoài, gia sư chưa công khai không nhận được): đổi sang `legacyLesson`.
- Kiểm tra riêng của `POST /bookings` (sai môn → 400, hai người đặt đồng thời → 201/409, học sinh trùng giờ với gia sư khác → 409): thay bằng `POST /bookings` → 410 và không tạo bản ghi. Rồi KIỂM TRA xem test đề nghị học đã phủ bảo vệ tương đương chưa ("offers reject invalid dates and availability, recheck conflicts atomically…", "dated offers preview…", "free trials…"). Bảo vệ nào chưa được phủ cho đề nghị học thì thêm assertion vào test đề nghị học.
- Test lịch tuần ("weekly requests validate availability…"): viết lại cho hành vi mới: tạo → 410; dữ liệu gieo bằng `legacyWeekly`; `accepted` → 409; từ chối, hủy vẫn được và có tin nhắn hệ thống; quyền riêng tư (người ngoài 404) giữ nguyên; lịch tuần đã nhận vẫn chặn giờ trong `POST /offers/preview`, `POST /inquiries` và bị bỏ khỏi `weekly_blocks` của `GET /tutors`.
- Test dùng `POST /tutor/slots`: đổi sang kiểm 410; nếu cần giờ lẻ cũ để kiểm hành vi khác thì gieo thẳng vào `slots` với `source='manual'`.
- Test ngữ cảnh tin nhắn: tạo lịch tuần bằng `legacyWeekly`.
- Test mới: `GET /api/admin` trả `legacy` đúng số đếm; học sinh và gia sư gọi `/api/admin` vẫn bị 403.

E2E:
- `test/e2e/marketplace.spec.ts` test "student booking, tutor acceptance and persistent two-way messages": chuyển sang luồng đề nghị học (học sinh `POST /api/offers` 1 tuần, gia sư chấp nhận trên giao diện `/app/offers`), giữ kiểm tra lịch hiện "Đã xác nhận" và nhắn tin hai chiều sau tải lại.
- Cùng file, đoạn đặt buổi trên slot hằng tuần để kiểm file `.ics`: thay bằng đề nghị học 1 tuần trên đúng khung đó, gia sư chấp nhận qua API, rồi kiểm `.ics` như cũ.
- `test/e2e/message-context.spec.ts` test "existing weekly requests link their messages back to the exact weekly card": gieo một lịch tuần cũ `pending` trong `test/e2e-server.js` (trước `startServer`, giữa `community-parent` và gia sư `nam`), test dùng bản ghi đó thay vì gọi API tạo.
- `test/cloudflare-smoke.mjs`: `POST /api/tutor/slots` → kiểm 410; bỏ các assertion phụ thuộc giờ lẻ thủ công.
- Chạy ít nhất các spec bị ảnh hưởng: `npx playwright test test/e2e/marketplace.spec.ts test/e2e/message-context.spec.ts test/e2e/offers.spec.ts test/e2e/schedule.spec.ts` (sau `npm run build`).

# 5. Tài liệu phải cập nhật

- `docs/marketplace.md`: luồng chính và bảng quy tắc nói rõ chỉ còn Đề nghị học; buổi lẻ và lịch tuần là dữ liệu cũ, chỉ xử lý nốt.
- `docs/architecture.md`: bảng API (bỏ `POST tutor/slots`, `POST bookings` khỏi danh sách đang dùng; ghi 410), thêm `server/legacy-weekly.js`.
- `docs/cloudflare-deployment.md`: đoạn về `weekly_requests`.
- `README.md`: mục Chức năng nếu còn nói đặt buổi lẻ.
- `docs/loi-10-ba-co-che-dat-lich.md`: đổi "Trạng thái" thành đã sửa Giai đoạn 1, thêm mục "Kết quả" cuối Phần 1 (đã làm gì, file chính, kết quả kiểm tra, điểm lệch so với phương án nếu có).

# 6. Kiểm chứng trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npx playwright test test/e2e/marketplace.spec.ts test/e2e/message-context.spec.ts test/e2e/offers.spec.ts test/e2e/schedule.spec.ts
```

Chạy thật trên trình duyệt (`npm run dev`, tài khoản mẫu sau `npm run seed:demo`): gia sư mở Đề nghị học thấy khối "Lịch tuần (mẫu cũ)" khi có dữ liệu cũ, không có nút nhận; admin thấy dòng nhắc số lượng. Kiểm tra console không lỗi, không tràn ngang ở 320 px.

Báo kết quả thật: lệnh nào qua, lệnh nào lỗi (kể cả lỗi có sẵn trước khi sửa), phần nào chưa kiểm tra.

# 7. Báo cáo cuối (tiếng Việt, ngắn gọn)

1. Đã làm gì, các file chính.
2. Đối chiếu từng ô "Tiêu chí nghiệm thu" (Phần 1 mục 8): ô nào đã kiểm chứng, bằng cách nào; ô nào chưa.
3. Test nào được viết lại và kiểm tra cũ nào được thay bằng kiểm tra tương đương ở đâu.
4. Điểm lệch so với phương án và lý do.
5. Việc còn lại cho Giai đoạn 2.
````
