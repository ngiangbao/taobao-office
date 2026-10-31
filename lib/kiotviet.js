// Khung đồng bộ KiotViet: file này lo kết nối + phân trang + điều phối; cách đổi dữ liệu nằm ở kiotviet-map.js; hướng dẫn chỉnh ở docs/KIOTVIET.md.
// Đồng bộ MỘT CHIỀU từ KiotViet về app (KiotViet là nguồn gốc, app không ghi ngược): khách hàng và hóa đơn/đơn đặt hàng.
// Dùng API công khai của KiotViet (Public API): chủ shop lấy Client ID + Client Secret trong KiotViet (Thiết lập → Thiết lập kết nối API)
// và nhập cùng tên gian hàng (Retailer) vào app. Mỗi lượt chỉ hỏi những bản ghi đổi từ lần đồng bộ trước (lastModifiedFrom), nên khách mua
// thêm, sửa hoặc huỷ đơn trong KiotViet sẽ được cập nhật ở lượt kế tiếp. Dữ liệu khách chỉ nằm trên máy, không đưa cho agent.
const TOKEN_URL = 'https://id.kiotviet.vn/connect/token';
const API = 'https://public.kiotapi.com';
const PAGE = 100, MAX_PAGES = 200;

const { codeOf, mapCustomer, mapDocCustomer, mapDocRows, SOURCES } = require('./kiotviet-map');

function createKiotViet({ getConfig, fetchImpl = globalThis.fetch }) {
  let token = null, tokenAt = 0;
  const cfg = () => { const c = getConfig(); if (!c.retailer || !c.clientId || !c.clientSecret) throw new Error('Chưa nhập đủ Tên gian hàng, Client ID và Client Secret của KiotViet.'); return c; };

  async function getToken(force = false) {
    const c = cfg();
    if (!force && token && Date.now() - tokenAt < 50 * 60e3) return token;
    const res = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000),
      body: new URLSearchParams({ scopes: 'PublicApi.Access', grant_type: 'client_credentials', client_id: c.clientId, client_secret: c.clientSecret }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(res.status === 400 || res.status === 401 ? 'KiotViet từ chối Client ID/Client Secret. Hãy kiểm tra lại hai mã này.' : `KiotViet trả lỗi ${res.status} khi đăng nhập API.`);
    token = j.access_token; tokenAt = Date.now();
    return token;
  }

  async function get(path, params = {}, retry = true) {
    const c = cfg(), url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, v);
    const res = await fetchImpl(url, { headers: { Retailer: c.retailer, Authorization: `Bearer ${await getToken()}` }, signal: AbortSignal.timeout(30000) });
    if (res.status === 401 && retry) { token = null; return get(path, params, false); }
    if (!res.ok) throw new Error(res.status === 403 ? 'KiotViet không cho phép truy cập (kiểm tra tên gian hàng và quyền API).' : `KiotViet trả lỗi ${res.status}.`);
    return res.json();
  }

  /** Lấy mọi bản ghi đổi từ `since` (ISO) trở đi, theo trang. */
  async function listModified(path, since, extra = {}) {
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const j = await get(path, { pageSize: PAGE, currentItem: page * PAGE, orderBy: 'modifiedDate', orderDirection: 'Asc', includeTotal: true, lastModifiedFrom: since, ...extra });
      const data = Array.isArray(j.data) ? j.data : [];
      out.push(...data);
      if (data.length < PAGE || out.length >= (j.total ?? Infinity)) break;
    }
    return out;
  }

  return {
    async test() { await getToken(true); const j = await get('/customers', { pageSize: 1, includeTotal: true }); return { ok: true, customers: Number(j.total) || 0 }; },

    /** Đồng bộ: customers (kho khách của app), orders (kho đơn của app). since: ISO hoặc '' (lần đầu: lấy tất cả). Trả thống kê và mốc mới. */
    async sync({ customers, orders, since = '' }) {
      const startedAt = new Date().toISOString();
      const stats = { customers: 0, invoices: 0, orders: 0, rows: 0 };
      for (const kv of await listModified(SOURCES.customers.path, since)) { const m = mapCustomer(kv); if (m) { customers.upsertExternal(m); stats.customers++; } }
      for (const src of SOURCES.documents) {
        let list; try { list = await listModified(src.path, since); } catch (e) { if (src.optional) continue; throw e; }
        for (const doc of list) {
          const c = mapDocCustomer(doc); if (c) customers.upsertExternal(c);
          const rows = mapDocRows(src.tag, doc, src.detailKey);
          orders.replaceExt(`${src.tag}:${doc.id}:`, rows); // đơn bị sửa/huỷ trong KiotViet: thay đúng các dòng của đơn đó
          stats[src.stat]++; stats.rows += rows.length;
        }
      }
      return { ok: true, ...stats, cursor: startedAt };
    },
  };
}

module.exports = { createKiotViet, codeOf };
