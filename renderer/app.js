const $ = (s) => document.querySelector(s);
const frame = $('#office'), wait = $('#office-wait'), box = $('#agents'), toast = $('#toast');
const showOffice = (u) => { if (u && frame.src !== u) { frame.src = u; frame.onload = () => wait.classList.add('hide'); } };
const say = (t) => { toast.textContent = t; toast.hidden = !t; };
let templates = {};

// Bản chạy thử trong trình duyệt (không có Electron): giả lập để xem giao diện.
const api = window.api || (() => {
  let list = [{ id: 'a', name: 'Báo giá', roleLabel: 'Báo giá', busy: false }, { id: 'b', name: 'Đăng bài', roleLabel: 'Đăng bài nhóm', busy: true }];
  return {
    getCfg: async () => ({ cfg: { shopName: 'Lan Fashion', rate: 3600, shipPerKg: 25000, servicePct: 5, tone: '', browser: 'playwright', claudePath: '', groupsSheetUrl: '', groups: [] }, claude: null }),
    setCfg: async () => true, openData: async () => {}, openLogin: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }),
    importGroups: async () => ({ ok: false, error: 'Đọc Google Sheets chỉ có trong app desktop.' }),
    syncStatus: async () => ({ connected: false, email: '' }),
    connectSync: async () => ({ ok: false, error: 'Đồng bộ riêng tư chỉ có trong app desktop.' }),
    syncNow: async () => ({ ok: false, error: 'Đồng bộ riêng tư chỉ có trong app desktop.' }),
    disconnectSync: async () => ({ ok: false, error: 'Đồng bộ riêng tư chỉ có trong app desktop.' }),
    onSync: () => {},
    listAgents: async () => ({ agents: list, templates: { quote: { label: 'Báo giá', prompt: 'Chuyên báo giá.' }, post: { label: 'Đăng bài nhóm', prompt: 'Chuyên đăng bài.' }, leads: { label: 'Tìm khách', prompt: 'Chuyên tìm khách.' }, custom: { label: 'Tùy chỉnh', prompt: '' } } }),
    ensureDefaultAgents: async () => ({ ok: false, error: 'Chỉ có trong ứng dụng desktop.' }),
    addAgent: async (d) => { list = [...list, { id: String(Math.random()), name: d.name, roleLabel: d.role, busy: false }]; return { ok: true }; },
    removeAgent: async (id) => { list = list.filter((a) => a.id !== id); }, resetAgent: async () => true, stopAll: async () => true,
    historyQuery: async () => ({ items: [{ t: new Date().toISOString(), kind: 'user', agent: 'Báo giá', text: 'Báo giá áo khoác này' }, { t: new Date().toISOString(), kind: 'agent', agent: 'Báo giá', text: 'Đã báo giá xong (bản giả lập).' }], more: false }), historyDelete: async () => 1, openHistoryDir: async () => {},
    listCustomers: async () => [{ code: 'KH-7F3K9', name: 'Lan', agentName: 'Khách Lan', state: 'awake', busy: false, lastInboundAt: Date.now() - 600000, followupDue: Date.now() + 240000, paused: false, followupCount: 0, ctx: 42000 }, { code: 'KH-2M8QX', name: 'Hương', agentName: 'Khách Hương', state: 'asleep', busy: false, lastInboundAt: Date.now() - 86400000 * 3, followupDue: 0, paused: false, followupCount: 1, ctx: 8000 }],
    listLocalCustomers: async () => [{ code: 'KH-7F3K9', name: 'Lan', phone: '0912345678', address: 'Hà Nội', size: 'M', createdAt: Date.now() - 86400000, updatedAt: Date.now() }],
    deleteLocalCustomers: async (codes) => ({ ok: true, deleted: codes.length }),
    ordersList: async () => ({ items: [], statuses: ['Đã đặt hàng', 'Đã về'], sync: {} }), ordersSave: async () => ({ ok: true, items: [] }), ordersDelete: async () => ({ ok: true, items: [] }), ordersImport: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), ordersImportFile: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), ordersExport: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), ordersTsv: async () => '', ordersScript: async () => '', ordersWebhookTest: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), ordersOpenSheet: async () => false, openInventory: async () => ({ ok: false }),
    exportCustomers: async () => ({ ok: false, error: 'Xuất Excel chỉ có trong app desktop.' }),
    renameCustomer: async () => true, renameAgent: async () => ({ ok: true }), skillsList: async () => [{ id: 'a1', name: 'Báo giá', role: 'quote', roleLabel: 'Báo giá', skills: [{ id: 's1', title: 'Báo giá bằng VNĐ', text: 'Luôn báo giá bằng VNĐ, không báo tệ.', at: Date.now(), source: 'owner', version: 2 }] }, { id: 'a2', name: 'Chăm sóc khách', role: 'cskh', roleLabel: 'Chăm sóc khách', skills: [] }], skillsSave: async () => ({ ok: true, agents: [] }), skillsRemove: async () => ({ ok: true, agents: [] }), skillsReviewNow: async () => ({ ok: true, reviewed: 0 }), skillsExportJson: async () => ({ canceled: true }), skillsImport: async () => ({ canceled: true }), onSkills: () => {}, agentBySid: async () => null, pauseCustomer: async () => true, refreshCustomer: async () => true, customerProfile: async () => '# Hồ sơ khách Lan\n- Xưng hô: chị Lan\n- Size: M\n- Thích: màu be, dáng ngắn',
    onCustomers: () => {}, listRevenue: async () => ({ total: 936800, items: [{ id: 'a1', t: new Date().toISOString(), amount: 436800, name: 'Lan', code: 'KH-7F3K9', note: 'cọc áo khoác be', source: 'agent' }] }),
    addRevenue: async () => ({ ok: true }), voidRevenue: async () => true, inboxManual: async () => ({ ok: true, code: 'KH-NEW01', created: true }), inboxPoll: async () => ({ ok: false, error: 'Chỉ có trong app desktop.' }), onInbox: () => {},
    listApprovals: async () => ({ limit: 12, today: 3, items: [{ id: 'p1', num: 7, status: 'pending', agentName: 'Đăng bài', kind: 'bai_dang', target: 'https://www.facebook.com/groups/vi-du', text: 'Áo khoác lông cừu be về hàng, size S-M-L, ib shop nhé 💕', files: [], hash: 'h1', t: Date.now() }, { id: 'p2', num: 6, status: 'done', agentName: 'Tìm khách', kind: 'binh_luan', target: 'https://www.facebook.com/groups/vi-du/posts/1', text: 'Shop có mẫu này ạ, bạn ib shop nha', files: [], result: 'ĐÃ ĐĂNG: ok', t: Date.now() - 3600e3 }] }),
    editApproval: async () => true, decideApproval: async () => ({ ok: true }), onApprovals: () => {},
    onAgents: () => {}, officeUrl: async () => new URLSearchParams(location.search).get('office') || 'http://localhost:4310/', onOfficeReady: () => {}, onOfficeError: () => {}, version: async () => 'dev', onUpdate: () => {},  // bản xem thử trong trình duyệt: thêm ?office=<địa chỉ> để chọn văn phòng
    checkUpdates: async () => ({ ok: false, error: 'Kiểm tra cập nhật chỉ có trong app desktop.' }),
  };
})();

