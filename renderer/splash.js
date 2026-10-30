// Màn hình chào: hiện phiên bản và các bước khởi động do main.js gửi sang.
const msg = document.getElementById('msg');
const steps = ['Đang khởi động…', 'Đang mở văn phòng 3D…', 'Đang chuẩn bị khung chat…'];
let i = 0;
const timer = setInterval(() => { msg.textContent = steps[++i % steps.length]; }, 1600);

if (window.splash) {
  window.splash.version().then((v) => { document.getElementById('ver').textContent = 'v' + v; });
  window.splash.onMessage((t) => { clearInterval(timer); msg.textContent = t; });
}
