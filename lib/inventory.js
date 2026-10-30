// Danh mục kho hàng (bảng Google Sheets của chủ shop): mỗi dòng là một mã sản phẩm, có ảnh nhúng trong ô "Ảnh".
// Chỉ ĐỌC bảng tính (tải bản xlsx qua liên kết xem công khai), không ghi ngược. Chỉ lấy trang tính có cột "Mã SP" và
// "Tên sản phẩm"; các trang khác (ví dụ danh sách khách order, có tên Facebook của khách) không bao giờ được đọc.
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 40 * 1024 * 1024, MAX_ITEMS = 2000, MAX_IMAGE = 5 * 1024 * 1024;
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

function exportUrl(sheetUrl) {
  let url;
  try { url = new URL(String(sheetUrl || '').trim()); } catch { throw new Error('Địa chỉ Google Sheets không hợp lệ.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') throw new Error('Chỉ chấp nhận liên kết Google Sheets (docs.google.com).');
  const m = url.pathname.match(/^\/spreadsheets\/d\/(e\/)?([\w-]{10,200})(?:\/|$)/);
  if (!m) throw new Error('Liên kết phải mở một bảng tính Google Sheets.');
  const out = new URL(m[1] ? `https://docs.google.com/spreadsheets/d/e/${m[2]}/pub` : `https://docs.google.com/spreadsheets/d/${m[2]}/export`);
  out.searchParams.set(m[1] ? 'output' : 'format', 'xlsx');
  return out;
}

const cellText = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (v.hyperlink) return String(v.hyperlink).trim();
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v).trim();
};
const num = (s) => { // "145.000" → 145000 ; "14,5" → 14.5
  const t = String(s || '').replace(/[^\d.,]/g, '');
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const COLUMNS = [ // khoá → hàm nhận diện tiêu đề (đã bỏ dấu, chữ thường)
  ['sku', (h) => h === 'ma sp' || h === 'ma san pham' || h === 'ma hang'],
  ['name', (h) => h === 'ten san pham' || h === 'ten hang'],
  ['type', (h) => h === 'loai'],
  ['colors', (h) => h.startsWith('phan loai mau')],
  ['colorCount', (h) => h === 'so mau'],
  ['size', (h) => h.startsWith('phan loai size')],
  ['priceCny', (h) => h.startsWith('gia (te')],
  ['price', (h) => h.startsWith('gia ban')],
  ['link1688', (h) => h === 'link 1688'],
  ['image', (h) => h === 'anh' || h === 'hinh anh'],
];

function findHeader(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
    const cols = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
      const h = fold(cellText(cell.value));
      for (const [key, test] of COLUMNS) if (!(key in cols) && test(h)) cols[key] = c;
    });
    if (cols.sku && cols.name) return { row: r, cols };
  }
  return null;
}

const safeName = (sku) => String(sku).replace(/[^\w-]+/g, '_').slice(0, 60) || 'sp';

/** Đọc xlsx (Buffer hoặc đường dẫn) → { items, types, sheet }; ảnh nhúng được lưu vào imagesDir/<MÃ>.<đuôi> */
async function parseWorkbook(source, { imagesDir, tab = '' } = {}) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  if (Buffer.isBuffer(source)) await wb.xlsx.load(source); else await wb.xlsx.readFile(source);
  const wanted = fold(tab);
  const sheets = wb.worksheets.filter((ws) => !wanted || fold(ws.name) === wanted);
  let ws, head;
  for (const s of sheets) { head = findHeader(s); if (head) { ws = s; break; } }
  if (!ws) throw new Error(wanted ? `Trang tính “${tab}” không có cột Mã SP và Tên sản phẩm.` : 'Không thấy trang tính kho: cần có hàng tiêu đề với cột “Mã SP” và “Tên sản phẩm”.');

  const imageByRow = new Map();
  for (const im of ws.getImages()) {
    const row = Math.floor(im.range.tl.nativeRow) + 1;
    if (!imageByRow.has(row)) imageByRow.set(row, im.imageId);
  }
  if (imagesDir) { fs.rmSync(imagesDir, { recursive: true, force: true }); fs.mkdirSync(imagesDir, { recursive: true }); }

  const { cols } = head, items = [], seen = new Set();
  const get = (row, key) => (cols[key] ? cellText(row.getCell(cols[key]).value) : '');
  for (let r = head.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r), sku = get(row, 'sku');
    if (!sku || seen.has(fold(sku))) continue;
    seen.add(fold(sku));
    if (items.length >= MAX_ITEMS) throw new Error(`Kho vượt giới hạn ${MAX_ITEMS} mã sản phẩm.`);
    const item = {
      sku, name: get(row, 'name'), type: get(row, 'type'), colors: get(row, 'colors'), colorCount: num(get(row, 'colorCount')),
      size: get(row, 'size'), priceCny: num(get(row, 'priceCny')), price: num(get(row, 'price')), link1688: get(row, 'link1688'), image: '',
    };
    const imageId = imageByRow.get(r);
    if (imagesDir && imageId != null) {
      const media = wb.getImage(imageId), ext = String(media?.extension || '').toLowerCase().replace('jpeg', 'jpg');
      if (media?.buffer && IMG_EXT.has(ext) && media.buffer.length <= MAX_IMAGE) {
        const file = `${safeName(sku)}.${ext}`;
        fs.writeFileSync(path.join(imagesDir, file), media.buffer);
        item.image = file;
      }
    }
    items.push(item);
  }
  if (!items.length) throw new Error('Trang tính kho chưa có mã sản phẩm nào.');
  const types = {};
  for (const i of items) { const t = i.type || '(chưa phân loại)'; types[t] = (types[t] || 0) + 1; }
  return { items, types, sheet: ws.name };
}

