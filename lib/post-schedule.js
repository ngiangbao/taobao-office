function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}

function isGroupPost(cfg, item) {
  if (item?.kind !== 'bai_dang') return false;
  const target = normalizeUrl(item.target);
  return !!target && (cfg.groups || []).some((group) => {
    const base = normalizeUrl(group.url);
    return base && (target === base || target.startsWith(`${base}/`));
  });
}

function groupPostHours(cfg) {
  const from = Number(cfg.groupPostFromHour ?? 8);
  const to = Number(cfg.groupPostToHour ?? 22);
  return {
    from: Number.isInteger(from) && from >= 0 && from <= 23 ? from : 8,
    to: Number.isInteger(to) && to >= 0 && to <= 24 ? to : 22,
  };
}

function withinGroupPostWindow(cfg, date = new Date()) {
  const { from, to } = groupPostHours(cfg);
  if (from === to) return true;
  const minute = date.getHours() * 60 + date.getMinutes();
  return from < to ? minute >= from * 60 && minute < to * 60 : minute >= from * 60 || minute < to * 60;
}

function nextGroupPostTime(cfg, date = new Date()) {
  if (withinGroupPostWindow(cfg, date)) return date.getTime();
  const { from } = groupPostHours(cfg);
  const next = new Date(date);
  next.setHours(from, 0, 0, 0);
  if (next.getTime() <= date.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function nextPublishTime(item, cfg, now = Date.now(), lastPublishAt = 0, lastGroupPublishAt = 0) {
  let at = Math.max(now, lastPublishAt + Math.max(0, Number(cfg.publishGapSeconds ?? 45)) * 1000);
  if (isGroupPost(cfg, item)) {
    at = Math.max(at, lastGroupPublishAt + Math.max(0, Number(cfg.groupPostGapMinutes ?? 5)) * 60e3);
    at = Math.max(at, nextGroupPostTime(cfg, new Date(at)));
  }
  return at;
}

module.exports = { isGroupPost, withinGroupPostWindow, nextGroupPostTime, nextPublishTime };
