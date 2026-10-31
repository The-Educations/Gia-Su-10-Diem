# Phạm vi sản phẩm — Gia Sư 10 Điểm

Cập nhật: 31/10/2026. Phạm vi và quy tắc của marketplace. Bằng chứng kiểm tra hiện tại và giới hạn triển khai nằm trong [kiểm tra production](production-audit.md).

## Quyết định của chủ dự án

- Phát triển website tìm gia sư, vượt ra ngoài landing page.
- Có trải nghiệm cho học sinh / phụ huynh, gia sư và quản trị viên.
- Danh mục môn học và mục tiêu kỳ thi tại Việt Nam hỗ trợ tìm gia sư phù hợp.
- Chuyển động mong muốn: **expressive — playful motion throughout**, có reduced motion và không cản thao tác.
- Điều chỉnh phạm vi mới nhất: **“no quiz answers only finding tutors.”** Không tiếp tục phát triển quiz, đáp án, chấm điểm, lịch sử làm bài hoặc phòng thực hành.
- Production chạy trên Cloudflare tại `giasudiem10.online`; Vercel không còn là nền tảng triển khai.

## Luồng sản phẩm chính

**Chọn môn / mục tiêu → tìm gia sư → xem hồ sơ và giờ trống → gửi yêu cầu → gia sư xác nhận → hai bên trao đổi → hoàn thành buổi học → đánh giá.**

### Khách truy cập

- Xem gia sư đã được công bố và tài khoản còn hoạt động.
- Tìm không dấu / có dấu theo tên, giới thiệu, học vấn và địa điểm.
- Lọc theo môn, cấp học, mục tiêu kỳ thi, hình thức online / trực tiếp, địa điểm và học phí VND/giờ.
- Sắp xếp theo giá, kinh nghiệm hoặc đánh giá có thật.
- Xem ảnh, chuyên môn, mức phí, học vấn, mô tả phương pháp, đánh giá, lịch trống và tải CV của hồ sơ đã công bố.
- Duyệt danh mục môn / kỳ thi và chuyển sang tìm gia sư tương ứng.
- Đăng ký vai trò học sinh hoặc gia sư; không tự đăng ký admin.

### Học sinh / phụ huynh

- Đăng nhập, cập nhật tên và mục tiêu, đổi mật khẩu.
- Lưu / bỏ lưu gia sư.
- Nhắn hỏi gia sư trước khi đặt lịch qua nút “Liên hệ gia sư”; mỗi cặp student/tutor có một hội thoại tư vấn riêng.
- Chọn một giờ trống, môn nhận dạy, hình thức và ghi chú nhu cầu.
- Xem lại học phí, giờ học và gia sư trước khi gửi yêu cầu.
- Theo dõi yêu cầu và lịch đã xác nhận; hủy buổi tương lai khi được phép.
- Trao đổi trong hội thoại của buổi học; xem ghi chú và liên kết do gia sư cung cấp.
- Xuất lịch `.ics` cho buổi đã xác nhận.
- Đánh giá một lần sau khi buổi học hoàn thành.

Trong bản hiện tại, phụ huynh dùng cùng vai trò `student`; chưa có tài khoản con hay quản lý nhiều học sinh.

### Gia sư

- Tạo tài khoản và hoàn thiện hồ sơ công khai.
- Tải, thay hoặc xóa ảnh đại diện và CV PDF; upload mới đưa hồ sơ về pending. CV công khai sau khi admin duyệt.
- Chọn môn dạy, cấp học, mục tiêu kỳ thi nhận luyện, mức phí, hình thức, địa điểm, học vấn và kinh nghiệm.
- Thư viện kiểu lưới với tối đa 12 ảnh, tải nhiều ảnh, sửa chú thích, xóa và xem ảnh đầy đủ. Ảnh mới/chú thích mới đưa hồ sơ về chờ duyệt; chỉ chủ hồ sơ và admin xem được khi chưa duyệt.
- Tùy chỉnh màu bìa, phương pháp giảng dạy và nội dung một buổi học; xem trước trực tiếp trong trình sửa hồ sơ.
- Gửi duyệt; chỉnh sửa hồ sơ hoặc tên công khai đã công bố sẽ đưa về chờ duyệt.
- Thêm giờ trống, nhận / từ chối yêu cầu, hủy buổi tương lai khi phù hợp.
- Nhắn tin, cung cấp nội dung và liên kết phòng học.
- Đánh dấu buổi đã diễn ra là hoàn thành.

### Quản trị viên

