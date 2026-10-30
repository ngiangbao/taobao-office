// Chrome chỉ bật khi agent thật sự gọi công cụ trình duyệt. Dùng máy chủ MCP giả nên không mở Chrome thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { createProxy } = require('../lib/mcp-lazy');

// máy chủ MCP giả: trả lời initialize, tools/list, tools/call (kèm số thứ tự để kiểm tra thứ tự)
const FAKE = `let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);if(!l)continue;const m=JSON.parse(l);
 if(m.method==='initialize')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{capabilities:{}}}));
 else if(m.method==='tools/list')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:[{name:'browser_navigate'}]}}));
 else if(m.method==='tools/call')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'đã gọi '+m.params.name}]}}));}});`;

function setup(ensureBrowser) {
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  let buf = ''; output.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const proxy = createProxy({ spawnChild: () => spawn(process.execPath, ['-e', FAKE], { stdio: ['pipe', 'pipe', 'inherit'] }), ensureBrowser, input, output });
  const send = (o) => input.write(JSON.stringify(o) + '\n');
  const waitFor = async (n) => { for (let i = 0; i < 200 && lines.length < n; i++) await new Promise((r) => setTimeout(r, 25)); };
  return { send, lines, waitFor, proxy, close: () => { proxy.stop(); input.end(); } };
}

test('khởi động và liệt kê công cụ KHÔNG mở Chrome; lần gọi công cụ đầu tiên mới mở, đúng một lần', async () => {
  let opened = 0;
  const t = setup(async () => { opened++; await new Promise((r) => setTimeout(r, 150)); });
  t.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  t.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  t.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await t.waitFor(2);
  assert.equal(t.lines.length, 2, 'đã trả lời initialize và tools/list');
  assert.equal(opened, 0, 'chào hỏi/liệt kê công cụ không được mở Chrome');
  t.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'browser_navigate' } });
  t.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'browser_snapshot' } });
  await t.waitFor(4);
  assert.equal(opened, 1, 'mở Chrome đúng một lần dù gọi nhiều công cụ');
  assert.deepEqual(t.lines.slice(2).map((l) => l.id), [3, 4], 'giữ đúng thứ tự');
  assert.match(t.lines[2].result.content[0].text, /browser_navigate/); assert.match(t.lines[3].result.content[0].text, /browser_snapshot/);
  t.close();
});

test('không mở được Chrome: báo lỗi rõ cho đúng lần gọi đó, không treo, lần sau thử lại', async () => {
  let opened = 0, fail = true;
  const t = setup(async () => { opened++; if (fail) throw new Error('Không tìm thấy Google Chrome. Hãy cài Chrome.'); });
  t.send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'browser_navigate' } });
  await t.waitFor(1);
  assert.equal(t.lines[0].id, 7); assert.equal(t.lines[0].result.isError, true); assert.match(t.lines[0].result.content[0].text, /Không mở được Chrome: Không tìm thấy/);
  fail = false;
  t.send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'browser_navigate' } });
  await t.waitFor(2);
  assert.equal(opened, 2, 'lần sau tự thử mở lại'); assert.equal(t.lines[1].id, 8); assert.ok(!t.lines[1].result.isError);
  t.close();
});

test('thông điệp không phải JSON được chuyển nguyên, không làm hỏng luồng', async () => {
  let opened = 0; const t = setup(async () => { opened++; });
  t.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  await t.waitFor(1); assert.equal(opened, 0); t.close();
});
