# Kết quả thử `claude -p` chạy ngầm (Task 1)

Ngày: 2026-11-22. Kết luận: **dùng được bằng gói Pro, không tốn thêm tiền.** Cổng quyết định của kế hoạch đã qua.

## Đã kiểm chứng

- `claude auth status` sau khi đăng nhập lại: `loggedIn: true`, `authMethod: claude.ai`, `subscriptionType: pro`. Không cần khoá API.
- Chạy trong môi trường tối thiểu giống launchd (`env -i HOME USER LOGNAME PATH=/opt/homebrew/bin:/usr/bin:/bin`) vẫn dùng đúng đăng nhập Pro, thoát mã 0, mất khoảng 7–9 giây một bài.
- Lệnh đã dùng (đưa vào ô Execute Command ở Task 4):

```
claude -p "<prompt>" --tools WebFetch --allowedTools WebFetch --output-format json --no-session-persistence --max-turns 4 --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands --setting-sources project
```

- Chỉ cho đọc web: `--tools WebFetch --allowedTools WebFetch`. Claude đọc được trang bài thật của VnExpress và tóm tắt đúng.
- Đầu ra thành công: **một đối tượng JSON** có `is_error: false`, `result` là chuỗi chữ Claude trả lời (ở đây là JSON của chúng ta), kèm `usage`, `total_cost_usd`, `num_turns`.
- Đầu ra khi lỗi đăng nhập: thoát mã **1**, vẫn in một đối tượng JSON có `is_error: true` và `result` là thông báo lỗi (ví dụ `Failed to authenticate: OAuth session expired and could not be refreshed`). `parseClaudeOutput` phải trả `null` trong trường hợp này.

## Phát hiện quan trọng về hạn mức

Không thu gọn thì mỗi lần gọi nạp **khoảng 302.000 token** (toàn bộ connector MCP, skill và plugin trong cấu hình của bạn), tương đương khoảng 1,2 USD tính theo giá niêm yết. Với gói Pro, đó là hạn mức bị tiêu rất nhanh.

Thêm ba cờ `--strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands --setting-sources project` thì mỗi lần gọi chỉ còn **khoảng 1.000 token** (khoảng 0,013 USD niêm yết). **Bắt buộc dùng các cờ này.** Một system prompt riêng không giúp thêm.

## Lưu ý

- Phiên đăng nhập của lệnh `claude` ban đầu đã hết hạn và không tự gia hạn được; phải chạy `claude auth login` một lần. Nếu sau này hết hạn lại, workflow sẽ báo lỗi và **không đánh dấu tin đã xử lý**, nên không mất tin, chỉ cần đăng nhập lại.
- Với link trang không tồn tại, Claude vẫn trả đúng yêu cầu thay vì báo lỗi, nên không thể tin vào việc Claude "tự phát hiện trang hỏng". Bước kiểm tra bài (Task 3) phải dựa vào nội dung trả về, không dựa vào cờ lỗi.
