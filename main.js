const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runClaude, findClaude } = require('./lib/claude');
const { startOffice, writeHookSettings } = require('./lib/office');

function findChrome() {
  const c = process.platform === 'win32'
    ? [process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe', process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe', process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe']
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return c.find((p) => p && fs.existsSync(p)) || null;
}

const DEFAULT_CFG = {
  rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12,
  tone: 'thân thiện, xưng "shop", gọi khách là "bạn"', browser: 'playwright', claudePath: '',
  groups: [],
};
let autoUpdater = null;
let dataDir, cfgPath, sessionId = null, running = null, win, office = null, hooksFile = null;

const loadCfg = () => { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch { return { ...DEFAULT_CFG }; } };

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#14161c', title: 'Taobao Office',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(async () => {
  dataDir = path.join(app.getPath('userData'), 'workspace');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  cfgPath = path.join(dataDir, 'config.json');
  try { sessionId = fs.readFileSync(path.join(dataDir, 'session.txt'), 'utf8').trim() || null; } catch {}

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('office:url', () => office?.url || null);
  ipcMain.handle('cfg:get', () => ({ cfg: loadCfg(), claude: findClaude(loadCfg().claudePath) }));
  ipcMain.handle('cfg:set', (_, c) => { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); return true; });
  ipcMain.handle('login:open', () => {
    if (running) return { ok: false, error: 'Claude đang làm việc, hãy chờ xong rồi đăng nhập.' };
    const chrome = findChrome();
    if (!chrome) return { ok: false, error: 'Không tìm thấy Google Chrome. Hãy cài Chrome.' };
    spawn(chrome, ['--user-data-dir=' + path.join(dataDir, 'chrome-profile'), '--no-first-run', '--no-default-browser-check', 'https://www.facebook.com/', 'https://www.taobao.com/'], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  });
  ipcMain.handle('log:open', () => shell.openPath(dataDir));
  ipcMain.handle('chat:reset', () => { sessionId = null; try { fs.unlinkSync(path.join(dataDir, 'session.txt')); } catch {} return true; });
  ipcMain.handle('file:save', (_, { name, data }) => {
    const p = path.join(dataDir, 'uploads', `${Date.now()}-${path.basename(name).replace(/[^\w.-]/g, '_')}`);
    fs.writeFileSync(p, Buffer.from(data)); return p;
  });
  ipcMain.handle('chat:stop', () => { running?.child.kill(); return true; });
  ipcMain.handle('chat:send', async (_, { text, files }) => {
    if (running) return { ok: false, error: 'Claude đang làm việc, hãy chờ hoặc bấm Dừng.' };
    const full = files?.length ? `${text}\n\n[Ảnh đính kèm: ${files.join(', ')}]` : text;
    try {
      running = runClaude({
        text: full, cfg: loadCfg(), dataDir, sessionId, hooksFile,
        onEvent: (ev) => {
          if (ev.session_id && ev.type === 'system') { sessionId = ev.session_id; fs.writeFileSync(path.join(dataDir, 'session.txt'), sessionId); }
          win?.webContents.send('claude:event', ev);
        },
      });
      const { code, err } = await running.done;
      running = null; maybeInstall();
      if (code !== 0) return { ok: false, error: err.trim().slice(-600) || `claude thoát với mã ${code}` };
      return { ok: true };
    } catch (e) { running = null; return { ok: false, error: e.message }; }
  });
  createWindow();
  setupUpdater();
  try {
    office = await startOffice(app, dataDir);
    hooksFile = writeHookSettings(office.dir, office.port, dataDir);
    win?.webContents.send('office:ready', office.url);
  } catch (e) { console.error('Không chạy được văn phòng:', e); }
});
// Tự cập nhật: tải ngầm bản mới từ GitHub Releases, rồi tự khởi động lại khi app đang rảnh. Người dùng không phải làm gì.
let pendingInstall = false;
function maybeInstall() {
  if (!pendingInstall || running) return;
  pendingInstall = false;
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 8000); // cho người dùng kịp thấy thông báo
}
function setupUpdater() {
  if (!app.isPackaged) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return console.error('updater', e); }
  const tell = (o) => win?.webContents.send('update:status', o);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => tell({ state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', (p) => tell({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => { tell({ state: 'ready', version: i.version }); pendingInstall = true; maybeInstall(); });
  autoUpdater.on('error', (e) => console.error('updater', e?.message));
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 4 * 3600 * 1000);
}
app.on('before-quit', () => { office?.child.kill(); });
app.on('window-all-closed', () => app.quit());
