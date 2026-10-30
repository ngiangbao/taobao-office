// Kiểm thử nhanh dispatcher, không cần Electron/Claude: giả lập nhóm chat của văn phòng.
// Điều cần chắc: tin mới được giao đúng agent; thu hồi tin thì dừng việc (đang chạy và đang chờ),
// xoá lịch sử của chuỗi đó; bộ nhớ giữ trong giới hạn.
// Chạy: node scripts/test-dispatcher.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDispatcher } = require('../lib/dispatcher');

let msgs = [];
const posts = [], kills = [], removed = [], logs = [];
const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-dispatch-'));

global.fetch = async (url, init) => {
  if (!init) return { json: async () => ({ msgs }) };
  posts.push(JSON.parse(init.body));
  return { json: async () => ({ ok: true }) };
};

const agent = { id: 'a1', name: 'Báo giá', sid: 's1', role: 'quote' };
const agents = {
  route: () => ({ agent, how: 'keyword' }), all: () => [agent],
  get: (id) => (id === agent.id ? agent : null), byName: () => agent,
};
const history = { append: () => {}, remove: (o) => { removed.push(o); return 1; } };

const runs = [];
let finishRun = null;
const run = (a, prompt) => { runs.push(prompt); return new Promise((resolve) => { finishRun = resolve; }); };

const d = createDispatcher({
  officeUrl: () => 'http://test/', agents, run, uploadsDir: uploads, history, rememberLimit: 3,
  killAgent: (id) => { kills.push(id); finishRun?.({ code: -1, err: 'bị dừng' }); },
  log: (l) => logs.push(l),
});

const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
const say = (id, text) => msgs.push({ id, at: msgs.length + 1, from: 'me', typed: true, text });
const recall = (id) => { const m = msgs.find((x) => x.id === id); Object.assign(m, { recalled: true, text: '', photo: null }); };
const last = () => posts.at(-1)?.text || '';

(async () => {
  // 0. lần đọc đầu tiên chỉ ghi mốc: không xử lý tin cũ có sẵn trong nhóm
  say('old', 'tin cũ trước khi mở app');
  await d.poll();
  assert.equal(runs.length, 0, 'không xử lý tin cũ khi mới mở app');

  // 1. tin mới -> giao cho agent, trả lời lên nhóm
  say('m1', 'báo giá áo khoác');
  await d.poll(); await tick();
  assert.equal(runs.length, 1, 'tin mới phải được giao cho agent');
  assert.equal(posts.length, 0, 'chưa trả lời khi agent còn đang chạy');
  finishRun({ text: 'Áo 250k' }); await tick();
  assert.equal(last(), 'Áo 250k', 'câu trả lời của agent phải lên nhóm');
  assert.equal(d.stats().chains, 0, 'xong việc thì không giữ lại chuỗi');

  // 2. thu hồi tin đang chạy -> dừng agent, không trả lời, xoá lịch sử
  say('m2', 'báo giá quần');
  await d.poll(); await tick();
  assert.equal(runs.length, 2);
  recall('m2');
  await d.poll(); await tick();
  assert.deepEqual(kills, ['a1'], 'thu hồi phải dừng tiến trình đang chạy');
  assert.ok(last().startsWith('⏹'), 'phải báo đã huỷ trong nhóm');
  assert.ok(!posts.some((p) => p.text === 'quần 180k'), 'không được trả lời tin đã thu hồi');
  assert.ok(removed.some((o) => o.chain === 2), 'phải xoá lịch sử của chuỗi bị thu hồi');

  // 3. thu hồi tin đang chờ (agent còn bận việc trước) -> không bao giờ chạy
  say('m3', 'báo giá mũ');
  await d.poll(); await tick();
  const before = runs.length;
  say('m4', 'báo giá giày');
  await d.poll(); await tick();               // m4 vào hàng chờ
  recall('m4');
  await d.poll();
  finishRun({ text: 'Mũ 90k' }); await tick(); // m3 xong
  await tick();
  assert.equal(runs.length, before, 'tin bị thu hồi lúc đang chờ không được chạy');
  assert.ok(!runs.includes('báo giá giày'), 'không được giao việc của tin đã thu hồi');

  // 4. bộ nhớ có giới hạn: chỉ nhớ rememberLimit tin gần nhất
  d.stopAll();
  for (let i = 0; i < 6; i++) { say('n' + i, 'việc ' + i); await d.poll(); }
  const s = d.stats();
  assert.ok(s.remembered <= 3, `chỉ được nhớ 3 tin, đang giữ ${s.remembered}`);
  assert.ok(s.chains <= 3, `chỉ được giữ 3 chuỗi, đang giữ ${s.chains}`);

  console.log('✓ dispatcher: 4 nhóm kiểm thử đạt');
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