function renderAgents(list) {
  box.innerHTML = '';
  const defaultRoles = ['cskh', 'search', 'quote', 'post', 'leads'];
  const defaultAgents = defaultRoles.map((role) => list.find((a) => a.role === role));
  $('#btn-default-agents').hidden = defaultAgents.every((agent) => agent?.started || agent?.starting);
  for (const a of list.filter((x) => x.kind !== 'customer' || x.busy)) { // agent chăm khách chỉ hiện trên thanh khi đang làm; xem đủ ở nút Khách
    const c = document.createElement('div'); c.className = 'chip' + (a.busy ? ' busy' : '');
    c.title = `${a.name} · ${a.roleLabel}${a.busy ? ' · đang làm việc' : ''}\nGọi trong nhóm chat: @${a.name}`;
    c.innerHTML = '<span class="dot"></span><span></span><button data-r title="Hội thoại mới (quên ngữ cảnh cũ)">⟳</button><button data-x title="Xóa agent">✕</button>';
    c.children[1].textContent = a.name; // chỉ hiện tên agent
    c.querySelector('[data-r]').onclick = async () => { if (!(await api.resetAgent(a.id))) say(`${a.name} đang làm việc, hãy chờ xong.`); };
    if (a.kind === 'customer') c.querySelectorAll('button').forEach((b) => b.remove()); // khách quản lý ở hộp thoại Khách
    else c.querySelector('[data-x]').onclick = () => { if (confirm(`Xóa agent ${a.name}?`)) api.removeAgent(a.id); };
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
$('#btn-default-agents').onclick = async () => {
  const button = $('#btn-default-agents');
  button.disabled = true;
  try {
    const result = await api.ensureDefaultAgents();
    if (!result.ok) say(`Không tạo được agent mặc định: ${result.error}`);
    else if (!result.cliAvailable) say(result.created ? `Đã tạo ${result.created} agent. Hãy thiết lập Claude Code CLI để khởi chạy.` : 'Đã có agent nhưng chưa tìm thấy Claude Code CLI để khởi chạy.');
    else say(result.created || result.started ? `Đã tạo ${result.created} agent và khởi chạy ${result.started} agent.` : 'Đội agent mặc định đã được tạo và khởi chạy.');
  } catch (error) { say(`Không tạo được agent mặc định: ${error.message}`); }
  finally { button.disabled = false; }
};

formA.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const r = await api.addAgent({ name: formA.elements.name.value, role: formA.elements.role.value, instructions: formA.elements.instructions.value });
  if (!r.ok) { $('#agenterr').textContent = r.error; return; }
  dlgA.close(); say('');
});

