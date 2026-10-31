// Thư mục ẢNH SẢN PHẨM dùng chung: <dữ liệu>/anh-san-pham. Các agent bị giới hạn trong thư mục riêng (kho hàng, người đăng...) vẫn đọc được
// nơi này (--add-dir) và Người đăng được tải ảnh từ đây lên Facebook. Agent khách hàng KHÔNG được cấp quyền.
const fs = require('node:fs');
const path = require('node:path');

const IMG = /\.(jpe?g|png|gif|webp)$/i;
const dirOf = (dataDir) => path.join(dataDir, 'anh-san-pham');

/** Chép một ảnh vào thư mục chung (thư mục con tuỳ chọn); chỉ chép khi khác kích thước. Trả đường dẫn đầy đủ hoặc '' nếu không chép được. */
function share(dataDir, file, sub = '') {
  try {
    if (!IMG.test(file)) return '';
    const to = path.join(dirOf(dataDir), ...(sub ? [sub] : []));
    fs.mkdirSync(to, { recursive: true });
    const dest = path.join(to, path.basename(file));
    let same = false; try { same = fs.statSync(dest).size === fs.statSync(file).size; } catch { /* chưa có */ }
    if (!same) fs.copyFileSync(file, dest);
    return dest;
  } catch { return ''; }
}

/** Chép cả thư mục ảnh kho vào anh-san-pham/kho (đã có thì bỏ qua). */
function mirror(dataDir, srcDir, sub = 'kho') {
  let n = 0;
  try { for (const f of fs.readdirSync(srcDir)) if (share(dataDir, path.join(srcDir, f), sub)) n++; } catch { /* chưa có ảnh */ }
  return n;
}

module.exports = { dirOf, share, mirror, IMG };
