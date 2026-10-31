// Thư mục ẢNH SẢN PHẨM dùng chung: <dữ liệu>/anh-san-pham. Các agent bị giới hạn trong thư mục riêng (kho hàng, người đăng...) vẫn đọc được
// nơi này (--add-dir) và Người đăng được tải ảnh từ đây lên Facebook. Agent khách hàng KHÔNG được cấp quyền.
const fs = require('node:fs');
const path = require('node:path');

const IMG = /\.(jpe?g|png|gif|webp)$/i;
const dirOf = (dataDir) => path.join(dataDir, 'anh-san-pham');

/** Chép một ảnh vào thư mục chung (thư mục con tuỳ chọn); chỉ chép khi khác kích thước. Trả đường dẫn đầy đủ hoặc '' nếu không chép được. */
function share(dataDir, file, sub = '') {
  try {
    if (!IMG.test(file)) return '';
    const to = path.join(dirOf(dataDir), ...(sub ? [sub] : []));
    fs.mkdirSync(to, { recursive: true });
    const dest = path.join(to, path.basename(file));
    let same = false; try { same = fs.statSync(dest).size === fs.statSync(file).size; } catch { /* chưa có */ }
    if (!same) fs.copyFileSync(file, dest);
    return dest;
  } catch { return ''; }
}

/** Chép cả thư mục ảnh kho vào anh-san-pham/kho (đã có thì bỏ qua). */
function mirror(dataDir, srcDir, sub = 'kho') {
  let n = 0;
  try { for (const f of fs.readdirSync(srcDir)) if (share(dataDir, path.join(srcDir, f), sub)) n++; } catch { /* chưa có ảnh */ }
  return n;
}


const LOW_SIDE = 600; // cạnh ngắn dưới mức này (px) thì coi là ảnh chất lượng thấp, cần tìm ảnh nét hơn
const safeSku = (sku) => String(sku || '').normalize('NFC').replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 60);
/** tên chuẩn: MÃ_001.jpg, MÃ_002.jpg... */
const nameOf = (sku, n, ext) => `${safeSku(sku)}_${String(n).padStart(3, '0')}.${String(ext || 'jpg').replace(/^\./, '').toLowerCase().replace('jpeg', 'jpg')}`;
const regFile = (dataDir) => path.join(dirOf(dataDir), '.da-thay.json'); // mã đã được thay bằng ảnh nét hơn: không bị ảnh kho ghi đè
const replaced = (dataDir) => { try { return new Set(JSON.parse(fs.readFileSync(regFile(dataDir), 'utf8'))); } catch { return new Set(); } };

/** Ghi ảnh thứ n của mã (xoá bản cũ cùng số thứ tự khác đuôi). Trả đường dẫn đầy đủ. */
function put(dataDir, sku, n, buf, ext) {
  const to = path.join(dirOf(dataDir), 'san-pham'); fs.mkdirSync(to, { recursive: true });
  const name = nameOf(sku, n, ext), stem = name.replace(/\.[^.]+$/, '');
  for (const f of fs.readdirSync(to)) if (f !== name && f.replace(/\.[^.]+$/, '') === stem) fs.rmSync(path.join(to, f), { force: true });
  fs.writeFileSync(path.join(to, name), buf); return path.join(to, name);
}

/**
 * Đồng bộ ảnh kho vào anh-san-pham/san-pham, đặt tên theo mã SP (MÃ_001.jpg). Mã đã được thay ảnh nét hơn thì giữ nguyên.
 * sizeOf(buffer) → {width,height}. Trả Map mã → { file, low, width, height }.
 */
function syncStock(dataDir, items, imagesDir, sizeOf = () => ({})) {
  const out = new Map(), keep = replaced(dataDir);
  for (const it of items) {
    if (!it.image || !it.sku) continue;
    try {
      const src = path.join(imagesDir, it.image);
      const to = path.join(dirOf(dataDir), 'san-pham'); fs.mkdirSync(to, { recursive: true });
      const name = nameOf(it.sku, 1, path.extname(it.image));
      let file = path.join(to, name);
      if (keep.has(safeSku(it.sku))) { const ex = fs.readdirSync(to).find((f) => f.startsWith(safeSku(it.sku) + '_001.')); if (ex) file = path.join(to, ex); }
      else { let same = false; try { same = fs.statSync(file).size === fs.statSync(src).size; } catch { /* chưa có */ } if (!same) put(dataDir, it.sku, 1, fs.readFileSync(src), path.extname(it.image)); }
      let w = 0, h = 0; try { ({ width: w, height: h } = sizeOf(fs.readFileSync(file)) || {}); } catch { /* không đọc được kích thước */ }
      out.set(it.sku, { file, low: !!(w && h && Math.min(w, h) < LOW_SIDE), width: w, height: h });
    } catch { /* ảnh này lỗi: bỏ qua */ }
  }
  return out;
}

/** Đánh dấu mã đã được thay ảnh (syncStock sẽ không ghi đè). */
function markReplaced(dataDir, sku) { const s = replaced(dataDir); s.add(safeSku(sku)); fs.mkdirSync(dirOf(dataDir), { recursive: true }); fs.writeFileSync(regFile(dataDir), JSON.stringify([...s])); }

/** [[DOI_ANH ma="AC001" anh_url="https://…|https://…" link="https://…"]] → { jobs:[{sku, urls, link}], rest } */
function parseReplace(text) {
  const jobs = [];
  const rest = String(text).replace(/\[\[DOI_ANH([^\]]*)\]\]/gi, (_, attrs) => {
    const a = {}; for (const m of attrs.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) a[m[1].toLowerCase()] = m[2];
    const sku = String(a.ma || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 40);
    if (sku) jobs.push({ sku, urls: String(a.anh_url || '').split(/[|\s]+/).filter(Boolean).slice(0, 12), link: String(a.link || '').trim().slice(0, 300) });
    return '';
  }).trim();
  return { jobs, rest };
}

module.exports = { dirOf, share, mirror, IMG, LOW_SIDE, safeSku, nameOf, put, syncStock, markReplaced, parseReplace };