async function download(sheetUrl, fetchImpl = globalThis.fetch) {
  let res;
  try { res = await fetchImpl(exportUrl(sheetUrl), { signal: AbortSignal.timeout(90000), redirect: 'follow' }); }
  catch (e) { throw new Error(`Không tải được Google Sheets: ${e.message}`); }
  if (res.url) {
    const host = new URL(res.url).hostname;
    if (!/(^|\.)google\.com$|(^|\.)googleusercontent\.com$/.test(host)) throw new Error('Google Sheets chuyển hướng tới địa chỉ lạ, đã dừng.');
  }
  if (!res.ok) throw new Error(`Google Sheets trả lỗi ${res.status}. Hãy bật “Bất kỳ ai có liên kết đều có thể xem”.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('Bảng tính quá lớn (tối đa 40 MB).');
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('Không đọc được bảng tính. Hãy bật “Bất kỳ ai có liên kết đều có thể xem”.');
  return buf;
}

/** Tải mới mỗi lần gọi. Nếu mất mạng thì dùng bản đã lưu và ghi rõ (stale) để agent báo cho chủ shop. */
async function readInventory(cfg, baseDir, fetchImpl) {
  if (!cfg.inventorySheetUrl) throw new Error('Chưa kết nối kho hàng. Mở Cài đặt → Kho hàng để nhập link Google Sheets.');
  const imagesDir = path.join(baseDir, 'anh'), cacheFile = path.join(baseDir, 'kho.json');
  try {
    const parsed = await parseWorkbook(await download(cfg.inventorySheetUrl, fetchImpl), { imagesDir, tab: cfg.inventoryTab });
    const data = { ...parsed, fetchedAt: new Date().toISOString(), sheetUrl: cfg.inventorySheetUrl };
    fs.mkdirSync(baseDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(data));
    return data;
  } catch (e) {
    let old = null; try { old = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* chưa có bản lưu */ }
    if (old && old.sheetUrl === cfg.inventorySheetUrl) return { ...old, stale: true, staleReason: e.message }; // bản lưu của bảng KHÁC thì không dùng
    throw e;
  }
}

/** Dữ liệu gọn đưa cho agent (không kèm tên tiếng Trung dài). Đường dẫn ảnh tính từ thư mục của agent. */
function forAgent(stock, imgPrefix = 'kho/anh/') {
  return {
    sheet: stock.sheet, fetchedAt: stock.fetchedAt, ...(stock.stale ? { cuDaLuu: true, lyDo: stock.staleReason } : {}),
    tongMa: stock.items.length, theoLoai: stock.types,
    sanPham: stock.items.map((i) => ({
      ma: i.sku, loai: i.type, mau: i.colors, soMau: i.colorCount, size: i.size, giaTe: i.priceCny, giaBan: i.price,
      ten: i.name.slice(0, 40), ...(i.image ? { anh: imgPrefix + i.image } : {}),
    })),
  };
}

module.exports = { parseWorkbook, readInventory, forAgent, exportUrl, download };
