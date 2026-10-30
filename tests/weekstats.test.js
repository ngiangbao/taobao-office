const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { weekStats } = require('../lib/stats');
const { createRevenue } = require('../lib/revenue');

const DAY = 24 * 3600e3, NOW = Date.UTC(2026, 9, 31, 12);
test('khách trong tuần: chỉ tính khách có tin đến hoặc tin trả lời trong 7 ngày qua', () => {
  const cs = [
    { lastInboundAt: NOW - 1 * DAY, lastReplyAt: 0 },               // nhắn hôm qua: tính
    { lastInboundAt: NOW - 10 * DAY, lastReplyAt: NOW - 2 * DAY },  // agent soạn trả lời 2 ngày trước: tính
    { lastInboundAt: NOW - 8 * DAY, lastReplyAt: NOW - 8 * DAY },   // cách đây 8 ngày: không tính
    { lastInboundAt: 0, lastReplyAt: 0 },                           // chưa có hoạt động: không tính
  ];
  assert.equal(weekStats(cs, [], NOW).customers, 2);
});
test('doanh thu trong tuần: cộng các khoản thu trong 7 ngày, bỏ khoản cũ hơn', () => {
  const iso = (ms) => new Date(ms).toISOString();
  const items = [{ t: iso(NOW - 1 * DAY), amount: 436800 }, { t: iso(NOW - 6.5 * DAY), amount: 500000 }, { t: iso(NOW - 7.5 * DAY), amount: 999999 }];
  assert.equal(weekStats([], items, NOW).revenue, 936800);
  assert.equal(weekStats([], [], NOW).revenue, 0);
});
test('khoản thu đã hủy không được cộng vào doanh thu tuần (đọc từ sổ doanh thu thật)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-w-')); const rv = createRevenue(dir);
  const a = rv.add({ amount: 300000, note: 'cọc' }); rv.add({ amount: 200000, note: 'đủ' }); rv.void(a.id);
  assert.equal(weekStats([], rv.list()).revenue, 200000);
  fs.rmSync(dir, { recursive: true, force: true });
});
