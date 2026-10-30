import { createOffice } from './office.js';

const $ = (s) => document.querySelector(s);
const log = $('#log'), input = $('#input'), statusEl = $('#status'), whereEl = $('#where'), chips = $('#chips');
const office = createOffice($('#office'));
let attached = []; // [{name, path}]

// Bản chạy thử trong trình duyệt (không có Electron): giả lập để xem giao diện.
const api = window.api || {
  getCfg: async () => ({ cfg: { rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12, tone: '', browser: 'playwright', claudePath: '', groups: [] }, claude: null }),
  setCfg: async () => true, reset: async () => true, stop: async () => true, openData: async () => {}, saveFile: async (n) => '/mock/' + n,
  onEvent: (cb) => (window.__mockEmit = cb),
  send: async (t) => {
    const e = window.__mockEmit;
    e({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'WebSearch', input: {} }] } });
    await new Promise((r) => setTimeout(r, 900));
    e({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__playwright__browser_navigate', input: { url: 'https://s.taobao.com' } }] } });
    await new Promise((r) => setTimeout(r, 1200));
    e({ type: 'assistant', message: { content: [{ type: 'text', text: '(Bản giả lập) Đã nhận: ' + t }] } });
    return { ok: true };
  },
};

function add(cls, text) {
  const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text;
  log.append(d); log.scrollTop = log.scrollHeight; return d;
}
function setBusy(b) {
  statusEl.textContent = b ? 'Đang làm việc…' : 'Đang rảnh'; statusEl.classList.toggle('busy', b);
  $('#btn-send').hidden = b; $('#btn-stop').hidden = !b;
  if (!b) whereEl.textContent = office.idle();
}

const stationFor = (name) =>
  /playwright|chrome|browser/i.test(name) ? 'browser' :
  /WebSearch|WebFetch|Read|Glob|Grep/.test(name) ? 'library' : 'desk';
const toolText = (n, i) =>
  /navigate/.test(n) ? `Mở ${i?.url || 'trang web'}` : /WebSearch/.test(n) ? `Tìm: ${i?.query || ''}` :
  /Read/.test(n) ? 'Đang đọc/xem ảnh' : /Write|Edit/.test(n) ? 'Ghi nhật ký' : n.replace(/^mcp__\w+?__/, '');

api.onEvent((ev) => {
  if (ev.type !== 'assistant') return;
  for (const c of ev.message?.content || []) {
    if (c.type === 'text' && c.text.trim()) add('bot', c.text.trim());
    if (c.type === 'tool_use') { whereEl.textContent = office.act(stationFor(c.name)); add('tool', '⚙ ' + toolText(c.name, c.input)); }
  }
});

async function send(text) {
  text = text.trim(); if (!text && !attached.length) return;
  add('user', text + (attached.length ? `\n[${attached.length} ảnh]` : ''));
  const files = attached.map((a) => a.path); attached = []; chips.innerHTML = ''; input.value = '';
  setBusy(true); whereEl.textContent = office.act('desk');
  const r = await api.send(text, files);
  if (!r.ok) add('err', r.error);
  setBusy(false);
}

async function attach(fileList) {
  for (const f of fileList) {
    const path = await api.saveFile(f.name || 'dan.png', await f.arrayBuffer());
    attached.push({ name: f.name, path });
    const s = document.createElement('span'); s.textContent = '🖼 ' + (f.name || 'ảnh dán'); chips.append(s);
  }
}

$('#form').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
input.addEventListener('paste', (e) => { const f = [...e.clipboardData.files].filter((x) => x.type.startsWith('image/')); if (f.length) { e.preventDefault(); attach(f); } });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); attach([...e.dataTransfer.files].filter((x) => x.type.startsWith('image/'))); });
$('#btn-attach').onclick = () => $('#file').click();
$('#file').onchange = (e) => { attach(e.target.files); e.target.value = ''; };
$('#btn-stop').onclick = () => api.stop();
$('#btn-new').onclick = async () => { await api.reset(); log.innerHTML = ''; add('bot', 'Đã bắt đầu cuộc trò chuyện mới.'); };
$('#btn-data').onclick = () => api.openData();
document.querySelectorAll('.quick button').forEach((b) => (b.onclick = () => { input.value = b.dataset.q; input.focus(); }));

// Cài đặt
const dlg = $('#dlg'), form = $('#cfgform');
$('#btn-cfg').onclick = async () => {
  const { cfg, claude } = await api.getCfg();
  for (const el of form.elements) if (el.name && el.name !== 'groups') el.value = cfg[el.name] ?? '';
  form.elements.groups.value = cfg.groups.map((g) => [g.name, g.url || '', g.note || ''].join(' | ')).join('\n');
  $('#claudeinfo').textContent = claude ? `Đã tìm thấy claude: ${claude}` : 'Chưa tìm thấy lệnh claude — cài Claude Code và đăng nhập, hoặc nhập đường dẫn ở trên.';
  dlg.showModal();
};
form.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  const { cfg } = await api.getCfg();
  for (const k of ['rate', 'shipPerKg', 'servicePct', 'maxPostsPerDay']) cfg[k] = Number(form.elements[k].value) || 0;
  for (const k of ['tone', 'browser', 'claudePath']) cfg[k] = form.elements[k].value;
  cfg.groups = form.elements.groups.value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]).map(([name, url, note]) => ({ name, url, note }));
  await api.setCfg(cfg);
});

whereEl.textContent = office.idle();
add('bot', 'Xin chào! Gửi ảnh món cần báo giá, hoặc bảo tôi soạn bài/tìm khách. Mọi bài đăng và comment đều chờ bạn duyệt trước.');
api.getCfg().then(({ claude }) => { if (!claude) add('err', 'Chưa tìm thấy lệnh `claude`. Cài Claude Code và đăng nhập (chạy `claude` một lần), hoặc nhập đường dẫn trong Cài đặt.'); });
