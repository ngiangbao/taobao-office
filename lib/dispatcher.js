// Cầu nối giữa nhóm chat trắng của văn phòng và các agent:
// - đọc tin của chủ shop trong nhóm, giao cho đúng agent (@Tên hoặc theo từ khóa);
// - đăng câu trả lời lại vào nhóm bằng tên agent;
// - đọc khối [[GIAO @Tên]]...[[/GIAO]] cuối câu trả lời để agent này giao việc tiếp cho agent khác (theo chuỗi);
// - tin bị chủ shop thu hồi: huỷ cả chuỗi việc của tin đó (dừng tiến trình đang chạy, bỏ việc đang chờ, xoá khỏi lịch sử).
const fs = require('node:fs');
const path = require('node:path');

const MAX_HOPS = 8; // chống vòng lặp giao việc
const HANDOFF = /\[\[GIAO\s+@?([^\]\n]+?)\s*\]\]([\s\S]*?)\[\[\/GIAO\]\]/gi;
const REMEMBER = 2000; // số tin gần nhất còn nhớ để xử lý thu hồi (nhóm chat chỉ giữ 300 tin)

function createDispatcher({ officeUrl, agents, run, uploadsDir, onStatus = () => {}, history, killAgent, log = () => {}, rememberLimit = REMEMBER }) {
  const rec = (e) => history?.append(e);
  const queues = new Map(), busy = new Set(), photos = [];
  let lastId = null, timer = null, started = false, chainSeq = 0;
  // Mốc tin cuối đã đọc. Không giữ mãi id của mọi tin: mỗi lần chỉ đọc phần mới hơn mốc này,
  // nhờ vậy bộ nhớ không phình theo thời gian dù app chạy nhiều ngày.
  let wm = { id: null, at: 0 };
  const chains = new Map();   // chainId -> { msgId, agentId, running }
  const msgChain = new Map(); // mã tin trong nhóm -> chainId
  const cancelled = new Set(); // chainId của tin đã bị thu hồi

  const api = (p, body) => fetch(officeUrl() + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined).then((r) => r.json());
  const post = (agent, text, extra = {}) => api('api/chat', { op: 'say', from: agent.sid, text: String(text).slice(0, 4000), long: true, tag: 'claude', now: true, ...extra }).catch(() => {});

  // Giữ map có giới hạn: bỏ mục cũ nhất khi vượt rememberLimit (tin cũ hơn thế đã ra khỏi nhóm chat, không thu hồi được nữa).
  function remember(map, k, v) {
    map.set(k, v);
    if (map.size > rememberLimit) map.delete(map.keys().next().value);
  }

  async function poll() {
    let msgs;
    try { msgs = (await api('api/chat')).msgs || []; } catch { return; }
    if (!started) { const last = msgs.at(-1); if (last) wm = { id: last.id, at: last.at }; started = true; return; } // bỏ qua lịch sử cũ
    for (const m of msgs) if (m.recalled) cancel(m.id); // thu hồi: tìm trong cả khung tin, không chỉ tin mới
    for (const m of msgs.slice(nextIndex(msgs))) {
      if (m.from !== 'me' || !m.typed || m.recalled) continue; // typed: tin do chủ shop gõ, không phải lời nhắc văn phòng tự đăng
      if (m.photo) { try { photos.push({ at: Date.now(), file: save(m), id: m.id }); if (photos.length > 20) photos.shift(); } catch {} continue; }
      if (m.text && m.text.trim()) handle(m);
    }
    const last = msgs.at(-1); if (last) wm = { id: last.id, at: last.at };
  }

  // Vị trí bắt đầu đọc: ngay sau tin cuối đã xử lý. Nếu tin đó đã bị đẩy ra khỏi khung thì dùng mốc thời gian
  // để không đọc lại tin cũ.
  function nextIndex(msgs) {
    if (!wm.id) return 0;
    const i = msgs.findIndex((m) => m.id === wm.id);
    if (i >= 0) return i + 1;
    const j = msgs.findIndex((m) => m.at > wm.at);
    return j >= 0 ? j : msgs.length;
  }

  function save(m) {
    const d = /^data:image\/jpeg;base64,(.+)$/.exec(m.photo); if (!d) throw new Error('ảnh lạ');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const f = path.join(uploadsDir, `${Date.now()}-chat.jpg`); fs.writeFileSync(f, Buffer.from(d[1], 'base64')); return f;
  }

  function handle(m) {
    const text = m.text.trim();
    const { agent, how } = agents.route(text, lastId);
    const fresh0 = photos.filter((p) => Date.now() - p.at < 5 * 60e3).map((p) => p.file);
    const chain = { id: ++chainSeq, hops: 0, files: [], msgId: m.id };
    remember(msgChain, m.id, chain.id);
    chains.set(chain.id, { msgId: m.id, agentId: agent?.id || null, running: null });
    if (chains.size > rememberLimit) chains.delete(chains.keys().next().value); // giới hạn bộ nhớ khi agent kẹt việc
    rec({ kind: 'user', id: m.id, agent: agent?.name || null, agentId: agent?.id || null, text, files: fresh0, chain: chain.id });
    if (!agent) {
      const list = agents.all();
      if (!list.length) return;
      const names = list.map((a) => `@${a.name}`).join(', ');
      post(list[0], how === 'ambiguous' ? `Việc này khớp nhiều agent. Hãy gọi đích danh: ${names}` : `Mình chưa biết giao việc này cho ai. Hãy gõ @Tên + việc. Các agent: ${names}`);
      return;
    }
    lastId = agent.id;
    const fresh = photos.splice(0).filter((p) => Date.now() - p.at < 5 * 60e3).map((p) => p.file); // ảnh vừa gửi kèm theo việc này
    chain.files = fresh;
    enqueue(agent, text, fresh, chain);
  }

  /** Tin đã bị thu hồi: dừng việc của cả chuỗi (nếu đang chạy), bỏ phần chưa tới lượt, xoá dấu vết. */
  function cancel(msgId) {
    const cid = msgChain.get(msgId);
    if (cid == null || cancelled.has(cid)) return;
    cancelled.add(cid);
    if (cancelled.size > rememberLimit) cancelled.delete(cancelled.values().next().value);
    const p = photos.findIndex((x) => x.id === msgId); // ảnh chưa dùng: xoá cả tệp trên đĩa
    if (p >= 0) { const f = photos[p].file; photos.splice(p, 1); try { fs.rmSync(f); } catch {} }
    const c = chains.get(cid);
    if (c?.running) killAgent?.(c.running);
    const n = history?.remove?.({ chain: cid }) || 0;
    log(`[huỷ #${cid}] tin nhắn bị thu hồi (${n} dòng lịch sử)`);
    const a = c?.agentId && agents.get(c.agentId);
    if (a) post(a, '⏹ Đã huỷ việc của tin nhắn vừa thu hồi.');
    chains.delete(cid);
    msgChain.delete(msgId); // đã xử lý xong: không cần nhớ tin này nữa
  }

  /** chain: { id, hops, files, msgId } cùng một chuỗi việc (ảnh gốc đi theo mọi agent). */
  function enqueue(agent, text, files = [], chain = { id: ++chainSeq, hops: 0, files }, opts = {}) {
    const prev = queues.get(agent.id) || Promise.resolve();
    if (busy.has(agent.id)) post(agent, 'Mình đang làm việc trước đó, xong sẽ làm ngay việc này.');
    const job = prev.then(async () => {
      if (cancelled.has(chain.id)) return; // tin đã bị thu hồi trước khi tới lượt
      busy.add(agent.id); onStatus(agent.id, true);
      const c = chains.get(chain.id); if (c) c.running = agent.id;
      const prompt = files.length ? `${text}\n\n[Ảnh đính kèm, hãy dùng Read để xem: ${files.join(', ')}]` : text;
      log(`[#${chain.id}.${chain.hops} ${agent.name}] ${text.slice(0, 120).replace(/\n/g, ' ')}`);
      const r = await run(agent, prompt, opts).catch((e) => ({ error: e.message }));
      if (c) c.running = null;
      busy.delete(agent.id); onStatus(agent.id, false);
      if (cancelled.has(chain.id)) return; // bị thu hồi trong lúc đang chạy: không trả lời, không giao tiếp
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
    if (!jobs.length) { const t = shown || 'Xong rồi nhưng mình không có gì để báo thêm.'; rec({ kind: 'agent', agent: agent.name, agentId: agent.id, text: t, chain: chain.id, hop: chain.hops }); await post(agent, t); chains.delete(chain.id); return; }
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
    if (!todo.length) { chains.delete(chain.id); return; }
    for (const { to, j } of todo) {
      const prompt = `Việc được giao từ @${agent.name} (chuỗi việc #${chain.id}, bước ${chain.hops + 1}):\n${j.body}`;
      enqueue(to, prompt, chain.files, { ...chain, hops: chain.hops + 1 });
    }
  }

  return {
    start() { if (!timer) timer = setInterval(poll, 1200); poll(); },
    stop() { clearInterval(timer); timer = null; },
    poll, enqueue, post, cancel,
    isBusy: (id) => busy.has(id), anyBusy: () => busy.size > 0,
    /** Số mục đang giữ trong bộ nhớ (dùng cho kiểm thử: phải có giới hạn). */
    stats: () => ({ chains: chains.size, remembered: msgChain.size, cancelled: cancelled.size, photos: photos.length }),
    /** Dừng mọi việc đang chờ/đang chạy (dùng khi bấm "Dừng tất cả"). */
    stopAll() {
      for (const [id] of chains) cancelled.add(id);
      for (const c of chains.values()) if (c.running) killAgent?.(c.running);
      chains.clear(); queues.clear();
    },
  };
}
module.exports = { createDispatcher };
