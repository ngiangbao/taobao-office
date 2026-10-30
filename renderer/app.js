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
    listCustomers: async () => [{ code: 'KH-7F3K9', name: 'Lan', agentName: 'Khách Lan', state: 'awake', busy: false, lastInboundAt: Date.now() - 600000, followupDue: Date.now() + 240000, paused: false, followupCount: 0, ctx: 42000 }, { code: 'KH-2M8QX', name: 'Hương', agentName: 'Khách Hương', state: 'asleep', busy: false, lastInboundAt: Date.now() - 86400000 * 3, followupDue: 0, paused: false, followupCount: 1, ctx: 8000 }],
    renameCustomer: async () => true, pauseCustomer: async () => true, refreshCustomer: async () => true, customerProfile: async () => '# Hồ sơ khách Lan\n- Xưng hô: chị Lan\n- Size: M\n- Thích: màu be, dáng ngắn',
    onCustomers: () => {}, listRevenue: async () => ({ total: 936800, items: [{ id: 'a1', t: new Date().toISOString(), amount: 436800, name: 'Lan', code: 'KH-7F3K9', note: 'cọc áo khoác be', source: 'agent' }] }),
    addRevenue: async () => ({ ok: true }), voidRevenue: async () => true, inboxManual: async () => ({ ok: true, code: 'KH-NEW01', created: true }), inboxPoll: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), onInbox: () => {},
    onAgents: () => {}, officeUrl: async () => 'http://localhost:4310/', onOfficeReady: () => {}, version: async () => 'dev', onUpdate: () => {},
  };
})();

