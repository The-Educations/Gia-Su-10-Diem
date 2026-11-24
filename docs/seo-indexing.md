# SEO indexing — Google Search Console handoff

Domain: `giasudiem10.online`. Server-side metadata comes from `server/seo.js`
(`pageSeo`/`renderSeo`), the page list from `shared/seo-pages.json`, the sitemap
from `server/index.js` `/sitemap.xml`.

## a) URL cần submit trong Google Search Console

Mẫu đã vào `sitemap.xml` (crawler tự tìm); Request Indexing chỉ cần cho trang mẹ:

| URL | Lý do |
| --- | --- |
| `https://giasudiem10.online/` | Trang chủ — index, JSON-LD WebSite + Organization + SearchAction |
| `https://giasudiem10.online/app/tutors` | Danh sách gia sư — index; mỗi hồ sơ live được crawl qua `<noscript>` + sitemap |
| `https://giasudiem10.online/app/tutors/{id}` | Từng gia sư ĐÃ duyệt (live) — index, Person/ProfilePage schema |
| `https://giasudiem10.online/app/library` | Catalog môn học — index |
| `https://giasudiem10.online/app/news` | Danh sách bài — index |
| `https://giasudiem10.online/app/news/{id}-{slug}` | Từng bài published — index, NewsArticle + BreadcrumbList |
| `https://giasudiem10.online/app/community` | Diễn đàn — index |
| `https://giasudiem10.online/app/community/{id}` | Từng bài cộng đồng approved — index, DiscussionForumPosting |
| `https://giasudiem10.online/privacy` | Trang pháp lý — index |
| `https://giasudiem10.online/terms` | Trang pháp lý — index |

## b) KHÔNG index (giữ noindex/Disallow — đúng kỳ vọng)

- `api/*` — mọi endpoint (robots `Disallow: /api/` + `X-Robots-Tag: noindex, nofollow`).
- `/app/auth`, `/app/forgot-password`, `/app/reset-password`, `/app/verify-email`, `/app/onboarding`.
- `/app` (trang chủ app, redirect về `/`), `/app/workspace`, `/app/bookings`, `/app/calendar`,
  `/app/offers`, `/app/proposals`, `/app/wallet`, `/app/schedule`, `/app/family`, `/app/classes`,
  `/app/classes/{id}`, `/app/messages`, `/app/settings`, `/app/availability`, `/app/studio`,
  `/app/sessions`, `/app/admin`, `/app/favorites`, `/app/community/write`, `/app/community/mine`.
- `/app/community/members/{code}` — hồ sơ thành viên (noindex, không schema).
- `/app/tutors/{id}` khi gia sư chưa live / không tồn tại — noindex mềm (page vẫn 200 cho SPA).

## c) Các bước trên Google Search Console

1. Thêm property **Domain** `giasudiem10.online` → xác minh bản ghi DNS TXT.
2. Submit `https://giasudiem10.online/sitemap.xml`.
3. URL Inspection → **Request indexing** cho từng trang mẹ trong bảng (a): `/`,
   `/app/tutors`, `/app/library`, `/app/news`, `/app/community`, `/privacy`, `/terms`
   — trang con để crawler tự đi qua `<noscript>` + sitemap.
4. Theo dõi **Pages** (Coverage): chờ các URL ở mục (a) vào "Indexed", các URL ở mục
   (b) vào "Excluded — noindex" (đúng, không phải lỗi).
5. Kiểm tra JSON-LD bằng **Rich Results Test**: `/` (WebSite+Organization),
   một hồ sơ gia sư (ProfilePage/Person), một bài news (NewsArticle + BreadcrumbList),
   một bài community (DiscussionForumPosting + BreadcrumbList).

## d) Checklist sau mỗi lần deploy

- [ ] `curl -s https://giasudiem10.online/robots.txt` — thấy `Disallow: /api/` + các route riêng tư + `Sitemap:`.
- [ ] `curl -s https://giasudiem10.online/sitemap.xml | grep -c '<loc>'` — ≥ 7 + bài news/community + gia sư live.
- [ ] `curl -sI https://giasudiem10.online/app/tutors` — `x-robots-tag: index` và status 200.
- [ ] `curl -sI https://giasudiem10.online/app/admin` — `x-robots-tag: noindex`.
- [ ] `curl -sI https://giasudiem10.online/api/health` — `x-robots-tag: noindex, nofollow`.
- [ ] `curl -s https://giasudiem10.online/app/tutors/{id-live}` — title `Gia sư …`, canonical tới đúng URL, script ProfilePage.
- [ ] Chạy `node test/seo.test.js test/seo-tutor.test.js` trước khi merge thay đổi liên quan meta/sitemap.
- [ ] Rich Results Test một mẫu của từng loại schema khi đổi `renderSeo`.
