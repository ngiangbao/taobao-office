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

test('ảnh kho tự chép vào thư mục chung theo mã; ảnh nhỏ bị đánh dấu thấp; đã thay thì không bị ghi đè; DOI_ANH', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
  const photos = require('../lib/photos'), { forAgent } = require('../lib/inventory');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tbo-photos2-')), img = path.join(d, 'anh'); fs.mkdirSync(img);
  fs.writeFileSync(path.join(img, 'AC001.jpg'), 'aaaa'); fs.writeFileSync(path.join(img, 'AC002.png'), 'bbbbbb');
  const sizes = { aaaa: { width: 300, height: 400 }, bbbbbb: { width: 1200, height: 1200 } };
  const items = [{ sku: 'AC001', image: 'AC001.jpg' }, { sku: 'AC002', image: 'AC002.png' }, { sku: 'AC003' }];
  const m = photos.syncStock(d, items, img, (b) => sizes[b.toString()]);
  assert.equal(path.basename(m.get('AC001').file), 'AC001_001.jpg'); assert.equal(m.get('AC001').low, true);
  assert.equal(path.basename(m.get('AC002').file), 'AC002_001.png'); assert.equal(m.get('AC002').low, false);
  const a = forAgent({ items: items.map((i) => ({ ...i, name: '', colors: '' })), types: [] }, 'kho/anh/', m).sanPham;
  assert.equal(a[0].anhThap, true); assert.ok(a[0].anh.endsWith('san-pham/AC001_001.jpg')); assert.equal(a[2].anh, undefined);
  photos.put(d, 'AC001', 1, Buffer.from('cccc'), 'jpg'); photos.put(d, 'AC001', 2, Buffer.from('dddd'), 'jpg'); photos.markReplaced(d, 'AC001');
  const m2 = photos.syncStock(d, items, img, () => ({ width: 2000, height: 2000 }));
  assert.equal(fs.readFileSync(m2.get('AC001').file, 'utf8'), 'cccc'); // không bị ảnh kho cũ ghi đè
  assert.ok(fs.existsSync(path.join(d, 'anh-san-pham', 'san-pham', 'AC001_002.jpg')));
  const r = photos.parseReplace('xong [[DOI_ANH ma="AC001" link="https://detail.1688.com/x" anh_url="https://a.alicdn.com/1.jpg|https://a.alicdn.com/2.jpg"]]');
  assert.deepEqual(r.jobs[0].urls.length, 2); assert.equal(r.jobs[0].sku, 'AC001'); assert.equal(r.rest, 'xong');
});
