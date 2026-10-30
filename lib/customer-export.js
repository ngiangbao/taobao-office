const { fold } = require('./customers');

function profileValue(profile, label, separator = null) {
  for (const rawLine of String(profile || '').split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*+]\s*)/, '').replace(/\*\*/g, '').trim();
    const match = line.match(label);
    if (!match) continue;
    const value = match[1].trim().replace(/[`*_]/g, '');
    return separator ? value.split(separator)[0].trim() : value;
  }
  return '';
}

function buildCustomerRows(customers, revenueItems, profileFor = () => '') {
  const revenueByCode = new Map(), revenueByName = new Map();
  for (const item of revenueItems) {
    if (item.code) revenueByCode.set(item.code, (revenueByCode.get(item.code) || 0) + item.amount);
    else if (item.name) {
      const key = fold(item.name);
      revenueByName.set(key, (revenueByName.get(key) || 0) + item.amount);
    }
  }

  return customers.map((customer) => {
    const profile = profileFor(customer);
    const phone = profileValue(profile, /(?:số\s*điện\s*thoại|số\s*đt|sđt|điện\s*thoại|phone)\s*[:：-]?\s*(.+)$/i, /[,;|]/);
    const address = profileValue(profile, /(?:địa\s*chỉ(?:\s*nhận\s*hàng)?|address)\s*[:：-]?\s*(.+)$/i);
    const size = profileValue(profile, /(?:size|cỡ|kích\s*cỡ)\s*[:：-]?\s*(.+)$/i, /[,;|]/);
    return {
      id: customer.code || '',
      name: customer.name || '',
      phone: customer.phone || phone,
      address: customer.address || address,
      size: customer.size || size,
      revenue: revenueByCode.get(customer.code) || revenueByName.get(fold(customer.name)) || 0,
    };
  });
}

async function createCustomerWorkbook(rows) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Khách hàng');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Tên khách', key: 'name', width: 28 },
    { header: 'Số ĐT', key: 'phone', width: 20 },
    { header: 'Địa chỉ', key: 'address', width: 42 },
    { header: 'Size', key: 'size', width: 16 },
    { header: 'Doanh thu từ khách hàng này', key: 'revenue', width: 30, style: { numFmt: '#,##0 "₫"' } },
  ];
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = 'A1:F1';
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return workbook.xlsx.writeBuffer();
}

module.exports = { buildCustomerRows, createCustomerWorkbook };
