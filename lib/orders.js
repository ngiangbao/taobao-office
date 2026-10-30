// Danh sách đơn khách order (mỗi dòng là một món khách đặt), theo đúng cột trang "khách order" trong bảng của shop.
// Lưu cục bộ ở orders.json (quyền 0600) + ảnh trong orders-img/. Đây là dữ liệu thật của khách (tên, link Facebook, có thể cả địa chỉ/SĐT
// trong ghi chú): KHÔNG bao giờ đưa cho agent. Nhập từ link Google Sheets xem công khai hoặc file xlsx; xuất xlsx (có ảnh) hoặc TSV để dán vào Google Sheets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_ITEMS = 5000, IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']), MAX_IMAGE = 5 * 1024 * 1024;
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const HEAD = [ // [khoá, tiêu đề xuất ra, nhận diện tiêu đề đã bỏ dấu]
  ['custId', 'ID khách', (h) => h === 'id khach' || h === 'ma khach'],
  ['stt', 'STT', (h) => h === 'stt'],
  ['fbName', 'Tên Facebook khách hàng', (h) => h === 'ten facebook khach hang' || h === 'ten khach hang'],
  ['fbLink', 'Link Facebook khách hàng', (h) => h === 'link facebook khach hang'],
  ['sku', 'Mã SP khách đặt', (h) => h === 'ma sp khach dat' || h === 'ma sp'],
  ['image', 'Hình ảnh SP khách đặt', (h) => h === 'hinh anh sp khach dat' || h === 'hinh anh'],
  ['color', 'MÀU SẮC', (h) => h === 'mau sac' || h === 'mau'],
  ['size', 'SIZE', (h) => h === 'size'],
  ['qty', 'Số lượng', (h) => h === 'so luong'],
  ['price', 'Giá bán', (h) => h === 'gia ban'],
  ['status', 'Tình trạng', (h) => h === 'tinh trang'],
  ['link1688', 'Link sản phẩm trên 1688', (h) => h === 'link san pham tren 1688' || h === 'link 1688'],
  ['note', 'Ghi chú', (h) => h === 'ghi chu'],
  ['cmtLink', 'LINK CMT MUA HÀNG', (h) => h === 'link cmt mua hang'],
];
const TEXT_KEYS = ['custId', 'fbName', 'fbLink', 'sku', 'color', 'size', 'status', 'link1688', 'note', 'cmtLink'];
const LIMIT = { custId: 24, fbName: 120, fbLink: 400, sku: 40, color: 80, size: 40, status: 40, link1688: 400, note: 400, cmtLink: 400 };
const STATUSES = ['Đã đặt hàng', 'Đã về', 'Đã giao', 'Đã huỷ'];

