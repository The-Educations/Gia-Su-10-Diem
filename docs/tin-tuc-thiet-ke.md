# Tin tức — Thiết kế hoàn thiện và prompt triển khai

> Ngày soạn: 2026-11-23. Trạng thái: **bản thảo đã chốt hướng**, chưa triển khai.
> Tài liệu gồm 2 phần:
> - **Phần 1**: thiết kế chức năng (người triển khai đọc để hiểu bối cảnh và luật).
> - **Phần 2**: prompt đưa thẳng cho model triển khai.
>
> Quy ước: mục nào ghi **[Quyết định của người thiết kế]** là lựa chọn do người soạn tài liệu đưa ra khi chủ dự án giao quyền ("chốt ý tưởng của bạn"). Chủ dự án có thể sửa trước khi triển khai.

---

# PHẦN 1 — THIẾT KẾ CHỨC NĂNG

## 1. Mục đích của mục Tin tức

Tin tức trên Gia Sư 10 Điểm có 3 việc, theo thứ tự ưu tiên:

1. **Cho phụ huynh và học sinh thông tin dùng được để quyết định việc học**: lịch thi, điểm chuẩn, phương thức xét tuyển, học phí, học bổng, thay đổi chương trình, chọn ngành.
2. **Kéo người lạ từ Google, Facebook, Zalo vào trang** (SEO và chia sẻ).
3. **Dẫn người đọc sang tìm gia sư** đúng nhu cầu vừa đọc (ví dụ đọc tin tuyển sinh lớp 10 thì được mời tìm gia sư ôn thi vào 10).

**[Quyết định của người thiết kế]** Cân bằng cả 2 và 3. Lời mời tìm gia sư nằm cuối bài, một khung, không bật lên giữa bài, không che nội dung.

Phần lớn bài là **nháp do n8n tự viết lại từ 4 báo** (xem `docs/tin-tuc-tu-dong-hoa.md`, `scripts/n8n/`). Vì vậy việc chính của admin là **duyệt nhanh**, rồi mới đến tự viết.

### Mục tiêu
- Admin duyệt một bài n8n trong dưới 1 phút: xem, sửa nhẹ, bấm "Duyệt & đăng".
- Người đọc lọc tin theo chủ đề và đọc dễ trên điện thoại.
- Mỗi bài có ảnh bìa, nguồn rõ ràng, đường dẫn đẹp, hiện đẹp khi chia sẻ.
- Cuối bài có tin liên quan và lời mời tìm gia sư hợp chủ đề.

### Không làm (non-goals)
- Bình luận dưới bài tin (đã có mục Cộng đồng).
- Xếp theo "xem nhiều nhất" hoặc đếm lượt xem.
- Hẹn giờ đăng.
- Nhiều tác giả hoặc phân quyền biên tập viên. Chỉ admin soạn và duyệt.
- Bản tin email (newsletter).

### Điều tuyệt đối không được xảy ra (anti-goals)
- Bài nháp, dù chỉ tiêu đề, lộ ra ở API công khai, sitemap, SEO hay trang tin.
- Lỗ hổng XSS từ nội dung bài, kể cả bài do n8n gửi lên.
- Link cũ `/app/news/:id` đã chia sẻ hoặc đã vào Google bị gãy.
- Luồng n8n hiện có ngừng tạo được bài nháp.
- Bài đã đăng tự đổi đường dẫn khi admin sửa tiêu đề.

---

## 2. Hiện trạng (đọc trước khi sửa)

| Phần | File | Đang làm gì |
| --- | --- | --- |
| Bảng dữ liệu | `server/db.js` (bảng `posts`) | `id, title, summary, body (chữ thuần), published 0/1, author_id, published_at, created_at, updated_at` |
| API | `server/posts.js` | Công khai: `GET /api/posts` (mảng bài đã đăng), `GET /api/posts/:id`. Admin: `GET/POST /api/admin/posts`, `PUT /api/admin/posts/:id`, `DELETE /api/admin/posts/:id` |
| Admin UI | `app/src/pages/AdminPosts.tsx`, mở tại `/admin?tab=posts` (`app/src/pages/Admin.tsx`) | Một danh sách, form chữ thuần, ô "Công khai bài viết", nút Sửa, Xóa |
| Trang công khai | `app/src/pages/News.tsx`, route `/news`, `/news/:id` (`app/src/main.tsx`) | Danh sách tiêu đề và tóm tắt, mới nhất trước. Chi tiết in chữ thuần |
| Ảnh trong bài (đang làm dở, có thể chưa commit) | `app/src/lib/news-body.ts`, `scripts/n8n/lib/image.js`, `test/news-body.test.js` | Dòng `![mô tả](https://...)` và dòng `Ảnh: <nguồn>` được dựng thành `<figure>` |
| SEO | `server/seo.js` (`pageSeo`, `renderSeo`, `newsSitemap`), `worker/index.js` (khoảng dòng 110–165) | Regex `/^\/app\/news\/\d+$/`, canonical, sitemap theo id |
| n8n | `scripts/n8n/lib/web.js` `buildPostBody`, `lib/draft.js` `buildPrompt`, `lib/topic.js` | Gửi `{title, summary, body, published:false}`. Ảnh đặt ở đầu body, dòng cuối body là `Nguồn: <báo> - <link>` |
| Trình soạn có sẵn | `app/src/components/community/RichEditor.tsx` (TipTap), `server/community-rich.js` `cleanPostHtml` (sanitize-html) | Cộng đồng đã có tiêu đề phụ H2/H3, đậm, nghiêng, danh sách, trích dẫn, liên kết, chèn ảnh, hoàn tác |
| Ảnh tải lên có sẵn | `server/community-images.js`, bảng `community_images` và các bảng liên quan | Ảnh lưu theo khối (chunk). Ảnh không gắn bài sẽ bị dọn sau 1 ngày |
| Bỏ dấu | `server/community-policy.js` `fold()` | Chuẩn hóa chữ để tìm kiếm không phân biệt dấu |
| Lọc gia sư | `app/src/pages/Tutors.tsx` | Tham số URL: `q, subject, mode, location, budget, sort, level, goal`. `level` thuộc `Tiểu học / THCS / THPT / Người đi làm`. `goal` lấy từ `category` của bảng `resources` |
| Tài liệu kiến trúc | `docs/architecture.md` (mục "Account entry and news") | Mô tả luật hiện tại của Tin tức |

