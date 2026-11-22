# Dải "Đang tìm gia sư" trên dashboard gia sư

Bản thảo ngày 21/11/2026. Gồm hai phần: **Phần 1** mô tả logic và thiết kế, **Phần 2** là prompt giao cho người (hoặc agent) triển khai.

Nhãn dùng trong tài liệu:

- **[CHỐT]**: chủ dự án đã đồng ý trong buổi bàn.
- **[ĐỀ XUẤT]**: chi tiết người viết tự quyết để không phải hỏi lại; chủ dự án có thể sửa khi duyệt.
- **[KHÔNG LÀM]**: cố ý để ngoài phạm vi.

---

# PHẦN 1 — LOGIC VÀ THIẾT KẾ

## 1. Mục tiêu

Trong Cộng đồng, học sinh và phụ huynh đã đăng được bài tìm gia sư, nhưng những bài này nằm lẫn trong danh sách chung. Gia sư phải tự vào Cộng đồng và lướt mới thấy.

Chức năng này đưa các bài tìm gia sư **mới và còn hiệu lực** ra ngay dashboard của gia sư, dưới dạng một **dải thẻ nhỏ chạy ngang**. Mỗi thẻ có avatar người đăng và một dòng ngắn về bài. Bấm vào thẻ thì mở bài trong Cộng đồng. [CHỐT]

Làm theo hai bước:

| Bước | Nội dung | Trạng thái |
| --- | --- | --- |
| **1** | Dải "Đang tìm gia sư" hiện trên **tài khoản gia sư**, lấy bài của học sinh và phụ huynh | **Làm bây giờ** [CHỐT] |
| 2 | Dải ngược lại hiện trên **tài khoản học sinh và phụ huynh**, lấy bài "tìm học sinh" của gia sư | Chỉ làm khi bước 1 chạy ổn [CHỐT] |

Tài liệu này chỉ đặc tả **bước 1**. Riêng bộ nhận diện bài thì viết theo hai chiều ngay từ đầu (mục 3.4), để bước 2 chỉ cần thêm dải hiển thị.

### Không làm ở bước 1 [KHÔNG LÀM]

- Bắt người đăng chọn loại bài ("Tìm gia sư" hay "Thảo luận"). Chủ dự án muốn hệ thống tự biết.
- Bước admin xác nhận hoặc sửa nhãn lúc duyệt bài.
- Phân loại bằng AI hoặc dịch vụ bên ngoài.
- Lọc hoặc xếp theo môn của gia sư, hay chấm "độ khớp" (ý này đã bị bỏ).
- Nút tắt hoặc ẩn dải.
- Tự tải lại liên tục, thông báo đẩy, email.
- Hiện dải cho học sinh, phụ huynh hay admin (đó là bước 2, và admin không có dashboard này).
- Thêm cột, bảng hay sửa dữ liệu hiện có. Chức năng chỉ đọc.

## 2. Hiện trạng liên quan (đã kiểm tra trong code)

- **Bài cộng đồng** nằm trong bảng `community_posts`. Các trường liên quan:
  - `kind`: `user`, `announcement` hoặc `rules`.
  - `status`: bài công khai là `approved`.
  - `title`, `body`.
  - `solved`: người đăng tự bấm "đã giải quyết".
  - `published_at`: thời điểm bài được duyệt và hiện ra.
  - `revision_*`: bản sửa đang chờ duyệt. Bản công khai vẫn là `title`/`body`.
- **Bài công khai** được định nghĩa bằng `publicPosts = "p.status='approved' AND u.status='active'"` trong `server/community.js`.
- **Không có trường loại bài.** Tiêu đề và nội dung là chữ tự do.
- **Thông tin người đăng** lấy qua `authorLabel(u, viewer)` (`server/community-policy.js`). Hàm này trả `name_part`, `tier` (`student`, `parent`, `tutor`, `admin`), `profile_code`, `has_avatar`, `image_version`.
  - Học sinh và phụ huynh hiện bằng **tên hiển thị công khai**. Đăng bài bắt buộc phải có tên hiển thị.
  - Avatar chỉ được trả khi người xem đã đăng nhập.
