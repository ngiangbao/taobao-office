// Tự thêm dòng vào bảng Google Sheets ONLINE của chủ shop khi có khách mới (hoặc đơn nhập tay), không cần Google Cloud/OAuth:
// chủ shop dán một đoạn Apps Script ngắn vào chính bảng của mình, triển khai thành "ứng dụng web", rồi dán địa chỉ + mật khẩu vào app.
// App gửi POST tới địa chỉ đó; mọi dòng chưa gửi được nằm trong orders-outbox.json và được gửi lại sau.
const fs = require('node:fs');
const path = require('node:path');

const HOST_OK = /^script\.google\.com$/;
const REDIRECT_OK = /(^|\.)(google\.com|googleusercontent\.com)$/;
const MAX_OUTBOX = 200;

function webhookUrl(value) {
  let u; try { u = new URL(String(value || '').trim()); } catch { throw new Error('Địa chỉ ứng dụng web không hợp lệ.'); }
  if (u.protocol !== 'https:' || !HOST_OK.test(u.hostname) || !/^\/macros\/s\/[\w-]{10,200}\/exec$/.test(u.pathname)) throw new Error('Địa chỉ phải có dạng https://script.google.com/macros/s/…/exec');
  return u;
}

function createAppender({ dataDir, getCfg, fetchImpl = globalThis.fetch, log = () => {} }) {
  const file = path.join(dataDir, 'orders-outbox.json');
  let box = []; try { box = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* chưa có */ }
  let sending = false, timer = null, last = { ok: null, at: 0, error: '' };
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(box), { mode: 0o600 }); } catch { /* thư mục chưa sẵn sàng */ } };

  async function post(rows) {
    const cfg = getCfg();
    const res = await fetchImpl(webhookUrl(cfg.ordersWebhookUrl), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ token: String(cfg.ordersWebhookToken || ''), sheet: cfg.ordersSheetName || 'khách order', rows }) });
    if (res.url && !REDIRECT_OK.test(new URL(res.url).hostname)) throw new Error('Google chuyển hướng tới địa chỉ lạ, đã dừng.');
    const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch { /* không phải JSON */ }
    if (!res.ok || !j) throw new Error(`Google trả lỗi ${res.status}${/<html/i.test(text) ? ' (có thể chưa triển khai đúng, hoặc quyền truy cập chưa là “Bất kỳ ai”)' : ''}`);
    if (!j.ok) throw new Error(String(j.error || 'bị từ chối').slice(0, 120));
    return j;
  }
  let inflight = null;
  function flush() { // một lượt gửi tại một thời điểm; gọi lúc đang gửi thì chờ lượt đó xong
    if (inflight) return inflight;
    inflight = run().finally(() => { inflight = null; });
    return inflight;
  }
  async function run() {
    if (!box.length) return last;
    sending = true;
    try {
      const batch = box.slice(0, 20); await post(batch.map(({ cells, once, key, fill }) => ({ cells, once, key, fill })));
      box = box.slice(batch.length); save(); last = { ok: true, at: Date.now(), error: '' };
      if (box.length) { sending = false; return run(); }
    } catch (e) { last = { ok: false, at: Date.now(), error: e.message }; log(`[sheet] ${e.message}`); }
    finally { sending = false; }
    return last;
  }
  return {
    /** cells: { "tiêu đề cột": giá trị }; once: bỏ qua nếu bảng đã có dòng cùng key ở cột ID khách. Không làm gì nếu chưa cấu hình. */
    enqueue(cells, { key = '', once = false, fill = false } = {}) {
      const cfg = getCfg();
      if (!cfg.ordersWebhookUrl || cfg.ordersAutoAppend === false) return false;
      if (box.some((b) => b.key && b.key === key)) return true;
      box.push({ key, once, fill, cells, at: Date.now() }); if (box.length > MAX_OUTBOX) box = box.slice(-MAX_OUTBOX); save();
      flush(); return true;
    },
    flush, pending: () => box.length, status: () => ({ ...last, pending: box.length }),
    /** gửi thử: không ghi dòng nào, chỉ kiểm tra địa chỉ + mật khẩu */
    async test() { try { await post([]); last = { ok: true, at: Date.now(), error: '' }; return { ok: true }; } catch (e) { last = { ok: false, at: Date.now(), error: e.message }; return { ok: false, error: e.message }; } },
    start() { clearInterval(timer); timer = setInterval(() => { if (box.length) flush(); }, 60e3); timer.unref?.(); },
    stop() { clearInterval(timer); },
  };
}

