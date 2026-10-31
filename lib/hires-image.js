// Ảnh sản phẩm độ phân giải cao nhất: đổi link thu nhỏ của Taobao/1688 về link ảnh gốc, tải các ứng viên rồi chọn ảnh lớn nhất.
// Chỉ tải từ máy chủ ảnh của Taobao/1688 (https), giới hạn dung lượng, kiểm tra đúng là ảnh.
const HOST_OK = /(^|\.)(alicdn\.com|taobaocdn\.com|tbcdn\.cn|1688\.com|taobao\.com|tmall\.com)$/i;
const MAX_BYTES = 8 * 1024 * 1024, MAX_CANDIDATES = 12, MIN_SIDE = 300;

const allowed = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && HOST_OK.test(x.hostname); } catch { return false; } };

/** "...abc.jpg_460x460q90.jpg_.webp" → "...abc.jpg"; "...abc.220x220.jpg" → "...abc.jpg"; "//host/x.jpg" → "https://host/x.jpg" */
function upgradeUrl(url) {
  let u = String(url || '').trim();
  if (u.startsWith('//')) u = 'https:' + u;
  u = u.replace(/^http:\/\//i, 'https://').split('#')[0];
  if (!allowed(u)) return '';
  u = u.replace(/\?.*$/, '');
  u = u.replace(/(\.(?:jpe?g|png|webp))_[^/]*$/i, '$1');
  u = u.replace(/\.\d+x\d+[a-z0-9]*\.(jpe?g|png|webp)$/i, '.$1');
  return u;
}

const extOf = (type, url) => { const t = String(type || '').toLowerCase(); if (t.includes('png')) return 'png'; if (t.includes('webp')) return 'webp'; if (t.includes('gif')) return 'gif'; if (t.includes('jpeg') || t.includes('jpg')) return 'jpg'; const m = String(url).match(/\.(jpe?g|png|webp|gif)$/i); return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : ''; };

/**
 * urls: danh sách ứng viên (đã hoặc chưa phóng to). sizeOf(buffer) → { width, height }. Chọn ảnh có nhiều điểm ảnh nhất trong các ảnh gần vuông
 * (loại ảnh mô tả dài/ảnh quảng cáo ngang); không có ảnh gần vuông thì lấy ảnh lớn nhất. Trả { buf, ext, width, height, url } hoặc null.
 */
async function fetchBest(urls, { fetchImpl = globalThis.fetch, sizeOf } = {}) {
  const seen = new Set(), cands = [];
  for (const raw of urls) { const u = upgradeUrl(raw); if (u && !seen.has(u)) { seen.add(u); cands.push(u); } if (cands.length >= MAX_CANDIDATES) break; }
  const got = [];
  for (const u of cands) {
    try {
      const res = await fetchImpl(u, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
      if (!res.ok) continue;
      if (res.url && !allowed(res.url)) continue;
      const type = res.headers?.get?.('content-type') || '';
      if (!/^image\//i.test(type)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) continue;
      const { width, height } = sizeOf(buf) || {};
      if (!width || !height || Math.min(width, height) < MIN_SIDE) continue;
      got.push({ buf, ext: extOf(type, u), width, height, url: u });
    } catch { /* ứng viên này lỗi: thử ảnh khác */ }
  }
  const square = got.filter((g) => { const r = g.width / g.height; return r >= 0.6 && r <= 1.7; });
  const pool = square.length ? square : got;
  return pool.sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
}

module.exports = { upgradeUrl, fetchBest, allowed };
