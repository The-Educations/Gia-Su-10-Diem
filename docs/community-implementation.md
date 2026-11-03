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

Không thêm loại bài, thẻ khi soạn, nhắc gia sư, chat, email cộng đồng, realtime, điểm uy tín, thanh toán hoặc AI. Theo yêu cầu bổ sung, bài viết hỗ trợ ảnh tải lên và liên kết học tập; không có tệp đính kèm khác. Có thêm danh sách admin theo trạng thái để khôi phục bài ẩn và xem lịch sử bài tự xóa; đây là giao diện cho các thao tác được yêu cầu.

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

## Bản cuối sau đồng bộ main

Đã tích hợp `d735dac` (lịch học hai giờ, lịch tuần và đồng hồ địa phương) vào nhánh cộng đồng, giữ cả hai nhóm migration/API/CSS. Kiểm tra lại trên bản kết hợp: **typecheck đạt, 51/51 unit/API tests, build đạt, 23/23 browser tests và Cloudflare local smoke đạt**. Chrome DevTools sau khi quyền phiên được mở đã chụp và kiểm tra desktop, trực tiếp kiểm tra 360 px/reduced motion, mở Quy tắc bằng nút Xem thêm; không tràn ngang, không lỗi/warning console trên trang được kiểm tra.

Worktree lưu tại `/Users/phucdang/Documents/giasu-community`, nhánh `feat/community`. Preview bản build: `http://127.0.0.1:4185/app/community` với dữ liệu demo riêng. Khởi động lại: `DB_PATH=.data/community-preview.sqlite PORT=4185 NODE_ENV=test SERVE_BUILD=1 node server/index.js`.

## Cải thiện giao diện theo vai trò — 02/11/2026

- Trang cộng đồng và Bài của tôi có vùng danh tính công khai, điều hướng Thảo luận / Bài của tôi và thông báo. Học sinh, phụ huynh và gia sư chưa duyệt vẫn dùng tên hiển thị riêng; gia sư đã duyệt có liên kết hồ sơ công khai. API `/community/me` lấy danh tính từ cùng chính sách phía server, không đưa email hay họ tên riêng vào giao diện công khai.
- Quản trị viên có nút **Quản lý cộng đồng** ngay trên trang cộng đồng. Tổng quan quản trị có số bài chờ duyệt, báo cáo chưa xử lý, bài đã đăng và bài ẩn, mỗi số dẫn đến danh sách tương ứng. Tab, trạng thái và trang danh sách được giữ trong URL; nút đăng thông báo luôn sẵn có.
- Trang chi tiết dẫn đến đúng nơi xét duyệt, sửa Quy tắc hoặc quản lý bài ẩn. Nút Ẩn bài chỉ xuất hiện khi bài đã duyệt; Khôi phục chỉ dành cho bài ẩn. Các thao tác duyệt giữ nguyên bảo vệ `expected_version`.
- Gia sư đã duyệt không còn bị yêu cầu tên hiển thị trước khi đăng/bình luận. Khóa đồng thời khi kiểm tra danh tính ngăn thao tác nhấp hai lần tạo hai bình luận. Tài khoản bị khóa nhìn thấy lý do ngay trong vùng thành viên.
- Không đổi quyền giữa học sinh và phụ huynh, không thêm chức năng mạng xã hội hoặc thay đổi quy trình duyệt.

Kiểm chứng: typecheck/build đạt; **52/52 unit/API tests** đạt. Bộ browser đầy đủ có 23 ca đạt và một kiểm tra kích thước chạy quá sớm ngay sau resize; đổi kiểm tra đó sang chờ kích thước ổn định, ca vai trò chạy lại đạt. Chạy lại toàn bộ ba luồng cộng đồng trên bản cuối: **3/3 đạt**; cộng với **21/21** ca marketplace/navigation/SEO đã đạt trong lần chạy đầy đủ. Các ca mới kiểm tra đủ quản trị/gia sư đã duyệt/gia sư chưa duyệt/học sinh/phụ huynh, danh tính, tab qua reload, bàn phím, 320/768/1440 px, nhấp đúp khi API chậm và bài ẩn còn bản sửa chờ duyệt. Chrome DevTools trực tiếp kiểm tra quản trị desktop/320 px và học sinh 360 px, reduced motion, ảnh chụp và console không có lỗi/warning trên bản build ổn định. Review độc lập xác nhận hai lỗi nhấp đúp và điều hướng bài ẩn đã được sửa. Đây là kiểm chứng local, chưa triển khai production.


## Rich text, ảnh và liên kết — yêu cầu bổ sung 02/11/2026

