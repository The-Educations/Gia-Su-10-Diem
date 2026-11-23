# Tin tức tự động bằng n8n

Tự lấy tin giáo dục từ 4 trang báo, nhờ Claude viết lại, rồi tạo **bài nháp** trong Admin → Tin tức. Thiết kế: [docs/tin-tuc-tu-dong-hoa.md](../../docs/tin-tuc-tu-dong-hoa.md). Kế hoạch: [docs/superpowers/plans/2026-11-22-tin-tuc-tu-dong-hoa.md](../../docs/superpowers/plans/2026-11-22-tin-tuc-tu-dong-hoa.md).

## Có gì ở đây

| File | Việc |
| --- | --- |
| `lib/select.js`, `lib/topic.js`, `lib/draft.js`, `lib/web.js` | Các hàm logic thuần (chọn tin, lọc chủ đề, kiểm tra bài, gói đăng), có test ở `test/n8n-news.test.js` |
| `build-workflow.js` | Sinh `news-workflow.json` từ các hàm trên: `node scripts/n8n/build-workflow.js` |
| `news-workflow.json` | Workflow để nhập vào n8n (không chứa mật khẩu) |
| `start-n8n.sh` | Chạy n8n chỉ nghe trên `127.0.0.1:5678`, bật node Execute Command |
| `install-launchd.sh` | Cho n8n tự chạy khi đăng nhập máy (`--uninstall` để gỡ) |

Phiên bản đã dùng: n8n **2.48.7** (cache `npx`), Node 24 (`brew node@24`).

## Sơ đồ

`Hẹn giờ (3 giờ)` → `Cài đặt` → `Đọc trạng thái` → `Danh sách nguồn` → `Đọc RSS` → `Chọn tin mới` → `Đăng nhập web` → `Lấy cookie` → `Claude viết bài` → `Kiểm tra bài` → `Ghi nhận kiểm tra` → `Lưu trạng thái 1` → `Bài sẵn sàng` → `Tạo bài nháp` → `Tổng kết` → `Lưu trạng thái 2`. Ô `Chạy tay` nối vào `Cài đặt` để bấm chạy thử.

## Chỉ nhận tin đúng chủ đề

Mục Tin tức chỉ cần: tuyển sinh và thi cử, chính sách/quy định cho học sinh - sinh viên - phụ huynh (học phí, học bổng, chương trình, dạy thêm...), thông tin học tập (ôn thi, chứng chỉ, chọn ngành, du học). Hai lớp lọc:

1. **Bộ lọc từ khoá** (`lib/topic.js`, ô `Chọn tin mới`, miễn phí): loại tin 20/11, chuyện người thầy, sự cố/vụ việc, thời sự ngoài giáo dục; chỉ giữ tin chạm một chủ đề trên. Hai mục `tuyen-sinh` của Tuổi Trẻ và Thanh Niên đứng đầu danh sách nguồn vì đúng chủ đề nhất.
2. **Claude là cửa kiểm cuối**: prompt (`buildPrompt`) liệt kê nhóm được nhận và nhóm phải bỏ, không chắc thì trả `skip`. Tin bị bỏ qua vẫn được đánh dấu đã xem nên không bị xét lại.

Muốn siết hoặc nới: sửa hai biểu thức `blockTitle`, `blockAny`, `allow` trong `lib/topic.js` (không cần dấu, viết thường) và danh sách nhóm trong `buildPrompt`, rồi `node scripts/n8n/build-workflow.js` và nhập lại vào n8n. Test ở `test/n8n-news.test.js` dùng tiêu đề báo thật.

Đăng nhập nằm TRƯỚC bước Claude: login hỏng thì dừng ngay, không tốn lượt Claude nào.

Mỗi bài gửi lên web theo trường có cấu trúc: `topic` (Claude chọn `admissions`/`policy`/`study`, thiếu hoặc sai thì gán `study`), `origin: "auto"` (vào tab **Chờ duyệt**), `cover_url/cover_alt/cover_credit`, `source_name/source_url`; `body` chỉ còn chữ bài, không còn dòng ảnh hay dòng `Nguồn:` (web vẫn nhận kiểu cũ và tự tách). Quy tắc: bài luôn là nháp (`published: false`); tối đa 5 tin mỗi lần, 10 bài nháp mỗi ngày (giờ Việt Nam); lần chạy đầu chỉ lấy 5 tin mới nhất; lỗi đăng nhập hoặc lỗi Claude thì tin **không** bị đánh dấu nên lần sau thử lại.

