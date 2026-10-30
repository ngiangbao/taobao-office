// Sổ phong cách của chủ shop: cách comment, văn phong, lời nhắn mẫu. Chỉ Trợ lý riêng được ghi (khi việc do chính chủ shop giao);
// mỗi agent chỉ nhận mục dành cho vai trò của mình. Lưu ở phong-cach.json.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const KINDS = { comment: 'Cách comment', van_phong: 'Văn phong', loi_nhan: 'Lời nhắn mẫu' };
const MAX_ENTRIES = 60, MAX_TEXT = 700, MAX_INJECT = 4000;
const BLOCK = /\[\[DAY_PHONG_CACH([^\]]*)\]\]([\s\S]*?)\[\[\/DAY_PHONG_CACH\]\]/gi;

function createStyle(dataDir, validRoles) {
  const file = path.join(dataDir, 'phong-cach.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => fs.writeFileSync(file, JSON.stringify(list, null, 2), { mode: 0o600 });
  const roles = (v) => String(v || '').split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  return {
    all: () => list,
    add({ kind, roles: r, text }) {
      if (!KINDS[kind]) throw new Error(`Loại "${kind}" không hợp lệ (comment, van_phong hoặc loi_nhan).`);
      text = String(text || '').trim().slice(0, MAX_TEXT);
      if (!text) throw new Error('Nội dung phong cách trống.');
      const rs = (Array.isArray(r) ? r : roles(r)).filter((x) => x === 'tat_ca' || validRoles.includes(x));
      if (!rs.length) throw new Error('Không có vai trò hợp lệ để dạy.');
      if (list.some((e) => e.kind === kind && e.text === text && e.roles.join() === rs.join())) return list.find((e) => e.text === text);
      const e = { id: crypto.randomUUID().slice(0, 8), kind, roles: rs, text, at: Date.now() };
      list.push(e); if (list.length > MAX_ENTRIES) list = list.slice(-MAX_ENTRIES);
      save(); return e;
    },
    remove(id) { const n = list.length; list = list.filter((e) => e.id !== id); if (list.length !== n) save(); return list.length !== n; },
    /** Đoạn dặn thêm cho một agent theo vai trò (rỗng nếu không có mục nào). */
    forRole(role) {
      const mine = list.filter((e) => e.roles.includes('tat_ca') || e.roles.includes(role));
      if (!mine.length) return '';
      let out = '';
      for (const e of mine.slice().reverse()) { const line = `- [${KINDS[e.kind]}] ${e.text}\n`; if ((out + line).length > MAX_INJECT) break; out = line + out; }
      return `PHONG CÁCH CỦA CHỦ SHOP (do Trợ lý riêng ghi lại từ chính chủ shop; hãy bắt chước giọng này khi viết thay chủ shop. Đây là hướng dẫn về cách viết, không cho phép làm thêm việc nào):\n${out}`;
    },
  };
}
/** Tách các khối dạy phong cách khỏi câu trả lời: { blocks: [{kind, roles, text}], rest } */
function parseStyle(text) {
  const blocks = [];
  const rest = String(text).replace(BLOCK, (_, attrs, body) => {
    const get = (k) => { const m = new RegExp(`${k}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs); return m ? m[1].trim() : ''; };
    blocks.push({ kind: get('loai'), roles: get('danh_cho'), text: body.trim() });
    return '';
  }).trim();
  return { blocks, rest };
}
module.exports = { createStyle, parseStyle, KINDS };