const APPS_SCRIPT = `// Dán vào Tiện ích mở rộng → Apps Script của bảng tính. Đổi MAT_KHAU, chạy hàm caiDat một lần (cấp quyền),
// rồi Triển khai → Triển khai mới → Ứng dụng web (Thực thi bằng: Tôi; Ai có quyền truy cập: Bất kỳ ai). Dán địa chỉ /exec và MAT_KHAU vào app.
const MAT_KHAU = 'DOI-MAT-KHAU-NAY';
const TEN_TRANG = 'khách order';
function caiDat() { // thêm cột "ID khách" vào trước STT nếu chưa có
  const sh = SpreadsheetApp.getActive().getSheetByName(TEN_TRANG);
  if (String(sh.getRange(1, 1).getValue()).trim().toLowerCase() !== 'id khách') { sh.insertColumnBefore(1); sh.getRange(1, 1).setValue('ID khách'); }
}
function doPost(e) {
  const out = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.token !== MAT_KHAU) return out({ ok: false, error: 'sai mật khẩu' });
    const sh = SpreadsheetApp.getActive().getSheetByName(d.sheet || TEN_TRANG);
    if (!sh) return out({ ok: false, error: 'không thấy trang ' + (d.sheet || TEN_TRANG) });
    lock.waitLock(20000);
    const width = sh.getLastColumn(), head = sh.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim().toLowerCase());
    const col = (t) => head.indexOf(String(t).trim().toLowerCase());
    const watch = ['id khách', 'stt', 'tên facebook khách hàng', 'mã sp khách đặt'].map(col).filter((i) => i >= 0);
    const rows = Math.max(sh.getLastRow(), 1), data = sh.getRange(1, 1, rows, width).getValues();
    let last = 1, stt = 0;
    data.forEach((r, i) => { if (i > 0 && watch.some((c) => String(r[c]).trim() !== '')) last = i + 1; });
    const iStt = col('stt'), iId = col('id khách');
    if (iStt >= 0) data.forEach((r, i) => { if (i > 0 && Number(r[iStt]) > stt) stt = Number(r[iStt]); });
    const have = iId >= 0 ? data.map((r) => String(r[iId]).trim()) : [];
    let added = 0;
    (d.rows || []).forEach((r) => {
      const id = r.cells && r.cells['ID khách'];
      if (r.fill) { // gán ID cho các dòng đã có của khách này mà chưa có ID
        const iName = col('Tên Facebook khách hàng'), want = String(r.cells['Tên Facebook khách hàng'] || '').trim().toLowerCase();
        if (iName >= 0 && iId >= 0 && id) data.forEach((row, i) => { if (i > 0 && String(row[iName]).trim().toLowerCase() === want && String(row[iId]).trim() === '') { sh.getRange(i + 1, iId + 1).setValue(id); added++; } });
        return;
      }
      if (r.once && id && have.indexOf(String(id)) >= 0) return;
      last++; added++;
      if (iStt >= 0) sh.getRange(last, iStt + 1).setValue(++stt);
      Object.keys(r.cells || {}).forEach((t) => { const c = col(t); if (c >= 0 && t.toLowerCase() !== 'stt') sh.getRange(last, c + 1).setValue(r.cells[t]); });
      if (id) have.push(String(id));
    });
    return out({ ok: true, added: added });
  } catch (err) { return out({ ok: false, error: String(err) }); }
  finally { try { lock.releaseLock(); } catch (x) {} }
}
`;
module.exports = { createAppender, webhookUrl, APPS_SCRIPT };
