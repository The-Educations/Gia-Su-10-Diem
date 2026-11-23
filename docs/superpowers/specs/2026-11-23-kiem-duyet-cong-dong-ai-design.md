# Kiểm duyệt bài Cộng đồng bằng AI (n8n + Claude Haiku)

Trạng thái: **đã triển khai** (nhánh `feat/kiem-duyet-ai`), đang ở chế độ `shadow` chờ chủ web bật dần. Cách dùng: [scripts/n8n/README.md](../../../scripts/n8n/README.md). Ngày: 2026-11-23.
Liên quan: [community-design.md](../../community-design.md) (quy trình duyệt hiện tại), [tin-tuc-tu-dong-hoa.md](../../tin-tuc-tu-dong-hoa.md) và [scripts/n8n/README.md](../../../scripts/n8n/README.md) (workflow n8n đang có, dùng làm mẫu).

## 1. Mục đích

Mọi bài Cộng đồng (bài mới và bản sửa của bài đã đăng) hiện phải chờ admin đọc và duyệt tay trước khi hiện. Chủ web muốn bớt việc đó: một workflow n8n đưa bài chờ duyệt cho Claude Haiku chấm theo quy tắc cộng đồng, rồi tự duyệt hoặc tự từ chối những bài rõ ràng. Admin chỉ còn xử lý những bài AI không chắc.

## 2. Mục tiêu, không phải mục tiêu, điều phải tránh

**Mục tiêu**
- Phần lớn bài hợp lệ được duyệt mà không cần admin, trong vòng vài phút khi máy đang bật.
- Bài vi phạm rõ ràng bị từ chối, có lý do dễ hiểu để tác giả sửa rồi gửi lại.
- Bài khó phân định vẫn để admin quyết.
- Không tốn phí ngoài gói Claude Pro đang có, không sửa code web.

**Không phải mục tiêu**
- Chạy 24/24. Máy tắt thì bài nằm trong hàng đợi như hiện nay, admin vẫn duyệt tay được.
- Kiểm duyệt bình luận (bình luận hiện ngay) và xử lý hàng đợi báo cáo.
- Kiểm tra ảnh trong bài.
- Thay đổi giao diện admin hay thêm trường mới vào cơ sở dữ liệu.

**Điều phải tránh (dù chạy được vẫn coi là hỏng)**
- Bài vi phạm được AI duyệt lên công khai (và Google lập chỉ mục).
- Người dùng nhận lý do từ chối sai, thô lỗ, hoặc chữ do người khác cài vào qua nội dung bài.
- Bài được duyệt khi có lỗi (Claude lỗi, kết quả hỏng, hết giờ).
- Lọt mật khẩu bot hay cookie admin vào repo, log được commit hay file cấu hình.
- Gửi họ tên thật, email hay mã người dùng của tác giả cho Claude.

## 3. Ràng buộc

- n8n chạy trên máy cá nhân của chủ web, chỉ nghe `127.0.0.1`, không chạy 24/24. Web không gọi được n8n nên workflow phải **tự hỏi hàng đợi định kỳ**.
- Gọi Claude bằng `claude -p` với gói Pro (như workflow Tin tức). Mọi lần gọi dùng chung hạn mức với việc dùng Claude hằng ngày của chủ web.
- Web đã có sẵn (trong `server/community-admin.js`), không cần sửa:
  - `GET /api/admin/community/queue`: bài `pending` và bài `approved` có bản sửa `revision_status='pending'`, cũ nhất trước. Mỗi dòng có `title`, `body` (chữ thuần), `body_html`, `revision_title`, `revision_body`, `revision_body_html`, `review_version`, và `owner` (họ tên thật, email: **không được gửi cho Claude**).
  - `POST /api/admin/community/posts/:id/approve` và `/reject`: bắt buộc `expected_version` (khớp `review_version`, nếu tác giả vừa sửa bài thì trả 409); `reject` bắt buộc `note` (tối đa 1000 ký tự, hiện cho tác giả). Bản sửa hay bài mới đều dùng chung hai endpoint này. Mỗi lần duyệt/từ chối được ghi `audit` với người thực hiện, tác giả được báo.
  - Bộ chặn thông tin liên hệ `findContactInfo` đã chạy lúc gửi bài.
