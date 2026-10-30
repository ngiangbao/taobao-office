// Văn phòng chạy trong app chỉ hiện các phiên là agent của app; phiên Claude khác trên máy bị bỏ qua. Dùng văn phòng thật (không gọi Claude).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.TBO_OFFICE_PORT_BASE = '4440';
const { startOffice } = require('../lib/office');

test('phiên lạ bị bỏ qua, phiên của agent hiện ra', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-o-'));
  fs.mkdirSync(path.join(data, 'office'), { recursive: true });
  fs.writeFileSync(path.join(data, 'office', 'agent-names.json'), JSON.stringify({ 'agent-sid-1': 'Báo giá' }));
  const o = await startOffice({ isPackaged: false }, data);
  try {
    const post = (sid, ev = 'UserPromptSubmit') => fetch(o.url + 'event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid, hook_event_name: ev, cwd: '/tmp/x', prompt: 'việc thử', tool_name: 'WebSearch', tool_input: { query: 'áo' } }) });
    await post('sid-la-cua-nguoi-khac'); await post('agent-sid-1'); await post('agent-sid-1', 'PreToolUse');
    await new Promise((r) => setTimeout(r, 800));
    const doctor = await (await fetch(o.url + 'api/doctor')).json();
    assert.equal(doctor.sessions, 1, 'chỉ một phiên (agent Báo giá), không có phiên lạ');
  } finally { o.child.kill(); fs.rmSync(data, { recursive: true, force: true }); }
});

test('agent của app luôn có chỗ ngồi (ngồi chơi), không bị "rời nhóm" khi hết việc, không có tin thêm/rời nhóm', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-o-'));
  fs.mkdirSync(path.join(data, 'office'), { recursive: true });
  const names = path.join(data, 'office', 'agent-names.json');
  fs.writeFileSync(names, JSON.stringify({ 'agent-a': 'Kho hàng', 'agent-b': 'Báo giá' }));
  const o = await startOffice({ isPackaged: false }, data);
  try {
    const post = (sid, ev) => fetch(o.url + 'event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid, hook_event_name: ev, cwd: data }) });
    const count = async () => (await (await fetch(o.url + 'api/doctor')).json()).sessions;
    const wait = async (n) => { for (let i = 0; i < 30; i++) { if ((await count()) === n) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
    assert.ok(await wait(2), 'cả hai agent ngồi sẵn trong văn phòng dù chưa chạy lần nào');
    await post('agent-a', 'SessionStart'); await post('agent-a', 'UserPromptSubmit'); await post('agent-a', 'Stop'); await post('agent-a', 'SessionEnd');
    await new Promise((r) => setTimeout(r, 2500));
    assert.equal(await count(), 2, 'hết việc vẫn ở lại văn phòng');
    const text = JSON.stringify((await (await fetch(o.url + 'api/chat')).json()).msgs);
    assert.ok(!/rời khỏi|thêm .* vào nhóm|left the group|added .* to the group/i.test(text), 'không có thông báo vào/ra nhóm');
    fs.writeFileSync(names, JSON.stringify({ 'agent-b': 'Báo giá' }));
    assert.ok(await wait(1), 'agent đã xoá trong app thì rời văn phòng');
    const after = JSON.stringify((await (await fetch(o.url + 'api/chat')).json()).msgs);
    assert.ok(!/rời khỏi|left the group/i.test(after), 'rời đi lặng lẽ');
  } finally { o.child.kill(); fs.rmSync(data, { recursive: true, force: true }); }
});
