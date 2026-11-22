# Tin tức tự động bằng n8n

Tự lấy tin giáo dục từ 4 trang báo, nhờ Claude viết lại, rồi tạo **bài nháp** trong Admin → Tin tức. Thiết kế: [docs/tin-tuc-tu-dong-hoa.md](../../docs/tin-tuc-tu-dong-hoa.md). Kế hoạch: [docs/superpowers/plans/2026-11-22-tin-tuc-tu-dong-hoa.md](../../docs/superpowers/plans/2026-11-22-tin-tuc-tu-dong-hoa.md).

## Có gì ở đây

| File | Việc |
| --- | --- |
| `lib/select.js`, `lib/draft.js`, `lib/web.js` | Các hàm logic thuần (chọn tin, kiểm tra bài, gói đăng), có test ở `test/n8n-news.test.js` |
| `build-workflow.js` | Sinh `news-workflow.json` từ các hàm trên: `node scripts/n8n/build-workflow.js` |
| `news-workflow.json` | Workflow để nhập vào n8n (không chứa mật khẩu) |
| `start-n8n.sh` | Chạy n8n chỉ nghe trên `127.0.0.1:5678`, bật node Execute Command |
| `install-launchd.sh` | Cho n8n tự chạy khi đăng nhập máy (`--uninstall` để gỡ) |

Phiên bản đã dùng: n8n **2.48.7** (cache `npx`), Node 24 (`brew node@24`).

## Sơ đồ

`Hẹn giờ (3 giờ)` → `Cài đặt` → `Đọc trạng thái` → `Danh sách nguồn` → `Đọc RSS` → `Chọn tin mới` → `Đăng nhập web` → `Lấy cookie` → `Claude viết bài` → `Kiểm tra bài` → `Ghi nhận kiểm tra` → `Lưu trạng thái 1` → `Bài sẵn sàng` → `Tạo bài nháp` → `Tổng kết` → `Lưu trạng thái 2`. Ô `Chạy tay` nối vào `Cài đặt` để bấm chạy thử.

Đăng nhập nằm TRƯỚC bước Claude: login hỏng thì dừng ngay, không tốn lượt Claude nào.

Quy tắc: bài luôn là nháp (`published: false`); tối đa 5 tin mỗi lần, 10 bài nháp mỗi ngày (giờ Việt Nam); lần chạy đầu chỉ lấy 5 tin mới nhất; lỗi đăng nhập hoặc lỗi Claude thì tin **không** bị đánh dấu nên lần sau thử lại.

## Chạy thật lần đầu (web thật)

1. **Tạo tài khoản bot** (việc của chủ web): đăng ký trên web bằng một email nhận được mã xác nhận (không dùng email admin chính, vì email đó bắt buộc đăng nhập Google), nhập mã xác nhận, rồi dùng admin chính vào **Quản trị → Tài khoản → Cấp quyền quản trị** để nâng quyền.
2. Mở n8n (`http://localhost:5678`) → **Credentials** → mở credential **News Bot Login** (kiểu Custom Auth) → đặt JSON thành `{ "body": { "email": "<email bot>", "password": "<mật khẩu bot>" } }`. Mật khẩu chỉ nằm ở đây.
3. Mở workflow **Tin tức tự động** → ô **Cài đặt** → đổi `baseUrl` thành `https://giasudiem10.online`, đặt tạm `perRun` = 1.
4. Xoá file trạng thái để chạy sạch: `rm ~/.n8n/news-state.json`. Bấm **Execute workflow**. Kết quả mong đợi: đúng một bài nháp ở Admin → Tin tức, chưa hiện ở `/news`. Web không có chức năng xoá bài tin tức, nên bài này cứ để nháp hoặc đăng nếu hợp lý.
5. Trả `perRun` về 5, rồi bật workflow (công tắc **Active**) để lịch 3 giờ hoạt động.

## Danh sách tự kiểm tra

- [ ] `curl http://127.0.0.1:5678/healthz` trả `{"status":"ok"}`.
- [ ] Máy khác trong mạng không mở được `http://<IP-máy>:5678` (n8n chỉ nghe 127.0.0.1).
- [ ] `launchctl print gui/$(id -u)/com.giasudiem10.n8n` báo `state = running`.
- [ ] `claude auth status` báo `loggedIn: true` với gói Pro.
- [ ] Workflow ở trạng thái **Active** và lần chạy gần nhất không lỗi (n8n → Executions).
- [ ] Ô Cài đặt có `baseUrl` đúng (web thật), `perRun` = 5, `perDay` = 10.

## Khi có lỗi

- **Bài nháp không xuất hiện, execution lỗi ở `Đăng nhập web`**: mật khẩu bot sai hoặc tài khoản chưa được nâng quyền admin. Tin chưa bị đánh dấu nên lần sau tự thử lại.
- **Execution lỗi ở `Claude viết bài` hoặc bài toàn `error`**: thường là phiên đăng nhập `claude` hết hạn. Chạy `claude auth login` trong Terminal.
- **`invalid syntax` ở ô Execute Command**: biểu thức có chuỗi `}}` bên trong. Giữ `{"mcpServers":{} }` có khoảng trắng.
- **Báo "Đang có lần chạy khác…" ở ô Danh sách nguồn**: workflow dùng khoá `~/.n8n/news.lock` để hai lần chạy không đăng trùng bài (web không xoá được bài tin tức). Nếu một lần chạy bị dừng giữa chừng (ví dụ login hỏng) khoá tự gỡ sau 2 giờ; muốn chạy ngay thì `rmdir ~/.n8n/news.lock`. Mỗi lần gọi `claude` có giới hạn 5 phút.
- **Muốn chạy lại từ đầu**: xoá `~/.n8n/news-state.json` (lần sau sẽ coi là lần chạy đầu: chỉ lấy 5 tin mới nhất).
- **Xem log n8n**: `~/Library/Logs/n8n-news.log`.
- **Chạy thử bằng dòng lệnh khi n8n đang chạy**: đặt thêm `N8N_RUNNERS_BROKER_PORT=5680` để không đụng cổng của n8n đang chạy, rồi `n8n execute --id=<id workflow>`.