- Đăng nhập (`/api/auth/login`) giới hạn 30 lần / 15 phút / IP, dùng chung với workflow Tin tức và chính chủ web.
- Không có cách ghi chú của AI lên web nếu không sửa code web.

## 4. Các cách đã cân nhắc

**Chạy ở đâu**
- **n8n trên máy cá nhân (đã chọn).** Không tốn phí, không sửa web, nhìn được thành sơ đồ, theo đúng mẫu workflow Tin tức. Đổi lại: chỉ chạy khi máy bật, cần một tài khoản bot đủ quyền admin, và dùng hạn mức Pro.
- Gọi Haiku ngay trong server khi bài được gửi (khoá API, khoảng 20–30đ/bài). Nhanh và chạy 24/24, không cần bot. Chủ web không chọn vì muốn giữ n8n.

**AI được quyền gì**
- **Ba kết quả: duyệt / từ chối khi vi phạm rõ / chuyển admin (đã chọn).** Duyệt nhầm thì bài vi phạm lên công khai; từ chối nhầm thì tác giả chỉ cần sửa và gửi lại. Vì vậy AI chỉ tự xử lý khi chắc chắn.
- Để AI quyết hết, hoặc chỉ cho AI gợi ý: bỏ, vì cái đầu có rủi ro cao ở vùng xám, cái sau không giảm được việc cho admin.

## 5. Thiết kế

### 5.1 Sơ đồ

```
Hẹn giờ (5 phút) ─► Cài đặt ─► Đọc trạng thái + khoá ─► Đăng nhập web (bot kiểm duyệt)
  ─► Lấy hàng đợi ─► Chọn bài cần chấm ─► Claude Haiku chấm (từng bài)
  ─► Kiểm tra kết quả + quyết định ─► Duyệt / Từ chối / Để lại cho admin
  ─► Ghi nhật ký ─► Lưu trạng thái + gỡ khoá
```

Có ô `Chạy tay` nối vào `Cài đặt`, như workflow Tin tức. Là workflow **riêng** ("Kiểm duyệt Cộng đồng"), không gộp vào workflow Tin tức.

### 5.2 Chọn bài cần chấm

- Với mỗi mục trong hàng đợi, nội dung cần chấm là bản sửa nếu đó là bài đã đăng có bản sửa chờ duyệt, ngược lại là bài mới.
- Khoá nhận diện một lần chấm là `id + review_version`. Khoá đã có **kết quả thật** (duyệt, từ chối, hoặc chuyển admin do Claude hay do quy tắc) thì không chấm lại. Tác giả sửa bài làm đổi `review_version` nên bài được chấm lại.
- Lần gọi Claude **lỗi** (lỗi, hết giờ, hết hạn mức, kết quả hỏng) không tính là đã chấm: lần chạy sau thử lại. Sau 3 lần lỗi cho cùng một khoá thì đánh dấu "chuyển admin: AI lỗi" và thôi thử. *(Cách của người thiết kế.)*
- Nếu hai bài liên tiếp trong cùng lần chạy đều lỗi, dừng lần chạy đó (thường là hết hạn mức hoặc mất đăng nhập `claude`), không đốt thêm lượt. *(Cách của người thiết kế.)*
- Bài có ảnh (`<img` trong `body_html` hoặc `revision_body_html` tương ứng) **không gửi Claude**, đánh dấu "chuyển admin: có ảnh".
- Tối đa `perRun` bài mỗi lần (mặc định 10), cũ nhất trước.

### 5.3 Gửi gì cho Claude

