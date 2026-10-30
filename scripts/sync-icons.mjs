// Chỉ có MỘT nguồn ảnh biểu tượng: build/icon.png (xuất từ build/icon.svg).
// Chép sang renderer/ để app dùng làm biểu tượng cửa sổ lúc chạy; bản đóng gói lấy ảnh trong build/.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'build', 'icon.png');
const dst = join(root, 'renderer', 'icon.png');

if (!existsSync(src)) {
  console.error('Thiếu build/icon.png — xuất từ build/icon.svg trước (xem README).');
  process.exit(1);
}
copyFileSync(src, dst);
console.log('• biểu tượng ->', dst);