- Duyệt hồ sơ đủ thông tin hoặc yêu cầu bổ sung kèm ghi chú.
- Tạm khóa / kích hoạt tài khoản không phải admin; khóa thu hồi phiên đăng nhập.
- Thêm / sửa môn học.
- Thêm / sửa / ẩn mục kỳ thi và nguồn thông tin HTTPS.
- Xem các buổi học và nhật ký thao tác.
- Admin có quyền đọc hội thoại booking theo API cũ; không có quyền đọc inquiry tư vấn riêng giữa student và tutor. Chính sách này cần công khai trước launch.

## Quy tắc nghiệp vụ

| Chủ đề | Quy tắc |
| --- | --- |
| Múi giờ | Hiển thị giờ Việt Nam (`Asia/Ho_Chi_Minh`); lưu giờ UTC ISO |
| Thời lượng | Một khung giờ = 60 phút; chưa có thời lượng tùy chọn / lịch lặp |
| Học phí | VND/giờ; lưu mức phí tại thời điểm đặt để không đổi theo hồ sơ sau đó |
| Giờ trống | Giờ tròn, trước ít nhất một giờ, tối đa 180 ngày tới |
| Chống trùng | Kiểm tra cả lịch học sinh và gia sư; khung đã giữ không được đặt lần nữa |
| Xác nhận | Gia sư nhận / từ chối yêu cầu đang chờ và còn ở tương lai |
| Hoàn thành | Gia sư chỉ hoàn thành buổi đã xác nhận và đã qua giờ kết thúc |
| Hủy | Buổi chờ / đã xác nhận còn ở tương lai; mở lại khung giờ |
| Hội thoại | Hội thoại booking theo buổi; inquiry riêng trước booking, student khởi tạo với tutor công khai, chỉ hai bên truy cập |
| Đánh giá | Học sinh của buổi đã hoàn thành; một đánh giá / buổi |
| Xác minh | Admin công bố hồ sơ không đồng nghĩa đã xác minh danh tính, bằng cấp hoặc lý lịch |
| Thanh toán | Chưa thu tiền qua website; hai bên tự thống nhất |

Chính sách hủy sát giờ, xử lý tranh chấp, xác minh gia sư và hỗ trợ khách hàng chưa được chủ dự án quyết định. Không tự đưa ra bảo đảm pháp lý hay chất lượng đã được kiểm chứng.

## Danh mục Việt Nam

- 25 nhóm môn trong `server/catalog.js`, từ tiểu học đến THPT và ngoại ngữ khác.
- Các hướng kỳ thi khởi đầu: tốt nghiệp THPT, tuyển sinh lớp 10, HSA, V-ACT, TSA, IELTS, TOEIC và thi chuyên / HSG.
- Các mục hiện là cổng tham khảo; không phải kho đề thi và không lưu đáp án.
- Mục kỳ thi có một môn liên quan để phân loại, nhưng CTA tìm gia sư lọc theo **mục tiêu do tutor khai báo**. Cấp học và mục tiêu được lưu trên profile. IELTS / TOEIC hiện chung nhóm “Chứng chỉ ngoại ngữ”; chưa phân biệt trình độ hoặc chứng chỉ chuyên biệt.
- Liên kết nguồn, tên và quy định hiện hành cần được kiểm tra trước khi xuất bản; không khẳng định bao phủ mọi kỳ thi.

## UI/UX

- Giữ nhận diện có sẵn: nền giấy ấm, mực tối, đỏ sẫm; Be Vietnam Pro và Lora.
- Danh sách gia sư và hành động tìm / đặt lịch là trọng tâm; tránh số liệu thành tích giả.
- Điều hướng có nhãn, phiên bản điện thoại dùng menu thu gọn; nội dung giữ được tại 360–1440 px.
- Trạng thái loading, lỗi có thử lại, trống, chờ duyệt và không có quyền cần rõ ràng.
- Cắt tagline, helper text và nhãn phụ không cần thiết. Học phí, thời gian, trạng thái và hành động phải tự rõ qua bố cục.
- Animate UI cho dialog, chọn mục và phản hồi thao tác; chuyển động biểu cảm nhưng ngắn, có thể ngắt, tắt phần không thiết yếu khi giảm chuyển động.
- Giữ khả năng dùng bàn phím, focus rõ, tiêu đề dialog, tương phản phù hợp và nút chạm đủ lớn.
- Three.js / Anatomy chỉ có thể dùng nếu giúp việc tìm hoặc hiểu dịch vụ gia sư. Không mở lại phòng học mô phỏng hay quiz để đáp ứng tên skill.

## Ngoài phạm vi hiện tại

Quiz / đáp án / chấm điểm, lớp học video tích hợp, cổng thanh toán, ví / hoa hồng, AI tutor, thông báo email / SMS, quản lý nhiều con, ứng dụng di động native. Khôi phục mật khẩu, xác thực email, báo cáo vi phạm, vận hành và chính sách dữ liệu cần được thiết kế trước một đợt ra mắt công khai; hiện chưa triển khai.