- **Ảnh avatar** có URL do `memberImageUrl(author, "avatar")` trong `app/src/components/community/shared.tsx` tạo. Thành phần `Person` trong `app/src/components/common.tsx` vẽ avatar, và tự hiện chữ cái đầu khi không có ảnh.
- **Hàm bỏ dấu** `fold()` có trong `server/community-policy.js`. Bộ tên môn nằm ở `server/catalog.js` (bảng `subjects`). Bộ cụm đồng nghĩa nằm trong `subjectAliases` và `levelAliases` (Tiểu học, THCS, THPT, Người đi làm). Bộ lọc của Cộng đồng đang dùng các bộ này.
- **Trang Cộng đồng** đọc tham số `?q=` để tìm sẵn (`app/src/pages/Community.tsx`).
- **Quyền khóa Cộng đồng** (`community_locked`) chỉ chặn đăng bài và bình luận, không chặn xem.
- **Dashboard** (`app/src/pages/Dashboard.tsx`) đặt `<TodayLessons …/>` khoảng dòng 122, ngay sau là khối `workspace-overview` có ô "Buổi tiếp theo" (`next-lesson-panel`). Dashboard viết chữ tiếng Việt trực tiếp, không qua `useI18n`.

## 3. Bài nào vào dải

### 3.1 Điều kiện bắt buộc (tất cả phải đúng) [CHỐT]

1. Bài thường: `kind = 'user'`. Thông báo và quy tắc của admin không vào dải.
2. Đang công khai: `status = 'approved'` và tài khoản người đăng `status = 'active'`.
3. Người đăng là **học sinh hoặc phụ huynh** (`users.role = 'student'`). Bài của gia sư và admin không vào dải 1.
4. Chưa bấm "đã giải quyết": `solved = 0`.
5. Đăng trong **14 ngày gần nhất**, tính theo `published_at`.
6. Bộ nhận diện (mục 3.2) kết luận đây là bài **tìm gia sư**.

Bài thỏa cả 6 điều kiện được xếp **mới nhất trước** (`published_at` giảm dần, cùng thời điểm thì `id` lớn hơn trước). Dải lấy **tối đa 10 bài**. [CHỐT]

Lý do lọc theo vai trò người đăng [ĐỀ XUẤT, đã trình bày và được đồng ý]: bài quảng cáo của gia sư ("tôi nhận dạy kèm, tìm học sinh") không thể lọt vào dải 1, dù có chữ "tìm". Cách này chắc hơn nhiều so với một danh sách cụm loại trừ.

### 3.2 Bộ nhận diện "tìm gia sư"

**Văn bản được xét:** tiêu đề + xuống dòng + nội dung, đúng bản công khai (`title`, `body`). Bản sửa đang chờ duyệt không được xét.

**Chuẩn hóa** [ĐỀ XUẤT]:

1. Chữ thường, chuẩn Unicode NFC.
2. Bản **bỏ dấu** bằng `fold()`.
3. Thay mọi ký tự không phải chữ hoặc số bằng khoảng trắng, gộp khoảng trắng liên tiếp, thêm một khoảng trắng ở đầu và cuối. Nhờ vậy mỗi cụm được khớp **trọn từ**, ví dụ "lop 1" không khớp vào "lop 10".

**Các cụm nhận diện** (khớp trên bản bỏ dấu, trọn từ, nên gõ có dấu hay không dấu đều nhận) [CHỐT danh sách, ĐỀ XUẤT cách viết]:

| Cụm chủ dự án duyệt | Cụm khớp (bản bỏ dấu) |
| --- | --- |
| tìm gia sư | `tim gia su` |
| cần gia sư | `can gia su` |
| kiếm gia sư | `kiem gia su` |
| cần tìm thầy/cô | `can tim thay`, và xem quy tắc riêng cho "cô" bên dưới |
| tìm giáo viên | `tim giao vien` |
| tìm người dạy kèm | `tim nguoi day kem` |
| cần người dạy | `can nguoi day` |

