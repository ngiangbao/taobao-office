// Một cửa sổ Chrome dùng chung (hồ sơ đã đăng nhập Facebook/Taobao) cho mọi agent.
// Chrome mở cổng điều khiển cục bộ; mỗi lần agent chạy, Claude khởi một tiến trình Playwright MCP gắn vào Chrome này
// (--cdp-endpoint), nên nhiều agent dùng chung đăng nhập, mỗi agent làm việc trong tab riêng.
// Chrome được mở LƯỜI: chỉ khi agent thật sự gọi công cụ trình duyệt (lib/mcp-lazy.js), không phải mỗi lần agent chạy.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const PORT = Number(process.env.TBO_CDP_PORT) || 9333;
let chrome = null;

function findChrome() {
  const c = process.platform === 'win32'
    ? [process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe', process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const { isPackagedApp } = require('./runtime');
const cliPath = (app) => (isPackagedApp(app)
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@playwright', 'mcp', 'cli.js')
  : path.join(__dirname, '..', 'node_modules', '@playwright', 'mcp', 'cli.js'));
const up = () => fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);

/** Bảo đảm Chrome dùng chung đang chạy (mở thêm các tab `urls` nếu có). Trả { ok, error }. */
async function open(dataDir, urls = []) {
  const bin = findChrome();
  if (!bin) return { ok: false, error: 'Không tìm thấy Google Chrome. Hãy cài Chrome.' };
  const args = ['--user-data-dir=' + path.join(dataDir, 'chrome-profile'), `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check', ...urls];
  // Chrome đang chạy với hồ sơ này thì lệnh mới chỉ chuyển các URL sang cửa sổ đó
  touch(dataDir);
  chrome = spawn(bin, args, { detached: true, stdio: 'ignore' }); chrome.unref();
  for (let i = 0; i < 40; i++) { if (await up()) return { ok: true }; await new Promise((r) => setTimeout(r, 500)); }
  return { ok: false, error: 'Chrome không mở được cổng điều khiển. Hãy đóng hết cửa sổ Chrome của app rồi thử lại.' };
}
/** Ghi cấu hình MCP (KHÔNG mở Chrome): proxy lười mở Chrome ở lần gọi công cụ trình duyệt đầu tiên. Trả đường dẫn mcp.json. */
function mcpConfig(app, dataDir) {
  const shots = path.join(dataDir, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const mcpFile = path.join(dataDir, 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { playwright: { command: process.execPath, args: [path.join(__dirname, 'mcp-lazy.js'), '--cli', cliPath(app), '--data', dataDir, '--out', shots], env: { ELECTRON_RUN_AS_NODE: '1', TBO_CDP_PORT: String(PORT) } } } }));
  return mcpFile;
}
async function ensure(app, dataDir) {
  if (!(await up())) { const r = await open(dataDir); if (!r.ok) throw new Error(r.error); }
  const shots = path.join(dataDir, 'shots'); fs.mkdirSync(shots, { recursive: true }); // ảnh chụp trang web của agent nằm ở đây
  const mcpFile = path.join(dataDir, 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { playwright: { command: process.execPath, args: [cliPath(app), '--cdp-endpoint', `http://127.0.0.1:${PORT}`, '--output-dir', shots], env: { ELECTRON_RUN_AS_NODE: '1' } } } }));
  return mcpFile;
}
// Dấu thời điểm Chrome dùng chung được dùng lần cuối (agent gọi công cụ trình duyệt, hoặc app mở Chrome): để tắt hẳn khi rảnh quá lâu
const stamp = (dataDir) => path.join(dataDir, 'chrome-last-use');
function touch(dataDir) { try { fs.writeFileSync(stamp(dataDir), String(Date.now())); } catch { /* thư mục chưa sẵn sàng */ } }
function idleMs(dataDir) { try { return Date.now() - Number(fs.readFileSync(stamp(dataDir), 'utf8')); } catch { return 0; } }
/** Đóng hẳn Chrome dùng chung (qua cổng điều khiển; hồ sơ đăng nhập vẫn được giữ). Trả true nếu đã tắt. */
async function close() {
  try {
    const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) })).json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; setTimeout(no, 3000); });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  } catch { /* không nối được: thử cách dự phòng bên dưới */ }
  for (let i = 0; i < 12; i++) { if (!(await up())) return true; await new Promise((r) => setTimeout(r, 500)); }
  try { if (chrome?.pid) process.kill(chrome.pid); } catch { /* đã thoát */ }
  await new Promise((r) => setTimeout(r, 1000));
  return !(await up());
}
function stop() { /* để nguyên Chrome: người dùng có thể đang đăng nhập hoặc xem trong đó */ }
module.exports = { ensure, mcpConfig, open, stop, touch, idleMs, close, findChrome, up, PORT };