## Chạy thật lần đầu (web thật)

1. **Tạo tài khoản bot** (việc của chủ web): đăng ký trên web bằng một email nhận được mã xác nhận (không dùng email admin chính, vì email đó bắt buộc đăng nhập Google), nhập mã xác nhận, rồi dùng admin chính vào **Quản trị → Tài khoản → Cấp quyền quản trị** để nâng quyền.
2. Mở n8n (`http://localhost:5678`) → **Credentials** → mở credential **News Bot Login** (kiểu Custom Auth) → đặt JSON thành `{ "body": { "email": "<email bot>", "password": "<mật khẩu bot>" } }`. Mật khẩu chỉ nằm ở đây.
3. Mở workflow **Tin tức tự động** → ô **Cài đặt** → đổi `baseUrl` thành `https://giasudiem10.online`, đặt tạm `perRun` = 1.
4. Xoá file trạng thái để chạy sạch: `rm ~/.n8n/news-state.json`. Bấm **Execute workflow**. Kết quả mong đợi: đúng một bài ở Admin → Tin tức → **Chờ duyệt**, chưa hiện ở `/news`. Duyệt & đăng hoặc xoá bài thử ngay trong Admin.
5. Trả `perRun` về 5, rồi bật workflow để lịch 3 giờ hoạt động (n8n 2.x: nút **Publish** ở góc trên bên phải; bản cũ hơn là công tắc **Active**).

## Danh sách tự kiểm tra

- [ ] `curl http://127.0.0.1:5678/healthz` trả `{"status":"ok"}`.
- [ ] Máy khác trong mạng không mở được `http://<IP-máy>:5678` (n8n chỉ nghe 127.0.0.1).
- [ ] `launchctl print gui/$(id -u)/com.giasudiem10.n8n` báo `state = running`.
- [ ] `claude auth status` báo `loggedIn: true` với gói Pro.
- [ ] Workflow đã **Publish** (đang hoạt động) và lần chạy gần nhất không lỗi (n8n → Executions).
- [ ] Ô Cài đặt có `baseUrl` đúng (web thật), `perRun` = 5, `perDay` = 10.

## Khi có lỗi

- **Bài nháp không xuất hiện, execution lỗi ở `Đăng nhập web`**: mật khẩu bot sai hoặc tài khoản chưa được nâng quyền admin. Tin chưa bị đánh dấu nên lần sau tự thử lại.
- **Execution lỗi ở `Claude viết bài` hoặc bài toàn `error`**: thường là phiên đăng nhập `claude` hết hạn. Chạy `claude auth login` trong Terminal.
- **`invalid syntax` ở ô Execute Command**: biểu thức có chuỗi `}}` bên trong. Giữ `{"mcpServers":{} }` có khoảng trắng.
- **Báo "Đang có lần chạy khác…" ở ô Danh sách nguồn**: workflow dùng khoá `~/.n8n/news.lock` để hai lần chạy không đăng trùng bài (web không xoá được bài tin tức). Nếu một lần chạy bị dừng giữa chừng (ví dụ login hỏng) khoá tự gỡ sau 2 giờ; muốn chạy ngay thì `rmdir ~/.n8n/news.lock`. Mỗi lần gọi `claude` có giới hạn 5 phút.
- **Muốn chạy lại từ đầu**: xoá `~/.n8n/news-state.json` (lần sau sẽ coi là lần chạy đầu: chỉ lấy 5 tin mới nhất).
- **Xem log n8n**: `~/Library/Logs/n8n-news.log`.
- **Chạy thử bằng dòng lệnh khi n8n đang chạy**: đặt thêm `N8N_RUNNERS_BROKER_PORT=5680` để không đụng cổng của n8n đang chạy, rồi `n8n execute --id=<id workflow>`.

---

# Kiểm duyệt Cộng đồng bằng AI (workflow thứ hai)

Mỗi 5 phút, workflow **Kiểm duyệt Cộng đồng** lấy hàng đợi bài chờ duyệt (bài mới và bản sửa), nhờ Claude Haiku chấm theo bộ tiêu chí, rồi tự duyệt / tự từ chối những bài rõ ràng; bài không chắc để admin. Thiết kế: [docs/superpowers/specs/2026-11-23-kiem-duyet-cong-dong-ai-design.md](../../docs/superpowers/specs/2026-11-23-kiem-duyet-cong-dong-ai-design.md). Không sửa code web, không tốn phí ngoài gói Claude Pro. Máy tắt thì bài nằm trong hàng đợi, admin duyệt tay như cũ.

