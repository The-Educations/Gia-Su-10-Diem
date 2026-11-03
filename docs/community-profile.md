# Hồ sơ thành viên trong Cộng đồng — Thiết kế và prompt xây dựng

Mở rộng của [community-design.md](community-design.md) và [community-implementation.md](community-implementation.md); đọc hai tài liệu đó trước, tài liệu này không lặp lại những gì đã có ở đó. Tài liệu gồm hai phần:

- **Phần 1 — Kiến trúc, thiết kế và logic** của chức năng hồ sơ thành viên.
- **Phần 2 — Prompt** để gửi cho Agent bắt đầu xây dựng.

Trạng thái: **chỉ là thiết kế, chưa có dòng code nào được viết.** Nhánh làm việc: `hung-new`. Nội dung được chốt qua thảo luận ngày 03/11/2026.

## Cách đọc các nhãn

| Nhãn | Ý nghĩa |
| --- | --- |
| **[CHỐT]** | Người dùng đã đồng ý rõ ràng trong thảo luận. Không tự ý đổi. |
| **[ĐỀ XUẤT]** | Chi tiết cần thiết để chạy được, đã được đưa ra nhưng chưa bàn riêng từng chi tiết nhỏ. Cứ làm theo, nhưng nêu trong báo cáo cuối để người dùng xác nhận. |
| **[KHÔNG LÀM]** | Người dùng đã loại ra, hoặc chưa được duyệt. Không được thêm. |

Ghi chú: người dùng đã trả lời "đồng ý hết" cho cụm đề xuất lớn (khách không thấy ảnh; đổi tên hiển thị tối đa 3 lần/24 giờ; giới thiệu 300 ký tự, hiện ngay, có báo cáo; hồ sơ admin; tài khoản bị khóa không sửa được hồ sơ; tên route). Các mục đó được đánh dấu [CHỐT]. Các con số và bố cục nhỏ còn lại giữ nhãn [ĐỀ XUẤT].

---

# PHẦN 1 — KIẾN TRÚC, THIẾT KẾ VÀ LOGIC

## 1. Mục tiêu và nguyên tắc

### 1.1 Mục tiêu [CHỐT]

Mỗi tài khoản đã đăng nhập có một **hồ sơ công khai trong cộng đồng**, ở mức đơn giản giống trang cá nhân Facebook: ảnh đại diện, ảnh bìa, tên, tư cách, giới thiệu, hoạt động. Hồ sơ hiện ra khi:

- người dùng tự xem hồ sơ của mình, và
- bất kỳ thành viên đã đăng nhập nào bấm vào tên hoặc ảnh của một người trong Cộng đồng.

Áp dụng cho **mọi vai trò**: Học sinh, Phụ huynh, Gia sư (đã duyệt và chờ duyệt), Quản trị viên. **Khách chưa đăng nhập không xem được hồ sơ.**

Trang **Cài đặt tài khoản** hiện tại (`/settings`: họ tên, mục tiêu, trường, địa chỉ, múi giờ, mật khẩu, Google) **giữ nguyên.** Hồ sơ cộng đồng là một thứ riêng, không thay thế Cài đặt.

### 1.2 Nguyên tắc thiết kế

1. **Giữ nguyên quy tắc riêng tư của Cộng đồng.** Học sinh/phụ huynh/gia sư chờ duyệt chỉ công khai bằng tên hiển thị. `users.id`, `users.name`, `email` không bao giờ nằm trong dữ liệu công khai. Danh tính công khai duy nhất của họ là **mã hồ sơ ngẫu nhiên**.
2. **Một nguồn danh tính.** Tên và nhãn tư cách trên hồ sơ dùng đúng hàm `authorLabel` (tính khi đọc) đã dùng cho bài và bình luận, nên hồ sơ luôn khớp nhãn ở mọi nơi.
3. **Không tạo luồng kiểm duyệt mới.** Ảnh, ảnh bìa, giới thiệu hiện ngay; kiểm soát bằng bộ lọc, báo cáo, gỡ bởi admin và khóa quyền (như bình luận).
4. **Tách biệt với hồ sơ gia sư.** Ảnh/ảnh bìa tài khoản là của tài khoản, độc lập với ảnh và banner trong `/studio`. Đổi chúng không đặt hồ sơ gia sư về `pending`.
5. **Không thêm tính năng ngoài danh sách chốt.**

### 1.3 Danh sách [KHÔNG LÀM]

- Theo dõi / kết bạn / chặn người dùng khác; danh sách thành viên; tìm kiếm thành viên.
- Nhắn tin riêng từ hồ sơ. Mục **Tin nhắn** không đổi.
- Công tắc ẩn/hiện từng phần hồ sơ [CHỐT: hiển thị cố định].
- Huy hiệu, điểm uy tín, thành tích.
- Lộ họ tên thật, email, trường, địa chỉ, mục tiêu học, múi giờ, lịch học, gia sư đã lưu của học sinh/phụ huynh.
- Hồ sơ trên Google (sitemap, JSON-LD, og:image). Hồ sơ `noindex`.
- Thông tin về con trên hồ sơ phụ huynh [CHỐT: hoãn đến khi bàn tài khoản phụ huynh].
- Danh sách bình luận trên hồ sơ [CHỐT: không chọn mục này].
- Đưa ảnh/hồ sơ vào Tin nhắn, đánh giá gia sư, bình luận ảnh gia sư [CHỐT: chỉ Cộng đồng + sidebar + Cài đặt]. Các nơi đó giữ nguyên như hiện nay, kể cả việc đang hiện họ tên thật (xem mục 17).

## 2. Kiến trúc tổng quan

