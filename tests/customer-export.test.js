const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCustomerRows, createCustomerWorkbook } = require('../lib/customer-export');

test('xuất đủ thông tin từ hồ sơ và cộng doanh thu theo mã khách', () => {
  const customers = [
    { code: 'KH-AAA22', name: 'Lan' },
    { code: 'KH-BBB33', name: 'Hương', phone: '0900000000' },
  ];
  const profiles = new Map([
    ['KH-AAA22', '- SĐT: 0912345678\n- Địa chỉ nhận hàng: 12 Lê Lợi, Quận 1\n- Size M, thích màu be'],
    ['KH-BBB33', '- Cỡ: XL'],
  ]);
  const rows = buildCustomerRows(customers, [
    { code: 'KH-AAA22', name: 'Lan', amount: 200000 },
    { code: 'KH-AAA22', name: 'Lan', amount: 150000 },
    { code: '', name: 'Hương', amount: 300000 },
  ], (customer) => profiles.get(customer.code));

  assert.deepEqual(rows, [
    { id: 'KH-AAA22', name: 'Lan', phone: '0912345678', address: '12 Lê Lợi, Quận 1', size: 'M', revenue: 350000 },
    { id: 'KH-BBB33', name: 'Hương', phone: '0900000000', address: '', size: 'XL', revenue: 300000 },
  ]);
});

test('tạo tệp XLSX mở được bằng Excel', async () => {
  const buffer = await createCustomerWorkbook([{ id: 'KH-AAA22', name: 'Lan', phone: '0912345678', address: '12 Lê Lợi', size: 'M', revenue: 350000 }]);
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const ExcelJS = require('exceljs'), workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Khách hàng');
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['ID', 'Tên khách', 'Số ĐT', 'Địa chỉ', 'Size', 'Doanh thu từ khách hàng này']);
  assert.equal(sheet.getRow(2).getCell(6).value, 350000);
});