Lưu ý: URL công khai có tiền tố `/app` (ví dụ `https://giasudiem10.online/app/news/12`). Trong React Router, route là `/news/...`.

---

## 3. Khái niệm và vòng đời một bài

### 3.1 Chủ đề (topic)

3 chủ đề cố định, khớp với bộ lọc n8n trong `scripts/n8n/lib/topic.js` và `buildPrompt`:

| Mã (lưu DB) | Nhãn hiển thị | Gồm |
| --- | --- | --- |
| `admissions` | Tuyển sinh & thi cử | Tuyển sinh ĐH/CĐ, lớp 10, thi tốt nghiệp THPT, điểm chuẩn, phương thức xét tuyển, lịch thi, đề thi |
| `policy` | Chính sách | Học phí, miễn giảm, học bổng, chương trình, SGK, dạy thêm học thêm, quy chế, thông tư |
| `study` | Học tập & chọn ngành | Phương pháp học, ôn thi, ngoại ngữ, chứng chỉ, chọn ngành, hướng nghiệp, du học |

Định nghĩa danh sách này **một lần** trong file dùng chung cho server và app (ví dụ `shared/news-topics.json`). Không viết lại ở nhiều nơi.

### 3.2 Nguồn tạo bài (origin)
- `auto`: do n8n tạo.
- `manual`: admin tự viết.

Chỉ dùng để chia tab trong admin. Người đọc không thấy.

### 3.3 Trạng thái

```
            (n8n tạo, origin=auto)            (admin bấm "Viết bài mới", origin=manual)
                      │                                         │
                      ▼                                         ▼
               ┌─────────────┐                          ┌─────────────┐
               │  CHỜ DUYỆT  │                          │    NHÁP     │
               └──────┬──────┘                          └──────┬──────┘
                      │  "Duyệt & đăng" / lưu có tick Công khai │
                      └──────────────────┬─────────────────────┘
                                         ▼
                                  ┌─────────────┐   "Gỡ xuống"   quay về Chờ duyệt (auto)
                                  │   ĐÃ ĐĂNG   │ ─────────────▶ hoặc Nháp (manual)
                                  └─────────────┘
        Ở mọi trạng thái: "Xóa" = xóa hẳn khỏi database (đã có, có hộp xác nhận).
```

- Dữ liệu vẫn dùng cột `published` 0/1. "Chờ duyệt" và "Nháp" đều là `published=0`, phân biệt bằng `origin`.
- Gỡ xuống giữ nguyên `published_at` và `slug`. Đăng lại thì đường dẫn không đổi.

### 3.4 Ghim
- Tối đa **1** bài được ghim, và chỉ bài đã đăng mới ghim được.
- Ghim bài mới thì bỏ ghim bài cũ, trong cùng một transaction.
- Gỡ xuống hoặc xóa bài đang ghim thì bỏ ghim luôn.

---

## 4. Mô hình dữ liệu

Thêm cột vào bảng `posts` theo đúng kiểu migration đang dùng trong `server/db.js`: kiểm tra `PRAGMA table_info(posts)` rồi mới `ALTER TABLE ... ADD COLUMN`, để chạy lại không lỗi và database cũ không mất dữ liệu.

| Cột | Kiểu, mặc định | Ý nghĩa và luật |
| --- | --- | --- |
| `topic` | `TEXT NOT NULL DEFAULT 'study'`, CHECK thuộc 3 mã | Chủ đề. Bài cũ lấy mặc định `study`, admin sửa lại sau |
| `origin` | `TEXT NOT NULL DEFAULT 'manual'`, CHECK `manual`/`auto` | Bài cũ lấy `manual` |
| `slug` | `TEXT NOT NULL DEFAULT ''` | Phần chữ trong đường dẫn. Server tự sinh từ tiêu đề (bỏ dấu bằng `fold()`, chỉ giữ `a-z0-9`, nối bằng `-`, tối đa 80 ký tự). **Chốt ở lần đăng đầu tiên**: sau khi đã có `published_at`, đổi tiêu đề không đổi slug. Không cần UNIQUE vì id mới là khóa |
| `body_html` | `TEXT NOT NULL DEFAULT ''` | HTML đã sanitize từ trình soạn. Rỗng nghĩa là bài kiểu cũ (chữ thuần) |
| `body` | (đã có) | Luôn là chữ thuần. Dùng cho đếm chữ, thời gian đọc, mô tả SEO, tìm kiếm. Nếu lưu bằng `body_html` thì server tự rút chữ thuần ra, giống `cleanPostHtml` |
| `cover_url` | `TEXT NOT NULL DEFAULT ''` | Ảnh bìa. Chỉ nhận `https://...` hoặc đường dẫn ảnh tin tức tải lên (`/api/news/images/<uuid>`) |
| `cover_alt` | `TEXT NOT NULL DEFAULT ''` | Mô tả ảnh, tối đa 300 ký tự. Bỏ trống thì dùng tiêu đề |
| `cover_credit` | `TEXT NOT NULL DEFAULT ''` | Nguồn ảnh, ví dụ "Tuổi Trẻ", tối đa 120 ký tự |
| `source_name` | `TEXT NOT NULL DEFAULT ''` | Tên báo gốc, tối đa 120 ký tự |
| `source_url` | `TEXT NOT NULL DEFAULT ''` | Link bài gốc, phải `http(s)://` |
| `pinned` | `INTEGER NOT NULL DEFAULT 0`, CHECK 0/1 | Xem mục 3.4 |
| `cta_level` | `TEXT NOT NULL DEFAULT ''` | Cấp học cho lời mời cuối bài. Rỗng thì dùng mặc định theo chủ đề |
| `cta_goal` | `TEXT NOT NULL DEFAULT ''` | Mục tiêu kỳ thi (khớp `resources.category`). Rỗng thì không lọc |
| `search_text` | `TEXT NOT NULL DEFAULT ''` | `fold(title + " " + summary + " " + body)`, cập nhật mỗi lần lưu |
| `revised_at` | `TEXT` (NULL) | Đặt bằng thời điểm hiện tại khi tiêu đề, tóm tắt hoặc nội dung **đổi** trong lúc bài đang đăng. Dùng để hiện "Cập nhật lúc ..." |