const cellText = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (v.hyperlink) return String(v.hyperlink).trim();
    return '';
  }
  return String(v).trim();
};
const num = (v) => { const t = String(v ?? '').replace(/[^\d.,]/g, ''); if (!t) return null; const n = /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; };
const httpsOrEmpty = (u) => { try { const x = new URL(String(u).trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.slice(0, 400) : ''; } catch { return ''; } };

/** Chuẩn hoá một đơn từ dữ liệu nhập tay hoặc từ bảng; ném lỗi nếu thiếu thông tin tối thiểu. */
function clean(o) {
  const out = { id: o.id || crypto.randomUUID().slice(0, 10), image: String(o.image || '').replace(/[^\w.-]/g, '').slice(0, 80) };
  for (const k of TEXT_KEYS) out[k] = String(o[k] ?? '').replace(/\r/g, '').trim().slice(0, LIMIT[k]);
  out.fbLink = httpsOrEmpty(out.fbLink) || ''; out.link1688 = httpsOrEmpty(out.link1688) || out.link1688.startsWith('http') ? out.link1688 : ''; out.cmtLink = httpsOrEmpty(out.cmtLink);
  if (!/^(https?:)?\/\//.test(out.link1688)) out.link1688 = httpsOrEmpty(out.link1688);
  const qty = num(o.qty); out.qty = qty == null ? 1 : Math.max(0, Math.min(100000, Math.round(qty)));
  const price = num(o.price); out.price = price == null ? null : Math.max(0, Math.min(1e10, Math.round(price)));
  out.custId = out.custId.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!out.fbName && !out.sku && !out.custId) throw new Error('Cần ít nhất tên khách hoặc mã sản phẩm.');
  out.at = o.at || Date.now();
  return out;
}
const itemKey = (o) => JSON.stringify([o.sku, o.color, o.size, o.qty, o.price].map(fold));
const keys = (o) => {
  const item = itemKey(o), identity = [];
  if (o.custId) identity.push(`id:${o.custId}`);
  if (o.fbName) identity.push(`name:${fold(o.fbName)}`);
  if (!identity.length) identity.push('anonymous');
  return identity.map((value) => `${value}|${item}`);
};

function createOrders(dataDir) {
  const file = path.join(dataDir, 'orders.json'), imgDir = path.join(dataDir, 'orders-img');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* chưa có */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(list), { mode: 0o600 });
  return {
    imgDir, STATUSES,
    all: () => list,
    add(o) { if (list.length >= MAX_ITEMS) throw new Error(`Tối đa ${MAX_ITEMS} dòng đơn.`); const c = clean(o); list.push(c); save(); return c; },
    update(id, o) { const i = list.findIndex((x) => x.id === id); if (i < 0) throw new Error('Không thấy đơn này.'); list[i] = clean({ ...list[i], ...o, id, image: o.image ?? list[i].image, at: list[i].at }); save(); return list[i]; },
    remove(id) { const n = list.length; const gone = list.find((x) => x.id === id); list = list.filter((x) => x.id !== id); if (gone?.image) { try { fs.rmSync(path.join(imgDir, gone.image), { force: true }); } catch { /* đã xoá */ } } if (list.length !== n) save(); return list.length !== n; },
    /** Gán ID khách (KH-xxxxx) cho các dòng chưa có: cùng tên Facebook thì cùng ID; khách đã có agent trong app dùng đúng mã của agent đó.
     *  known: Map(tên đã bỏ dấu → mã). Trả [{ name, id }] các ID mới gán (để ghi lên bảng online). */
    assignIds(known = new Map()) {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', used = new Set([...list.map((o) => o.custId), ...known.values()].filter(Boolean));
      const byName = new Map(); for (const o of list) if (o.custId && o.fbName) byName.set(fold(o.fbName), o.custId);
      const out = [];
      for (const o of list) {
        if (o.custId || !o.fbName) continue;
        const k = fold(o.fbName);
        let id = byName.get(k) || known.get(k);
        if (!id) { do { id = 'KH-' + Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join(''); } while (used.has(id)); used.add(id); }
        byName.set(k, id); o.custId = id;
        if (!out.some((x) => fold(x.name) === k)) out.push({ name: o.fbName, id });
      }
      if (out.length) save();
      return out;
    },
    /** Nhập nhiều dòng. mode 'merge' bỏ dòng trùng (cùng khách, mã, màu, size, số lượng, giá); 'replace' thay toàn bộ. */
    importItems(items, mode = 'merge') {
      const base = [], seen = new Set();
      let added = 0, skipped = 0, removedDuplicates = 0;
      if (mode !== 'replace') {
        for (const item of list) {
          const duplicateKeys = keys(clean(item));
          if (duplicateKeys.some((duplicateKey) => seen.has(duplicateKey))) { removedDuplicates++; continue; }
          for (const duplicateKey of duplicateKeys) seen.add(duplicateKey);
          base.push(item);
        }
      }
      for (const it of items) {
        let c; try { c = clean(it); } catch { skipped++; continue; }
        const duplicateKeys = keys(c);
        if (duplicateKeys.some((duplicateKey) => seen.has(duplicateKey))) { skipped++; continue; }
        if (base.length >= MAX_ITEMS) { skipped++; continue; }
        for (const duplicateKey of duplicateKeys) seen.add(duplicateKey);
        base.push(c); added++;
      }
      list = base; save(); return { added, skipped, removedDuplicates, total: list.length };
    },
  };
}

