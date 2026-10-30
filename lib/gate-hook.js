// Hook PreToolUse của Claude Code: chỉ cho phím CUỘN TRANG qua browser_press_key (Enter/Tab/... có thể gửi bài nên bị chặn).
// Chạy bằng Electron ở chế độ Node. Lượt "người đăng" (đã được chủ shop duyệt) đặt TBO_PUBLISHER=1 nên không bị chặn.
// Thoát với mã 2 = chặn; stderr được trả cho agent.
const SCROLL_KEYS = /^(PageDown|PageUp|End|Home|ArrowDown|ArrowUp)$/;
let raw = '';
process.stdin.on('data', (c) => (raw += c)).on('end', () => {
  if (process.env.TBO_PUBLISHER === '1' || process.env.TBO_BROWSER_FULL === '1') process.exit(0); // người đăng đã được duyệt, hoặc chủ shop đã bật điều khiển Chrome đầy đủ
  let j = {};
  try { j = JSON.parse(raw); } catch { /* không đọc được: coi như không phải phím */ }
  if (String(j.tool_name || '').endsWith('browser_press_key')) {
    const key = String(j.tool_input?.key ?? '');
    if (!SCROLL_KEYS.test(key)) {
      process.stderr.write('Bị chặn: chỉ được dùng phím cuộn trang (PageDown, PageUp, End, Home, ArrowDown, ArrowUp). Muốn đăng hoặc gửi, hãy tạo đề xuất bằng khối [[DE_XUAT]] để chủ shop duyệt.');
      process.exit(2);
    }
  }
  process.exit(0);
});