$('#btn-stop').onclick = () => api.stopAll();
// ---------- Cửa sổ Cài đặt (kiểu Claude): mở từ nút bánh răng của văn phòng ----------
const dlgS = $('#dlg-settings'), form = $('#cfgform');
const FORM_SECS = ['shop', 'fanpage', 'groups', 'newsfeed', 'inventory', 'cust', 'sync', 'conn', 'claude']; // các mục có ô nhập, dùng chung nút Lưu thay đổi
let curSec = 'shop', histAgent = '';
function renderGroupList(groups) {
  const box = $('#s-groups-list'); box.replaceChildren();
  if (!groups.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Chưa có danh sách nhóm. Nhập địa chỉ Google Sheets rồi bấm “Đọc danh sách và lưu”.'; box.append(empty); return; }
  for (const group of groups) {
    const row = document.createElement('div'); row.className = 'group-item';
    const name = document.createElement('b'); name.textContent = group.name;
    const url = document.createElement('span'); url.textContent = group.url;
    row.append(name, url); box.append(row);
  }
}
function showSection(id) {
  curSec = id;
  dlgS.querySelectorAll('.s-nav button').forEach((b) => b.classList.toggle('on', b.dataset.nav === id));
  dlgS.querySelectorAll('section[data-sec]').forEach((sec) => { sec.hidden = sec.dataset.sec !== id; });
  form.hidden = !FORM_SECS.includes(id);
  $('#s-save').hidden = id === 'sync';
  $('#s-save').textContent = id === 'groups' ? 'Lưu cài đặt & đọc nhóm' : 'Lưu thay đổi';
  $('#s-saved').textContent = '';
  if (id === 'hist') { const ag = histAgent; histAgent = ''; initHist(ag); }
  if (id === 'office') askOffice();
  if (id === 'assistant') { loadAssistant(); loadSkills(); }
}
const STYLE_KIND = { comment: 'Cách comment', van_phong: 'Văn phong', loi_nhan: 'Lời nhắn mẫu' };
function renderStyle(list) {
  const box = $('#s-style-list'); box.replaceChildren();
  if (!list.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Chưa có mục nào. Gõ “@Trợ lý riêng” kèm mẫu comment hoặc văn phong của bạn để dạy các agent.'; box.append(p); return; }
  for (const e of list) {
    const row = document.createElement('div'); row.className = 'group-item';
    const b = document.createElement('b'); b.textContent = `${STYLE_KIND[e.kind] || e.kind} → ${e.roles.join(', ')}`;
    const t = document.createElement('span'); t.textContent = e.text;
    const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Xoá';
    del.onclick = async () => { await api.styleRemove(e.id); loadAssistant(); };
    row.append(b, t, del); box.append(row);
  }
}
async function loadAssistant() {
  const r = await api.assistantGet(); $('#s-memory').value = ''; renderStyle(r.style);
  $('#s-memory-status').textContent = r.memory ? `Bộ nhớ hiện có ${r.memory.length.toLocaleString('vi-VN')} ký tự.` : 'Chưa có bộ nhớ.';
}
for (const [id, mode] of [['#s-memory-add', 'append'], ['#s-memory-replace', 'replace']]) {
  $(id).onclick = async () => {
    const text = $('#s-memory').value.trim(); if (!text && mode === 'append') return;
    const r = await api.assistantMemory({ text, mode }); await loadAssistant();
    $('#s-memory-status').textContent = r.ok ? `Đã lưu bộ nhớ (${r.size.toLocaleString('vi-VN')} ký tự).` : r.error;
  };
}
$('#s-comment-scan').onclick = async () => {
  const st = $('#s-comment-status'); st.textContent = 'Đang giao việc cho Trả lời comment…';
  const r = await api.commenterScan(); st.textContent = r.ok ? 'Đã quét xong; xem kết quả ở khung chat và mục Chờ duyệt.' : r.error;
};
$('#s-inventory-check').onclick = async () => {
  const status = $('#s-inventory-status'); status.textContent = 'Đang đọc kho…';
  try {
    const result = await api.checkInventory({ inventorySheetUrl: form.elements.inventorySheetUrl.value, inventoryTab: form.elements.inventoryTab.value });
    status.textContent = result.ok ? `Đọc được ${result.items} mã sản phẩm (${result.images} có ảnh) ở trang “${result.sheet}”, ${result.types} loại.${result.stale ? ' Lưu ý: chưa tải mới được, đang dùng bản đã lưu.' : ''} Bấm Lưu thay đổi để dùng với @Kho hàng.` : result.error;
  } catch (error) { status.textContent = `Chưa đọc được kho: ${error.message}`; }
};
async function fillSettings() {
  const { cfg, claude } = await api.getCfg();
  for (const el of form.elements) if (el.name) el.value = el.hasAttribute('data-bool') ? (cfg[el.name] ? '1' : '0') : (cfg[el.name] ?? '');
  renderGroupList(cfg.groups || []); fillOrdersSettings();
  $('#s-groups-msg').textContent = '';
  form.elements.syncClientSecret.value = '';
  const syncStatus = await api.syncStatus();
  $('#s-sync-status').textContent = syncStatus.error
    ? `Không đọc được thông tin bảo mật Google: ${syncStatus.error}`
    : syncStatus.connected ? `Đã kết nối Google${syncStatus.email ? `: ${syncStatus.email}` : ''}.` : 'Chưa kết nối Google.';
  const platform = await api.platform?.() || 'linux';
  $('#s-claude-install').textContent = platform === 'win32'
    ? 'PowerShell:\nirm https://claude.ai/install.ps1 | iex'
    : 'Terminal:\ncurl -fsSL https://claude.ai/install.sh | bash';
  const claudeStatus = $('#s-claude-status');
  claudeStatus.classList.remove('err');
  claudeStatus.textContent = claude ? `Đã tìm thấy Claude Code CLI: ${claude}` : 'Chưa tìm thấy Claude Code CLI. Cài đặt theo hướng dẫn phía trên hoặc chọn tệp CLI.';
}
async function openSettings(sec = curSec) { await fillSettings(); showSection(sec); if (!dlgS.open) dlgS.showModal(); }
dlgS.querySelectorAll('.s-nav button').forEach((b) => (b.onclick = () => showSection(b.dataset.nav)));
$('#s-close').onclick = () => dlgS.close();
dlgS.addEventListener('click', (e) => { if (e.target === dlgS) dlgS.close(); }); // bấm ra ngoài thì đóng
// Lịch đăng tách riêng từng kênh (fanpage, nhóm, bình luận newsfeed): mỗi kênh một công tắc, thời gian chờ, khoảng cách và khung giờ
const SCHEDULES = {
  fanpage: { auto: 'fanpageAuto', fields: [['fanpageDelayMinutes', 0, 1440], ['fanpageGapMinutes', 0, 1440], ['fanpageFromHour', 0, 23], ['fanpageToHour', 0, 24]], from: 'fanpageFromHour', to: 'fanpageToHour' },
  group: { auto: 'groupAuto', fields: [['groupPostDelayMinutes', 0, 1440], ['groupPostGapMinutes', 0, 1440], ['groupPostFromHour', 0, 23], ['groupPostToHour', 0, 24]], from: 'groupPostFromHour', to: 'groupPostToHour' },
  comment: { auto: 'commentAutoPost', fields: [['commentDelayMinutes', 0, 1440], ['commentGapMinutes', 0, 1440], ['commentFromHour', 0, 23], ['commentToHour', 0, 24]], from: 'commentFromHour', to: 'commentToHour' },
};
const SECTION_CHANNEL = { fanpage: 'fanpage', groups: 'group', newsfeed: 'comment' };
function readSchedule(cfg, channel, strict) { // strict: kênh đang mở, báo lỗi khi nhập sai; không strict: giữ giá trị cũ nếu ô không hợp lệ
  const sc = SCHEDULES[channel], msg = $(`#s-sched-${channel}`);
  msg.textContent = '';
  cfg[sc.auto] = form.elements[sc.auto].value === '1';
  for (const [name, min, max] of sc.fields) {
    const input = form.elements[name], value = Number(input.value);
    if (input.value === '' || !Number.isInteger(value) || value < min || value > max) {
      if (!strict) continue;
      msg.textContent = `Giá trị “${input.closest('label').firstChild.textContent.trim()}” phải là số nguyên từ ${min} đến ${max}.`; input.focus(); return false;
    }
    cfg[name] = value;
  }
  if (strict && cfg[sc.from] === cfg[sc.to]) { msg.textContent = 'Giờ bắt đầu và giờ kết thúc phải khác nhau.'; form.elements[sc.to].focus(); return false; }
  return true;
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { cfg } = await api.getCfg();
  if (curSec === 'sync') {
    const status = $('#s-sync-status'); status.classList.remove('err'); status.textContent = 'Đang mở đăng nhập Google…';
    const result = await api.connectSync({
      clientId: form.elements.syncClientId.value,
      clientSecret: form.elements.syncClientSecret.value,
      sheetUrl: form.elements.syncSpreadsheetUrl.value,
    });
    form.elements.syncClientSecret.value = '';
    status.classList.toggle('err', !result.ok);
    status.textContent = result.ok
      ? `Đã kết nối${result.email ? ` với ${result.email}` : ''}; đồng bộ ${result.customers} khách hàng và ${result.revenue} khoản thu.`
      : `Không kết nối/đồng bộ được: ${result.error}`;
    return;
  }
  if (curSec !== 'sync') { // lịch đăng của kênh đang mở được kiểm tra chặt; các kênh khác giữ nguyên nếu ô không hợp lệ
    for (const ch of Object.keys(SCHEDULES)) if (SECTION_CHANNEL[curSec] !== ch) readSchedule(cfg, ch, false);
    if (SECTION_CHANNEL[curSec] && !readSchedule(cfg, SECTION_CHANNEL[curSec], true)) return;
  }
  if (curSec === 'groups') {
    const sheetUrl = form.elements.groupsSheetUrl.value.trim();
    cfg.groupsSheetUrl = sheetUrl;
    try { await api.setCfg(cfg); }
    catch (error) {
      $('#s-groups-msg').classList.add('err'); $('#s-groups-msg').textContent = `Không lưu được cài đặt đăng nhóm: ${error.message}`;
      return;
    }
    if (!sheetUrl) {
      $('#s-groups-msg').classList.remove('err');
      $('#s-groups-msg').textContent = 'Đã lưu cài đặt đăng nhóm. Thêm link Google Sheets để nhập danh sách nhóm.';
      $('#s-saved').textContent = 'Đã lưu ✓'; setTimeout(() => ($('#s-saved').textContent = ''), 3000);
      return;
    }
    let result;
    try { result = await api.importGroups(sheetUrl); }
    catch (error) {
      $('#s-groups-msg').classList.add('err'); $('#s-groups-msg').textContent = `Không đọc được bảng tính: ${error.message}`;
      return;
    }
    if (!result.ok) {
      $('#s-groups-msg').classList.add('err'); $('#s-groups-msg').textContent = result.error;
      return;
    }
    cfg.groupsSheetUrl = sheetUrl; cfg.groups = result.groups;
    try { await api.setCfg(cfg); }
    catch (error) {
      $('#s-groups-msg').classList.add('err'); $('#s-groups-msg').textContent = `Không lưu được danh sách nhóm: ${error.message}`;
      return;
    }
    renderGroupList(cfg.groups);
    $('#s-groups-msg').classList.remove('err');
    $('#s-groups-msg').textContent = `Đã lưu ${cfg.groups.length} nhóm. Agent sẽ dùng danh sách này khi soạn đề xuất đăng bài.`;
    return;
  }
  for (const k of ['autoOffMinutes', 'chromeIdleMinutes', 'commentMinutes', 'commentPerScan', 'commentAutoMax', 'rate', 'shipPerKg', 'servicePct', 'followupMinutes', 'followupMax', 'refreshTokens', 'sleepHours', 'inboxMinutes', 'photoSearchSeconds']) cfg[k] = Number(form.elements[k].value) || 0;
  for (const k of ['inventorySheetUrl', 'inventoryTab', 'photoTarget', 'model', 'chromeMode', 'fanpageUrl', 'tone', 'claudePath', 'inboxUrl', 'groupsSheetUrl', 'syncSpreadsheetUrl', 'syncClientId']) cfg[k] = form.elements[k].value;
  for (const k of ['commentScan', 'browserFull', 'followupEnabled', 'ordersAutoRefresh']) cfg[k] = form.elements[k].value === '1';
  cfg.ordersSheetUrl = $('#o-url').value.trim(); cfg.ordersWebhookUrl = $('#o-hook').value.trim(); cfg.ordersWebhookToken = $('#o-token').value; cfg.ordersSheetName = $('#o-sheetname').value.trim() || 'khách order'; cfg.ordersAutoAppend = $('#o-auto').value === '1';
  cfg.shopName = form.elements.shopName.value.trim().slice(0, 40) || 'Cửa hàng của tôi';
  document.title = cfg.shopName;
  await api.setCfg(cfg);
  $('#s-saved').textContent = 'Đã lưu ✓'; setTimeout(() => ($('#s-saved').textContent = ''), 3000);
});
$('#s-sync-connect').onclick = () => form.requestSubmit();
$('#s-sync-now').onclick = async () => {
  const status = $('#s-sync-status'); status.classList.remove('err'); status.textContent = 'Đang đồng bộ…';
  const result = await api.syncNow();
  status.classList.toggle('err', !result.ok);
  status.textContent = result.ok ? `Đã đồng bộ ${result.customers} khách hàng và ${result.revenue} khoản thu.` : `Đồng bộ thất bại: ${result.error}`;
};
$('#s-sync-disconnect').onclick = async () => {
  const result = await api.disconnectSync();
  const status = $('#s-sync-status'); status.classList.toggle('err', !result.ok);
  status.textContent = result.ok ? 'Đã ngắt kết nối Google trên thiết bị này. Dữ liệu trên Google Sheets không bị xóa.' : `Không ngắt được kết nối: ${result.error}`;
};
$('#s-claude-select').onclick = async () => {
  const selected = await api.selectClaude();
  if (selected) {
    form.elements.claudePath.value = selected;
    $('#s-claude-status').textContent = 'Đã chọn đường dẫn. Bấm “Lưu thay đổi” để lưu, sau đó kiểm tra CLI.';
  }
};
$('#s-claude-check').onclick = async () => {
  const button = $('#s-claude-check'), status = $('#s-claude-status');
  button.disabled = true; status.classList.remove('err'); status.textContent = 'Đang kiểm tra Claude Code CLI…';
  try {
    const result = await api.checkClaude(form.elements.claudePath.value.trim());
    status.classList.toggle('err', !result.ok);
    status.textContent = result.ok
      ? `CLI hoạt động: ${result.version} (${result.path}). Hãy bảo đảm đã đăng nhập Claude Code trên máy này.`
      : `Không kiểm tra được Claude Code CLI: ${result.error}`;
  } catch (error) {
    status.classList.add('err'); status.textContent = `Không kiểm tra được Claude Code CLI: ${error.message}`;
  } finally { button.disabled = false; }
};
$('#s-check-updates').onclick = async () => {
  const button = $('#s-check-updates'), status = $('#s-update-status');
  button.disabled = true; status.classList.remove('err'); status.textContent = 'Đang kiểm tra cập nhật…';
  try {
    const result = await api.checkUpdates();
    if (!result.ok) { status.classList.add('err'); status.textContent = `Không kiểm tra được cập nhật: ${result.error}`; }
  } catch (error) {
    status.classList.add('err'); status.textContent = `Không kiểm tra được cập nhật: ${error.message}`;
  } finally { button.disabled = false; }
};
api.onSync((result) => {
  const status = $('#s-sync-status');
  if (!status || !dlgS.open || curSec !== 'sync') return;
  status.classList.toggle('err', !result.ok);
  status.textContent = result.ok ? `Đã đồng bộ ${result.customers} khách hàng và ${result.revenue} khoản thu.` : `Đồng bộ thất bại: ${result.error}`;
});
$('#s-login').onclick = async () => {
  const r = await api.openLogin();
  $('#s-loginmsg').textContent = r.ok ? 'Đã mở Chrome của app. Hãy tự đăng nhập Facebook, Taobao và 1688 trong cửa sổ đó (tự giải CAPTCHA nếu có), và cứ để nguyên cửa sổ.' : r.error;
};
// Nút bánh răng của văn phòng (cạnh nút Xem lại) mở cửa sổ này; mục "Văn phòng 3D" mở lại bảng tùy chọn gốc của văn phòng
window.addEventListener('message', (ev) => {
  if (ev.source !== frame.contentWindow) return;
  const d = ev.data || {};
  if (d.tbo === 'rename-agent' && d.sid) askRename({ sid: d.sid, name: String(d.name || '') });
  else if (d.tbo === 'open-settings') openSettings();
  else if (d.tbo === 'open-inventory') api.openInventory().then((r) => { if (!r?.ok) openSettings('inventory'); }); // chưa nhập link kho: mở thẳng mục Kho hàng
  else if (d.tbo === 'office-state') renderOfficeSettings(d.groups || []);
  else if (d.tbo === 'office-ready' && dlgS.open && curSec === 'office') askOffice(); // văn phòng vừa tải lại (ví dụ sau khi đổi ngôn ngữ)
});
// ---------- Đổi tên agent (chuột phải vào agent trong cột bên trái của văn phòng); Electron không có prompt() nên dùng hộp riêng ----------
const dlgRn = $('#dlg-rename'), rnForm = $('#renameform');
let rnTarget = null;
function askRename(target, title = 'Đổi tên agent') { rnTarget = target; $('#rn-title').textContent = title; $('#rn-err').textContent = ''; $('#rn-input').value = target.name || ''; dlgRn.showModal(); $('#rn-input').select(); }
$('#rn-cancel').onclick = () => dlgRn.close();
rnForm.onsubmit = async (e) => {
  e.preventDefault(); const name = $('#rn-input').value.trim(); if (!name || !rnTarget) return;
  const r = rnTarget.code ? { ok: await api.renameCustomer({ code: rnTarget.code, name }) } : await api.renameAgent({ sid: rnTarget.sid, name });
  if (!r.ok) { $('#rn-err').textContent = r.error || 'Không đổi được tên.'; return; }
  dlgRn.close();
};
// ---------- Mục "Văn phòng 3D": tùy chọn của chính văn phòng, hiện thẳng trong cửa sổ này ----------
const askOffice = () => frame.contentWindow?.postMessage({ tbo: 'office-get' }, '*');
function renderOfficeSettings(groups) {
  const box = $('#s-office-groups'); box.innerHTML = '';
  if (!groups.length) { box.innerHTML = '<p class="hint">Chưa đọc được tùy chọn của văn phòng. Hãy chờ văn phòng mở xong rồi thử lại.</p>'; return; }
  let lastTab = '', lastHeading = '';
  const apply = (sel) => frame.contentWindow?.postMessage({ tbo: 'office-apply', sel }, '*');
  for (const g of groups) {
    if (g.tabLabel && g.tab !== lastTab) { const t = document.createElement('div'); t.className = 'o-tab'; t.textContent = g.tabLabel; box.append(t); lastTab = g.tab; }
    if (g.heading && g.heading !== lastHeading && g.heading !== g.tabLabel) { const h = document.createElement('h4'); h.textContent = g.heading; box.append(h); }
    lastHeading = g.heading;
    const wrap = document.createElement('div'); wrap.className = g.kind === 'choice' ? 'o-grid' : '';
    for (const it of g.items) {
      const b = document.createElement('button'); b.type = 'button';
      if (g.kind === 'toggle') { b.className = 'o-switch'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(it.pressed)); b.innerHTML = '<span></span><i></i>'; b.firstChild.textContent = it.label; }
      else {
        b.className = g.kind === 'action' ? 'ghost' : 'o-card'; if (g.kind === 'choice') b.setAttribute('aria-pressed', String(it.pressed));
        if (it.img && g.kind === 'choice') { const im = document.createElement('img'); im.src = it.img; im.alt = ''; b.append(im); }
        const l = document.createElement('b'); l.textContent = it.label; b.append(l);
        if (it.sub && g.kind === 'choice') { const s = document.createElement('small'); s.textContent = it.sub; b.append(s); }
      }
      b.onclick = () => apply(it.sel);
      wrap.append(b);
    }
    box.append(wrap);
  }
}
$('#btn-gear').onclick = () => openSettings(); // dự phòng khi văn phòng không mở được
if (!window.api) $('#btn-gear').hidden = false; // bản xem thử trong trình duyệt không có bánh răng của văn phòng

