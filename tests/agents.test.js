const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAgents } = require('../lib/agents');

test('gõ @Tên agent trực tiếp để giao việc, không khớp tên dài hơn', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-agents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir);
  const quote = agents.add({ name: 'Báo giá', role: 'quote' });
  agents.add({ name: 'Báo giá nhanh', role: 'quote' });

  assert.equal(agents.route('@Báo giá tính giúp món này').agent.id, quote.id);
  assert.equal(agents.route('Tính giúp @Báo giá nhé').agent.id, quote.id);
  assert.equal(agents.route('@Báo giáxyz tính giúp món này').agent, null);
});

test('loại bỏ dấu ngoặc kép khi lưu tên agent để cú pháp @Tên dùng trực tiếp', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-agents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir);
  const agent = agents.add({ name: '"Báo giá"', role: 'quote' });

  assert.equal(agent.name, 'Báo giá');
  assert.equal(agents.route('@Báo giá tính giúp món này').agent.id, agent.id);
});

test('loại bỏ dấu ngoặc kép khỏi tên agent đã lưu từ trước', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-agents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'agents.json'), JSON.stringify([{
    id: 'legacy', name: '"Báo giá"', role: 'quote', sid: 'session', dir, started: false,
  }]));
  const agents = createAgents(dir);

  assert.equal(agents.get('legacy').name, 'Báo giá');
  assert.equal(agents.route('@Báo giá tính giúp món này').agent.id, 'legacy');
});

test('tạo agent mặc định còn thiếu theo vai trò, không tạo trùng khi chạy lại', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-agents-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const agents = createAgents(dir);
  const defaults = [
    { name: 'Chăm sóc khách', role: 'cskh' },
    { name: 'Tìm hàng', role: 'search' },
    { name: 'Báo giá', role: 'quote' },
  ];
  agents.add({ name: 'Đội tìm hàng riêng', role: 'search' });

  assert.deepEqual(agents.ensureDefaults(defaults).map((a) => a.role), ['cskh', 'quote']);
  assert.deepEqual(agents.ensureDefaults(defaults), []);
  assert.equal(agents.all().length, 3);
});

test('đổi tên agent từ app: bỏ ký tự cấm, tối đa 24 ký tự, không trùng, không đổi tên agent khách', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { createAgents } = require('../lib/agents');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-rn-')); try {
    const agents = createAgents(dir); const a = agents.add({ name: 'Tìm hàng', role: 'search' }), b = agents.add({ name: 'Báo giá', role: 'quote' });
    assert.deepEqual(agents.renameChecked(a.id, '  Lan "tìm" hàng @  '), { ok: true, name: 'Lan tìm hàng' });
    assert.equal(agents.renameChecked(b.id, 'lan TÌM hàng').ok, false, 'trùng tên (không phân biệt hoa thường, dấu)');
    assert.equal(agents.renameChecked(b.id, '   ').ok, false);
    assert.equal(agents.renameChecked(b.id, 'x'.repeat(40)).name.length, 24);
    assert.equal(agents.renameChecked('khong-co', 'A').ok, false);
    const kh = agents.addCustomer({ name: 'Khách Lan', code: 'KH-AAAAA' }); assert.equal(agents.renameChecked(kh.id, 'Khác').ok, false);
    assert.equal(createAgents(dir).get(a.id).name, 'Lan tìm hàng', 'lưu vào đĩa');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'office', 'agent-names.json'), 'utf8'))[a.sid], 'Lan tìm hàng', 'văn phòng nhận tên mới');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
