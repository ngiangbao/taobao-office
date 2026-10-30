# Taobao Office

Ứng dụng desktop (Windows / macOS / Linux) cho shop order Taobao: chat với Claude, Claude điều khiển trình duyệt
để báo giá, soạn bài đăng nhóm và tìm khách cần mua. Bên cạnh khung chat là văn phòng 3D (của dự án My Office) cho thấy Claude đang làm gì.

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
(cd office && npm ci && npx next build)   # dựng văn phòng một lần
npm start
```
Đóng gói: `npm run dist:linux` / `dist:win` (chạy trên Windows) / `dist:mac` (chạy trên macOS).

Yêu cầu: Node 20+, Claude Code đã cài và đăng nhập, Chrome/Chromium cho Playwright.

## Ghi công tác giả giao diện

Văn phòng 3D là dự án **[My Office](https://github.com/khanh020905/my-office)** của **[khanh020905](https://github.com/khanh020905)**
(giấy phép MIT), được chép nguyên bản vào thư mục [`office/`](office/) và chạy như một server cục bộ trong app.
Mọi công sức thiết kế nhân vật, bản đồ và hoạt ảnh thuộc về tác giả gốc, xem [NOTICE.md](NOTICE.md). Nếu bạn thích giao diện này,
hãy ghé repo gốc và tặng sao cho họ.

Sự kiện thật của Claude (đọc file, tìm kiếm, mở trình duyệt...) được gửi vào văn phòng qua hook của Claude Code
(`--settings`), nên nhân vật làm đúng việc Claude đang làm. Lưu ý: văn phòng cũng hiện các phiên Claude Code khác đang
chạy trên máy bạn.

Cập nhật văn phòng: thay thư mục `office/` bằng bản mới của my-office rồi chạy lại `npm run dist:*`.
