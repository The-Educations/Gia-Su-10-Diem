# Vận hành cho quản trị viên

Hướng dẫn xử lý công việc hằng ngày trên giasudiem10.online. Mọi thao tác ở đây đều được ghi vào **Quản trị → Nhật ký** (người làm, lúc nào, chi tiết), và mỗi dòng nhật ký dẫn về đúng chỗ đã sửa.

## Mỗi ngày bắt đầu từ đâu

**Quản trị → Hôm nay** chỉ hiện việc đang chờ: buổi học bị báo vấn đề hoặc quá giờ chưa xác nhận, yêu cầu rút tiền, học sinh chờ xác minh, minh chứng và hồ sơ gia sư chờ duyệt, bài cộng đồng chờ duyệt. Ô nào bằng 0 thì không có việc.

## Tiền

### Nạp tiền
- Người dùng nạp bằng **VietQR chuyển khoản** ngay trong web (tài khoản MBBank của nền tảng). Nội dung chuyển khoản là mã lệnh dạng `GSD` + 8 ký tự.
- SePay báo tiền về qua webhook và số dư được cộng tự động. Nếu SePay không tách được mã, server tự đọc mã trong nội dung chuyển khoản.
- **Tài chính → Nạp tiền → Tiền về chưa khớp mã**: tiền đã về nhưng không biết thuộc lệnh nào.
  - **Gán cho lệnh nạp…**: nhập mã lệnh, xem trước người nhận và số tiền (có cảnh báo khi số tiền lệch), rồi xác nhận. Mỗi khoản chỉ gán được một lần.
  - **Bỏ qua**: dùng cho khoản không thuộc người dùng nào (chuyển nhầm, chuyển thử). Bắt buộc ghi lý do. Dòng không bị xóa mà chuyển sang "Đã bỏ qua".
  - Dòng **"Sai khóa IPN"** là thông báo không xác thực được, nên chỉ có thể bỏ qua, không bao giờ gán.
- **Kiểm tra lại với SePay**: hỏi lại SePay về các lệnh đang chờ trong 7 ngày và xử lý lại các khoản chưa khớp có mã trong nội dung.

### Rút tiền
- **Tài chính → Chuyển tiền**: yêu cầu đang chờ nằm trên cùng. Quét VietQR (đã điền sẵn tài khoản, số tiền, nội dung là mã lệnh rút) bằng app ngân hàng, rồi bấm **Đã chuyển** và kéo ảnh biên lai vào. Biên lai được gửi vào hội thoại hỗ trợ của người dùng.
- Từ chối phải ghi lý do; tiền tạm giữ được trả lại số dư của người dùng.
- Tài khoản MBBank không gửi webhook cho tiền ra, nên "Đã chuyển" là bước làm tay. Nếu đã cấu hình `SEPAY_API_TOKEN`, phần đối soát sẽ tự xác nhận khi thấy giao dịch tiền ra có mã lệnh rút và đúng số tiền.

### Điều chỉnh số dư
Tài khoản → mở tổng quan tài khoản → **Điều chỉnh số dư**: cộng hoặc trừ, bắt buộc ghi lý do. Chỉ dùng cho trường hợp ngoài hệ thống (chuyển khoản tay, hoàn tiền thiện chí).

### Cài đặt
Tài chính → Cài đặt: phí nền tảng, số tiền nạp tối thiểu, Xu cho gia sư, các mốc thời gian, gói Xu. Chỉ những mục thực sự đổi mới được ghi nhật ký (kèm giá trị cũ và mới).

## Buổi học

Sidebar → **Buổi học** (`/app/sessions`) gộp cả buổi của lớp lẫn lịch đặt lẻ:
- **Cần xử lý**: buổi bị báo vấn đề, buổi đã qua mà chưa ai xác nhận.
- Lọc theo hôm nay, sắp tới, đã xong, đã hủy, theo khoảng ngày; tìm theo lớp, gia sư, học sinh; xuất CSV danh sách đang lọc.
- Mở một buổi để xem người học, tiền đang giữ, lịch sử dời giờ và thao tác của admin:
  - **Xử lý báo cáo**: "buổi đã diễn ra" (trả tiền cho gia sư) hoặc "hoàn tiền" (trả cho học sinh).
  - **Hủy buổi**: hộp xác nhận ghi rõ ai được hoàn bao nhiêu.
  - **Kết thúc gói**: hoàn các buổi tương lai chưa học.
  - **Nhắc xác nhận** (chọn nhiều buổi): gửi thông báo cho bên chưa xác nhận.

## Hồ sơ và xác minh
- **Gia sư**: duyệt hồ sơ mới, bản sửa và minh chứng. Từ chối phải ghi lý do; gia sư nhận email.
- **Học sinh**: duyệt học bạ, yêu cầu bổ sung (ghi lý do) hoặc thu hồi xác minh.
- **Danh mục**: môn học và kỳ thi. Gỡ một mục là lưu trữ, không xóa hẳn; hộp xác nhận cho biết hồ sơ gia sư nào bị ảnh hưởng.

## Nhật ký
Quản trị → Nhật ký: lọc theo nhóm, người thực hiện, khoảng ngày; tìm cả trong chi tiết; "Tải thêm" để xem cũ hơn. Bấm vào đối tượng để tới đúng lệnh rút, buổi học, hồ sơ, tài khoản hoặc mục danh mục, có tô sáng. Tổng quan tài khoản, hồ sơ gia sư, lệnh rút và buổi học đều có mục "Lịch sử quản trị" riêng.

## Khi có sự cố
| Dấu hiệu | Kiểm tra |
| --- | --- |
| Người dùng chuyển tiền mà chưa thấy số dư | Tài chính → Nạp tiền → "Tiền về chưa khớp mã", rồi "Kiểm tra lại với SePay". Trên my.sepay.vn, xem lịch sử webhook có lỗi không. |
| Webhook SePay báo lỗi 401 | Secret `SEPAY_WEBHOOK_SECRET` trên Cloudflare không khớp với secret của webhook. |
| Webhook báo 503 | Thiếu `SEPAY_WEBHOOK_SECRET`, hoặc Worker chưa nhận secret mới: chạy lại workflow Deploy. |
| Nút "Gửi thử" của SePay | Trả 200 `success:false` là bình thường: đó là dữ liệu mẫu (id = 0). |

Cấu hình SePay và secret: xem [cloudflare-deployment.md](cloudflare-deployment.md).
