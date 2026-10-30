// Lời chào của các agent mỗi lần chủ shop mở lại app. Viết sẵn theo vai trò, không gọi Claude (không tốn lượt, không mở trình duyệt).
const when = (h) => (h < 11 ? 'buổi sáng' : h < 14 ? 'buổi trưa' : h < 18 ? 'buổi chiều' : 'buổi tối');
const vnd = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}₫`;

const LINES = {
  cskh: (c) => `Chào chủ shop, chúc ${c.when} vui! Mình đang trực tin nhắn${c.customers ? `, hiện shop có ${c.customers} khách đang theo dõi` : ''}. Có khách hỏi gì cứ giao mình nhé.`,
  search: () => 'Chào chủ shop! Gửi mình ảnh hoặc mô tả món cần tìm, mình tìm mẫu giống nhất trên cả Taobao và 1688 ngay.',
  quote: () => 'Chào chủ shop! Có link hoặc ảnh sản phẩm thì giao mình, mình tính giá đầy đủ từng khoản cho bạn.',
  post: () => 'Chào chủ shop! Cần đăng bài vào nhóm nào cứ nói mình soạn. Bài nào cũng chờ bạn duyệt rồi mới đăng.',
  leads: () => 'Chào chủ shop! Mình sẵn sàng đi tìm khách đang cần mua. Bạn muốn tìm khách cho món nào?',
  inventory: (c) => `Chào chủ shop! Mình giữ danh mục kho${c.hasStock ? '' : ' (bạn nhập link bảng ở Cài đặt → Kho hàng nhé)'}. Hỏi mã, màu, giá hay gửi ảnh để đối chiếu đều được.`,
  assistant: (c) => `Chào chủ shop, ${c.when} tốt lành! Mình là trợ lý riêng của bạn. Có gì cần phân việc hoặc muốn dạy các agent cách comment, văn phong, cứ nói mình.`,
  commenter: (c) => (c.scanOn ? 'Chào chủ shop! Mình đang bật quét bảng tin theo lịch, bình luận nào cũng qua bạn duyệt (trừ khi bạn bật tự đăng).' : 'Chào chủ shop! Mình đang nghỉ (chưa bật quét bảng tin). Cần mình quét thì bật ở Cài đặt → Trả lời comment.'),
  khach: null, // agent từng khách không tự chào
  custom: (c, a) => `Chào chủ shop! ${a.name} sẵn sàng làm việc.`,
};
/** → câu chào cho một agent, hoặc '' nếu agent này không chào (agent chăm khách) */
function greeting(agent, { hour = new Date().getHours(), customers = 0, revenue = 0, hasStock = false, scanOn = false } = {}) {
  if (agent.kind === 'customer') return '';
  const f = LINES[agent.role] === undefined ? LINES.custom : LINES[agent.role];
  return f ? f({ when: when(hour), customers, revenue, hasStock, scanOn, vnd }, agent) : '';
}
module.exports = { greeting };
