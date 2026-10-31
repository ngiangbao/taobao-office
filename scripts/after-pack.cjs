// electron-builder không chép node_modules khi gói tài nguyên thêm (extraResources): chép tay thư mục của văn phòng.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
exports.default = async function afterPack(ctx) {
  const res = ctx.electronPlatformName === 'darwin'
    ? path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(ctx.appOutDir, 'resources');
  const from = path.join(ctx.packager.projectDir, 'office', 'node_modules');
  const to = path.join(res, 'office', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('Thiếu office/node_modules: chạy `npm run prepare:office` trước.');
  fs.cpSync(from, to, { recursive: true, dereference: false, filter: (s) => !s.includes(`${path.sep}.cache${path.sep}`) });
  console.log('  • đã chép node_modules của văn phòng ->', to);
  if (ctx.electronPlatformName === 'darwin') {
    // Chép thêm tệp vào .app làm hỏng chữ ký sẵn có của Electron; macOS (nhất là chip Apple) khi đó báo "đã hỏng" và KHÔNG hiện nút
    // "Vẫn mở" trong Quyền riêng tư & Bảo mật. Ký ad-hoc (không cần tài khoản Apple Developer) để app ít nhất hợp lệ về chữ ký.
    const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
    console.log('  • đã ký ad-hoc ->', app);
  }
};
