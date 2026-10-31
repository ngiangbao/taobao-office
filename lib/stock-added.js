// Mẫu mới do agent "Tìm hàng" thêm vào kho. Bảng gốc (file Excel hoặc link Google Sheets) KHÔNG bị sửa:
// mẫu mới nằm ở kho-them.json, khi đọc kho thì được xếp ngay sau dòng cuối của đúng phân loại; "Xuất Excel" ghi chúng
// vào bản sao của bảng gốc, đúng định dạng của bảng.
const fs = require('node:fs');
const path = require('node:path');

const DIRECTIVE = /\[\[THEM_KHO([^\]]*)\]\]/gi;
const MAX_PER_DAY = 30, MAX_TOTAL = 500;
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v) => { const t = String(v ?? '').replace(/[^\d.,]/g, ''); if (!t) return null; const n = /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** [[THEM_KHO ma="AC010" ten="..." loai="Áo choàng vai" mau="Đen, Kem" size="Đồng size" gia_te="14,5" gia_ban="145000" link="https://…" anh="duong/dan.jpg"]] */
function parseDirectives(text) {
  const adds = [];
  const rest = String(text).replace(DIRECTIVE, (_, attrs) => {
    const a = {}; for (const m of attrs.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) a[m[1].toLowerCase()] = m[2];
    adds.push({ sku: clean(a.ma, 40), name: clean(a.ten, 120), type: clean(a.loai, 60), colors: clean(a.mau, 120), size: clean(a.size, 80), priceCny: num(a.gia_te), price: num(a.gia_ban), link1688: clean(a.link, 300), imageSrc: clean(a.anh, 300), imageUrls: String(a.anh_url || '').split(/[|\s]+/).filter((u) => /^https:\/\//i.test(u)).slice(0, 12) });
    return '';
  }).trim();
  return { adds, rest };
}

function createStockAdded(dataDir) {
  const file = path.join(dataDir, 'kho-them.json'), imgDir = path.join(dataDir, 'kho-them', 'anh');
  let list = []; try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* chưa có */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(list, null, 2), { mode: 0o600 });
  return {
    imgDir,
    list: () => list,
    /** existing: các mã đã có trong kho (đã bỏ dấu/chữ thường). Trả { added, skipped:[{sku,why}] } */
    async add(items, { existing = new Set(), agentName = '', copyImage = async () => '' } = {}) {
      const added = [], skipped = [], today = new Date().toDateString();
      let perDay = list.filter((x) => new Date(x.at).toDateString() === today).length;
      for (const it of items) {
        if (!it.sku || !/^[\p{L}\p{N}_.\-\/ ]+$/u.test(it.sku)) { skipped.push({ sku: it.sku || '(trống)', why: 'thiếu hoặc sai mã SP' }); continue; }
        if (!it.name && !it.type) { skipped.push({ sku: it.sku, why: 'thiếu tên và loại' }); continue; }
        const k = fold(it.sku);
        if (existing.has(k) || list.some((x) => fold(x.sku) === k)) { skipped.push({ sku: it.sku, why: 'mã đã có trong kho' }); continue; }
        if (list.length >= MAX_TOTAL || perDay >= MAX_PER_DAY) { skipped.push({ sku: it.sku, why: 'quá giới hạn mẫu thêm mỗi ngày' }); continue; }
        let image = ''; try { image = (await copyImage(it, imgDir)) || ''; } catch { /* không có ảnh */ }
        const { imageSrc, imageUrls, ...rest } = it;
        const rec = { ...rest, type: it.type || '(chưa phân loại)', colorCount: null, image, by: agentName, at: Date.now() };
        list.push(rec); added.push(rec); perDay++;
      }
      if (added.length) { fs.mkdirSync(path.dirname(file), { recursive: true }); save(); }
      return { added, skipped };
    },
    /** Sau khi mẫu mới đã được ghi vào file kho trên máy: xoá danh sách tạm và ảnh tạm. */
    clear() { list = []; save(); try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch { /* chưa có ảnh */ } },
    remove(sku) { const n = list.length; list = list.filter((x) => fold(x.sku) !== fold(sku)); if (list.length !== n) save(); return list.length !== n; },
  };
}

module.exports = { createStockAdded, parseDirectives, fold };
