const { app, BrowserWindow, ipcMain, shell, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runClaude, findClaude } = require('./lib/claude');
const { startOffice, writeHookSettings, testGate } = require('./lib/office');
const { createApprovals, PUBLISHER_PROMPT, KINDS } = require('./lib/approvals');
const { createAgents, TEMPLATES } = require('./lib/agents');
const { createDispatcher } = require('./lib/dispatcher');
const browser = require('./lib/browser');
const { createHistory } = require('./lib/history');
const { isPackagedApp } = require('./lib/runtime');
const { weekStats } = require('./lib/stats');
const { createCustomers } = require('./lib/customers');
const { createRevenue, parseVnd } = require('./lib/revenue');
const { createInbox, READER_PROMPT } = require('./lib/inbox');
const crypto = require('node:crypto');

const DEFAULT_CFG = {
  shopName: 'Cửa hàng của tôi',
  rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12,
  tone: 'thân thiện, xưng "shop", gọi khách là "bạn"', browser: 'playwright', claudePath: '', groups: [],
  inboxMinutes: 0, inboxUrl: 'https://business.facebook.com/latest/inbox/all', // đọc hộp thư Messenger tự động (0 = tắt)
  followupMinutes: 10, followupMax: 1, // khách im lặng bấy nhiêu phút thì agent soạn tin nhắc (tối đa bấy nhiêu lần)
  photoSearchSeconds: 6, // chủ shop gửi ảnh sản phẩm: chờ bấy nhiêu giây xem có lời nhắn đi kèm không, nếu không thì giao cho đúng một agent tìm hàng (0 = tắt)
  publishGapSeconds: 45, // giãn cách tối thiểu giữa hai lần đăng, như người thật
  refreshTokens: 100000, sleepHours: 24, // hội thoại dài quá ngưỡng thì làm mới có nhớ; nghỉ quá bấy nhiêu giờ thì hiện là "đang ngủ"
};
const DEFAULT_AGENTS = [
  { name: 'Chăm sóc khách', role: 'cskh' }, { name: 'Tìm hàng', role: 'search' }, { name: 'Báo giá', role: 'quote' },
  { name: 'Đăng bài', role: 'post' }, { name: 'Tìm khách', role: 'leads' },
];
let dataDir, cfgPath, win, office = null, hooksFile = null, autoUpdater = null, agents, dispatcher, history, customers, revenue, inbox, approvals, gateOk = false;
const children = new Map(); // agentId -> process đang chạy

const loadCfg = () => { try { return { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(cfgPath, 'utf8')) }; } catch { return { ...DEFAULT_CFG }; } };
const send = (ch, v) => win?.webContents.send(ch, v);
const pushAgents = () => send('agents:update', agents.list().map((a) => ({ ...a, busy: dispatcher?.isBusy(a.id) || false })));

// Ba thẻ ở mục Hoạt động của văn phòng: Việc (agent đang làm), Khách (tổng số khách), Doanh thu (VNĐ đã thu)
function writeStats() {
  try {
    fs.mkdirSync(path.join(dataDir, 'office'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'office', 'shop-stats.json'), JSON.stringify({ working: dispatcher?.busyCount() || 0, customers: customers.all().length, revenue: revenue.total(), shopName: loadCfg().shopName, week: weekStats(customers.all(), revenue.list()), at: Date.now() }));
  } catch { /* thư mục chưa sẵn sàng */ }
}
function custList() {
  const sleepMs = (loadCfg().sleepHours || 24) * 3600e3;
  return customers.all().map((c) => {
    const a = agents.get(c.agentId), busy = dispatcher?.isBusy(c.agentId) || false;
    const idle = Date.now() - Math.max(c.lastInboundAt || 0, c.lastReplyAt || 0, c.createdAt || 0);
    return { ...customers.pub(c), agentName: a?.name || '', ctx: a?.ctx || 0, busy, state: busy ? 'busy' : idle > sleepMs ? 'asleep' : 'awake' };
  }).sort((x, y) => (y.lastInboundAt || y.createdAt) - (x.lastInboundAt || x.createdAt));
}
const approvalsPub = () => ({ items: [...approvals.all()].sort((a, b) => (a.status === 'pending') === (b.status === 'pending') ? b.t - a.t : a.status === 'pending' ? -1 : 1).slice(0, 80), limit: loadCfg().maxPostsPerDay || 12, today: approvals.postedToday() });
const pushApprovals = () => send('approvals:update', approvalsPub());
const pushCustomers = () => { send('customers:update', custList()); pushAgents(); writeStats(); };

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#14161c', title: loadCfg().shopName,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(loadCfg().shopName); }); // tiêu đề cửa sổ luôn là tên cửa hàng
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile('renderer/index.html');
}

