// Chạy nguyên bản văn phòng my-office (thư mục office/, MIT) như một server cục bộ, và tạo cấu hình hook
// để mỗi lần `claude -p` chạy, sự kiện thật (đọc file, tìm kiếm, mở trình duyệt...) được gửi vào văn phòng.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const { isPackagedApp } = require('./runtime');
const officeDir = (app) => (isPackagedApp(app) ? path.join(process.resourcesPath, 'office') : path.join(__dirname, '..', 'office'));

function freePort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(start + 1)));
    s.listen(start, '127.0.0.1', () => s.close(() => resolve(start)));
  });
}

async function startOffice(app, dataDir, { dir: dirOverride } = {}) { // dirOverride: chỉ để kiểm thử
  const dir = dirOverride || officeDir(app);
  if (!fs.existsSync(path.join(dir, 'server', 'index.mjs'))) throw new Error(`Không thấy văn phòng ở ${dir}. Cài đặt có thể bị hỏng, hãy cài lại.`);
  const port = await freePort(4310);
  const data = path.join(dataDir, 'office');
  fs.mkdirSync(data, { recursive: true });
  const logFile = path.join(dataDir, 'office.log');
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', OFFICE_LANG: 'vi', OFFICE_PORT: String(port), OFFICE_DATA_DIR: data, OFFICE_LOG: logFile },
  });
  let spawnError = null, exited = null, tail = '';
  const keep = (d) => { tail = (tail + d).slice(-1500); };
  child.stdout.on('data', keep); child.stderr.on('data', keep);
  child.on('error', (e) => { spawnError = e; });
  child.on('exit', (code, sig) => { exited = { code, sig }; });
  const url = `http://127.0.0.1:${port}/`;
  // chờ server sẵn sàng (tối đa ~30 s); chết giữa chừng thì báo ngay, không chờ hết giờ
  for (let i = 0; i < 60; i++) {
    if (spawnError || exited) break;
    try { if ((await fetch(url + 'health', { signal: AbortSignal.timeout(1500) })).ok) return { child, port, url, dir }; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  try { child.kill(); } catch {}
  let log = tail.trim(); if (!log) { try { log = fs.readFileSync(logFile, 'utf8').slice(-800).trim(); } catch {} }
  const why = spawnError ? `không khởi động được (${spawnError.message})` : exited ? `đã dừng với mã ${exited.code ?? exited.sig}` : 'không trả lời sau 30 giây';
  throw new Error(`Văn phòng ${why}.${log ? `\n${log.split('\n').slice(-6).join('\n')}` : ''}`);
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
