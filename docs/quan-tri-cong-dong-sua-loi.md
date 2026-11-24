# Quản trị Cộng đồng: sửa lỗi và dọn thừa

Ngày soạn: 2026-11-24. Trạng thái: bản thảo, đã chốt hướng với chủ dự án, **chưa triển khai**.

Tài liệu có hai phần:

- **Phần 1** mô tả hệ thống hiện tại, 8 vấn đề tìm được khi rà soát, và thiết kế đã chốt cho từng vấn đề.
- **Phần 2** là prompt giao cho model triển khai.

Mọi đường dẫn file tính từ gốc repo. Code được đọc trên `main` tại commit `d75ba09`.

---

# PHẦN 1. THIẾT KẾ VÀ LOGIC

## 1.1. Bối cảnh hệ thống

### Kiến trúc

- **Web:** API kiểu Express trong `server/*.js`. Trên production, code chạy trong một Cloudflare Durable Object (`worker/index.js`), dùng SQLite qua `ctx.storage.sql`. Khi chạy test, database là better-sqlite với `PRAGMA foreign_keys=ON`.
- **Frontend:** React + Vite trong `app/src`. Trang quản trị Cộng đồng là `app/src/pages/AdminCommunity.tsx`.
- **Bot kiểm duyệt:** một workflow n8n chạy trên máy cá nhân của chủ dự án.
  - Workflow: "Kiểm duyệt Cộng đồng", id `x9vNWZjqXJHAPOSd`, chạy mỗi 5 phút, chế độ `full`.
  - Bot đăng nhập web bằng một tài khoản admin riêng (credential "Moderation Bot Login"). Nó gọi Claude Haiku để chấm bài rồi gọi API duyệt hoặc từ chối.
  - Mã nguồn: `scripts/n8n/lib/moderation.js`, `scripts/n8n/moderation-rubric.md` và `scripts/n8n/build-moderation-workflow.js`. Lệnh build sinh ra `scripts/n8n/moderation-workflow.json`.

### Vòng đời một bài Cộng đồng (`community_posts`)

- `status` nhận một trong các giá trị: `pending`, `approved`, `rejected`, `hidden`, `deleted`.
- Bài mới của người dùng thường bắt đầu ở `pending`. Admin hoặc bot duyệt thì chuyển sang `approved`, từ chối thì sang `rejected`.
- Tác giả sửa một bài đã `approved`:
  - Bản sửa nằm ở `revision_title`, `revision_body`, `revision_body_html`, với `revision_status='pending'`.
  - `review_version` tăng thêm 1.
  - Duyệt bản sửa thì nội dung mới chép đè lên bài. Từ chối thì `revision_status` thành `rejected` và bài gốc vẫn hiện.
- `approved` chuyển sang `hidden` khi admin bấm "Ẩn". Từ `hidden` có thể "Khôi phục" về `approved`.
- Hiện có hai đường vào `deleted`:
  - Admin bấm "Xóa" một bài `hidden`, qua `POST /api/admin/community/posts/:id/delete`.
  - Tác giả tự xoá bài, qua `DELETE /api/community/posts/:id` trong `server/community.js`.
- Từ `deleted`, admin có thể bấm "Khôi phục về Đã ẩn" (`undelete`) hoặc "Xóa vĩnh viễn" (`DELETE /api/admin/community/posts/:id`).
- Hàm `purgeExpired` chạy mỗi lần admin mở `GET .../summary` hoặc `GET .../posts`. Nó xoá vĩnh viễn các bài `deleted` quá 30 ngày.

### Khoá chống ghi đè

- Lệnh `approve` và `reject` bắt buộc có `expected_version`, và giá trị này phải bằng `review_version` hiện tại. Lệch thì web trả 409.
- Bài không còn chờ duyệt cũng trả 409 ("Bài không còn chờ duyệt.").

### Hợp đồng giữa bot và web

Đây là phần **không được phá**. Bot chỉ dùng đúng các thứ sau:

