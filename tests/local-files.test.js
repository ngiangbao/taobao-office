const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lf = require('../lib/local-files');
const { parseWorkbook, exportWithAdded } = require('../lib/inventory');
const { createOrders } = require('../lib/orders');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const tmp = (t, p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('file khách: 2 trang tính — Khách hàng (ID + thông tin) và Đơn đặt hàng (chờ về, đã đặt, đã giao)', async (t) => {
  const dir = tmp(t, 'tbo-lf-'), orders = createOrders(dir);
  orders.add({ custId: 'KH-AAAAA', fbName: 'Lan', sku: 'AC001', qty: 2, price: 145000, status: 'Chờ hàng về' });
  orders.add({ custId: 'KH-AAAAA', fbName: 'Lan', sku: 'AC004', status: 'Đã giao' });
  const buf = await lf.buildCustomersBook({ rows: [{ id: 'KH-AAAAA', name: 'Lan', phone: '0901', address: 'HN', size: 'M', revenue: 436800 }], orders: orders.all(), ordersImgDir: orders.imgDir, sourceOf: () => 'Messenger' });
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Khách hàng', 'Đơn đặt hàng']);
  const k = wb.getWorksheet('Khách hàng'); assert.equal(k.getRow(2).getCell(1).value, 'KH-AAAAA'); assert.equal(k.getRow(2).getCell(6).value, 2, 'số dòng đơn của khách');
  const o = wb.getWorksheet('Đơn đặt hàng'), head = o.getRow(1).values.map(String);
  assert.ok(head.includes('Tình trạng') && head.includes('ID khách'));
  assert.equal(o.rowCount, 3); assert.ok(createOrders(dir).STATUSES.includes('Chờ hàng về'));
});

test('file kho: tạo mới đúng định dạng (nhóm theo loại, tồn, ảnh), bỏ trang khách order khi chép từ file/link, thêm mẫu mới cuối nhóm', async (t) => {
  const dir = tmp(t, 'tbo-lf-'); fs.mkdirSync(path.join(dir, 'img'));
  fs.writeFileSync(path.join(dir, 'img', 'A1.png'), PNG);
  const items = [{ sku: 'A1', name: 'Áo', type: 'Áo', colors: 'Be', size: 'M', price: 100000, onHand: 5, image: 'A1.png' }, { sku: 'Q1', name: 'Quần', type: 'Quần', price: 200000, onHand: 0 }, { sku: 'A2', name: 'Áo 2', type: 'Áo', price: 120000, onHand: 2 }];
  const file = path.join(dir, 'kho-hang.xlsx'); lf.atomicWrite(file, await lf.createInventoryWorkbook(items, path.join(dir, 'img')));
  let stock = await parseWorkbook(file, { imagesDir: path.join(dir, 'anh') });
  assert.deepEqual(stock.items.map((i) => i.sku), ['A1', 'A2', 'Q1'], 'nhóm theo loại'); assert.equal(stock.items[0].onHand, 5); assert.equal(stock.items[0].image, 'A1.png');
  // ghi mẫu mới thẳng vào file (cuối nhóm Áo) và giữ ảnh cũ đúng dòng
  const out = path.join(dir, 'moi.xlsx');
  await exportWithAdded(file, [{ sku: 'A3', name: 'Áo 3', type: 'Áo', price: 99000, onHand: 7 }], out);
  stock = await parseWorkbook(out, { imagesDir: path.join(dir, 'anh2') });
  assert.deepEqual(stock.items.map((i) => i.sku), ['A1', 'A2', 'A3', 'Q1']); assert.equal(stock.items[2].onHand, 7); assert.equal(stock.items[0].image, 'A1.png');
  // chép từ bảng có thêm trang khách order: chỉ giữ trang kho
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file); wb.addWorksheet('khách order').addRow(['Tên Facebook khách hàng', 'Nguyễn Văn A']);
  const only = await lf.isolateInventorySheet(Buffer.from(await wb.xlsx.writeBuffer()));
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(only); assert.deepEqual(wb2.worksheets.map((w) => w.name), ['DS Sản phẩm']);
  await assert.rejects(lf.isolateInventorySheet(await (async () => { const w = new ExcelJS.Workbook(); w.addWorksheet('x').addRow(['a']); return Buffer.from(await w.xlsx.writeBuffer()); })()), /Mã SP/);
});

test('bản sao tự cập nhật: chỉ ghi lại khi dấu thay đổi đổi; ghi an toàn qua tệp tạm', async (t) => {
  const dir = tmp(t, 'tbo-lf-'), file = path.join(dir, 'du-lieu', 'khach-hang.xlsx'); let stamp = 'a', builds = 0;
  const m = lf.createMirror({ file, stamp: () => stamp, build: async () => { builds++; return Buffer.from(`v${builds}`); } });
  assert.equal(await m.flush(), true); assert.equal(await m.flush(), false); stamp = 'b'; assert.equal(await m.flush(), true);
  assert.equal(fs.readFileSync(file, 'utf8'), 'v2'); assert.deepEqual(fs.readdirSync(path.dirname(file)), ['khach-hang.xlsx'], 'không để lại tệp tạm');
  assert.equal(await m.flush(true), true);
});
