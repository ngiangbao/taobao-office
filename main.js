const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, findClaude } = require('./lib/claude');
const { startOffice, writeHookSettings } = require('./lib/office');
const { createAgents, TEMPLATES } = require('./lib/agents');
const { createDispatcher } = require('./lib/dispatcher');
const browser = require('./lib/browser');
const { createHistory } = require('./lib/history');

const DEFAULT_CFG = {
  rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12,
  tone: 'thân thiện, xưng "shop", gọi khách là "bạn"', browser: 'playwright', claudePath: '', groups: [],
};
const DEFAULT_AGENTS = [
  { name: 'Chăm sóc khách', role: 'cskh' }, { name: 'Tìm hàng', role: 'search' }, { name: 'Báo giá', role: 'quote' },
  { name: 'Đăng bài', role: 'post' }, { name: 'Tìm khách', role: 'leads' },
];
let dataDir, cfgPath, win, office = null, hooksFile = null, autoUpdater = null, agents, dispatcher, history;
const children = new Map(); // agentId -> process đang chạy
const ICON = path.join(__dirname, 'renderer', 'icon.png');

const loadCfg = () => { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch { return { ...DEFAULT_CFG }; } };
const send = (ch, v) => win?.webContents.send(ch, v);
const pushAgents = () => send('agents:update', agents.list().map((a) => ({ ...a, busy: dispatcher?.isBusy(a.id) || false })));

