Nguồn: https://github.com/khanh020905/my-office (MIT, © 2026 khanh020905), commit 60dbe140d0ed24bc6f75f256226ea026f9622bf9.
Chép nguyên bản (bỏ thư mục docs/, tests/, .github/). Giấy phép: office/LICENSE. Dự án cộng đồng, không liên kết với Anthropic.

## Thay đổi cục bộ so với bản gốc
- `server/index.mjs`, nhánh `op === 'say'` của `/api/chat`: cho phép thêm `long` (tối đa 4000 ký tự), `tag: 'claude'` và `now`,
  để câu trả lời dài của các agent hiện đầy đủ trong nhóm chat. Chỉ gọi được từ máy này (loopback), như `say` gốc.
- `src/shared/chat-engine.js`: tin do chủ shop gõ/gửi ảnh trong nhóm chat mang thêm cờ `typed: true`. Văn phòng gốc cũng tự đăng
  lời nhắc của mỗi tác vụ Claude dưới tên "me"; cờ này giúp app phân biệt để các agent không tự giao việc cho nhau vô hạn.
- `server/index.mjs`: (1) `op: 'say'` nhận `from` là mã phiên Claude (sid); (2) tên agent đọc từ `agent-names.json` ({sid: tên}),
  để người trong văn phòng mang đúng tên chủ shop đặt thay vì tên thư mục.
