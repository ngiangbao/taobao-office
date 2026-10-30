// Số liệu 7 ngày gần nhất cho thẻ "Tổng kết tuần" của văn phòng: khách được chăm sóc và doanh thu thu được trong tuần.
const WEEK_MS = 7 * 24 * 3600e3;
/** customers: danh sách khách (lastInboundAt, lastReplyAt: mốc ms); revenueItems: các khoản thu còn hiệu lực ({ t: ISO, amount }) */
function weekStats(customers, revenueItems, now = Date.now()) {
  const since = now - WEEK_MS;
  return {
    since,
    // khách được chăm sóc trong tuần = khách có tin đến hoặc có tin trả lời trong 7 ngày qua
    customers: customers.filter((c) => Math.max(c.lastInboundAt || 0, c.lastReplyAt || 0) >= since).length,
    revenue: revenueItems.filter((r) => new Date(r.t).getTime() >= since).reduce((a, r) => a + r.amount, 0),
  };
}
module.exports = { weekStats, WEEK_MS };
