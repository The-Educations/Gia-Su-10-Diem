# Bàn giao phát triển — 31/10/2026

Người dùng đã yêu cầu **tiếp tục phát triển**, thay thế yêu cầu tạm dừng trước đó. Marketplace đã qua kiểm tra local và có cấu hình production; xem lịch sử Git và [bàn giao Cloudflare](cloudflare-deployment.md) để triển khai.

Phạm vi giữ nguyên: **tìm gia sư**, dành cho học sinh / phụ huynh, gia sư và admin. Môn học / mục tiêu kỳ thi phục vụ discovery; không có quiz / đáp án / chấm điểm. Motion biểu cảm, có reduced motion. Giữ công việc landing có sẵn và không thêm AI co-author vào commit.

## Đã hoàn thành trong lần tiếp tục

- Sửa alias TypeScript 7; build React/Vite thành công.
- Hoàn thiện theme, layout desktop/mobile, form, card, menu, dialog và trạng thái tải/lỗi/trống.
- Tìm gia sư không dấu; lọc môn, hình thức, địa điểm, học phí, cấp học và mục tiêu kỳ thi.
- Hồ sơ, giờ trống, yêu cầu học có màn hình xem lại, nhận/từ chối/hủy/hoàn thành, nhắn tin lưu SQLite, xuất lịch và đánh giá.
- Tutor onboarding, hồ sơ nhận dạy / luyện thi, availability; admin xét hồ sơ, khóa tài khoản, quản lý danh mục và audit.
- Migration bổ sung `levels`, `goals`, đánh dấu `user_version=2`; có test bảo toàn dữ liệu cũ.
- Nối CTA landing đến marketplace; landing form mở tìm gia sư theo môn/hình thức.
- Sửa route Vite để không trả HTML cho JS; thêm `npm run preview` phục vụ bản build local.
- Sửa MessageScroller thiếu provider (đã gây crash khi mở hội thoại); thêm error boundary với tải lại / về tìm kiếm.
- Tách React và motion khỏi bundle chính; bỏ dependency Three.js không dùng trong app. Landing hiện dùng SVG phân lớp theo scroll thay cho khối Three.js / pixel thử nghiệm.
- Định dạng nguồn mới để tiếp tục phát triển dễ đọc.

**Đính chính bàn giao trước:** nhận định SQL seed có 9 cột nhưng 8 placeholder là sai. Câu seed thực tế có 8 cột / 8 giá trị và chạy được; không ghi nhận đây là một lỗi đã sửa.

## Bằng chứng local

Môi trường: Node `26.12.1`, Chrome desktop, database API / E2E tạm riêng. Không dùng kết quả local làm bằng chứng production.

Lần refine tiếp theo đã thêm CV / ảnh public sau approval, private inquiry trước booking, demo portraits / CV / activity, tutor cards gọn hơn, advanced filters dùng Animate UI Collapsible và studio upload có preview, replace, delete. Kiểm tra thêm: 5 MB, signature/parse, pending/approved file visibility, revoke URL cũ sau replace, sở hữu inquiry và seed idempotence.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Landing assertions + 11 API/OAuth tests pass |
| `npm run build:app` | Pass; route lazy loading, React/motion chunks riêng |
| `npm run test:e2e` | 8 browser flows (marketplace, role workspace, landing/parallax và Google UI) pass |
| Chrome DevTools | Đã xem desktop student/tutor/admin, studio profile và mobile tutor/admin; không lỗi console trên các trang kiểm tra |
| Responsive / focus | Browser tests 360, 390, 768, 1024, 1440 px; menu Escape và focus restore |
| Reduced motion | Account routes ở 360 px; profile 390 px không tràn, `.page` không transform khi reduce |

API tests kiểm tra phân quyền, session/password revocation, hồ sơ pending/approved, ẩn private fields, đồng thời đặt trùng slot, xung đột lịch học sinh, ownership hội thoại, giá booking cố định, completion/review, favorites, danh mục admin và migration. Các kiểm tra này không phải security audit toàn diện; rate limiting và proxy production chưa qua load test.

Browser flows: khách tìm/lọc và danh mục; học sinh đặt → gia sư nhận → hai bên nhắn tin và reload → xuất lịch → hủy; tutor đăng ký đúng vai trò → khai báo cấp học/mục tiêu → mở giờ → admin công bố; favorites và account settings.

## Refine workspace theo vai trò