```
Sidebar (main.tsx, account-link) ──► menu nhỏ ─┬─► /app/community/members/{mã của tôi}
                                              └─► /app/settings
Tác giả trên bài/bình luận (AuthorLabel) ─────► /app/community/members/{mã}      (khách → /auth?next=)
                                                        │
                              CommunityProfile.tsx ◄────┘
                                │  GET /api/community/members/:code            (hồ sơ + thống kê)
                                │  GET /api/community/members/:code/posts      (bài đã duyệt, sort, phân trang)
                                │  GET /api/community/members/:code/avatar|cover  (ảnh; cần phiên)
                                │  PUT /api/community/me/profile, avatar, cover (chủ tài khoản)
                                ▼
            server/community-profile.js ── dùng community-policy.js (authorLabel, findContactInfo, displayNameSchema)
                                ▼
         SQLite (node:sqlite local / Durable Object production): users + user_images + user_image_chunks + community_*
```

- **Backend:** mô-đun mới `server/community-profile.js` đăng ký route theo mẫu các mô-đun `community*.js`; dùng lại `auth`, `audit`, `transaction`, `all/one/run`, `z/text`. Xử lý ảnh dùng lại pipeline của `server/uploads.js` / `community-images.js` (Node: sharp; Worker: Cloudflare Images).
- **Frontend:** trang mới `CommunityProfile.tsx`; sửa `main.tsx` (menu sidebar, route), `components/community/shared.tsx` (`AuthorLabel`), `Onboarding.tsx` (ô Tên hiển thị), `Settings.tsx` (một dòng liên kết).
- **CSDL:** migration cộng thêm, chạy được ở cả Node và Worker (mục 12).

## 3. Lối vào [CHỐT]

Bấm khối tên ở góc dưới trái sidebar (`account-link`, hiện đi thẳng `/settings`) thì **mở menu nhỏ** gồm đúng hai mục:

1. **Xem hồ sơ của tôi** → hồ sơ của chính mình.
2. **Cài đặt tài khoản** → `/settings` như hiện nay.

- [ĐỀ XUẤT] Menu hoạt động cả khi sidebar thu gọn, đóng bằng Esc/bấm ra ngoài, dùng được bằng bàn phím, không thêm mục nào khác.
- [ĐỀ XUẤT] Khối tên ở sidebar dùng ảnh đại diện thật nếu có.
- [ĐỀ XUẤT] Trang Cài đặt thêm một dòng nhỏ liên kết "Hồ sơ cộng đồng của tôi"; không chuyển ô nào của Cài đặt sang hồ sơ.
- Các nơi khác đưa tới hồ sơ [CHỐT]: bấm **ảnh hoặc tên** tác giả trên thẻ bài, trang bài, bình luận, trả lời. Nút "Hồ sơ" trong vùng thành viên của trang Cộng đồng và Bài của tôi [ĐỀ XUẤT].

## 4. Đường dẫn và mã hồ sơ [CHỐT]

- Đường dẫn: `/app/community/members/:code`.
- `:code` là **mã ngẫu nhiên cố định** của tài khoản, ví dụ `k7x2m9qa`. Không dùng ID số, không dùng họ tên.
  - Cột mới `users.profile_code` (UNIQUE). 8 ký tự `a-z2-9`, sinh bằng bộ sinh an toàn mật mã, thử lại nếu trùng. Migration điền cho mọi tài khoản đã có; tài khoản mới được cấp khi tạo (cả đăng ký email lẫn Google).
  - Không đổi, người dùng không tự chọn.
- Route `members/:code` phải đặt **trước** `/community/:id`; không đụng `/community/write`, `/community/mine`.
- Mã là định danh công khai duy nhất của học sinh/phụ huynh. Nó được đưa vào đối tượng tác giả ở cả API công khai (để bấm tên dẫn tới đăng nhập rồi quay lại), nhưng chỉ mở được khi đã đăng nhập.

## 5. Nội dung hồ sơ

### 5.1 Bố cục [CHỐT các thành phần; ĐỀ XUẤT chi tiết]

Từ trên xuống:

1. **Ảnh bìa** (nếu chưa có: nền màu/hoa văn mặc định theo thương hiệu).
2. **Ảnh đại diện** gối lên mép ảnh bìa, cạnh **tên + huy hiệu tư cách**, **ngày tham gia** ("Tham gia tháng 10/2026").
3. **Nút hành động:** **Sao chép liên kết** (mọi người xem); **Chỉnh sửa hồ sơ** (chủ tài khoản); **Báo cáo** (người khác); **Xem hồ sơ gia sư** (chỉ gia sư đã duyệt).
4. **Giới thiệu ngắn** (trống thì ẩn khối với người khác).
5. **Hàng thống kê:** số bài đã đăng · số bình luận · số lượt "Hữu ích" nhận được.
6. **Bài viết đã đăng:** bộ chọn sắp xếp **Mới nhất / Hữu ích nhất**, danh sách `PostCard` (đã có "Xem thêm"), 10 bài/trang.

Không có tab, không có danh sách bình luận.

Chi tiết:

