const test = require('node:test');
const assert = require('node:assert/strict');
const { checkClaude } = require('../lib/claude');

test('kiểm tra được một executable Claude CLI đã chọn', async () => {
  const result = await checkClaude(process.execPath);
  assert.equal(result.ok, true);
  assert.equal(result.path, process.execPath);
  assert.match(result.version, /^v\d/);
});