### 4.1 Chuyển dữ liệu cũ (chạy 1 lần trong migration, chạy lại vô hại)
- **Nguồn:** bài có `source_name` rỗng mà dòng cuối không rỗng của `body` khớp `^Nguồn:\s*(.+?)\s+-\s+(https?:\/\/\S+)\s*$` thì chuyển sang `source_name` và `source_url`, rồi bỏ dòng đó khỏi `body`.
- **Ảnh bìa:** bài có `cover_url` rỗng mà phần đầu `body` là dòng ảnh `![...](https://...)`, có thể kèm dòng `Ảnh: ...`, thì chuyển sang `cover_url`, `cover_alt`, `cover_credit`, rồi bỏ khỏi `body`.
- **Slug:** bài đã đăng mà `slug` rỗng thì sinh slug từ tiêu đề.
- **Tìm kiếm:** tính `search_text` cho mọi bài.

### 4.2 Ảnh tin tức tải lên
Không dùng chung `community_images`, vì cơ chế dọn ảnh của Cộng đồng sẽ xóa ảnh không gắn bài cộng đồng. Làm bộ riêng, sao theo mẫu `server/community-images.js`:
- Bảng `news_images (id TEXT PRIMARY KEY, author_id, created_at)` và `news_image_chunks (image_id, part, data)`.
- Bảng `news_post_images (post_id REFERENCES posts(id) ON DELETE CASCADE, image_id REFERENCES news_images(id) ON DELETE CASCADE)`. Mỗi lần lưu bài thì dựng lại từ ảnh bìa và các `<img>` trong `body_html`.
- Route tải lên: `POST /api/admin/news/images`, chỉ admin. Nhận JPG/PNG/WebP, tối đa 5 MB, xử lý bằng `processPhoto` như Cộng đồng.
- Route xem: `GET /api/news/images/:id`, công khai, có cache dài.
- Ảnh không gắn bài nào sau 1 ngày thì bị dọn (cùng cách Cộng đồng đang dọn).

---

## 5. API

### 5.1 Công khai

**`GET /api/posts`** — giữ nguyên dạng mảng, vì sitemap trong `worker/index.js` và SEO đang dùng. Thêm `slug` và `updated_at` vào các cột trả về. Không trả bài nháp.

**`GET /api/news`** — mới, cho trang danh sách.
- Tham số:
  - `topic`: một trong 3 mã, hoặc bỏ trống là tất cả.
  - `q`: tìm kiếm, tối đa 100 ký tự. Server gọi `fold()` rồi dùng `LIKE` trên `search_text`. Thuộc **Đợt 2**.
  - `page`: số trang, từ 0.
- Mỗi trang 12 bài. Lấy 13 để biết `has_more`.
- Thứ tự: `published_at DESC, id DESC`. Chỉ bài `published=1`.
- `pinned`: chỉ trả khi `page=0`, `topic` rỗng và `q` rỗng. Khi đó bài ghim **không** lặp lại trong `items`.
- Trả về:
```json
{
  "pinned": NewsCard | null,
  "items": NewsCard[],
  "has_more": true
}
```
- Dạng `NewsCard`:
```json
{
  "id": 12,
  "slug": "lich-thi-tot-nghiep-thpt-2027",
  "title": "...",
  "summary": "...",
  "topic": "admissions",
  "cover_url": "...",
  "cover_alt": "...",
  "published_at": "...",
  "revised_at": null,
  "reading_minutes": 3
}
```
- `reading_minutes = max(1, round(số chữ trong body / 200))`, tính ở server và không lưu.

**`GET /api/posts/:id`** — giữ route, trả thêm:
- mọi cột công khai ở mục 4: `slug, topic, body_html, cover_*, source_*, revised_at, reading_minutes`, và `cta` đã tính sẵn (mục 7.3);
- `related`: tối đa 3 `NewsCard`, ưu tiên cùng chủ đề, mới nhất, không gồm chính bài này. Nếu thiếu thì bù bằng bài mới nhất của chủ đề khác.

Không trả `search_text`, `author_id`, `origin`, `pinned`.

### 5.2 Admin (đều yêu cầu `auth("admin")`)

| Route | Việc |
| --- | --- |
| `GET /api/admin/posts?tab=review\|drafts\|published` | Trả `{ counts: {review, drafts, published}, items: [...] }`. `review` là `published=0 AND origin='auto'`, `drafts` là `published=0 AND origin='manual'`, `published` là `published=1`. Thứ tự: `review` và `drafts` theo `created_at DESC`, `published` theo `published_at DESC`. Mặc định là `review` nếu có bài chờ, không thì `published` |
| `GET /api/admin/posts/:id` | Đọc một bài đầy đủ để sửa, kể cả bản nháp |
| `POST /api/admin/posts` | Tạo. Nhận các trường ở mục 5.3 |
| `PUT /api/admin/posts/:id` | Sửa toàn bộ. Nhận các trường ở mục 5.3 |
| `POST /api/admin/posts/:id/publish` | "Duyệt & đăng" nhanh. Kiểm tra điều kiện bắt buộc (mục 6.4). Thiếu thì trả 422 kèm danh sách lỗi |
| `POST /api/admin/posts/:id/unpublish` | Gỡ xuống. Bỏ ghim |
| `POST /api/admin/posts/:id/pin` với body `{pinned: boolean}` | Ghim hoặc bỏ ghim. Bài chưa đăng thì trả 409 |
| `DELETE /api/admin/posts/:id` | Đã có. Xóa hẳn. Trong cùng transaction, xóa rõ ràng các dòng `news_post_images` của bài. Không chỉ trông vào `ON DELETE CASCADE`: `PRAGMA foreign_keys` được bật trong `server/local-db.js`, nhưng phải kiểm tra lại trên Worker |
| `POST /api/admin/news/images` | Tải ảnh (mục 4.2) |

