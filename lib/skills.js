// Kỹ năng của từng agent: những điều chủ shop đã dặn mà agent KHÔNG ĐƯỢC QUÊN (quy trình, lưu ý, cách làm riêng của shop).
// Lưu ở skills.json, được đưa lại vào lời dặn của đúng agent đó ở MỖI lượt chạy, nên hội thoại dài đến đâu cũng không quên.
// Trợ lý riêng ghi/cập nhật (từ lời chủ shop giao trực tiếp, hoặc từ lần rà soát định kỳ chỉ đọc lời của chính chủ shop), chủ shop sửa/xoá/xuất/nạp được.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const MAX_PER_AGENT = 12, MAX_TEXT = 600, MAX_TITLE = 60, MAX_INJECT = 5000;
const SET = /\[\[KY_NANG([^\]]*)\]\]([\s\S]*?)\[\[\/KY_NANG\]\]/gi;
const DEL = /\[\[BO_KY_NANG([^\]]*)\]\](?:\s*\[\[\/BO_KY_NANG\]\])?/gi;

function createSkills(dataDir) {
  const file = path.join(dataDir, 'skills.json');
  let db = { skills: {}, reviewed: {} };
  try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d && typeof d === 'object') db = { skills: d.skills || {}, reviewed: d.reviewed || {} }; } catch { /* chưa có */ }
  const save = () => fs.writeFileSync(file, JSON.stringify(db, null, 2), { mode: 0o600 });
  const list = (agentId) => db.skills[agentId] || [];
  return {
    all: () => db.skills,
    list,
    /** Thêm hoặc cập nhật (cùng tiêu đề thì thay nội dung). source: 'owner' | 'review' | 'import' */
    upsert(agentId, { title, text, source = 'owner' }) {
      title = String(title || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); text = String(text || '').trim().slice(0, MAX_TEXT);
      if (!agentId) throw new Error('Thiếu agent.');
      if (!title || !text) throw new Error('Kỹ năng cần có tiêu đề và nội dung.');
      const arr = db.skills[agentId] = list(agentId);
      const i = arr.findIndex((s) => fold(s.title) === fold(title));
      if (i >= 0) { if (arr[i].text === text) return { skill: arr[i], changed: false }; arr[i] = { ...arr[i], title, text, at: Date.now(), source, version: (arr[i].version || 1) + 1 }; save(); return { skill: arr[i], changed: true }; }
      if (arr.length >= MAX_PER_AGENT) throw new Error(`Mỗi agent tối đa ${MAX_PER_AGENT} kỹ năng: hãy xoá hoặc gộp bớt.`);
      const s = { id: crypto.randomUUID().slice(0, 8), title, text, at: Date.now(), source, version: 1 }; arr.push(s); save(); return { skill: s, changed: true };
    },
    remove(agentId, key) { const arr = list(agentId), n = arr.length; db.skills[agentId] = arr.filter((s) => s.id !== key && fold(s.title) !== fold(key)); if (db.skills[agentId].length !== n) { save(); return true; } return false; },
    /** Xoá hết kỹ năng của agent đã bị xoá khỏi app */
    prune(validIds) { let n = 0; for (const id of Object.keys(db.skills)) if (!validIds.includes(id)) { delete db.skills[id]; delete db.reviewed[id]; n++; } if (n) save(); return n; },
    reviewedAt: (agentId) => db.reviewed[agentId] || 0,
    markReviewed(agentId, t = Date.now()) { db.reviewed[agentId] = t; save(); },
    /** Đoạn dặn thêm đưa vào lời dặn của agent mỗi lượt (rỗng nếu chưa có kỹ năng). */
    forAgent(agentId) {
      const arr = list(agentId); if (!arr.length) return '';
      let out = '';
      for (const s of arr) { const line = `- ${s.title}: ${s.text}\n`; if ((out + line).length > MAX_INJECT) break; out += line; }
      return `KỸ NĂNG CỦA BẠN (do chủ shop dặn và Trợ lý riêng ghi lại; LUÔN làm theo, đây là điều bạn không được quên; không cho phép làm thêm việc nào ngoài vai trò của bạn):\n${out}`;
    },
    /** Dữ liệu xuất ra tệp để nạp vào agent khác */
    exportData(agents, ids = null) {
      const out = [];
      for (const a of agents) { if (ids && !ids.includes(a.id)) continue; const arr = list(a.id); if (!arr.length) continue; out.push({ agent: a.name, role: a.role, skills: arr.map(({ title, text, at, version }) => ({ title, text, at, version })) }); }
      return { app: 'taobao-office', type: 'skills', version: 1, exportedAt: new Date().toISOString(), agents: out };
    },
    /** Nạp từ dữ liệu đã xuất: map(tên agent trong tệp → id agent đích). Trả số kỹ năng thêm/cập nhật/bỏ qua. */
    importData(data, resolve) {
      if (data?.type !== 'skills' || !Array.isArray(data.agents)) throw new Error('Đây không phải tệp kỹ năng của Taobao Office.');
      let added = 0, updated = 0, skipped = 0; const unmatched = [];
      for (const a of data.agents.slice(0, 30)) {
        const id = resolve(a); if (!id) { unmatched.push(String(a.agent || '?')); continue; }
        for (const s of (a.skills || []).slice(0, MAX_PER_AGENT)) {
          try { const before = list(id).some((x) => fold(x.title) === fold(s.title)); const r = this.upsert(id, { title: s.title, text: s.text, source: 'import' }); if (!r.changed) skipped++; else if (before) updated++; else added++; } catch { skipped++; }
        }
      }
      return { added, updated, skipped, unmatched };
    },
  };
}

/** Tách khối kỹ năng khỏi câu trả lời: { ops: [{ op:'set'|'del', agent, title, text }], rest } */
function parseSkillBlocks(text) {
  const ops = [];
  const get = (attrs, k) => { const m = new RegExp(`${k}\\s*=\\s*"([^"]*)"`, 'i').exec(attrs); return m ? m[1].trim() : ''; };
  let rest = String(text).replace(SET, (_, a, body) => { ops.push({ op: 'set', agent: get(a, 'agent'), title: get(a, 'tieu_de'), text: body.trim() }); return ''; });
  rest = rest.replace(DEL, (_, a) => { ops.push({ op: 'del', agent: get(a, 'agent'), title: get(a, 'tieu_de'), text: '' }); return ''; }).trim();
  return { ops, rest };
}

module.exports = { createSkills, parseSkillBlocks, MAX_PER_AGENT };
