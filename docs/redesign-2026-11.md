# Thiết kế lại 11/2026 — quyết định của chủ dự án

Chốt với chủ dự án ngày 22/11/2026 qua buổi hỏi đáp. Các mục dưới đây là **[CHỐT]** và thay thế mọi tài liệu cũ nói khác (đặc biệt `tutor-fees.md`, phần hiển thị sao trong `danh-gia-va-diem-tin-cay.md`, mục "không bắt chọn loại bài" trong `dai-tim-gia-su-dashboard.md`).

Đã triển khai (đã merge và deploy):

| PR | Nội dung |
|---|---|
| #82 | Hệ thiết kế, khung điều hướng theo vai trò, trung tâm thông báo, màn hình mở app |
| #83 | Hồ sơ gia sư theo bước + minh chứng + admin đối chiếu từng mục |
| #84 | Số dư học phí, offer, credit, rút tiền |
| #85 | Lớp học, lịch kiểu Apple Calendar, xác nhận buổi, đối chiếu 5%, đánh giá |
| #86 | Phụ huynh liên kết con, cộng đồng theo chủ đề, admin quản lý toàn bộ |
| #87 | Cổng thanh toán SePay (IPN), xác minh học sinh, Tổng quan mới, chế độ English |
| #88 | Điều hướng gọn, trang giới thiệu VI/EN, dọn tính năng cũ |

## Vai trò

- **Gia sư là trung tâm**: tìm học sinh qua bài "Tìm gia sư", gửi hồ sơ bằng credit, quản lý lớp, bài giảng (link YouTube/Google Drive), lịch, học sinh và tiền.
- **Học sinh**: tìm gia sư, gửi offer (phải đủ số dư), học, xác nhận buổi, đánh giá.
- **Học sinh phải xác minh** bằng ảnh học bạ hoặc bảng điểm (trường, lớp, mã học sinh) trước khi gửi hoặc nhận offer. Admin duyệt ở tab "Hôm nay". Một tệp, một mã học sinh, một số báo danh chứng chỉ của gia sư chỉ chứng minh được một tài khoản.
- **Phụ huynh** (không cần xác minh): liên kết con bằng mã mời; theo dõi lịch, bài giảng, số buổi còn lại; nạp tiền vào số dư của con. **Không gửi hay trả lời offer**: con làm việc đó từ tài khoản học sinh. Một phụ huynh liên kết tối đa 6 con.
- **Thiết lập tài khoản có thể để sau**: trước khi thiết lập chỉ xem được gia sư, môn học, cộng đồng; các tính năng khác yêu cầu thiết lập xong.
- **Admin**: một vai trò duy nhất, toàn quyền; mọi thao tác ghi nhật ký.

## Tiền

- Nạp tiền qua **Cổng thanh toán SePay**: website ký form, người dùng trả trên trang SePay (QR, NAPAS, thẻ), SePay gọi **IPN** `/api/sepay/ipn` để cộng số dư đúng số tiền, mỗi giao dịch một lần. SePay không giữ tiền; tiền về tài khoản của nền tảng. Giao diện gọi là **"Số dư học phí"**, không phải ví; không chuyển tiền giữa người dùng. Cấu hình: `docs/cloudflare-deployment.md`.
- Gửi offer → tạm giữ đủ tổng gói. Từ chối / hết hạn 48 giờ → hoàn về số dư.
- Đối chiếu khi hết gói; gói dài hơn 1 tháng thì đối chiếu cuối mỗi tháng. Nền tảng thu **5% trên tiền các buổi đã xác nhận**, phần còn lại vào số dư gia sư; buổi không diễn ra hoàn về học sinh.
- Rút tiền: thẻ yêu cầu gửi vào hội thoại với admin; admin chuyển khoản tay rồi bấm "Đã chuyển" mới trừ số dư.
- Production đã bật cổng thanh toán (khóa lưu trong Worker secrets). Local không có khóa thì nạp tiền được giả lập.

## Credit gia sư

- Mỗi tháng **reset về 10 credit** (chỉ gia sư đã xác minh), không cộng dồn. Credit mua thêm không reset.
- Gửi một hồ sơ/offer cho học sinh tốn **2 credit, không hoàn**.
- Đặt thêm credit để đẩy hồ sơ (kiểu Upwork Boost): top 3 được ghim "Nổi bật", gia sư chỉ thấy thứ hạng của mình; bị vượt khỏi top 3 thì hoàn phần đặt thêm.
- Mua credit bằng số dư; giá do admin chỉnh.

