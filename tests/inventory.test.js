const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseWorkbook, readInventory, forAgent, exportUrl } = require('../lib/inventory');
const { createAgents } = require('../lib/agents');
const { policy } = require('../lib/tools');
const { createGooglePrivateSync } = require('../lib/google-private-sync');
const header = ['Mã hàng', 'Tên hàng', 'Size', 'Màu', 'Tồn kho'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// bảng giống bảng thật của shop: dòng 1 tiêu đề, dòng 2 "link bài gom" không có mã, ảnh nhúng ở cột Ảnh; trang 2 là khách order
async function makeBook(file) {
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('DS Nón');
  ws.addRow(['STT', 'Ảnh', 'Mã SP', 'Tên sản phẩm', 'Loại', 'Phân loại màu', 'Số màu', 'Phân loại size', 'Giá (tệ)', ' GIÁ BÁN (-50) ', 'Link 1688']);
  ws.addRow(['', '', '', '', '', 'LINK BÀI GOM']);
  ws.addRow([1, '', 'AC001', '韩国披肩', 'Áo choàng vai', 'Đen, Kem', '2', 'Đồng size', '14,5', '  145.000 ', 'https://detail.1688.com/offer/1.html']);
  ws.addRow(['', '', 'AC004', '', '', 'BE - ĐỎ']);
  ws.addRow([2, '', 'AC001', 'trùng', 'x']);
  const id = wb.addImage({ buffer: PNG, extension: 'png' });
  ws.addImage(id, { tl: { col: 1, row: 2 }, ext: { width: 20, height: 20 } }); // dòng 3 (AC001)
  const khach = wb.addWorksheet('khách order');
  khach.addRow(['STT', 'Tên Facebook khách hàng', 'Mã SP khách đặt']); khach.addRow([1, 'Nguyễn Văn A', 'AC001']);
  await wb.xlsx.writeFile(file);
}
test('đọc đúng cấu trúc kho thật: cột, giá, ảnh theo dòng, bỏ dòng không mã, không đọc trang khách order', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kho-xlsx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'kho.xlsx'); await makeBook(file);
  const stock = await parseWorkbook(file, { imagesDir: path.join(dir, 'anh') });
  assert.equal(stock.sheet, 'DS Nón');
  assert.deepEqual(stock.items.map((i) => i.sku), ['AC001', 'AC004']);
  const [a, b] = stock.items;
  assert.equal(a.type, 'Áo choàng vai'); assert.equal(a.priceCny, 14.5); assert.equal(a.price, 145000); assert.equal(a.colorCount, 2);
  assert.equal(a.image, 'AC001.png'); assert.ok(fs.existsSync(path.join(dir, 'anh', 'AC001.png')));
  assert.equal(b.image, ''); assert.equal(b.price, null);
  assert.equal(JSON.stringify(forAgent(stock)).includes('Nguyễn'), false);
  assert.equal(forAgent(stock).sanPham[0].anh, 'kho/anh/AC001.png');
  await assert.rejects(parseWorkbook(file, { tab: 'khách order' }), /Mã SP/);
});
test('chỉ nhận link docs.google.com; mất mạng thì dùng bản đã lưu và ghi rõ, chưa có bản lưu thì báo lỗi', async (t) => {
  assert.throws(() => exportUrl('https://evil.example/spreadsheets/d/abcdefghij123/edit'), /docs\.google\.com/);
  assert.match(String(exportUrl('https://docs.google.com/spreadsheets/d/abcdefghij123/edit?gid=5#gid=5')), /export\?format=xlsx/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kho-cache-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'kho.xlsx'); await makeBook(file);
  const cfg = { inventorySheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123/edit' };
  const ok = async () => ({ ok: true, url: 'https://doc-0.googleusercontent.com/x', arrayBuffer: async () => fs.readFileSync(file) });
  const fresh = await readInventory(cfg, path.join(dir, 'a'), ok);
  assert.equal(fresh.items.length, 2); assert.ok(!fresh.stale);
  const down = async () => { throw new Error('mất mạng'); };
  const old = await readInventory(cfg, path.join(dir, 'a'), down);
  assert.equal(old.stale, true); assert.match(old.staleReason, /mất mạng/);
  await assert.rejects(readInventory(cfg, path.join(dir, 'b'), down), /mất mạng/);
  await assert.rejects(readInventory({}, path.join(dir, 'c')), /Cài đặt/);
  const html = async () => ({ ok: true, url: 'https://docs.google.com/x', arrayBuffer: async () => Buffer.from('<html>login</html>') });
  await assert.rejects(readInventory(cfg, path.join(dir, 'd'), html), /bất kỳ ai|Bất kỳ ai/);
  const redirect = async () => ({ ok: true, url: 'https://evil.example/x', arrayBuffer: async () => fs.readFileSync(file) });
  await assert.rejects(readInventory(cfg, path.join(dir, 'e'), redirect), /chuyển hướng/);
});
test('@Kho hàng chọn đúng agent, không thêm trùng khi mở lại app', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-agent-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir);
  agents.ensureDefaults([{ name: 'Kho hàng', role: 'inventory' }]);
  agents.ensureDefaults([{ name: 'Kho hàng', role: 'inventory' }]);
  assert.equal(agents.list().length, 1);
  assert.equal(agents.route('@Kho hàng còn áo không?').agent.role, 'inventory');
  const rules = policy('inventory');
  assert.deepEqual(rules.allowed, ['Read']);
  assert.ok(rules.denied.includes('mcp__playwright'));
  assert.ok(rules.denied.includes('Write'));
});
test('đọc trang kho riêng tư chỉ gọi GET, tên trang có dấu nháy được escape', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, JSON.stringify({ access_token: 'fake', refresh_token: 'fake-refresh', expires_at: Date.now() + 3600000 }));
  const sync = createGooglePrivateSync({ tokenFile, safeStorage: { decryptString: b => b.toString() }, fetchImpl: async (url, options) => {
    assert.equal(options.method, undefined);
    assert.equal(options.headers.authorization, 'Bearer fake');
    assert.match(decodeURIComponent(url), /'Kho ''mới'''!A1:AZ1002/);
    return new Response(JSON.stringify({ values: [header] }));
  } });
  assert.deepEqual(await sync.readInventory({ sheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123/edit', tab: "Kho 'mới'" }), [header]);
});
