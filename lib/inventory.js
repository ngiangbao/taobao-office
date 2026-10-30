// Dữ liệu kho chỉ được đọc qua Google Sheets API, không ghi ngược lên bảng tính.
const fold = (s) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim();
function parseInventory(rows, lowStock = 5) {
  if (!rows.length) throw new Error('Trang tính kho chưa có hàng tiêu đề.');
  const headers = rows[0].map(fold);
  const column = (names) => headers.findIndex((h) => names.includes(h));
  const sku = column(['ma hang', 'sku', 'ma san pham']);
  const name = column(['ten hang', 'ten san pham', 'san pham']);
  const qty = column(['ton kho', 'so luong', 'ton']);
  const size = column(['size', 'co']), color = column(['mau', 'mau sac']);
  if (sku < 0 || name < 0 || qty < 0) throw new Error('Cần các cột: Mã hàng, Tên hàng, Tồn kho. Có thể thêm Size và Màu.');
  const items = [], keys = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((v) => String(v ?? '').trim())) continue;
    const quantity = Number(row[qty]);
    if (!String(row[sku] || '').trim() || !String(row[name] || '').trim() || row[qty] == null || String(row[qty]).trim() === '' || !Number.isSafeInteger(quantity) || quantity < 0) throw new Error(`Dòng ${i + 1}: cần mã, tên và tồn kho là số nguyên không âm.`);
    const item = { sku: String(row[sku]).trim(), name: String(row[name]).trim(), size: String(row[size] || ''), color: String(row[color] || ''), quantity };
    const key = JSON.stringify([item.sku, item.size, item.color].map(fold));
    if (keys.has(key)) throw new Error(`Dòng ${i + 1}: trùng mã hàng, size và màu.`);
    keys.add(key); items.push(item);
  }
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Tổng tồn kho vượt giới hạn số lượng.');
  return { items, total, outOfStock: items.filter((i) => i.quantity === 0), lowStock: items.filter((i) => i.quantity > 0 && i.quantity <= lowStock) };
}
async function readInventory(google, cfg) {
  if (!cfg.inventorySheetUrl) throw new Error('Chưa kết nối kho hàng. Mở Cài đặt → Kho hàng để nhập link Google Sheets.');
  const rows = await google.readInventory({ sheetUrl: cfg.inventorySheetUrl, tab: cfg.inventoryTab || 'Kho hàng' });
  const threshold = Number(cfg.inventoryLowStock ?? 5);
  if (!Number.isSafeInteger(threshold) || threshold < 0) throw new Error('Ngưỡng sắp hết phải là số nguyên không âm.');
  return { ...parseInventory(rows, threshold), threshold, fetchedAt: new Date().toISOString() };
}
module.exports = { parseInventory, readInventory };
