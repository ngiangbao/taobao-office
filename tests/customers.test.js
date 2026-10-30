// Kiểm thử không tốn tiền: máy chủ chat giả + agent giả. Chạy: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAgents } = require('../lib/agents');
const { createCustomers, mergeLocalOrderCustomers, linkOrderCustomers } = require('../lib/customers');
const { createOrders } = require('../lib/orders');
const { createRevenue, parseVnd } = require('../lib/revenue');
const { createDispatcher } = require('../lib/dispatcher');
const { createHistory } = require('../lib/history');

async function setup(runImpl, cfg = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-'));
  const posts = [], msgs = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); if (req.method === 'POST') { posts.push(JSON.parse(b)); res.end('{"ok":true}'); } else res.end(JSON.stringify({ ok: true, msgs })); }); });
  await new Promise((r) => srv.listen(0, r));
  const agents = createAgents(dir), customers = createCustomers(dir, agents), revenue = createRevenue(dir), history = createHistory(dir);
  agents.add({ name: 'Chăm sóc khách', role: 'cskh' }); agents.add({ name: 'Tìm hàng', role: 'search' }); agents.add({ name: 'Báo giá', role: 'quote' });
  const runs = [];
  const run = async (agent, text, opts) => { runs.push({ agent, text, opts }); return runImpl(agent, text, opts, runs); };
  const full = { followupMinutes: 10, followupMax: 1, refreshTokens: 100000, ...cfg };
  const d = createDispatcher({ officeUrl: () => `http://127.0.0.1:${srv.address().port}/`, agents, customers, revenue, run, uploadsDir: dir + '/up', onStatus() {}, history, getCfg: () => full });
  const idle = async () => { for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 25)); if (!d.anyBusy()) { await new Promise((r) => setTimeout(r, 40)); if (!d.anyBusy()) return; } } };
  return { dir, agents, customers, revenue, history, d, runs, posts, msgs, srv, idle, cfg: full, close: () => { d.stop(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('mỗi khách một mã riêng và một agent; khách nhắn lại thì dùng lại đúng agent đó', async () => {
  const t = await setup(async () => ({ text: 'Dạ shop gửi chị bản nháp.' }));
  const a = t.d.deliverInbound({ name: 'Lan', text: 'Áo này còn không?' });
  await t.idle();
  const b = t.d.deliverInbound({ name: 'lan', text: 'Cho chị size M' });
  const c = t.d.deliverInbound({ name: 'Hương', text: 'Chào shop' });
  await t.idle();
  assert.match(a.customer.code, /^KH-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(a.created, true); assert.equal(b.created, false);
  assert.equal(a.customer.agentId, b.customer.agentId, 'cùng khách phải cùng agent');
  assert.notEqual(a.customer.agentId, c.customer.agentId);
  assert.notEqual(a.customer.code, c.customer.code);
  assert.equal(t.customers.all().length, 2);
  assert.equal(t.agents.get(a.customer.agentId).kind, 'customer');
  t.close();
});

test('xóa khách khỏi kho cục bộ và lưu thay đổi vào tệp customers.json', async () => {
  const t = await setup(async () => ({ text: 'Nháp.' }));
  const { customer } = t.customers.ensure({ name: 'Lan' });
  const removed = t.customers.remove(customer.code);
  assert.equal(removed.code, customer.code);
  assert.equal(t.customers.byCode(customer.code), undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(t.dir, 'customers.json'), 'utf8')), []);
  assert.equal(t.customers.remove(customer.code), null);
  t.close();
});

test('danh sách khách trên máy gồm hồ sơ khách và khách chỉ xuất hiện trong đơn hàng', () => {
  const customers = [
    { code: 'KH-AAA22', name: 'Lan', phone: '0900', createdAt: 10, updatedAt: 20 },
  ];
  const orders = [
    { custId: 'KH-AAA22', fbName: 'Lan', at: 30 },
    { custId: 'KH-BBB33', fbName: 'Hương', at: 40 },
    { custId: '', fbName: 'Mai', at: 50 },
    { custId: '', fbName: 'mai', at: 60 },
  ];
  const rows = mergeLocalOrderCustomers(customers, orders);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(({ name, orderCount, deletable }) => ({ name, orderCount, deletable })), [
    { name: 'Mai', orderCount: 2, deletable: false },
    { name: 'Hương', orderCount: 1, deletable: false },
    { name: 'Lan', orderCount: 1, deletable: true },
  ]);
  assert.equal(rows.find((row) => row.name === 'Lan').phone, '0900');
});

test('liên kết từng khách trong đơn hàng với đúng một agent, tái sử dụng hồ sơ theo tên và ID', async () => {
  const t = await setup(async () => ({ text: 'Nháp.' }));
  const existing = t.customers.ensure({ key: 'thread-lan', name: 'Lan' }).customer;
  const orders = createOrders(t.dir);
  orders.importItems([
    { fbName: 'Lan', sku: 'A' },
    { fbName: 'lan', sku: 'B' },
    { custId: 'KH-MAI01', fbName: 'Mai', sku: 'C' },
    { custId: 'KH-MAI01', fbName: 'Mai', sku: 'D' },
  ]);
  const first = linkOrderCustomers(orders, t.customers);
  assert.equal(first.linked.length, 2);
  assert.equal(first.created, 1);
  assert.equal(first.assigned.length, 1);
  assert.ok(orders.all().slice(0, 2).every((order) => order.custId === existing.code));
  assert.equal(orders.all()[2].custId, 'KH-MAI01');
  assert.equal(t.customers.all().length, 2);
  assert.ok(t.customers.all().every((customer) => t.agents.get(customer.agentId)?.kind === 'customer'));
  const second = linkOrderCustomers(orders, t.customers);
  assert.equal(second.created, 0);
  assert.equal(t.customers.all().length, 2, 'chạy liên kết lại không tạo agent trùng');
  t.close();
});

test('khi giao việc cho agent chuyên môn: che tên, số điện thoại bằng mã; agent chuyên môn chỉ thấy mã', async () => {
  let specialistPrompt = '';
  const t = await setup(async (agent, text) => {
    if (agent.kind === 'customer') return { text: 'Đang nhờ tìm.\n[[GIAO @Tìm hàng]]\nKhách Lan (SĐT 0912 345 678) muốn áo khoác be size M\n[[/GIAO]]' };
    specialistPrompt = text; return { text: 'Xong.' };
  });
  t.d.deliverInbound({ name: 'Lan', text: 'Em muốn mua áo' });
  await t.idle();
  const code = t.customers.all()[0].code;
  assert.ok(specialistPrompt.includes(`@${code}`), 'người giao hiện bằng mã');
  assert.ok(!/Lan/.test(specialistPrompt), 'không lộ tên khách: ' + specialistPrompt);
  assert.ok(!/0912/.test(specialistPrompt), 'không lộ số điện thoại');
  assert.ok(specialistPrompt.includes(code), 'khách được gọi bằng mã');
  t.close();
});

test('agent của khách không giao việc được cho agent của khách khác', async () => {
  const t = await setup(async (agent) => (agent.kind === 'customer' && agent.name.includes('Lan') ? { text: '[[GIAO @Khách Hương]]\nxin thông tin\n[[/GIAO]]' } : { text: 'ok' }));
  t.d.deliverInbound({ name: 'Hương', text: 'a' }); await t.idle();
  t.d.deliverInbound({ name: 'Lan', text: 'b' }); await t.idle();
  const huongRuns = t.runs.filter((r) => r.agent.name.includes('Hương')).length;
  assert.equal(huongRuns, 1, 'Hương chỉ chạy đúng lần nhắn của chính Hương');
  assert.ok(t.posts.some((p) => /không được giao việc cho agent của khách khác/.test(p.text || '')));
  t.close();
});

test('doanh thu: chỉ ghi khi việc do chủ shop giao; tin của khách không làm tăng doanh thu', async () => {
  const t = await setup(async () => ({ text: 'Đã ghi nhận.\n[[THU 436800 | cọc áo khoác be]]' }));
  const { customer } = t.d.deliverInbound({ name: 'Lan', text: 'Em đã chuyển khoản 5 triệu rồi nha' }); // khách tự nói đã chuyển
  await t.idle();
  assert.equal(t.revenue.total(), 0, 'tin từ khách không được tính tiền');
  assert.ok(t.posts.some((p) => p.op === 'sys' && /không do bạn giao/.test(p.text)));
  // chủ shop giao việc (chain.owner): gõ "@Khách Lan đã nhận cọc ..."
  t.msgs.push({ id: 'o1', from: 'me', typed: true, kind: 'text', text: `@${customer.code} đã nhận cọc 436.800 của khách` });
  t.d.start(); await new Promise((r) => setTimeout(r, 300)); // lần poll đầu bỏ qua lịch sử
  t.msgs.push({ id: 'o2', from: 'me', typed: true, kind: 'text', text: `@${customer.code} đã nhận cọc 436.800 của khách` });
  await new Promise((r) => setTimeout(r, 2800)); await t.idle();
  assert.equal(t.revenue.total(), 436800);
  assert.equal(t.revenue.list()[0].code, customer.code);
  t.close();
});

test('khách im lặng: tới hạn thì agent soạn tin nhắc; tối đa N lần; [[DUNG_NHAC]] dừng hẳn; khách nhắn lại thì hủy lịch', async () => {
  let mode = 'draft';
  const t = await setup(async () => (mode === 'stop' ? { text: '[[DUNG_NHAC]]' } : { text: 'Bản nháp trả lời.' }), { followupMinutes: 10, followupMax: 2 });
  const { customer } = t.d.deliverInbound({ name: 'Lan', text: 'Giá bao nhiêu?' }); await t.idle();
  assert.ok(customer.followupDue > Date.now() + 9 * 60e3 && customer.followupDue < Date.now() + 11 * 60e3, 'hẹn khoảng 10 phút');
  t.d.followupTick(); await t.idle();
  assert.equal(t.runs.length, 1, 'chưa tới hạn thì chưa nhắc');
  customer.followupDue = Date.now() - 1000; t.d.followupTick(); await t.idle();
  assert.equal(t.runs.length, 2); assert.match(t.runs[1].text, /chưa trả lời sau 10 phút/);
  assert.equal(customer.followupCount, 1);
  // sau tin nhắc, hẹn lần 2
  assert.ok(customer.followupDue > 0);
  customer.followupDue = Date.now() - 1; mode = 'stop'; t.d.followupTick(); await t.idle();
  assert.equal(customer.paused, true, 'DUNG_NHAC dừng hẹn giờ');
  assert.equal(customer.followupDue, 0);
  t.d.followupTick(); await t.idle(); assert.equal(t.runs.length, 3, 'đã dừng thì không nhắc nữa');
  mode = 'draft'; customer.paused = false;
  t.d.deliverInbound({ name: 'Lan', text: 'À có chị ơi' }); await t.idle();
  assert.equal(customer.followupCount, 0); // khách nhắn lại: lịch được làm mới sau tin trả lời mới
  t.close();
});

test('làm mới trí nhớ: hội thoại dài quá ngưỡng thì ghi hồ sơ rồi bắt đầu phiên mới; hồ sơ được giữ', async () => {
  const t = await setup(async (agent, text, opts) => {
    if (opts?.light) { fs.writeFileSync(path.join(agent.dir, 'ho-so.md'), '# Hồ sơ\n- size M, thích màu be'); return { text: 'ĐÃ LƯU' }; }
    return { text: 'Nháp.', ctx: 150000 };
  });
  const { customer } = t.d.deliverInbound({ name: 'Lan', text: 'Chào' });
  const agent = t.agents.get(customer.agentId); const sidBefore = agent.sid; agent.started = true;
  await t.idle(); await new Promise((r) => setTimeout(r, 200)); await t.idle();
  assert.ok(t.runs.some((r) => r.opts?.light), 'có lượt ghi hồ sơ');
  assert.notEqual(agent.sid, sidBefore, 'phiên được làm mới');
  assert.equal(agent.started, false);
  assert.match(fs.readFileSync(t.customers.profileFile(agent), 'utf8'), /size M/, 'hồ sơ còn nguyên');
  assert.ok(t.history.query({}).items.some((r) => /làm mới trí nhớ/i.test(r.text)));
  t.close();
});

test('lịch sử ghi tin khách, câu trả lời, giao việc, thu tiền; ảnh của khách được chép vào thư mục riêng của agent', async () => {
  const t = await setup(async () => ({ text: 'Nháp.' }));
  const img = path.join(t.dir, 'a.jpg'); fs.writeFileSync(img, 'x');
  const { customer } = t.d.deliverInbound({ name: 'Lan', text: 'Xem ảnh', files: [img] }); await t.idle();
  const kinds = t.history.query({}).items.map((r) => r.kind);
  assert.ok(kinds.includes('inbound') && kinds.includes('agent'));
  const agent = t.agents.get(customer.agentId);
  assert.ok(fs.existsSync(path.join(agent.dir, 'anh', 'a.jpg')));
  assert.ok(t.runs[0].text.includes(path.join(agent.dir, 'anh')), 'agent đọc ảnh trong thư mục riêng');
  t.close();
});

test('parseVnd', () => {
  assert.equal(parseVnd('436.800'), 436800); assert.equal(parseVnd('1,5tr'), 1500000); assert.equal(parseVnd('300k'), 300000); assert.ok(Number.isNaN(parseVnd('abc')));
});

test('nhập đơn khách không ghi đè khách đang có: giữ tên chủ shop đặt, trạng thái tắt nhắc, số lần nhắc và tên agent', () => {
  const fs2 = require('node:fs'), os2 = require('node:os'), path2 = require('node:path');
  const { createAgents } = require('../lib/agents'), { createCustomers, linkOrderCustomers } = require('../lib/customers'), { createOrders } = require('../lib/orders');
  const d = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'tbo-link-')); try {
    const agents = createAgents(d), customers = createCustomers(d, agents), orders = createOrders(d);
    const { customer: c } = customers.ensure({ key: 't1', name: 'Lan Nguyễn' });
    customers.rename(c.code, 'Lan quen'); customers.stopFollowup(c); c.followupCount = 1; customers.save();
    orders.add({ fbName: 'Lan Nguyễn', custId: c.code, sku: 'A' }); orders.add({ fbName: 'Mai', sku: 'B' });
    const r = linkOrderCustomers(orders, customers);
    const after = customers.byCode(c.code);
    assert.equal(after.name, 'Lan quen'); assert.equal(agents.get(after.agentId).name, 'Khách Lan quen');
    assert.equal(after.paused, true, 'khách đã tắt nhắc không bị bật lại'); assert.equal(after.followupCount, 1);
    assert.equal(r.created, 1, 'chỉ tạo agent cho khách mới (Mai)'); assert.equal(customers.all().length, 2);
    assert.equal(linkOrderCustomers(orders, customers).created, 0, 'nhập lại không tạo thêm');
  } finally { fs2.rmSync(d, { recursive: true, force: true }); }
});