| File | Việc |
| --- | --- |
| `lib/moderation.js` | Logic thuần: chọn bài, dựng prompt, đọc kết quả, quyết định cuối, trạng thái. Test: `test/n8n-moderation.test.js` |
| `moderation-rubric.md` | **Bộ tiêu chí** gửi cho Claude (nhóm vi phạm, vùng xám phải chuyển admin, tiêu chí theo chủ đề, ví dụ). Sửa ở đây rồi sinh lại workflow |
| `build-moderation-workflow.js` | Sinh `moderation-workflow.json`: `node scripts/n8n/build-moderation-workflow.js` |
| `moderation-workflow.json` | Workflow để nhập vào n8n (không chứa mật khẩu) |
| `moderation-samples.json`, `moderation-trial.js` | Bộ bài mẫu và script chạy thử **thật** qua Claude: `node scripts/n8n/moderation-trial.js` |

Test chạy cả chuỗi như n8n (ô Code thật, lệnh shell thật với `claude` giả, API web thật qua fixture): `test/n8n-moderation-workflow.test.js`.

## Sơ đồ

`Hẹn giờ (5 phút)` → `Cài đặt` → `Đọc trạng thái` (lấy khoá) → `Kiểm tra khoá` → `Đăng nhập web` → `Lấy cookie` → `Lấy hàng đợi` → `Chọn bài chấm` → `Claude chấm` → `Quyết định` → `Lưu trạng thái 1` → `Việc cần làm` → `Thực hiện` → `Tổng kết` → `Lưu trạng thái 2`. Ô `Chạy tay` nối vào `Cài đặt`.

## Cách hoạt động, và các chốt an toàn

- **Ba kết quả** từ Claude: `approve`, `reject` (chỉ khi vi phạm rõ: `off_topic`, `advertising`, `insult`, `contact`), `escalate`. Quyết định cuối do mã quyết (`decideModeration`), Claude chỉ gợi ý. Kết quả hỏng, thiếu trường hoặc mâu thuẫn thì **không làm gì** và thử lại lần sau (sau 3 lần lỗi: chuyển admin "AI lỗi").
- **Không gửi Claude**, chuyển thẳng admin: bài có ảnh, bài nghi cài lệnh ("bỏ qua quy tắc", "ignore…", "duyệt bài này"…). Claude cũng được dặn: nội dung bài là dữ liệu, không phải chỉ dẫn.
- **Chỉ gửi** chủ đề, tiêu đề, nội dung chữ thuần và địa chỉ các link. Không gửi họ tên, email, mã người dùng (có test).
- **Chế độ** ở ô `Cài đặt` → `mode`: `shadow` (mặc định: chỉ ghi nhật ký), `approve_only` (tự duyệt), `full` (tự duyệt và tự từ chối). Giá trị lạ coi là `shadow`.
- **Trần mỗi ngày** (giờ Việt Nam): `capApprove` 40, `capReject` 15; vượt thì để admin.
- Hai bài liên tiếp lỗi trong một lượt thì **dừng cả lượt** (thường là hết hạn mức hoặc mất đăng nhập `claude`).
- **Luật cứng chạy song song với AI** (`riskSignals`): thấy số điện thoại, email, Zalo/Facebook/Telegram, lời mời học "chui"/"không qua web"/nhắn riêng, link rút gọn hoặc lời quảng cáo thì bài KHÔNG bao giờ được tự duyệt, dù AI trả approve: chuyển admin kèm lý do trong nhật ký. Luật này chỉ chặn duyệt, không bao giờ tự từ chối, nên không làm mất bài tốt.
- Tác giả vừa sửa bài hoặc admin vừa xử lý bài thì web trả 409: bỏ qua, bài được chấm lại ở lần sau. Nhật ký ghi thêm `webMessage` (ví dụ "Bài không còn chờ duyệt") để biết lý do.
- Lý do từ chối gửi tác giả = **câu mẫu cố định** của nhóm + một câu của Claude đã làm sạch (bỏ link, email, ký tự lạ, cắt 200 ký tự) + "Bạn có thể sửa bài rồi gửi lại.".
- Lỗi đăng nhập hoặc lấy hàng đợi: workflow **nhả khoá rồi mới báo lỗi đỏ** với lý do rõ ràng; lần sau tự thử lại.