- **Sao chép liên kết** [CHỐT]: chép URL đầy đủ của hồ sơ, hiện thông báo "Đã sao chép liên kết"; nếu trình duyệt không cho chép thì hiện URL để chép tay [ĐỀ XUẤT]. Người nhận vẫn phải đăng nhập mới xem được.
- **Thống kê** [CHỐT nội dung; ĐỀ XUẤT cách tính]: chỉ tính nội dung đang công khai — bài `approved`, bình luận `visible` trên bài `approved`. Bài ẩn/xóa/chờ duyệt/nháp và bình luận bị gỡ không tính. "Hữu ích" là tổng phiếu trên các bình luận đang hiển thị của người đó.
- **Sắp xếp bài** [CHỐT]: "Hữu ích nhất" dùng cùng cách tính với danh sách Cộng đồng (tổng phiếu trên bình luận đang hiển thị, hòa thì bài mới hơn trước). Mặc định Mới nhất; lựa chọn nằm trên URL (`?sort=`) để tải lại không mất.
- Chưa có bài: "Chưa có bài viết nào".
- Không hiển thị: bài chờ duyệt/bị từ chối/nháp (đã có ở Bài của tôi).

### 5.2 Theo vai trò

Danh tính dùng lại đúng `authorLabel` (`server/community-policy.js`); nhãn tính khi đọc nên hồ sơ luôn khớp nhãn trên bài.

| Vai trò | Tên hiển thị trên hồ sơ | Khác biệt |
| --- | --- | --- |
| Học sinh | `Tên hiển thị - Học sinh` (thiếu tên hiển thị thì "Thành viên") | Không có gì thêm. |
| Phụ huynh | `Tên hiển thị - Phụ huynh` | Như học sinh, chỉ khác nhãn; không có thông tin về con [CHỐT]. |
| Gia sư đã duyệt | **Họ tên thật** `- Gia sư` | Có nút **Xem hồ sơ gia sư** → `/tutors/:id` (trang đặt lịch hiện có) [CHỐT]. Hồ sơ cộng đồng không thay thế trang gia sư. |
| Gia sư chờ duyệt | `Tên hiển thị - Học sinh` | Hoàn toàn như học sinh: **không** tên thật, **không** nút gia sư, **không** dùng ảnh/banner trong `/studio`. Khi được duyệt thì tự đổi sang tên thật + Gia sư; bị thu hồi thì quay lại học sinh. |
| Quản trị viên | Họ tên `- Quản trị viên` | Danh sách bài hiển thị các **Thông báo** do admin đăng (không có bài thành viên). Thống kê hiển thị như các vai trò khác [CHỐT]. |

### 5.3 Hồ sơ của chính mình

- Cùng trang với hồ sơ công khai, thêm nút **Chỉnh sửa hồ sơ** và liên kết **Bài của tôi**, **Cài đặt tài khoản** [ĐỀ XUẤT].
- Chưa có ảnh/bìa/giới thiệu/tên hiển thị: hiện gợi ý hoàn thiện (không bắt buộc).
- Bài của tôi vẫn là nơi xem bài chờ duyệt/bị từ chối/nháp.

### 5.4 Quản trị viên xem hồ sơ người khác [ĐỀ XUẤT]

Ngoài phần công khai, admin thấy thêm một khung riêng: họ tên thật, email, trạng thái tài khoản, trạng thái khóa Cộng đồng, và các nút **Gỡ ảnh đại diện**, **Gỡ ảnh bìa**, **Xóa giới thiệu** (bắt buộc nhập lý do, ghi audit log), **Khóa/Mở quyền Cộng đồng** (cơ chế mục 9.3 của community-design), liên kết sang quản lý tài khoản.

### 5.5 Trạng thái đặc biệt [CHỐT cho khóa Cộng đồng; ĐỀ XUẤT các dòng còn lại]

| Trường hợp | Hành vi |
| --- | --- |
| Mã không tồn tại | Trang "Không tìm thấy hồ sơ" (404). |
| Tài khoản `suspended` hoặc đã xóa | Giống không tồn tại với thành viên; admin vẫn xem được. |
| Bị khóa quyền Cộng đồng | Hồ sơ vẫn xem được bình thường, **không** hiện lý do khóa với người khác. Người bị khóa thấy lý do ở vùng thành viên của chính họ (đã có) và **không sửa được ảnh, ảnh bìa, giới thiệu, tên hiển thị**. |
| Chưa có tên hiển thị | Hiện "Thành viên". |
| Tài khoản bị xóa (anonymise) | Xóa ảnh, ảnh bìa, giới thiệu cùng lúc với `display_name`. |

## 6. Chỉnh sửa hồ sơ

Mở bằng nút **Chỉnh sửa hồ sơ** trên hồ sơ của mình (hộp thoại hoặc trang con) [ĐỀ XUẤT].

| Trường | Quy tắc |
| --- | --- |
| Ảnh đại diện [CHỐT] | Mọi vai trò tải được, **hiển thị ngay, không qua duyệt**. JPG/PNG/WebP, tối đa 5 MB, cắt vuông bằng `image-crop-dialog`, xử lý thành WebP 640×640, lưu chunk 100 KB. Có nút **Xóa ảnh**. Dòng lưu ý: dùng ảnh phù hợp, không chứa thông tin liên hệ, ảnh người khác, nội dung phản cảm. |
| Ảnh bìa [CHỐT có tính năng; ĐỀ XUẤT thông số] | Cùng quy tắc quyền với ảnh đại diện (mọi vai trò, hiện ngay, tách khỏi banner gia sư). Cắt tỉ lệ 4:1, xử lý thành WebP 1280×320, tối đa 5 MB. Có nút **Xóa ảnh bìa**. Chưa có thì dùng nền mặc định. |
| Tên hiển thị | Quy tắc **giữ nguyên** community-design 2.2 (2–30 ký tự, cấm "admin"/"quản trị", cấm liên hệ/link, không cần duy nhất). Đi qua endpoint riêng, **không** qua `PATCH /api/account` (để không đặt gia sư về `pending`). Đổi thì tên trên bài/bình luận cũ đổi theo (nhãn tính khi đọc) [CHỐT]. Tối đa **3 lần đổi/24 giờ** [CHỐT]. Gia sư đã duyệt và admin: hồ sơ hiển thị họ tên thật nên ô này hiện ghi chú "Bạn đang hiển thị bằng họ tên thật", vẫn lưu được cho trường hợp bị thu hồi [ĐỀ XUẤT]. |
| Giới thiệu ngắn [CHỐT] | Văn bản thuần, **tối đa 300 ký tự**, tối đa 5 dòng. Chạy `findContactInfo` (chặn số điện thoại, email, Zalo, link). Hiện ngay, không qua duyệt, có thể bị báo cáo/gỡ. |

