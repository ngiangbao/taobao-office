// Kho agent: mỗi agent là một phiên Claude riêng (thư mục riêng, hội thoại riêng, tên riêng).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TEMPLATES = {
  cskh: {
    label: 'Chăm sóc khách',
    match: /chăm sóc|cham soc|khách hỏi|khach hoi|khách nhắn|khach nhan|trả lời khách|tra loi khach|khách gửi|khach gui/i,
    prompt: 'VAI TRÒ CỦA BẠN: chăm sóc khách hàng, là người tiếp nhận đầu tiên. Chủ shop chuyển cho bạn tin nhắn/ảnh của khách. Nếu khách hỏi mua một món (có ảnh hoặc mô tả), hãy GIAO cho agent chuyên tìm hàng Taobao kèm mô tả khách muốn (ảnh được đính kèm tự động); nhận lại giá cuối từ agent báo giá rồi soạn tin trả lời khách thật thân thiện (kèm báo giá, link, thời gian, cách đặt cọc) để chủ shop gửi. Câu hỏi không cần tra hàng thì tự trả lời. Bạn chỉ soạn tin, không tự gửi cho khách.',
  },
  search: {
    label: 'Tìm hàng Taobao',
    match: /tìm hàng|tim hang|tìm mẫu|tim mau|tìm trên taobao|tim tren taobao/i,
    prompt: 'VAI TRÒ CỦA BẠN: chuyên tìm hàng trên Taobao/1688. Nhận ảnh hoặc mô tả món đồ, dùng trình duyệt tìm bằng hình ảnh, chọn 2-3 mẫu giống nhất (ưu tiên shop uy tín, nhiều lượt bán). Với mỗi mẫu ghi: tên, link, giá tệ (¥), phí ship nội địa TQ (¥), cân nặng ước tính (kg), ghi chú size/màu. Xong thì GIAO kết quả cho agent báo giá để tính giá VNĐ, và dặn agent đó giao kết quả lại cho người đã nhờ bạn. Không báo giá VNĐ, không đăng bài.',
  },
  quote: {
    label: 'Báo giá',
    match: /báo giá|bao gia|tính giá|tinh gia/i,
    prompt: 'VAI TRÒ CỦA BẠN: chuyên báo giá. Nhận danh sách món hàng kèm giá tệ, phí ship, cân nặng; tính giá VNĐ theo công thức và trình bày rõ từng khoản cho mỗi mẫu. Nếu thiếu link hoặc giá thì tự tra lại trên Taobao/1688. Xong thì GIAO bảng giá cuối cùng cho agent đã nhờ bạn (người nêu rõ trong yêu cầu, nếu không thì người giao việc gần nhất). Không đăng bài hay comment.',
  },
  post: {
    label: 'Đăng bài nhóm',
    match: /đăng|dang|soạn bài|soan bai|post/i,
    prompt: 'VAI TRÒ CỦA BẠN: chuyên đăng bài vào các nhóm Facebook. Soạn nội dung (mỗi nhóm một bản hơi khác), đọc nội quy nhóm, rồi CHỜ NGƯỜI DÙNG DUYỆT mới đăng. Không báo giá chi tiết hay tìm khách.',
  },
  leads: {
    label: 'Tìm khách',
    match: /tìm khách|tim khach|cần mua|can mua|comment|bình luận|binh luan/i,
    prompt: 'VAI TRÒ CỦA BẠN: chuyên tìm khách. Quét các nhóm Facebook tìm bài có nhu cầu mua, lọc bài thật, soạn comment nháp riêng cho từng bài (khi bài có ảnh món đồ, có thể GIAO cho agent tìm hàng và báo giá để comment kèm giá), trả về bảng và CHỜ NGƯỜI DÙNG DUYỆT mới comment.',
  },
  custom: { label: 'Tùy chỉnh', match: null, prompt: '' },
};

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'agent';
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

function createAgents(dataDir) {
  const file = path.join(dataDir, 'agents.json');
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const save = () => { fs.writeFileSync(file, JSON.stringify(list, null, 2)); syncNames(); };
  // văn phòng đọc file này để người trong văn phòng mang đúng tên agent
  function syncNames() { try { const d = path.join(dataDir, 'office'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'agent-names.json'), JSON.stringify(Object.fromEntries(list.map((a) => [a.sid, a.name])))); } catch {} }
  syncNames();
  const pub = (a) => ({ id: a.id, name: a.name, role: a.role, roleLabel: TEMPLATES[a.role]?.label || 'Tùy chỉnh', instructions: a.instructions, sid: a.sid, started: a.started });
  return {
    TEMPLATES,
    all: () => list,
    list: () => list.map(pub),
    get: (id) => list.find((a) => a.id === id),
    add({ name, role, instructions }) {
      name = String(name || '').replace(/[@\r\n]/g, ' ').trim().slice(0, 24);
      if (!name) throw new Error('Hãy đặt tên cho agent.');
      if (list.some((a) => fold(a.name) === fold(name))) throw new Error(`Đã có agent tên "${name}".`);
      role = TEMPLATES[role] ? role : 'custom';
      const id = crypto.randomUUID().slice(0, 8), dir = path.join(dataDir, 'agents', `${slug(name)}-${id}`);
      fs.mkdirSync(dir, { recursive: true });
      const a = { id, name, role, instructions: String(instructions || '').slice(0, 4000), sid: crypto.randomUUID(), dir, started: false };
      list.push(a); save(); return a;
    },
    markStarted(id) { const a = this.get(id); if (a) { a.started = true; save(); } },
    remove(id) { list = list.filter((a) => a.id !== id); save(); },
    // hội thoại mới: phiên mới, quên ngữ cảnh cũ (người trong văn phòng cũng là người mới)
    reset(id) { const a = this.get(id); if (a) { a.sid = crypto.randomUUID(); a.started = false; save(); } return a; },
    byName(name) { const f = fold(String(name).replace(/^@/, '').trim()); return list.find((a) => fold(a.name) === f) || (f.length >= 3 ? list.find((a) => fold(a.name).startsWith(f)) : undefined); },
    /** "@Tên ..." → agent đó; không có @ thì đoán theo từ khóa của vai trò. */
    route(text, lastId) {
      const f = fold(text);
      const named = [...list].sort((x, y) => y.name.length - x.name.length).find((a) => f.includes('@' + fold(a.name)));
      if (named) return { agent: named, how: 'mention' };
      if (/^\s*(duyet|ok|dong y|sua|dang di|comment di)\b/.test(f) && lastId && this.get(lastId)) return { agent: this.get(lastId), how: 'followup' };
      const hits = list.filter((a) => TEMPLATES[a.role]?.match?.test(text));
      if (hits.length === 1) return { agent: hits[0], how: 'keyword' };
      const front = list.find((a) => a.role === 'cskh'); // người tiếp nhận đầu tiên: việc không rõ thì giao cho họ
      if (front) return { agent: front, how: 'front' };
      if (list.length === 1) return { agent: list[0], how: 'only' };
      return { agent: null, how: hits.length > 1 ? 'ambiguous' : 'none' };
    },
  };
}
module.exports = { createAgents, TEMPLATES };
