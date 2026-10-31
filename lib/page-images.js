// Lấy link ảnh trong trang sản phẩm Taobao/1688 qua Chrome riêng của app (cổng CDP), dùng đúng phiên đã đăng nhập của chủ shop.
// Chỉ ĐỌC trang: mở tab mới, chạy một đoạn mã cố định của app (không phải mã do agent hay trang web đưa), rồi đóng tab.
const HOST_OK = /(^|\.)(taobao\.com|tmall\.com|1688\.com)$/i;
const SCRIPT = `(() => {
  const out = new Set(), add = (u) => { if (u && typeof u === 'string') { try { out.add(new URL(u, location.href).href); } catch {} } };
  document.querySelectorAll('img').forEach((i) => { if ((i.naturalWidth || 0) >= 200 || !i.complete) { add(i.currentSrc || i.src); add(i.getAttribute('data-src')); add(i.getAttribute('data-lazyload')); add(i.getAttribute('data-original')); } });
  document.querySelectorAll('meta[property="og:image"],link[rel="image_src"]').forEach((m) => add(m.content || m.href));
  const html = document.documentElement.innerHTML.slice(0, 3000000);
  for (const m of html.matchAll(/(?:https?:)?\\/\\/[\\w.-]*(?:alicdn|taobaocdn)\\.com\\/[^"'\\s\\\\<>)]+?\\.(?:jpe?g|png|webp)[^"'\\s\\\\<>)]*/gi)) add(m[0]);
  return [...out].slice(0, 80);
})()`;

async function pageImages(link, port, { settleMs = 3000, timeoutMs = 30000, wsImpl = globalThis.WebSocket, fetchImpl = globalThis.fetch } = {}) {
  let u; try { u = new URL(link); } catch { return []; }
  if (u.protocol !== 'https:' || !HOST_OK.test(u.hostname)) return [];
  const base = `http://127.0.0.1:${port}`;
  const target = await (await fetchImpl(`${base}/json/new?${encodeURIComponent(u.href)}`, { method: 'PUT', signal: AbortSignal.timeout(5000) })).json();
  const ws = new wsImpl(target.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('Không nối được Chrome.')); setTimeout(() => rej(new Error('Chrome không phản hồi.')), 8000); });
    let id = 0; const waits = new Map(), events = [];
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waits.has(d.id)) { waits.get(d.id)(d); waits.delete(d.id); } else if (d.method) events.push(d.method); };
    const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waits.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); setTimeout(() => rej(new Error('quá thời gian')), timeoutMs); });
    await send('Page.enable');
    const t0 = Date.now(); while (!events.includes('Page.loadEventFired') && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, settleMs)); // chờ ảnh tải chậm hiện ra
    const r = await send('Runtime.evaluate', { expression: SCRIPT, returnByValue: true });
    return Array.isArray(r.result?.result?.value) ? r.result.result.value : [];
  } finally {
    try { ws.close(); } catch { /* đã đóng */ }
    fetchImpl(`${base}/json/close/${target.id}`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
}
module.exports = { pageImages };
