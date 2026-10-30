const test = require('node:test');
const assert = require('node:assert/strict');
const { isGroupPost, withinGroupPostWindow, nextGroupPostTime, nextPublishTime } = require('../lib/post-schedule');
const { autoPostGuard } = require('../lib/commenter');

const cfg = {
  groups: [{ url: 'https://www.facebook.com/groups/shop' }],
  groupPostFromHour: 8,
  groupPostToHour: 22,
  groupPostGapMinutes: 5,
  publishGapMinutes: 1,
};
const date = (hour, minute = 0) => new Date(2026, 9, 31, hour, minute);
const target = { kind: 'bai_dang', target: 'https://www.facebook.com/groups/shop/posts/123?ref=share' };

test('nhận diện bài đăng nhóm trong danh sách, không nhầm bài fanpage hoặc bình luận', () => {
  assert.equal(isGroupPost(cfg, target), true);
  assert.equal(isGroupPost(cfg, { ...target, target: 'https://www.facebook.com/shop' }), false);
  assert.equal(isGroupPost(cfg, { ...target, kind: 'binh_luan' }), false);
});

test('khung giờ đăng nhóm theo giờ địa phương, hỗ trợ khung qua nửa đêm', () => {
  assert.equal(withinGroupPostWindow(cfg, date(8)), true);
  assert.equal(withinGroupPostWindow(cfg, date(21, 59)), true);
  assert.equal(withinGroupPostWindow(cfg, date(22)), false);
  const overnight = { ...cfg, groupPostFromHour: 22, groupPostToHour: 6 };
  assert.equal(withinGroupPostWindow(overnight, date(2)), true);
  assert.equal(withinGroupPostWindow(overnight, date(12)), false);
  assert.equal(new Date(nextGroupPostTime(overnight, date(12))).getHours(), 22);
});

test('kiểm tra tự đăng nhóm dùng khung giờ đăng nhóm, không dùng giờ quét bình luận', () => {
  const approvals = { all: () => [] };
  const posting = { ...cfg, postAutoPost: true, commentFromHour: 0, commentToHour: 1 };
  assert.equal(autoPostGuard(posting, approvals, { ...target, text: 'Bài nhóm' }, date(9)).ok, true);
  assert.deepEqual(autoPostGuard(posting, approvals, { ...target, text: 'Bài nhóm' }, date(22)), { ok: false, reason: 'ngoài giờ cho phép' });
});

test('giữ khoảng cách giữa bài nhóm và hoãn đến khung giờ kế tiếp nếu khoảng cách vượt giờ đóng', () => {
  const groupLast = date(10).getTime();
  assert.equal(nextPublishTime(target, cfg, groupLast, groupLast, groupLast), groupLast + 5 * 60e3);
  const now = date(21, 58).getTime();
  const next = nextPublishTime(target, cfg, now, now - 60_000, now - 2 * 60_000);
  const scheduled = new Date(next);
  const nextDay = date(21, 58); nextDay.setDate(nextDay.getDate() + 1);
  assert.equal(scheduled.toDateString(), nextDay.toDateString());
  assert.equal(scheduled.getHours(), 8);
  assert.equal(scheduled.getMinutes(), 0);
});

test('giãn cách chung giữa các lần đăng được tính bằng phút cho cả bài fanpage và bài nhóm', () => {
  const now = date(10).getTime();
  const fanpage = { kind: 'bai_dang', target: 'https://www.facebook.com/shop' };
  assert.equal(nextPublishTime(fanpage, cfg, now, now, 0), now + 60e3);
  assert.equal(nextPublishTime(target, cfg, now, now, now), now + 5 * 60e3);
});
