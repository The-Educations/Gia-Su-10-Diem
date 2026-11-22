#!/bin/zsh
# Khởi động n8n cục bộ cho workflow "Tin tức tự động".
# Chỉ nghe trên máy này (127.0.0.1) và bật node Execute Command (n8n 2.x tắt sẵn node này).
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin"
export N8N_LISTEN_ADDRESS=127.0.0.1
export N8N_PORT=5678
export NODES_EXCLUDE='[]'
export N8N_DIAGNOSTICS_ENABLED=false
export N8N_VERSION_NOTIFICATIONS_ENABLED=false
export N8N_PERSONALIZATION_ENABLED=false

# Ưu tiên bản n8n đã có trong cache npx (đang dùng 2.48.7); nếu không có thì để npx tải.
BIN=$(ls -d "$HOME"/.npm/_npx/*/node_modules/.bin/n8n 2>/dev/null | head -1)
if [ -n "$BIN" ]; then
  exec "$BIN" start
fi
exec npx --yes n8n start
