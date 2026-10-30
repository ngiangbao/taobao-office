// Hàng chờ duyệt, bảng quyền công cụ, ảnh vào khung chat, tự tìm hàng khi chủ shop gửi ảnh. Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { policy, WRITE } = require('../lib/tools');
const { createApprovals, parseProposals } = require('../lib/approvals');
const { createAgents } = require('../lib/agents');
const { createDispatcher } = require('../lib/dispatcher');
const { createCustomers } = require('../lib/customers');
const { createRevenue } = require('../lib/revenue');

const { afterEach } = require('node:test');
const opened = [];
afterEach(() => { while (opened.length) { try { opened.pop().close(); } catch { /* đã đóng */ } } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-a-'));
const P = 'mcp__playwright__';
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function setup(runImpl, cfg = {}, { withMsgs = false } = {}) {
  const dir = tmp(), posts = [], msgs = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); if (req.method === 'POST') { posts.push(JSON.parse(b)); res.end('{"ok":true}'); } else res.end(JSON.stringify({ ok: true, msgs })); }); });
  await new Promise((r) => srv.listen(0, r));
  const agents = createAgents(dir), customers = createCustomers(dir, agents), revenue = createRevenue(dir), approvals = createApprovals(dir);
  const post = agents.add({ name: 'Đăng bài', role: 'post' }), search = agents.add({ name: 'Tìm hàng', role: 'search' }), quote = agents.add({ name: 'Báo giá', role: 'quote' });
  const runs = [], published = [];
  const run = async (agent, text, opts) => { runs.push({ agent, text, opts }); return runImpl(agent, text, opts, runs); };
  const publisher = async (item) => { published.push(item); return { text: 'ĐÃ ĐĂNG: https://www.facebook.com/groups/x/posts/1' }; };
  const full = { publishGapSeconds: 0, photoSearchSeconds: 0.15, maxPostsPerDay: 12, ...cfg };
  const d = createDispatcher({ officeUrl: () => `http://127.0.0.1:${srv.address().port}/`, agents, customers, revenue, approvals, publisher, toJpeg: async () => JPEG, run, uploadsDir: path.join(dir, 'uploads'), onStatus() {}, history: null, getCfg: () => full });
  const idle = async () => { for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 25)); if (!d.anyBusy()) { await new Promise((r) => setTimeout(r, 50)); if (!d.anyBusy()) return; } } };
  const env = { dir, agents, approvals, customers, post, search, quote, runs, published, posts, msgs, d, idle, srv, close: () => { d.stop(); srv.closeAllConnections?.(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
  opened.push(env); return env;
}

test('bảng quyền: agent thường không có công cụ ghi trên trình duyệt; chỉ lượt người đăng mới có', () => {
  const team = policy('team', { scroll: true });
  for (const t of ['click', 'type', 'fill_form', 'file_upload', 'evaluate', 'run_code_unsafe', 'drag', 'select_option', 'handle_dialog', 'drop']) {
    assert.ok(team.denied.includes(P + 'browser_' + t), t + ' phải bị cấm');
    assert.ok(!team.allowed.includes(P + 'browser_' + t), t + ' không được nằm trong danh sách cho phép');
  }
  assert.ok(team.denied.includes('Bash') && team.allowed.includes(P + 'browser_snapshot') && team.allowed.includes(P + 'browser_navigate'));
  assert.ok(team.allowed.includes(P + 'browser_press_key'), 'có lớp chặn phím thì được cuộn trang');
  const noGate = policy('team', { scroll: false });
  assert.ok(!noGate.allowed.includes(P + 'browser_press_key') && noGate.denied.includes(P + 'browser_press_key'), 'lớp chặn phím hỏng thì không có phím nào');
  assert.ok(policy('publisher').allowed.includes('mcp__playwright') && !policy('publisher').denied.some((t) => t.startsWith(P)));
  assert.ok(policy('customer').denied.includes('mcp__playwright') && !policy('customer').allowed.some((t) => t.startsWith('mcp__')));
  const reader = policy('reader', { scroll: true });
  assert.ok(reader.allowed.includes(P + 'browser_click') && !reader.denied.includes(P + 'browser_click'));
  for (const t of ['browser_type', 'browser_fill_form', 'browser_evaluate', 'browser_run_code_unsafe']) assert.ok(reader.denied.includes(P + t));
  for (const k of ['team', 'reader', 'publisher', 'customer']) assert.ok(policy(k).denied.includes('Bash'));
  assert.ok(WRITE.length >= 10);
});

test('lớp chặn phím: Enter/Tab/tổ hợp bị chặn, phím cuộn qua, người đăng được miễn', () => {
  const run = (key, env = {}) => spawnSync(process.execPath, [path.join(__dirname, '../lib/gate-hook.js')], { input: JSON.stringify({ tool_name: P + 'browser_press_key', tool_input: { key } }), env: { ...process.env, ...env } }).status;
  for (const k of ['Enter', 'Control+Enter', 'Tab', 'Meta+Enter', 'Space', '']) assert.equal(run(k), 2, k + ' phải bị chặn');
  for (const k of ['PageDown', 'PageUp', 'End', 'Home', 'ArrowDown', 'ArrowUp']) assert.equal(run(k), 0, k + ' phải qua');
  assert.equal(run('Enter', { TBO_PUBLISHER: '1' }), 0);
  assert.equal(spawnSync(process.execPath, [path.join(__dirname, '../lib/gate-hook.js')], { input: JSON.stringify({ tool_name: P + 'browser_click', tool_input: {} }) }).status, 0, 'công cụ khác không thuộc việc của hook này');
});

test('kho đề xuất: kiểm tra chặt đích, nội dung, ảnh; khoá nội dung khi duyệt; hạn mức; hồi phục khi app tắt giữa chừng', () => {
  const dir = tmp(); fs.mkdirSync(path.join(dir, 'uploads')); fs.writeFileSync(path.join(dir, 'uploads', 'a.jpg'), 'x'); const outside = path.join(os.tmpdir(), 'ngoai-' + Date.now() + '.jpg'); fs.writeFileSync(outside, 'x');
  const ap = createApprovals(dir), base = { agentId: 'a', agentName: 'Đăng bài', kind: 'bai_dang', target: 'https://www.facebook.com/groups/vi-du', text: 'Áo khoác be' };
  assert.throws(() => ap.create({ ...base, kind: 'xoa_het' }), /không hợp lệ/);
  assert.throws(() => ap.create({ ...base, target: 'https://evil.example.com/groups/x' }), /Facebook/);
  assert.throws(() => ap.create({ ...base, target: 'http://www.facebook.com/groups/x' }), /Facebook \(https\)/);
  assert.throws(() => ap.create({ ...base, target: 'javascript:alert(1)' }), /Facebook \(https\)/);
  assert.throws(() => ap.create({ ...base, target: 'không phải link' }), /link đầy đủ/);
  assert.throws(() => ap.create({ ...base, text: '   ' }), /trống/);
  assert.throws(() => ap.create({ ...base, text: 'x'.repeat(5001) }), /5000/);
  const a = ap.create({ ...base, files: [path.join(dir, 'uploads', 'a.jpg'), outside, '/etc/passwd'] });
  assert.deepEqual(a.files, [path.join(dir, 'uploads', 'a.jpg')], 'chỉ giữ ảnh nằm trong thư mục dữ liệu');
  const h0 = a.hash; assert.ok(ap.edit(a.id, 'Áo khoác be size M')); assert.notEqual(ap.get(a.id).hash, h0);
  assert.throws(() => ap.approve(a.id, h0), /vừa thay đổi/, 'duyệt bản cũ phải bị từ chối');
  const ok = ap.approve(a.id, ap.get(a.id).hash); assert.equal(ok.status, 'approved'); assert.equal(ok.approvedHash, ok.hash);
  assert.throws(() => ap.approve(a.id), /không còn chờ/, 'không duyệt hai lần');
  assert.equal(ap.edit(a.id, 'sửa lén sau khi duyệt'), false, 'đã duyệt thì không sửa được nữa');
  ap.setStatus(a.id, 'running'); assert.equal(ap.postedToday(), 1);
  const b = ap.create(base); assert.ok(ap.reject(b.id)); assert.equal(ap.postedToday(), 1);
  const again = createApprovals(dir); // app khởi động lại khi đang "đang đăng"
  assert.equal(again.recovered, 1); assert.equal(again.get(a.id).status, 'failed'); assert.match(again.get(a.id).result, /kiểm tra trên Facebook/);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(outside);
});

test('đọc khối đề xuất', () => {
  const { proposals, rest } = parseProposals('Xong.\n[[DE_XUAT loai="bai_dang" dich="https://www.facebook.com/groups/a" anh="/x/1.jpg|/x/2.jpg"]]\nBài 1\ndòng 2\n[[/DE_XUAT]]\n[[DE_XUAT loai=binh_luan dich=https://www.facebook.com/p/1]]Comment[[/DE_XUAT]]');
  assert.equal(proposals.length, 2); assert.equal(rest, 'Xong.');
  assert.deepEqual(proposals[0], { kind: 'bai_dang', target: 'https://www.facebook.com/groups/a', files: ['/x/1.jpg', '/x/2.jpg'], text: 'Bài 1\ndòng 2' });
  assert.equal(proposals[1].kind, 'binh_luan');
});

test('KHÔNG đăng khi chưa duyệt: đề xuất chỉ vào hàng chờ; duyệt mới chạy người đăng đúng một lần, đúng nguyên văn; từ chối thì không bao giờ chạy', async () => {
  const t = await setup(async (agent) => ({ text: 'Đã soạn.\n[[DE_XUAT loai="bai_dang" dich="https://www.facebook.com/groups/vi-du"]]\nÁo khoác be về hàng 💕\n[[/DE_XUAT]]\n[[DE_XUAT loai="binh_luan" dich="https://www.facebook.com/groups/vi-du/posts/9"]]\nShop có mẫu này ạ\n[[/DE_XUAT]]' }));
  t.d.enqueue(t.post, 'đăng bài giúp'); await t.idle();
  assert.equal(t.approvals.pending().length, 2, 'cả hai đề xuất đang chờ');
  assert.equal(t.published.length, 0, 'CHƯA có gì được đăng');
  assert.ok(!t.posts.some((p) => /DE_XUAT/.test(p.text || '')), 'khối đề xuất không lọt vào khung chat');
  assert.ok(t.posts.some((p) => p.op === 'sys' && /Đề xuất #1 chờ duyệt/.test(p.text)));
  const [first, second] = t.approvals.pending();
  t.approvals.edit(first.id, 'Áo khoác be về hàng, size M-L 💕');       // chủ shop sửa trước khi duyệt
  const item = t.approvals.approve(first.id, t.approvals.get(first.id).hash);
  await t.d.publishApproved(item);
  assert.equal(t.published.length, 1); assert.equal(t.published[0].text, 'Áo khoác be về hàng, size M-L 💕', 'đăng đúng bản đã sửa và duyệt');
  assert.equal(t.approvals.get(first.id).status, 'done');
  t.approvals.reject(second.id); await new Promise((r) => setTimeout(r, 100));
  assert.equal(t.published.length, 1, 'đề xuất bị từ chối không bao giờ được đăng');
  t.close();
});

test('đề xuất sai (đích không phải Facebook) bị chặn ngay và báo cho chủ shop; agent chăm khách không được đề xuất', async () => {
  const t = await setup(async (agent) => (agent.kind === 'customer'
    ? { text: 'Dạ.\n[[DE_XUAT loai="bai_dang" dich="https://www.facebook.com/groups/a"]]spam[[/DE_XUAT]]' }
    : { text: '[[DE_XUAT loai="bai_dang" dich="https://evil.example.com/x"]]hello[[/DE_XUAT]]' }));
  t.d.enqueue(t.post, 'đăng'); await t.idle();
  assert.equal(t.approvals.all().length, 0);
  assert.ok(t.posts.some((p) => p.op === 'sys' && /không hợp lệ/.test(p.text)));
  t.d.deliverInbound({ name: 'Lan', text: 'Chào shop' }); await t.idle();
  assert.equal(t.approvals.all().length, 0, 'tin của khách không thể kéo agent chăm khách đăng bài');
  assert.ok(t.posts.some((p) => p.op === 'sys' && /không có quyền này/.test(p.text)));
  t.close();
});

test('Dừng tất cả huỷ cả các bài đã duyệt nhưng chưa kịp đăng', async () => {
  const t = await setup(async () => ({ text: '' }), { publishGapSeconds: 0 });
  const mk = (n) => t.approvals.create({ agentId: 'a', agentName: 'Đăng bài', kind: 'bai_dang', target: 'https://www.facebook.com/groups/g', text: 'bài ' + n });
  const a = mk(1), b = mk(2);
  t.d.cancelAll();            // bấm Dừng tất cả TRƯỚC khi các bài được xếp hàng đăng
  await t.d.publishApproved(t.approvals.approve(a.id)); // việc xếp sau lệnh dừng vẫn chạy bình thường
  assert.equal(t.published.length, 1);
  t.close();
  void b;
});

test('ảnh sản phẩm vào khung chat (đường dẫn thật)', async () => {
  let real, txt;
  const t = await setup(async () => ({ text: `Khách đã chốt đơn.\n[[GUI_ANH ${real} | Áo khoác be, 436.800đ]]\n[[GUI_ANH /etc/passwd | bí mật]]\n[[GUI_ANH ${txt} | không phải ảnh]]` }));
  fs.mkdirSync(path.join(t.dir, 'shots'), { recursive: true }); real = path.join(t.dir, 'shots', 'mau-1.jpg'); fs.writeFileSync(real, 'x'); txt = path.join(t.dir, 'shots', 'ghi-chu.txt'); fs.writeFileSync(txt, 'x');
  t.d.enqueue(t.quote, 'chốt đơn'); await t.idle();
  const photos = t.posts.filter((p) => p.photo);
  assert.equal(photos.length, 1, 'chỉ đúng một ảnh hợp lệ được gửi');
  assert.equal(photos[0].text, 'Áo khoác be, 436.800đ'); assert.match(photos[0].photo, /^data:image\/jpeg;base64,/);
  assert.equal(t.posts.filter((p) => p.op === 'sys' && /gửi ảnh không được/.test(p.text)).length, 2, 'ảnh ngoài thư mục và tệp không phải ảnh bị từ chối, có báo');
  assert.ok(!t.posts.some((p) => /GUI_ANH/.test(p.text || '')), 'khối GUI_ANH không lọt vào khung chat');
  t.close();
});

test('chủ shop gửi ảnh sản phẩm: gọi đúng MỘT agent tìm hàng, không chuyền tay dù agent đó cố giao tiếp', async () => {
  const t = await setup(async (agent) => (agent.role === 'search' ? { text: 'Tìm được 2 mẫu.\n[[GIAO @Báo giá]]\ntính giá giúp\n[[/GIAO]]' } : { text: 'không được chạy' }));
  t.msgs.push({ id: 'old', from: 'me', typed: true, kind: 'text', text: 'cũ' });
  t.d.start(); await new Promise((r) => setTimeout(r, 300));
  t.msgs.push({ id: 'p1', from: 'me', typed: true, kind: 'photo', photo: JPEG });
  await new Promise((r) => setTimeout(r, 2200)); await t.idle();
  assert.equal(t.runs.length, 1, 'chỉ một agent chạy');
  assert.equal(t.runs[0].agent.id, t.search.id);
  assert.match(t.runs[0].text, /CHỦ SHOP GỬI ẢNH SẢN PHẨM/); assert.match(t.runs[0].text, /KHÔNG giao cho agent nào khác/);
  assert.match(t.runs[0].text, /Ảnh đính kèm/);
  assert.ok(t.posts.some((p) => p.op === 'sys' && /chỉ một agent làm việc này/.test(p.text)));
  assert.ok(t.posts.some((p) => p.op === 'sys' && /làm riêng một mình/.test(p.text)), 'khối GIAO bị bỏ qua và có báo');
  t.close();
});

test('ảnh kèm lời nhắn thì lời nhắn quyết định, không tự tìm hàng', async () => {
  const t = await setup(async () => ({ text: 'ok' }), { photoSearchSeconds: 3 });
  t.msgs.push({ id: 'old', from: 'me', typed: true, kind: 'text', text: 'cũ' });
  t.d.start(); await new Promise((r) => setTimeout(r, 300));
  t.msgs.push({ id: 'p1', from: 'me', typed: true, kind: 'photo', photo: JPEG });    // được nhận ở lần đọc tin kế tiếp (nhịp 1,2 giây), rồi đồng hồ 3 giây bắt đầu
  await new Promise((r) => setTimeout(r, 1700));
  t.msgs.push({ id: 't1', from: 'me', typed: true, kind: 'text', text: '@Báo giá tính giá món trong ảnh' });   // lời nhắn tới TRƯỚC khi hết 3 giây
  await new Promise((r) => setTimeout(r, 4200)); await t.idle();
  assert.equal(t.runs.length, 1); assert.equal(t.runs[0].agent.id, t.quote.id, 'đi theo lời nhắn');
  assert.ok(!/CHỦ SHOP GỬI ẢNH SẢN PHẨM/.test(t.runs[0].text));
  assert.match(t.runs[0].text, /Ảnh đính kèm/, 'ảnh vẫn đi kèm lời nhắn');
  t.close();
});
