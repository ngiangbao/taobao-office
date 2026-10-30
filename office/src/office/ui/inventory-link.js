// Taobao Office: bấm "Kho hàng" (trên bản đồ, ở thanh góc nhìn, hay màn hình kho) thì app mở bảng Google Sheets kho hàng của shop.
// Khi không nhúng trong app thì giữ cách cũ (mở bảng máy).
import { openMac } from './mac-drawer.js';
export function openInventory() {
  if (typeof window !== 'undefined' && window.parent !== window) window.parent.postMessage({ tbo: 'open-inventory' }, '*');
  else openMac();
}
