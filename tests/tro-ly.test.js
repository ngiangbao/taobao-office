const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { policy, WRITE } = require('../lib/tools');
const { createStyle, parseStyle } = require('../lib/style');
const { autoPostGuard, alreadyCommented, createScanner, inHours } = require('../lib/commenter');
const { createApprovals } = require('../lib/approvals');
const { createAgents, TEMPLATES } = require('../lib/agents');
const { createDispatcher } = require('../lib/dispatcher');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-tl-'));
const ROLES = Object.keys(TEMPLATES).filter((r) => !['inventory', 'assistant', 'custom'].includes(r));
const NOON = new Date(2026, 9, 31, 12, 0, 0);
const POST = 'https://www.facebook.com/groups/a/posts/1';

test('sổ phong cách: chỉ nhận vai trò hợp lệ, mỗi agent chỉ nhận mục của mình, xoá được', () => {
  const dir = tmp(); const s = createStyle(dir, ROLES);
  const e = s.add({ kind: 'comment', roles: 'commenter,cskh', text: 'Ngắn, thân thiện, kết bằng "nhắn shop nha"' });
  s.add({ kind: 'van_phong', roles: 'tat_ca', text: 'Xưng shop, gọi bạn' });
  assert.throws(() => s.add({ kind: 'bay', roles: 'cskh', text: 'x' }), /không hợp lệ/);
  assert.throws(() => s.add({ kind: 'comment', roles: 'hacker', text: 'x' }), /vai trò/);
  assert.match(s.forRole('commenter'), /nhắn shop nha/);
  assert.match(s.forRole('quote'), /Xưng shop/);
  assert.ok(!s.forRole('quote').includes('nhắn shop nha'));
  assert.equal(s.forRole('khach').includes('Xưng shop'), true);
  assert.ok(s.remove(e.id)); assert.ok(!s.forRole('commenter').includes('nhắn shop nha'));
  assert.equal(createStyle(dir, ROLES).all().length, 1, 'lưu vào đĩa');
  const { blocks, rest } = parseStyle('Đã dạy.\n[[DAY_PHONG_CACH loai="comment" danh_cho="cskh"]]mẫu[[/DAY_PHONG_CACH]]');
  assert.deepEqual(blocks, [{ kind: 'comment', roles: 'cskh', text: 'mẫu' }]); assert.equal(rest, 'Đã dạy.');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bảng quyền: quét bảng tin chỉ xem; trợ lý riêng không có web hay trình duyệt', () => {
  const sc = policy('scanner', { scroll: true });
  for (const w of WRITE) assert.ok(sc.denied.includes(w), w);
  for (const t of ['Write', 'Edit', 'Bash', 'WebFetch', 'WebSearch']) assert.ok(sc.denied.includes(t), t);
  assert.ok(sc.allowed.includes('mcp__playwright__browser_navigate') && sc.allowed.includes('mcp__playwright__browser_press_key'));
  assert.ok(policy('scanner').denied.includes('mcp__playwright__browser_press_key'), 'không cuộn khi lớp chặn phím chưa chạy được');
  const as = policy('assistant');
  assert.deepEqual(as.allowed, ['Read', 'Write', 'Edit']);
  for (const t of ['Bash', 'WebFetch', 'WebSearch', 'mcp__playwright']) assert.ok(as.denied.includes(t), t);
});