Mọi thao tác ghi đều gọi `audit(...)` với tên: `save_post_draft`, `publish_post`, `unpublish_post`, `pin_post`, `unpin_post`, `delete_post` (đã có), `upload_news_image`.

### 5.3 Dữ liệu nhận khi tạo và sửa (zod)

```
title         chữ, 1–160 ký tự (bắt buộc)
summary       chữ, 1–500 ký tự (bắt buộc)
body_html     HTML, tối đa 60.000 ký tự   ─┐ phải có một trong hai
body          chữ thuần, tối đa 30.000    ─┘ (n8n gửi body, trình soạn gửi body_html)
topic         'admissions' | 'policy' | 'study' (mặc định 'study')
origin        'manual' | 'auto' (mặc định 'manual'; chỉ được đặt khi TẠO, PUT bỏ qua)
cover_url, cover_alt, cover_credit, source_name, source_url, cta_level, cta_goal  (tùy chọn)
published     boolean
```

- **`body_html`** đi qua hàm sanitize riêng cho tin tức. Viết hàm mới dựa theo `cleanPostHtml`, cùng danh sách thẻ, nhưng `<img src>` chỉ nhận `/api/news/images/<uuid>`. Từ HTML đã sạch, server rút ra `body` chữ thuần.
- **Chỉ có `body`** (n8n và bài cũ): giữ `body_html` rỗng. Trang công khai dựng bằng `parseNewsBody` như hiện tại.
- **Admin mở một bài chữ thuần để sửa:** app chuyển sang HTML cho trình soạn bằng `plainToHtml`. Dòng ảnh `![..](https://..)` nằm giữa bài giữ nguyên thành một đoạn chữ, admin tự xử lý. Lần lưu sau sẽ thành bài `body_html`.
- **Ảnh và link ngoài:** `cover_url` và `source_url` không phải `https://` (hoặc `http://` với nguồn) thì trả 400.

---

## 6. Admin: màn hình duyệt và soạn bài

Đặt tại `/admin?tab=posts` như hiện nay. Tách thành các component nhỏ thay vì dồn vào một file.

### 6.1 Danh sách (màn hình mặc định)

```
Tin tức
[Chờ duyệt (7)] [Nháp (1)] [Đã đăng (32)]                    [+ Viết bài mới]
┌───────────────────────────────────────────────────────────────────────┐
│ [ảnh 96×64] Bộ GD công bố lịch thi tốt nghiệp THPT 2027                 │
│             Tuyển sinh & thi cử · Tuổi Trẻ ↗ · tạo 2 giờ trước          │
│             ⚠ Thiếu ảnh bìa                                             │
│             [Duyệt & đăng]  [Sửa]  [Xóa]                                │
└───────────────────────────────────────────────────────────────────────┘
```

- Tab nằm trong URL: `/admin?tab=posts&news=review|drafts|published`. Tải lại trang vẫn giữ tab.
- **Mỗi dòng hiện:** ảnh bìa thu nhỏ (không có thì ô xám), tiêu đề, nhãn chủ đề, nguồn (link mở tab mới), thời điểm tạo hoặc đăng, cảnh báo ngắn (mục 6.4).
- **Nút theo tab:**
  - Chờ duyệt và Nháp: `Duyệt & đăng` (gọi `/publish`), `Sửa`, `Xóa`.
  - Đã đăng: `Sửa`, `Xem` (link `/news/:id-:slug`), `📌 Ghim` hoặc `Bỏ ghim`, `Gỡ xuống`, `Xóa`.
- **"Duyệt & đăng" khi thiếu điều kiện bắt buộc:** hiện lỗi ngay dưới dòng đó và không đăng.
- **Gỡ xuống và Xóa** cần hộp xác nhận. Ghim không cần.
- **Tab rỗng:** "Không có bài chờ duyệt. n8n chạy 3 giờ một lần."

### 6.2 Form soạn và sửa

Bố cục 2 cột trên màn rộng (form bên trái, khung kiểm tra bên phải), 1 cột trên điện thoại.

```
← Quay lại danh sách                         [Xem trước] [Lưu nháp] [Lưu & đăng]
Tiêu đề *            [______________________________________]  68/160
Tóm tắt *            [______________________________________]  142/500
Chủ đề *             (•) Tuyển sinh & thi cử ( ) Chính sách ( ) Học tập & chọn ngành
Ảnh bìa              [Tải ảnh lên] hoặc [dán link https]   [xem trước ảnh]
  Mô tả ảnh          [__________]   Nguồn ảnh [__________]
Nội dung *           [ RichEditor: H2 H3 B I • 1. " link ảnh ↶ ↷ ]
                     412 chữ · khoảng 2 phút đọc
Nguồn bài gốc        Tên báo [________]  Link [_______________]
Lời mời tìm gia sư   Cấp học [mặc định theo chủ đề ▾]  Mục tiêu kỳ thi [không lọc ▾]
                     Xem trước: "Tìm gia sư ôn thi vào lớp 10 →"
[ ] Ghim lên đầu trang Tin tức (chỉ khi đăng)

┌ Kiểm tra trước khi đăng ───────┐
│ ✓ Có tiêu đề                   │
│ ✓ Có tóm tắt                   │
│ ✓ Có nội dung                  │
│ ✓ Đã chọn chủ đề               │
│ ⚠ Chưa có ảnh bìa              │
│ ⚠ Bài ngắn (dưới 150 chữ)      │
└────────────────────────────────┘
```

- **Nút:**
  - `Lưu nháp`: lưu với `published=false`.
  - `Lưu & đăng`: lưu với `published=true`, bị chặn nếu thiếu điều kiện bắt buộc.
  - Bài đang đăng thì nút đổi thành `Cập nhật bài`, và có thêm `Gỡ xuống`.
  - `Xóa` chỉ hiện khi sửa bài đã có (đã làm).