**Quy tắc riêng cho "cô"** [ĐỀ XUẤT]: khi bỏ dấu, "cô", "cơ", "có" đều thành `co`. Vì vậy `can tim co` sẽ khớp nhầm câu như "cần tìm cơ hội". Cách xử lý:

- Khớp **`cần tìm cô`** trên bản **còn dấu** (chữ thường, trọn từ).
- Hoặc khớp trên bản bỏ dấu các cụm dài hơn và không nhầm được: `can tim co giao`, `can tim co day`.

Chỉ cần **một** cụm khớp là bài được coi là tìm gia sư. Không có cụm loại trừ, vì việc lọc theo vai trò ở mục 3.1 đã thay thế.

**Quy tắc mở rộng (22/11/2026)** [CHỐT]: bảng trên chỉ bắt các cụm dính liền, nên đo thực tế bỏ sót 8/12 câu đăng bài bình thường ("Mình cần tìm **một** gia sư Toán", "Tìm **giúp mình** gia sư", "Nhờ mọi người giới thiệu gia sư"...). Vì vậy bài còn được nhận khi **trong cùng một câu** có:

1. một **từ nhu cầu** đứng **trước**: `tìm`, `cần`, `kiếm`, `xin`, `muốn`, `giới thiệu`, `gợi ý`, `ai biết`, `ai dạy`, và (chỉ khi có dấu) `nhờ`, `thuê`;
2. rồi một **từ chỉ gia sư**: `gia sư`, `giáo viên`, `người dạy kèm`, `người dạy`, `cô giáo`, và (chỉ khi có dấu) `thầy`;
3. hai từ cách nhau **không quá 6 từ**.

Câu được tách ở `. ! ? ; :` và dòng trống (xuống dòng đơn không tách). Tiêu đề và nội dung là các câu riêng.

Không nhận khi từ nhu cầu đứng **ngay sau** `không`, `khỏi`, `hết` hoặc `đã` ("không cần gia sư nữa", "đã tìm gia sư rồi"). Quy tắc phủ định này áp dụng cho cả các cụm dính liền ở bảng trên. Từ nhu cầu đứng **sau** từ chỉ gia sư không tính ("gia sư của em dạy tốt, em cần cố gắng").

**Đã biết và chấp nhận** [CHỐT]: nhận bằng từ khóa sẽ có lúc nhầm hoặc sót, và chỉ người đăng sửa bài mới thay đổi được kết quả. Ví dụ "không tìm được gia sư" (đang tìm mà chưa được) bị bỏ sót vì có `không` đứng trước. Nếu sau này nhầm nhiều thì mới thêm bước admin sửa.

### 3.3 Môn và cấp học hiển thị trên thẻ

Thẻ hiện thêm một dòng "môn · cấp" khi nhận ra được. Nhận không ra thì bỏ dòng đó, chỉ hiện tiêu đề. [CHỐT]

**Môn** [ĐỀ XUẤT]:

- Dò trên bản bỏ dấu, trọn từ, với tên mọi môn trong bảng `subjects` (qua `fold`) cộng các cụm trong `subjectAliases`.
- **Bỏ qua cụm ngắn dưới 4 ký tự** (ví dụ `van`), vì `van` cũng là "vẫn" và sẽ gắn nhầm "Ngữ văn". Các cụm dài như `ngu van`, `anh van` vẫn dùng.
- Nhiều môn khớp thì lấy môn **xuất hiện sớm nhất** trong văn bản.
- Hiện **tên chuẩn** của môn trong bảng `subjects`, ví dụ "Toán", "Tiếng Anh".

**Cấp** [ĐỀ XUẤT]:

- Dò trên bản bỏ dấu, trọn từ, với `levelAliases`.
- Hiện **nhãn của nhóm**: "Tiểu học", "THCS", "THPT" hoặc "Người đi làm". Ví dụ "lớp 9" hiện thành "THCS".
- Nhiều nhóm khớp thì lấy nhóm xuất hiện sớm nhất.

Ví dụ: "Cần tìm gia sư Toán lớp 9 ở Quận 7" cho ra "Toán · THCS".

### 3.4 Bộ nhận diện hai chiều (chuẩn bị cho bước 2)

Viết **một** hàm thuần dùng chung, đặt cạnh `community-policy.js`:

```
classifyRequest({ title, body, authorRole }) → "seeking_tutor" | "seeking_student" | null
```

- `seeking_tutor`: `authorRole === "student"` và khớp cụm ở mục 3.2. Bước 1 dùng kết quả này.
- `seeking_student`: `authorRole === "tutor"` và khớp một trong các cụm `tim hoc sinh`, `tim hoc vien`, `nhan day`, `nhan kem`, `nhan hoc sinh` [ĐỀ XUẤT]. **Bước 1 không dùng kết quả này và không có giao diện cho nó.** Chỉ viết hàm và test để bước 2 dùng lại.
- Mọi trường hợp khác trả `null`, gồm cả bài của admin.

Hàm trích môn và cấp cũng là hàm thuần riêng, ví dụ `requestTopic(text) → { subject, level }`.

## 4. Ai thấy dải [CHỐT]

- **Chỉ tài khoản gia sư** (`role = 'tutor'`), ở dashboard `/app/workspace`.
- Mọi gia sư đều thấy, kể cả hồ sơ chưa được duyệt, vì họ vốn đã đọc và bình luận được trong Cộng đồng.
- Gia sư bị khóa quyền Cộng đồng vẫn thấy, vì khóa chỉ chặn đăng bài.
- Học sinh, phụ huynh và admin không thấy, và API trả lỗi 403 nếu họ gọi.

## 5. Giao diện

### 5.1 Vị trí [CHỐT]

Dải nằm **ngay dưới khối "Buổi học hôm nay"** (`TodayLessons`) và **trên khối "Buổi tiếp theo"**. Việc gấp trong ngày vẫn ở trên cùng.

### 5.2 Bố cục

```
┌ Đang tìm gia sư ─────────────────────────────────────── Xem tất cả → ┐
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────── │ →→
│ │ (●) Mẹ Bin · Phụ huynh│ │ (H) Hà My · Học sinh │ │ (●) Thành viên …  │
│ │ Toán · THCS           │ │ Tiếng Anh            │ │ Hóa học · THPT    │
│ │ Cần gia sư Toán lớp 9…│ │ Tìm gia sư IELTS 6.5…│ │ Cần tìm thầy dạy… │
│ └──────────────────────┘ └──────────────────────┘ └────────────────── │
└──────────────────────────────────────────────────────────────────────┘
```

**Tiêu đề khối:** "Đang tìm gia sư". Bên phải là liên kết **"Xem tất cả"** dẫn tới `/community?q=tìm gia sư`. [CHỐT]

**Mỗi thẻ là một liên kết** tới `/community/:id` (mở cùng tab). Thẻ gồm [CHỐT]:

1. **Avatar** qua `Person`. Không có ảnh thì hiện chữ cái đầu.
2. **Tên hiển thị · vai trò**, ví dụ "Hà My · Học sinh" hoặc "Mẹ Bin · Phụ huynh". Dùng `name_part` và nhãn theo `tier`.
3. **Môn · cấp** nếu nhận ra (mục 3.3).
4. **Tiêu đề** một dòng, cắt bằng dấu "…".

Thẻ có chiều rộng cố định, khoảng 240 px trên máy tính và 220 px trên điện thoại [ĐỀ XUẤT]. Kiểu dáng (viền, bo góc, màu) theo các thẻ đang có trên dashboard, có cả chế độ tối nếu dashboard đang hỗ trợ.

Cho trình đọc màn hình [ĐỀ XUẤT]:

- Khối là `<section aria-labelledby>` với tiêu đề trên, và danh sách thẻ là `<ul>`.
- Tên liên kết của mỗi thẻ đọc đủ: tên người đăng, môn, tiêu đề.

### 5.3 Khi nào chạy, khi nào đứng yên

