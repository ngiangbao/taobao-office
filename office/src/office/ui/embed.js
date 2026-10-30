// Taobao Office: khi văn phòng được nhúng trong app:
//  1) nút Cài đặt (bánh răng, cạnh nút Xem lại) mở cửa sổ Cài đặt của app thay cho bảng nhỏ của văn phòng;
//  2) văn phòng tự MÔ TẢ các tùy chọn của bảng cài đặt gốc cho cửa sổ đó, và nhận lệnh bấm lại từ cửa sổ đó.
//     Nhờ vậy các tùy chọn của văn phòng hiện thẳng trong mục "Văn phòng 3D" của app, mà vẫn dùng đúng nút và logic của văn phòng.
// Giao thức (postMessage giữa app và khung văn phòng): office-get → office-state { groups }; office-apply { sel } → office-state;
// office-ready (văn phòng vừa tải xong, ví dụ sau khi đổi ngôn ngữ).
if (typeof window !== 'undefined' && window.parent !== window) {
  let bypass = false;
  const toParent = (m) => window.parent.postMessage(m, '*');
  const hook = () => {
    const b = document.getElementById('btn-look');
    if (!b) return false;
    b.addEventListener('click', (e) => {
      if (bypass) return;
      e.stopImmediatePropagation(); e.preventDefault();
      toParent({ tbo: 'open-settings' });
    }, true);
    return true;
  };

  const ATTRS = ['data-layout', 'data-scene', 'data-time', 'data-wx', 'data-look', 'data-quality', 'data-lang', 'data-tgl'];
  const selOf = (b) => { for (const a of ATTRS) if (b.hasAttribute(a)) return `[${a}="${b.getAttribute(a)}"]`; return b.id === 'btn-tips' ? '#btn-tips' : null; };
  const SAFE_SEL = /^(\[data-(layout|scene|time|wx|look|quality|lang|tgl)="[^"]*"\]|#btn-tips)$/;
  const txt = (el) => (el?.textContent || '').trim();
  function describe() {
    const groups = [];
    for (const panel of document.querySelectorAll('#pop-look [data-st-panel]')) {
      const tab = panel.getAttribute('data-st-panel'), tabLabel = txt(document.getElementById('st-tab-' + tab));
      let heading = '';
      for (const node of panel.querySelectorAll('h3, .st-cards, .wx-chips, .pop-toggles, .pop-acts')) {
        if (node.tagName === 'H3') { heading = txt(node); continue; }
        const kind = node.classList.contains('pop-toggles') ? 'toggle' : node.classList.contains('pop-acts') ? 'action' : 'choice';
        const items = [];
        for (const b of node.querySelectorAll('button')) {
          const sel = selOf(b); if (!sel || b.hidden) continue;
          items.push({
            sel, label: (kind === 'toggle' ? txt(b.querySelector('span')) : txt(b.querySelector('b, .lbl'))) || txt(b), sub: txt(b.querySelector('small')),
            img: b.querySelector('img')?.src || '', pressed: b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true',
          });
        }
        if (items.length) groups.push({ tab, tabLabel, heading, kind, items });
      }
    }
    return groups;
  }
  const sendState = () => toParent({ tbo: 'office-state', groups: describe() });

  const start = () => {
    if (!hook()) { let n = 0; const t = setInterval(() => { if (hook() || ++n > 50) clearInterval(t); }, 200); }
    let n = 0; const r = setInterval(() => { if (document.querySelector('#pop-look [data-st-panel] button') || ++n > 50) { clearInterval(r); setTimeout(() => toParent({ tbo: 'office-ready' }), 800); } }, 200);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.addEventListener('message', (ev) => {
    if (ev.source !== window.parent) return;
    const d = ev.data || {};
    if (d.tbo === 'office-get') sendState();
    else if (d.tbo === 'office-apply' && SAFE_SEL.test(String(d.sel))) { // chỉ nhận đúng các nút của bảng cài đặt gốc
      const b = document.querySelector('#pop-look ' + d.sel);
      if (b) { bypass = true; try { b.click(); } finally { bypass = false; } setTimeout(sendState, 350); }
    }
  });
}