Ràng buộc chung:

- **Tài khoản đang bị khóa Cộng đồng không đổi được ảnh/ảnh bìa/giới thiệu/tên hiển thị** [CHỐT].
- Hạn mức [ĐỀ XUẤT]: tải ảnh đại diện 5 lần/24 giờ, tải ảnh bìa 5 lần/24 giờ, sửa giới thiệu 10 lần/24 giờ; thêm vào hằng số `LIMITS`.
- Lưu ảnh mới thay ảnh cũ trong một giao dịch; dọn chunk mồ côi.

## 7. Ảnh đại diện và ảnh bìa: nơi hiển thị và quyền xem

- **Ảnh tài khoản riêng, tách khỏi ảnh/banner trong `/studio`** [CHỐT].
- **Nơi hiển thị** [CHỐT]: sidebar góc dưới trái, hồ sơ, thẻ bài, trang bài, bình luận, vùng thành viên của Cộng đồng/Bài của tôi, Cài đặt (tuỳ chọn). **Không** hiển thị ở Tin nhắn, đánh giá gia sư, bình luận ảnh gia sư, danh sách/trang gia sư.
- **Khách không thấy ảnh đại diện và ảnh bìa của thành viên** [CHỐT]: bài đã duyệt công khai trên Google nên ảnh khuôn mặt học sinh/phụ huynh không công khai ra ngoài. Khách thấy chữ cái đầu. Endpoint ảnh yêu cầu phiên đăng nhập hợp lệ, `Cache-Control: private`, không đưa ảnh vào `og:image`/JSON-LD/sitemap.
- Ảnh của tài khoản `suspended`/đã xóa không trả về (404). Admin xem được.

## 8. Hành vi của khách [CHỐT]

- Tên/ảnh tác giả trên bài và bình luận **bấm được**; bấm thì chuyển sang `/auth?next=<đường dẫn hồ sơ>` rồi quay lại đúng hồ sơ sau khi đăng nhập (cơ chế `Require`/`next` đã có). Không cần mã riêng cho khách: route hồ sơ được bọc `Require`.
- Riêng nút **Xem hồ sơ gia sư** (`/tutors/:id`) vẫn công khai vì đó là trang gia sư hiện có.
- API hồ sơ và ảnh trả 401 cho khách.
- Người đã đăng nhập nhưng chưa xác minh email/chưa xong onboarding: đi theo luồng `Require` hiện có.

## 9. Đăng ký và onboarding [CHỐT]

- Thêm ô **Tên hiển thị** (công khai) cạnh **Họ và tên** (riêng tư) trong bước onboarding hiện có (`Onboarding.tsx`, `PUT /api/account/onboarding`). Áp dụng cho học sinh, phụ huynh và gia sư (gia sư chờ duyệt dùng tên này). Admin không qua onboarding.
- Quy tắc kiểm tra giống mục 6; gợi ý sẵn từ tên cuối của họ tên [ĐỀ XUẤT].
- Ảnh, ảnh bìa, giới thiệu **không** hỏi lúc onboarding; chỉnh sau trong hồ sơ.
- Tài khoản đã onboarding xong từ trước **không bị ép** quay lại; họ tiếp tục dùng hộp thoại tên hiển thị khi đăng bài/bình luận (đã có) hoặc sửa trong hồ sơ.
- Form đăng ký (`Auth.tsx`) không đổi.

## 10. Báo cáo và kiểm duyệt

- Hồ sơ có nút **Báo cáo** (không hiện trên hồ sơ của chính mình) [ĐỀ XUẤT]. Người báo chọn phần bị báo cáo: **ảnh đại diện / ảnh bìa / giới thiệu**. Thêm `target_type = 'profile'` vào `community_reports`, cùng 5 lý do và ghi chú 300 ký tự, mỗi tài khoản báo cáo mỗi (hồ sơ, phần) một lần, tính vào hạn mức 10 báo cáo/giờ.
- Hàng đợi báo cáo của admin hiển thị loại "Hồ sơ" kèm ảnh/ảnh bìa/giới thiệu hiện tại và nút Gỡ ảnh / Gỡ ảnh bìa / Xóa giới thiệu / Khóa quyền.
- Mọi thao tác admin ghi audit log kèm lý do. Người bị gỡ nhận thông báo trong ứng dụng kèm lý do (như bài bị từ chối); không email.

## 11. Ma trận quyền

| Hành động | Khách | Học sinh / Phụ huynh | Gia sư (cả hai trạng thái) | Admin |
| --- | --- | --- | --- | --- |
| Bấm tên/ảnh tác giả | Có → mời đăng nhập | Có → mở hồ sơ | Có → mở hồ sơ | Có → mở hồ sơ |
| Xem hồ sơ người khác | Không | Có | Có | Có (kèm khung quản trị) |
| Xem ảnh đại diện/ảnh bìa thành viên | Không (chữ cái đầu) | Có | Có | Có |
| Sao chép liên kết hồ sơ | – | Có | Có | Có |
| Xem trang gia sư `/tutors/:id` | Có (đã công khai) | Có | Có | Có |
| Sửa ảnh, ảnh bìa, tên hiển thị, giới thiệu của mình | – | Có | Có | Có |
| Báo cáo hồ sơ người khác | Không | Có | Có | – (xử lý trực tiếp) |
| Gỡ ảnh/ảnh bìa/giới thiệu người khác, khóa quyền | Không | Không | Không | Có |
| Khi đang bị khóa Cộng đồng | – | Không sửa được hồ sơ | Không sửa được hồ sơ | – |

