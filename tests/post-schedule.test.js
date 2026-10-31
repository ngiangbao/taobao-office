const test = require('node:test');
const assert = require('node:assert/strict');
const { channelOf, settings, withinWindow, nextWindowStart, nextPublishTime } = require('../lib/post-schedule');
const { autoPostGuard } = require('../lib/commenter');

const FAN = 'https://www.facebook.com/shop', GROUP = 'https://www.facebook.com/groups/shop';
const base = { fanpageUrl: FAN, groups: [{ url: GROUP }], publishGapMinutes: 0 };
const date = (hour, minute = 0) => new Date(2026, 9, 31, hour, minute);
const post = (target) => ({ kind: 'bai_dang', target, text: 'Hàng mới về' });
const approvals = { all: () => [] };

test('nhận diện kênh: fanpage, nhóm, bình luận; nơi lạ không thuộc kênh nào', () => {
  assert.equal(channelOf(base, post(FAN + '/posts/1?ref=x')), 'fanpage');
  assert.equal(channelOf(base, post(GROUP + '/posts/123')), 'group');
  assert.equal(channelOf(base, { kind: 'binh_luan', target: FAN + '/posts/9' }), 'comment');
  assert.equal(channelOf(base, post('https://www.facebook.com/shop-gia')), null, 'chỉ khớp đúng đường dẫn');
  assert.equal(channelOf(base, post('https://www.facebook.com/groups/khac')), null);
});

test('mỗi kênh có cài đặt riêng, mặc định tắt, đọc được khoá cũ của bản trước', () => {
  assert.equal(settings({}, 'fanpage').auto, false);
  const s = settings({ fanpageAuto: true, fanpageDelayMinutes: 10, fanpageGapMinutes: 30, fanpageFromHour: 9, fanpageToHour: 20, groupAuto: false, groupPostGapMinutes: 15 }, 'group');
  assert.equal(s.auto, false); assert.equal(s.gap, 15, 'kênh nhóm không dùng số của fanpage');
  assert.deepEqual([settings({ fanpageAuto: true, fanpageGapMinutes: 30 }, 'fanpage').gap, settings({ fanpageAuto: true, fanpageDelayMinutes: 10 }, 'fanpage').delay], [30, 10]);
  const legacy = { postAutoPost: true, postAutoDelayMinutes: 7 };
  assert.equal(settings(legacy, 'fanpage').auto, true); assert.equal(settings(legacy, 'fanpage').delay, 7); assert.equal(settings(legacy, 'group').auto, true);
  assert.equal(settings({ fanpageGapMinutes: 'abc', fanpageFromHour: 99 }, 'fanpage').gap, 1, 'giá trị sai quay về mặc định');
});

test('khung giờ theo từng kênh, hỗ trợ qua nửa đêm', () => {
  const s = { from: 8, to: 22 };
  assert.equal(withinWindow(s, date(8)), true); assert.equal(withinWindow(s, date(21, 59)), true); assert.equal(withinWindow(s, date(22)), false);
  const night = { from: 22, to: 6 };
  assert.equal(withinWindow(night, date(2)), true); assert.equal(withinWindow(night, date(12)), false);
  assert.equal(new Date(nextWindowStart(night, date(12))).getHours(), 22);
});

test('khoảng cách tính từ bài cuối cùng CỦA CHÍNH kênh, kênh khác không ảnh hưởng', () => {
  const cfg = { ...base, fanpageGapMinutes: 30, groupPostGapMinutes: 5, commentGapMinutes: 2 };
  const now = date(10).getTime(), last = { any: now, byChannel: { fanpage: now, group: now } };
  assert.equal(nextPublishTime(post(FAN), cfg, now, last), now + 30 * 60e3, 'fanpage: 30 phút');
  assert.equal(nextPublishTime(post(GROUP), cfg, now, last), now + 5 * 60e3, 'nhóm: 5 phút');
  assert.equal(nextPublishTime({ kind: 'binh_luan', target: FAN + '/posts/1' }, cfg, now, last), now, 'bình luận: chưa từng đăng bình luận nên đăng ngay');
  assert.equal(nextPublishTime(post(FAN), cfg, now, { any: now - 3600e3, byChannel: { group: now } }), now, 'bài nhóm vừa đăng không chặn fanpage');
});

