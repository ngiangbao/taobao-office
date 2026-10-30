// The cost desk and its reports remain; the accountant's 3D character has been removed.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { PRO, officeNow, replay } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex, fitText, mat, put, rbox } from '../scene/blocks.js';
import { officeChair } from '../world/desks.js';
import { sessions, workers } from './workers.js';
import { quip } from './errands.js';
import { liveWindows } from '../ui/mac-drawer.js';
import { napOn } from '../life/nap.js';
import { toast } from '../ui/activity.js';
import { t as tr } from '../../i18n/index.js';

/* The cost desk remains in the office; reports and budget warnings are shown as notices instead of a 3D accountant. */
const REPORT_AT = 1050, DAY_END = 1065, WARN = 80;
const minutes = () => { const d = officeNow(); return d.getHours() * 60 + d.getMinutes(); };
const today = () => officeNow().toDateString();
const usd = (v) => `$${v >= 100 ? Math.round(v) : v.toFixed(2)}`;
const projOf = (s) => s?.git?.repo || String(s?.dir || '').split('/').filter(Boolean).pop() || tr('activity.live.otherProject');

// a moment the office is busy with something together (people/rounds.js waits for these too)
export function busyNow() {
  const d = officeNow(), m = d.getHours() * 60 + d.getMinutes(), day = d.getDay();
  if (napOn || replay.on || (day === 1 && m >= 540 && m < 575) || (day === 5 && m >= 960 && m < 995)) return true;
  for (const w of workers.values()) if (w.onBreak || w.chore?.gathering) return true;
  return false;
}

