// Proxy MCP (stdio) đứng giữa Claude và máy chủ Playwright MCP thật: chuyển nguyên văn mọi thông điệp, nhưng CHỈ MỞ CHROME khi
// agent thật sự gọi một công cụ trình duyệt (tools/call đầu tiên). Nhờ vậy chào hỏi, trả lời, soạn nháp... không làm Chrome bật lên.
// Máy chủ Playwright MCP tự nó không cần Chrome lúc khởi động và liệt kê công cụ (chỉ nối Chrome ở lần gọi công cụ đầu tiên).
const { spawn } = require('node:child_process');

/** spawnChild() -> { stdin, stdout, kill }; ensureBrowser() -> Promise (mở Chrome nếu chưa có; ném lỗi nếu không được). */
function createProxy({ spawnChild, ensureBrowser, input, output, onCall = () => {} }) {
  const child = spawnChild();
  let ready = null;           // lời hứa "Chrome đã sẵn sàng", chỉ tạo một lần khi cần
  let chain = Promise.resolve(); // giữ đúng thứ tự thông điệp: việc sau chờ việc trước
  let buf = '';

  child.stdout.on('data', (d) => output.write(d)); // trả lời của máy chủ thật đi thẳng về Claude
  input.on('data', (d) => {
    buf += d; let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) enqueue(line); }
  });
  input.on('end', () => { chain = chain.then(() => { try { child.stdin.end(); } catch { /* đã đóng */ } }); });

  function enqueue(line) {
    chain = chain.then(async () => {
      let msg = null; try { msg = JSON.parse(line); } catch { /* không phải JSON: chuyển nguyên */ }
      if (msg?.method === 'tools/call') {
        try { onCall(); } catch { /* không quan trọng */ }
        try {
          if (!ready) ready = Promise.resolve().then(ensureBrowser);
          await ready;
        } catch (e) {
          ready = null; // lần gọi sau sẽ thử mở lại
          output.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `### Error\nKhông mở được Chrome: ${e.message}` }], isError: true } }) + '\n');
          return;
        }
      }
      child.stdin.write(line + '\n');
    }).catch(() => {});
  }
  return { stop: () => { try { child.kill(); } catch { /* đã thoát */ } }, opened: () => !!ready };
}

module.exports = { createProxy };

if (require.main === module) { // chạy như máy chủ MCP do Claude khởi (qua Electron ở chế độ Node)
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : ''; };
  const cli = arg('--cli'), data = arg('--data'), out = arg('--out'), mine = arg('--mode') === 'extension', upload = process.argv.includes('--upload'); // upload: chỉ cấu hình của Người đăng, cho tải ảnh từ thư mục ngoài thư mục làm việc (ảnh sản phẩm)
  // mine: dùng Chrome của chủ shop qua tiện ích Playwright, không tự mở Chrome
  const browser = require('./browser');
  const p = createProxy({
    spawnChild: () => spawn(process.execPath, [cli, ...(mine ? ['--extension'] : ['--cdp-endpoint', `http://127.0.0.1:${browser.PORT}`]), '--output-dir', out, ...(upload ? ['--allow-unrestricted-file-access'] : [])],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'inherit'] }),
    ensureBrowser: async () => { if (!mine && !(await browser.up())) { const r = await browser.open(data); if (!r.ok) throw new Error(r.error); } },
    onCall: () => { if (!mine) browser.touch(data); },
    input: process.stdin, output: process.stdout,
  });
  process.on('SIGTERM', () => { p.stop(); process.exit(0); });
  process.stdin.on('close', () => setTimeout(() => { p.stop(); process.exit(0); }, 500));
}