| Tình huống | Hành vi |
| --- | --- |
| 0 bài | **Ẩn toàn bộ khối**, kể cả tiêu đề. Không hiện khung trống. [CHỐT] |
| 1–3 bài | Xếp **tĩnh** thành một hàng, không chạy. [CHỐT] |
| Từ 4 bài, và tổng chiều rộng các thẻ **lớn hơn** chiều rộng khung | **Chạy** ngang liên tục. [CHỐT ngưỡng 4, ĐỀ XUẤT điều kiện tràn khung] |
| Từ 4 bài nhưng các thẻ **vừa** trong khung (màn hình rất rộng) | Đứng yên. Tránh vòng lặp trông lạ khi không có gì bị che. [ĐỀ XUẤT] |
| Đang tải | Không hiện gì. Dải chỉ là phần phụ, không chen khung chờ vào dashboard. [ĐỀ XUẤT] |
| API lỗi | Ẩn khối, không hiện thông báo lỗi. Dashboard không bị ảnh hưởng. [ĐỀ XUẤT] |

### 5.4 Chuyển động [ĐỀ XUẤT]

- **Cách chạy:** danh sách thẻ được nhân đôi nối tiếp nhau. Bản thứ hai có `aria-hidden="true"` và các liên kết trong đó `tabIndex={-1}`. Dùng CSS `@keyframes` dịch `translateX` từ `0` đến `-50%`, lặp vô hạn, tốc độ đều `linear`.
- **Tốc độ** khoảng **30 px/giây**. Thời lượng một vòng = chiều rộng một bản danh sách ÷ 30, tính lại khi khung đổi kích thước (`ResizeObserver`).
- **Dừng** (`animation-play-state: paused`) khi:
  - chuột đang ở trên dải (`:hover`);
  - có thẻ đang được focus bằng bàn phím (`:focus-within`).
- **Chế độ giảm chuyển động** (`prefers-reduced-motion: reduce`): không chạy. Hiện một hàng tĩnh **cuộn ngang được** (`overflow-x: auto`), chỉ một bản danh sách.
- **Thiết bị cảm ứng** (`(hover: none)`): không chạy, hiện hàng tĩnh vuốt ngang được như trên, vì không có "đưa chuột vào" để dừng lại đọc.
- Hai mép trái và phải có lớp mờ dần (mask hoặc gradient) để thẻ trượt vào và ra mềm mại.
- Theo quy ước ở `docs/ui-motion.md`: chỉ animate `transform`, không làm mờ (blur) hay nghiêng chữ, không làm đổi kích thước khung.

### 5.5 Làm mới dữ liệu [CHỐT]

Tải **một lần** khi dashboard mở. Không tự tải lại theo chu kỳ. Gia sư thấy bài mới ở lần mở dashboard sau.

## 6. API

### `GET /api/community/requests`

- **Quyền:** `auth("tutor")`. Người không đăng nhập nhận 401, vai trò khác nhận 403. Không áp dụng `participant`, vì khóa Cộng đồng không chặn xem.
- **Tham số:** không có.
- **Trả về:**

```json
{
  "items": [
    {
      "id": 42,
      "title": "Cần gia sư Toán lớp 9 ở Quận 7",
      "subject": "Toán",
      "level": "THCS",
      "published_at": "2026-11-20 08:15:00",
      "author": { "profile_code": "…", "has_avatar": true, "image_version": "…", "name_part": "Mẹ Bin", "tier": "parent", "label": "Mẹ Bin - Phụ huynh" }
    }
  ]
}
```

- `subject` và `level` là `null` khi không nhận ra.
- `author` là đúng đối tượng `authorLabel(u, req.user)`, cùng hình dạng `CommunityAuthor` mà giao diện đang dùng.
- **Không trả** `body`, số bình luận, hay bất kỳ dữ liệu riêng nào của người đăng (tên thật, email, `id` tài khoản).

**Cách lấy dữ liệu** [ĐỀ XUẤT]:

1. Một truy vấn SQL lấy các bài thỏa điều kiện 1–5 ở mục 3.1. Ví dụ `published_at >= datetime('now','-14 days')`, `u.role='student'`, cùng `publicPosts`, sắp `published_at DESC, id DESC`.
2. Chạy `classifyRequest` trong JavaScript trên từng dòng. Giữ dòng `seeking_tutor`, dừng khi đủ 10.
3. Không cache, không lưu kết quả.

