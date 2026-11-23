# Admin xoá bài Cộng đồng (xoá mềm + tự dọn 30 ngày) — thiết kế ngắn

## Vì sao
Admin ẩn bài thì bài nằm mãi ở tab "Đã ẩn", chỉ có nút "Khôi phục". Ẩn nhiều thì list dài vô tận. Admin cần cách dọn bài, nhưng vẫn muốn có một khoảng đệm để hoàn tác hoặc đối chiếu nếu có tranh chấp.

## Mục tiêu
- Admin xoá được bài đang ẩn ngay từ tab "Đã ẩn".
- List các tab không phình mãi: bài đã xoá tự mất hẳn sau 30 ngày.
- Admin có thể xoá vĩnh viễn sớm, hoặc khôi phục trong 30 ngày.

## Không làm (non-goals)
- Không gửi thêm thông báo/email cho tác giả khi bài bị xoá (tác giả đã được báo lúc bài bị ẩn).
- Không thêm nút xoá cho bài đang đăng (phải ẩn trước, đúng quy trình hiện tại).
- Không xoá hàng loạt (chưa cần).
- Không xây job chạy nền / cron mới.

## Anti-goal
Xoá nhầm một bài vi phạm mà mất luôn bình luận, báo cáo, nhật ký xử lý khi chưa ai kịp đối chiếu.

## Các hướng đã cân nhắc
1. **Xoá mềm thuần:** an toàn, nhưng tab "Đã xóa" phình thay cho tab "Đã ẩn".
2. **Xoá hẳn ngay:** list gọn nhưng mất bằng chứng, không hoàn tác được.
3. **Xoá mềm + tự dọn sau 30 ngày + nút xoá vĩnh viễn (đã chọn):** list gọn, vẫn có khoảng đệm.

## Thiết kế
**Luồng bài:** Đã đăng → (Ẩn, bắt buộc có ghi chú, gửi mail tác giả như hiện tại) → Đã ẩn → (Xoá) → Đã xóa → tự mất hẳn sau 30 ngày, hoặc admin bấm "Xoá vĩnh viễn".

**Backend (`server/community-admin.js`):**
- `POST /api/admin/community/posts/:id/delete`: chỉ cho bài `hidden`; đặt `status='deleted'`, `updated_at=now`; ghi audit `community.post.delete` (kèm id, tiêu đề). Không notify, không mail.
- `POST .../posts/:id/undelete`: chỉ cho bài `deleted`, đưa về `hidden`; audit `community.post.undelete`.
- `DELETE /api/admin/community/posts/:id`: chỉ cho bài `deleted`; xoá hàng thật (các bảng con đã `ON DELETE CASCADE`); audit `community.post.purge` giữ lại id, tiêu đề, tác giả.
- Tự dọn: mỗi lần admin tải danh sách bài hoặc summary, xoá hẳn các bài `status='deleted'` có `updated_at` cũ hơn 30 ngày (dọn lười, không cần scheduler). Audit `community.post.purge` cho từng bài.

**Giao diện (`app/src/pages/AdminCommunity.tsx`):**
- Tab "Đã ẩn": thêm nút "Xoá" cạnh "Khôi phục", có hộp xác nhận ("Bài sẽ chuyển sang Đã xóa và tự mất sau 30 ngày").
- Tab "Đã xóa": mỗi bài hiện "Còn N ngày", nút "Khôi phục về Đã ẩn" và "Xoá vĩnh viễn" (xác nhận, ghi rõ không hoàn tác được). Dòng chú thích đầu tab: "Bài đã xóa tự mất sau 30 ngày".
- Thêm nhãn hành động mới vào bảng tên audit trong `app/src/components/admin-kit.tsx`.

**Kiểm thử:** thêm test vào `test/community.test.js` cho: xoá chỉ từ bài ẩn, hoàn tác, xoá vĩnh viễn kéo theo bình luận/báo cáo, dọn sau 30 ngày, và chỉ admin gọi được.

## Các quyết định do tôi tự chọn (cần bạn xem)
- Không gửi thông báo cho tác giả khi xoá.
- Dọn lười thay vì cron, vì dự án chưa có hạ tầng job định kỳ (chỉ có một `setInterval` trong `server/index.js`, không đáng tin trên Cloudflare).
- Dùng `updated_at` làm mốc đếm 30 ngày, không thêm cột mới. Người xây kiểm tra không có chỗ nào khác chạm vào `updated_at` của bài đã xoá.
- "Khôi phục" từ Đã xóa đưa bài về Đã ẩn (không phải Đã đăng) cho an toàn. Bài do tác giả tự xoá cũng được khôi phục theo cách này.
- Thời hạn 30 ngày là hằng số trong code, chưa cấu hình được.