## 12. Mô hình dữ liệu [ĐỀ XUẤT]

Migration cộng thêm (mẫu `PRAGMA table_info` rồi `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`), trong `migrateDatabase` / `community-schema.js`, tương thích Node (`node:sqlite`) và Worker (Durable Object); chạy hai lần không lỗi.

- `users`: thêm `profile_code TEXT` (backfill rồi tạo unique index), `bio TEXT NOT NULL DEFAULT ''`.
- Bảng `user_images (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT CHECK(kind IN ('avatar','cover')), content_type TEXT, size INTEGER, created_at, UNIQUE(user_id, kind))` và `user_image_chunks (image_id, idx, data, PRIMARY KEY(image_id, idx))` theo mẫu `community_images`. Không thêm cột ảnh vào `users`: có ảnh hay không tra từ `user_images`.
- `community_reports`: mở rộng `target_type` thêm `'profile'` và thêm cột `part` (avatar|cover|bio). Kiểm tra xem `target_type` có CHECK cứng không; nếu có, dùng cách an toàn (không làm mất dữ liệu) để mở rộng.
- `community_notifications`: thêm loại `profile_removed`.
- Giữ nguyên `display_name`, `community_locked`, `community_lock_reason`.
- Xóa tài khoản (`account-deletion.js`): xóa `bio`, ảnh, ảnh bìa và chunk.

## 13. API [ĐỀ XUẤT]

Không endpoint nào trả `users.id`, `name`, `email` của học sinh/phụ huynh/gia sư chờ duyệt.

**Cần đăng nhập (mọi vai trò, tài khoản `active`)**

- `GET /api/community/members/:code` → `{ profile: { code, label, name_part, tier, tutor_id?, has_avatar, has_cover, image_version, bio, joined_at, stats: { posts, comments, helpful }, mine }, admin?: {...} }`. `tutor_id` chỉ khi `tier = tutor`. `admin` chỉ khi người xem là admin.
- `GET /api/community/members/:code/posts?page=&sort=new|helpful` → danh sách bài đã duyệt (cùng định dạng danh sách bài hiện có).
- `GET /api/community/members/:code/avatar` và `/cover` → ảnh (cần phiên; `private` cache; `?v=` là `image_version` để làm mới).
- `GET /api/community/me` bổ sung `profile_code`, `has_avatar`, `bio`.
- `POST /api/community/reports` nhận `target_type: 'profile'` + `part`.

**Chỉ chủ tài khoản và không bị khóa Cộng đồng**

- `PUT /api/community/me/profile` `{ display_name?, bio? }` (Zod; dùng chung `displayNameSchema`, `findContactInfo`; giới hạn 3 lần đổi tên/24 giờ). `PUT /api/community/me/display-name` hiện có giữ lại và gọi vào cùng hàm.
- `PUT /api/community/me/avatar`, `PUT /api/community/me/cover` (tải ảnh), `DELETE` tương ứng.
- Onboarding: `PUT /api/account/onboarding` nhận thêm `display_name`.

**Admin**: gỡ ảnh, gỡ ảnh bìa, xóa giới thiệu (lý do bắt buộc, audit, thông báo); phần `admin` trong hồ sơ; khóa Cộng đồng dùng cơ chế hiện có.

**Đối tượng tác giả** (`authorLabel`, kiểu `CommunityAuthor` ở `app/src/lib/types.ts`) thêm `profile_code` (luôn có) và `has_avatar` (chỉ `true` khi người xem đã đăng nhập). Mọi endpoint danh sách bài/bình luận dùng một hàm dựng tác giả duy nhất.

## 14. Giao diện [ĐỀ XUẤT]

- Trang `CommunityProfile.tsx`, route `/community/members/:code` bọc `Require`.
- Menu tài khoản ở sidebar (`main.tsx`, khối `account-link`) dùng thành phần popover/dropdown sẵn có trong `components/ui`.
- `AuthorLabel` (`components/community/shared.tsx`): thành `Link` tới hồ sơ cho **mọi** tier (hiện chỉ tutor), thêm ảnh qua prop `src` của `Person` (`common.tsx`), chỉ khi `has_avatar`.
- Hộp thoại chỉnh sửa hồ sơ: ảnh đại diện và ảnh bìa (có cắt), tên hiển thị, giới thiệu có đếm ký tự, lỗi tiếng Việt dễ hiểu.
- Onboarding: ô Tên hiển thị.
- Chung: giao diện tiếng Việt có dấu; không tràn ngang ở 320/360/390/768/1024/1440 px; ảnh bìa co theo màn hình, ảnh đại diện kích thước cố định để không nhảy bố cục; hỗ trợ bàn phím và `prefers-reduced-motion`; `alt` cho ảnh; trạng thái tải/lỗi/trống rõ ràng.

## 15. SEO

- Hồ sơ **`noindex`**, không có trong sitemap, không JSON-LD, không `og:image` [CHỐT: không đưa hồ sơ lên Google]. Node và Worker trả cùng meta `noindex` cho `/app/community/members/*`, theo cách `/app/community/write` đang làm.

## 16. Kiểm thử cần có

