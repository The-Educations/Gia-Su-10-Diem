# Cộng đồng — bàn giao triển khai

Thiết kế gốc: [community-design.md](community-design.md). Nhánh `feat/community`, bắt đầu từ `origin/main` tại `d6cea7f`. Người dùng xác nhận giữ tên menu **Tìm môn học**, đặt **Cộng đồng** ngay bên dưới. Không thay đổi form đăng ký; giữ xác minh email và onboarding hiện hành.

## Phần đã triển khai

- **Dữ liệu / API:** `server/community-schema.js`, `community-policy.js`, `community.js`, `community-admin.js`; migration cộng thêm được gọi từ `migrateDatabase`. Các bảng Tin tức, gallery và tài khoản hiện có được giữ nguyên. `publicUser` bổ sung tên hiển thị và trạng thái khóa chỉ cho tài khoản đang đăng nhập.
- **Người dùng:** danh sách, lọc, tìm kiếm, phân trang; bài Quy tắc luôn đầu trang 1; soạn/sửa, bản sửa chờ duyệt, Bài của tôi; bình luận hai cấp, Hữu ích, câu trả lời hay nhất, Đã giải quyết, theo dõi, báo cáo, thông báo. Thành phần trong `app/src/components/community/`, trang `Community*.tsx`.
- **Quản trị:** `AdminCommunity.tsx` có hàng đợi, so sánh bản sửa, báo cáo, ẩn/khôi phục, lịch sử bài tự xóa, thông báo và Quy tắc. Khóa quyền ở hàng đợi, báo cáo và danh sách tài khoản. Ghi audit cho thao tác quản trị.
- **SEO:** Node và Worker dùng cùng metadata; sitemap chỉ lấy bài approved của tài khoản active. Bản chưa duyệt/bị ẩn/xóa trả 404 + noindex. JSON-LD DiscussionForumPosting chỉ dùng danh tính công khai. Cờ `public` trong payload giữ metadata phía client đúng cả khi admin đọc bài của tài khoản bị tạm khóa.
- **Kiểm thử:** `test/community.test.js`, `test/e2e/community.spec.ts`, các kiểm tra SEO và Cloudflare smoke. `E2E_PORT` cho phép chạy worktree riêng mà không dừng server đang dùng cổng mặc định.

## Các chi tiết [ĐỀ XUẤT] đã áp dụng

| Nhóm | Mặc định |
| --- | --- |
| Danh tính | Hộp thoại tên hiển thị, gợi ý từ tên cuối; 2–30 ký tự, không cần duy nhất. Gia sư chưa duyệt thiếu tên dùng “Thành viên” khi đọc, không lấy họ tên thật. Nhãn tính theo trạng thái hồ sơ lúc đọc; admin dùng họ tên. |
| Nội dung | Tiêu đề 120, nội dung 5.000, bình luận 1.000 ký tự. Văn bản thuần, không tệp. Dòng lưu ý và Quy tắc dùng bản nháp trong thiết kế. |
| Bình luận | Một cấp trả lời; cũ trước; 20 bình luận gốc/lần, quá 3 trả lời thì thu gọn. Câu trả lời hay nhất ghim đầu. Sửa có nhãn; bình luận đã gỡ có trả lời giữ chỗ, không lộ nội dung cũ. Không tự Hữu ích hoặc tự chọn câu trả lời hay nhất. |
| Danh sách | 20 bài/trang. Hữu ích tính tổng phiếu trên bình luận đang hiển thị; hòa thì bài mới hơn trước. Bảng đồng nghĩa môn/cấp học ngắn trong `community-policy.js`; tìm kiếm bỏ dấu, AND giữa các bộ lọc, escape LIKE. |
| Giới hạn | 3 bài/24 giờ, 5 bình luận/phút, 10 báo cáo/giờ mỗi tài khoản; hằng số `LIMITS`. Endpoint admin đăng thông báo không áp quota của thành viên. |
| Báo cáo / khóa | Mỗi đối tượng báo cáo một lần/tài khoản; 5 lý do, ghi chú tối đa 300 ký tự; admin quyết định, không tự ẩn. Khóa đến khi admin mở lại, lý do bắt buộc. Theo dõi và đọc vẫn hoạt động. |
| Thông báo | Chấm số chưa đọc, cập nhật khi chuyển trang, quay lại tab và sau thao tác; không polling/realtime/email. Bình luận mới gộp theo bài khi còn chưa đọc. |
| Quy tắc | Một dòng duy nhất bằng partial unique index. Nếu chưa có admin, trả bản mặc định; lưu dòng khi admin sửa hoặc migration lần tiếp theo có admin. |
| SEO | Description 160 ký tự; DiscussionForumPosting dùng tên công khai. Nội dung trên trang vẫn do React vẽ theo kiến trúc sẵn có. |

## Phạm vi và giới hạn

Không thêm loại bài, thẻ khi soạn, nhắc gia sư, tệp, chat, email cộng đồng, realtime, điểm uy tín, thanh toán hoặc AI. Có thêm danh sách admin theo trạng thái để khôi phục bài ẩn và xem lịch sử bài tự xóa; đây là giao diện cho các thao tác được yêu cầu.

Bộ lọc liên hệ là các mẫu thực dụng, không bắt được mọi cách viết lách luật; kiểm duyệt và báo cáo vẫn cần thiết. Tìm kiếm LIKE phù hợp quy mô nhỏ; chưa có full-text index. Google có thể xử lý JavaScript nhưng không bảo đảm lập chỉ mục. Chưa push, mở PR, merge hoặc triển khai production.

Bản preview chỉ dùng SQLite và tài khoản demo riêng, không phải dữ liệu production.

## Kết quả kiểm chứng trước khi đồng bộ main

- `npm run typecheck`: đạt.
- `npm test`: **48/48** tests đạt, kèm kiểm tra landing/assets.
- `npm run build` và `npm run build:cloudflare`: đạt; bản assets Cloudflare được làm mới sau thay đổi cuối.
- `E2E_PORT=4183 npm run test:e2e`: **21/21** đạt. Sau khi thêm phiên bản duyệt, chạy lại hai luồng cộng đồng: **2/2** đạt. Cổng mặc định 4175 đang có server khác, được giữ nguyên.
- Cloudflare Worker/Durable Object **local** ở cổng 4184: smoke đạt; migration, tên hiển thị, lọc liên hệ, pending/private, sửa/xóa, sitemap và SEO được chạy thật. Không phải bằng chứng production.
- Browser: 360, 390, 768, 1024, 1440 px không tràn ngang; reduced motion giữ nội dung hiển thị và không dịch chuyển; Xem thêm dùng Enter được; có ảnh `test-results/community-mobile.png` và `community-desktop.png` (không commit artifacts).
- Chrome DevTools: đã đọc DOM/network/console bản build; không lỗi/warning trên trang danh sách được kiểm tra. Ban đầu tool screenshot/resize/evaluate bị cơ chế approval của phiên từ chối; phần viewport và ảnh dùng Playwright đã được cho phép. Vite dev shell cũ có 404 favicon; bản build không gặp lỗi này.
- Review độc lập đã tìm ra và xác nhận bản sửa lỗi duyệt nội dung đã đổi: `review_version` tăng khi người đăng sửa; admin gửi `expected_version`, quyết định cũ nhận 409. Regression kiểm tra cả bài mới và bản sửa. Mutation test trên bản sao tạm bỏ guard đã thất bại đúng như mong đợi; source chính không bị đổi bởi thử nghiệm này.