// ---------- Lịch sử chat với agent (lưu vĩnh viễn), nằm trong Cài đặt ----------
const hList = $('#h-list'), hMore = $('#h-more');
let hBefore = '', hLastDay = '', hTimer = null;
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
function addHist(items) {
  for (const r of items) {
    const day = fmtDay(r.t);
    if (day !== hLastDay) { const d = document.createElement('div'); d.className = 'hist-day'; d.textContent = day; hList.append(d); hLastDay = day; }
    const el = document.createElement('div'); el.className = 'h-item ' + r.kind;
    const who = r.kind === 'inbound' ? `Khách nhắn → ${r.agent}${r.code ? ' (' + r.code + ')' : ''}` : r.kind === 'system' ? `Hệ thống · ${r.agent}` : r.kind === 'proposal' ? `Đề xuất · ${r.agent}` : r.kind === 'user' ? `Chủ shop → ${r.agent ? '@' + r.agent : '(chưa giao cho ai)'}` : r.kind === 'handoff' ? `${r.agent} ➜ giao cho @${r.to}` : r.kind === 'error' ? `${r.agent} · lỗi` : r.agent;
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `${fmtTime(r.t)} · ${who}${r.chain ? ` · chuỗi #${r.chain}` : ''}`;
    const body = document.createElement('div'); body.textContent = r.text + (r.files?.length ? `\n[${r.files.length} ảnh đính kèm]` : '');
    const del = document.createElement('button'); del.type = 'button'; del.className = 'h-del'; del.textContent = '✕';
    del.title = 'Xoá tin này khỏi lịch sử trên máy (không thể hoàn tác)';
    del.onclick = async () => {
      if (!confirm('Xoá tin này khỏi lịch sử? Không thể hoàn tác.')) return;
      const n = await api.historyDelete({ t: r.t, id: r.id || '' });
      if (n) { const prev = el.previousElementSibling; el.remove(); if (prev?.classList.contains('hist-day') && !prev.nextElementSibling) prev.remove(); }
      else say('Không xoá được tin này.');
    };
    el.append(meta, body, del); hList.append(el);
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
async function initHist(agentId = '') {
  const sel = $('#h-agent'); sel.innerHTML = ''; sel.add(new Option('Tất cả agent', ''));
  for (const a of (await api.listAgents()).agents) sel.add(new Option(a.name, a.id));
  sel.value = agentId; $('#h-q').value = ''; loadHist(true);
}
const openHist = (agentId = '') => { histAgent = agentId; return openSettings('hist'); }; // dùng ở hộp thoại Khách
$('#h-agent').onchange = () => loadHist(true);
$('#h-q').oninput = () => { clearTimeout(hTimer); hTimer = setTimeout(() => loadHist(true), 250); };
hMore.onclick = () => loadHist(false);
$('#h-dir').onclick = () => api.openHistoryDir();

const fold = (t) => String(t || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase();
// ---------- Đơn khách order ----------
const dlgO = $('#dlg-orders'), dlgOE = $('#dlg-order-edit'), oForm = $('#o-form');
let oData = { items: [], statuses: [] }, oEditId = '';
const money = (n) => (n == null ? '' : `${Number(n).toLocaleString('vi-VN')}₫`);
function renderOrders() {
  const q = fold($('#o-q').value), box = $('#o-list'); box.replaceChildren();
  const rows = oData.items.filter((o) => !q || fold([o.custId, o.fbName, o.sku, o.color, o.status, o.note].join(' ')).includes(q));
  if (!rows.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = oData.items.length ? 'Không có dòng nào khớp.' : 'Chưa có đơn nào. Nhập từ link Google Sheets, nhập file Excel hoặc bấm “Thêm đơn”.'; box.append(p); return; }
  const tbl = document.createElement('table'); tbl.className = 'o-table';
  const head = tbl.createTHead().insertRow(); for (const h of ['#', 'ID khách', 'Khách', 'Mã SP', 'Ảnh', 'Màu', 'Size', 'SL', 'Giá bán', 'Tình trạng', '']) head.insertCell().textContent = h;
  const body = tbl.createTBody();
  rows.forEach((o, i) => {
    const r = body.insertRow();
    r.insertCell().textContent = oData.items.indexOf(o) + 1;
    r.insertCell().textContent = o.custId; r.insertCell().textContent = o.fbName; r.insertCell().textContent = o.sku;
    const im = r.insertCell(); if (o.thumb) { const t = document.createElement('img'); t.src = o.thumb; t.alt = ''; t.height = 44; im.append(t); }
    r.insertCell().textContent = o.color; r.insertCell().textContent = o.size; r.insertCell().textContent = o.qty; r.insertCell().textContent = money(o.price); r.insertCell().textContent = o.status;
    const act = r.insertCell(); const ed = document.createElement('button'); ed.className = 'ghost'; ed.textContent = 'Sửa'; ed.onclick = () => editOrder(o);
    const del = document.createElement('button'); del.className = 'ghost'; del.textContent = 'Xoá'; del.onclick = async () => { if (confirm('Xoá dòng đơn này?')) { oData = { ...oData, ...(await api.ordersDelete(o.id)) }; renderOrders(); } };
    act.append(ed, del);
  });
  box.append(tbl);
}
function editOrder(o) {
  oEditId = o?.id || ''; $('#o-form-title').textContent = o ? 'Sửa đơn' : 'Thêm đơn'; $('#o-form-err').textContent = '';
  const st = oForm.elements.status; st.replaceChildren(new Option('(chưa có)', '')); for (const x of oData.statuses) st.append(new Option(x, x));
  if (o?.status && !oData.statuses.includes(o.status)) st.append(new Option(o.status, o.status));
  for (const el of oForm.elements) if (el.name) el.value = o ? (o[el.name] ?? '') : (el.name === 'qty' ? '1' : el.name === 'status' ? 'Đã đặt hàng' : '');
  dlgOE.showModal();
}
oForm.onsubmit = async (e) => {
  e.preventDefault();
  const fields = {}; for (const el of oForm.elements) if (el.name) fields[el.name] = el.value;
  const r = await api.ordersSave({ id: oEditId, fields });
  if (!r.ok) { $('#o-form-err').textContent = r.error; return; }
  oData = { ...oData, ...r }; dlgOE.close(); renderOrders();
};
$('#o-form-cancel').onclick = () => dlgOE.close();
async function openOrders(query = '') {
  oData = await api.ordersList(); $('#o-q').value = query; renderOrders(); if (!dlgO.open) dlgO.showModal();
}
async function fillOrdersSettings() {
  const { cfg } = await api.getCfg();
  $('#o-url').value = cfg.ordersSheetUrl || ''; $('#o-hook').value = cfg.ordersWebhookUrl || ''; $('#o-token').value = cfg.ordersWebhookToken || '';
  $('#o-sheetname').value = cfg.ordersSheetName || 'khách order'; $('#o-auto').value = cfg.ordersAutoAppend === false ? '0' : '1'; $('#o-msg').textContent = '';
}
$('#c-orders').onclick = () => openOrders();
$('#o-close').onclick = () => dlgO.close();
$('#o-q').oninput = renderOrders;
$('#o-add').onclick = () => editOrder(null);
const oSay = (t, err) => { const m = $('#o-msg'); m.textContent = t; m.classList.toggle('err', !!err); };
const afterImport = (r) => { if (r.canceled) return oSay(''); if (!r.ok) return oSay(r.error, true); oData = r; renderOrders(); oSay(`Đọc ${r.read} dòng: thêm ${r.added}, bỏ ${r.skipped} dòng trùng/thiếu; dọn ${r.removedDuplicates || 0} dòng trùng đã có. Đã chuẩn bị agent chăm sóc riêng cho ${r.linkedCustomers || 0} khách${r.createdAgents ? `, tạo ${r.createdAgents} agent mới` : ''}. Tổng ${r.total} dòng.`); };
$('#o-import').onclick = async () => { oSay('Đang tải bảng…'); afterImport(await api.ordersImport({ url: $('#o-url').value, mode: $('#o-mode').value })); };
$('#o-import-file').onclick = async () => afterImport(await api.ordersImportFile({ mode: $('#o-mode').value }));
$('#o-open-sheet').onclick = async () => { if (!(await api.ordersOpenSheet())) oSay('Hãy nhập link Google Sheets rồi bấm “Nhập từ link” trước.', true); };
$('#o-export').onclick = async () => { const r = await api.ordersExport(); if (r.canceled) return; oSay(r.ok ? `Đã lưu ${r.count} dòng (có ảnh) vào ${r.filePath}. Mở Google Sheets → Tệp → Nhập để đưa lên online.` : r.error, !r.ok); };
$('#o-copy').onclick = async () => { try { await navigator.clipboard.writeText(await api.ordersTsv()); oSay('Đã chép. Mở Google Sheets, chọn ô A1 rồi dán (Ctrl+V). Ảnh không đi kèm cách này; muốn có ảnh hãy dùng “Xuất Excel”.'); } catch (e) { oSay(`Không chép được: ${e.message}`, true); } };
$('#o-script-copy').onclick = async () => { try { await navigator.clipboard.writeText(await api.ordersScript()); $('#o-hook-msg').textContent = 'Đã chép đoạn Apps Script. Dán vào Apps Script của bảng, đổi MAT_KHAU.'; } catch (e) { $('#o-hook-msg').textContent = `Không chép được: ${e.message}`; } };
$('#o-hook-test').onclick = async () => {
  const m = $('#o-hook-msg'); m.classList.remove('err'); m.textContent = 'Đang kiểm tra…';
  const r = await api.ordersWebhookTest({ url: $('#o-hook').value, token: $('#o-token').value, sheet: $('#o-sheetname').value, auto: $('#o-auto').value === '1' });
  m.classList.toggle('err', !r.ok); m.textContent = r.ok ? 'Kết nối được. Từ giờ khách mới sẽ tự thêm vào dòng cuối của bảng.' : `Chưa được: ${r.error}`;
};

// ---------- Kỹ năng của từng agent ----------
let skData = [];
const skSay = (t, err) => { const m = $('#sk-msg'); m.textContent = t; m.classList.toggle('err', !!err); };
const SRC = { owner: 'Chủ shop dặn', review: 'Tự rà soát', import: 'Nạp từ tệp' };
function renderSkills() {
  const box = $('#sk-list'); box.replaceChildren();
  const sel = $('#sk-agent'), keep = sel.value; sel.replaceChildren(...skData.map((a) => new Option(`${a.name} (${a.roleLabel || a.role})`, a.id))); if (keep) sel.value = keep;
  if (!skData.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Chưa có agent nào.'; box.append(p); return; }
  for (const a of skData) {
    const sec = document.createElement('div'); sec.className = 'sk-agent';
    const h = document.createElement('div'); h.className = 'sk-head';
    const t = document.createElement('b'); t.textContent = `${a.name}`; const m = document.createElement('span'); m.className = 'hint'; m.textContent = ` ${a.roleLabel || ''} · ${a.skills.length}/12 kỹ năng`;
    const acts = document.createElement('span'); acts.className = 'sk-acts';
    for (const [label, fn] of [['Xuất tệp', async () => { const r = await api.skillsExportJson({ agentId: a.id }); if (!r.canceled) skSay(r.ok ? `Đã xuất ${r.skills} kỹ năng: ${r.filePath}` : r.error, !r.ok); }], ['Nạp tệp vào agent này', async () => afterSkImport(await api.skillsImport({ agentId: a.id })) ]]) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = label; b.onclick = fn; acts.append(b); }
    h.append(t, m, acts); sec.append(h);
    if (!a.skills.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Chưa có kỹ năng nào.'; sec.append(p); }
    for (const s of a.skills) {
      const row = document.createElement('div'); row.className = 'sk-row';
      const body = document.createElement('div'); const tt = document.createElement('b'); tt.textContent = s.title; const tx = document.createElement('p'); tx.textContent = s.text;
      const meta = document.createElement('small'); meta.className = 'hint'; meta.textContent = `${SRC[s.source] || ''} · ${new Date(s.at).toLocaleDateString('vi-VN')}${s.version > 1 ? ` · bản ${s.version}` : ''}`; body.append(tt, tx, meta);
      const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'ghost'; ed.textContent = 'Sửa'; ed.onclick = () => { $('#sk-addbox').open = true; $('#sk-agent').value = a.id; $('#sk-title').value = s.title; $('#sk-text').value = s.text; $('#sk-text').focus(); };
      const del = document.createElement('button'); del.type = 'button'; del.className = 'ghost'; del.textContent = 'Xoá'; del.onclick = async () => { if (confirm(`Xoá kỹ năng “${s.title}” của ${a.name}?`)) { skData = (await api.skillsRemove({ agentId: a.id, id: s.id })).agents; renderSkills(); } };
      row.append(body, ed, del); sec.append(row);
    }
    box.append(sec);
  }
}
function afterSkImport(r) { if (r.canceled) return; if (!r.ok) return skSay(r.error, true); skData = r.agents; renderSkills(); skSay(`Đã nạp: thêm ${r.added}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.${r.unmatched?.length ? ` Không có agent tên: ${r.unmatched.join(', ')} (dùng “Nạp tệp vào agent này” để chọn agent nhận).` : ''}`); }
async function loadSkills() { skData = await api.skillsList(); renderSkills(); const { cfg } = await api.getCfg(); $('#sk-auto').value = cfg.skillsAuto === false ? '0' : '1'; }
$('#sk-auto').onchange = async () => { const { cfg } = await api.getCfg(); cfg.skillsAuto = $('#sk-auto').value === '1'; await api.setCfg(cfg); };
$('#sk-review').onclick = async () => { skSay('Trợ lý riêng đang rà soát lời bạn đã dặn các agent…'); const r = await api.skillsReviewNow(); if (!r.ok) return skSay(r.error, true); skSay(r.reviewed ? `Đã giao Trợ lý riêng rà soát ${r.reviewed} agent; kết quả hiện ở khung chat và danh sách bên dưới.` : 'Chưa có lời dặn mới nào để rà soát.'); setTimeout(loadSkills, 4000); };
$('#sk-export').onclick = async () => { const r = await api.skillsExportJson({}); if (!r.canceled) skSay(r.ok ? `Đã xuất ${r.skills} kỹ năng của ${r.agents} agent: ${r.filePath}` : r.error, !r.ok); };
$('#sk-import').onclick = async () => afterSkImport(await api.skillsImport({}));
$('#sk-save').onclick = async () => { const r = await api.skillsSave({ agentId: $('#sk-agent').value, title: $('#sk-title').value, text: $('#sk-text').value }); if (!r.ok) return skSay(r.error, true); skData = r.agents; renderSkills(); $('#sk-title').value = ''; $('#sk-text').value = ''; skSay('Đã lưu kỹ năng.'); };
api.onSkills(() => { if (dlgS.open && curSec === 'assistant') loadSkills(); });

// Số phiên bản ở góc phải dưới + trạng thái tự cập nhật
const ver = $('#ver'); let current = '';
api.version().then((v) => {
  current = 'v' + v; ver.textContent = current; $('#s-update-version').textContent = current;
  $('#s-update-status').textContent = 'Phiên bản hiện tại.';
});
function updateSettingsStatus(u) {
  const status = $('#s-update-status');
  if (!status) return;
  status.classList.toggle('err', u.state === 'error');
  status.textContent = u.state === 'checking' ? 'Đang kiểm tra cập nhật…'
    : u.state === 'current' ? 'Bạn đang dùng phiên bản mới nhất.'
      : u.state === 'available' ? `Đã có bản v${u.version}; đang chờ lựa chọn của bạn.`
      : u.state === 'deferred' ? `Bạn đã chọn để sau; bản v${u.version} chưa được tải.`
      : u.state === 'downloading' ? `Đang tải bản mới${u.percent != null ? `: ${u.percent}%` : '…'}`
          : u.state === 'ready' ? `Đã tải bản v${u.version}. Ứng dụng sẽ tự cài đặt sau khi các agent hoàn tất.`
            : u.state === 'error' ? `Kiểm tra cập nhật thất bại: ${u.error}` : status.textContent;
}
api.onUpdate((u) => {
  ver.classList.toggle('up', !['none', 'current', 'checking'].includes(u.state));
  ver.textContent = u.state === 'available' ? `${current} · có bản v${u.version}`
    : u.state === 'downloading' ? `${current} · đang tải bản mới${u.percent != null ? ' ' + u.percent + '%' : ''}`
    : u.state === 'ready' ? `${current} · đã tải v${u.version}, tự khởi động lại sau giây lát…` : current;
  updateSettingsStatus(u);
});

api.getCfg().then(({ cfg }) => { if (cfg.shopName) document.title = cfg.shopName; });
api.getCfg().then(({ claude }) => { if (!claude) say('Chưa tìm thấy Claude Code CLI. Claude Desktop (cửa sổ chat) không thay thế CLI. Hãy cài Claude Code và đăng nhập, hoặc nhập đường dẫn claude.exe/claude.cmd trong Cài đặt.'); });
api.officeUrl().then(showOffice); api.onOfficeReady(showOffice);
api.onOfficeError?.((m) => { $('#btn-gear').hidden = false; wait.classList.remove('hide'); wait.style.whiteSpace = 'pre-wrap'; wait.style.padding = '24px'; wait.style.textAlign = 'center'; wait.style.color = '#f99'; wait.textContent = `Không mở được văn phòng.\n\n${m}\n\nHãy đóng app rồi mở lại; nếu vẫn lỗi, cài lại bản mới nhất.`; say('Văn phòng 3D không chạy, nhưng các agent và hộp thoại vẫn dùng được nếu agent cần nhóm chat thì phải mở lại app.'); });
refresh();

// ---------- Khách hàng: mỗi khách một agent, mã định danh riêng ----------
const dlgC = $('#dlg-cust'), cList = $('#c-list'), cProf = $('#c-profile');
let custs = [];
const ago = (t) => { if (!t) return 'chưa nhắn'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'vừa xong' : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const clock = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
function renderCusts() {
  const q = $('#c-q').value.trim().toLowerCase();
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
    btn('Đổi tên', () => askRename({ code: c.code, name: c.name }, 'Đổi tên khách (mã định danh không đổi)'));
    btn(c.paused ? 'Bật lại nhắc' : 'Tắt nhắc', () => api.pauseCustomer({ code: c.code, paused: !c.paused }));
    btn('Làm mới trí nhớ', async () => { if (!(await api.refreshCustomer(c.code))) say('Agent đang làm việc, hãy chờ xong.'); }, 'Agent ghi đầy đủ hồ sơ rồi bắt đầu hội thoại mới cho nhẹ; hồ sơ được giữ');
    cList.append(el);
  }
}
const loadCusts = async () => { custs = await api.listCustomers(); renderCusts(); };
api.onCustomers((l) => { custs = l; renderCusts(); });
function renderSheetCusts() {
  const box = $('#c-sheet'), q = fold($('#c-q').value); box.replaceChildren();
  const groups = new Map();
  for (const o of oData.items || []) {
    const k = o.custId || fold(o.fbName); if (!k) continue;
    const g = groups.get(k) || { name: o.fbName, id: o.custId, lines: 0, qty: 0, total: 0, status: {} };
    g.lines++; g.qty += Number(o.qty) || 0; g.total += (Number(o.price) || 0) * (Number(o.qty) || 0); if (o.status) g.status[o.status] = (g.status[o.status] || 0) + 1;
    if (!g.name) g.name = o.fbName; if (!g.id) g.id = o.custId; groups.set(k, g);
  }
  const list = [...groups.values()].filter((g) => !q || fold(`${g.name} ${g.id}`).includes(q));
  if (!list.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = groups.size ? 'Không có khách nào khớp.' : 'Chưa có khách từ bảng. Dán link ở Cài đặt → Khách hàng.'; box.append(p); return; }
  const head = document.createElement('div'); head.className = 'o-sum h'; for (const h of ['Khách', 'ID khách', 'Dòng', 'SL', 'Tổng tiền', 'Tình trạng']) head.append(Object.assign(document.createElement('span'), { textContent: h })); box.append(head);
  for (const g of list) {
    const r = document.createElement('div'); r.className = 'o-sum'; r.title = 'Xem các dòng đơn của khách này';
    for (const t of [g.name || '(chưa có tên)', g.id || '', g.lines, g.qty, vnd(Math.round(g.total || 0)), Object.entries(g.status).map(([k, v]) => `${v} ${k}`).join(', ')]) r.append(Object.assign(document.createElement('span'), { textContent: t }));
    r.onclick = () => openOrders(g.id || g.name); box.append(r);
  }
}
async function loadSheetCusts(refresh) {
  const msg = $('#c-sheet-msg'); msg.classList.remove('err');
  const { cfg } = await api.getCfg();
  if (refresh && cfg.ordersSheetUrl && cfg.ordersAutoRefresh !== false) {
    msg.textContent = 'Đang cập nhật từ link Google Sheets…';
    const x = await api.ordersImport({ url: cfg.ordersSheetUrl, mode: 'merge' });
    if (x.ok) { oData = x; msg.textContent = `Đã cập nhật từ link: ${x.added} dòng mới, tổng ${x.total} dòng.`; } else { msg.classList.add('err'); msg.textContent = `Chưa cập nhật được từ link: ${x.error}`; }
  } else if (!cfg.ordersSheetUrl) msg.textContent = 'Chưa có link: vào Cài đặt → Khách hàng để dán link bảng Google Sheets.';
  else msg.textContent = '';
  if (!oData.items?.length) oData = await api.ordersList();
  renderSheetCusts();
}
$('#c-export').onclick = async () => {
  const button = $('#c-export'), message = $('#c-export-msg');
  button.disabled = true; message.classList.remove('err'); message.textContent = 'Đang tạo tệp Excel…';
  try {
    const result = await api.exportCustomers();
    if (result.canceled) { message.textContent = 'Đã hủy xuất tệp.'; return; }
    if (!result.ok) throw new Error(result.error);
    message.textContent = `Đã xuất ${result.count} khách hàng: ${result.filePath}`;
  } catch (error) {
    message.classList.add('err'); message.textContent = `Không xuất được tệp Excel: ${error.message}`;
  } finally { button.disabled = false; }
};
const dlgLocalCustomers = $('#dlg-cust-data'), localCustomerRows = $('#lc-rows'), selectedLocalCustomers = new Set();
let localCustomers = [];
const localDate = (time) => time ? new Date(time).toLocaleDateString('vi-VN') : '—';
function renderLocalCustomers() {
  const query = fold($('#lc-q').value);
  const visible = localCustomers.filter((customer) => fold(`${customer.code} ${customer.name} ${customer.phone} ${customer.address} ${customer.size}`).includes(query));
  localCustomerRows.replaceChildren();
  if (!visible.length) {
    const row = document.createElement('tr'), cell = document.createElement('td');
    cell.colSpan = 9; cell.className = 'hint'; cell.textContent = localCustomers.length ? 'Không có khách nào khớp.' : 'Chưa có dữ liệu khách hàng lưu trên máy.';
    row.append(cell); localCustomerRows.append(row);
  } else {
    for (const customer of visible) {
      const row = document.createElement('tr'), selectCell = document.createElement('td'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.disabled = customer.deletable === false;
      checkbox.checked = customer.deletable !== false && selectedLocalCustomers.has(customer.code);
      if (customer.deletable !== false) checkbox.dataset.code = customer.code;
      checkbox.setAttribute('aria-label', `Chọn khách ${customer.name}`);
      selectCell.append(checkbox); row.append(selectCell);
      for (const value of [customer.code, customer.name, customer.phone, customer.address, customer.size, localDate(customer.createdAt), localDate(customer.updatedAt), String(customer.orderCount ?? 0)]) {
        const cell = document.createElement('td'); cell.textContent = value || '—'; row.append(cell);
      }
      localCustomerRows.append(row);
    }
  }
  const selected = selectedLocalCustomers.size;
  $('#lc-delete').disabled = selected === 0;
  $('#lc-delete').textContent = selected ? `Xóa đã chọn (${selected})` : 'Xóa đã chọn';
  const selectAll = $('#lc-all');
  const selectable = visible.filter((customer) => customer.deletable !== false);
  const selectedVisible = selectable.filter((customer) => selectedLocalCustomers.has(customer.code)).length;
  selectAll.checked = selectable.length > 0 && selectedVisible === selectable.length;
  selectAll.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;
  $('#lc-msg').textContent = `${localCustomers.length} khách lưu trên máy · Đã chọn ${selected}.`;
}
async function loadLocalCustomers() {
  const status = $('#lc-msg'); status.classList.remove('err'); status.textContent = 'Đang tải dữ liệu khách hàng…';
  try {
    localCustomers = await api.listLocalCustomers();
    if (!Array.isArray(localCustomers)) throw new Error('Dữ liệu khách hàng trả về không hợp lệ.');
    renderLocalCustomers();
    return true;
  } catch (error) {
    localCustomers = []; selectedLocalCustomers.clear(); renderLocalCustomers();
    status.classList.add('err'); status.textContent = `Không tải được dữ liệu khách hàng: ${error.message}`;
    return false;
  }
}
$('#customers-export').onclick = async () => {
  const button = $('#customers-export'), status = $('#customers-local-msg');
  button.disabled = true; status.classList.remove('err'); status.textContent = 'Đang tạo tệp Excel…';
  try {
    const result = await api.exportCustomers();
    if (result.canceled) { status.textContent = 'Đã hủy xuất tệp.'; return; }
    if (!result.ok) throw new Error(result.error);
    status.textContent = `Đã xuất ${result.count} khách hàng: ${result.filePath}`;
  } catch (error) {
    status.classList.add('err'); status.textContent = `Không xuất được tệp Excel: ${error.message}`;
  } finally { button.disabled = false; }
};
$('#orders-open').onclick = () => openOrders(); // đơn order: thêm, sửa, xoá từng dòng (trước đây chỉ mở được từ hộp Khách đã bị bỏ)
$('#customers-local-open').onclick = async () => {
  $('#lc-q').value = ''; selectedLocalCustomers.clear(); await loadLocalCustomers(); dlgLocalCustomers.showModal();
};
$('#lc-q').oninput = renderLocalCustomers;
$('#lc-all').onchange = (event) => {
  const query = fold($('#lc-q').value);
  for (const customer of localCustomers.filter((item) => fold(`${item.code} ${item.name} ${item.phone} ${item.address} ${item.size}`).includes(query))) {
    if (customer.deletable === false) continue;
    if (event.target.checked) selectedLocalCustomers.add(customer.code); else selectedLocalCustomers.delete(customer.code);
  }
  renderLocalCustomers();
};
localCustomerRows.onchange = (event) => {
  const code = event.target.dataset.code;
  if (!code) return;
  if (event.target.checked) selectedLocalCustomers.add(code); else selectedLocalCustomers.delete(code);
  renderLocalCustomers();
};
$('#lc-delete').onclick = async () => {
  const codes = [...selectedLocalCustomers];
  if (!codes.length || !confirm(`Xóa ${codes.length} khách đã chọn cùng agent và hồ sơ lưu trên máy? Đơn hàng, doanh thu và lịch sử chat sẽ được giữ lại.`)) return;
  const button = $('#lc-delete'), status = $('#lc-msg');
  button.disabled = true; status.classList.remove('err'); status.textContent = 'Đang xóa…';
  try {
    const result = await api.deleteLocalCustomers(codes);
    if (!result.ok) throw new Error(result.error);
    selectedLocalCustomers.clear();
    if (!(await loadLocalCustomers())) {
      status.classList.add('err'); status.textContent = `Đã xóa ${result.deleted} khách nhưng không tải lại được danh sách. Hãy đóng rồi mở lại bảng.`;
      return;
    }
    status.textContent = `Đã xóa ${result.deleted} khách cùng hồ sơ và agent trên máy.`;
  } catch (error) {
    renderLocalCustomers();
    status.classList.add('err'); status.textContent = `Không xóa được khách hàng: ${error.message}`;
  } finally { button.disabled = selectedLocalCustomers.size === 0; }
};
$('#lc-close').onclick = () => dlgLocalCustomers.close();
$('#c-q').oninput = () => { renderCusts(); renderSheetCusts(); }; $('#c-close').onclick = () => dlgC.close();
loadCusts(); setInterval(() => { if (dlgC.open) loadCusts(); }, 15000);

// Nhập tin của khách / đọc hộp thư Messenger
const dlgI = $('#dlg-inbound'), formI = $('#inboundform');
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
$('#revform').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target.elements;
  const r = await api.addRevenue({ code: f.code.value, amount: f.amount.value, note: f.note.value });
  if (!r.ok) { $('#r-err').textContent = r.error; return; }
  $('#r-err').textContent = ''; e.target.reset(); loadRev();
});
$('#r-close').onclick = () => dlgR.close();

// ---------- Chờ duyệt: agent chỉ đề xuất, bạn duyệt rồi mới đăng ----------
const dlgA2 = $('#dlg-appr'), aList = $('#a-list');
const KIND_VN = { bai_dang: 'Đăng bài vào nhóm', binh_luan: 'Bình luận vào bài viết' };
const ST_VN = { pending: 'Chờ duyệt', approved: 'Đã duyệt, đang xếp hàng', running: 'Đang đăng…', done: 'Đã đăng', failed: 'Chưa đăng được', rejected: 'Đã từ chối' };
let apprData = { items: [], today: 0 };
function renderApprovals() {
  if (!dlgA2.open) return;
  $('#a-limit').textContent = `Hôm nay đã đăng ${apprData.today} bài/bình luận`;
  aList.innerHTML = '';
  if (!apprData.items.length) { aList.textContent = 'Chưa có đề xuất nào. Khi agent muốn đăng bài hay bình luận, đề xuất sẽ hiện ở đây.'; return; }
  for (const it of apprData.items) {
    const el = document.createElement('div'); el.className = 'appr ' + it.status;
    el.innerHTML = '<div class="meta"></div><div class="tgt"></div><textarea></textarea><div class="acts"></div>';
    el.querySelector('.meta').textContent = `#${it.num} · ${KIND_VN[it.kind] || it.kind} · ${it.agentName} · ${new Date(it.t).toLocaleString('vi-VN')}`;
    el.querySelector('.tgt').textContent = `Đích: ${it.target}${it.files?.length ? ` · ${it.files.length} ảnh` : ''}`;
    const ta = el.querySelector('textarea'); ta.value = it.text; ta.readOnly = it.status !== 'pending';
    const acts = el.querySelector('.acts');
    if (it.status === 'pending') {
      const mk = (label, cls, fn) => { const x = document.createElement('button'); x.textContent = label; if (cls) x.className = cls; x.onclick = fn; acts.append(x); };
      const approve = async () => {
        $('#a-err').textContent = '';
        if (ta.value.trim() !== it.text) { if (!(await api.editApproval({ id: it.id, text: ta.value }))) { $('#a-err').textContent = 'Không lưu được nội dung đã sửa.'; return; } }
        const fresh = (await api.listApprovals()).items.find((x) => x.id === it.id);
        const r = await api.decideApproval({ id: it.id, decision: 'approve', hash: fresh?.hash });
        if (!r.ok) $('#a-err').textContent = r.error;
      };
      mk('Duyệt và đăng', '', approve);
      mk('Từ chối', 'ghost', async () => { await api.decideApproval({ id: it.id, decision: 'reject' }); });
    } else {
      const st = document.createElement('span'); st.className = 'st ' + it.status; st.textContent = `${ST_VN[it.status] || it.status}${it.result ? ` · ${it.result}` : ''}`; acts.append(st);
    }
    aList.append(el);
  }
}
const loadApprovals = async () => { apprData = await api.listApprovals(); renderApprovals(); };
api.onApprovals((d) => { apprData = d; renderApprovals(); });
$('#a-close').onclick = () => dlgA2.close();
loadApprovals();