### 16.1 API (`test/*.test.js`)

- Mã hồ sơ: backfill duy nhất; tài khoản mới (email và Google) có mã; không đổi.
- Riêng tư: khách nhận 401 ở hồ sơ và ảnh; hồ sơ **không** chứa `id`, `name`, `email` của học sinh/phụ huynh/gia sư chờ duyệt; gia sư chờ duyệt không lộ tên thật, `tutor_id`, ảnh/banner `/studio`; gia sư đã duyệt có `tutor_id` và họ tên thật; đối tượng tác giả công khai có `profile_code` nhưng `has_avatar` luôn false với khách.
- Nhãn hồ sơ khớp nhãn bài trước và sau khi gia sư được duyệt/thu hồi.
- Thống kê chỉ tính nội dung công khai; bài ẩn/xóa/chờ duyệt/nháp không tính và không có trong danh sách. Sắp xếp Mới nhất/Hữu ích nhất đúng, hòa thì mới hơn trước.
- Admin: danh sách là Thông báo; khung `admin` chỉ có khi người xem là admin.
- Tài khoản `suspended`/đã xóa: 404 cho thành viên, admin vẫn xem; xóa tài khoản dọn ảnh/ảnh bìa/giới thiệu.
- Giới thiệu và tên hiển thị: chặn liên hệ/link, độ dài, "admin"/"quản trị" (có/không dấu, hoa/thường); đổi tên **không** đặt gia sư về `pending`; quá 3 lần/24 giờ → 429; bài/bình luận cũ đổi tên theo.
- Ảnh và ảnh bìa: sai định dạng, quá 5 MB, quá số pixel, hạn mức, thay ảnh trong giao dịch, khách không lấy được ảnh, ảnh tài khoản `suspended` không trả về, tài khoản bị khóa Cộng đồng không đổi được ảnh/bìa/giới thiệu/tên, chunk mồ côi được dọn; ảnh tài khoản không ảnh hưởng ảnh/banner `/studio` và không đặt gia sư về `pending`.
- Onboarding: `display_name` bắt buộc và hợp lệ cho học sinh/phụ huynh/gia sư; tài khoản đã onboarding xong không bị ép.
- Báo cáo `profile`: một lần/(hồ sơ, phần)/tài khoản; không báo cáo hồ sơ của mình; admin gỡ ghi audit và gửi thông báo `profile_removed`.
- Hồ sơ không có trong sitemap/JSON-LD và có `noindex` (Node và Worker).
- **Migration:** chạy hai lần không lỗi; dữ liệu cũ nguyên vẹn.

### 16.2 End-to-end (Playwright, theo `test/e2e/community.spec.ts`)

1. Bấm khối tên sidebar → menu → "Xem hồ sơ của tôi" và "Cài đặt tài khoản" đều chạy; Esc/bàn phím.
2. Bấm tác giả trên bài/bình luận → hồ sơ đúng người, cho từng vai trò (học sinh, phụ huynh, gia sư đã duyệt, gia sư chờ duyệt, admin).
3. Khách bấm tên → đăng nhập → quay lại đúng hồ sơ; khách không thấy ảnh thành viên.
4. Tải ảnh đại diện/ảnh bìa, sửa giới thiệu, đổi tên → hiện ngay, kể cả trên bài cũ; nhấp đúp lưu không lỗi.
5. Sao chép liên kết; đổi sắp xếp bài và giữ qua tải lại.
6. Gia sư đã duyệt: nút "Xem hồ sơ gia sư" sang `/tutors/:id`.
7. Báo cáo hồ sơ → admin gỡ ảnh/giới thiệu → chủ hồ sơ nhận thông báo kèm lý do.
8. Onboarding mới có ô Tên hiển thị.
9. 320/390/768/1440 px không tràn ngang; reduced motion; không lỗi console.

### 16.3 Lệnh phải chạy trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra.

## 17. Phụ thuộc, việc để sau và điểm cần lưu ý

| Mục | Trạng thái |
| --- | --- |
| Thông tin về con trên hồ sơ phụ huynh | Để sau, cùng đợt thiết kế tài khoản và dashboard phụ huynh (người dùng muốn tra cứu mô hình nước ngoài rồi đề xuất cho Việt Nam). Thiết kế này không chặn việc mở rộng đó. |
| Họ tên thật của học sinh trong đánh giá gia sư và bình luận ảnh gia sư | **Chưa nhất quán** với quy tắc "học sinh chỉ hiện tên hiển thị" của Cộng đồng (khảo sát code: hai nơi đó đang hiện `users.name`). Người dùng quyết định **giữ nguyên** ở đợt này; nên xem lại sau. |
| Hiển thị ảnh/hồ sơ ở Tin nhắn, đánh giá, gallery gia sư | Không làm ở đợt này. |
| Email thông báo, realtime | Cần hạ tầng trả phí; để sau. |
| Con số giới hạn (hạn mức, độ dài, 10 bài/trang) | Đề xuất ở mục 5, 6, 10; người dùng có thể đổi. |

---

# PHẦN 2 — PROMPT CHO AGENT XÂY DỰNG

> Sao chép nguyên khối bên dưới gửi cho Agent. Prompt giả định Agent được mở trong thư mục dự án và có tài liệu này ở `docs/community-profile.md`.

````text
Bạn là kỹ sư phần mềm cấp cao, làm việc trong repo "Gia Sư 10 Điểm" (nền tảng tìm gia sư của Việt Nam). Nhiệm vụ: xây dựng chức năng "Hồ sơ thành viên" trong mục Cộng đồng, theo đúng bản thiết kế đã được người dùng chốt.

# 0. Nguồn sự thật

