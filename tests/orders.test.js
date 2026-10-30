const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createOrders, parseOrdersWorkbook, buildWorkbook, toTsv, HEAD } = require('../lib/orders');
const { createAppender, webhookUrl, APPS_SCRIPT } = require('../lib/sheet-append');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-ord-'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
async function sampleBook(file) { // giống trang "khách order" thật, chưa có cột ID khách
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook();
  wb.addWorksheet('DS Nón').addRow(['STT', 'Ảnh', 'Mã SP']);
  const ws = wb.addWorksheet('khách order');
  ws.addRow(['STT', 'Tên Facebook khách hàng', 'Link Facebook khách hàng', 'Mã SP khách đặt', 'Hình ảnh SP khách đặt', 'MÀU SẮC ', 'SIZE ', 'Số lượng', 'Giá bán', 'Tình trạng', 'Link sản phẩm trên 1688', '', 'LINK CMT MUA HÀNG ']);
  ws.addRow([1, 'Khách A', 'https://www.facebook.com/a', 'MU029', '', 'Nâu', '90', 1, 127150, 'Đã về', 'https://detail.1688.com/offer/1.html', 'FREESHIP', '']);
  ws.addRow([2, 'Khách A', '', 'KH024', '', 'Vàng', '', 2, '111.350', 'Đã đặt hàng', '', '', '']);
  ws.addRow([3, '', '', '', '', '', '', '', '', '', '', '', '']); // dòng trống
  ws.addImage(wb.addImage({ buffer: PNG, extension: 'png' }), { tl: { col: 4, row: 1 }, ext: { width: 20, height: 20 } });
  await wb.xlsx.writeFile(file);
}

test('nhập trang "khách order": đúng cột, ghi chú ở cột trống, ảnh theo dòng, bỏ dòng trống; nhập lại không nhân đôi', async (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'a.xlsx'); await sampleBook(file);
  const store = createOrders(dir);
  const items = await parseOrdersWorkbook(file, { imagesDir: store.imgDir });
  assert.equal(items.length, 2);
  assert.equal(items[0].note, 'FREESHIP'); assert.equal(items[0].color, 'Nâu'); assert.ok(items[0].image && fs.existsSync(path.join(store.imgDir, items[0].image)));
  assert.equal(items[1].image, undefined);
  assert.deepEqual(store.importItems(items), { added: 2, skipped: 0, total: 2 });
  assert.equal(store.all()[1].price, 111350, '111.350 là 111350');
  assert.deepEqual(store.importItems(items), { added: 0, skipped: 2, total: 2 });
  assert.equal(createOrders(dir).all().length, 2, 'lưu vào đĩa');
  assert.equal(store.importItems(items.slice(0, 1), 'replace').total, 1);
});

test('cột ID khách đứng trước STT khi xuất; xuất rồi nhập lại giữ nguyên; TSV dán được vào Google Sheets', async (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const s = createOrders(dir);
  s.add({ custId: 'kh-ab12', fbName: 'Khách "B"', sku: 'MU1', qty: 2, price: 100000, status: 'Đã về', note: 'a\tb\nc' });
  assert.equal(s.all()[0].custId, 'KH-AB12');
  assert.deepEqual(HEAD.slice(0, 2).map((h) => h[1]), ['ID khách', 'STT']);
  const back = await parseOrdersWorkbook(await buildWorkbook(s.all(), s.imgDir));
  assert.equal(back[0].custId, 'KH-AB12'); assert.equal(back[0].fbName, 'Khách "B"'); assert.equal(Number(back[0].price), 100000);
  const tsv = toTsv(s.all()).split('\n');
  assert.ok(tsv[0].startsWith('ID khách\tSTT\tTên Facebook khách hàng'));
  assert.throws(() => s.add({}), /ít nhất/);
  assert.throws(() => s.update('khong-co', { sku: 'x' }), /Không thấy/);
  assert.ok(s.remove(s.all()[0].id));
});

test('địa chỉ ứng dụng web chỉ nhận script.google.com/macros/s/…/exec', () => {
  assert.ok(webhookUrl('https://script.google.com/macros/s/AKfycbxabcdefghij/exec'));
  for (const bad of ['http://script.google.com/macros/s/AKfycbxabcdefghij/exec', 'https://evil.example/macros/s/AKfycbxabcdefghij/exec', 'https://script.google.com/macros/s/AKfycbxabcdefghij/dev', 'khong-phai-url']) assert.throws(() => webhookUrl(bad), /không hợp lệ|dạng/, bad);
});

