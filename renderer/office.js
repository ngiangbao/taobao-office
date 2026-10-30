// Văn phòng 3D nhỏ. Giao diện công khai duy nhất: createOffice(canvas) -> { act(station, label), idle() }.
// Muốn nâng cấp/thay văn phòng sau này (kể cả dùng bản của my-office), chỉ cần giữ hai hàm act/idle này.
import * as THREE from './vendor/three.module.js';

export const STATIONS = {
  desk:    { pos: [-3, 0, 2],  label: 'Bàn làm việc', color: 0x6c8cff },
  library: { pos: [-3.5, 0, -3], label: 'Thư viện (tìm kiếm/đọc)', color: 0xc08a4a },
  browser: { pos: [3.5, 0, -2.5], label: 'Phòng mạng (Facebook/Taobao)', color: 0x3ecf8e },
  lobby:   { pos: [3, 0, 3],   label: 'Sảnh (chờ bạn)', color: 0xff6a3d },
};

export function createOffice(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1015);
  const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  cam.position.set(9, 9, 10); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(5, 10, 4); scene.add(sun);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x232733 }));
  floor.position.y = -0.15; scene.add(floor);

  const lamps = {};
  for (const [k, s] of Object.entries(STATIONS)) {
    const g = new THREE.Group(); g.position.set(...s.pos);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0x3a3f50 }));
    top.position.y = 0.7; g.add(top);
    for (const dx of [-0.9, 0.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), top.material); leg.position.set(dx, 0.35, 0); g.add(leg); }
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0x111, emissive: s.color, emissiveIntensity: 0.15 }));
    screen.position.set(0, 1.05, -0.3); g.add(screen); lamps[k] = screen;
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.02, 32), new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: 0.35 }));
    rug.position.set(0, 0.01, 1.4); g.add(rug);
    scene.add(g);
  }

  // nhân viên: thân + đầu
  const worker = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 12), new THREE.MeshStandardMaterial({ color: 0xff6a3d }));
  body.position.y = 0.6; worker.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffd9b8 }));
  head.position.y = 1.2; worker.add(head);
  scene.add(worker);

  let target = new THREE.Vector3(...STATIONS.lobby.pos).add(new THREE.Vector3(0, 0, 1.4));
  worker.position.copy(target);
  let busy = false, active = 'lobby';

  function act(station) {
    const s = STATIONS[station] || STATIONS.desk; active = station in STATIONS ? station : 'desk';
    target = new THREE.Vector3(...s.pos).add(new THREE.Vector3(0, 0, 1.4)); busy = true;
    return s.label;
  }
  function idle() { return act('lobby'), (busy = false), STATIONS.lobby.label; }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const k = Math.max(1, 1.25 / cam.aspect) * 1.25; // lùi camera khi khung hẹp để thấy đủ văn phòng
    cam.position.set(9 * k, 9 * k, 10 * k); cam.lookAt(0, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas); resize();

  const clock = new THREE.Clock();
  (function loop() {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const d = target.clone().sub(worker.position); d.y = 0;
    const walking = d.length() > 0.05;
    if (walking) { worker.position.addScaledVector(d.normalize(), Math.min(3 * dt, d.length())); worker.rotation.y = Math.atan2(d.x, d.z); }
    worker.position.y = walking ? Math.abs(Math.sin(t * 10)) * 0.08 : (busy ? Math.sin(t * 14) * 0.015 : 0);
    for (const [k, m] of Object.entries(lamps)) m.material.emissiveIntensity = k === active && busy ? 0.9 + Math.sin(t * 6) * 0.3 : 0.15;
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  })();
  return { act, idle };
}