- **Phím tắt:** `Ctrl/Cmd + S` bằng `Lưu nháp`, hoặc `Cập nhật bài` nếu bài đang đăng.
- **Xem trước:** hiện bài đúng như người đọc thấy, dùng **chính component trang chi tiết công khai** (mục 7.2) với dữ liệu đang soạn. Không viết giao diện xem trước riêng.
- **Đếm chữ và thời gian đọc** cập nhật khi gõ, cùng công thức với server.
- **Chống mất bài:**
  - Đang có thay đổi chưa lưu mà rời trang thì hỏi `beforeunload`. Bấm "Quay lại danh sách" thì hỏi bằng `confirm`.
  - Mỗi 3 giây khi có thay đổi, lưu tạm vào `localStorage` với khóa `news-draft:<id hoặc new>`. Bọc try/catch.
  - Mở lại bài mà bản tạm mới hơn `updated_at` của server thì hiện "Có bản đang soạn dở lúc HH:mm — [Khôi phục] [Bỏ]".
  - Lưu thành công thì xóa bản tạm.
- **Ảnh bìa:**
  - Tải lên qua `POST /api/admin/news/images`, sau đó điền `cover_url`.
  - Dán link https cũng được, đây là đường n8n dùng.
  - Ảnh lỗi khi xem trước thì báo "Không tải được ảnh này".
- **Lời mời tìm gia sư:**
  - Danh sách cấp học lấy giống `Tutors.tsx`.
  - Danh sách mục tiêu lấy từ cùng nguồn dữ liệu `resources.category` mà `Tutors.tsx` đang dùng.

### 6.3 Trình soạn
Dùng lại `RichEditor` của Cộng đồng. Nếu component đang gắn chặt với API ảnh cộng đồng (`/api/community/images`), thêm prop cho địa chỉ tải ảnh thay vì nhân bản file. Không đổi hành vi bên Cộng đồng.

### 6.4 Điều kiện đăng
- **Bắt buộc (chặn đăng, cả ở server lẫn app):** có tiêu đề, có tóm tắt, nội dung chữ thuần ít nhất 50 chữ, chủ đề hợp lệ.
- **Cảnh báo (vẫn đăng được):**
  - không có ảnh bìa;
  - bài `auto` mà không có nguồn;
  - dưới 150 chữ;
  - tiêu đề dài hơn 100 ký tự (Google cắt bớt);
  - tóm tắt dài hơn 300 ký tự.

Server trả lỗi bắt buộc dạng `{ error: "...", problems: ["Thiếu tóm tắt", ...] }` với mã 422.

---

## 7. Trang Tin tức công khai

### 7.1 Danh sách `/news`

```
Tin tức
Thông tin tuyển sinh, thi cử và chính sách giáo dục cho học sinh và phụ huynh.
[Tất cả] [Tuyển sinh & thi cử] [Chính sách] [Học tập & chọn ngành]     [🔍 Tìm tin]  (Đợt 2)
┌──────────────────────── TIN NỔI BẬT ────────────────────────┐
│ [ảnh bìa lớn 16:9]                                           │
│ Tuyển sinh & thi cử                                          │
│ Tiêu đề lớn                                                  │
│ Tóm tắt (tối đa 3 dòng)                                      │
│ 23/11/2026 · 3 phút đọc                                      │
└──────────────────────────────────────────────────────────────┘
┌──────────┐ Chính sách
│ ảnh 4:3  │ Tiêu đề bài
└──────────┘ Tóm tắt (2 dòng) · 2 giờ trước · 2 phút đọc
...
                         [Xem thêm tin]
```

- **Lọc chủ đề:** dùng URL `?topic=admissions`. Chip đang chọn được tô nổi. Chia sẻ link vẫn giữ bộ lọc.
- **Tin nổi bật:** chỉ hiện ở "Tất cả", trang đầu, không tìm kiếm.
- **Danh sách:**
  - Trên điện thoại: 1 cột, ảnh nằm trên chữ.
  - Từ 768px trở lên: ảnh bên trái, chữ bên phải.
- **Không có ảnh bìa:** dùng ô màu nhạt kèm nhãn chủ đề, không để khung trống hay ảnh vỡ. Ảnh lỗi khi tải cũng xử lý như vậy.
- **Ngày giờ:** dưới 24 giờ thì hiện tương đối ("2 giờ trước"), còn lại `dd/MM/yyyy`. Múi giờ `Asia/Ho_Chi_Minh`.
- **Xem thêm:** "Xem thêm tin" nối thêm 12 bài, không tải lại trang. Hết bài thì ẩn nút.
- **Khi rỗng:**
  - "Chưa có tin trong mục này." kèm link về "Tất cả".
  - Lúc tìm kiếm: "Không tìm thấy tin nào cho “...”".
- **Ảnh:** `loading="lazy"`, `decoding="async"`, `referrerPolicy="no-referrer"`, luôn có `alt`.

### 7.2 Chi tiết `/news/:id-:slug`

```
Tin tức › Tuyển sinh & thi cử
TIÊU ĐỀ BÀI (h1)
Tóm tắt (chữ lớn hơn)
23/11/2026 · Cập nhật 24/11/2026 · 3 phút đọc
[Ảnh bìa] Ảnh: Tuổi Trẻ
Nội dung (body_html đã sanitize; bài cũ thì dùng parseNewsBody)
┌ Nguồn: Tuổi Trẻ — Xem bài gốc ↗ ────────────────────────┐
└──────────────────────────────────────────────────────────┘
Chia sẻ: [Facebook] [Sao chép link] [Chia sẻ…]
┌ Cần người kèm ôn thi vào lớp 10? ────────────────────────┐
│ Tìm gia sư đã xác minh, học thử trước khi đăng ký.      │
│                                [Tìm gia sư ôn thi →]    │
└──────────────────────────────────────────────────────────┘
Tin liên quan
[card] [card] [card]
```

- Tách component `NewsArticle` để dùng cho cả trang công khai lẫn "Xem trước" trong admin.
- **Đường dẫn:**
  - Route React mới là `/news/:idSlug`, tách id bằng `^(\d+)(?:-[a-z0-9-]*)?$`.
  - Thiếu slug hoặc slug sai thì `Navigate replace` về `/news/<id>-<slug đúng>`.
  - Ở server (Node và Worker), `/app/news/12` hoặc slug sai thì **301** về canonical (mục 8).