- Thiết kế đầy đủ: `docs/community-profile.md` (Phần 1). Đọc toàn bộ trước khi viết bất kỳ dòng code nào.
- Chức năng này MỞ RỘNG Cộng đồng đã có. Đọc thêm `docs/community-design.md` (đặc biệt mục 2 danh tính/riêng tư, 3 ma trận quyền, 8 bộ lọc liên hệ, 9 kiểm duyệt, 11 giới hạn) và `docs/community-implementation.md`. Cộng đồng ĐÃ được xây xong: dùng lại và mở rộng, không viết lại.
- Nhãn trong tài liệu:
  - [CHỐT]: người dùng đã đồng ý, KHÔNG được tự ý đổi.
  - [ĐỀ XUẤT]: làm theo, nhưng ghi lại trong báo cáo cuối để người dùng xác nhận.
  - [KHÔNG LÀM]: tuyệt đối không thêm (mục 1.3).
- Nếu tài liệu mâu thuẫn với mã nguồn thực tế, hoặc gặp điểm chưa rõ mà không có nhãn [ĐỀ XUẤT] để dựa vào, HÃY DỪNG LẠI VÀ HỎI người dùng thay vì đoán. Người dùng nhiều lần nhấn mạnh: không tự thêm tính năng họ chưa yêu cầu.

# 1. Bối cảnh dự án (đã xác minh trong repo)

- Backend: Express 5 + SQLite. Local dùng `node:sqlite` (`server/local-db.js`); production dùng Cloudflare Worker + Durable Object SQLite (`worker/index.js` bọc cùng `createApi`). Mọi thay đổi CSDL phải chạy được ở CẢ HAI.
- Migration nằm trong `migrateDatabase(db)` ở `server/db.js` và `server/community-schema.js`; phải CỘNG THÊM và idempotent (kiểm tra `PRAGMA table_info` trước `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`). Không xóa/đổi tên bảng cũ, không xóa file CSDL để sửa schema.
- API: `server/api.js` (`createApi`); Cộng đồng ở `server/community.js`, `community-admin.js`, `community-drafts.js`, `community-images.js`, `community-policy.js` (có `authorLabel`, `findContactInfo`, `displayNameSchema`, `LIMITS`). Dùng `auth(...)`, `audit(...)`, `transaction(db, fn)`, `all/one/run`, `z/text` (`server/validation.js`). Lỗi trả `{ error }` tiếng Việt.
- Ảnh: `server/uploads.js` và `server/community-images.js` đã có pipeline xử lý WebP, lưu chunk 100 KB, kiểm tra kích thước/pixel (Node: sharp; Worker: Cloudflare Images). Dùng lại, không viết pipeline mới.
- Vai trò: `users.role` ∈ student|tutor|admin; `users.learner_type` ∈ student|parent; `tutors.status = 'approved'` mới là gia sư công khai; `users.status` ∈ active|suspended|deleted. Quyền do ứng dụng kiểm tra (không có RLS).
- Frontend: React 19 + Vite + react-router-dom 7 (basename `/app`), shadcn + Animate UI, tiptap. `app/src/main.tsx` (nav, Routes, `Require`, khối `account-link` ở sidebar), `app/src/pages/Community*.tsx`, `AdminCommunity.tsx`, `Settings.tsx`, `Onboarding.tsx`, `components/community/shared.tsx` (`AuthorLabel`, `PostCard`, `useCommunityGate`), `components/common.tsx` (`Person` đã có prop `src`), `components/image-crop-dialog.tsx`, `components/tutor-uploads.tsx` (mẫu tải ảnh), `app/src/lib/types.ts` (`CommunityAuthor`).
- `index.html` ở thư mục gốc là FILE SINH RA; không sửa tay.
- Phạm vi dự án: chỉ tìm gia sư. Không quiz/đáp án, không thanh toán, không video.
- Quy ước repo: đọc `docs/development-handoff.md` và `docs/architecture.md`. Giao diện tiếng Việt có dấu.

# 2. Cách làm việc

1. Làm trên nhánh hiện tại `hung-new` (hoặc nhánh con của nó nếu bạn thấy cần). Không đẩy lên remote và không mở PR trừ khi người dùng yêu cầu. Commit nhỏ, rõ ràng, theo quy ước repo.
2. Làm theo các giai đoạn ở mục 3, mỗi giai đoạn một commit. Sau mỗi giai đoạn chạy kiểm tra liên quan và sửa đến khi sạch trước khi sang giai đoạn sau.
3. Trước giai đoạn 1, viết ngắn gọn kế hoạch (file sẽ tạo/sửa, rủi ro). Chỉ dừng hỏi khi gặp mâu thuẫn hoặc điểm mơ hồ nêu ở mục 0.
4. Chạy thử thật: khởi động server, thao tác trên trình duyệt cho các luồng chính, kiểm tra console/network, chụp bằng chứng ở nhiều kích thước. Không báo "xong" khi chưa chạy.
5. Viết code đọc như phần mã xung quanh: cùng cách đặt tên, cùng mật độ chú thích, dùng lại tiện ích có sẵn. Không thêm thư viện mới nếu không thật sự cần; nếu cần thì nêu lý do.

# 3. Các giai đoạn

## Giai đoạn 1 — Danh tính và mã hồ sơ
- Migration: `users.profile_code` (backfill duy nhất cho tài khoản cũ, unique index, cấp mã khi tạo tài khoản mới cả đăng ký email lẫn Google), `users.bio`.
- Mở rộng `authorLabel` và kiểu `CommunityAuthor`: thêm `profile_code`; `has_avatar` chỉ true khi người xem đã đăng nhập. Mọi endpoint danh sách bài/bình luận dùng MỘT hàm dựng tác giả.
- Test: mã duy nhất/không đổi, rò rỉ riêng tư, migration chạy hai lần.

