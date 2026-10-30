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

// Chế độ "điều khiển Chrome đầy đủ" (chủ shop tự bật trong Cài đặt): agent thường được bấm, gõ, nhấn phím, điền biểu mẫu, chọn mục, tải tệp, xử lý hộp thoại.
// Vẫn CẤM chạy mã tuỳ ý trong trang (evaluate, run_code_unsafe) và đọc/ghi mạng. Chỉ áp dụng cho agent thường, không cho agent quét bảng tin, đọc hộp thư, khách, kho.
const FULL_EXTRA = names(['browser_click', 'browser_type', 'browser_fill_form', 'browser_select_option', 'browser_file_upload', 'browser_handle_dialog', 'browser_drag', 'browser_drop']);
const STILL_DENIED = names(['browser_evaluate', 'browser_run_code_unsafe', 'browser_network_requests', 'browser_network_request', 'browser_emulate_media']);
// Chế độ "Extension Claude in Chrome": agent điều khiển Chrome thật của chủ shop (đã đăng nhập sẵn) qua extension Claude, không cần Chrome riêng của app.
// Cấm chạy mã tuỳ ý trong trang (javascript_tool), đọc mạng và chạy phím tắt đã lưu. "computer" là công cụ bấm/gõ/cuộn/chụp: chỉ có khi chế độ đầy đủ hoặc người đăng.
const CIC = 'mcp__claude-in-chrome__';
const CIC_READ = ['navigate', 'read_page', 'get_page_text', 'find', 'tabs_context_mcp', 'tabs_create_mcp', 'tabs_close_mcp', 'list_connected_browsers', 'select_browser', 'switch_browser', 'resize_window', 'read_console_messages'].map((n) => CIC + n);
const CIC_WRITE = ['computer', 'form_input', 'file_upload', 'browser_batch'].map((n) => CIC + n);
const CIC_DENIED = ['javascript_tool', 'read_network_requests', 'shortcuts_execute', 'shortcuts_list', 'gif_creator'].map((n) => CIC + n);
/** kind: 'team' | 'reader' | 'publisher' | 'customer'; scroll: lớp chặn phím đã chạy được thì mới cho phím cuộn; full: chế độ điều khiển Chrome đầy đủ */
function policy(kind, { scroll = false, full = false, ext = false } = {}) {
  if (ext && (kind === 'team' || kind === 'publisher')) {
    if (kind === 'publisher') return { allowed: [...CIC_READ, ...CIC_WRITE, 'Read'], denied: [...NEVER, ...CIC_DENIED, 'mcp__playwright'] };
    return full ? { allowed: [...CIC_READ, ...CIC_WRITE, ...FILES], denied: [...NEVER, ...CIC_DENIED, 'mcp__playwright'] }
      : { allowed: [...CIC_READ, ...FILES], denied: [...NEVER, ...CIC_DENIED, ...CIC_WRITE, 'mcp__playwright'] };
  }
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
    default:
      if (full) return { allowed: [...READ, SCROLL, ...FULL_EXTRA, ...FILES], denied: [...NEVER, ...STILL_DENIED] };
      return { allowed: [...read, ...FILES], denied: [...NEVER, ...WRITE, ...noScroll] };
  }
}
module.exports = { CIC_READ, CIC_WRITE, CIC_DENIED, FULL_EXTRA, policy, READ, WRITE, SCROLL, P };