test('giới hạn cứng của tự đăng bình luận', () => {
  const dir = tmp(); const ap = createApprovals(dir);
  const item = (text, kind = 'binh_luan') => ({ kind, text });
  const on = { commentAutoPost: true, commentAutoMax: 2, maxPostsPerDay: 12 };
  assert.equal(autoPostGuard({}, ap, item('Shop có nha bạn, nhắn shop nhé'), NOON).ok, false, 'mặc định tắt');
  assert.equal(autoPostGuard(on, ap, item('Shop có nha bạn, nhắn shop nhé'), NOON).ok, true);
  for (const bad of ['xem https://x.com', 'gọi 0912 345 678', 'liên hệ shop.com', 'hỏi @ai đó', 'a'.repeat(301)]) assert.equal(autoPostGuard(on, ap, item(bad), NOON).ok, false, bad);
  assert.equal(autoPostGuard(on, ap, item('ok', 'bai_dang'), NOON).ok, false, 'không tự đăng bài vào nhóm');
  assert.equal(autoPostGuard(on, ap, item('ok'), new Date(2026, 9, 31, 3)).ok, false, 'ngoài giờ');
  assert.equal(inHours({ commentFromHour: 22, commentToHour: 6 }, new Date(2026, 9, 31, 23)), true);
  for (const n of [1, 2]) { const a = ap.create({ agentId: 'x', agentName: 'x', kind: 'binh_luan', target: POST + n, text: 'ok' }); ap.approve(a.id, a.hash, true); }
  const today = new Date(); today.setHours(12, 0, 0, 0);
  assert.equal(autoPostGuard(on, ap, item('ok'), today).ok, false, 'đủ hạn mức 2/ngày');
  assert.ok(alreadyCommented(ap, POST + '1?x=1') && !alreadyCommented(ap, POST + '9'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bộ quét: không chạy chồng, không chạy khi agent đang bận', async () => {
  let n = 0, busy = true; const sc = createScanner({ getCfg: () => ({}), busy: () => busy, run: async () => { n++; await new Promise((r) => setTimeout(r, 30)); } });
  assert.equal((await sc.scan()).ok, false); assert.equal(n, 0);
  busy = false; const [a, b] = await Promise.all([sc.scan(), sc.scan()]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]); assert.equal(n, 1);
});

async function setup(runImpl, cfg = {}) {
  const dir = tmp(), posts = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.setHeader('Content-Type', 'application/json'); if (req.method === 'POST') { posts.push(JSON.parse(b)); res.end('{"ok":true}'); } else res.end('{"msgs":[]}'); }); });
  await new Promise((r) => srv.listen(0, r));
  const agents = createAgents(dir), approvals = createApprovals(dir), style = createStyle(dir, ROLES);
  const assistant = agents.add({ name: 'Trợ lý riêng', role: 'assistant' }), commenter = agents.add({ name: 'Trả lời comment', role: 'commenter' }), cskh = agents.add({ name: 'Chăm sóc khách', role: 'cskh' });
  const published = [];
  const full = { publishGapSeconds: 0, maxPostsPerDay: 12, ...cfg };
  let d;
  const autoApprove = (agent, a) => { const g = autoPostGuard(full, approvals, a, NOON); if (!g.ok) return g; const item = approvals.approve(a.id, a.hash, true); d.publishApproved(item); return { ok: true }; };
  d = createDispatcher({ officeUrl: () => `http://127.0.0.1:${srv.address().port}/`, agents, approvals, style, autoApprove, publisher: async (item) => { published.push(item); return { text: 'ĐÃ ĐĂNG: ok' }; }, run: runImpl, uploadsDir: path.join(dir, 'uploads'), getCfg: () => full });
  const idle = async () => { for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 25)); if (!d.anyBusy()) { await new Promise((r) => setTimeout(r, 60)); if (!d.anyBusy()) return; } } };
  return { dir, agents, approvals, style, assistant, commenter, cskh, d, posts, published, idle, close: () => { d.stop(); srv.closeAllConnections?.(); srv.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const TEACH = 'Đã dạy.\n[[DAY_PHONG_CACH loai="comment" danh_cho="commenter"]]Hay mở bằng "Dạ shop có nè"[[/DAY_PHONG_CACH]]';

test('chỉ Trợ lý riêng, khi việc do chủ shop giao, mới dạy được phong cách', async () => {
  const t = await setup(async () => ({ text: TEACH }));
  try {
    await t.d.enqueue(t.cskh, 'x', [], { id: 1, hops: 0, files: [], owner: true }); await t.idle();
    assert.equal(t.style.all().length, 0, 'agent khác bị bỏ qua');
    await t.d.enqueue(t.assistant, 'x', [], { id: 2, hops: 0, files: [] }); await t.idle();
    assert.equal(t.style.all().length, 0, 'việc không do chủ shop giao bị bỏ qua');
    await t.d.enqueue(t.assistant, 'x', [], { id: 3, hops: 0, files: [], owner: true }); await t.idle();
    assert.equal(t.style.all().length, 1);
    assert.match(t.style.forRole('commenter'), /shop có nè/);
    assert.ok(!t.posts.some((p) => /DAY_PHONG_CACH/.test(p.text || '')));
  } finally { t.close(); }
});

const COMMENT = `Có 1 bài.\n[[DE_XUAT loai="binh_luan" dich="${POST}"]]Dạ shop có mẫu này nè bạn, nhắn shop nhé[[/DE_XUAT]]`;
test('quét bảng tin: mặc định chỉ vào hàng chờ duyệt, không tự đăng; bật tự đăng thì đăng đúng một lần và không lặp bài cũ', async () => {
  let t = await setup(async () => ({ text: COMMENT }));
  try {
    await t.d.runSystem(t.commenter, 'quét'); await t.idle();
    assert.equal(t.approvals.pending().length, 1); assert.equal(t.published.length, 0);
    await t.d.runSystem(t.commenter, 'quét'); await t.idle();
    assert.equal(t.approvals.all().length, 1, 'không đề xuất lại vào bài đã có bình luận');
  } finally { t.close(); }
  t = await setup(async () => ({ text: COMMENT }), { commentAutoPost: true, commentAutoMax: 5 });
  try {
    await t.d.runSystem(t.commenter, 'quét'); await t.idle();
    assert.equal(t.published.length, 1); assert.equal(t.published[0].auto, true);
    assert.equal(t.published[0].text, 'Dạ shop có mẫu này nè bạn, nhắn shop nhé');
  } finally { t.close(); }
  t = await setup(async () => ({ text: 'Không có bài phù hợp lượt này.' }));
  try { await t.d.runSystem(t.commenter, 'quét'); await t.idle(); assert.ok(!t.posts.some((p) => /Không có bài/.test(p.text || '')), 'lượt trống không làm ồn khung chat'); }
  finally { t.close(); }
});
