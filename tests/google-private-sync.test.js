const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGooglePrivateSync, spreadsheetId, parseRevenueRows } = require('../lib/google-private-sync');

function fakeSync() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taobao-office-sync-'));
  const tokenFile = path.join(dir, 'token.enc');
  const credentialsFile = path.join(dir, 'credentials.enc');
  const safeStorage = {
    encryptString: (value) => Buffer.from(`enc:${value}`),
    decryptString: (value) => value.toString().slice(4),
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
  };
  fs.writeFileSync(tokenFile, safeStorage.encryptString(JSON.stringify({ access_token: 'access', expires_at: Date.now() + 3600_000, refresh_token: 'refresh' })));
  const sheets = { Customers: [], Revenue: [] };
  const sync = createGooglePrivateSync({
    tokenFile, credentialsFile, safeStorage, openExternal: async () => {},
    fetchImpl: async (url, options = {}) => {
      assert.equal(options.headers?.authorization, 'Bearer access');
      if (url.includes('/values:batchGet?')) return new Response(JSON.stringify({ valueRanges: [{ values: sheets.Customers }, { values: sheets.Revenue }] }));
      if (url.includes('/values/Customers!A:H:append')) sheets.Customers.push(...JSON.parse(options.body).values);
      if (url.includes('/values/Revenue!A:H:append')) sheets.Revenue.push(...JSON.parse(options.body).values);
      return new Response('{}');
    },
  });
  return { dir, sync, sheets };
}

test('chỉ chấp nhận liên kết Google Sheets HTTPS hợp lệ', () => {
  assert.equal(spreadsheetId('https://docs.google.com/spreadsheets/d/abcdefghij123456/edit'), 'abcdefghij123456');
  assert.throws(() => spreadsheetId('https://example.com/spreadsheets/d/abcdefghij123456/edit'), /Chỉ chấp nhận/);
});

test('từ chối một ID khoản thu bị ghi với giá trị mâu thuẫn', () => {
  assert.throws(() => parseRevenueRows([
    ['ID', 'Thời gian', 'ID khách'],
    ['a1', '2026-01-01', 'KH-AAA22', 'Lan', 100000, '', 'manual', false],
    ['a1', '2026-01-01', 'KH-BBB33', 'Hương', 100000, '', 'manual', true],
  ]), /dữ liệu mâu thuẫn/);
});

test('đồng bộ append-only, nhập khách/khoản thu và lan truyền trạng thái hủy', async (t) => {
  const { dir, sync, sheets } = fakeSync();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const customer = { code: 'KH-AAA22', name: 'Lan', createdAt: 10, updatedAt: 20, agentId: 'agent-a' };
  const payment = { id: 'pay-1', t: '2026-01-01T00:00:00.000Z', code: customer.code, name: 'Lan', amount: 125000, note: 'cọc', source: 'manual', voided: false };
  const mergedCustomers = [];
  const revenueStore = {
    items: [payment],
    syncItems() { return this.items; },
    mergeSyncItems(items) { this.items = items; },
  };
  const stores = {
    customers: { all: () => [customer] },
    revenue: revenueStore,
    profileFor: () => '- SĐT: 0912345678\n- Địa chỉ: Hà Nội\n- Size: M',
    profileModifiedAt: () => 30,
    mergeCustomer: (c) => mergedCustomers.push(c),
  };

  assert.deepEqual(await sync.sync({ sheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123456/edit', ...stores }), { customers: 1, revenue: 1 });
  assert.equal(sheets.Customers.length, 2);
  assert.equal(sheets.Revenue.length, 2);
  assert.equal(mergedCustomers[0].phone, '0912345678');

  revenueStore.items = [{ ...payment, voided: true }];
  assert.deepEqual(await sync.sync({ sheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123456/edit', ...stores }), { customers: 1, revenue: 0 });
  assert.equal(sheets.Revenue.length, 3);
  const deviceTwoCustomers = [];
  assert.deepEqual(await sync.sync({
    sheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghij123456/edit',
    customers: { all: () => [] },
    revenue: { syncItems: () => [], mergeSyncItems: (items) => assert.equal(items[0].voided, true) },
    profileFor: () => '', profileModifiedAt: () => 0, mergeCustomer: (c) => deviceTwoCustomers.push(c),
  }), { customers: 1, revenue: 0 });
  assert.equal(sheets.Customers.length, 2);
  assert.equal(sheets.Revenue.length, 3);
  assert.equal(deviceTwoCustomers[0].code, customer.code);
});
