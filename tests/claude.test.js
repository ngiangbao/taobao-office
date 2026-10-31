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
    const run = () => runClaude({ text: 'x', cfg: { claudePath: fake, ...cfg }, dataDir: dir, agent: { name: 'A', sid: 's', dir, started: false, rolePrompt: '', team: [] }, onEvent: () => {} }).done;
    for (let i = 0; i < 4; i++) { // (máy bận có thể trả "Text file busy" ngay sau khi vừa ghi tệp chạy thử: thử lại)
      const r = await run(); if (fs.existsSync(out)) return fs.readFileSync(out, 'utf8').split('\n'); if (i === 3) throw new Error('claude giả không chạy: ' + r.err);
      await new Promise((ok) => setTimeout(ok, 100));
    }
  };
  return (async () => {
    try {
      await new Promise((ok) => setTimeout(ok, 150)); // để tệp chạy thử được ghi xong hẳn trước khi chạy (tránh "Text file busy")
      let a = await args({}); assert.equal(a[a.indexOf('--model') + 1], 'haiku');
      a = await args({ model: 'sonnet' }); assert.equal(a[a.indexOf('--model') + 1], 'sonnet');
      assert.ok(!(await args({ model: 'default' })).includes('--model'));
      assert.ok(!(await args({ model: 'x; rm -rf /' })).includes('--model'));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
});

test('thư mục ảnh sản phẩm dùng chung: chép ảnh, lời dặn nhắc thư mục, tải ảnh chỉ cấu hình Người đăng', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
  const photos = require('../lib/photos'), browser = require('../lib/browser');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-photos-'));
  const src = path.join(d, 'src'); fs.mkdirSync(src); fs.writeFileSync(path.join(src, 'AC001.jpg'), 'x'); fs.writeFileSync(path.join(src, 'ghi-chu.txt'), 'x');
  const got = photos.share(d, path.join(src, 'AC001.jpg'));
  assert.equal(got, path.join(d, 'anh-san-pham', 'AC001.jpg')); assert.ok(fs.existsSync(got));
  assert.equal(photos.share(d, path.join(src, 'ghi-chu.txt')), ''); // chỉ chép ảnh
  assert.equal(photos.mirror(d, src), 1); assert.ok(fs.existsSync(path.join(d, 'anh-san-pham', 'kho', 'AC001.jpg')));
  const normal = JSON.parse(fs.readFileSync(browser.mcpConfig({ isPackaged: false }, d, 'app'), 'utf8')).mcpServers.playwright.args;
  const up = JSON.parse(fs.readFileSync(browser.mcpConfig({ isPackaged: false }, d, 'app', { upload: true }), 'utf8')).mcpServers.playwright.args;
  assert.ok(!normal.includes('--upload')); assert.ok(up.includes('--upload'));
});
