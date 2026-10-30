// File quy trình CI phải là YAML hợp lệ: nếu hỏng, GitHub không chạy gì mà cũng không báo rõ (chỉ thấy lượt chạy "thất bại" ngay lập tức).
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const have = spawnSync('python3', ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0;
test('các file workflow GitHub là YAML hợp lệ', { skip: !have && 'không có python3/PyYAML' }, () => {
  const dir = path.join(__dirname, '..', '.github', 'workflows');
  const r = spawnSync('python3', ['-c', `import yaml,glob,sys
bad=[]
for f in glob.glob(${JSON.stringify(dir)}+'/*.y*ml'):
    try: yaml.safe_load(open(f))
    except Exception as e: bad.append(f+': '+str(e).replace(chr(10),' ')[:200])
print('\\n'.join(bad)); sys.exit(1 if bad else 0)`], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'YAML hỏng:\n' + r.stdout);
});
