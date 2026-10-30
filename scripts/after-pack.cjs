// electron-builder không chép node_modules khi gói tài nguyên thêm (extraResources): chép tay thư mục của văn phòng.
const fs = require('node:fs');
const path = require('node:path');
exports.default = async function afterPack(ctx) {
  const res = ctx.electronPlatformName === 'darwin'
    ? path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(ctx.appOutDir, 'resources');
  const from = path.join(ctx.packager.projectDir, 'office', 'node_modules');
  const to = path.join(res, 'office', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('Thiếu office/node_modules: chạy `npm run prepare:office` trước.');
  fs.cpSync(from, to, { recursive: true, dereference: false, filter: (s) => !s.includes(`${path.sep}.cache${path.sep}`) });
  console.log('  • đã chép node_modules của văn phòng ->', to);
};
