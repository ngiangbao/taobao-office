// Kho khách hàng: mỗi khách có một MÃ ĐỊNH DANH RIÊNG (KH-xxxxx) và đúng một agent chăm sóc.
// Mã chỉ có trong customers.json trên máy bạn và trong lời nhắc của agent chăm khách đó; không bao giờ gửi cho khách.
// Khi agent của khách giao việc cho agent chuyên môn (tìm hàng, báo giá), tên/định danh thật của khách được thay bằng mã.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ ký tự dễ nhầm (0/O, 1/I)
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function createCustomers(dataDir, agents) {
  const file = path.join(dataDir, 'customers.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => fs.writeFileSync(file, JSON.stringify(list, null, 2), { mode: 0o600 });
  const newCode = () => { for (;;) { let c = 'KH-'; for (let i = 0; i < 5; i++) c += ALPHABET[crypto.randomInt(ALPHABET.length)]; if (!list.some((x) => x.code === c)) return c; } };
  const byAgent = (agentId) => list.find((c) => c.agentId === agentId);

  return {
    all: () => list,
    byAgent,
    byCode: (code) => list.find((c) => c.code === String(code || '').toUpperCase()),
    /** key: định danh ổn định từ nguồn tin (mã cuộc trò chuyện); name: tên hiển thị. Trả { customer, created }. */
    ensure({ key, name }) {
      name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Khách lạ';
      const k = fold(key || name);
      let c = list.find((x) => x.key === k || x.aliases?.includes(k) || (!key && fold(x.name) === fold(name)));
      if (c) { if (!c.aliases.includes(k) && c.key !== k) c.aliases.push(k); save(); return { customer: c, created: false }; }
      const code = newCode();
      const label = agents.all().some((a) => fold(a.name) === fold(`Khách ${name}`)) ? `Khách ${name} ${code.slice(3)}` : `Khách ${name}`;
      const agent = agents.addCustomer({ name: label, code });
      c = { code, key: k, aliases: [], name, agentId: agent.id, createdAt: Date.now(), lastInboundAt: 0, lastReplyAt: 0, followupDue: 0, followupCount: 0, paused: false };
      list.push(c); save();
      return { customer: c, created: true };
    },
    save,
    rename(code, name) {
      const c = this.byCode(code); name = String(name || '').trim().slice(0, 40); if (!c || !name) return false;
      c.name = name; agents.rename(c.agentId, `Khách ${name}`); save(); return true;
    },
    /** khách nhắn tới: hủy lịch nhắc */
    onInbound(c) { c.lastInboundAt = Date.now(); c.followupDue = 0; c.followupCount = 0; save(); },
    /** agent đã soạn xong tin gửi khách: hẹn giờ nhắc nếu khách im lặng */
    onReply(c, minutes, max) {
      c.lastReplyAt = Date.now();
      if (!c.paused && minutes > 0 && c.followupCount < max) c.followupDue = Date.now() + minutes * 60e3; else c.followupDue = 0;
      save();
    },
    onFollowupSent(c, minutes, max) { c.followupCount++; c.followupDue = !c.paused && c.followupCount < max ? Date.now() + minutes * 60e3 : 0; save(); },
    stopFollowup(c) { c.followupDue = 0; c.paused = true; save(); },
    due(now = Date.now()) { return list.filter((c) => c.followupDue && c.followupDue <= now && !c.paused); },
    /** Che định danh thật của khách bằng mã trước khi gửi cho agent khác. */
    scrub(text, c) {
      let out = String(text);
      for (const n of [c.name, ...(c.aliases || []), c.key].filter((x) => x && x.length >= 3).sort((a, b) => b.length - a.length)) {
        out = out.replace(new RegExp(esc(n), 'gi'), c.code);
      }
      return out.replace(/(\+?\d[\d .-]{8,}\d)/g, '[số điện thoại đã ẩn]'); // số điện thoại không cần cho việc tìm hàng/báo giá
    },
    pub: (c) => ({ code: c.code, name: c.name, agentId: c.agentId, createdAt: c.createdAt, lastInboundAt: c.lastInboundAt, lastReplyAt: c.lastReplyAt, followupDue: c.followupDue, followupCount: c.followupCount, paused: c.paused }),
    profileFile: (agent) => path.join(agent.dir, 'ho-so.md'),
  };
}
module.exports = { createCustomers, fold };