// Chạy một việc cho một agent; trả { text, error }
async function runAgent(agent, text, opts = {}) {
  const cfg = loadCfg();
  const cust = agent.kind === 'customer' ? customers.byAgent(agent.id) : null;
  let mcpFile = null;
  // agent chăm khách không dùng trình duyệt (giao việc cho agent chuyên môn); lượt chào/làm mới cũng nhẹ
  if (!opts.light && !cust) mcpFile = await browser.ensure(app, dataDir);
  let profile = '';
  if (cust) { try { profile = fs.readFileSync(customers.profileFile(agent), 'utf8'); } catch { /* chưa có hồ sơ */ } }
  let result = '', error = '', ctx = 0;
  const { child, done } = runClaude({
    text, cfg, dataDir, hooksFile, mcpFile,
    agent: {
      ...agent, rolePrompt: TEMPLATES[agent.role]?.prompt || '',
      customer: cust ? { code: cust.code, name: cust.name } : null, profile,
      // agent chăm khách: chỉ làm việc trong thư mục riêng, chỉ ghi hồ sơ, không web/trình duyệt (tin của khách là dữ liệu không đáng tin)
      scrollOk: gateOk, ...(cust ? { restrictDir: true, toolKind: 'customer' } : {}),
      team: agents.list().filter((x) => x.id !== agent.id && x.kind !== 'customer').map((x) => ({ name: x.name, roleLabel: x.roleLabel })),
    },
    onEvent: (ev) => {
      if (ev.type === 'system' && ev.subtype === 'init') agents.markStarted(agent.id);
      if (ev.type === 'assistant' && ev.message?.usage) { const u = ev.message.usage; ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); }
      if (ev.type === 'result') { result = String(ev.result || ''); if (ev.is_error) error = result || 'lỗi'; }
    },
  });
  children.set(agent.id, child);
  const r = await done;
  children.delete(agent.id);
  if (r.code !== 0 && !result) error = r.err.trim().slice(-400) || `claude thoát với mã ${r.code}`;
  return { text: result, error, ctx };
}

// Người đăng: chạy SAU KHI chủ shop duyệt; là lượt DUY NHẤT có quyền bấm/gõ trên trình duyệt, và chỉ nhận đúng nội dung đã duyệt
async function runPublisher(item) {
  const cfg = loadCfg();
  const mcpFile = await browser.ensure(app, dataDir);
  const dir = path.join(dataDir, 'agents', '_publisher'); fs.mkdirSync(dir, { recursive: true });
  const text = `ĐỀ XUẤT #${item.num} ĐÃ ĐƯỢC CHỦ SHOP DUYỆT.\nLoại: ${KINDS[item.kind]}\nĐích (mở đúng link này): ${item.target}\nNội dung cần đăng, NGUYÊN VĂN (không sửa, không thêm):\n\"\"\"\n${item.text}\n\"\"\"\n${item.files?.length ? `Ảnh cần đính kèm (tải lên bằng browser_file_upload): ${item.files.join(', ')}` : 'Không có ảnh.'}`;
  let result = '', error = '';
  const { child, done } = runClaude({
    text, cfg, dataDir, hooksFile: null, mcpFile,
    agent: { name: 'Người đăng', sid: crypto.randomUUID(), started: false, dir, rolePrompt: PUBLISHER_PROMPT, instructions: '', team: [], restrictDir: true, toolKind: 'publisher', publisher: true, scrollOk: true },
    onEvent: (ev) => { if (ev.type === 'result') { result = String(ev.result || ''); if (ev.is_error) error = result; } },
  });
  children.set('_publisher', child);
  const r = await done; children.delete('_publisher');
  if (r.code !== 0 && !result) error = r.err.trim().slice(-300) || `claude thoát với mã ${r.code}`;
  return { text: result, error };
}

// Ảnh gửi vào khung chat phải là JPEG nhỏ (< ~340 KB): thu nhỏ và nén bằng nativeImage của Electron
async function toJpeg(file) {
  let img = nativeImage.createFromPath(file);
  if (img.isEmpty()) throw new Error('không đọc được ảnh (chỉ hỗ trợ PNG/JPEG)');
  const { width, height } = img.getSize();
  if (Math.max(width, height) > 900) img = img.resize(width >= height ? { width: 900 } : { height: 900 });
  for (const q of [82, 70, 58, 46, 36]) { const buf = img.toJPEG(q); if (buf.length <= 340e3) return 'data:image/jpeg;base64,' + buf.toString('base64'); }
  throw new Error('ảnh lớn quá');
}

