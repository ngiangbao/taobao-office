// Cầu nối giữa nhóm chat trắng của văn phòng và các agent:
// - đọc tin của chủ shop trong nhóm, giao cho đúng agent (@Tên hoặc theo từ khóa);
// - đăng câu trả lời lại vào nhóm bằng tên agent;
// - đọc khối [[GIAO @Tên]]...[[/GIAO]] cuối câu trả lời để agent này giao việc tiếp cho agent khác (theo chuỗi).
const fs = require('node:fs');
const path = require('node:path');

const MAX_HOPS = 8; // chống vòng lặp giao việc
const HANDOFF = /\[\[GIAO\s+@?([^\]\n]+?)\s*\]\]([\s\S]*?)\[\[\/GIAO\]\]/gi;

function createDispatcher({ officeUrl, agents, run, uploadsDir, onStatus, history, log = () => {} }) {
  const rec = (e) => history?.append(e);
  const seen = new Set(), queues = new Map(), busy = new Set(), photos = [];
  let lastId = null, timer = null, started = false, chainSeq = 0;

  const api = (p, body) => fetch(officeUrl() + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
  const post = (agent, text, extra = {}) => api('api/chat', { op: 'say', from: agent.sid, text: String(text).slice(0, 4000), long: true, tag: 'claude', now: true, ...extra }).catch(() => {});

  async function poll() {
    let msgs;
    try { msgs = (await api('api/chat')).msgs || []; } catch { return; }
    if (!started) { msgs.forEach((m) => seen.add(m.id)); started = true; return; } // bỏ qua lịch sử cũ
    for (const m of msgs) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.from !== 'me' || !m.typed || m.recalled) continue; // typed: tin do chủ shop gõ, không phải lời nhắc văn phòng tự đăng
      if (m.photo) { try { photos.push({ at: Date.now(), file: save(m) }); } catch {} continue; }
      if (m.text && m.text.trim()) handle(m.text.trim());
    }
  }
  function save(m) {
    const d = /^data:image\/jpeg;base64,(.+)$/.exec(m.photo); if (!d) throw new Error('ảnh lạ');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const f = path.join(uploadsDir, `${Date.now()}-chat.jpg`); fs.writeFileSync(f, Buffer.from(d[1], 'base64')); return f;
  }
  function handle(text) {
    const { agent, how } = agents.route(text, lastId);
    const fresh0 = photos.filter((p) => Date.now() - p.at < 5 * 60e3).map((p) => p.file);
    rec({ kind: 'user', agent: agent?.name || null, agentId: agent?.id || null, text, files: fresh0 });
    if (!agent) {
      const list = agents.all();
      if (!list.length) return;
      const names = list.map((a) => `@${a.name}`).join(', ');
      post(list[0], how === 'ambiguous' ? `Việc này khớp nhiều agent. Hãy gọi đích danh: ${names}` : `Mình chưa biết giao việc này cho ai. Hãy gõ @Tên + việc. Các agent: ${names}`);
      return;
    }
    lastId = agent.id;
    const fresh = photos.splice(0).filter((p) => Date.now() - p.at < 5 * 60e3).map((p) => p.file); // ảnh vừa gửi kèm theo việc này
    enqueue(agent, text, fresh, { id: ++chainSeq, hops: 0, files: fresh });
  }

  /** chain: { id, hops, files } cùng một chuỗi việc (ảnh gốc đi theo mọi agent). */
  function enqueue(agent, text, files = [], chain = { id: ++chainSeq, hops: 0, files }, opts = {}) {
    const prev = queues.get(agent.id) || Promise.resolve();
    if (busy.has(agent.id)) post(agent, 'Mình đang làm việc trước đó, xong sẽ làm ngay việc này.');
    const job = prev.then(async () => {
      busy.add(agent.id); onStatus(agent.id, true);
      const prompt = files.length ? `${text}\n\n[Ảnh đính kèm, hãy dùng Read để xem: ${files.join(', ')}]` : text;
      log(`[#${chain.id}.${chain.hops} ${agent.name}] ${text.slice(0, 120).replace(/\n/g, ' ')}`);
      const r = await run(agent, prompt, opts).catch((e) => ({ error: e.message }));
      busy.delete(agent.id); onStatus(agent.id, false);
      if (r.error && !r.text) { rec({ kind: 'error', agent: agent.name, agentId: agent.id, text: String(r.error).slice(-600), chain: chain.id, hop: chain.hops }); await post(agent, `Mình gặp lỗi: ${String(r.error).slice(-300)}`); return; }
      await finish(agent, r.text || '', chain);
    });
    queues.set(agent.id, job.catch(() => {}));
    return job;
  }

  // Kết quả của một agent: phần chữ hiện trong nhóm; các khối GIAO chuyển việc cho agent khác.
  async function finish(agent, text, chain) {
    const jobs = [];
    const shown = text.replace(HANDOFF, (_, name, body) => { jobs.push({ name: name.trim(), body: body.trim() }); return ''; }).trim();
    if (!jobs.length) { const t = shown || 'Xong rồi nhưng mình không có gì để báo thêm.'; rec({ kind: 'agent', agent: agent.name, agentId: agent.id, text: t, chain: chain.id, hop: chain.hops }); await post(agent, t); return; }
    if (shown) rec({ kind: 'agent', agent: agent.name, agentId: agent.id, text: shown, chain: chain.id, hop: chain.hops });
    const lines = [];
    const todo = [];
    for (const j of jobs) {
      const to = agents.byName(j.name);
      if (!to || to.id === agent.id) { lines.push(`⚠️ Không giao được cho "${j.name}": không có agent này.`); continue; }
      if (chain.hops >= MAX_HOPS) { lines.push(`⚠️ Dừng chuỗi việc: đã giao quá ${MAX_HOPS} lần.`); break; }
      lines.push(`➜ Giao cho @${to.name}`);
      rec({ kind: 'handoff', agent: agent.name, agentId: agent.id, to: to.name, toId: to.id, text: j.body, chain: chain.id, hop: chain.hops + 1 });
      todo.push({ to, j });
    }
    await post(agent, [shown, ...lines].filter(Boolean).join('\n'));
    for (const { to, j } of todo) {
      const prompt = `Việc được giao từ @${agent.name} (chuỗi việc #${chain.id}, bước ${chain.hops + 1}):\n${j.body}`;
      enqueue(to, prompt, chain.files, { ...chain, hops: chain.hops + 1 });
    }
  }

  return {
    start() { if (!timer) timer = setInterval(poll, 1200); poll(); },
    stop() { clearInterval(timer); timer = null; },
    enqueue, post,
    isBusy: (id) => busy.has(id), anyBusy: () => busy.size > 0,
  };
}
module.exports = { createDispatcher };