Số bài trong 14 ngày bị giới hạn bởi quota 3 bài mỗi người mỗi ngày, nên quét toàn bộ là đủ nhẹ ở quy mô hiện tại.

Đặt route trong `registerCommunity` (`server/community.js`), để bản Cloudflare Worker nhận luôn như các route cộng đồng khác.

## 7. Riêng tư và an toàn

- Dải chỉ dùng thông tin mà Cộng đồng đã công khai cho người đăng nhập: tên hiển thị, vai trò, avatar, tiêu đề.
- Bài đang chờ duyệt, bị từ chối, bị ẩn hoặc đã xóa không bao giờ lên dải (`status='approved'`). Tài khoản bị khóa hay đã xóa cũng vậy (`u.status='active'`).
- Bản sửa đang chờ duyệt không được hiện. Dải chỉ dùng `title` công khai.
- Tiêu đề hiện dưới dạng chữ thường (React tự thoát ký tự), không chèn HTML.

## 8. Kiểm thử

### 8.1 Hàm thuần (`test/community-requests.test.js`, thêm vào script `npm test`)

- Mỗi cụm ở mục 3.2 đều nhận, cả có dấu lẫn không dấu.
- Trọn từ: "tìm gia sư" ở cuối câu, cạnh dấu câu hay xuống dòng đều nhận.
- "cần tìm cô giáo" nhận. "cần tìm cơ hội" và "can tim co hoi" **không** nhận.
- Bài của gia sư có "tìm gia sư" trả về **không phải** `seeking_tutor`. Bài của gia sư có "nhận dạy kèm" hoặc "tìm học sinh" trả `seeking_student`. Bài của admin trả `null`.
- Môn: "Toán lớp 9" cho Toán · THCS; "anh văn" cho Tiếng Anh; "em vẫn chưa hiểu" **không** cho Ngữ văn; "lớp 1" không bị nhận thành "lớp 10". Môn xuất hiện trước được chọn.

### 8.2 API (trong file trên hoặc `test/community.test.js`)

- Gia sư nhận danh sách. Học sinh và admin nhận 403, khách nhận 401.
- Bài bị loại đúng: chưa duyệt, bị ẩn, `solved=1`, quá 14 ngày, của gia sư, `kind='announcement'`, người đăng bị khóa tài khoản.
- Bản sửa đang chờ duyệt có chữ "tìm gia sư" nhưng bản công khai không có: không lên dải.
- Thứ tự mới nhất trước, tối đa 10 bài.
- Kết quả không chứa `body` hay `id` tài khoản người đăng.
- Gia sư bị khóa Cộng đồng vẫn gọi được.

### 8.3 Trình duyệt (Playwright, ví dụ `test/e2e/request-strip.spec.ts`)

- Gia sư thấy khối ở đúng vị trí. Học sinh không thấy.
- 0 bài: không có khối. 2 bài: hàng tĩnh, không có animation. Đủ bài và tràn khung: có animation.
- Đưa chuột vào thì dừng. Bấm thẻ mở đúng `/community/:id`. "Xem tất cả" mở Cộng đồng với ô tìm đã điền "tìm gia sư".
- `prefers-reduced-motion: reduce` và màn hình 360 px: không chạy, cuộn ngang được, trang không tràn ngang.
- Bàn phím: Tab đi qua từng thẻ đúng một lần (bản nhân đôi không nhận focus) và dải dừng khi có focus.

## 9. Rủi ro và theo dõi

- **Nhận nhầm hoặc sót** do đoán theo từ khóa. Đã chấp nhận; nếu nhiều thì thêm bước admin sửa ở lần sau.
- **Ít bài trong giai đoạn đầu:** khối sẽ thường xuyên bị ẩn. Đây là hành vi đúng, không phải lỗi.
- **Hiệu năng:** mỗi lần mở dashboard của gia sư quét bài 14 ngày. Khi lượng bài lớn thì lưu sẵn kết quả phân loại vào một cột. Bước 1 chưa cần.

---

# PHẦN 2 — PROMPT TRIỂN KHAI

> Sao chép nguyên phần dưới đây cho người hoặc agent triển khai.

---

