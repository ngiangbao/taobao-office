// Bảng quyền công cụ cho từng loại lượt chạy. Đây là LỚP CHẶN KỸ THUẬT của hàng chờ duyệt:
// agent thường không có công cụ nào bấm/gõ/gửi trên trình duyệt (công cụ bị cấm bằng --disallowedTools, thắng cả cấu hình
// "cho phép tất cả" trong ~/.claude của người dùng). Chỉ lượt "người đăng" chạy SAU KHI chủ shop duyệt mới có quyền ghi.
const P = 'mcp__playwright__';
const names = (a) => a.map((n) => P + n);

// Chỉ xem và điều hướng
const READ = names(['browser_snapshot', 'browser_take_screenshot', 'browser_find', 'browser_wait_for', 'browser_console_messages',
  'browser_navigate', 'browser_navigate_back', 'browser_tabs', 'browser_resize', 'browser_hover', 'browser_close']);
const SCROLL = P + 'browser_press_key'; // cuộn trang bằng phím: chỉ khi lớp chặn phím (gate-hook) đã kiểm chứng chạy được
// Có thể bấm/gõ/gửi hoặc chạy mã tuỳ ý
const WRITE = names(['browser_click', 'browser_type', 'browser_fill_form', 'browser_file_upload', 'browser_drop', 'browser_drag',
  'browser_select_option', 'browser_handle_dialog', 'browser_evaluate', 'browser_run_code_unsafe', 'browser_emulate_media',
  'browser_network_requests', 'browser_network_request']);
const FILES = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit'];
const NEVER = ['Bash']; // không agent nào của app cần chạy lệnh

/** kind: 'team' | 'reader' | 'publisher' | 'customer'; scroll: lớp chặn phím đã chạy được thì mới cho phím cuộn */
function policy(kind, { scroll = false } = {}) {
  const read = scroll ? [...READ, SCROLL] : READ;
  const noScroll = scroll ? [] : [SCROLL];
  switch (kind) {
    case 'inventory': return { allowed: ['Read'], denied: [...NEVER, 'Write', 'Edit', 'WebSearch', 'WebFetch', 'mcp__playwright'] };
    case 'assistant': return { allowed: ['Read', 'Write', 'Edit'], denied: [...NEVER, 'WebSearch', 'WebFetch', 'mcp__playwright'] };
    case 'scanner': { // quét bảng tin: chỉ xem, điều hướng, cuộn; không bấm/gõ, không ghi tệp, không web ngoài
      return { allowed: [...read, 'Read'], denied: [...NEVER, ...WRITE, 'Write', 'Edit', 'WebSearch', 'WebFetch', ...noScroll] };
    }
    case 'publisher': return { allowed: ['mcp__playwright', 'Read'], denied: [...NEVER] };
    case 'customer': return { allowed: ['Write', 'Edit'], denied: [...NEVER, 'mcp__playwright'] };
    case 'reader': { // đọc hộp thư: được bấm để mở cuộc trò chuyện, không được gõ/gửi/chạy mã
      const click = P + 'browser_click';
      return { allowed: [...read, click], denied: [...NEVER, ...WRITE.filter((t) => t !== click), ...noScroll] };
    }
    default: return { allowed: [...read, ...FILES], denied: [...NEVER, ...WRITE, ...noScroll] };
  }
}
module.exports = { policy, READ, WRITE, SCROLL, P };
