// Một cửa sổ Chrome dùng chung (hồ sơ đã đăng nhập Facebook/Taobao) cho mọi agent.
// Chrome mở cổng điều khiển cục bộ; mỗi lần agent chạy, Claude khởi một tiến trình Playwright MCP gắn vào Chrome này
// (--cdp-endpoint), nên nhiều agent dùng chung đăng nhập, mỗi agent làm việc trong tab riêng.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PORT = 9333;
let chrome = null;

function findChrome() {
  const c = process.platform === 'win32'
    ? [process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe', process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const cliPath = (app) => (app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@playwright', 'mcp', 'cli.js')
  : path.join(__dirname, '..', 'node_modules', '@playwright', 'mcp', 'cli.js'));
const up = () => fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);

/** Bảo đảm Chrome dùng chung đang chạy (mở thêm các tab `urls` nếu có). Trả { ok, error }. */
async function open(dataDir, urls = []) {
  const bin = findChrome();
  if (!bin) return { ok: false, error: 'Không tìm thấy Google Chrome. Hãy cài Chrome.' };
  const args = ['--user-data-dir=' + path.join(dataDir, 'chrome-profile'), `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', ...urls];
  // Chrome đang chạy với hồ sơ này thì lệnh mới chỉ chuyển các URL sang cửa sổ đó
  chrome = spawn(bin, args, { detached: true, stdio: 'ignore' }); chrome.unref();
  for (let i = 0; i < 40; i++) { if (await up()) return { ok: true }; await new Promise((r) => setTimeout(r, 500)); }
  return { ok: false, error: 'Chrome không mở được cổng điều khiển. Hãy đóng hết cửa sổ Chrome của app rồi thử lại.' };
}
async function ensure(app, dataDir) {
  if (!(await up())) { const r = await open(dataDir); if (!r.ok) throw new Error(r.error); }
  const mcpFile = path.join(dataDir, 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { playwright: { command: process.execPath, args: [cliPath(app), '--cdp-endpoint', `http://127.0.0.1:${PORT}`], env: { ELECTRON_RUN_AS_NODE: '1' } } } }));
  return mcpFile;
}
function stop() { /* để nguyên Chrome: người dùng có thể đang đăng nhập hoặc xem trong đó */ }
module.exports = { ensure, open, stop, findChrome };
