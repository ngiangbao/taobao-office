// Chạy nguyên bản văn phòng my-office (thư mục office/, MIT) như một server cục bộ, và tạo cấu hình hook
// để mỗi lần `claude -p` chạy, sự kiện thật (đọc file, tìm kiếm, mở trình duyệt...) được gửi vào văn phòng.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const officeDir = (app) => (app.isPackaged ? path.join(process.resourcesPath, 'office') : path.join(__dirname, '..', 'office'));

function freePort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(start + 1)));
    s.listen(start, '127.0.0.1', () => s.close(() => resolve(start)));
  });
}

async function startOffice(app, dataDir) {
  const dir = officeDir(app);
  const port = await freePort(4310);
  const data = path.join(dataDir, 'office');
  fs.mkdirSync(data, { recursive: true });
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', OFFICE_LANG: 'vi', OFFICE_PORT: String(port), OFFICE_DATA_DIR: data, OFFICE_LOG: path.join(dataDir, 'office.log') },
  });
  child.on('error', (e) => console.error('office', e));
  const url = `http://127.0.0.1:${port}/`;
  // chờ server sẵn sàng (tối đa ~30 s)
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(url + 'health')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { child, port, url, dir };
}

// Hook của my-office (chỉ các hook gửi sự kiện), đổi sang cổng thực và cú pháp chạy được cả trên Windows.
function writeHookSettings(dir, port, dataDir) {
  const win = process.platform === 'win32';
  const hooks = JSON.parse(fs.readFileSync(path.join(dir, 'hooks', 'hooks.json'), 'utf8')).hooks;
  for (const list of Object.values(hooks)) for (const e of list) for (const h of e.hooks) {
    h.command = h.command.replace(/4310/g, String(port)).replace(/'Content-Type: application\/json'/g, '"Content-Type: application/json"')
      .replace('-o /dev/null', win ? '-o NUL' : '-o /dev/null');
    if (win) h.command = h.command.replace(/\s*\|\|\s*true\s*$/, '');
  }
  const file = path.join(dataDir, 'hooks-settings.json');
  fs.writeFileSync(file, JSON.stringify({ hooks, language: 'vietnamese' })); // language: Claude Code trả lời bằng tiếng Việt
  return file;
}

module.exports = { startOffice, writeHookSettings };