## Tệp trên máy

| Tệp | Nội dung |
| --- | --- |
| `~/.n8n/moderation-state.json` | Khoá `id:review_version` đã chấm (giữ 30 ngày), bộ đếm lỗi, bộ đếm ngày. Không có cookie hay nội dung bài |
| `~/.n8n/moderation-log.jsonl` | Mỗi dòng: thời điểm, id, bài mới/bản sửa, tiêu đề, kết quả AI, quyết định cuối, đã thực hiện hay chưa. Đây là chỗ xem AI đã làm gì và so sánh trong giai đoạn `shadow` |
| `~/.n8n/moderation.lock` | Khoá chống chạy chồng (tự gỡ sau 30 phút nếu treo; muốn chạy ngay: `rmdir ~/.n8n/moderation.lock`) |

## Việc của chủ web trước khi chạy thật

1. **Tạo tài khoản bot kiểm duyệt riêng** (không dùng chung bot Tin tức, để nhật ký `audit` của web phân biệt được việc nào do AI làm): đăng ký bằng một email nhận được mã xác nhận, rồi admin chính vào **Quản trị → Tài khoản → Cấp quyền quản trị**.
2. Trong n8n → **Credentials** → tạo credential **Moderation Bot Login** (kiểu Custom Auth) với JSON `{ "body": { "email": "<email bot>", "password": "<mật khẩu bot>" } }`. Mật khẩu chỉ nằm ở đây.
3. Nhập `moderation-workflow.json` vào n8n, mở ô **Cài đặt**, đổi `baseUrl` thành `https://giasudiem10.online`. Giữ `mode = shadow`.
4. **Duyệt bộ tiêu chí** `moderation-rubric.md` và bốn **câu mẫu lý do từ chối** (trong `decideModeration`, `lib/moderation.js`). Hai mục **chưa được chủ web chốt**, hiện đặt mặc định thận trọng: ranh giới quảng cáo của chủ đề *Gia sư tìm lớp* và bài *Hỏi bài* chỉ dán đề (cả hai đang chuyển admin, không tự từ chối).
5. Trong cài đặt quyền riêng tư của tài khoản Claude, kiểm tra dữ liệu **không** được dùng để huấn luyện mô hình (nội dung bài của học sinh đi qua tài khoản này).
6. **Publish** workflow (n8n 2.x: nút Publish góc trên bên phải).

## Bật dần

1. `shadow` khoảng 2 tuần hoặc ít nhất 30 bài. Admin vẫn duyệt tay; so `moderation-log.jsonl` (cột `decision` = `shadow:approve` / `shadow:reject` / `shadow:escalate`) với quyết định thật của admin.
2. `approve_only` khi không có bài nào AI định duyệt mà admin từ chối.
3. `full` khi các lý do từ chối AI đưa ra đều hợp lý.

Đổi chế độ chỉ cần sửa `mode` ở ô Cài đặt: bài chấm ở `shadow` sẽ được chấm lại khi chuyển sang chế độ thật.

## Khi có lỗi

- **Execution đỏ ở `Việc cần làm`, nói "Đăng nhập web không được"**: mật khẩu bot sai hoặc credential chưa tạo. **"Không lấy được hàng đợi"**: tài khoản bot chưa được nâng quyền admin. Khoá đã được nhả nên lần sau tự thử lại. Lưu ý giới hạn đăng nhập 30 lần / 15 phút / IP dùng chung với workflow Tin tức.
- **Bài nằm mãi trong hàng đợi, nhật ký có `error`**: thường là phiên `claude` hết hạn (`claude auth login`) hoặc hết hạn mức Pro. Sau 3 lần lỗi bài được chuyển admin (`chuyển admin: AI lỗi`).
- **Chạy thử bộ bài mẫu bằng Claude thật** (sau khi sửa bộ tiêu chí): `node scripts/n8n/moderation-trial.js` (mỗi bài một lần gọi Haiku; `--only 3` để chạy riêng một bài, `--repeat 3` để lặp lại).
- **Muốn chấm lại mọi bài**: xoá `~/.n8n/moderation-state.json`.
