Nguồn: https://github.com/khanh020905/my-office (MIT, © 2026 khanh020905), commit 60dbe140d0ed24bc6f75f256226ea026f9622bf9.
Chép nguyên bản (bỏ thư mục docs/, tests/, .github/). Giấy phép: office/LICENSE. Dự án cộng đồng, không liên kết với Anthropic.

## Thay đổi cục bộ so với bản gốc
- `server/index.mjs`, nhánh `op === 'say'` của `/api/chat`: cho phép thêm `long` (tối đa 4000 ký tự), `tag: 'claude'` và `now`,
  để câu trả lời dài của các agent hiện đầy đủ trong nhóm chat. Chỉ gọi được từ máy này (loopback), như `say` gốc.
- `src/shared/chat-engine.js`: tin do chủ shop gõ/gửi ảnh trong nhóm chat mang thêm cờ `typed: true`. Văn phòng gốc cũng tự đăng
  lời nhắc của mỗi tác vụ Claude dưới tên "me"; cờ này giúp app phân biệt để các agent không tự giao việc cho nhau vô hạn.
- `server/index.mjs`: (1) `op: 'say'` nhận `from` là mã phiên Claude (sid); (2) tên agent đọc từ `agent-names.json` ({sid: tên}),
  để người trong văn phòng mang đúng tên chủ shop đặt thay vì tên thư mục.
- `src/office/ui/activity.js`, `src/i18n/locales/{vi,en}/activity.js`, `src/styles/sessions.css`: các thẻ chỉ số mục Hoạt động đổi thành
  ba thẻ bằng nhau: Việc (số agent đang làm), Khách (tổng số khách đã và đang chăm sóc), Doanh thu (VNĐ), đọc từ `/api/shop` mỗi 2,5 giây.
- `server/index.mjs`: thêm `GET /api/shop` (đọc `shop-stats.json` trong thư mục dữ liệu) và `op: 'sys'` của `/api/chat` (dòng thông báo hệ thống, chỉ từ máy này).
- `src/i18n/locales/vi/*.js`: Việt hóa lại thuật ngữ cho cửa hàng thời trang (Lệnh → Xử lý, Sửa file → Ghi chép, Đọc → Xem, Web → Tìm hàng,
  session/phiên → agent/ca làm, deploy → ra mắt, commit → chốt đơn, thư viện → phòng mẫu, phòng máy → kho hàng, giám đốc → chủ shop...).
- `src/components/office/TopBar.tsx`, `src/office/ui/activity.js`, `src/office/ui/embed.js`: nhãn "My Office" góc trái hiện tên cửa hàng (từ /api/shop); nút Cài đặt (bánh răng) mở cửa sổ Cài đặt của app khi được nhúng. Ghi công dự án gốc nằm ở Cài đặt > Giới thiệu và NOTICE.md.
- `src/office/ui/wrapped.js`, `src/i18n/locales/{vi,en}/wrapped.js`: thẻ Tổng kết tuần có ba thẻ bằng nhau Việc / Khách / Doanh thu trong 7 ngày (khách và doanh thu đọc từ `/api/shop`, trường `week`), nhãn góc trái là tên cửa hàng.
- `server/index.mjs` (biến môi trường `OFFICE_ONLY_AGENTS=1`, app đặt sẵn): văn phòng chỉ hiện các phiên là agent của app (có trong `agent-names.json`), bỏ qua mọi phiên Claude khác trên máy; `src/styles/places.css`: ẩn nhãn nhóm `.team-tag`.
- `src/office/ui/group-chat-view.js`, `group-chat.js`, `src/styles/group-chat.css`, `src/i18n/locales/{vi,en}/chat.js`: nút ảnh trong khung chat chọn ảnh từ tệp trên máy (thay vì chụp văn phòng); kéo thả hoặc dán ảnh vào khung chat chỉ xếp ảnh chờ (có hình thu nhỏ, bỏ được), chỉ gửi khi đã nhập lệnh và bấm Gửi (ảnh đi trước, rồi tới lệnh có @ agent). Ảnh được nén JPEG dưới giới hạn 500 KB của máy chủ.
- `server/index.mjs` (khi `OFFICE_ONLY_AGENTS=1`), `src/shared/chat-engine.js`: agent của app luôn có chỗ ngồi (đồng bộ từ `agent-names.json` mỗi 2 giây, xoá agent thì rời lặng lẽ), hết việc thì ngồi chơi chứ không bị gỡ; bỏ qua `SessionEnd` và lần gỡ sau 10 phút; không có tin "thêm vào nhóm"/"rời nhóm" (`ctx.quiet`). `src/office/ui/group-chat-view.js`: gợi ý @ khớp theo chữ đang gõ (không phân biệt dấu, cho phép khoảng trắng); nút ghim giấy đính kèm tệp, `POST /api/attach` lưu tệp vào `office/attach/`.
- `src/office/ui/group-chat-view.js`: bỏ khung hỏi "Giao việc này cho …?" sau khi gõ @ agent (gõ @ là giao việc luôn).
- `src/shared/chat-engine.js`: trong app (`ctx.quiet`), sự kiện `prompt` không còn đăng lại lời nhắc của agent dưới tên chủ shop (tin hiện hai lần) và không có tin "ack" tự động.
- `src/office/ui/activity.js`: bấm chuột phải vào một agent trong cột trái (khi nhúng trong app) gửi `{tbo:"rename-agent"}` cho app để hiện hộp đổi tên.
- `src/office/interact/place-cards.js`: bấm vào tên lửa / bệ phóng không còn mở bảng "Bệ phóng · Ra mắt" mà phóng tên lửa luôn.
- `ActivityPanel.tsx`, `activity.js`, `activity.css`: nút "Cần chú ý" bỏ chấm đỏ; cả nút chuyển đỏ (class `urgent`) chỉ khi có thông báo khẩn cấp trong 1 giờ qua.
- `people/hr.js`, `shared/chat-engine.js`, `ui/group-chat.js`, `ui/group-chat-view.js`: bỏ chị HR (mô hình 3D luôn ẩn, không nhắc họp/trà, không có trong danh sách thành viên và không nhắn trong chat); bàn và máy chấm công giữ nguyên.
- `ui/activity.js` (`applyChatName`), `ui/group-chat-view.js`: tên khung chat do chủ shop đặt (chuột phải hoặc bấm đúp vào tên khung chat); app lưu `chatName` vào shop-stats.json, văn phòng đọc ở /api/shop và đổi cả tên nút Nhóm chat.
- `src/office/ui/activity.js`, `src/styles/sessions.css`: nút ✕ xóa agent hiện khi rê chuột vào agent trong cột trái (khi nhúng trong app), gửi `{tbo:"delete-agent"}` cho app; app hỏi xác nhận rồi xóa.