function renderAgents(list) {
  box.innerHTML = '';
  for (const a of list.filter((x) => x.kind !== 'customer' || x.busy)) { // agent chăm khách chỉ hiện trên thanh khi đang làm; xem đủ ở nút Khách
    const c = document.createElement('div'); c.className = 'chip' + (a.busy ? ' busy' : '');
    c.title = `${a.name} · ${a.roleLabel}${a.busy ? ' · đang làm việc' : ''}\nGọi trong nhóm chat: @${a.name}`;
    c.innerHTML = '<span class="dot"></span><span></span><small></small><button data-r title="Hội thoại mới (quên ngữ cảnh cũ)">⟳</button><button data-x title="Xóa agent">✕</button>';
    c.children[1].textContent = a.name; c.children[2].textContent = a.roleLabel;
    c.querySelector('[data-r]').onclick = async () => { if (!(await api.resetAgent(a.id))) say(`${a.name} đang làm việc, hãy chờ xong.`); };
    if (a.kind === 'customer') c.querySelectorAll('button').forEach((b) => b.remove()); // khách quản lý ở hộp thoại Khách
    else c.querySelector('[data-x]').onclick = () => { if (confirm(`Xóa agent "${a.name}"?`)) api.removeAgent(a.id); };
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
    const who = r.kind === 'inbound' ? `Khách nhắn → ${r.agent}${r.code ? ' (' + r.code + ')' : ''}` : r.kind === 'system' ? `Hệ thống · ${r.agent}` : r.kind === 'user' ? `Chủ shop → ${r.agent ? '@' + r.agent : '(chưa giao cho ai)'}` : r.kind === 'handoff' ? `${r.agent} ➜ giao cho @${r.to}` : r.kind === 'error' ? `${r.agent} · lỗi` : r.agent;
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
async function openHist(agentId = '') {
  const sel = $('#h-agent'); sel.innerHTML = ''; sel.add(new Option('Tất cả agent', ''));
  for (const a of (await api.listAgents()).agents) sel.add(new Option(a.name, a.id));
  sel.value = agentId; $('#h-q').value = ''; if (!dlgH.open) dlgH.showModal(); loadHist(true);
}
$('#btn-hist').onclick = () => openHist();
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
  for (const k of ['rate', 'shipPerKg', 'servicePct', 'maxPostsPerDay', 'followupMinutes', 'followupMax', 'refreshTokens', 'sleepHours', 'inboxMinutes']) cfg[k] = Number(form.elements[k].value) || 0;
  for (const k of ['tone', 'browser', 'claudePath', 'inboxUrl']) cfg[k] = form.elements[k].value;
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
api.onOfficeError?.((m) => { wait.classList.remove('hide'); wait.style.whiteSpace = 'pre-wrap'; wait.style.padding = '24px'; wait.style.textAlign = 'center'; wait.style.color = '#f99'; wait.textContent = `Không mở được văn phòng.\n\n${m}\n\nHãy đóng app rồi mở lại; nếu vẫn lỗi, cài lại bản mới nhất.`; say('Văn phòng 3D không chạy, nhưng các agent và hộp thoại vẫn dùng được nếu agent cần nhóm chat thì phải mở lại app.'); });
refresh();

// ---------- Khách hàng: mỗi khách một agent, mã định danh riêng ----------
const dlgC = $('#dlg-cust'), cList = $('#c-list'), cProf = $('#c-profile');
let custs = [];
const ago = (t) => { if (!t) return 'chưa nhắn'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const clock = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
function renderCusts() {
  const q = $('#c-q').value.trim().toLowerCase();
  $('#btn-cust').textContent = `Khách (${custs.length})`;
  if (!dlgC.open) return;
  cList.innerHTML = '';
  const list = custs.filter((c) => !q || `${c.name} ${c.code} ${c.agentName}`.toLowerCase().includes(q));
  if (!list.length) { cList.textContent = custs.length ? 'Không có khách nào khớp.' : 'Chưa có khách nào. Khi khách nhắn tới, họ sẽ tự có agent riêng.'; return; }
  for (const c of list) {
    const el = document.createElement('div'); el.className = 'cust-row';
    const state = c.state === 'busy' ? 'đang làm việc' : c.state === 'asleep' ? 'đang ngủ' : 'sẵn sàng';
    const follow = c.paused ? 'đã tắt nhắc' : c.followupDue ? `sẽ nhắc lúc ${clock(c.followupDue)}` : c.followupCount ? 'đã nhắc xong' : 'không có lịch nhắc';
    el.innerHTML = '<span class="dot"></span><span><span class="nm"></span> <code></code></span><span class="sub2"></span><span class="sub"></span><div class="acts"></div>';
    el.querySelector('.dot').classList.add(c.state);
    el.querySelector('.nm').textContent = c.name; el.querySelector('code').textContent = c.code;
    el.querySelector('.sub2').textContent = state;
    el.querySelector('.sub').textContent = `Nhắn gần nhất: ${ago(c.lastInboundAt)} · ${follow} · hội thoại ${Math.round((c.ctx || 0) / 1000)}k token`;
    const acts = el.querySelector('.acts');
    const btn = (label, fn, title) => { const b = document.createElement('button'); b.className = 'ghost'; b.textContent = label; if (title) b.title = title; b.onclick = fn; acts.append(b); };
    btn('Hồ sơ', async () => { cProf.hidden = false; cProf.textContent = (await api.customerProfile(c.code)) || '(Chưa có hồ sơ: agent sẽ tạo sau lần xử lý đầu tiên.)'; cProf.scrollIntoView({ block: 'nearest' }); });
    btn('Lịch sử', () => openHist(c.agentId));
    btn('Đổi tên', async () => { const n = prompt('Tên hiển thị của khách (mã định danh không đổi):', c.name); if (n && n.trim()) api.renameCustomer({ code: c.code, name: n.trim() }); });
    btn(c.paused ? 'Bật lại nhắc' : 'Tắt nhắc', () => api.pauseCustomer({ code: c.code, paused: !c.paused }));
    btn('Làm mới trí nhớ', async () => { if (!(await api.refreshCustomer(c.code))) say('Agent đang làm việc, hãy chờ xong.'); }, 'Agent ghi đầy đủ hồ sơ rồi bắt đầu hội thoại mới cho nhẹ; hồ sơ được giữ');
    cList.append(el);
  }
}
const loadCusts = async () => { custs = await api.listCustomers(); renderCusts(); };
api.onCustomers((l) => { custs = l; renderCusts(); });
$('#btn-cust').onclick = async () => { cProf.hidden = true; await loadCusts(); dlgC.showModal(); renderCusts(); };
$('#c-q').oninput = renderCusts; $('#c-close').onclick = () => dlgC.close();
loadCusts(); setInterval(() => { if (dlgC.open) loadCusts(); }, 15000);

// Nhập tin của khách / đọc hộp thư Messenger
const dlgI = $('#dlg-inbound'), formI = $('#inboundform');
$('#btn-inbound').onclick = () => { formI.reset(); $('#inboundmsg').textContent = ''; $('#pollmsg').textContent = ''; dlgI.showModal(); formI.elements.name.focus(); };
formI.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const images = await Promise.all([...formI.elements.images.files].slice(0, 4).map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
  const r = await api.inboxManual({ name: formI.elements.name.value, text: formI.elements.text.value, images });
  if (!r.ok) { $('#inboundmsg').textContent = r.error; return; }
  dlgI.close(); say(r.created ? `Đã tạo agent riêng cho khách mới, mã ${r.code}.` : `Đã đánh thức agent của khách ${r.code}.`); setTimeout(() => say(''), 6000); loadCusts();
});
$('#btn-poll').onclick = async () => {
  const b = $('#btn-poll'); b.disabled = true; $('#pollmsg').textContent = 'Đang đọc hộp thư… (có thể mất 1-2 phút)';
  const r = await api.inboxPoll(); b.disabled = false;
  $('#pollmsg').textContent = r.ok ? (r.delivered ? `Đã nhận ${r.delivered} cuộc trò chuyện mới.` : 'Không có tin mới.') : `Không đọc được: ${r.error}`;
  loadCusts();
};
api.onInbox((r) => { if (!r.ok) say(`Đọc hộp thư lỗi: ${r.error}`); });

// Doanh thu: chỉ tính tiền đã thu thật
const dlgR = $('#dlg-rev'), vnd = (n) => n.toLocaleString('vi-VN') + '₫';
async function loadRev() {
  const { total, items } = await api.listRevenue();
  $('#r-total').textContent = vnd(total);
  const list = $('#r-list'); list.innerHTML = '';
  if (!items.length) list.textContent = 'Chưa ghi khoản thu nào.';
  for (const it of items) {
    const el = document.createElement('div'); el.className = 'rev-row';
    el.innerHTML = '<span><b></b> <small></small><br><small class="n"></small></span><small class="t"></small><button class="ghost">Hủy khoản này</button>';
    el.querySelector('b').textContent = vnd(it.amount);
    el.querySelector('small').textContent = it.name ? `· ${it.name} (${it.code})` : '';
    el.querySelector('.n').textContent = `${it.note || '(không ghi chú)'} · ${it.source === 'agent' ? 'agent ghi' : 'ghi tay'}`;
    el.querySelector('.t').textContent = new Date(it.t).toLocaleString('vi-VN');
    el.querySelector('button').onclick = async () => { if (confirm(`Hủy khoản thu ${vnd(it.amount)}?`)) { await api.voidRevenue(it.id); loadRev(); } };
    list.append(el);
  }
}
$('#btn-rev').onclick = async () => {
  const sel = $('#revform').elements.code; sel.length = 1;
  for (const c of await api.listCustomers()) sel.add(new Option(`${c.name} (${c.code})`, c.code));
  $('#revform').reset(); $('#r-err').textContent = ''; await loadRev(); dlgR.showModal();
};
$('#revform').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target.elements;
  const r = await api.addRevenue({ code: f.code.value, amount: f.amount.value, note: f.note.value });
  if (!r.ok) { $('#r-err').textContent = r.error; return; }
  $('#r-err').textContent = ''; e.target.reset(); loadRev();
});
$('#r-close').onclick = () => dlgR.close();
