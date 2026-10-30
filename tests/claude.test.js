const test = require('node:test');
const assert = require('node:assert/strict');
const { checkClaude } = require('../lib/claude');

test('kiểm tra được một executable Claude CLI đã chọn', async () => {
  const result = await checkClaude(process.execPath);
  assert.equal(result.ok, true);
  assert.equal(result.path, process.execPath);
  assert.match(result.version, /^v\d/);
});

test('model: mặc định haiku (tiết kiệm nhất), đổi được, "default" thì không ép model, giá trị lạ bị bỏ', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-m-'));
  const fake = path.join(dir, 'claude'); fs.writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGS_OUT"\n', { mode: 0o755 });
  const { runClaude } = require('../lib/claude');
  const args = async (cfg) => {
    const out = path.join(dir, 'args.txt'); process.env.ARGS_OUT = out;
    const { done } = runClaude({ text: 'x', cfg: { claudePath: fake, ...cfg }, dataDir: dir, agent: { name: 'A', sid: 's', dir, started: false, rolePrompt: '', team: [] }, onEvent: () => {} });
    await done; return fs.readFileSync(out, 'utf8').split('\n');
  };
  return (async () => {
    try {
      let a = await args({}); assert.equal(a[a.indexOf('--model') + 1], 'haiku');
      a = await args({ model: 'sonnet' }); assert.equal(a[a.indexOf('--model') + 1], 'sonnet');
      assert.ok(!(await args({ model: 'default' })).includes('--model'));
      assert.ok(!(await args({ model: 'x; rm -rf /' })).includes('--model'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
});