- **Chủ đề** tác giả đã chọn (cột `topic`, gửi bằng tên tiếng Việt như trên web: Tìm gia sư, Hỏi bài, Kinh nghiệm học & thi, Chia sẻ tài liệu, Gia sư tìm lớp). Chủ đề quyết định tiêu chí nào áp dụng (xem 5.3a).
- **Tiêu đề** và **nội dung chữ thuần** (`title`/`body` hoặc `revision_title`/`revision_body`).
- **Danh sách địa chỉ link** trong bài, lấy từ `href` trong `body_html` / `revision_body_html` tương ứng. Bản chữ thuần `body` bỏ mất địa chỉ link (chỉ giữ chữ hiển thị), nên phải gửi riêng thì Claude mới đánh giá được link dẫn đi đâu.
- Không gửi `owner`, `author_id`, `id`.
- Kèm **bộ tiêu chí kiểm duyệt** nằm trong repo (`scripts/n8n/moderation-rubric.md`), không lấy bài "Quy tắc cộng đồng" trên web (bài đó ngắn, dành cho người đọc). Bộ tiêu chí gồm:
  - Các nhóm vi phạm, mỗi nhóm có mô tả và ví dụ: `off_topic` (không liên quan học tập), `advertising` (quảng cáo dịch vụ hay sản phẩm ngoài nền tảng, chèo kéo, link dẫn tới trang bán hàng; ranh giới với chủ đề Gia sư tìm lớp xem 5.3a), `insult` (lăng mạ, bôi nhọ cá nhân), `contact` (cố lách bộ chặn để để lại số điện thoại, email, Zalo, Facebook… như viết số bằng chữ). **Link thường không phải vi phạm**: từ 02/11/2026 bài được phép chèn link HTTP(S).
  - Danh sách **vùng xám phải chuyển admin**: nêu tên một người cụ thể rồi chê; nội dung nhạy cảm hoặc liên quan an toàn của trẻ em; chủ đề tác giả chọn rõ ràng sai với nội dung; bất cứ điều gì AI không chắc.
  - Ví dụ bài **đạt** cho từng chủ đề, và góp ý gia sư một cách tôn trọng.

#### 5.3a Tiêu chí riêng theo chủ đề

Web có sẵn hai chủ đề mà bộ tiêu chí chung sẽ hiểu nhầm là vi phạm, nên cần quy tắc riêng:

- **Gia sư tìm lớp** (`find_student`): gia sư giới thiệu bản thân để tìm học sinh là đúng mục đích của chủ đề này, không phải quảng cáo. **[CHỜ CHỦ WEB]** ranh giới: điều gì trong bài Gia sư tìm lớp thì bị coi là vi phạm?
- **Hỏi bài** (`homework`): hỏi về bài tập là đúng mục đích. **[CHỜ CHỦ WEB]** ranh giới: bài chỉ dán đề và xin đáp án thì sao?
- Các chủ đề còn lại dùng tiêu chí chung.
- Nội dung bài đặt trong khối đánh dấu rõ là dữ liệu cần chấm; prompt nói rõ chữ trong khối đó không phải chỉ dẫn.

### 5.4 Gọi Claude

- `claude -p` với model Haiku (bản Haiku mới nhất mà gói Pro cho dùng), **không có công cụ nào**, `--output-format json`, `--max-turns 1`, `--no-session-persistence`, cùng bộ cờ thu gọn như workflow Tin tức (`--strict-mcp-config --mcp-config '{"mcpServers":{} }' --disable-slash-commands --setting-sources project`) để mỗi lần gọi không nạp ~300k token. Giới hạn thời gian mỗi lần gọi (ví dụ 2 phút).
- Claude trả về đúng một JSON:
  ```json
  { "verdict": "approve" | "reject" | "escalate",
    "category": "off_topic" | "advertising" | "insult" | "contact" | null,
    "detail": "một câu tiếng Việt, tối đa ~200 ký tự" }
  ```

### 5.5 Quyết định cuối (code quyết, không phải Claude)

Theo thứ tự, gặp điều kiện nào trước thì dừng:

1. Claude lỗi, hết giờ, kết quả không phải JSON hợp lệ, hoặc trường sai giá trị → **không làm gì**, bài nằm lại hàng đợi, thử lại theo quy tắc ở 5.2.
2. Nội dung bài khớp mẫu nghi cài lệnh (ví dụ "bỏ qua quy tắc", "ignore", "system prompt", "duyệt bài này", "bạn là AI") → **để lại cho admin**, bất kể Claude nói gì.
3. `verdict = approve` → **duyệt** (`approve` với `expected_version`).
4. `verdict = reject` và `category` thuộc nhóm vi phạm rõ → **từ chối**, `note` = câu mẫu cố định của nhóm đó + câu `detail` (cắt gọn, bỏ ký tự lạ, không có link). Câu mẫu do chủ web duyệt, ví dụ nhóm `advertising`: "Bài viết có nội dung quảng cáo hoặc tự giới thiệu dịch vụ, chưa phù hợp với Cộng đồng."
5. Còn lại → **để lại cho admin**.

