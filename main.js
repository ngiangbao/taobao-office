const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, findClaude } = require('./lib/claude');

const DEFAULT_CFG = {
  rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12,
  tone: 'thân thiện, xưng "shop", gọi khách là "bạn"', browser: 'playwright', claudePath: '',
  groups: [],
};
let dataDir, cfgPath, sessionId = null, running = null, win;

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

app.whenReady().then(() => {
  dataDir = path.join(app.getPath('userData'), 'workspace');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  cfgPath = path.join(dataDir, 'config.json');
  try { sessionId = fs.readFileSync(path.join(dataDir, 'session.txt'), 'utf8').trim() || null; } catch {}

  ipcMain.handle('cfg:get', () => ({ cfg: loadCfg(), claude: findClaude(loadCfg().claudePath) }));
  ipcMain.handle('cfg:set', (_, c) => { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); return true; });
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
        text: full, cfg: loadCfg(), dataDir, sessionId,
        onEvent: (ev) => {
          if (ev.session_id && ev.type === 'system') { sessionId = ev.session_id; fs.writeFileSync(path.join(dataDir, 'session.txt'), sessionId); }
          win?.webContents.send('claude:event', ev);
        },
      });
      const { code, err } = await running.done;
      running = null;
      if (code !== 0) return { ok: false, error: err.trim().slice(-600) || `claude thoát với mã ${code}` };
      return { ok: true };
    } catch (e) { running = null; return { ok: false, error: e.message }; }
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