- **Nội dung:** `body_html` render bằng `dangerouslySetInnerHTML`, **chỉ** vì nó đã sanitize ở server lúc lưu. Ghi chú điều này ngay trong code. Bài cũ (`body_html` rỗng) dùng nhánh `parseNewsBody` như hiện tại.
- **Chia sẻ:**
  - Facebook: `https://www.facebook.com/sharer/sharer.php?u=<canonical>`.
  - "Sao chép link": dùng `navigator.clipboard`, xong hiện "Đã sao chép".
  - "Chia sẻ…": chỉ hiện khi có `navigator.share`. Trên điện thoại, nút này mở được Zalo, Messenger...
  - **[Quyết định của người thiết kế]** Không làm nút Zalo riêng, vì nút chia sẻ của Zalo cần đăng ký app ID.
- **Tin liên quan:** 3 card, ẩn nếu không có.
- **Bài không tồn tại hoặc chưa đăng:** hiện trang 404 như hiện nay.

### 7.3 Lời mời tìm gia sư (CTA)
Server tính sẵn `cta = { heading, text, button, href }`.

| Chủ đề | heading mặc định | button | href |
| --- | --- | --- | --- |
| `admissions` | "Cần người kèm ôn thi?" | "Tìm gia sư ôn thi →" | `/tutors?level=<cta_level>&goal=<cta_goal>` |
| `policy` | "Cần người đồng hành việc học của con?" | "Tìm gia sư phù hợp →" | `/tutors?level=<cta_level>` |
| `study` | "Muốn học hiệu quả hơn?" | "Tìm gia sư kèm học →" | `/tutors?level=<cta_level>&goal=<cta_goal>` |

- Tham số rỗng thì **bỏ khỏi URL**, không để `level=`.
- Có `cta_goal` thì heading thay bằng "Cần người kèm <cta_goal>?".
- `text` cố định: "Tìm gia sư đã xác minh, học thử trước khi đăng ký."
- Link dùng `<Link>` của React Router, vì `/tutors` nằm trong app.

---

## 8. SEO và chia sẻ

- **Canonical:** `https://giasudiem10.online/app/news/<id>-<slug>`.
- **Chuyển hướng 301** về canonical khi gặp `/app/news/<id>` hoặc slug sai:
  - sửa regex trong `server/seo.js` (`pageSeo`) và `worker/index.js` (đoạn khớp `/^\/app\/news\/(\d+)$/`) để nhận cả dạng có slug;
  - Node server cũng phải làm giống hệt, kiểm tra nơi `server/index.js` gọi `renderSeo`.
- **Thẻ meta trang chi tiết:**
  - `og:type=article`;
  - `og:image` lấy ảnh bìa, đổi thành URL tuyệt đối nếu là ảnh tải lên; không có ảnh bìa thì dùng ảnh mặc định của site nếu đã có;
  - `article:published_time`, `article:modified_time`;
  - `description` = tóm tắt.
- **JSON-LD `NewsArticle`:** `headline`, `datePublished`, `dateModified`, `image`, `publisher` (Gia Sư 10 Điểm). Escape đúng cách: không cho `</script>` lọt vào.
- **Sitemap:** dùng URL canonical và thêm `<lastmod>` (`revised_at` hoặc `published_at`). Có **hai** chỗ phải sửa:
  - `server/index.js`, dòng `app.get("/sitemap.xml", ...)`: đang `SELECT id FROM posts WHERE published=1`, phải lấy thêm `slug, published_at, revised_at`;
  - `worker/index.js`: lấy từ `GET /api/posts`.
  `newsSitemap()` trong `server/seo.js` nhận đủ các trường đó.
- **Đoạn khớp đường dẫn bài tin** có ở 3 nơi, phải sửa cả 3 cho giống nhau: `server/index.js` (khoảng dòng 48), `worker/index.js` (khoảng dòng 156), `server/seo.js` (`pageSeo`).
- **Trang danh sách có `?topic=`:** canonical vẫn là `/app/news` (không index từng bộ lọc). **[Quyết định của người thiết kế]**
- Bài nháp và bài đã xóa: 404 + `noindex`, như hiện nay.

---

## 9. Thay đổi phía n8n (Đợt 1)

- **`buildPrompt`** (`scripts/n8n/lib/draft.js`): JSON Claude trả về thêm `"topic": "admissions" | "policy" | "study"`. Prompt ghi rõ 3 nhóm, dùng đúng mô tả ở mục 3.1.
- **Kiểm tra bài** (hàm kiểm tra trong `draft.js`): `topic` sai hoặc thiếu thì gán `study`. Không bỏ bài chỉ vì thiếu topic.
- **`buildPostBody`** (`scripts/n8n/lib/web.js`) gửi:
  ```
  { title, summary, body, topic, origin: "auto",
    cover_url, cover_alt, cover_credit,   // từ ảnh lấy được, nếu có
    source_name, source_url,              // tên báo và link gốc
    published: false }
  ```
  `body` **không** còn dòng ảnh ở đầu và dòng `Nguồn:` ở cuối. Server vẫn nhận định dạng cũ nhờ migration ở mục 4.1, nhưng chỉ khi migration chạy. **[Quyết định của người thiết kế]** Server áp dụng thêm cùng luật tách đó ngay lúc **tạo** bài có `origin='auto'`, để workflow cũ đang chạy trên máy n8n vẫn ra bài đúng.
- **Sau khi đổi:** chạy `node scripts/n8n/build-workflow.js` để sinh lại `news-workflow.json`, cập nhật `scripts/n8n/README.md` và các test `test/n8n-*.test.js`.

---

## 10. Bảo mật và bất biến (phải có test)

1. Không route công khai nào trả bài `published=0`: `/api/posts`, `/api/posts/:id`, `/api/news`, sitemap, SEO, tin liên quan, tin ghim.
2. `body_html` lưu vào DB luôn là bản đã sanitize. Gửi `<script>`, `onerror=`, `javascript:`, `<img src="https://ngoài">` trong `body_html` thì bị loại.
3. `cover_url`, `source_url` khác http(s) thì bị từ chối (400).
4. Mọi route `/api/admin/...` của tin tức: khách nhận 401, tài khoản không phải admin nhận 403.
5. Slug không đổi khi sửa tiêu đề bài đã đăng. Gỡ rồi đăng lại cũng giữ slug.
6. Tối đa 1 bài ghim. Gỡ hoặc xóa bài ghim thì không còn ghim.
7. JSON-LD và meta không thể bị phá bởi tiêu đề chứa `"`, `<`, `</script>`.
8. Xóa bài thì xóa liên kết ảnh. Ảnh mồ côi bị dọn sau 1 ngày.