## Giai đoạn 2 — Ảnh đại diện và ảnh bìa
- Bảng `user_images`, `user_image_chunks`; tải/thay/xóa/phục vụ ảnh theo mục 6 và 7: xử lý WebP (640×640 và 1280×320), hiện ngay không qua duyệt, cần phiên để xem, `private` cache, `image_version`, hạn mức, dọn chunk mồ côi, tài khoản bị khóa Cộng đồng không tải được.
- Ảnh tài khoản KHÔNG đụng ảnh/banner `/studio` và không đặt gia sư về `pending`.
- Test theo mục 16.1 (phần ảnh).

## Giai đoạn 3 — API hồ sơ
- `server/community-profile.js`: `GET members/:code`, `GET members/:code/posts` (sort `new|helpful`, 10 bài/trang), thống kê chỉ tính nội dung công khai, khung `admin`, trạng thái đặc biệt (404 cho suspended/đã xóa với thành viên).
- `PUT me/profile` (tên hiển thị tối đa 3 lần/24 giờ, giới thiệu 300 ký tự có `findContactInfo`), cập nhật `GET me`. KHÔNG cho tên hiển thị đi qua `PATCH /api/account`.
- Onboarding nhận `display_name` (bắt buộc cho học sinh/phụ huynh/gia sư; tài khoản đã xong onboarding không bị ép).
- Test theo mục 16.1.

## Giai đoạn 4 — Giao diện
- `CommunityProfile.tsx` đúng bố cục mục 5.1 (ảnh bìa, ảnh đại diện, tên + nhãn, ngày tham gia, Sao chép liên kết, Chỉnh sửa/Báo cáo/Xem hồ sơ gia sư, giới thiệu, thống kê, bài viết có sắp xếp); route trước `/community/:id`, bọc `Require`.
- Menu nhỏ ở sidebar (hai mục), ảnh đại diện ở khối tên; dòng liên kết ở Cài đặt; `AuthorLabel` bấm được với mọi tier và hiện ảnh (chỉ khi `has_avatar`); hộp thoại chỉnh sửa hồ sơ (cắt ảnh, tên hiển thị, giới thiệu); ô Tên hiển thị trong Onboarding.
- Responsive, bàn phím, reduced motion, trạng thái tải/lỗi/trống.

## Giai đoạn 5 — Báo cáo và công cụ admin
- Báo cáo `profile` theo (hồ sơ, phần); hàng đợi báo cáo admin hiển thị loại Hồ sơ; Gỡ ảnh/Gỡ ảnh bìa/Xóa giới thiệu kèm lý do, audit log, thông báo `profile_removed`; khung quản trị trên hồ sơ; dọn ảnh/giới thiệu khi xóa tài khoản.

## Giai đoạn 6 — SEO, kiểm thử toàn bộ, tài liệu
- `noindex` cho `/app/community/members/*` ở Node và Worker; không sitemap/JSON-LD/og:image.
- Viết đủ test theo mục 16; chạy lại toàn bộ.
- Cập nhật `docs/community-implementation.md` (phần đã làm, [ĐỀ XUẤT] đã áp dụng, kết quả kiểm chứng) và liên kết tài liệu này trong `README.md` nếu bảng tài liệu có liệt kê tài liệu Cộng đồng.

# 4. Ràng buộc bắt buộc

- Không làm bất cứ thứ gì trong mục 1.3 [KHÔNG LÀM]: không theo dõi/kết bạn/chặn, không danh sách/tìm kiếm thành viên, không nhắn tin từ hồ sơ, không công tắc riêng tư từng phần, không thông tin về con, không danh sách bình luận trên hồ sơ, không đưa ảnh/hồ sơ vào Tin nhắn/đánh giá/gallery gia sư.
- Không bao giờ để lọt `users.id`, `users.name`, `email` của học sinh/phụ huynh/gia sư chờ duyệt vào phản hồi công khai hay hồ sơ.
- Khách: 401 ở hồ sơ và ảnh; không thấy ảnh thành viên; bấm tên → đăng nhập → quay lại đúng hồ sơ.
- Không đổi hành vi hiện có của `PATCH /api/account`, Cài đặt, `/studio`, Tin nhắn, đánh giá, gallery.
- Không sửa tay `index.html`. Không thêm giao diện tiếng Anh. Không bỏ qua hook/kiểm tra để "cho qua".

# 5. Kiểm chứng trước khi báo xong

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Thêm: chạy local và duyệt tay các luồng ở mục 16.2 trên trình duyệt (desktop, 360 px, reduced motion), kiểm tra console/network không lỗi; nếu có thể, chạy smoke Cloudflare local để xác nhận migration và ảnh hoạt động trên Worker. Báo kết quả thật, kể cả lỗi hoặc phần chưa kiểm tra.

# 6. Báo cáo cuối (bằng tiếng Việt, ngắn gọn)

1. Đã làm gì theo từng giai đoạn; các file chính.
2. Danh sách mọi chi tiết [ĐỀ XUẤT] đã áp dụng, để người dùng xác nhận.
3. Điểm nào lệch với tài liệu và vì sao.
4. Kết quả kiểm tra (lệnh nào đạt, lệnh nào không, cái gì chưa kiểm tra).
5. Những rủi ro/việc để sau (đặc biệt: họ tên thật trong đánh giá gia sư/bình luận ảnh gia sư vẫn chưa nhất quán — đã ghi ở mục 17, KHÔNG tự sửa).
````
