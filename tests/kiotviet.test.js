const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKiotViet } = require('../lib/kiotviet');
const { createAgents } = require('../lib/agents');
const { createCustomers } = require('../lib/customers');
const { createOrders } = require('../lib/orders');

function fakeApi(state) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(String(url)); calls.push({ url: String(url), headers: opts.headers });
    if (u.hostname === 'id.kiotviet.vn') return { ok: true, status: 200, json: async () => ({ access_token: 'T', expires_in: 86400 }) };
    assert.equal(opts.headers.Retailer, 'shopx'); assert.equal(opts.headers.Authorization, 'Bearer T');
    const since = u.searchParams.get('lastModifiedFrom'), cur = Number(u.searchParams.get('currentItem') || 0);
    const pick = (arr) => { const all = since ? arr.filter((x) => x.modifiedDate > since) : arr; return { ok: true, status: 200, json: async () => ({ total: all.length, pageSize: 100, data: all.slice(cur, cur + 100) }) }; };
    if (u.pathname === '/customers') return pick(state.customers);
    if (u.pathname === '/invoices') return pick(state.invoices);
    if (u.pathname === '/orders') return pick(state.orders || []);
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls };
}

test('KiotViet: khách và hóa đơn về app; sửa hoặc huỷ hóa đơn thì thay đúng dòng; khách đã đổi tên giữ tên chủ shop đặt; không tạo agent', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-kv-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir), customers = createCustomers(dir, agents), orders = createOrders(dir);
  const state = {
    customers: [{ code: 'KH000123', name: 'Nguyễn Lan', contactNumber: '0901234567', address: 'Hà Nội', createdDate: '2026-10-01T00:00:00', modifiedDate: '2026-10-01T00:00:00' }],
    invoices: [{ id: 11, code: 'HD001', customerCode: 'KH000123', customerName: 'Nguyễn Lan', status: 1, statusValue: 'Hoàn thành', createdDate: '2026-10-02T00:00:00', modifiedDate: '2026-10-02T00:00:00',
      invoiceDetails: [{ productCode: 'AC001', productName: 'Áo choàng', quantity: 2, price: 145000 }, { productCode: 'AC004', productName: 'Khăn', quantity: 1, price: 99000 }] }],
  };
  const { fetchImpl } = fakeApi(state);
  const kv = createKiotViet({ getConfig: () => ({ retailer: 'shopx', clientId: 'id', clientSecret: 'sec' }), fetchImpl });
  assert.equal((await kv.test()).ok, true);
  let r = await kv.sync({ customers, orders, since: '' });
  assert.deepEqual([r.customers, r.invoices, r.rows], [1, 1, 2]);
  const lan = customers.byCode('KV-KH000123'); assert.equal(lan.name, 'Nguyễn Lan'); assert.equal(lan.phone, '0901234567'); assert.equal(lan.agentId, '', 'không tạo agent cho khách');
  assert.equal(orders.all().length, 2); assert.equal(orders.all()[0].custId, 'KV-KH000123'); assert.equal(orders.all()[0].qty, 2); assert.equal(orders.all()[0].status, 'Đã giao');
  assert.equal(agents.all().filter((a) => a.kind === 'customer').length, 0);
  // chủ shop đổi tên khách; KiotViet sửa hóa đơn (bớt một dòng) rồi huỷ
  customers.rename(lan.code, 'Chị Lan quen'); customers.byCode(lan.code).kvName = 'Nguyễn Lan'; customers.save();
  state.customers[0] = { ...state.customers[0], name: 'Nguyễn Thị Lan', modifiedDate: '2026-10-05T00:00:00' };
  state.invoices[0] = { ...state.invoices[0], modifiedDate: '2026-10-05T00:00:00', invoiceDetails: [{ productCode: 'AC001', productName: 'Áo choàng', quantity: 3, price: 145000 }] };
  r = await kv.sync({ customers, orders, since: '2026-10-03T00:00:00' });
  assert.equal(orders.all().length, 1); assert.equal(orders.all()[0].qty, 3);
  assert.equal(customers.byCode(lan.code).name, 'Chị Lan quen', 'tên chủ shop đã đặt được giữ');
  state.invoices[0] = { ...state.invoices[0], status: 2, statusValue: 'Đã hủy', modifiedDate: '2026-10-06T00:00:00' };
  await kv.sync({ customers, orders, since: '2026-10-06T00:00:00'.replace('06', '05') });
  assert.equal(orders.all()[0].status, 'Đã huỷ');
  // khách nhắn Messenger lần đầu trùng tên với khách KiotViet: dùng lại, không tạo mới
  customers.byCode(lan.code).name = 'Nguyễn Lan'; customers.save();
  assert.equal(customers.ensure({ key: 't_1', name: 'nguyễn lan' }).created, false);
});

test('KiotViet: sai mã API thì báo lỗi dễ hiểu', async () => {
  const kv = createKiotViet({ getConfig: () => ({ retailer: 'a', clientId: 'b', clientSecret: 'c' }), fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }) });
  await assert.rejects(kv.test(), /Client ID\/Client Secret/);
  await assert.rejects(createKiotViet({ getConfig: () => ({}) }).test(), /Chưa nhập đủ/);
});
