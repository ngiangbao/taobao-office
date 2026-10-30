// Văn phòng chạy trong app chỉ hiện các phiên là agent của app; phiên Claude khác trên máy bị bỏ qua. Dùng văn phòng thật (không gọi Claude).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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
