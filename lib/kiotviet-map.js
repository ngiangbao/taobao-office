// Ánh xạ dữ liệu KiotViet -> dữ liệu của app. ĐÂY LÀ NƠI CHỈNH khi muốn đổi cách đồng bộ: mỗi hàm thuần (không gọi mạng, không ghi dữ liệu),
// nhận một bản ghi thô của KiotViet và trả về bản ghi của app. Muốn kéo thêm nguồn (ví dụ phiếu trả hàng) thì thêm vào SOURCES.
const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Mã khách trong app = "KV-" + mã khách KiotViet (giữ cố định để các lần đồng bộ sau khớp đúng khách). */
const codeOf = (kvCode) => `KV-${String(kvCode || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')}`.slice(0, 24);

const isCancelled = (d) => Number(d.status) === 2 || /hủy|huỷ|huy|cancel/i.test(String(d.statusValue || ''));
const isDone = (d) => Number(d.status) === 1 || /hoàn thành|hoan thanh|đã giao|da giao|completed/i.test(String(d.statusValue || ''));
/** Trạng thái đơn của app (Đã đặt hàng | Đã về | Đã giao | Đã huỷ) từ trạng thái hóa đơn/đơn đặt hàng KiotViet. */
const orderStatus = (doc) => (isCancelled(doc) ? 'Đã huỷ' : isDone(doc) ? 'Đã giao' : 'Đã đặt hàng');

/** Khách KiotViet -> tham số của customers.upsertExternal (null = bỏ qua bản ghi). */
function mapCustomer(kv) {
  if (!kv?.code) return null;
  return { code: codeOf(kv.code), name: clean(kv.name, 40) || 'Khách', phone: clean(kv.contactNumber, 30), address: clean(kv.address, 200), key: `kv:${kv.code}`, createdAt: Date.parse(kv.createdDate) || Date.now() };
}

/** Khách nằm trong hóa đơn/đơn đặt hàng (nếu chưa có trong danh sách khách thì tạo): null nếu là khách lẻ. */
function mapDocCustomer(doc) {
  if (!doc?.customerCode) return null;
  return { code: codeOf(doc.customerCode), name: clean(doc.customerName, 40) || 'Khách', key: `kv:${doc.customerCode}`, createdAt: Date.parse(doc.createdDate) || Date.now() };
}

/** Hóa đơn/đơn đặt hàng -> các dòng đơn của app (mỗi mặt hàng một dòng). tag: tiền tố khoá ngoài (kvi hoặc kvo). Khoá ext phải ổn định. */
function mapDocRows(tag, doc, detailKey) {
  const code = doc.customerCode ? codeOf(doc.customerCode) : '', name = clean(doc.customerName, 40), status = orderStatus(doc);
  return (doc[detailKey] || []).map((d, i) => ({
    ext: `${tag}:${doc.id}:${i}`, custId: code, fbName: name || 'Khách lẻ', sku: clean(d.productCode, 40), qty: d.quantity, price: d.price,
    status, note: clean(`${d.productName || ''}${doc.code ? ` · ${doc.code}` : ''}`, 400), at: Date.parse(doc.createdDate) || Date.now(),
  }));
}

/** Các nguồn dữ liệu kéo về. optional: gian hàng không dùng thì bỏ qua lỗi thay vì dừng cả lượt. */
const SOURCES = {
  customers: { path: '/customers' },
  documents: [
    { tag: 'kvi', path: '/invoices', detailKey: 'invoiceDetails', stat: 'invoices', optional: false }, // hóa đơn bán hàng
    { tag: 'kvo', path: '/orders', detailKey: 'orderDetails', stat: 'orders', optional: true },        // đơn đặt hàng
  ],
};

module.exports = { clean, codeOf, orderStatus, mapCustomer, mapDocCustomer, mapDocRows, SOURCES };
