// Sổ doanh thu: chỉ tính TIỀN ĐÃ THU THẬT (cọc, thanh toán) bằng VNĐ. Báo giá và đơn dự kiến không được tính.
// Mỗi khoản thu là một dòng trong revenue.jsonl; xóa khoản ghi nhầm bằng cách ghi một dòng "hủy" (không sửa dòng cũ).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_VND = 2_000_000_000; // một khoản thu lớn hơn mức này coi là nhập nhầm

function createRevenue(dataDir) {
  const file = path.join(dataDir, 'revenue.jsonl');
  const readEvents = () => {
    let lines = [];
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch {}
    const rows = [];
    for (const l of lines) { try { rows.push(JSON.parse(l)); } catch {} }
    return rows;
  };
  const read = () => {
    const rows = readEvents(), voided = new Set(rows.filter((r) => r.void).map((r) => r.void));
    return rows.filter((r) => r.id && !voided.has(r.id));
  };
  const append = (o) => fs.appendFileSync(file, JSON.stringify(o) + '\n', { mode: 0o600 });
  return {
    list: () => read().reverse(),
    syncItems() {
      const events = readEvents(), voided = new Set(events.filter((r) => r.void).map((r) => r.void));
      return events.filter((r) => r.id).map((r) => ({ ...r, voided: voided.has(r.id) }));
    },
    mergeSyncItems(items) {
      const known = new Set(readEvents().filter((r) => r.id).map((r) => r.id));
      const voided = new Set(readEvents().filter((r) => r.void).map((r) => r.void));
      for (const item of items) {
        if (!item.id || !Number.isFinite(Number(item.amount)) || Number(item.amount) <= 0) continue;
        if (!known.has(item.id)) {
          append({ id: String(item.id), t: String(item.t || new Date().toISOString()), amount: Math.round(Number(item.amount)), code: String(item.code || ''), name: String(item.name || ''), note: String(item.note || '').slice(0, 200), source: item.source === 'agent' ? 'agent' : 'manual' });
          known.add(item.id);
        }
        if (item.voided && !voided.has(item.id)) { append({ void: item.id, t: new Date().toISOString() }); voided.add(item.id); }
      }
    },
    total: () => read().reduce((a, r) => a + r.amount, 0),
    /** amount: số nguyên VNĐ > 0; code/name: khách (tùy chọn); source: 'agent' | 'manual' */
    add({ amount, code = '', name = '', note = '', source = 'manual' }) {
      amount = Math.round(Number(amount));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền phải lớn hơn 0.');
      if (amount > MAX_VND) throw new Error('Số tiền quá lớn, có thể nhập nhầm.');
      const r = { id: crypto.randomUUID().slice(0, 8), t: new Date().toISOString(), amount, code, name, note: String(note).slice(0, 200), source };
      append(r); return r;
    },
    void(id) { if (!read().some((r) => r.id === id)) return false; append({ void: id, t: new Date().toISOString() }); return true; },
  };
}
/** "436.800", "436,800", "500000", "1.5tr" → số nguyên VNĐ (hoặc NaN) */
function parseVnd(s) {
  s = String(s).trim().toLowerCase().replace(/\s/g, '');
  const m = /^([\d.,]+)(k|tr|triệu|ngàn|nghìn)?$/.exec(s); if (!m) return NaN;
  let n = m[1];
  if (m[2]) { // có hậu tố (tr/k): dấu . hoặc , là dấu thập phân, vd 1.5tr = 1,5 triệu
    n = parseFloat(n.replace(',', '.')) * (m[2] === 'tr' || m[2] === 'triệu' ? 1e6 : 1e3);
    return Math.round(n);
  }
  return parseInt(n.replace(/[.,]/g, ''), 10);
}
module.exports = { createRevenue, parseVnd };
