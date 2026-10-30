// Nhận diện chế độ chạy. `app.isPackaged` của Electron không đáng tin khi chạy từ mã nguồn (`electron .`): có môi trường báo true
// dù đang dev, khiến app tìm văn phòng/trình duyệt ở thư mục của bản đóng gói. Bản đóng gói thật thì process.defaultApp không bật.
exports.isPackagedApp = (app) => app.isPackaged && !process.defaultApp;
