// Hai file Excel lưu trên máy, tách riêng:
//  - kho-hang.xlsx: kho hàng (đúng định dạng bảng được nhập vào). Đây là nơi lưu chính của kho: nhập từ file Excel, link Google hoặc KiotViet
//    đều được chép về đây một lần, sau đó mẫu mới của agent được ghi thẳng vào file này (cuối đúng phân loại).
//  - khach-hang.xlsx: 2 trang tính — "Khách hàng" (ID + thông tin khách) và "Đơn đặt hàng" (đơn chờ hàng về, đã đặt, đã về, đã giao, đã huỷ).
//    Tự cập nhật mỗi khi có khách mới hoặc đơn đổi (bản sao ghi từ dữ liệu đang dùng của app).
// Cả hai nằm trong thư mục du-lieu của dữ liệu app và xuất ra được.
const fs = require('node:fs');
const path = require('node:path');

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ghi tệp an toàn: ghi ra tệp tạm rồi đổi tên, để mất điện giữa chừng không làm hỏng tệp cũ. */
function atomicWrite(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/** Trang "Khách hàng" + trang "Đơn đặt hàng". rows: kết quả buildCustomerRows; orders: kho đơn của app. */
async function buildCustomersBook({ rows, orders, ordersImgDir, sourceOf = () => '' }) {
  const ExcelJS = require('exceljs'), { fillOrdersSheet } = require('./orders');
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Khách hàng');
  const count = new Map(); for (const o of orders) if (o.custId) count.set(o.custId, (count.get(o.custId) || 0) + 1);
  ws.columns = [
    { header: 'ID khách', key: 'id', width: 16 }, { header: 'Tên khách', key: 'name', width: 28 }, { header: 'Số ĐT', key: 'phone', width: 18 },
    { header: 'Địa chỉ', key: 'address', width: 42 }, { header: 'Size', key: 'size', width: 14 }, { header: 'Số dòng đơn', key: 'orders', width: 14 },
    { header: 'Doanh thu từ khách này', key: 'revenue', width: 24, style: { numFmt: '#,##0 "₫"' } }, { header: 'Nguồn', key: 'source', width: 14 },
  ];
  ws.addRows(rows.map((r) => ({ ...r, orders: count.get(r.id) || 0, source: sourceOf(r.id) })));
  ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = 'A1:H1';
  fillOrdersSheet(wb, wb.addWorksheet('Đơn đặt hàng'), orders, ordersImgDir);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const INV_HEAD = ['STT', 'Ảnh', 'Mã SP', 'Tên sản phẩm', 'Loại', 'Phân loại màu', 'Số màu', 'Phân loại size', 'Giá (tệ)', 'GIÁ BÁN', 'Link 1688', 'Tồn kho'];
/** Tạo file kho mới theo định dạng chuẩn (cột như bảng của shop), nhóm theo loại; ảnh nhúng ở cột Ảnh. imagesDir: nơi có ảnh (item.image). */
async function createInventoryWorkbook(items, imagesDir = '') {
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('DS Sản phẩm');
  ws.addRow(INV_HEAD).font = { bold: true };
  ws.columns = [6, 14, 14, 36, 20, 24, 8, 20, 10, 14, 30, 10].map((width) => ({ width }));
  const groups = new Map(); for (const it of items) { const k = fold(it.type); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  let n = 0;
  for (const list of groups.values()) for (const it of list) {
    const row = ws.addRow([++n, '', it.sku, it.name, it.type || '', it.colors || '', it.colorCount ?? '', it.size || '', it.priceCny ?? '', it.price ?? '', it.link1688 || '', it.onHand ?? '']);
    if (it.image && imagesDir) {
      try {
        const f = path.join(imagesDir, it.image), ext = path.extname(f).slice(1).toLowerCase().replace('jpeg', 'jpg');
        const id = wb.addImage({ buffer: fs.readFileSync(f), extension: ext }); row.height = 60;
        ws.addImage(id, { tl: { col: 1, row: row.number - 1 }, ext: { width: 60, height: 60 } });
      } catch { /* ảnh hỏng: bỏ qua */ }
    }
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Giữ lại đúng trang tính kho (bỏ các trang khác như danh sách khách order) để file kho trên máy không chứa dữ liệu khách. */
async function isolateInventorySheet(source, tab = '') {
  const ExcelJS = require('exceljs'), { findHeader } = require('./inventory');
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source); else await wb.xlsx.readFile(source);
  const want = fold(tab); let keep = null;
  for (const s of wb.worksheets) { if (want && fold(s.name) !== want) continue; if (findHeader(s)) { keep = s; break; } }
  if (!keep) throw new Error(tab ? `Trang tính “${tab}” không có cột Mã SP và Tên sản phẩm.` : 'Không thấy trang tính kho: cần có hàng tiêu đề với cột “Mã SP” và “Tên sản phẩm”.');
  for (const s of [...wb.worksheets]) if (s.id !== keep.id) wb.removeWorksheet(s.id);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Bản sao tự cập nhật: mỗi chu kỳ so dấu thay đổi (stamp) với lần ghi trước, đổi thì ghi lại tệp. */
function createMirror({ file, stamp, build, intervalMs = 5000, log = () => {} }) {
  let last = '', timer = null, busy = false;
  async function flush(force = false) {
    if (busy) return false;
    const s = String(stamp());
    if (!force && s === last && fs.existsSync(file)) return false;
    busy = true;
    try { atomicWrite(file, await build()); last = s; return true; }
    catch (e) { log(`mirror ${path.basename(file)}: ${e.message}`); return false; }
    finally { busy = false; }
  }
  return { flush, file, start() { timer = setInterval(() => flush(), intervalMs); timer.unref?.(); flush(); }, stop() { clearInterval(timer); } };
}

module.exports = { atomicWrite, buildCustomersBook, createInventoryWorkbook, isolateInventorySheet, createMirror, INV_HEAD };
