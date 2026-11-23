# Admin xoá bài Cộng đồng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin xoá được bài đang ẩn; bài đã xoá tự mất hẳn sau 30 ngày; có khôi phục và xoá vĩnh viễn.

**Architecture:** Ba route mới trong `server/community-admin.js` (delete mềm, undelete, purge) và một hàm dọn lười chạy khi admin tải `/posts` hoặc `/summary`. UI thêm nút ở hai tab trong `AdminCommunity.tsx` dùng lại `ActionDialog`.

**Tech Stack:** Express + SQLite (`server/db.js` helpers `one/all/run/transaction`), React + TS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-admin-xoa-bai-cong-dong-design.md`

## Global Constraints

- Thời hạn giữ: 30 ngày, hằng số `PURGE_DAYS = 30` trong `server/community-admin.js`.
- Không notify/mail tác giả khi xoá.
- Chỉ bài `kind != 'rules'`.
- `getPost()` trả 404 cho bài `deleted` (kể cả admin), nên 3 route mới đọc thẳng bảng `community_posts`.
- Audit actions: `community.post.delete`, `community.post.undelete`, `community.post.purge`.

## Review Focus

- Xoá bài không ở trạng thái `hidden` → 409, bài không đổi.
- Purge/undelete bài không ở trạng thái `deleted` → 409 (không xoá nhầm bài đang đăng).
- Người không phải admin gọi 3 route → 403.
- Bài `deleted` đúng 29 ngày không bị dọn, 31 ngày thì bị dọn khi admin tải danh sách.
- Xoá vĩnh viễn kéo theo bình luận và báo cáo của bài, không để mồ côi.

---

### Task 1: Backend routes và dọn lười

**Files:**
- Modify: `server/community-admin.js` (thêm sau vòng `for (const action of [...])`, và gọi dọn trong `/summary`, `/posts`)
- Test: `test/community.test.js` (thêm test cuối file)

**Interfaces:**
- Produces: `POST /api/admin/community/posts/:id/delete`, `POST .../:id/undelete`, `DELETE /api/admin/community/posts/:id` → `{ ok: true }`; `/admin/community/posts?status=deleted` items có thêm `days_left: number`.

- [ ] **Step 1: Viết test `admin deletes hidden posts, undoes, purges, and expired posts clean up lazily`** trong `test/community.test.js`, dùng `fixture(t)` (`call, create, approve, db, ids`). Các assert: (a) xoá bài `approved` → 409; (b) hide rồi `delete` → 200, `status='deleted'`, `/community/posts/:id` công khai 404, không có notification/mail mới cho tác giả, có audit `community.post.delete`; (c) `student` gọi delete → 403; (d) `undelete` → bài về `hidden`; undelete bài đang `hidden` → 409; (e) xoá lại rồi `DELETE` → bài và comment của nó biến mất khỏi DB, có audit `community.post.purge`; `DELETE` bài `hidden` → 409; (f) bài `deleted` với `updated_at` = now-29 ngày vẫn còn sau khi admin gọi `/admin/community/posts?status=deleted` và có `days_left` là 1; đặt now-31 ngày thì biến mất sau lần gọi kế tiếp và có audit purge.
- [ ] **Step 2: Chạy `node --test --test-name-pattern="admin deletes hidden" test/community.test.js`**. Expected: FAIL (route 404).
- [ ] **Step 3: Implement** trong `server/community-admin.js`: `const PURGE_DAYS = 30`; hàm `purge(ids, actorId, auto)` xoá hàng trong `transaction` và ghi audit `community.post.purge` với `{ id, title, author_id, auto }`; hàm `purgeExpired(actorId)` chọn id có `status='deleted' AND kind!='rules' AND updated_at < datetime('now','-30 days')` rồi gọi `purge`; gọi `purgeExpired(req.user.id)` đầu `/summary` và `/posts`; trong `/posts` với `status==='deleted'` thêm `days_left = max(0, 30 - floor((now - updated_at UTC)/ngày))` vào mỗi item. Ba route đọc bài bằng `one(db,"SELECT * FROM community_posts WHERE id=?",id)` (404 qua `fail` nếu không có hoặc `kind='rules'`) và kiểm tra trạng thái như spec.
- [ ] **Step 4: Chạy lại test trên**. Expected: PASS. Chạy cả `node --test test/community.test.js` để chắc không hỏng test cũ.
- [ ] **Step 5: Commit** `feat(community): admin can delete hidden posts, restore, purge, 30-day cleanup`

### Task 2: Giao diện admin

**Files:**
- Modify: `app/src/pages/AdminCommunity.tsx` (khối `TabsContent value="posts"`), `app/src/lib/types.ts` (thêm `days_left?: number` cho kiểu của item bài admin), `app/src/components/admin-kit.tsx:85` (nhãn audit)

**Interfaces:**
- Consumes: ba route của Task 1 và `days_left`.

- [ ] **Step 1: Sửa UI.** Tab "Đã ẩn": thêm `<Button variant="outline">Xoá</Button>` mở `setAction({ title: "Xoá bài", path: .../delete, method: "POST" })` (hộp xác nhận không cần lý do). Tab "Đã xóa": dòng chú thích "Bài đã xóa tự mất sau 30 ngày", mỗi bài hiện `Còn {days_left} ngày`, nút "Khôi phục về Đã ẩn" (`POST .../undelete`) và nút "Xoá vĩnh viễn" (`DELETE /admin/community/posts/:id`, title "Xoá vĩnh viễn (không hoàn tác được)"). Thêm 3 nhãn audit vào `admin-kit.tsx`: "Xoá bài cộng đồng", "Khôi phục bài đã xoá", "Xoá vĩnh viễn bài cộng đồng".
- [ ] **Step 2: Chạy `npm run typecheck`**. Expected: không lỗi.
- [ ] **Step 3: Kiểm tra trong trình duyệt** (nếu dev server chạy được): tab Đã ẩn có nút Xoá; tab Đã xóa có đếm ngày và hai nút.
- [ ] **Step 4: Commit** `feat(community): admin delete buttons and 30-day notice`

### Task 3: Kiểm tra toàn bộ

- [ ] **Step 1: Chạy `npm test`**. Expected: tất cả PASS (ghi rõ nếu có test fail sẵn từ trước).
- [ ] **Step 2: Báo cáo** kết quả cho người dùng.
