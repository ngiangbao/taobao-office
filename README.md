# Taobao Office

Ứng dụng desktop (Windows / macOS / Linux) cho shop order Taobao: chat với Claude, Claude điều khiển trình duyệt
để báo giá, soạn bài đăng nhóm và tìm khách cần mua. Bên cạnh khung chat là văn phòng 3D (của dự án My Office) cho thấy Claude đang làm gì.

## Cách hoạt động
- **Chỉ một khung chat: nhóm chat của văn phòng.** Bạn gõ vào đó (hoặc gửi ảnh), app đọc tin và giao cho đúng agent. Gọi đích danh bằng `@Tên`.
- **Mỗi agent là một "người" riêng**: một phiên Claude Code riêng (`claude -p`, nối tiếp bằng `--resume`) với hội thoại, ngữ cảnh và tên riêng.
  Bấm "＋ Thêm agent" để đặt tên và chọn vai trò. Có sẵn: Chăm sóc khách, Tìm hàng, Báo giá, Đăng bài, Tìm khách.
- **Agent giao việc cho nhau**: ví dụ Chăm sóc khách → Tìm hàng (kèm ảnh khách) → Báo giá → quay lại Chăm sóc khách với giá cuối.
  Agent ghi khối `[[GIAO @Tên]] … [[/GIAO]]` cuối câu trả lời, app chuyển việc (tối đa 8 bước mỗi chuỗi để không lặp vô hạn).
- **Dùng bản `claude` đã đăng nhập sẵn trên máy bạn**; app không giữ mật khẩu hay token nào. Mọi câu trả lời đều bằng tiếng Việt.
- **Trình duyệt dùng chung**: một cửa sổ Chrome (đăng nhập Facebook/Taobao một lần bằng nút "Đăng nhập FB/Taobao"), mỗi agent mở tab riêng.
- **Duyệt trước khi đăng**: agent chỉ soạn nháp; đăng/comment khi bạn trả lời "duyệt" (bằng lời nhắc hệ thống, chưa phải khóa kỹ thuật).
- **Lịch sử chat lưu mãi mãi** trên máy (`history/YYYY-MM.jsonl`), xem và tìm kiếm bằng nút "Lịch sử".
- **Tự cập nhật** từ GitHub Releases (Windows, Linux AppImage). macOS chưa ký nên phải cập nhật tay.

## Chạy
```bash
npm install
npm run prepare:office   # dựng văn phòng một lần
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
