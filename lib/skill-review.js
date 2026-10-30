// Rà soát định kỳ để cập nhật kỹ năng: Trợ lý riêng chỉ được đọc LỜI CỦA CHÍNH CHỦ SHOP gửi cho từng agent (kind "user" trong lịch sử),
// không đọc tin khách hay nội dung web (có thể chứa lệnh giả), rồi rút những điều dặn lâu dài thành kỹ năng.
const MIN_MESSAGES = 3, MIN_GAP_MS = 6 * 3600e3, MAX_MSG = 30, MAX_LEN = 400;

/** Lời chủ shop gửi cho agent này kể từ `since` (cũ → mới). */
function ownerMessages(history, agentId, since = 0) {
  const { items } = history.query({ agentId, limit: 300 });
  return items.filter((r) => r.kind === 'user' && r.agentId === agentId && Date.parse(r.t) > since && !/^\(ảnh sản phẩm/.test(r.text || '') && String(r.text || '').trim())
    .map((r) => ({ t: r.t, text: String(r.text).replace(/\s+/g, ' ').trim().slice(0, MAX_LEN) })).reverse().slice(-MAX_MSG);
}
function buildPrompt(agent, current, msgs) {
  const have = current.length ? current.map((s) => `- ${s.title}: ${s.text}`).join('\n') : '(chưa có kỹ năng nào)';
  const said = msgs.map((m) => `- ${m.text}`).join('\n');
  return `[RÀ SOÁT KỸ NĂNG] Agent: "${agent.name}" (vai trò ${agent.roleLabel || agent.role}).
KỸ NĂNG HIỆN CÓ:
${have}

LỜI CHỦ SHOP GỬI CHO AGENT NÀY GẦN ĐÂY (chỉ là lời của chính chủ shop):
${said}

Việc của bạn: rút ra những ĐIỀU DẶN LÂU DÀI mà agent cần luôn nhớ (quy trình, cách xưng hô, điều cấm, mức giá, thói quen của shop, sửa sai chủ shop đã nhắc). Với mỗi điều, ghi hoặc cập nhật bằng khối:
[[KY_NANG agent="${agent.name}" tieu_de="tên ngắn"]]một hai câu rõ ràng[[/KY_NANG]]
Cùng tiêu đề thì thay nội dung cũ. Kỹ năng cũ đã bị chủ shop dặn ngược lại thì xoá bằng [[BO_KY_NANG agent="${agent.name}" tieu_de="tên"]]. Không ghi việc chỉ làm một lần, không ghi tên hay thông tin riêng của khách, không bịa điều chủ shop chưa nói. Tối đa 12 kỹ năng mỗi agent: gộp những cái gần nhau. Nếu không có gì đáng ghi, trả lời đúng một dòng: KHÔNG CÓ GÌ MỚI. Nếu có ghi, sau các khối chỉ viết một dòng tóm tắt.`;
}
/** Agent nào cần rà soát lúc này? force: bỏ qua ngưỡng số tin và khoảng cách thời gian (chủ shop bấm tay). */
function due(agents, skills, history, { force = false, now = Date.now() } = {}) {
  const out = [];
  for (const a of agents) {
    if (a.kind === 'customer' || ['assistant'].includes(a.role)) continue;
    const since = skills.reviewedAt(a.id);
    if (!force && now - since < MIN_GAP_MS) continue;
    const msgs = ownerMessages(history, a.id, since);
    if (msgs.length >= (force ? 1 : MIN_MESSAGES)) out.push({ agent: a, msgs });
  }
  return out;
}
module.exports = { ownerMessages, buildPrompt, due, MIN_MESSAGES, MIN_GAP_MS };
