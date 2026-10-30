const $ = (s) => document.querySelector(s);
const frame = $('#office'), wait = $('#office-wait'), box = $('#agents'), toast = $('#toast');
const showOffice = (u) => { if (u && frame.src !== u) { frame.src = u; frame.onload = () => wait.classList.add('hide'); } };
const say = (t) => { toast.textContent = t; toast.hidden = !t; };
let templates = {};

// Bản chạy thử trong trình duyệt (không có Electron): giả lập để xem giao diện.
const api = window.api || (() => {
  let list = [{ id: 'a', name: 'Báo giá', roleLabel: 'Báo giá', busy: false }, { id: 'b', name: 'Đăng bài', roleLabel: 'Đăng bài nhóm', busy: true }];
  return {
    getCfg: async () => ({ cfg: { rate: 3600, shipPerKg: 25000, servicePct: 5, maxPostsPerDay: 12, tone: '', browser: 'playwright', claudePath: '', groups: [] }, claude: null }),
    setCfg: async () => true, openData: async () => {}, openLogin: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }),
    listAgents: async () => ({ agents: list, templates: { quote: { label: 'Báo giá', prompt: 'Chuyên báo giá.' }, post: { label: 'Đăng bài nhóm', prompt: 'Chuyên đăng bài.' }, leads: { label: 'Tìm khách', prompt: 'Chuyên tìm khách.' }, custom: { label: 'Tùy chỉnh', prompt: '' } } }),
    addAgent: async (d) => { list = [...list, { id: String(Math.random()), name: d.name, roleLabel: d.role, busy: false }]; return { ok: true }; },
    removeAgent: async (id) => { list = list.filter((a) => a.id !== id); }, resetAgent: async () => true, stopAll: async () => true,
    historyQuery: async () => ({ items: [{ t: new Date().toISOString(), kind: 'user', agent: 'Báo giá', text: 'Báo giá áo khoác này' }, { t: new Date().toISOString(), kind: 'agent', agent: 'Báo giá', text: 'Đã báo giá xong (bản giả lập).' }], more: false }), openHistoryDir: async () => {},
    onAgents: () => {}, officeUrl: async () => 'http://localhost:4310/', onOfficeReady: () => {}, onOfficeError: () => {}, version: async () => 'dev', onUpdate: () => {},
  };
})();

function renderAgents(list) {
  box.innerHTML = '';
  for (const a of list) {
    const c = document.createElement('div'); c.className = 'chip' + (a.busy ? ' busy' : '');
    c.title = `${a.name} · ${a.roleLabel}${a.busy ? ' · đang làm việc' : ''}\nGọi trong nhóm chat: @${a.name}`;
    c.innerHTML = '<span class="dot"></span><span></span><small></small><button data-r title="Hội thoại mới (quên ngữ cảnh cũ)">⟳</button><button data-x title="Xóa agent">✕</button>';
    c.children[1].textContent = a.name; c.children[2].textContent = a.roleLabel;
    c.querySelector('[data-r]').onclick = async () => { if (!(await api.resetAgent(a.id))) say(`${a.name} đang làm việc, hãy chờ xong.`); };
    c.querySelector('[data-x]').onclick = () => { if (confirm(`Xóa agent "${a.name}"?`)) api.removeAgent(a.id); };
    box.append(c);
  }
  $('#btn-stop').hidden = !list.some((a) => a.busy);
}
const refresh = () => api.listAgents().then((r) => { templates = r.templates; renderAgents(r.agents); });
api.onAgents(renderAgents);

// Thêm agent
const dlgA = $('#dlg-agent'), formA = $('#agentform');
$('#btn-add').onclick = () => {
  formA.reset(); $('#agenterr').textContent = '';
  const sel = formA.elements.role; sel.innerHTML = '';
  for (const [k, v] of Object.entries(templates)) sel.add(new Option(v.label, k));
  const desc = () => ($('#roledesc').textContent = templates[sel.value]?.prompt.replace(/^VAI TRÒ CỦA BẠN: /, '') || 'Bạn tự mô tả việc agent làm ở ô hướng dẫn riêng.');
  sel.onchange = desc; desc(); dlgA.showModal(); formA.elements.name.focus();
};
formA.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const r = await api.addAgent({ name: formA.elements.name.value, role: formA.elements.role.value, instructions: formA.elements.instructions.value });
  if (!r.ok) { $('#agenterr').textContent = r.error; return; }
  dlgA.close(); say('');
});