- Tiptap cung cấp định dạng đậm/nghiêng/gạch chân, tiêu đề phụ, danh sách, trích dẫn, liên kết HTTP(S), ảnh, hoàn tác/làm lại. Có mô tả ảnh và nút xóa ảnh đang chọn. Trình soạn thảo, bài đọc, bản sửa và hàng đợi admin hiển thị cùng nội dung đã làm sạch. Bình luận giữ văn bản thuần.
- `body_html` / `revision_body_html` là migration cộng thêm; `body` / `revision_body` vẫn là văn bản để tìm kiếm, SEO và tương thích bài cũ. Server tự suy ra văn bản từ HTML và dùng danh sách thẻ/thuộc tính cho phép; loại script, iframe, sự kiện, kiểu CSS và URL nguy hiểm. Link mở tab mới với `noopener noreferrer nofollow ugc`. Không tải ảnh từ URL ngoài.
- Ảnh JPG/PNG/WebP tối đa 5 MB và 16 triệu pixel, được xử lý thành WebP tối đa 1280 px qua pipeline ảnh sẵn có ở Node/Worker. Tối đa 5 ảnh mỗi bài, 20 lượt tải/ngày/tài khoản. File lưu thành chunk 100 KB. Upload không gắn bài quá 24 giờ được dọn vào lần tải tiếp theo của chủ tài khoản.
- Quan hệ ảnh phân biệt bản công khai và bản sửa. Chỉ chủ ảnh/admin xem được ảnh nháp; khách chỉ xem ảnh được tham chiếu bởi bản đã duyệt của tài khoản hoạt động. Ẩn/xóa bài hoặc đình chỉ tác giả thu hồi truy cập công khai; phản hồi ảnh dùng `no-store`. Giao dịch kiểm tra quyền ảnh trước khi ghi bài. Duyệt bản sửa cập nhật nội dung và tập ảnh công khai cùng lúc.
- Quy tắc mặc định được cập nhật cho ảnh/link; chỉ thay nội dung mặc định cũ, không thay văn bản quy tắc đã tùy chỉnh. Email/số điện thoại/Zalo vẫn bị lọc trong nội dung chữ. Admin tiếp tục kiểm tra ảnh và đích liên kết.
- Kiểm chứng local: typecheck/build, 54/54 unit/API tests, 4/4 luồng cộng đồng trên Chrome, Cloudflare local runtime gồm upload ảnh riêng tư và HTML đã làm sạch, dependency audit 0 lỗ hổng. Review độc lập không tìm thấy blocker XSS/quyền ảnh; đã sửa và kiểm thử trường hợp bản sửa chỉ có ảnh. DevTools kiểm tra soạn bài/chèn link ở 360 px, không tràn ngang.

Tích hợp thêm `65d915b` từ main (lịch theo giờ, lịch học viên và duyệt/kho giao diện gia sư) trước khi phát hành. Giữ cả module cộng đồng và module duyệt mới, hợp nhất CSS và danh sách route riêng tư. Typecheck, build Cloudflare và **59/59 unit/API tests** đạt trên bản kết hợp.

## Trang viết bài và bản nháp — 02/11/2026

- Nút Đăng bài / Đăng thông báo ở bảng tin và trang quản trị mở `/app/community/write`. Trang có rich editor, Lưu nháp và gửi duyệt/công khai; quy tắc được thu gọn. Sửa bài đã gửi và sửa quy tắc giữ luồng hiện có.
- Bản nháp lưu theo tài khoản trong bảng riêng, cho phép thiếu tiêu đề/nội dung và mở lại/xóa tại Bài của tôi. Giới hạn 100 nháp/tài khoản, phân trang 20 mục. Không đưa nháp vào bảng tin, hàng chờ duyệt hay sitemap; trang viết có `noindex`.
- Phiên bản nháp ngăn ghi đè/xóa từ tab cũ. Gửi bài kiểm tra phiên bản, tạo bài và xóa nháp trong cùng giao dịch; lỗi kiểm tra nội dung không làm mất nháp. Bài thành viên vẫn chờ duyệt, thông báo admin công khai ngay.
- Ảnh được bản nháp tham chiếu không bị dọn sau 24 giờ. Chỉ chủ ảnh xem được ảnh chưa gửi; admin chỉ xem thêm ảnh đã gắn với bài/bản sửa để kiểm duyệt. Đây là cập nhật quyền ảnh so với phiên bản trước.
- Router dùng `createBrowserRouter` với cùng basename và các route hiện có để hỗ trợ `useBlocker`: điều hướng nội bộ và nút Back/Forward hỏi trước khi bỏ phần chưa lưu; tải lại/đóng tab dùng cảnh báo của trình duyệt. Lưu nháp là thao tác chủ động, không tự động lưu.
- Kiểm chứng: 61 unit/API tests; kiểm thử trình duyệt cho lưu nháp chưa có tiêu đề, rich text qua reload, Back giữ nội dung, mở lại và gửi ở cả bốn vai trò; Cloudflare local runtime kiểm tra tạo/sửa/đọc nháp, phiên bản cũ và gửi nháp. DevTools mobile 360 px không tràn ngang, không lỗi/warning console.
