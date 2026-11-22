#!/bin/zsh
# Cài (hoặc gỡ với --uninstall) dịch vụ launchd để n8n tự chạy khi đăng nhập máy.
# Dịch vụ dùng BẢN SAO của start-n8n.sh trong ~/.n8n để không hỏng khi đổi nhánh git.
set -e
LABEL="com.giasudiem10.n8n"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
COPY="$HOME/.n8n/news-start.sh"
DOMAIN="gui/$(id -u)"

if [ "$1" = "--uninstall" ]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$COPY"
  echo "Đã gỡ $LABEL"
  exit 0
fi

HERE="${0:A:h}"
mkdir -p "$HOME/.n8n" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp "$HERE/start-n8n.sh" "$COPY"
chmod +x "$COPY"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>$COPY</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/n8n-news.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/n8n-news.log</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Đã cài $LABEL. Log: ~/Library/Logs/n8n-news.log"