$('#btn-stop').onclick = () => api.stopAll();
$('#btn-login').onclick = async () => {
  const r = await api.openLogin();
  say(r.ok ? 'Đã mở Chrome của app. Hãy tự đăng nhập Facebook và Taobao trong cửa sổ đó (tự giải CAPTCHA nếu có). Cứ để nguyên cửa sổ: các agent sẽ dùng chung đăng nhập và mỗi agent mở tab riêng.' : r.error);
};
$('#btn-data').onclick = () => api.openData();

// Lịch sử chat với agent (lưu vĩnh viễn)
const dlgH = $('#dlg-hist'), hList = $('#h-list'), hMore = $('#h-more');
let hBefore = '', hLastDay = '', hTimer = null;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
function addHist(items) {
  for (const r of items) {
    const day = fmtDay(r.t);
    if (day !== hLastDay) { const d = document.createElement('div'); d.className = 'hist-day'; d.textContent = day; hList.append(d); hLastDay = day; }
    const el = document.createElement('div'); el.className = 'h-item ' + r.kind;
    const who = r.kind === 'user' ? `Chủ shop → ${r.agent ? '@' + r.agent : '(chưa giao cho ai)'}` : r.kind === 'handoff' ? `${r.agent} ➜ giao cho @${r.to}` : r.kind === 'error' ? `${r.agent} · lỗi` : r.agent;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${fmtTime(r.t)} · ${who}${r.chain ? ` · chuỗi #${r.chain}` : ''}`;
    const body = document.createElement('div'); body.textContent = r.text + (r.files?.length ? `\n[${r.files.length} ảnh đính kèm]` : '');
    el.append(meta, body); hList.append(el);
  }
}
async function loadHist(reset) {
  if (reset) { hList.innerHTML = ''; hBefore = ''; hLastDay = ''; }
  const r = await api.historyQuery({ agentId: $('#h-agent').value, q: $('#h-q').value, before: hBefore });
  addHist(r.items);
  if (r.items.length) hBefore = r.items.at(-1).t;
  if (reset && !r.items.length) hList.textContent = 'Chưa có tin nào khớp.';
  hMore.hidden = !r.more;
}
$('#btn-hist').onclick = async () => {
  const sel = $('#h-agent'); sel.innerHTML = ''; sel.add(new Option('Tất cả agent', ''));
  for (const a of (await api.listAgents()).agents) sel.add(new Option(a.name, a.id));
  $('#h-q').value = ''; dlgH.showModal(); loadHist(true);
};
$('#h-agent').onchange = () => loadHist(true);
$('#h-q').oninput = () => { clearTimeout(hTimer); hTimer = setTimeout(() => loadHist(true), 250); };
hMore.onclick = () => loadHist(false);
$('#h-close').onclick = () => dlgH.close();
$('#h-dir').onclick = () => api.openHistoryDir();

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

// Số phiên bản ở góc phải dưới + trạng thái tự cập nhật
const ver = $('#ver'); let current = '';
api.version().then((v) => { current = 'v' + v; ver.textContent = current; });
api.onUpdate((u) => {
  ver.classList.toggle('up', u.state !== 'none');
  ver.textContent = u.state === 'downloading' ? `${current} · đang tải bản mới${u.percent != null ? ' ' + u.percent + '%' : ''}`
    : u.state === 'ready' ? `${current} · đã tải v${u.version}, tự khởi động lại sau giây lát…` : current;
});

api.getCfg().then(({ claude }) => { if (!claude) say('Chưa tìm thấy lệnh `claude`. Cài Claude Code và đăng nhập (chạy `claude` một lần), hoặc nhập đường dẫn trong Cài đặt.'); });
api.officeUrl().then(showOffice); api.onOfficeReady(showOffice);
api.onOfficeError((t) => { wait.classList.remove('hide'); wait.textContent = t; });
refresh();