// Màn hình chào: hiện ngay khi mở app, tự đóng khi cửa sổ chính vẽ xong (giữ tối thiểu ~0,9 s để kịp đọc).
let splash = null, splashAt = 0;
function createSplash() {
  splashAt = Date.now();
  splash = new BrowserWindow({
    width: 440, height: 320, frame: false, resizable: false, maximizable: false, minimizable: false,
    show: false, backgroundColor: '#14161c', title: 'Taobao Office', icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'splash-preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  splash.on('closed', () => { splash = null; });
  splash.loadFile('renderer/splash.html');
  splash.once('ready-to-show', () => splash?.show());
}
const splashSay = (t) => splash?.webContents.send('splash:msg', t);
function closeSplash() {
  const wait = Math.max(0, 900 - (Date.now() - splashAt));
  setTimeout(() => { splash?.destroy(); splash = null; }, wait);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#14161c', title: 'Taobao Office', icon: ICON, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.once('ready-to-show', () => { win.show(); closeSplash(); });
  win.on('closed', () => { win = null; });
  win.loadFile('renderer/index.html');
}

// Chạy một việc cho một agent; trả { text, error }
async function runAgent(agent, text, opts = {}) {
  const cfg = loadCfg();
  let mcpFile = null;
  if (cfg.browser !== 'chrome' && !opts.light) mcpFile = await browser.ensure(app, dataDir); // lượt chào nhẹ: không cần mở trình duyệt
  let result = '', error = '';
  const { child, done } = runClaude({
    text, cfg, dataDir, hooksFile, mcpFile,
    agent: { ...agent, rolePrompt: TEMPLATES[agent.role]?.prompt || '', team: agents.list().filter((x) => x.id !== agent.id).map((x) => ({ name: x.name, roleLabel: x.roleLabel })) },
    onEvent: (ev) => {
      if (ev.type === 'system' && ev.subtype === 'init') agents.markStarted(agent.id);
      if (ev.type === 'result') { result = String(ev.result || ''); if (ev.is_error) error = result || 'lỗi'; }
    },
  });
  children.set(agent.id, child);
  const r = await done;
  children.delete(agent.id);
  if (r.code !== 0 && !result) error = r.err.trim().slice(-400) || `claude thoát với mã ${r.code}`;
  return { text: result, error };
}

async function introduce(agent) {
  const r = await dispatcher.enqueue(agent, 'Xin chào! Bạn vừa vào đội. Hãy chào bằng tiếng Việt, ngắn gọn (1-2 câu) và nói rõ bạn phụ trách việc gì. Không dùng công cụ nào.', [], undefined, { light: true }).catch(() => {});
  return r;
}

function setupUpdater() {
  if (!app.isPackaged) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return console.error('updater', e); }
  let pending = false;
  const maybeInstall = () => { if (pending && !dispatcher.anyBusy()) { pending = false; setTimeout(() => autoUpdater.quitAndInstall(true, true), 8000); } };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => send('update:status', { state: 'downloading', version: i.version }));
  autoUpdater.on('download-progress', (p) => send('update:status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => { send('update:status', { state: 'ready', version: i.version }); pending = true; maybeInstall(); });
  autoUpdater.on('error', (e) => console.error('updater', e?.message));
  setInterval(maybeInstall, 15000);
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 4 * 3600 * 1000);
}

app.setAppUserModelId('vn.taobaooffice.app');

app.whenReady().then(async () => {
  createSplash();
  dataDir = path.join(app.getPath('userData'), 'workspace');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  cfgPath = path.join(dataDir, 'config.json');
  const firstRun = !fs.existsSync(path.join(dataDir, 'agents.json'));
  agents = createAgents(dataDir);
  history = createHistory(dataDir);

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('office:url', () => office?.url || null);
  ipcMain.handle('cfg:get', () => ({ cfg: loadCfg(), claude: findClaude(loadCfg().claudePath) }));
  ipcMain.handle('cfg:set', (_, c) => { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); return true; });
  ipcMain.handle('history:query', (_, o) => history.query(o || {}));
  ipcMain.handle('history:delete', (_, o) => history.remove(o || {}));
  ipcMain.handle('history:open', () => shell.openPath(history.dir));
  ipcMain.handle('log:open', () => shell.openPath(dataDir));
  ipcMain.handle('agents:list', () => ({ agents: agents.list().map((a) => ({ ...a, busy: dispatcher?.isBusy(a.id) || false })), templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, { label: v.label, prompt: v.prompt }])) }));
  ipcMain.handle('agents:add', async (_, d) => {
    try { const a = agents.add(d); pushAgents(); introduce(a); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('agents:remove', (_, id) => { children.get(id)?.kill(); agents.remove(id); pushAgents(); return true; });
  ipcMain.handle('agents:reset', (_, id) => { if (dispatcher.isBusy(id)) return false; const a = agents.reset(id); pushAgents(); if (a) introduce(a); return true; });
  ipcMain.handle('agents:stop', () => { dispatcher?.stopAll(); for (const c of children.values()) c.kill(); return true; });
  ipcMain.handle('login:open', async () => browser.open(dataDir, ['https://www.facebook.com/', 'https://www.taobao.com/']));

  createWindow();
  setupUpdater();
  splashSay('Đang mở văn phòng 3D…');
  try {
    office = await startOffice(app, dataDir);
    hooksFile = writeHookSettings(office.dir, office.port, dataDir);
    dispatcher = createDispatcher({
      officeUrl: () => office.url, agents, run: runAgent, uploadsDir: path.join(dataDir, 'uploads'), history,
      killAgent: (id) => children.get(id)?.kill(),
      onStatus: pushAgents, log: (l) => fs.appendFile(path.join(dataDir, 'dispatch.log'), `${new Date().toISOString()} ${l}\n`, () => {}),
    });
    dispatcher.start();
    send('office:ready', office.url);
    if (firstRun && findClaude(loadCfg().claudePath)) {
      const made = DEFAULT_AGENTS.map((d) => agents.add(d));
      (async () => { for (const a of made) await introduce(a); })(); // chào lần lượt, không chạy 5 tiến trình cùng lúc
    }
    pushAgents();
  } catch (e) {
    console.error('Không chạy được văn phòng:', e);
    send('office:error', 'Không mở được văn phòng 3D. Xem chi tiết trong tệp office.log (nút Nhật ký).');
  }
});
app.on('before-quit', () => { dispatcher?.stop(); for (const c of children.values()) c.kill(); browser.stop(); office?.child.kill(); });
app.on('window-all-closed', () => app.quit());
