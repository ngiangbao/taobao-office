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

test('mọi kênh IPC trong preload.js đều có handler ở main.js và ngược lại', () => {
  const pre = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8'), main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const invoked = new Set([...pre.matchAll(/invoke\('([^']+)'/g)].map((m) => m[1])), handled = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...invoked].filter((x) => !handled.has(x)), [], 'gọi mà không có handler');
  assert.deepEqual([...handled].filter((x) => !invoked.has(x)), [], 'handler mà không ai gọi');
});
test('đổi tên khung chat: app lưu chatName vào shop-stats.json để văn phòng đọc', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), office = fs.readFileSync(path.join(__dirname, '..', 'office', 'src', 'office', 'ui', 'activity.js'), 'utf8');
  assert.match(main, /chatName: loadCfg\(\)\.chatName/); assert.match(main, /ipcMain\.handle\('chat:rename'/); assert.match(office, /applyChatName\(JSON\.parse\(t\)\.chatName\)/);
});

test('hộp Chờ duyệt có nút mở ở thanh trên, mở là tải lại danh sách', () => {
  assert.match(html, /id="btn-appr"/); assert.match(js, /\$\('#btn-appr'\)\.onclick\s*=[\s\S]{0,120}dlgA2\.showModal\(\)/);
  assert.match(html, /id="appr-n"/);
});

test('nút ✕ xóa agent ở cột trái của văn phòng: văn phòng gửi delete-agent, app xử lý', () => {
  const act = fs.readFileSync(path.join(__dirname, '..', 'office', 'src', 'office', 'ui', 'activity.js'), 'utf8');
  assert.match(act, /ri-del/); assert.match(act, /tbo: 'delete-agent'/);
  assert.match(js, /d\.tbo === 'delete-agent'/); assert.match(js, /async function deleteAgentBySid/);
});