- Student: buổi tiếp theo, lịch tuần chọn ngày bằng bàn phím, mục tiêu, gia sư đã lưu và inquiry gần đây.
- Tutor: yêu cầu cần phản hồi, lịch dạy, mức hoàn thiện hồ sơ; studio tách 3 tab và giữ bản nháp khi đổi tab.
- Admin: metrics liên kết đến danh sách, lọc pending/approved/rejected, pending lên đầu; empty search có reset; giữ tab sau mutation.
- Motion: metrics count-up, panel fade/slide/blur theo nhịp, tab/day indicator; sửa overflow tạm thời khi đổi viewport hoặc tab.
- `useLoad` refresh giữ dữ liệu cùng user/path; `Progress` truyền value để screen reader đọc được phần trăm.
- Regression mới kiểm tra 3 role, admin redirect, lịch tuần, keyboard focus, studio draft, admin save/tab persistence và responsive/reduced motion.

## Khởi động lại

Xem [README](../README.md) để chạy demo và tài khoản local. Server mặc định cổng 4174; Playwright dùng 4175 và database tạm. Không chạy hai server cùng cổng. `SERVE_BUILD=1` là preview local; `NODE_ENV=production` yêu cầu HTTPS và bật Secure cookie.

Giữ `.data/marketplace.sqlite` nếu muốn tiếp tục với dữ liệu hiện tại; không xóa database để sửa schema. Seed demo không đặt lại mật khẩu hay tái tạo giờ trống của tài khoản đã có. Khi demo slots cũ hết hạn, thêm giờ trong tutor studio hoặc dùng database demo riêng mới.

## Việc còn lại

1. **Nội dung:** rà nguồn kỳ thi / địa phương, chính sách và nội dung landing. 25 nhóm môn / 8 nguồn là danh mục ban đầu, không phải mọi kỳ thi Việt Nam. IELTS / TOEIC đang chung nhóm “Chứng chỉ ngoại ngữ”; cần taxonomy chi tiết nếu muốn phân biệt matching.
2. **Tài khoản & vận hành:** xác thực email, khôi phục mật khẩu, thông báo, báo cáo vi phạm, xác minh danh tính / bằng cấp, chính sách quyền đọc hội thoại booking của admin (inquiry chỉ có hai bên), backup / restore và quy trình hỗ trợ.
3. **Lịch:** chưa có lịch lặp, đổi lịch, thời lượng tùy chọn, tự hết hạn yêu cầu hoặc khung giờ có lịch sử bị xóa. Profile sửa sẽ về pending, tạm ẩn khỏi discovery; các booking cũ vẫn được giữ.
4. **Quy mô:** API discovery và hội thoại trả toàn bộ rows; chưa phân trang, realtime hoặc trạng thái đã đọc. SQLite đồng bộ và rate-limit trong process phù hợp local / quy mô nhỏ; cần đo tải trước khi mở rộng.
5. **UX tiếp theo:** lỗi validation còn ở mức form; auth bootstrap khi lỗi mạng hiện coi như chưa đăng nhập; refresh cùng user/path đã giữ dữ liệu; reload toàn trang vẫn tải lại và draft chưa có autosave. Cần kiểm tra thêm Safari / Firefox và công nghệ hỗ trợ trước launch.
6. **Deployment:** Cloudflare Worker/DO SQLite đã được cấu hình; CI tự động chưa thiết lập. Upload hiện lưu các chunk 100 KB trong SQLite, tối đa một ảnh + một CV/tutor, chưa có quét malware / quota tổng / retention backups. Chưa có tích hợp thanh toán / video; không thêm các dịch vụ này chỉ vì có mục trong backlog.

## Quyết định kỹ thuật cần giữ

- Express cùng origin với SPA để session cookie và API dễ chạy local; SQLite giúp thử toàn bộ luồng mà không cần dịch vụ ngoài. Cloudflare dùng SQLite bền vững trong Durable Object thay cho file local.
- Cấp học và mục tiêu nằm trên tutor profile để discovery dựa trên khả năng nhận dạy khai báo. `resources.subject_id` chỉ là liên hệ danh mục; CTA kỳ thi lọc theo category/mục tiêu.
- Chỉ seed demo khi gọi rõ ràng; app startup chỉ seed catalogue. Không coi tài khoản mẫu là gia sư đã xác minh.
- UI dùng component shadcn và primitive Animate UI; không tạo lab 3D hoặc LMS từ yêu cầu tên skill.

Đọc [phạm vi](marketplace.md) và [kiến trúc](architecture.md) trước khi tiếp tục. Không chỉnh riêng generated `index.html`; sinh từ nguồn.
