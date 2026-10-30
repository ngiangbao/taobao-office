const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseInventory, readInventory } = require('../lib/inventory');
const { createAgents } = require('../lib/agents');
const { policy } = require('../lib/tools');
const { createGooglePrivateSync } = require('../lib/google-private-sync');
const header = ['Mã hàng', 'Tên hàng', 'Size', 'Màu', 'Tồn kho'];
test('tổng tồn, hàng hết và sắp hết; giữ riêng từng biến thể', () => {
  const stock = parseInventory([header, ['A1', 'Áo', 'M', 'Be', 0], ['A1', 'Áo', 'L', 'Be', 3], ['B1', 'Váy', 'S', 'Đen', 10]], 5);
  assert.equal(stock.total, 13);
  assert.equal(stock.items.length, 3);
  assert.equal(stock.outOfStock.length, 1);
  assert.equal(stock.lowStock.length, 1);
  assert.deepEqual(parseInventory([header]).items, []);
});
test('không báo tồn sai khi thiếu cột, trùng biến thể hoặc số lượng không hợp lệ', () => {
  assert.throws(() => parseInventory([['Tên hàng']]), /cột/);
  for (const quantity of ['', -1, 1.5, 'không rõ']) assert.throws(() => parseInventory([header, ['A', 'Áo', '', '', quantity]]), /Dòng 2/);
  assert.throws(() => parseInventory([header, ['A', 'Áo', '', '', 1], ['A', 'Áo', '', '', 2]]), /trùng/);
});
test('mỗi lượt đều đọc mới, lỗi kết nối không dùng lại tồn cũ', async () => {
  let count = 0;
  const google = { readInventory: async () => [header, ['A', 'Áo', '', '', ++count]] };
  const cfg = { inventorySheetUrl: 'link' };
  assert.equal((await readInventory(google, cfg)).total, 1);
  assert.equal((await readInventory(google, cfg)).total, 2);
  google.readInventory = async () => { throw new Error('mất kết nối'); };
  await assert.rejects(readInventory(google, cfg), /mất kết nối/);
  await assert.rejects(readInventory(google, {}), /Cài đặt/);
});
test('@Kho hàng chọn đúng agent, không thêm trùng khi mở lại app', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-agent-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir);
  agents.ensureDefaults([{ name: 'Kho hàng', role: 'inventory' }]);
  agents.ensureDefaults([{ name: 'Kho hàng', role: 'inventory' }]);
  assert.equal(agents.list().length, 1);
  assert.equal(agents.route('@Kho hàng còn áo không?').agent.role, 'inventory');
  const rules = policy('inventory');
  assert.deepEqual(rules.allowed, ['Read']);
  assert.ok(rules.denied.includes('mcp__playwright'));
  assert.ok(rules.denied.includes('Write'));
});
test('đọc trang kho riêng tư chỉ gọi GET, tên trang có dấu nháy được escape', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tokenFile = path.join(dir, 'token');
  fs.writeFileSync(tokenFile, JSON.stringify({ access_token: 'fake', refresh_token: 'fake-refresh', expires_at: Date.now() + 3600000 }));
  const sync = createGooglePrivateSync({ tokenFile, safeStorage: { decryptString: b => b.toString() }, fetchImpl: async (url, options) => {
    assert.equal(options.method, undefined);
    assert.equal(options.headers.authorization, 'Bearer fake');
    assert.match(decodeURIComponent(url), /'Kho ''mới'''!A1:AZ1002/);
    return new Response(JSON.stringify({ values: [header] }));
  } });
  assert.deepEqual(await sync.readInventory({ sheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123/edit', tab: "Kho 'mới'" }), [header]);
});
