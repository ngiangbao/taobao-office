const test = require('node:test');
const assert = require('node:assert/strict');
const { importGroups, parseGroupsCsv } = require('../lib/google-sheets');

test('đọc CSV có tiêu đề tiếng Việt, dấu phẩy và dấu ngoặc kép', () => {
  assert.deepEqual(parseGroupsCsv('\uFEFFTên nhóm,Link nhóm\r\n"Chợ áo, váy",https://www.facebook.com/groups/123/\r\n'), [
    { name: 'Chợ áo, váy', url: 'https://www.facebook.com/groups/123/' },
  ]);
});

test('đọc dữ liệu không có tiêu đề từ hai cột đầu', () => {
  assert.deepEqual(parseGroupsCsv('Đồ nữ,https://facebook.com/groups/456\n'), [
    { name: 'Đồ nữ', url: 'https://facebook.com/groups/456' },
  ]);
});

test('từ chối link nhóm không phải Facebook và dòng thiếu dữ liệu', () => {
  assert.throws(() => parseGroupsCsv('Tên nhóm,Link nhóm\nNhóm A,https://example.com/groups/a'), /Dòng 2.*Facebook/);
  assert.throws(() => parseGroupsCsv('Tên nhóm,Link nhóm\nNhóm A,'), /Dòng 2.*cả tên nhóm và link nhóm/);
});

test('chỉ lấy dữ liệu từ URL Google Sheets công khai hợp lệ', async () => {
  let requested;
  const groups = await importGroups('https://docs.google.com/spreadsheets/d/abcdefghij123456/edit?gid=42#gid=42', async (url) => {
    requested = url.href;
    return new Response('Tên nhóm,Link nhóm\nĐồ nữ,https://www.facebook.com/groups/123', { headers: { 'content-type': 'text/csv' } });
  });
  assert.equal(requested, 'https://docs.google.com/spreadsheets/d/abcdefghij123456/export?format=csv&gid=42');
  assert.deepEqual(groups, [{ name: 'Đồ nữ', url: 'https://www.facebook.com/groups/123' }]);
  await assert.rejects(() => importGroups('https://example.com/spreadsheets/d/abcdefghij123456/edit', async () => new Response('')), /Chỉ chấp nhận liên kết Google Sheets/);
});

test('danh sách nhóm từ file Excel và link tệp Google Drive', async (t) => {
  const { parseGroupsXlsx, driveFileUrl } = require('../lib/google-sheets');
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Nhóm');
  ws.addRow(['Tên nhóm', 'Link nhóm', 'Ghi chú']);
  ws.addRow(['Order hàng Trung Quốc', 'https://www.facebook.com/groups/orderhang']);
  ws.addRow(['Thời trang nữ', { text: 'bấm vào nhóm', hyperlink: 'https://www.facebook.com/groups/thoitrangnu' }]);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const groups = await parseGroupsXlsx(buf);
  assert.deepEqual(groups.map((g) => g.name), ['Order hàng Trung Quốc', 'Thời trang nữ']);
  assert.equal(groups[1].url, 'https://www.facebook.com/groups/thoitrangnu');
  assert.equal(driveFileUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp');
  assert.equal(driveFileUrl('https://evil.example/file/d/1AbCdEfGhIjKlMnOp/view'), null);
});