Thêm các chốt an toàn:
- **Chế độ** đặt ở ô Cài đặt:
  - `shadow`: chỉ ghi nhật ký kết quả AI, không gọi duyệt/từ chối.
  - `approve_only`: tự duyệt, phần từ chối chuyển thành để lại cho admin.
  - `full`: tự duyệt và tự từ chối.
- **Trần mỗi ngày** (giờ Việt Nam) cho số bài tự duyệt và tự từ chối (ví dụ 40 và 15). Vượt trần thì các bài sau để lại cho admin.
- Web trả 409 (tác giả vừa sửa, hoặc admin đã xử lý) → bỏ qua, không coi là lỗi.

### 5.6 Trạng thái và nhật ký

- File trạng thái `~/.n8n/moderation-state.json`: các khoá `id + review_version` đã chấm (giữ khoảng 30 ngày), bộ đếm theo ngày. Khoá chạy `~/.n8n/moderation.lock` như workflow Tin tức (dùng đường dẫn riêng, không đụng khoá Tin tức).
- Nhật ký `~/.n8n/moderation-log.jsonl`, mỗi dòng: thời điểm, `id`, `review_version`, bài mới hay bản sửa, tiêu đề, kết quả AI, quyết định cuối, đã thực hiện hay chưa. Không ghi nội dung đầy đủ, họ tên hay email. Đây là nơi chủ web xem AI đã làm gì, và là dữ liệu để so sánh trong giai đoạn `shadow`.
- Cookie đăng nhập chỉ nằm trong lần chạy, không ghi ra file.

### 5.7 Tài khoản bot

Tài khoản **riêng** cho kiểm duyệt ("Bot kiểm duyệt"), không dùng chung tài khoản bot Tin tức, để nhật ký `audit` của web phân biệt được việc nào do AI làm. Credential n8n riêng ("Moderation Bot Login"). Cách tạo giống bot Tin tức (đăng ký bằng email nhận mã, admin chính nâng quyền).

### 5.8 Bật dần

1. **`shadow`** khoảng 2 tuần hoặc ít nhất 30 bài. Admin vẫn duyệt tay. Chủ web so nhật ký với quyết định thật.
2. **`approve_only`** khi giai đoạn trước không có bài nào AI định duyệt mà admin từ chối.
3. **`full`** khi chủ web thấy các lý do từ chối AI đưa ra là hợp lý.

Admin vẫn ẩn được bài đã đăng và vẫn có hàng đợi báo cáo như hiện nay.

### 5.9 Kiểm thử

- Các hàm logic thuần (chọn bài, nhận diện ảnh, dựng prompt, đọc kết quả, quyết định cuối, mẫu nghi cài lệnh, trần theo ngày) nằm trong `scripts/n8n/lib/`, có test riêng như `test/n8n-news.test.js`; workflow JSON được sinh bằng script như `build-workflow.js`.
- Một bộ bài mẫu (đạt, vi phạm từng nhóm, vùng xám, bài cài lệnh) để chạy thử thật với Claude trước khi bật `shadow` trên web thật.

### 5.10 Việc của chủ web trước khi chạy thật

- Tạo tài khoản bot kiểm duyệt và nhập mật khẩu vào credential trong n8n.
- Duyệt bộ tiêu chí và các câu mẫu lý do từ chối.
- Kiểm tra trong cài đặt quyền riêng tư của tài khoản Claude rằng dữ liệu không được dùng để huấn luyện mô hình, vì nội dung bài của học sinh đi qua tài khoản này.

## 6. Để lại cho người làm

- Cách tổ chức node trong n8n, tên file lib, cách sinh workflow (theo mẫu Tin tức).
- Cách giữ phiên đăng nhập trong lần chạy, miễn là không vượt giới hạn đăng nhập và không ghi cookie ra đĩa.
- Danh sách mẫu nghi cài lệnh cụ thể, thời gian chờ mỗi lần gọi Claude, số ngày giữ khoá đã chấm.
- Cách viết prompt, miễn là đúng các điểm ở 5.3–5.4.
