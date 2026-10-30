# Taobao Office

Ứng dụng desktop (Windows / macOS / Linux) cho shop order Taobao: chat với Claude, Claude điều khiển trình duyệt
để báo giá, soạn bài đăng nhóm và tìm khách cần mua. Bên cạnh khung chat là văn phòng 3D nhỏ cho thấy Claude đang làm gì.

## Cách hoạt động
- Mỗi tin nhắn được gửi vào **Claude Code chạy nền** (`claude -p`, nối tiếp phiên bằng `--resume`) bằng bản `claude`
  đã đăng nhập sẵn trên máy bạn. App không giữ mật khẩu hay token nào.
- Trình duyệt: Chrome riêng của app (Playwright MCP, hồ sơ lưu trong thư mục dữ liệu, đăng nhập Facebook/Taobao một lần)
  hoặc tiện ích Claude in Chrome (chọn trong Cài đặt).
- Claude **chỉ soạn nháp**; đăng/comment khi bạn bấm "Duyệt" (bằng lời nhắc hệ thống, không phải khóa kỹ thuật).
- Nhật ký đăng bài: `nhat-ky.md` trong thư mục dữ liệu (nút "Nhật ký").

## Chạy
```bash
npm install
npm run vendor      # chép three.js vào renderer/vendor
npm start
```
Đóng gói: `npm run dist:linux` / `dist:win` (chạy trên Windows) / `dist:mac` (chạy trên macOS).

Yêu cầu: Node 20+, Claude Code đã cài và đăng nhập, Chrome/Chromium cho Playwright.

## Nâng cấp văn phòng
Văn phòng nằm trọn trong `renderer/office.js` và chỉ lộ ra `act(station)` / `idle()`. Có thể thay bằng bản khác
(ví dụ lấy cảm hứng từ [my-office](https://github.com/khanh020905/my-office), giấy phép MIT) mà không đụng phần còn lại.
