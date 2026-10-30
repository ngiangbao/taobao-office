// Chạy Claude Code không giao diện (claude -p) bằng chính bản `claude` đã đăng nhập trên máy bạn.
// App không giữ mật khẩu/token nào: chỉ gọi lệnh và đọc kết quả.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function findClaude(custom) {
  if (custom && fs.existsSync(custom)) return custom;
  const win = process.platform === 'win32';
  try {
    const out = execFileSync(win ? 'where' : 'which', ['claude'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    if (out) return out;
  } catch {}
  const home = os.homedir();
  const cands = win
    ? [path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'), path.join(home, '.local', 'bin', 'claude.exe')]
    : [path.join(home, '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude', path.join(home, '.claude', 'local', 'claude')];
  return cands.find((p) => fs.existsSync(p)) || null;
}

function buildSystemPrompt(cfg) {
  const g = (cfg.groups || []).map((x) => `- ${x.name}${x.url ? ' ' + x.url : ''}${x.note ? ' (' + x.note + ')' : ''}`).join('\n') || '(chưa có)';
  return `Bạn là trợ lý của một shop order hàng Taobao về Việt Nam. Luôn trả lời bằng tiếng Việt, ngắn gọn.
Giọng văn của shop: ${cfg.tone || 'thân thiện, lịch sự'}.

CÔNG THỨC BÁO GIÁ: giá VNĐ = (giá tệ × ${cfg.rate}) + (phí ship nội địa TQ tệ × ${cfg.rate}) + (cân nặng kg × ${cfg.shipPerKg} VNĐ) + phí dịch vụ ${cfg.servicePct}%.
Khi báo giá luôn ghi rõ từng khoản, kèm link sản phẩm Taobao/1688 và nêu giả định (cân nặng ước tính).

DANH SÁCH NHÓM FACEBOOK:
${g}

QUY TẮC BẮT BUỘC:
1. Dùng công cụ trình duyệt (playwright) để thao tác trên Facebook/Taobao bằng hồ sơ đã đăng nhập sẵn. Tuyệt đối không nhập mật khẩu, không giải CAPTCHA; nếu gặp thì dừng và báo người dùng tự xử lý.
2. KHÔNG BAO GIỜ đăng bài, comment, gửi tin nhắn hay bấm nút gửi/đăng nếu người dùng chưa duyệt rõ ràng trong tin nhắn trước đó. Với yêu cầu đăng/comment: soạn bản nháp (mỗi nhóm/bài viết khác nhau), liệt kê rõ nhóm hoặc link bài, rồi DỪNG chờ "duyệt".
3. Trước khi đăng vào nhóm, đọc nội quy nhóm; nhóm cấm bán hàng thì bỏ qua và báo lại.
4. Giữ nhịp như người thật: tối đa ${cfg.maxPostsPerDay || 12} bài/ngày, nghỉ vài giây giữa các thao tác, không dán cùng một nội dung giống hệt.
5. Sau mỗi lần đăng/comment thành công, ghi một dòng vào file nhat-ky.md (thời gian, nhóm/bài, nội dung tóm tắt).
6. Khi tìm khách: lọc bài thật sự có nhu cầu, trả về bảng gồm link bài, nhu cầu, comment nháp. Chưa comment cho tới khi được duyệt.
Ảnh người dùng gửi nằm ở đường dẫn trong tin nhắn; dùng Read để xem.`;
}

function runClaude({ text, cfg, dataDir, sessionId, onEvent, hooksFile }) {
  const bin = findClaude(cfg.claudePath);
  if (!bin) throw new Error('Không tìm thấy lệnh `claude`. Hãy cài Claude Code và đăng nhập (chạy `claude` một lần trong terminal), hoặc nhập đường dẫn trong Cài đặt.');
  const win = process.platform === 'win32';
  const mcp = path.join(dataDir, 'mcp.json');
  const profile = path.join(dataDir, 'chrome-profile');
  const server = win
    ? { command: 'cmd', args: ['/c', 'npx', '-y', '@playwright/mcp@latest', '--user-data-dir', profile] }
    : { command: 'npx', args: ['-y', '@playwright/mcp@latest', '--user-data-dir', profile] };
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { playwright: server } }));

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
    '--append-system-prompt', buildSystemPrompt(cfg),
    '--allowedTools', 'mcp__playwright', 'WebSearch', 'WebFetch', 'Read', 'Write', 'Edit'];
  if (cfg.browser === 'chrome') args.push('--chrome'); else args.push('--mcp-config', mcp);
  if (hooksFile) args.push('--settings', hooksFile);
  if (sessionId) args.push('--resume', sessionId);

  const child = spawn(bin, args, { cwd: dataDir, shell: win, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(text); // gửi qua stdin để khỏi lỗi ký tự đặc biệt
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch {}
    }
  });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, err })));
  return { child, done };
}

module.exports = { runClaude, findClaude };