Bạn triển khai **bước 1** của chức năng "Dải Đang tìm gia sư trên dashboard gia sư" trong repo **Gia Sư 10 Điểm**. Thiết kế đầy đủ nằm ở **Phần 1** của `docs/dai-tim-gia-su-dashboard.md`. Đọc hết Phần 1 trước khi viết code. Mọi điểm đã chốt, **đừng hỏi lại**. Gặp chi tiết nhỏ mà tài liệu không nói, hãy tự quyết theo cách nhất quán với code hiện có, rồi ghi vào báo cáo cuối.

## Bối cảnh repo (đã kiểm tra)

- **Backend:** Express 5 + SQLite (`node:sqlite` khi chạy local; Cloudflare Worker + Durable Object SQLite trên production).
  - Helper: `all`, `one`, `run`, `transaction` trong `server/db.js`; `z`, `text` trong `server/validation.js`.
  - Lỗi trả bằng `throw Object.assign(new Error(msg), { status })`.
- **Frontend:** React 19 + Vite + react-router-dom 7 (basename `/app`), shadcn. Tải dữ liệu bằng `useLoad<T>(path | null)` từ `app/src/lib/api.tsx`.
- **Cộng đồng:**
  - `server/community.js`: `registerCommunity`, `publicPosts`, `joins`, hàm `author(id, viewer)` nội bộ.
  - `server/community-policy.js`: `fold`, `authorLabel`, `subjectAliases`, `levelAliases`, `LIMITS`.
  - `server/catalog.js`: danh sách môn `[id, tên, cấp, mô tả]`.
- **Giao diện Cộng đồng:**
  - `app/src/components/community/shared.tsx`: `memberImageUrl`, `AuthorLabel`, `PostCard`.
  - `app/src/components/common.tsx`: `Person`.
  - `app/src/lib/types.ts`: kiểu `CommunityAuthor` khoảng dòng 189.
  - Trang Cộng đồng đọc `?q=` (`app/src/pages/Community.tsx`, khoảng dòng 22).
- **Dashboard:** `app/src/pages/Dashboard.tsx`, có biến `isTutor`. `<TodayLessons …/>` ở khoảng dòng 122; khối `workspace-overview` / `next-lesson-panel` ngay sau.
- **CSS:** `app/src/styles.css`, đã có nhiều khối `@media (prefers-reduced-motion: reduce)`. Quy ước chuyển động ở `docs/ui-motion.md`.
- **Test:**
  - Unit và API chạy bằng `node --test`. Test mới phải được **thêm tên file vào script `npm test`** trong `package.json`.
  - API test mẫu: `test/community.test.js`. E2E mẫu: `test/e2e/community.spec.ts`. Server e2e: `test/e2e-server.js`.

## Cách làm việc

1. Tạo **worktree mới** dưới `.claude/worktrees/dai-tim-gia-su`, cắt từ **`origin/main` mới nhất** (`git fetch` trước), nhánh `feat/dai-tim-gia-su`. Không làm trong thư mục checkout chính.
2. Một nhánh, một PR cho cả bước 1.
3. **Không commit, push hay mở PR** khi chủ dự án chưa đồng ý. Dừng lại và báo cáo khi xong.
4. Khi được phép commit: **không thêm dòng đồng tác giả AI** (`Co-Authored-By`) vào commit, theo quy ước của repo.
5. Chỉ thêm, không sửa hành vi hiện có của Cộng đồng hay dashboard. Không thêm cột hay bảng.

## Các giai đoạn

### Giai đoạn 1 — Bộ nhận diện (hàm thuần)

- Tạo `server/community-requests.js`, export:
  - `classifyRequest({ title, body, authorRole })` theo mục 3.2 và 3.4.
  - `requestTopic(text)` trả `{ subject, level }` theo mục 3.3.
  - Danh sách cụm dưới dạng hằng số, đặt ở đầu file và có chú thích.
- Dùng lại `fold`, `subjectAliases`, `levelAliases` và danh sách môn trong `server/catalog.js`. Không chép lại.
- Viết `test/community-requests.test.js` (mục 8.1) và thêm vào `npm test`.

### Giai đoạn 2 — API