// Người đọc hộp thư Messenger: chỉ đọc, chỉ dùng trình duyệt, mỗi lần một phiên mới
async function runReader(text) {
  const cfg = loadCfg();
  const mcpFile = await browser.ensure(app, dataDir);
  const dir = path.join(dataDir, 'agents', '_inbox'); fs.mkdirSync(dir, { recursive: true });
  let result = '', error = '';
  const { child, done } = runClaude({
    text, cfg, dataDir, hooksFile: null, mcpFile,
    agent: { name: 'Đọc hộp thư', sid: crypto.randomUUID(), started: false, dir, rolePrompt: READER_PROMPT, instructions: '', team: [], restrictDir: true, toolKind: 'reader', scrollOk: gateOk },
    onEvent: (ev) => { if (ev.type === 'result') { result = String(ev.result || ''); if (ev.is_error) error = result; } },
  });
  children.set('_inbox', child);
  const r = await done; children.delete('_inbox');
  if (r.code !== 0 && !result) throw new Error(r.err.trim().slice(-300) || `claude thoát với mã ${r.code}`);
  if (error) throw new Error(error.slice(0, 300));
  return result;
}

async function introduce(agent) {
  const r = await dispatcher.enqueue(agent, 'Xin chào! Bạn vừa vào đội. Hãy chào bằng tiếng Việt, ngắn gọn (1-2 câu) và nói rõ bạn phụ trách việc gì. Không dùng công cụ nào.', [], undefined, { light: true }).catch(() => {});
  return r;
}

function setupUpdater() {
  if (!isPackagedApp(app)) return; // chỉ bản đóng gói mới tự cập nhật
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return console.error('updater', e); }
  let pending = false;
  const maybeInstall = () => { if (pending && !dispatcher.anyBusy()) { pending = false; setTimeout(() => autoUpdater.quitAndInstall(true, true), 8000); } };
  // Bản beta (0.x.y-beta.N) đi theo kênh beta: chỉ nhận bản beta mới hơn (file beta-*.yml), không bị kéo sang bản stable
  if (app.getVersion().includes('-')) autoUpdater.allowPrerelease = true;
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