1. `POST /api/auth/login`.
2. `GET /api/admin/community/queue`. Endpoint này trả về `SELECT *`, cộng thêm `owner`. Bot đọc các trường: `id`, `status`, `review_version`, `revision_status`, `title`, `body`, `body_html`, `revision_title`, `revision_body`, `revision_body_html`, `topic`, `created_at`.
3. `POST /api/admin/community/posts/:id/approve` và `POST /api/admin/community/posts/:id/reject`, với body `{ expected_version, note }`. Bot đọc `statusCode` (200 hoặc 409) và `body.error`. Trường `body.error` được ghi vào nhật ký dưới tên `webMessage`.
4. Khoá để bot biết một bài đã chấm hay chưa là `id:review_version:created_at` (PR #137). Bot không chấm lại một khoá đã có.

CI chạy `test/n8n-moderation-workflow.test.js` trên code web thật, thông qua `test/community-fixture.js`. Nếu hợp đồng bị phá, CI đỏ.

### Hai đường gửi email

1. **`community_mail` cùng `sendAdminEmail`.** Đây là đường đang dùng cho email kiểm duyệt Cộng đồng, nằm ở `server/community-mail.js`.
   - Hộp thư gửi là hộp admin của Mailflare (`admin@giasudiem10.online`, env `MAILFLARE_ADMIN_API_KEY` / `MAILFLARE_ADMIN_MAILBOX_ID`).
   - Lệnh approve/reject/hide/xoá bình luận phải **chờ** gửi email xong mới trả response.
   - Gửi lỗi thì một dòng hiện lên khung "Email chưa gửi" trong admin (`app/src/components/community/PendingMail.tsx`), có nút "Gửi lại email" và "Bỏ qua".
   - **Trên production, đường này đang gửi lỗi.**
   - `sendAdminEmail` còn được dùng cho email `profile_update` (hồ sơ gia sư). Chỗ đó **giữ nguyên**.
2. **`email_outbox`.** Đây là hàng đợi chung, dùng cho đề nghị học, tiền và buổi học.
   - Code nằm ở `server/notifications.js` và `server/notice-mail.js`.
   - Có các bảng `EMAIL_KINDS` và `EMAIL_TOPICS = ["proposals","money","lessons"]`. Người dùng bật hoặc tắt từng nhóm trong Cài đặt → Thông báo.
   - `createNoticeMailer` gửi mỗi lượt 10 email, tự thử lại tối đa 5 lần. Nó chạy sau mỗi request không phải GET, qua alarm `wakeMail` trong `worker/index.js`. Nội dung email lấy từ các mẫu trong `LINES`.

### Hai hệ thông báo trong web (dễ nhầm)

- **`notifications`:** thông báo chung của app, ghi bởi `notify(db, userId, kind, {actor, subject, link})` trong `server/notifications.js`. Hàm này **vừa** ghi chuông thông báo **vừa** xếp email.
- **`community_notifications`:** thông báo riêng của Cộng đồng, ghi bởi `notify(user, kind, post, comment)` khai báo trong `server/community.js`, rồi truyền vào `community-admin.js`. Các kind gồm `post_approved`, `post_rejected`, `post_hidden`, `revision_approved`, `revision_rejected`, `profile_removed`, ...
- Chuông `app/src/components/notification-bell.tsx` gộp cả hai nguồn.
- ⇒ Email kiểm duyệt **không được** đi qua `notify()` chung, vì như vậy chuông sẽ hiện mỗi việc hai lần. Phải dùng một hàm chỉ xếp email (mục 5).

### Các bảng gắn với một bài

| Bảng | Khi xoá dòng bài thì sao |
|---|---|
| `community_comments`, `community_follows`, `community_notifications`, `community_post_images`, `community_reactions` | Có `FOREIGN KEY ... ON DELETE CASCADE`, nên tự xoá theo. |
| `community_reports` | **Không có khoá ngoại** (`target_type` + `target_id` + `part`), nên **còn lại**. |
| `proposals.post_id` | Đề nghị học của gia sư vào bài "Tìm gia sư". Cột được thêm bằng ALTER trong `server/community-topics.js`, **không có khoá ngoại**, nên **còn lại**. Bảng này có trường tiền: `credits`, `boost`, tiền tạm giữ. |
| `community_mail` | Code chỉ xoá các dòng chưa gửi. |
| `community_images` | Ảnh không còn được tham chiếu sẽ bị một tác vụ quét có sẵn xoá sau 1 ngày (`server/community-images.js`). |

## 1.2. Tám vấn đề tìm được khi rà soát

| # | Vấn đề | Mức độ |
|---|---|---|
| 1 | Xoá vĩnh viễn rồi id bị dùng lại, nên báo cáo và đề nghị học cũ dính sang bài mới | **Lỗi dữ liệu, đã tái hiện** |
| 2 | Không có chỗ xem bài bị từ chối, nên không kiểm tra được bot từ chối sai | Thiếu |
| 3 | Bài bot chuyển admin không kèm lý do AI | Thiếu |
| 4 | Báo cáo hiện mỗi người một thẻ, và không tự đóng khi đã xử lý nội dung | Thừa / thiếu |
| 5 | Khung "Email chưa gửi" (Gửi lại / Bỏ qua) thừa, và đường email phía sau đang hỏng | Thừa + lỗi |
| 6 | Ẩn → Xóa → Đã xóa → Xóa vĩnh viễn có quá nhiều tầng; admin còn khôi phục được bài tác giả tự xoá | Thừa / sai |
| 7 | Tab "Thông báo & Quy tắc" chỉ có chức năng sửa Quy tắc | Tên sai |
| 8 | Bấm Duyệt mở một hộp xác nhận trống | Thừa |

Thứ tự đã chốt: **Đợt 1** gồm mục 1, 5, 6. **Đợt 2** gồm mục 2, 3. **Đợt 3** gồm mục 4, 7, 8. Mỗi đợt là một PR riêng.

## 1.3. Thiết kế chi tiết từng mục

### Mục 1. Không xoá hẳn dòng bài (tombstone)

**Gốc lỗi**

- `community_posts.id` là `INTEGER PRIMARY KEY` không có `AUTOINCREMENT`. Khi dòng có id lớn nhất bị xoá, SQLite cấp lại id đó cho bài kế tiếp.
- Hàm `purge()` trong `server/community-admin.js` chỉ chạy `DELETE FROM community_posts` và xoá `community_mail` chưa gửi.

**Đã tái hiện bằng test**

1. Xoá vĩnh viễn bài 2, rồi đăng một bài mới. Bài mới nhận lại id 2.
2. Tab Báo cáo hiện báo cáo cũ ("Quảng cáo", ghi chú "bài cũ") gắn vào tiêu đề của bài mới.
3. Một bình luận cũ bị báo cáo trở thành báo cáo mồ côi.
4. Người từng báo cáo bài cũ không báo cáo được bài mới, vì gặp lỗi 409 "Bạn đã báo cáo nội dung này".

Tương tự, `proposals.post_id` cũ dính vào bài mới. Bộ đếm `pitches` bị sai, và gia sư cũ bị chặn ("Bạn đã gửi hồ sơ vào bài này"). Đường dẫn `/community/2` mà Google đã lưu cũng trỏ sang một bài khác.

**Thiết kế: giữ dòng bài, xoá nội dung**

- **Migration:** thêm cột `purged_at TEXT` (nullable) vào `community_posts`, theo đúng kiểu `PRAGMA table_info` rồi `ALTER TABLE` đang dùng trong `server/community-schema.js`.
- **`purge(rows, actorId, auto)` mới.** Mọi bước dưới đây chạy trong một transaction, với mỗi bài:
  1. Lấy danh sách id bình luận của bài **trước** khi xoá.
  2. Đóng các báo cáo đang mở nhắm vào bài (`target_type='post' AND target_id=?`) và vào các bình luận vừa lấy. Đặt `status='resolved'`, `resolved_by=actorId` (có thể là null khi tự động) và `resolution='Nội dung đã bị xóa vĩnh viễn.'`. Báo cáo đã đóng thì để nguyên, giữ làm lịch sử.
  3. Xoá `community_comments`, `community_reactions`, `community_follows`, `community_notifications`, `community_post_images` của bài. Các bảng này không còn tự xoá theo vì dòng bài không bị xoá.
  4. Xoá `community_mail` chưa gửi của bài, nếu bảng vẫn còn tới lúc này (sau mục 5 thì bỏ bước này).
  5. Cập nhật dòng bài: `title=''`, `body=''`, `body_html=''`, `search_text=''`, `revision_title=NULL`, `revision_body=NULL`, `revision_body_html=''`, `revision_status=NULL`, `review_note=''`, `revision_note=''`, `status='deleted'`, `purged_at=CURRENT_TIMESTAMP`, `updated_at=CURRENT_TIMESTAMP`. Giữ `author_id`, `kind`, `created_at` và `topic` (nếu có).
  6. Ghi audit `community.post.purge` với `id`, `title` cũ, `author_id` và `auto`. Audit là nơi duy nhất còn giữ tiêu đề cũ.
- **Không đụng `proposals`.** Đây là dữ liệu tiền. Đề nghị vẫn gắn vào bài cũ (đã thành tombstone), nên không còn dính sang bài mới.
- **Ẩn tombstone ở mọi nơi.** Mọi truy vấn đọc bài phải loại `purged_at IS NOT NULL`: feed, tìm kiếm, "Bài của tôi", danh sách admin, hàng đợi, đếm trong `summary`, sitemap/SEO nếu có. Phần lớn đã loại sẵn nhờ `status!='deleted'`, nhưng mục "Tác giả đã xóa" ở mục 6 đọc `status='deleted'` nên phải thêm `purged_at IS NULL`. `getPost` phải trả 404 cho tombstone với **mọi** người, kể cả admin.
- **`purgeExpired`:** chỉ chọn bài `status='deleted' AND purged_at IS NULL` quá 30 ngày, rồi gọi `purge()` mới.
- **Dọn dữ liệu cũ một lần.** Chạy trong migration, idempotent: đóng các báo cáo `open` có `target_type='post'` mà bài không tồn tại, và các báo cáo `target_type='comment'` mà bình luận không tồn tại. Các `proposals.post_id` trỏ vào bài không còn tồn tại thì để nguyên, vì đó là dữ liệu tiền và sửa tay sẽ rủi ro. Ghi chú rủi ro này trong PR. Các bài đã bị dùng lại id trước đây không tách được nữa, chấp nhận.
- **Phương án đã loại:** thêm `AUTOINCREMENT`. Cách này phải dựng lại cả bảng `community_posts` trên database production (nhiều bảng có khoá ngoại trỏ vào nó), rủi ro cao. Nó cũng không xử lý các báo cáo và đề nghị đang mồ côi.
- **Lợi ích phụ cho bot:** id không bao giờ bị dùng lại. Khoá `created_at` của PR #137 vẫn giữ để phòng hờ.

### Mục 5. Bỏ khung "Email chưa gửi", chuyển email kiểm duyệt sang `email_outbox`

**Thiết kế**

- **Hàm mới chỉ xếp email**, đặt trong `server/notifications.js`: `queueEmail(db, userId, kind, { subject, detail, link })`.
  - Hàm này kiểm tra `EMAIL_KINDS[kind]` và `emailPrefs(db, userId)[topic]`, rồi chỉ chèn vào `email_outbox`. Nó **không** ghi vào `notifications`.
  - `notify()` chung có thể dùng lại hàm này cho phần email để khỏi lặp code.
- **Migration `email_outbox`:** thêm cột `detail TEXT NOT NULL DEFAULT ''` để chứa lý do.
- **Nhóm email mới:** thêm `"community"` vào `EMAIL_TOPICS`, mặc định bật như các nhóm khác. Cài đặt → Thông báo có thêm một công tắc tên "Cộng đồng (bài viết, bình luận bị gỡ)". Cần sửa cả màn hình cài đặt phía app.
- **Bốn kind mới** trong `EMAIL_KINDS` (nhóm `community`) và trong `LINES` (`server/notice-mail.js`). Hàm mẫu nhận thêm tham số thứ ba là `detail`:
  - `community_post_rejected`: tiêu đề email "Bài “{title}” chưa được duyệt". Nội dung gồm lý do và lời mời sửa rồi gửi lại. Nút "Xem bài của tôi", link `/community/mine`.
  - `community_revision_rejected`: "Bản sửa bài “{title}” chưa được duyệt". Nút như trên.
  - `community_post_hidden`: "Bài “{title}” đã bị ẩn", có lý do. Link `/community/mine`.
  - `community_comment_removed`: "Bình luận của bạn trong bài “{title}” đã được gỡ", có lý do và trích tối đa 300 ký tự của bình luận. Link `/community/{post_id}`.
  - Template `notice` trong `server/email-verification.js` đã chạy `escapeHtml` cho `message`. Lý do do bot hoặc admin viết nên **phải** đi qua đó. Không được chèn HTML thô.
  - Mailer ghép `link` thành `${origin}/app${row.link}`, nên link lưu ở dạng `/community/...`, không có `/app`.
- **`server/community-admin.js`:**
  - Thay `mail.enqueue(...)` bằng `queueEmail(...)` ngay trong transaction.
  - Bỏ `await mail.deliver(...)`. Response trở về `{ ok: true }`, không còn `email_status`.
  - Route không cần `async` nữa.
  - Email được mailer gửi sau request qua `wakeMail`, giống các email khác.
- **Xoá hẳn:**
  - `server/community-mail.js`, cùng 3 route `/api/admin/community/mail*`.
  - `PendingMail.tsx` và chỗ render nó trong `AdminCommunity.tsx`.
  - Câu báo "Email chưa gửi được; mở Quản trị cộng đồng để gửi lại." trong `ActionDialog.tsx`.
  - Nhánh `kind === "community_moderation"` trong `createMailflareSender`.
  - Tham số `sendAdminEmail` chỉ dùng cho community mail. **Giữ lại** `sendAdminEmail` cho `profile_update`.
- **Bảng `community_mail`:** không đọc và không ghi nữa. Migration chạy `DROP TABLE IF EXISTS community_mail`. Các email cũ còn kẹt bị bỏ có chủ đích, vì người dùng đã có thông báo trong web.
- **Thông báo trong web** (`community_notifications`) giữ nguyên như cũ.
- **Lợi ích phụ:** lệnh `reject` của bot không còn phải chờ Mailflare, tối đa 15 giây cho mỗi bài.
- **Việc vận hành (không phải code):** kiểm tra hộp thư chung (`MAILFLARE_API_KEY` / mailbox chính, đang dùng cho email đề nghị học) có gửi được trên production không. Nếu hộp này cũng hỏng, email vẫn không tới, nhưng admin không còn bị làm phiền.

### Mục 6. Gọn luồng ẩn và xoá trong admin

**Luồng mới**

- Bài **đã duyệt**: "Ẩn" (nhập lý do), bài chuyển sang `hidden`.
- Bài **đã ẩn**:
  - "Khôi phục" đưa bài về `approved`.
  - "Xóa vĩnh viễn" mở hộp xác nhận ghi rõ "không hoàn tác được, xoá cả bình luận", rồi gọi `purge()` của mục 1.
- Bài **tác giả tự xoá** (`status='deleted' AND purged_at IS NULL`):
  - Hiện trong bộ lọc "Tác giả đã xóa", chỉ để xem: nội dung, tác giả, số ngày còn lại trước khi tự xoá vĩnh viễn.
  - Chỉ có một nút: "Xóa vĩnh viễn ngay".
  - **Không** có nút khôi phục, vì bài là của tác giả và tác giả đã chọn xoá.
  - Lý do giữ 30 ngày: để còn bằng chứng nếu có báo cáo hoặc tranh chấp.

**Thay đổi API**

- Bỏ `POST .../posts/:id/delete` (hidden → deleted) và `POST .../posts/:id/undelete`.
- `DELETE .../posts/:id` (purge) nhận bài ở trạng thái `hidden` **hoặc** `deleted` (chưa purge). Trạng thái khác trả 409.
- `GET .../posts?status=` nhận `approved`, `hidden`, `deleted`, và `rejected` từ mục 2. Với `deleted`, chỉ lấy các bài chưa purge.

**Dữ liệu cũ:** những bài admin đã đưa vào `deleted` trước đây không phân biệt được với bài tác giả tự xoá. Chúng sẽ hiện trong "Tác giả đã xóa" và tự xoá vĩnh viễn trong 30 ngày. Chấp nhận.

### Mục 2. Bộ lọc "Bị từ chối" và nút "Duyệt lại"

**Danh sách**

- `GET .../posts?status=rejected` trả về hai loại bài:
  - bài có `status='rejected'`;
  - bài có `status='approved' AND revision_status='rejected'` (bản sửa bị từ chối, đánh dấu `is_revision: true`).
- Sắp theo `reviewed_at DESC`, phân trang 20 bài như các bộ lọc khác.
- Mỗi bài kèm `reviewer: { id, name }` (join `users` qua `reviewed_by`) và lý do (`review_note` hoặc `revision_note`).
- Giao diện hiện "Từ chối bởi {name} · {thời gian}" và lý do. Bot dùng tài khoản riêng nên nhìn tên là biết bot hay người từ chối.

**Duyệt lại**

- Endpoint mới `POST .../posts/:id/reapprove`, body `{ expected_version }`. `expected_version` phải bằng `review_version`, không thì 409.
  - Nếu `status='rejected'`: chuyển sang `approved`, đặt `published_at=CURRENT_TIMESTAMP`, `review_note=''`, cập nhật `reviewed_by` và `reviewed_at`, rồi `notify(author,'post_approved')`.
  - Nếu là bản sửa bị từ chối (`revision_status='rejected'`): áp bản sửa y hệt nhánh approve-revision đang có (chép `revision_*` lên bài, đổi ảnh `revision=1` thành `0`), rồi `notify(author,'revision_approved')`.
  - Trạng thái khác: 409.
  - Ghi audit `community.post.reapprove` hoặc `community.revision.reapprove`.
- Bot không đụng tới các bài này, vì chúng không nằm trong `queue`.

### Mục 3. Lý do AI cho bài bot chuyển admin

**Web**

- Migration: thêm vào `community_posts` các cột `ai_verdict TEXT`, `ai_reason TEXT NOT NULL DEFAULT ''`, `ai_version INTEGER` và `ai_at TEXT`.
- Endpoint mới `POST /api/admin/community/posts/:id/ai-note` (`auth("admin")`), body `{ expected_version, verdict, reason }`:
  - `verdict` thuộc `escalate`, `approve`, `reject`. Hiện bot chỉ gửi `escalate`.
  - `reason` dài tối đa 200 ký tự, cắt khoảng trắng hai đầu.
  - Nếu `expected_version` khác `review_version` thì 409, và bot bỏ qua.
  - Nếu bài không còn chờ duyệt thì 409.
  - Thành công: ghi bốn cột, rồi trả `{ ok: true }`.
  - **Không** thay đổi `status` và **không** gửi thông báo cho tác giả.
- `queue` trả `SELECT *` nên các cột mới tự có trong response. Bot bỏ qua các trường lạ, nên không ảnh hưởng.
- Giao diện Chờ duyệt: nếu `ai_version === review_version` và `ai_verdict === 'escalate'`, hiện dòng "AI chuyển admin: {ai_reason}". Ghi chú gắn với phiên bản, nên tác giả sửa bài thì ghi chú cũ tự ẩn.
- Lý do là nội dung do AI sinh ra, nên phải hiển thị dạng text, không render HTML.

**Workflow n8n**

- Mọi bài có kết quả `escalate` đều phải gọi `ai-note` với `reason`:
  - AI trả `escalate`;
  - AI trả `approve` nhưng có `category`;
  - `riskSignals` chặn tự duyệt;
  - bài có ảnh hoặc nghi cài lệnh (các bài không gửi Claude);
  - vượt trần trong ngày;
  - chế độ `approve_only`.
- Cách làm: node "Thực hiện" (hoặc một node HTTP mới ngay sau nó) gọi thêm endpoint thứ ba khi `action === "escalate"`.
- **Không được làm hỏng lần chạy:**
  - 404 (web chưa cập nhật), 409, lỗi mạng hay timeout đều chỉ ghi nhật ký rồi chạy tiếp.
  - Không tính vào trần approve/reject.
  - Không làm bài bị chấm lại.
- Chế độ `shadow` **không** gọi `ai-note`, vì shadow không được đổi gì trên web.
- Một phiên bản bài chỉ được ghi chú một lần, vì khoá `id:version:created_at` đã đánh dấu đã chấm.
- Cập nhật `test/n8n-moderation-workflow.test.js` để kiểm tra luồng escalate gọi `ai-note` và luồng 404 không làm hỏng lần chạy.
- Thứ tự triển khai: **web lên trước, workflow sau.** Nhờ cách xử lý 404 ở trên, làm ngược thứ tự cũng không gián đoạn.

### Mục 4. Gộp báo cáo theo nội dung

**Danh sách**

- `GET .../reports?status=open` gộp theo `(target_type, target_id, part)`. Mỗi nhóm trả về:
  - `target`, `owner`;
  - `report_count`;
  - `reasons`: mảng `{reason, detail, reporter_name, created_at}`;
  - `first_report_id`, `latest_at`.
- Sắp theo `report_count DESC`, rồi `latest_at DESC`. Mỗi trang tối đa 50 nhóm.
- Với `status=resolved`, trả từng báo cáo như cũ (đây là lịch sử), giới hạn 100.

**Đóng báo cáo**

- `POST .../reports/:id/resolve` đóng **tất cả** báo cáo đang mở cùng nhóm với báo cáo `:id`, và ghi một audit duy nhất.
- Tạo một hàm dùng chung `resolveReportsFor(targetType, targetId, part, actorId, resolution)`, và gọi nó tự động khi:
  - admin ẩn bài: `post`, part `''`, resolution "Đã ẩn bài.";
  - admin gỡ bình luận: `comment`;
  - admin gỡ một phần hồ sơ (`server/community-profile.js`, chỗ tạo `profile_removed`): `profile` với đúng `part`;
  - purge (mục 1);
  - admin từ chối bài (không thường gặp, nhưng làm cho đủ).
- Giao diện: một thẻ cho mỗi nhóm, gồm "N lượt báo cáo", danh sách lý do và các nút xử lý như hiện nay. Nút "Kết thúc báo cáo" vẫn bắt nhập kết luận.

### Mục 7. Đổi tên tab

- Tab "Thông báo & Quy tắc" đổi thành **"Quy tắc"**. Nội dung giữ nguyên: sửa Quy tắc cộng đồng.
- Nút viết thông báo ở đầu trang Quản trị cộng đồng ghi rõ **"Viết thông báo"**. Nếu chưa có nút này, đưa form tạo thông báo (`POST .../posts`, kind `announcement`) vào sau nút đó.
- Mục tiêu: tên tab không hứa một chức năng mà tab không có.

### Mục 8. Duyệt bằng một cú bấm

- Nút "Duyệt" (bài mới, bản sửa, và "Duyệt lại" ở mục 2) gọi API ngay, **không** mở `ActionDialog`.
  - Thành công: hiện "Đã duyệt" rồi tải lại hàng đợi.
  - Lỗi 409: hiện thông điệp lỗi từ server rồi tải lại hàng đợi.
  - Trong lúc chờ, nút bị khoá để tránh bấm hai lần.
- "Từ chối", "Ẩn", "Gỡ bình luận" và "Xóa vĩnh viễn" vẫn qua `ActionDialog`, vì cần lý do hoặc cần xác nhận.

## 1.4. Ảnh hưởng tới luồng n8n → web

| Mục | Bot có bị ảnh hưởng? | Ghi chú |
|---|---|---|
| 1 | Không | Hàng đợi và các lệnh giữ nguyên. Id không còn bị dùng lại. |
| 5 | Không | Response của approve/reject chỉ mất trường `email_status`, mà bot không đọc trường này. Lệnh còn nhanh hơn. |
| 6 | Không | Bot không dùng delete, undelete hay purge. |
| 2, 4, 7, 8 | Không | API và giao diện mới chỉ dành cho admin. |
| 3 | **Có** | Sửa workflow rồi nhập lại vào n8n (quy trình ở mục 1.5). |

Mọi PR phải giữ CI xanh, kể cả `test/n8n-moderation-workflow.test.js`. Test này là lưới an toàn cho hợp đồng.

## 1.5. Quy trình nhập lại workflow n8n (chỉ cho mục 3)

Bước này do chủ dự án làm hoặc duyệt. Model triển khai **chỉ** sửa code và JSON trong repo.

1. Sao lưu database n8n: `sqlite3 ~/.n8n/database.sqlite ".backup <thư mục tạm>/n8n-truoc-ai-note.sqlite"`.
2. Tạo file nhập từ `scripts/n8n/moderation-workflow.json`, sửa các giá trị:
   - `baseUrl=https://giasudiem10.online`;
   - `mode=full`;
   - credential `{"httpCustomAuth":{"id":"EzbvcXIqg805jb3S","name":"Moderation Bot Login"}}` cho các node HTTP;
   - `id` của workflow là `x9vNWZjqXJHAPOSd`.

   Bọc toàn bộ trong một mảng.
3. Chạy `n8n import:workflow --input=<file>`.
4. Chạy `NODES_EXCLUDE='[]' n8n publish:workflow --id=x9vNWZjqXJHAPOSd`. **Thiếu biến môi trường này thì lệnh lỗi "Unrecognized node type: executeCommand" và workflow bị tắt.**
5. Khởi động lại n8n: `launchctl kickstart -k gui/$(id -u)/com.giasudiem10.n8n`.
6. Kiểm tra: phiên bản đang chạy (`activeVersionId` trong `workflow_history`) có chứa code mới. Lần chạy kế tiếp không lỗi.

Không được sửa thẳng database n8n để thay workflow.

---

# PHẦN 2. PROMPT GIAO CHO MODEL TRIỂN KHAI

> Dán nguyên khối dưới đây cho model. Mỗi lần giao **một đợt**, đổi dòng `ĐỢT CẦN LÀM`.

```text
Bạn là kỹ sư triển khai cho repo "Gia Sư 10 Điểm": web Node/Express chạy trong Cloudflare Durable Object, SQLite, frontend React/Vite trong app/src, và một bot kiểm duyệt n8n trong scripts/n8n.

ĐỢT CẦN LÀM: Đợt 1 (mục 1, 5, 6)
(Đợt 2 = mục 2, 3. Đợt 3 = mục 4, 7, 8.)

TÀI LIỆU NGUỒN (bắt buộc đọc hết trước khi viết code):
- docs/quan-tri-cong-dong-sua-loi.md, Phần 1. Đây là đặc tả đã được chủ dự án chốt. Làm đúng đặc tả. Chỗ nào đặc tả mơ hồ hoặc mâu thuẫn với code thật thì DỪNG và hỏi, không tự đoán.

FILE CẦN ĐỌC TRƯỚC (tuỳ đợt):
- server/community-admin.js, server/community.js, server/community-schema.js, server/community-mail.js, server/community-topics.js, server/community-profile.js, server/community-images.js
- server/notifications.js, server/notice-mail.js, server/email-verification.js, worker/index.js (sendEmail, sendAdminEmail, wakeMail)
- app/src/pages/AdminCommunity.tsx, app/src/components/community/ActionDialog.tsx, app/src/components/community/PendingMail.tsx, màn hình Cài đặt → Thông báo trong app/src
- scripts/n8n/lib/moderation.js, scripts/n8n/build-moderation-workflow.js, scripts/n8n/moderation-workflow.json (chỉ Đợt 2)
- test/community.test.js, test/community-fixture.js, test/n8n-moderation-workflow.test.js, test/email-verification.test.js

CÁCH LÀM:
1. Tạo một git worktree mới từ origin/main mới nhất, trên nhánh fix/quan-tri-cong-dong-dot-<n>. Không làm trên nhánh khác. Không dùng git stash trần.
2. Làm theo TDD. Với mỗi hành vi trong đặc tả:
   a. Viết test trước, chạy và thấy nó đỏ vì đúng lý do.
   b. Viết code cho test xanh.
   Bắt buộc có các test hồi quy:
   - Mục 1: xoá vĩnh viễn rồi đăng bài mới thì id mới khác id cũ. Báo cáo của bài và bình luận cũ đã đóng, không hiện ở bài mới. Người từng báo cáo bài cũ báo cáo được bài mới. proposals cũ vẫn trỏ vào tombstone. Tombstone trả 404 cho cả admin và không có trong mọi danh sách. Migration dọn báo cáo mồ côi idempotent (chạy hai lần không lỗi).
   - Mục 5: reject/hide/gỡ bình luận tạo đúng một dòng email_outbox với đúng kind, subject, detail, link; tắt nhóm "community" thì không tạo; chuông thông báo không bị nhân đôi; response không còn email_status; các route /api/admin/community/mail* trả 404; email profile_update vẫn đi qua sendAdminEmail; nội dung có ký tự HTML được escape.
   - Mục 6: delete/undelete cũ đã bỏ; purge nhận hidden và deleted-chưa-purge, trạng thái khác trả 409; bộ lọc deleted không có tombstone; purgeExpired chỉ xử lý bài quá 30 ngày chưa purge.
   - Mục 2: reapprove bài rejected và bản sửa rejected; sai expected_version trả 409; trạng thái khác trả 409; tác giả nhận đúng thông báo.
   - Mục 3: ai-note ghi đúng phiên bản; lệch phiên bản trả 409; không đổi status. Workflow: escalate gọi ai-note; ai-note trả 404 hoặc lỗi mạng thì lần chạy vẫn thành công và các bài khác vẫn được xử lý; shadow không gọi ai-note.
   - Mục 4: báo cáo gộp theo nhóm; resolve đóng cả nhóm; ẩn bài, gỡ bình luận, gỡ phần hồ sơ thì tự đóng đúng nhóm.
   - Mục 8: test UI hoặc e2e có sẵn cho hàng đợi vẫn chạy được với luồng duyệt một cú bấm.
3. Migration phải idempotent và an toàn trên database production đang chạy:
   - Chỉ dùng kiểu PRAGMA table_info rồi ALTER TABLE ADD COLUMN, như code hiện có.
   - Không dựng lại bảng community_posts.
   - Không xoá hay sửa dữ liệu tiền (proposals, wallet).
4. KHÔNG ĐƯỢC PHÁ HỢP ĐỒNG BOT (Phần 1, mục 1.1):
   - Không đổi tên hoặc bỏ các trường trong GET /api/admin/community/queue.
   - Không đổi đường dẫn, body hay mã trả về 200/409 của approve và reject.
   - Không đổi ý nghĩa của review_version và created_at.
   Chỉ được thêm trường mới.
5. Phạm vi: chỉ làm các mục của đợt được giao.
   - Gặp lỗi khác ngoài phạm vi thì ghi vào phần "Ngoài phạm vi" của PR, không sửa.
   - Không thêm thư viện mới.
   - Không đổi văn phong UI ngoài các chuỗi đặc tả nêu tên.
   - Chuỗi hiển thị cho người dùng viết bằng tiếng Việt có dấu, cùng giọng với các chuỗi hiện có.
6. Trước khi báo xong, chạy và dán kết quả thật của: npm test, npm run typecheck, npm run build.
   - Đỏ thì sửa đến khi xanh.
   - Không tắt, bỏ qua hay nới test cũ để cho xanh. Nếu một test cũ sai theo đặc tả mới, sửa test đó và giải thích trong PR vì sao.
7. Commit theo từng bước có nghĩa, message tiếng Anh theo kiểu conventional (fix(community): ..., feat(community): ...). Push nhánh và mở PR vào main. Mô tả PR gồm:
   - làm gì theo từng mục, kèm số mục;
   - migration nào sẽ chạy trên production và dữ liệu nào bị thay đổi;
   - ảnh hưởng tới bot n8n (theo bảng 1.4);
   - cách kiểm tra thủ công trong trang admin;
   - phần "Ngoài phạm vi".
   KHÔNG merge, KHÔNG bật auto-merge, KHÔNG deploy.
8. Riêng Đợt 2, mục 3:
   - Chỉ sửa scripts/n8n/* trong repo, và chạy lệnh build để sinh lại moderation-workflow.json.
   - KHÔNG nhập workflow vào n8n.
   - KHÔNG chạm vào ~/.n8n, database n8n, credential hay mật khẩu bot.
   - Ghi trong PR rằng web phải deploy trước, rồi chủ dự án mới nhập lại workflow theo Phần 1, mục 1.5.

TIÊU CHÍ HOÀN THÀNH:
- Mọi hành vi trong đặc tả của các mục thuộc đợt đều có test và test xanh.
- npm test, typecheck, build đều xanh; có kết quả thật dán trong báo cáo.
- PR đã mở, CI xanh, chưa merge.
- Báo cáo cuối liệt kê:
  - file đã đổi;
  - migration;
  - điều gì CHƯA kiểm được, ví dụ gửi email thật trên production hoặc chạy bot thật;
  - việc chủ dự án cần làm sau khi merge.
```