test('ngoài khung giờ của kênh thì chờ tới đầu khung kế tiếp; khung giờ mỗi kênh riêng', () => {
  const cfg = { ...base, fanpageFromHour: 8, fanpageToHour: 22, groupPostFromHour: 18, groupPostToHour: 23, fanpageGapMinutes: 0, groupPostGapMinutes: 0 };
  const now = date(10).getTime();
  assert.equal(nextPublishTime(post(FAN), cfg, now), now, 'fanpage đang trong khung');
  assert.equal(new Date(nextPublishTime(post(GROUP), cfg, now)).getHours(), 18, 'nhóm phải chờ tới 18 giờ');
  const late = date(21, 58).getTime();
  const gapCfg = { ...cfg, fanpageGapMinutes: 10 };
  const t = new Date(nextPublishTime(post(FAN), gapCfg, late, { any: late, byChannel: { fanpage: late } }));
  assert.equal(t.getHours(), 8); assert.equal(t.getDate(), 1, 'khoảng cách vượt giờ đóng thì sang sáng hôm sau');
});

test('kiểm tra tự đăng theo kênh: công tắc, khung giờ và giới hạn riêng từng kênh', () => {
  const cfg = { ...base, fanpageAuto: true, groupAuto: false, commentAutoPost: false, fanpageFromHour: 8, fanpageToHour: 22 };
  assert.equal(autoPostGuard(cfg, approvals, post(FAN), date(9)).ok, true);
  assert.deepEqual(autoPostGuard(cfg, approvals, post(FAN), date(23)), { ok: false, reason: 'ngoài giờ cho phép' });
  assert.deepEqual(autoPostGuard(cfg, approvals, post(GROUP), date(9)), { ok: false, reason: 'chưa bật tự đăng nhóm' });
  assert.deepEqual(autoPostGuard(cfg, approvals, { kind: 'binh_luan', target: FAN + '/posts/1', text: 'Shop có nha' }, date(9)), { ok: false, reason: 'chưa bật tự đăng bình luận newsfeed' });
  assert.equal(autoPostGuard({ ...cfg, groupAuto: true, groupPostFromHour: 18, groupPostToHour: 23 }, approvals, post(GROUP), date(9)).ok, false, 'nhóm có khung giờ riêng 18–23');
  assert.equal(autoPostGuard({ ...cfg, groupAuto: true, groupPostFromHour: 18, groupPostToHour: 23 }, approvals, post(GROUP), date(19)).ok, true);
  assert.equal(autoPostGuard(cfg, approvals, post('https://www.facebook.com/groups/khac'), date(9)).ok, false, 'nơi lạ luôn chờ duyệt');
});

test('đăng bằng tài khoản cá nhân: trang cá nhân (kể cả profile.php?id=) và nhóm của tôi thuộc kênh "bài của tôi"; ô trống là không đăng ở đó', () => {
  const { ownKind, normalizeUrl } = require('../lib/post-schedule');
  const cfg = { profileUrl: 'https://www.facebook.com/profile.php?id=100012345', fanpageUrl: 'https://www.facebook.com/groups/nhom-cua-toi', groups: [] };
  const post = (target) => ({ kind: 'bai_dang', target });
  assert.equal(channelOf(cfg, post('https://www.facebook.com/profile.php?id=100012345')), 'fanpage');
  assert.equal(ownKind(cfg, 'https://www.facebook.com/profile.php?id=100012345'), 'profile');
  assert.equal(ownKind(cfg, 'https://www.facebook.com/profile.php?id=999'), null, 'trang cá nhân của người khác');
  assert.equal(ownKind(cfg, 'https://www.facebook.com/groups/nhom-cua-toi/'), 'mygroup');
  assert.equal(channelOf({ ...cfg, profileUrl: '' }, post('https://www.facebook.com/profile.php?id=100012345')), null, 'ô trống = không đăng');
  assert.equal(channelOf({ ...cfg, fanpageUrl: '' }, post('https://www.facebook.com/groups/nhom-cua-toi')), null);
  assert.equal(ownKind({ profileUrl: 'https://www.facebook.com/ten.ban' }, 'https://www.facebook.com/ten.ban.khac'), null, 'không khớp tiền tố tên');
  assert.equal(normalizeUrl('https://www.facebook.com/ten.ban/?ref=x'), 'https://www.facebook.com/ten.ban');
});