---

## 11. Phân đợt và tiêu chí xong

### Đợt 1 — Cốt lõi (làm trước, một PR)
| # | Hạng mục | Xong khi |
| --- | --- | --- |
| 1.1 | Migration cột mới + chuyển dữ liệu cũ (mục 4, 4.1) | Chạy trên DB cũ không lỗi, chạy lại không đổi gì; bài cũ có nguồn và ảnh bìa tách đúng |
| 1.2 | API admin mới (mục 5.2, 5.3, 6.4) | Test quyền, 3 tab, đếm số, publish/unpublish/pin, 422 khi thiếu điều kiện |
| 1.3 | Ảnh tin tức tải lên (mục 4.2) | Tải lên, xem công khai, dọn ảnh mồ côi |
| 1.4 | Admin UI: danh sách 3 tab + form mới + RichEditor + xem trước + kiểm tra trước khi đăng + chống mất bài (mục 6) | Duyệt một bài n8n từ đầu đến cuối trên trình duyệt được |
| 1.5 | `GET /api/news` + trang danh sách có lọc chủ đề, tin nổi bật, card có ảnh, "Xem thêm" (mục 7.1) | Đúng thứ tự, đúng phân trang, ghim không lặp |
| 1.6 | Trang chi tiết mới: slug, nguồn, chia sẻ, CTA, tin liên quan (mục 7.2, 7.3) | Link cũ `/news/12` vẫn mở đúng bài |
| 1.7 | SEO: canonical có slug, 301, og:image, JSON-LD, sitemap lastmod (mục 8) | Test cho cả Node và Worker |
| 1.8 | n8n gửi trường có cấu trúc (mục 9) | Test n8n pass, workflow JSON sinh lại |
| 1.9 | Cập nhật `docs/architecture.md` | Mô tả đúng luật mới |

### Đợt 2 — Bổ sung (PR riêng, sau khi Đợt 1 chạy ổn)
| # | Hạng mục |
| --- | --- |
| 2.1 | Ô tìm kiếm trên trang danh sách (`?q=`, dùng `search_text`) |
| 2.2 | Ô tìm trong admin (lọc theo tiêu đề) |
| 2.3 | Hiện bài ghim ở trang chủ hoặc thanh bên của app, nếu chủ dự án muốn |
| 2.4 | Ảnh mặc định cho `og:image` theo từng chủ đề |

---

## 12. Kiểm thử

- **API** (`test/api.test.js`, theo kiểu `fixture(t)` và `client().login(...)` đang có):
  - quyền truy cập;
  - 3 tab và số đếm;
  - publish thiếu điều kiện trả 422;
  - ghim: chỉ còn 1 bài;
  - slug ổn định;
  - sanitize `body_html`;
  - migration tách `Nguồn:` và ảnh đầu bài;
  - `/api/news` phân trang, lọc, ghim không lặp;
  - `related` không chứa bài nháp;
  - n8n tạo bài kiểu cũ vẫn được tách nguồn và ảnh.
- **SEO** (`test/seo.test.js`, `test/seo-routing.mjs`, `test/production-routing.mjs`):
  - canonical có slug;
  - 301 từ link cũ;
  - JSON-LD được escape;
  - sitemap có lastmod và không có bài nháp.
- **n8n** (`test/n8n-news.test.js`, `test/n8n-workflow.test.js`): `topic` trong prompt và trong kết quả kiểm tra, `buildPostBody` gửi trường mới.
- **Kiểm tra cuối:** `npm run typecheck` và `npm test` phải sạch. Nếu đụng giao diện chính, chạy thêm e2e liên quan.
- **Thử tay trên trình duyệt** (`npm run dev`, mở `http://127.0.0.1:4174/app/`):
  - đăng nhập admin;
  - duyệt một bài, ghim, gỡ, xóa;
  - mở trang tin trên khổ điện thoại 375px;
  - mở link cũ `/app/news/<id>`.

---

## 13. Rủi ro và điều để người triển khai tự quyết

- **Ảnh lấy từ báo (hotlink):** đang dùng trực tiếp ảnh `https` của báo, ghi nguồn, và gửi `no-referrer`. Báo có thể chặn hoặc đổi link, khi đó ảnh sẽ ẩn (đã có xử lý lỗi ảnh). Lưu lại ảnh về server là quyết định riêng về bản quyền, **không** làm trong đợt này.
- **Phần ảnh đang làm dở** (`news-body.ts`, `scripts/n8n/lib/image.js`): trước khi bắt đầu, kiểm tra phần này đã merge vào `main` chưa. Nếu chưa, hỏi chủ dự án. Không tự commit hay xóa thay đổi của người khác.
- **Người triển khai tự chọn được:** tên component, cách chia file, CSS (theo token đang có trong `app/src/styles.css`), thông báo lỗi chi tiết, khung hình ảnh cụ thể. Phải giữ mọi luật ở mục 3–10.

---
---

# PHẦN 2 — PROMPT TRIỂN KHAI

> Cách dùng: mở một phiên mới trong repo này, dán nguyên khối dưới đây.
> - Muốn làm Đợt 2: đổi dòng `ĐỢT CẦN LÀM` thành `Đợt 2`.
> - Mỗi lần chỉ giao một đợt.

````markdown
# Vai trò
Bạn là kỹ sư full-stack cấp cao, đang làm trên repo Gia Sư 10 Điểm. Repo gồm:
- **server:** Node/Express + SQLite (`server/`), chạy cả trên Cloudflare Worker (`worker/`);
- **app:** React + React Router + TypeScript (`app/src/`);
- **luồng tạo tin tự động:** n8n (`scripts/n8n/`).

Giao diện và thông báo lỗi viết bằng **tiếng Việt có dấu**. Code, tên biến, commit message viết bằng tiếng Anh.