- Thêm `GET /api/community/requests` trong `registerCommunity` theo mục 6.
  - Quyền `auth("tutor")`, không dùng `participant`.
  - Truy vấn SQL cho điều kiện 1–5 ở mục 3.1, rồi lọc bằng `classifyRequest` cho đến khi đủ 10 bài.
  - `author` dùng `authorLabel(…, req.user)`, giống hàm `author` nội bộ.
- Viết test API (mục 8.2).

### Giai đoạn 3 — Giao diện

- Tạo `app/src/components/request-strip.tsx`, component `RequestStrip`.
  - Gọi `useLoad` tới `/community/requests` (chỉ khi là gia sư; không phải gia sư thì truyền `null`).
  - Hành vi theo mục 5.2–5.5: ẩn khi 0 bài, đang tải hay lỗi; tĩnh khi 1–3 bài hoặc không tràn khung; chạy khi từ 4 bài và tràn khung.
  - Nhân đôi danh sách: bản sau `aria-hidden` và `tabIndex={-1}`. Dừng khi `:hover` hoặc `:focus-within`. Đứng yên và cuộn ngang khi giảm chuyển động hoặc thiết bị cảm ứng.
- Thêm kiểu cho phản hồi API vào `app/src/lib/types.ts`.
- Trong `Dashboard.tsx`, đặt `{isTutor && <RequestStrip />}` **ngay sau** `<TodayLessons …/>`.
- CSS trong `app/src/styles.css`: thẻ rộng cố định, tiêu đề một dòng cắt "…", mép mờ dần, `@keyframes` chỉ dùng `transform`, khối `prefers-reduced-motion` và `(hover: none)`. Theo màu và bo góc của các thẻ dashboard hiện có, kể cả chế độ tối nếu có.
- Liên kết "Xem tất cả" tới `/community?q=` + `encodeURIComponent("tìm gia sư")`.

### Giai đoạn 4 — Kiểm thử trình duyệt và tài liệu

- Viết `test/e2e/request-strip.spec.ts` (mục 8.3). Dựng dữ liệu qua API hoặc helper sẵn có trong `test/e2e-server.js`. Nếu buộc phải thêm route chỉ dành cho test, đặt trong `test/e2e-server.js`, không đặt trong server thật.
- Cập nhật tài liệu Cộng đồng hoặc dashboard hiện có trong `docs/` bằng một đoạn ngắn về dải này. Thêm `docs/dai-tim-gia-su-dashboard-implementation.md` ghi: đã làm gì, các [ĐỀ XUẤT] đã áp dụng, quyết định tự đưa ra, kết quả chạy lệnh.

## Kiểm chứng bắt buộc trước khi báo xong

Chạy thật và ghi kết quả:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

```bash
npx playwright test
```

**Lưu ý về Playwright:** các spec dùng Express `sendFile` (trang giới thiệu, `/privacy`, `/terms`) **thất bại khi chạy trong đường dẫn có `.claude/`**, do quy tắc chặn dotfile. Nếu chỉ những spec đó lỗi, chạy lại chúng từ một bản sao **ngoài** `.claude/` và ghi rõ trong báo cáo.

Kiểm tra thêm bằng trình duyệt thật (dev server ở `http://127.0.0.1:4174`, **không dùng `localhost`**, vì kiểm tra nguồn yêu cầu sẽ từ chối đăng nhập). Tài khoản demo có trong `README.md`.

- Đăng nhập bằng gia sư demo: thấy dải, đưa chuột vào thì dừng, bấm thẻ mở đúng bài.
- Đăng nhập bằng học sinh demo: không thấy dải.
- Màn hình 360 px: không tràn ngang.

## Báo cáo cuối (viết bằng tiếng Việt)

1. Danh sách file đã thêm hoặc sửa.
2. Kết quả từng lệnh kiểm chứng (số test đạt, lỗi nếu có, kèm nguyên nhân).
3. Các quyết định tự đưa ra ngoài tài liệu.
4. Những gì chưa làm hoặc chưa kiểm được.
5. Xác nhận: chưa commit, chưa push. Hỏi chủ dự án có muốn commit và mở PR không.
