// Mọi hộp thoại quan trọng của app phải có cách mở được từ giao diện (lỗi từng xảy ra: bỏ nút mà hộp thoại không còn chỗ mở).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

test('hộp thoại đơn order và dữ liệu khách trên máy mở được từ Cài đặt', () => {
  assert.match(html, /id="orders-open"/); assert.match(js, /\$\('#orders-open'\)\.onclick\s*=/);
  assert.match(html, /id="customers-local-open"/); assert.match(js, /\$\('#customers-local-open'\)\.onclick\s*=/);
  assert.match(js, /function openOrders|async function openOrders/);
});
test('mọi nút id có onclick trong app.js thì phần tử đó phải có trong index.html', () => {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of js.matchAll(/\$\('#([\w-]+)'\)\.onclick\s*=/g)) assert.ok(ids.has(m[1]), `thiếu #${m[1]} trong index.html`);
});
