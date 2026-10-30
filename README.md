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

## Khách hàng: mỗi khách một agent riêng
- **Khách nhắn đến thì tự có một agent**, kèm **mã định danh riêng** (dạng `KH-7F3K9`) chỉ bạn và agent đó biết. Khách nhắn lại thì đúng agent đó tự dậy với đầy đủ hồ sơ.
- **Che danh tính**: khi giao việc cho agent chuyên môn (tìm hàng, báo giá), tên và số điện thoại thật của khách được thay bằng mã.
- **Hồ sơ khách (`ho-so.md`)**: agent tự ghi sau mỗi lần xử lý; là trí nhớ dài hạn. Hội thoại quá dài thì app **làm mới có nhớ**: ghi đầy đủ hồ sơ rồi bắt đầu phiên mới, hồ sơ được nạp lại ở mỗi lượt.
- **Nhắc khách im lặng**: sau N phút (mặc định 10) không thấy khách trả lời, agent soạn tin nhắc để bạn duyệt và tự gửi. Nhắc tối đa M lần; khách đã chốt hoặc từ chối thì agent trả `[[DUNG_NHAC]]` để dừng.
- **Nhận tin khách**: dán tay (nút "＋ Tin khách") hoặc đọc hộp thư Messenger bằng Chrome đã đăng nhập (chỉ đọc; mở cuộc trò chuyện sẽ hiện "đã xem" với khách; chưa kiểm chứng với Messenger thật).
- **Doanh thu**: chỉ tính tiền **đã thu thật**. Agent chỉ ghi khi chính bạn báo "đã nhận tiền"; tin của khách không làm tăng doanh thu. Bạn cũng ghi/hủy tay ở nút "Doanh thu". Ba thẻ **Việc / Khách / Doanh thu** ở mục Hoạt động của văn phòng đọc từ đây.
- **An toàn**: tin của khách là dữ liệu không đáng tin. Agent chăm khách chỉ được ghi trong thư mục riêng của nó, không dùng web hay trình duyệt, không thể sửa sổ doanh thu.

## Chạy
```bash
npm install
npm run prepare:office   # dựng văn phòng một lần
npm start
```
Kiểm thử (không tốn tiền, dùng agent giả): `node --test tests/`.
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
