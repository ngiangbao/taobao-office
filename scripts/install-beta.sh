#!/usr/bin/env bash
# Dựng bản BETA từ mã nguồn hiện tại và cài lên máy này (Linux), TRƯỚC khi phát hành lên GitHub.
#   scripts/install-beta.sh            tăng beta.N, đóng gói và cài
#   scripts/install-beta.sh --office   dựng lại cả văn phòng 3D (khi đã sửa thư mục office/)
# Máy chỉ giữ bản beta mới nhất và đúng một bản beta trước đó để quay lại. Không bao giờ cài bản stable.
set -euo pipefail
cd "$(dirname "$0")/.."
REBUILD_OFFICE=0; for a in "$@"; do [ "$a" = "--office" ] && REBUILD_OFFICE=1; done
node scripts/bump-beta.mjs
V=$(node -p "require('./package.json').version")
[ "$REBUILD_OFFICE" = 1 ] && npm run prepare:office
[ -d office/.next ] || { echo "Chưa dựng văn phòng: chạy lại với --office"; exit 1; }
[ -d office/node_modules/next ] || { echo "Thiếu office/node_modules: chạy lại với --office"; exit 1; }
rm -rf dist
npx electron-builder --linux AppImage --publish never
SRC="dist/Taobao Office-$V.AppImage"
DEST="$HOME/.local/share/taobao-office"; mkdir -p "$DEST" "$HOME/.local/bin" "$HOME/.local/share/applications"
cp "$SRC" "$DEST/Taobao-Office.AppImage.new"; chmod +x "$DEST/Taobao-Office.AppImage.new"
cmp -s "$SRC" "$DEST/Taobao-Office.AppImage.new" || { echo "Bản sao không khớp, dừng."; rm -f "$DEST/Taobao-Office.AppImage.new"; exit 1; }
[ -f "$DEST/Taobao-Office.AppImage" ] && mv -f "$DEST/Taobao-Office.AppImage" "$DEST/Taobao-Office.AppImage.prev-beta"
mv -f "$DEST/Taobao-Office.AppImage.new" "$DEST/Taobao-Office.AppImage"
cat > "$HOME/.local/bin/taobao-office" <<'LAUNCH'
#!/bin/sh
# Chạy Taobao Office. APPIMAGE_EXTRACT_AND_RUN: máy chưa có libfuse2 vẫn chạy được AppImage.
export APPIMAGE_EXTRACT_AND_RUN=1
exec "$HOME/.local/share/taobao-office/Taobao-Office.AppImage" --ozone-platform=wayland "$@"
LAUNCH
chmod +x "$HOME/.local/bin/taobao-office"
cat > "$HOME/.local/share/applications/taobao-office.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Taobao Office (beta)
Comment=Trợ lý order Taobao: đội agent Claude và văn phòng 3D
Exec=$HOME/.local/bin/taobao-office
Terminal=false
Categories=Office;
StartupWMClass=taobao-office
DESK
echo "Đã cài $V. Đóng hẳn app đang mở rồi mở lại để dùng bản mới."