/** Đọc trang "khách order" từ xlsx (Buffer hoặc đường dẫn). Ảnh nhúng ở cột "Hình ảnh SP khách đặt" được lưu vào imagesDir theo dòng. */
async function parseOrdersWorkbook(source, { imagesDir } = {}) {
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source); else await wb.xlsx.readFile(source);
  let ws, head;
  for (const s of wb.worksheets) {
    for (let r = 1; r <= Math.min(s.rowCount, 12) && !head; r++) {
      const cols = {}; s.getRow(r).eachCell({ includeEmpty: true }, (cell, c) => { const h = fold(cellText(cell.value)); for (const [k, , test] of HEAD) if (!(k in cols) && test(h)) cols[k] = c; });
      if (cols.fbName && (cols.sku || cols.custId)) { head = { row: r, cols }; ws = s; }
    }
    if (head) break;
  }
  if (!head) throw new Error('Không thấy trang đơn khách: cần hàng tiêu đề có “Tên Facebook khách hàng” và “Mã SP khách đặt”.');
  const { cols } = head;
  if (!cols.note && cols.link1688) { const c = cols.link1688 + 1; if (!fold(cellText(ws.getRow(head.row).getCell(c).value))) cols.note = c; } // cột trống sau link 1688 thường là ghi chú
  const imageByRow = new Map();
  for (const im of ws.getImages()) { const row = Math.floor(im.range.tl.nativeRow) + 1; if (!imageByRow.has(row)) imageByRow.set(row, im.imageId); }
  if (imagesDir) fs.mkdirSync(imagesDir, { recursive: true });
  const items = [];
  for (let r = head.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), get = (k) => (cols[k] ? cellText(row.getCell(cols[k]).value) : '');
    const it = {}; for (const [k] of HEAD) if (k !== 'stt' && k !== 'image') it[k] = get(k);
    if (!it.fbName && !it.sku && !it.custId) continue;
    const imageId = imageByRow.get(r);
    if (imagesDir && imageId != null) {
      const media = wb.getImage(imageId), ext = String(media?.extension || '').toLowerCase().replace('jpeg', 'jpg');
      if (media?.buffer && IMG_EXT.has(ext) && media.buffer.length <= MAX_IMAGE) {
        const name = `${crypto.randomUUID().slice(0, 10)}.${ext}`; fs.writeFileSync(path.join(imagesDir, name), media.buffer); it.image = name;
      }
    }
    items.push(it);
    if (items.length > MAX_ITEMS) throw new Error(`Bảng có hơn ${MAX_ITEMS} dòng đơn.`);
  }
  return items;
}

/** Xuất xlsx giống trang "khách order" (có STT, ảnh). Trả Buffer. */
async function buildWorkbook(items, imagesDir) {
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('khách order');
  ws.addRow(HEAD.map(([, title]) => title)).font = { bold: true };
  ws.columns = HEAD.map(([k]) => ({ width: k === 'image' ? 14 : k === 'fbName' || k === 'link1688' || k === 'fbLink' || k === 'cmtLink' ? 30 : k === 'note' ? 36 : 14 }));
  items.forEach((o, i) => {
    const row = ws.addRow(HEAD.map(([k]) => (k === 'stt' ? i + 1 : k === 'image' ? '' : k === 'qty' ? o.qty : k === 'price' ? o.price : o[k] || '')));
    if (o.image && imagesDir) {
      try {
        const f = path.join(imagesDir, o.image), ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
        const id = wb.addImage({ buffer: fs.readFileSync(f), extension: ext }); row.height = 60;
        ws.addImage(id, { tl: { col: 4, row: row.number - 1 }, ext: { width: 70, height: 70 } });
      } catch { /* ảnh hỏng: bỏ qua */ }
    }
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
/** Dạng bảng (TSV) để dán thẳng vào Google Sheets; không kèm ảnh. */
function toTsv(items) {
  const esc = (v) => { const t = String(v ?? ''); return /[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [HEAD.map(([, t]) => t), ...items.map((o, i) => HEAD.map(([k]) => (k === 'stt' ? i + 1 : k === 'image' ? '' : o[k] ?? '')))].map((r) => r.map(esc).join('\t')).join('\n');
}
module.exports = { createOrders, parseOrdersWorkbook, buildWorkbook, toTsv, clean, STATUSES, HEAD };
