// Lịch sử chat với các agent, lưu mãi mãi trên máy bạn: history/YYYY-MM.jsonl (mỗi tháng một file, mỗi dòng một tin).
// Khung chat của văn phòng chỉ giữ một số tin gần nhất; file này không bao giờ bị cắt hay xóa tự động.
const fs = require('node:fs');
const path = require('node:path');

function createHistory(dataDir) {
  const dir = path.join(dataDir, 'history');
  fs.mkdirSync(dir, { recursive: true });
  const files = () => fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}\.jsonl$/.test(f)).sort().reverse(); // mới nhất trước
  return {
    dir,
    /** e: { kind: 'user'|'agent'|'handoff'|'error', agent, agentId, to?, text, files?, chain?, hop? } */
    append(e) {
      const rec = { t: new Date().toISOString(), ...e };
      try { fs.appendFileSync(path.join(dir, rec.t.slice(0, 7) + '.jsonl'), JSON.stringify(rec) + '\n'); } catch (err) { console.error('history', err.message); }
    },
    /** Tin mới nhất trước. before: ISO time (phân trang), agentId: chỉ một agent, q: tìm trong nội dung. */
    query({ agentId = '', q = '', before = '', limit = 150 } = {}) {
      const needle = String(q).trim().toLowerCase(), out = [];
      for (const f of files()) {
        let lines;
        try { lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n'); } catch { continue; }
        for (let i = lines.length - 1; i >= 0; i--) {
          if (!lines[i]) continue;
          let r; try { r = JSON.parse(lines[i]); } catch { continue; }
          if (before && r.t >= before) continue;
          if (agentId && r.agentId !== agentId && r.toId !== agentId) continue;
          if (needle && !`${r.text} ${r.agent || ''} ${r.to || ''}`.toLowerCase().includes(needle)) continue;
          out.push(r);
          if (out.length > limit) return { items: out.slice(0, limit), more: true };
        }
      }
      return { items: out, more: false };
    },
  };
}
module.exports = { createHistory };