## Offer và lớp học

- Offer (lấy cảm hứng Upwork): môn, lớp, online/tại nhà (khu vực; địa chỉ chỉ hiện sau khi nhận), gói N buổi × thời lượng × học phí, lịch tuần, ngày bắt đầu, lời nhắn. Gia sư thấy ngay số tiền thực nhận.
- Lớp 1–1 hoặc lớp nhóm; mỗi học sinh có gói riêng. Tab Lịch, Bài giảng, Học sinh, Tin nhắn. Gói còn 2 buổi thì gia sư bấm "Nhắc gia hạn".
- Sau buổi học, hai bên cùng bấm kết thúc trong 48 giờ; một bên im lặng thì tự xác nhận trừ khi bên kia "Báo vấn đề" (mở tranh chấp với admin).
- Đổi lịch bằng kéo thả, bên kia đồng ý. Hủy ≥ 12 giờ: không tính tiền. Học sinh hủy < 12 giờ: tính tiền. Gia sư hủy < 12 giờ hoặc không đến: hoàn tiền + 1 vi phạm; 3 vi phạm admin xem xét. Kết thúc gói sớm: buổi chưa học được hoàn.
- Lịch kiểu Apple Calendar: Ngày / Tuần / Tháng, kéo tạo và kéo dời, vạch giờ hiện tại, mỗi lớp một màu pastel; điện thoại dùng danh sách ngày + dải tuần vuốt.

## Hồ sơ gia sư

- Tạo theo bước. Trường học, giải thưởng, chứng chỉ chọn từ danh sách có sẵn; **mỗi mục bắt buộc kèm minh chứng**. Không yêu cầu CCCD.
- Admin duyệt từng mục cạnh minh chứng. Học sinh chỉ thấy nội dung đã duyệt kèm dấu "Đã xác minh"; file minh chứng không bao giờ công khai.

## Đánh giá

- Học sinh chấm **riêng tư từng buổi**; khi hết offer, số sao tự công khai; học sinh có thể thêm bình luận đi kèm.
- Chỉ người đã học ít nhất 1 buổi xác nhận mới đánh giá được. Thẻ gia sư hiện sao trung bình và số lượt; hồ sơ hiện thêm phân bố sao và bình luận kèm sao.

## Cộng đồng

- Chủ đề bắt buộc chọn: Tìm gia sư, Hỏi bài, Kinh nghiệm học & thi, Chia sẻ tài liệu, Gia sư tìm lớp / nhóm học, Thông báo (chỉ admin; thay mục Tin tức).
- Hệ thống có lớp kiểm tra: nếu nội dung có vẻ không khớp chủ đề đã chọn thì hỏi lại người đăng.
- Bài "Tìm gia sư" không có bình luận thường: gia sư "Gửi hồ sơ (2 credit)"; học sinh/phụ huynh khác chỉ ♥ và "Quan tâm". Người đăng thấy mọi hồ sơ; gia sư khác chỉ thấy số lượng.
- Lọc: Thịnh hành / Mới nhất / Liên quan đến bạn. Điểm thịnh hành giảm chậm theo thời gian (số mũ 0,8) và được cộng khi khớp môn, lớp, khu vực của người xem.

## Giao diện

- Giữ theme: nền giấy ấm, đỏ sẫm, Be Vietnam Pro + Lora. Responsive điện thoại, iPad, máy tính.
- Song ngữ VI/EN cho toàn bộ màn hình.
- Màn hình mở app ~1 giây; hiệu ứng nhỏ khi nhận lớp, tiền về, xác nhận buổi.
- Thông báo trong app (chuông) + email cho việc quan trọng; Zalo để sau.
- Bỏ: đặt từng giờ trống và yêu cầu học theo tuần (thay bằng offer/lớp), Tìm môn học (gộp vào tìm gia sư), Tin tức (thành chủ đề Thông báo), thư viện ảnh có thích/bình luận, nhạc nền.
- Dữ liệu production được phép ghi đè; dữ liệu mẫu local phủ đủ mọi tính năng cho 4 tài khoản (học sinh, phụ huynh, gia sư, admin).
