// Kiểm thử độ bền: văn phòng chết phải báo lỗi rõ và nhanh; Dừng tất cả phải huỷ cả hàng đợi; nhận diện chế độ dev.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startOffice } = require('../lib/office');
const { isPackagedApp } = require('../lib/runtime');
const { createAgents } = require('../lib/agents');
const { createDispatcher } = require('../lib/dispatcher');

process.env.TBO_OFFICE_PORT_BASE = '4420'; // mỗi tệp kiểm thử một dải cổng riêng
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-r-'));

test('văn phòng chết ngay khi khởi động: báo lỗi trong vài giây, kèm nội dung lỗi, không treo 30 giây', async () => {
  const office = tmp(), data = tmp();
  fs.mkdirSync(path.join(office, 'server'));
  fs.writeFileSync(path.join(office, 'server', 'index.mjs'), "console.error('boom: thiếu gói next'); process.exit(3);");
  const t0 = Date.now();
  await assert.rejects(startOffice({ isPackaged: false }, data, { dir: office }), (e) => /mã 3/.test(e.message) && /boom: thiếu gói next/.test(e.message));
  assert.ok(Date.now() - t0 < 8000, `phải báo lỗi nhanh, mất ${Date.now() - t0} ms`);
});

test('thiếu thư mục văn phòng: báo lỗi ngay, nêu rõ đường dẫn', async () => {
  const data = tmp(), t0 = Date.now();
  await assert.rejects(startOffice({ isPackaged: false }, data, { dir: '/khong/co/thu/muc' }), /Không thấy văn phòng ở \/khong\/co\/thu\/muc/);
  assert.ok(Date.now() - t0 < 1500);
});

test('văn phòng khỏe: trả địa chỉ chạy được', async () => {
  const office = tmp(), data = tmp();
  fs.mkdirSync(path.join(office, 'server'));
  fs.writeFileSync(path.join(office, 'server', 'index.mjs'), "import http from 'node:http'; http.createServer((q,r)=>r.end('ok')).listen(Number(process.env.OFFICE_PORT),'127.0.0.1');");
  const o = await startOffice({ isPackaged: false }, data, { dir: office });
  try { assert.equal((await fetch(o.url + 'health')).status, 200); } finally { o.child.kill(); }
});

test('nhận diện chế độ dev: chạy `electron .` (defaultApp) không bao giờ bị coi là bản đóng gói, kể cả khi isPackaged báo true', () => {
  const was = process.defaultApp;
  try {
    process.defaultApp = true; assert.equal(isPackagedApp({ isPackaged: true }), false);
    process.defaultApp = undefined; assert.equal(isPackagedApp({ isPackaged: true }), true);
    assert.equal(isPackagedApp({ isPackaged: false }), false);
  } finally { process.defaultApp = was; }
});

test('Dừng tất cả: việc đang xếp hàng bị huỷ, việc đang chạy bị cắt không đăng lỗi, không giao việc tiếp', async () => {
  const dir = tmp(), posts = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); if (req.method === 'POST') { posts.push(JSON.parse(b)); res.end('{"ok":true}'); } else res.end('{"ok":true,"msgs":[]}'); }); });
  await new Promise((r) => srv.listen(0, r));
  const agents = createAgents(dir); const a = agents.add({ name: 'Tìm hàng', role: 'search' }); agents.add({ name: 'Báo giá', role: 'quote' });
  const started = []; let release;
  const run = (agent, text) => { started.push(text); return new Promise((r) => { release = () => r({ text: '', error: 'bị kill' }); }); };
  const d = createDispatcher({ officeUrl: () => `http://127.0.0.1:${srv.address().port}/`, agents, run, uploadsDir: dir, onStatus() {}, history: null });
  const j1 = d.enqueue(a, 'việc 1'); d.enqueue(a, 'việc 2'); d.enqueue(a, 'việc 3');
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(started, ['việc 1'], 'chỉ việc đầu đang chạy');
  d.cancelAll();            // bấm Dừng tất cả
  release();                // tiến trình bị kill: run trả lỗi
  await j1; await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(started, ['việc 1'], 'việc 2 và 3 không được chạy sau khi Dừng tất cả');
  assert.ok(!posts.some((p) => /gặp lỗi/.test(p.text || '')), 'không đăng lỗi vì chủ động dừng');
  assert.equal(d.anyBusy(), false);
  const j4 = d.enqueue(a, 'việc mới sau khi dừng'); release = null; await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(started, ['việc 1', 'việc mới sau khi dừng'], 'việc giao SAU khi dừng vẫn chạy bình thường');
  srv.close();
});
