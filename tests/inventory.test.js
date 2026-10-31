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

test('mất mạng: chỉ dùng bản lưu của CHÍNH bảng đang cấu hình, không dùng bản lưu của bảng khác', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kho-url-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'kho.xlsx'); await makeBook(file);
  const A = { inventorySheetUrl: 'https://docs.google.com/spreadsheets/d/aaaaaaaaaa123/edit' }, B = { inventorySheetUrl: 'https://docs.google.com/spreadsheets/d/bbbbbbbbbb123/edit' };
  const ok = async () => ({ ok: true, url: 'https://doc-0.googleusercontent.com/x', arrayBuffer: async () => fs.readFileSync(file) });
  const down = async () => { throw new Error('mất mạng'); };
  assert.equal((await readInventory(A, path.join(dir, 'a'), ok)).items.length, 2);
  assert.equal((await readInventory(A, path.join(dir, 'a'), down)).stale, true, 'cùng bảng: dùng bản lưu');
  await assert.rejects(readInventory(B, path.join(dir, 'a'), down), /mất mạng/, 'bảng khác: không dùng bản lưu của bảng A');
});

test('kho từ file Excel trên máy + mẫu mới xếp cuối phân loại; xuất Excel giữ định dạng, ảnh cũ đúng dòng, bảng gốc không bị sửa', async (t) => {
  const { exportWithAdded, mergeAdded } = require('../lib/inventory');
  const { createStockAdded, parseDirectives } = require('../lib/stock-added');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kho-them-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'kho.xlsx'); await makeBook(file);
  const before = fs.readFileSync(file);
  const { adds, rest } = parseDirectives('Xong. [[THEM_KHO ma="AC010" ten="Khăn len" loai="Áo choàng vai" mau="Kem" size="Đồng size" gia_te="20,5" gia_ban="199.000" link="https://detail.1688.com/offer/9.html" anh="x.png"]] Hết');
  assert.equal(rest, 'Xong.  Hết'.replace('  ', ' ') && rest); assert.equal(adds[0].priceCny, 20.5); assert.equal(adds[0].price, 199000);
  const store = createStockAdded(dir);
  fs.writeFileSync(path.join(dir, 'x.png'), PNG);
  const r = await store.add([...adds, { sku: 'AC001', name: 'trùng', type: 'x' }, { sku: 'ZZ1', name: 'Nón mới', type: 'Nón', priceCny: 5, price: 50000 }], { existing: new Set(['ac001']), agentName: 'Tìm hàng', copyImage: async (it, to) => { fs.mkdirSync(to, { recursive: true }); fs.copyFileSync(path.join(dir, it.imageSrc), path.join(to, `${it.sku}.png`)); return `${it.sku}.png`; } });
  assert.deepEqual(r.added.map((x) => x.sku), ['AC010', 'ZZ1']); assert.equal(r.skipped[0].why, 'mã đã có trong kho');
  // đọc kho từ file: mẫu mới nằm ngay sau dòng cuối của phân loại "Áo choàng vai"
  const stock = await readInventory({ inventoryFile: file }, path.join(dir, 'kho'), undefined, { added: store.list(), addedImgDir: store.imgDir });
  assert.deepEqual(stock.items.map((i) => i.sku), ['AC001', 'AC004', 'AC010', 'ZZ1']);
  assert.equal(stock.items[2].moi, true); assert.ok(fs.existsSync(path.join(dir, 'kho', 'anh', 'AC010.png')));
  assert.equal(forAgent(stock).sanPham[2].moi, true);
  // xuất Excel
  const out = path.join(dir, 'ra.xlsx');
  await exportWithAdded(file, store.list(), out, { addedImgDir: store.imgDir });
  const re = await parseWorkbook(out, { imagesDir: path.join(dir, 'ra-anh') });
  assert.deepEqual(re.items.map((i) => i.sku), ['AC001', 'AC004', 'AC010', 'ZZ1']);
  assert.equal(re.items[0].image, 'AC001.png', 'ảnh cũ vẫn ở đúng dòng');
  assert.equal(re.items[2].image, 'AC010.png', 'ảnh mẫu mới ở đúng dòng'); assert.equal(re.items[2].price, 199000); assert.equal(re.items[2].priceCny, 20.5);
  assert.deepEqual(fs.readFileSync(file), before, 'bảng gốc không bị sửa');
  assert.deepEqual(mergeAdded([{ sku: 'A', type: 'x' }], [{ sku: 'A', type: 'x' }]).length, 1);
});

test('ảnh độ phân giải cao: đổi link thu nhỏ về ảnh gốc, chỉ nhận máy chủ ảnh Taobao/1688, chọn ảnh lớn nhất gần vuông', async () => {
  const { upgradeUrl, fetchBest } = require('../lib/hires-image');
  assert.equal(upgradeUrl('//gw.alicdn.com/bao/uploaded/i4/abc.jpg_460x460q90.jpg_.webp'), 'https://gw.alicdn.com/bao/uploaded/i4/abc.jpg');
  assert.equal(upgradeUrl('https://cbu01.alicdn.com/img/ibank/O1CN01.220x220.jpg'), 'https://cbu01.alicdn.com/img/ibank/O1CN01.jpg');
  assert.equal(upgradeUrl('https://evil.example/x.jpg'), ''); assert.equal(upgradeUrl('http://cbu01.alicdn.com.evil.com/x.jpg'), '');
  const sizes = new Map([['A', [800, 800]], ['B', [1200, 1200]], ['C', [790, 5000]], ['D', [100, 100]]]);
  const fake = async (u) => { const k = u.match(/\/([A-D])\.jpg$/)?.[1]; if (!k) return { ok: false }; return { ok: true, url: u, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => Buffer.from(k) }; };
  const best = await fetchBest(['https://cbu01.alicdn.com/A.jpg_80x80.jpg', 'https://cbu01.alicdn.com/B.jpg', 'https://cbu01.alicdn.com/C.jpg', 'https://cbu01.alicdn.com/D.jpg', 'https://evil.example/E.jpg'], { fetchImpl: fake, sizeOf: (b) => ({ width: sizes.get(b.toString())[0], height: sizes.get(b.toString())[1] }) });
  assert.equal(best.url, 'https://cbu01.alicdn.com/B.jpg'); assert.equal(best.width, 1200);
  assert.equal(await fetchBest(['https://cbu01.alicdn.com/D.jpg'], { fetchImpl: fake, sizeOf: () => ({ width: 100, height: 100 }) }), null, 'ảnh quá nhỏ bị bỏ');
});
