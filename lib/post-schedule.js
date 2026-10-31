// Lịch đăng TÁCH RIÊNG cho từng kênh: fanpage, nhóm, bình luận newsfeed. Mỗi kênh có công tắc tự đăng, thời gian chờ sau khi agent soạn xong,
// khoảng cách tối thiểu so với bài cuối cùng của CHÍNH kênh đó, và khung giờ đăng. Kênh này không ảnh hưởng kênh kia.
const CHANNELS = {
  fanpage: { label: 'bài của tôi (trang cá nhân / nhóm của tôi)', keys: { auto: 'fanpageAuto', delay: 'fanpageDelayMinutes', gap: 'fanpageGapMinutes', from: 'fanpageFromHour', to: 'fanpageToHour' }, def: { delay: 5, gap: 1, from: 8, to: 22 }, legacy: { auto: 'postAutoPost', delay: 'postAutoDelayMinutes' } },
  group: { label: 'nhóm', keys: { auto: 'groupAuto', delay: 'groupPostDelayMinutes', gap: 'groupPostGapMinutes', from: 'groupPostFromHour', to: 'groupPostToHour' }, def: { delay: 5, gap: 5, from: 8, to: 22 }, legacy: { auto: 'postAutoPost' } },
  comment: { label: 'bình luận newsfeed', keys: { auto: 'commentAutoPost', delay: 'commentDelayMinutes', gap: 'commentGapMinutes', from: 'commentFromHour', to: 'commentToHour' }, def: { delay: 1, gap: 1, from: 8, to: 22 }, legacy: {} },
};

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const id = /\/profile\.php$/i.test(url.pathname) ? url.searchParams.get('id') : null; // trang cá nhân dạng profile.php?id=… phải giữ id
    url.search = id ? `?id=${id}` : ''; url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch { return ''; }
}
const under = (target, base) => !!target && !!base && (target === base || target.startsWith(`${base}/`));

/** Nơi đăng của chính chủ shop: 'profile' (trang cá nhân, ô profileUrl) | 'mygroup' (nhóm công khai do chủ shop tạo, ô fanpageUrl) | null. Ô để trống = không đăng ở đó. */
function ownKind(cfg, target) {
  const t = normalizeUrl(target);
  if (under(t, normalizeUrl(cfg.profileUrl))) return 'profile';
  if (under(t, normalizeUrl(cfg.fanpageUrl))) return 'mygroup';
  return null;
}

/** Đề xuất này thuộc kênh nào: 'fanpage' | 'group' | 'comment' | null (nơi đăng không nằm trong fanpage hay danh sách nhóm). */
function channelOf(cfg, item) {
  if (item?.kind === 'binh_luan') return 'comment';
  if (item?.kind !== 'bai_dang') return null;
  const target = normalizeUrl(item.target);
  if (ownKind(cfg, target)) return 'fanpage'; // kênh "bài của tôi": trang cá nhân hoặc nhóm công khai do chủ shop tạo (đăng bằng tài khoản cá nhân)
  if ((cfg.groups || []).some((g) => under(target, normalizeUrl(g.url)))) return 'group';
  return null;
}
const int = (v, def, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : def; };
/** Cài đặt của một kênh (có giá trị mặc định; đọc cả khoá cũ postAutoPost/postAutoDelayMinutes của các bản trước). */
function settings(cfg, channel) {
  const ch = CHANNELS[channel], k = ch.keys;
  const auto = cfg[k.auto] ?? (ch.legacy.auto ? cfg[ch.legacy.auto] : false);
  return {
    channel, label: ch.label, auto: !!auto,
    delay: int(cfg[k.delay] ?? (ch.legacy.delay ? cfg[ch.legacy.delay] : undefined), ch.def.delay, 0, 1440),
    gap: int(cfg[k.gap], ch.def.gap, 0, 1440),
    from: int(cfg[k.from], ch.def.from, 0, 23),
    to: int(cfg[k.to], ch.def.to, 0, 24),
  };
}
function withinWindow(s, date = new Date()) {
  if (s.from === s.to) return true;
  const minute = date.getHours() * 60 + date.getMinutes();
  return s.from < s.to ? minute >= s.from * 60 && minute < s.to * 60 : minute >= s.from * 60 || minute < s.to * 60;
}
function nextWindowStart(s, date = new Date()) {
  if (withinWindow(s, date)) return date.getTime();
  const next = new Date(date); next.setHours(s.from, 0, 0, 0);
  if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}
/** Lúc sớm nhất được đăng: sau khoảng cách chung ngắn giữa mọi bài, sau khoảng cách của riêng kênh tính từ bài cuối cùng của kênh, và trong khung giờ của kênh.
 *  last: { any: thời điểm bài cuối cùng của mọi kênh, byChannel: { fanpage, group, comment } } */
function nextPublishTime(item, cfg, now = Date.now(), last = { any: 0, byChannel: {} }) {
  let at = Math.max(now, (last.any || 0) + Math.max(0, Number(cfg.publishGapMinutes ?? 1)) * 60e3);
  const channel = channelOf(cfg, item);
  if (channel) {
    const s = settings(cfg, channel);
    at = Math.max(at, (last.byChannel?.[channel] || 0) + s.gap * 60e3);
    at = Math.max(at, nextWindowStart(s, new Date(at)));
  }
  return at;
}
const isGroupPost = (cfg, item) => channelOf(cfg, item) === 'group';
module.exports = { CHANNELS, ownKind, channelOf, settings, withinWindow, nextWindowStart, nextPublishTime, isGroupPost, normalizeUrl };
