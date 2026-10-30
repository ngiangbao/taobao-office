// Tên cửa hàng đi vào lời dặn của agent; lượt "người đăng" chỉ dùng lời dặn riêng. Dùng lệnh claude giả nên không tốn tiền.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runClaude } = require('../lib/claude');

async function systemPrompt(cfg, agentExtra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-s-')); const fake = path.join(dir, 'claude'); fs.writeFileSync(fake, '#!/bin/sh\ncat >/dev/null\necho {}', { mode: 0o755 });
  const agent = { name: 'Báo giá', sid: require('node:crypto').randomUUID(), started: false, dir, rolePrompt: 'VAI-TRO', instructions: '', team: [], toolKind: 'team', ...agentExtra };
  const { done } = runClaude({ text: 'x', cfg: { claudePath: fake, rate: 1, shipPerKg: 1, servicePct: 1, ...cfg }, dataDir: dir, agent, onEvent() {} });
  await done; const sp = fs.readFileSync(path.join(dir, 'system-prompt.md'), 'utf8'); fs.rmSync(dir, { recursive: true, force: true }); return sp;
}
test('tên cửa hàng xuất hiện trong lời dặn của agent', async () => {
  const sp = await systemPrompt({ shopName: 'Lan Fashion' });
  assert.match(sp, /cửa hàng "Lan Fashion"/);
});
test('chưa đặt tên thì dùng tên mặc định', async () => {
  assert.match(await systemPrompt({}), /cửa hàng "Cửa hàng của tôi"/);
});
test('lượt người đăng không nhận lời dặn chung (tránh mâu thuẫn "bạn không có quyền đăng")', async () => {
  const sp = await systemPrompt({ shopName: 'Lan Fashion' }, { publisher: true, rolePrompt: 'CHI-DANG' });
  assert.equal(sp.trim().startsWith('CHI-DANG'), true); assert.ok(!sp.includes('KHÔNG CÓ QUYỀN đăng bài'));
});
