# Khung đồng bộ KiotViet

Đồng bộ **một chiều**: KiotViet → app (app không ghi ngược lên KiotViet). Khách và đơn nằm trên máy, không đưa cho agent.

## Các phần

| Phần | Tệp | Việc |
|---|---|---|
| Kết nối, phân trang, điều phối | `lib/kiotviet.js` | Lấy token (`id.kiotviet.vn`), gọi `public.kiotapi.com` kèm header `Retailer`, lấy mọi bản ghi đổi từ `lastModifiedFrom`, gọi ánh xạ rồi ghi vào kho khách/đơn |
| **Ánh xạ dữ liệu (chỉnh ở đây)** | `lib/kiotviet-map.js` | `mapCustomer`, `mapDocCustomer`, `mapDocRows`, `orderStatus`, `codeOf`, danh sách nguồn `SOURCES` |
| Ghi khách | `lib/customers.js` → `upsertExternal` | Tạo khách nếu chưa có (không tạo agent); có rồi thì cập nhật SĐT, địa chỉ, và tên nếu chủ shop chưa tự đổi |
| Ghi đơn | `lib/orders.js` → `replaceExt(prefix, rows)` | Thay đúng các dòng của một hóa đơn (khoá ngoài `ext` = `kvi:<id>:<số dòng>`) |
| Điểm nối với app | `main.js` (khối KiotViet, kênh IPC `kiotviet:*`) | Lưu mã API (secret mã hóa bằng kho khóa hệ điều hành), đồng bộ tay, hẹn giờ, mốc `kiotvietCursor` |
| Giao diện | Cài đặt → "Đồng bộ KiotViet" | Nhập Retailer, Client ID, Client Secret, chu kỳ; chọn lấy khách+đơn và/hoặc kho hàng; nút Lưu và kiểm tra / Đồng bộ ngay / Tải lại toàn bộ / Xem kho hàng |
| Kho hàng từ KiotViet | `kiotviet.products()` + `mapProduct` + `readInventory(..., { loader })` | Khi bật "Kho hàng", mỗi lần xem kho hoặc gọi @Kho hàng, app đọc `/products?includeInventory=true`; ảnh đầu tiên của sản phẩm tải một lần vào `kiotviet-img/` rồi dùng lại. Thứ tự ưu tiên nguồn kho: file Excel đã nhập > KiotViet > link Google Sheets |
| Kiểm thử | `tests/kiotviet.test.js` | API giả: thêm, sửa, huỷ hóa đơn; tên chủ shop đặt được giữ |

## Luồng một lượt đồng bộ

1. Mốc `since` = `kiotvietCursor` (lùi 2 phút so với lần trước; rỗng = lần đầu, lấy tất cả).
2. `/customers?lastModifiedFrom=since` → `mapCustomer` → `customers.upsertExternal`.
3. Với từng nguồn trong `SOURCES.documents` (`/invoices`, `/orders`): `mapDocCustomer` (khách trong đơn) và `mapDocRows` → `orders.replaceExt("<tag>:<id>:", rows)`.
4. Lưu mốc mới, làm mới danh sách khách.

## Muốn chỉnh gì thì sửa đâu

- **Đổi cách đặt mã khách** → `codeOf` (cẩn thận: đổi mã là coi như khách khác).
- **Đổi trạng thái đơn** (ví dụ "đang giao" → "Đã đặt hàng") → `orderStatus`.
- **Thêm cột vào dòng đơn** (màu, size, link…) → `mapDocRows` (thêm khoá vào mỗi dòng; các khoá hợp lệ xem `HEAD`/`TEXT_KEYS` trong `lib/orders.js`).
- **Đổi cách đọc sản phẩm** (gộp biến thể, thêm trường, chọn ảnh khác, chỉ lấy một chi nhánh để tính tồn) → `mapProduct`.
- **Kéo thêm nguồn** (trả hàng, sản phẩm…) → thêm một mục vào `SOURCES.documents` (hoặc viết thêm bước trong `sync`).
- **Chu kỳ, mốc** → `kiotvietMinutes`, `kiotvietCursor` trong cấu hình (có sẵn trong giao diện).

## Chưa làm / lưu ý

- Chưa thử với tài khoản KiotViet thật: các tên trường (`code`, `customerCode`, `invoiceDetails`, `status`…) theo tài liệu Public API; nếu khác, chỉ cần chỉnh `kiotviet-map.js`.
- Chưa có webhook (KiotViet gọi về app): app máy tính không có địa chỉ công khai, nên dùng hỏi định kỳ.
- Hóa đơn bị xoá hẳn khỏi KiotViet (không phải huỷ) thì dòng đơn trong app vẫn còn.
- Chưa ghi ngược (app → KiotViet). Mẫu mới do agent "Tìm hàng" thêm vẫn lưu riêng trên máy (xếp cuối nhóm hàng), chưa đẩy lên KiotViet; kho lấy từ KiotViet cũng chưa xuất Excel theo định dạng bảng.
- Mỗi lần đọc kho KiotViet gọi API lại toàn bộ sản phẩm (phân trang 100/lần); gian hàng rất lớn có thể chậm.