app.whenReady().then(async () => {
  dataDir = path.join(app.getPath('userData'), 'workspace');
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  cfgPath = path.join(dataDir, 'config.json');
  const firstRun = !fs.existsSync(path.join(dataDir, 'agents.json'));
  agents = createAgents(dataDir);
  history = createHistory(dataDir);
  customers = createCustomers(dataDir, agents);
  revenue = createRevenue(dataDir);
  approvals = createApprovals(dataDir);

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('office:url', () => office?.url || null);
  ipcMain.handle('cfg:get', () => ({ cfg: loadCfg(), claude: findClaude(loadCfg().claudePath) }));
  ipcMain.handle('cfg:set', (_, c) => { fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); win?.setTitle(loadCfg().shopName); writeStats(); return true; });
  ipcMain.handle('customers:list', () => custList());
  ipcMain.handle('customers:rename', (_, d) => { const ok = customers.rename(d.code, d.name); pushCustomers(); return ok; });
  ipcMain.handle('customers:pause', (_, d) => { const c = customers.byCode(d.code); if (!c) return false; c.paused = !!d.paused; if (c.paused) c.followupDue = 0; customers.save(); pushCustomers(); return true; });
  ipcMain.handle('customers:refresh', (_, code) => { const c = customers.byCode(code), a = c && agents.get(c.agentId); if (!a || dispatcher.isBusy(a.id)) return false; dispatcher.refresh(a, 'theo yêu cầu'); return true; });
  ipcMain.handle('customers:profile', (_, code) => { const c = customers.byCode(code), a = c && agents.get(c.agentId); if (!a) return ''; try { return fs.readFileSync(customers.profileFile(a), 'utf8').slice(0, 20000); } catch { return ''; } });
  ipcMain.handle('revenue:list', () => ({ total: revenue.total(), items: revenue.list().slice(0, 300) }));
  ipcMain.handle('revenue:add', (_, d) => {
    try { const c = d.code && customers.byCode(d.code); const r = revenue.add({ amount: parseVnd(d.amount), code: c?.code || '', name: c?.name || '', note: d.note || '', source: 'manual' }); writeStats(); return { ok: true, item: r }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('revenue:void', (_, id) => { const ok = revenue.void(id); writeStats(); return ok; });
  ipcMain.handle('inbox:manual', (_, d) => { // dán tin của khách vào app
    try {
      if (!dispatcher) throw new Error('Văn phòng chưa sẵn sàng.');
      const text = String(d.text || '').trim(), name = String(d.name || '').trim();
      if (!text && !(d.images || []).length) throw new Error('Hãy nhập nội dung tin của khách.');
      if (!name) throw new Error('Hãy nhập tên khách.');
      const files = (d.images || []).slice(0, 4).map((im, i) => { const f = path.join(dataDir, 'uploads', `${Date.now()}-khach-${i}-${path.basename(String(im.name || 'anh.jpg')).replace(/[^\w.-]/g, '_')}`); fs.writeFileSync(f, Buffer.from(im.data)); return f; });
      const r = dispatcher.deliverInbound({ key: '', name, text: text || '(khách gửi ảnh)', files });
      return { ok: true, code: r.customer.code, created: r.created };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('inbox:poll', async () => { if (!inbox) return { ok: false, error: 'Văn phòng chưa sẵn sàng.' }; return inbox.pollNow(); });
  ipcMain.handle('approvals:list', () => approvalsPub());
  ipcMain.handle('approvals:edit', (_, d) => { const ok = approvals.edit(d.id, d.text); pushApprovals(); return ok; });
  ipcMain.handle('approvals:decide', (_, d) => {
    try {
      if (d.decision === 'reject') { approvals.reject(d.id); pushApprovals(); return { ok: true }; }
      const limit = loadCfg().maxPostsPerDay || 12;
      if (approvals.postedToday() >= limit) return { ok: false, error: `Hôm nay đã đủ ${limit} bài/bình luận. Muốn đăng thêm, hãy tăng "Tối đa bài/ngày" trong Cài đặt.` };
      if (!dispatcher) return { ok: false, error: 'Văn phòng chưa sẵn sàng.' };
      const item = approvals.approve(d.id, d.hash); // khoá nội dung đã duyệt
      pushApprovals(); dispatcher.publishApproved(item); return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('history:query', (_, o) => history.query(o || {}));
  ipcMain.handle('history:open', () => shell.openPath(history.dir));
  ipcMain.handle('log:open', () => shell.openPath(dataDir));
  ipcMain.handle('agents:list', () => ({ agents: agents.list().map((a) => ({ ...a, busy: dispatcher?.isBusy(a.id) || false })), templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, { label: v.label, prompt: v.prompt }])) }));
  ipcMain.handle('agents:add', async (_, d) => {
    try { const a = agents.add(d); pushAgents(); introduce(a); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('agents:remove', (_, id) => { children.get(id)?.kill(); agents.remove(id); pushAgents(); return true; });
  ipcMain.handle('agents:reset', (_, id) => { if (dispatcher.isBusy(id)) return false; const a = agents.reset(id); pushAgents(); if (a) introduce(a); return true; });
  ipcMain.handle('agents:stop', () => { dispatcher?.cancelAll(); for (const c of children.values()) c.kill(); return true; });
  ipcMain.handle('login:open', async () => browser.open(dataDir, ['https://www.facebook.com/', 'https://www.taobao.com/']));

  createWindow();
  setupUpdater();
  try {
    office = await startOffice(app, dataDir);
    gateOk = testGate(); // lớp chặn phím chạy được thì agent mới được dùng phím cuộn trang; không thì không có phím nào
    if (!gateOk) console.error('Lớp chặn phím không chạy được: agent sẽ không cuộn được trang (an toàn hơn là để hở).');
    hooksFile = writeHookSettings(office.dir, office.port, dataDir, { gate: gateOk });
    dispatcher = createDispatcher({
      officeUrl: () => office.url, agents, run: runAgent, uploadsDir: path.join(dataDir, 'uploads'), history,
      customers, revenue, approvals, publisher: runPublisher, toJpeg, onApprovals: pushApprovals, getCfg: loadCfg, onCustomers: pushCustomers, onRevenue: writeStats,
      onStatus: () => { pushAgents(); writeStats(); }, log: (l) => fs.appendFile(path.join(dataDir, 'dispatch.log'), `${new Date().toISOString()} ${l}\n`, () => {}),
    });
    dispatcher.start();
    inbox = createInbox({ dataDir, runReader, deliver: (msg) => dispatcher.deliverInbound(msg), getCfg: loadCfg, onResult: (r) => send('inbox:result', r) });
    inbox.start();
    if (approvals.recovered) setTimeout(() => dispatcher.sys(`⚠️ App bị tắt giữa lúc đang đăng ${approvals.recovered} đề xuất: hãy kiểm tra trên Facebook xem đã đăng chưa trước khi đăng lại (mở Chờ duyệt để xem).`), 3000);
    writeStats(); setInterval(writeStats, 5000);
    send('office:ready', office.url);
    if (firstRun && findClaude(loadCfg().claudePath)) {
      const made = DEFAULT_AGENTS.map((d) => agents.add(d));
      (async () => { for (const a of made) await introduce(a); })(); // chào lần lượt, không chạy 5 tiến trình cùng lúc
    }
    pushAgents();
  } catch (e) { console.error('Không chạy được văn phòng:', e); send('office:error', String(e.message || e)); }
});
app.on('before-quit', () => { dispatcher?.stop(); inbox?.stop(); for (const c of children.values()) c.kill(); browser.stop(); office?.child.kill(); });
app.on('window-all-closed', () => app.quit());
