# Số tuần và học thử

Yêu cầu: `/Users/phucdang/Downloads/fix-list.md`, mục 1.

- Đề nghị khóa học mới nhận `weeks`: số nguyên 1–52, mặc định giao diện 4. Ngày kết thúc = ngày bắt đầu + 7 × số tuần − 1. API mới không nhận `end_date`; dữ liệu đề nghị cũ vẫn xem, nhận và hủy được.
- Gia sư bật **Nhận học thử miễn phí · 60 phút** trong hồ sơ. Mặc định tắt.
- Học thử chọn đúng một ô giờ, lấy ngày phù hợp đầu tiên kể từ ngày bắt đầu. Phần xem trước hiện ngày thực tế; chấp nhận tạo đúng một buổi miễn phí.
- Có thể gửi lại khi bị từ chối hoặc hủy trước khi được nhận. Sau lần đầu được nhận, không thể gửi học thử lại với cùng gia sư, kể cả đã hủy.
- Nhận học thử kiểm tra lại cài đặt, môn, hình thức, giờ rảnh và trùng lịch.
- Muốn học tiếp thì tạo đề nghị theo khóa bình thường.

Kiểm chứng: test API về biên số tuần, ngày nhuận, dữ liệu cũ, luồng học thử và trùng lịch; browser về chọn tuần, bật học thử, một ô giờ và chấp nhận lịch.