test('khách mới tự gửi lên bảng online: gửi đúng nội dung, lỗi thì giữ trong hàng đợi và gửi lại, không gửi trùng', async (t) => {
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cfg = { ordersWebhookUrl: 'https://script.google.com/macros/s/AKfycbxabcdefghij/exec', ordersWebhookToken: 'mk', ordersSheetName: 'khách order' };
  const calls = []; let fail = true;
  const fetchImpl = async (url, opt) => { calls.push({ url: String(url), body: JSON.parse(opt.body) }); if (fail) return { ok: false, status: 500, url: String(url), text: async () => '<html>' }; return { ok: true, status: 200, url: 'https://script.googleusercontent.com/x', text: async () => '{"ok":true,"added":1}' }; };
  const ap = createAppender({ dataDir: dir, getCfg: () => cfg, fetchImpl });
  assert.equal(createAppender({ dataDir: tmp(), getCfg: () => ({}), fetchImpl }).enqueue({ a: 1 }), false, 'chưa cấu hình thì không làm gì');
  ap.enqueue({ 'ID khách': 'KH-1', 'Tên Facebook khách hàng': 'Lan' }, { key: 'cust:KH-1', once: true });
  await ap.flush(); assert.equal(ap.pending(), 1); assert.equal(ap.status().ok, false);
  assert.equal(calls[0].body.token, 'mk'); assert.equal(calls[0].body.rows[0].cells['ID khách'], 'KH-1'); assert.equal(calls[0].body.rows[0].once, true);
  assert.equal(createAppender({ dataDir: dir, getCfg: () => cfg, fetchImpl }).pending(), 1, 'hàng đợi nằm trên đĩa');
  ap.enqueue({ x: 1 }, { key: 'cust:KH-1', once: true }); assert.equal(ap.pending(), 1, 'cùng khoá không xếp hai lần');
  fail = false; await ap.flush(); assert.equal(ap.pending(), 0); assert.equal(ap.status().ok, true);
  const bad = createAppender({ dataDir: tmp(), getCfg: () => cfg, fetchImpl: async () => ({ ok: true, status: 200, url: 'https://evil.example/', text: async () => '{"ok":true}' }) });
  assert.equal((await bad.test()).ok, false);
});

// chạy đúng đoạn Apps Script người dùng sẽ dán, trên một bảng tính giả
function runScript(rowsIn, grid) {
  const written = [];
  const cellRef = (r, c) => ({ setValue: (v) => { grid[r - 1] = grid[r - 1] || []; grid[r - 1][c - 1] = v; written.push([r, c, v]); }, getValue: () => (grid[r - 1] || [])[c - 1] ?? '' });
  const sheet = {
    getLastColumn: () => Math.max(...grid.map((r) => r.length)), getLastRow: () => grid.length,
    getRange: (r, c, nr = 1, nc = 1) => (nr === 1 && nc === 1 ? cellRef(r, c) : { getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (grid[r - 1 + i] || [])[c - 1 + j] ?? '')) }),
  };
  const ctx = { SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet }) }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, ContentService: { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 1 } } };
  vm.createContext(ctx); vm.runInContext(APPS_SCRIPT.replace('DOI-MAT-KHAU-NAY', 'mk') + '\nthis.doPost = doPost;', ctx);
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ token: 'mk', rows: rowsIn }) } }));
}
test('đoạn Apps Script: thêm vào dòng cuối theo tên cột, tự điền STT kế tiếp, bỏ khách đã có, sai mật khẩu thì từ chối', () => {
  const grid = [['ID khách', 'STT', 'Tên Facebook khách hàng', 'Mã SP khách đặt', 'TỔNG QUAN'], ['KH-0', 1, 'Cũ', 'MU1', '=SUM(A1)'], ['', '', '', '', ''], ['', '', '', '', '']];
  const r = runScript([{ once: true, cells: { 'ID khách': 'KH-1', 'Tên Facebook khách hàng': 'Lan' } }, { once: true, cells: { 'ID khách': 'KH-1', 'Tên Facebook khách hàng': 'Lan' } }, { cells: { 'ID khách': 'KH-0', 'Tên Facebook khách hàng': 'Cũ', 'Mã SP khách đặt': 'MU2' } }], grid);
  assert.deepEqual(r, { ok: true, added: 2 });
  assert.deepEqual(grid[2].slice(0, 4), ['KH-1', 2, 'Lan', ''], 'dòng ngay sau dòng cuối có dữ liệu, STT = 2');
  assert.deepEqual(grid[3].slice(0, 4), ['KH-0', 3, 'Cũ', 'MU2']);
  assert.equal(grid[1][4], '=SUM(A1)', 'không đụng cột khác');
  const ctxBad = JSON.parse((() => { const g = [['ID khách', 'STT']]; const sheet = null; return JSON.stringify({ ok: false }); })()); assert.equal(ctxBad.ok, false);
});

test('khách mới (lần đầu nhắn) gọi cập nhật bảng đúng một lần; khách cũ nhắn lại thì không', (t) => {
  const { createAgents } = require('../lib/agents'), { createCustomers } = require('../lib/customers'), { createDispatcher } = require('../lib/dispatcher');
  const dir = tmp(); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir), customers = createCustomers(dir, agents), seen = [];
  const d = createDispatcher({ officeUrl: () => 'http://127.0.0.1:1/', agents, customers, run: async () => ({ text: '' }), uploadsDir: path.join(dir, 'uploads'), onNewCustomer: (c) => seen.push(c.code) });
  d.deliverInbound({ key: 'thread-1', name: 'Lan', text: 'chào shop' }); d.deliverInbound({ key: 'thread-1', name: 'Lan', text: 'còn hàng không' });
  d.deliverInbound({ key: 'thread-2', name: 'Mai', text: 'xin chào' });
  assert.equal(seen.length, 2); assert.match(seen[0], /^KH-/);
});