/* ---------- the desk ---------- */
const DESK = { x: 5.45, z: 6.15 };   // the admin corner beside the front pod, off every walkway
let screenTex, sheetKey = '';
function buildDesk() {
  const g = new THREE.Group(); g.position.set(DESK.x, 0, DESK.z); g.rotation.y = Math.PI / 2; scene.add(g);
  const wood = mat('#B48A60', { roughness: 0.6 }), dark = mat('#2B2F36', { roughness: 0.5 });
  put(g, rbox(0.95, 0.05, 0.55, wood, 0.015), 0, 0.745, 0);
  for (const sx of [-1, 1]) put(g, rbox(0.04, 0.72, 0.5, wood, 0.01), sx * 0.45, 0.36, 0);
  put(g, rbox(0.86, 0.4, 0.03, wood, 0.01), 0, 0.5, -0.24);
  // the screen faces the room; the spreadsheet is drawn on it (screenTex)
  put(g, rbox(0.06, 0.2, 0.06, dark, 0.01), 0.2, 0.87, -0.16);
  put(g, rbox(0.52, 0.33, 0.035, dark, 0.015), 0.2, 1.07, -0.15);
  screenTex = canvasTex(320, 200, (c, w, h) => { c.fillStyle = '#F7F8FA'; c.fillRect(0, 0, w, h); });
  const scr = put(g, new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.3), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false })), 0.2, 1.07, -0.13);
  scr.userData.noMerge = true;
  put(g, rbox(0.36, 0.015, 0.12, mat('#E8E8E6', { roughness: 0.5 }), 0.005), -0.02, 0.778, 0.1);
  // a calculator, its little green display
  put(g, rbox(0.09, 0.02, 0.14, dark, 0.006), 0.31, 0.78, 0.12).rotation.y = -0.2;
  put(g, rbox(0.07, 0.004, 0.035, mat('#9FD8A0', { emissive: '#3E7A40', emissiveIntensity: 0.4 }), 0.002), 0.318, 0.792, 0.08).rotation.y = -0.2;
  // the red VAT invoices (hoá đơn đỏ), two piles, and the ledger
  const white = mat('#F4F1EA', { roughness: 0.95 }), pink = mat('#E7A1B0', { roughness: 0.9 });
  put(g, rbox(0.21, 0.07, 0.25, white, 0.006), -0.33, 0.805, -0.1).rotation.y = 0.12;
  put(g, rbox(0.21, 0.012, 0.25, pink, 0.004), -0.33, 0.846, -0.1).rotation.y = 0.12;
  put(g, rbox(0.23, 0.045, 0.31, mat('#7A1F2B', { roughness: 0.7 }), 0.01), -0.3, 0.792, 0.2).rotation.y = -0.18;
  // the corner's low screen behind the desks, its sign toward the room
  const felt = mat('#6F8A9A', { roughness: 0.95 });
  put(scene, rbox(0.06, 1.2, 2.2, felt, 0.02), 5.0, 0.6, 6.72);
  put(scene, rbox(0.07, 0.04, 2.24, mat('#9AA2AD', { roughness: 0.4, metalness: 0.4 }), 0.01), 5.0, 1.22, 6.72);
  const signTex = canvasTex(512, 72, (c, w, h) => { c.fillStyle = '#1C2620'; c.fillRect(0, 0, w, h); c.fillStyle = '#F6EFE4'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 36px "Be Vietnam Pro", system-ui, sans-serif'; fitText(c, tr('people.accountant.corner'), w - 30); c.fillText(tr('people.accountant.corner'), w / 2, h / 2 + 2); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.18), new THREE.MeshBasicMaterial({ map: signTex })); sign.position.set(5.036, 1.06, 6.72); sign.rotation.y = Math.PI / 2; sign.userData.noMerge = true; scene.add(sign);
  // a small printer on a cabinet behind the screen
  const cab = new THREE.Group(); cab.position.set(4.66, 0, 6.0); cab.rotation.y = Math.PI / 2; scene.add(cab);
  put(cab, rbox(0.45, 0.6, 0.42, mat('#D6D9DE', { roughness: 0.6 }), 0.02), 0, 0.3, 0);
  put(cab, rbox(0.38, 0.17, 0.32, mat('#EDEEF0', { roughness: 0.5 }), 0.02), 0, 0.685, 0);
  put(cab, rbox(0.26, 0.012, 0.14, white, 0.004), 0, 0.775, 0.1);
  put(cab, rbox(0.3, 0.03, 0.02, dark, 0.005), 0, 0.71, 0.16);
  officeChair(scene, DESK.x + 0.66, DESK.z, mat('#4F6D8F', { roughness: 0.6 })).rotation.y = -Math.PI / 2;
}
// the open sessions' API cost, by project, and the total
function costs() {
  const by = new Map();
  for (const s of sessions.values()) { const c = s.usage?.cost || 0; if (c > 0) by.set(projOf(s), (by.get(projOf(s)) || 0) + c); }
  const rows = [...by].sort((a, b) => b[1] - a[1]);
  return { rows, total: rows.reduce((a, r) => a + r[1], 0) };
}
function drawSheet() {
  const { rows, total } = costs(), key = rows.map(([p, c]) => `${p}:${c.toFixed(2)}`).join('|');
  if (key === sheetKey) return;
  sheetKey = key;
  const c = screenTex.image.getContext('2d'), w = 320, h = 200, F = '"Be Vietnam Pro", system-ui, sans-serif';
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1F7A45'; c.fillRect(0, 0, w, 30);   // a spreadsheet's green bar, the day's title
  c.fillStyle = '#FFFFFF'; c.font = `700 15px ${F}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(tr('people.accountant.sheet'), 10, 15);
  c.fillStyle = '#E9EDF2'; c.fillRect(0, 30, w, 24);
  c.fillStyle = '#3A3F47'; c.font = `700 13px ${F}`; c.fillText(tr('people.accountant.project'), 10, 42); c.textAlign = 'right'; c.fillText(tr('people.accountant.cost'), w - 10, 42);
  const shown = rows.slice(0, 4);
  shown.forEach(([p, v], k) => {
    const y = 54 + k * 26;
    c.strokeStyle = '#D5DAE1'; c.beginPath(); c.moveTo(0, y + 26); c.lineTo(w, y + 26); c.stroke();
    c.fillStyle = '#1C1F24'; c.font = `500 13px ${F}`; c.textAlign = 'left'; fitText(c, p, 200); c.fillText(p, 10, y + 13);
    c.font = `600 13px ${F}`; c.textAlign = 'right'; c.fillText(usd(v), w - 10, y + 13);
  });
  c.strokeStyle = '#B9C0CA'; c.beginPath(); c.moveTo(w * 0.62, 54); c.lineTo(w * 0.62, 158); c.stroke();
  c.fillStyle = '#FFF4D6'; c.fillRect(0, 160, w, 40);
  c.fillStyle = '#1C1F24'; c.font = `800 15px ${F}`; c.textAlign = 'left'; c.fillText(tr('people.accountant.total'), 10, 180);
  c.textAlign = 'right'; c.fillText(usd(total), w - 10, 180);
  screenTex.needsUpdate = true;
}

/* Daily report and usage warnings remain available without a 3D character. */
let reportDay = '', warned = new Set(), checkAt = 0, sheetAt = 0;
export function report(force = false) {
  if (!PRO || (!force && busyNow())) return false;
  reportDay = today();
  toast(tr('people.accountant.summary', { total: usd(costs().total) }), 7000);
  return true;
}

// the plan's windows past 80 % that she hasn't spoken about yet (this time round): the fullest first
function nearLimit() {
  return liveWindows().filter((w) => w.pct >= WARN && w.pct < 99.5 && !warned.has(`${w.key}:${w.resetsAt || ''}`)).sort((a, b) => b.pct - a.pct)[0] || null;
}
// the person here whose session has cost the most
function spender() {
  let best = null, bc = 0;
  for (const w of workers.values()) {
    const s = sessions.get(w.id), c = s?.usage?.cost || 0;
    if (w.sub || !w.root.visible || w.away || w.street || w.offstage || w.leaving || w.outing || w.onBreak || w.phase === 'walk' || c <= bc) continue;
    best = w; bc = c;
  }
  return best;
}
export function budgetWarn(force = false) {
  if (!PRO || (!force && busyNow())) return false;
  const win = nearLimit() || (force ? { key: 'weekly', pct: 82, resetsAt: 0 } : null), w = spender();
  if (!win || !w) return false;
  warned.add(`${win.key}:${win.resetsAt || ''}`);
  const text = tr('people.accountant.warn', { pct: Math.round(win.pct), window: tr(`people.accountant.win.${win.key === 'weekly' ? 'weekly' : 'session'}`) });
  toast(text, 7000);
  setTimeout(() => { if (w.root.visible && !w.chore && w.phase !== 'walk') quip(w, tr('people.accountant.reply'), 'idle'); }, 2200);
  return true;
}

// ?debug: __office.accountant (where she is), report(), budgetWarn() (the test's way in)
let hooked = false;
function hook() {
  const o = window.__office; if (hooked || !o) return;
  hooked = true; Object.defineProperty(o, 'accountant', { get: () => accountantState(), configurable: true });
  o.report = () => report(true); o.budgetWarn = () => budgetWarn(true);
}
export function updateAccountant() {
  if (!PRO) return;
  if (!hooked) hook();
  if (state.sim > sheetAt) { sheetAt = state.sim + 3; drawSheet(); }
  if (state.sim < checkAt || replay.on) return;
  checkAt = state.sim + 5;
  if (reportDay !== today() && minutes() >= REPORT_AT && minutes() < DAY_END) { report(); return; }
  if (nearLimit()) budgetWarn();
}

export function setup() {
  if (!PRO) return;
  buildDesk();
}
export const accountantState = () => null;
export const accountant = null;