# Nhiệm vụ
Triển khai mục Tin tức theo tài liệu thiết kế `docs/tin-tuc-thiet-ke.md`, **PHẦN 1**.
ĐỢT CẦN LÀM: **Đợt 1** (mục 11, bảng "Đợt 1 — Cốt lõi"). Không làm hạng mục của đợt khác.

# Đọc trước, theo thứ tự (chưa sửa gì khi chưa đọc xong)
1. `docs/tin-tuc-thiet-ke.md`: toàn bộ Phần 1. Đây là nguồn sự thật. Mâu thuẫn với code cũ thì làm theo tài liệu. Mâu thuẫn ngay trong tài liệu thì DỪNG và hỏi.
2. `docs/architecture.md` (mục news và community), `docs/tin-tuc-tu-dong-hoa.md`.
3. Code hiện tại:
   - server: `server/posts.js`, `server/db.js` (bảng posts và cách migration bằng PRAGMA), `server/seo.js`, `server/index.js` (chỗ gọi `renderSeo`), `worker/index.js`;
   - app: `app/src/pages/News.tsx`, `app/src/pages/AdminPosts.tsx`, `app/src/pages/Admin.tsx`, `app/src/lib/news-body.ts`, `app/src/lib/types.ts`, `app/src/lib/api.tsx`;
   - phần dùng lại từ Cộng đồng: `app/src/components/community/RichEditor.tsx`, `server/community-rich.js`, `server/community-images.js`, `server/community-schema.js`, `server/community-policy.js` (`fold`);
   - lọc gia sư: `app/src/pages/Tutors.tsx`;
   - n8n: `scripts/n8n/lib/*.js`, `scripts/n8n/build-workflow.js`, `scripts/n8n/README.md`;
   - test: `test/api.test.js` (đoạn test "news ..."), `test/seo.test.js`, `test/n8n-news.test.js`, `test/n8n-workflow.test.js`, `package.json` (scripts test).
4. Chạy `git status`. Nếu có thay đổi chưa commit không phải của bạn (đặc biệt `news-body.ts`, `scripts/n8n/lib/image.js`), DỪNG và báo chủ dự án. Không commit, stash hay xóa chúng.

# Cách làm
- Tạo branch mới từ `main` mới nhất: `git switch main && git pull && git switch -c feat/tin-tuc-hoan-thien`.
- Làm theo thứ tự hạng mục 1.1 → 1.9. Mỗi hạng mục:
  1. Viết test trước, chạy để thấy nó FAIL vì đúng lý do.
  2. Viết code tối thiểu cho test PASS.
  3. Chạy `npm run typecheck` và test liên quan.
  4. Commit riêng, message tiếng Anh kiểu `feat: ...` / `test: ...` / `docs: ...`.
- Theo đúng mẫu sẵn có của repo:
  - validation bằng zod (`server/validation.js`);
  - ghi DB trong `transaction(db, ...)`;
  - mỗi thao tác ghi của admin gọi `audit(...)`;
  - migration kiểm tra `PRAGMA table_info` trước khi `ALTER`;
  - UI dùng component trong `@/components/ui/*` và `@/components/common`;
  - CSS dùng biến màu có sẵn trong `app/src/styles.css`, không thêm thư viện UI mới.
- Dùng lại thay vì nhân bản:
  - cần prop mới cho `RichEditor` thì thêm prop, giữ hành vi cũ cho Cộng đồng;
  - danh sách chủ đề định nghĩa MỘT nơi, dùng chung cho server và app;
  - giao diện xem trước trong admin dùng CHÍNH component trang chi tiết công khai.
- Không thêm thư viện npm mới nếu repo đã có thứ tương đương (sanitize-html, TipTap, zod đã có).

# Ràng buộc không được vi phạm (kiểm tra lại trước khi báo xong)
1. Bài nháp không bao giờ lộ ở API công khai, sitemap, SEO, tin liên quan, tin ghim.
2. `body_html` chỉ được lưu sau khi sanitize ở server. Chỗ render bằng `dangerouslySetInnerHTML` phải có comment giải thích điều này.
3. Link cũ `/app/news/<id>` vẫn dẫn tới đúng bài (301 ở server, `Navigate replace` ở app).
4. Slug chốt ở lần đăng đầu, không đổi khi sửa tiêu đề.
5. n8n cũ, gửi body có dòng ảnh và dòng `Nguồn:`, vẫn tạo được bài đúng.
6. Không phá Cộng đồng: mọi test community phải vẫn pass.
7. `GET /api/posts` giữ dạng mảng (Worker dùng cho sitemap).

# Định nghĩa "xong"
- Mọi hạng mục Đợt 1 đạt cột "Xong khi" ở mục 11.
- `npm run typecheck` sạch, `npm test` pass hết. Dán phần tổng kết số test vào báo cáo.
- Đã thử tay trên trình duyệt theo mục 12 (chạy `npm run dev`). Có ảnh chụp trang danh sách và trang chi tiết trên khổ 375px và khổ desktop, cùng màn hình duyệt bài của admin.
- `docs/architecture.md` đã cập nhật.
- KHÔNG tự push, KHÔNG mở PR, KHÔNG merge khi chủ dự án chưa đồng ý.

# Khi nào phải dừng và hỏi
- Tài liệu thiết kế mâu thuẫn hoặc thiếu ở chỗ ảnh hưởng tới dữ liệu, bảo mật hay đường dẫn công khai.
- Cần đổi cấu trúc dữ liệu khác với mục 4.
- Có thay đổi chưa commit không phải của bạn.
- Test cũ fail mà không liên quan tới việc bạn làm.
Những chỗ nhỏ còn lại (tên component, chia file, chữ thông báo, CSS) thì tự quyết và ghi vào báo cáo.

# Báo cáo cuối (tiếng Việt, ngắn gọn)
1. Đã làm gì theo từng hạng mục 1.1–1.9, kèm commit tương ứng.
2. Kết quả typecheck và test (số liệu thật).
3. Ảnh chụp đã thử tay.
4. Các quyết định nhỏ bạn tự đưa ra.
5. Việc còn dở hoặc chưa kiểm chứng được (nói thẳng, không làm đẹp).
````
