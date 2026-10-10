// ひこうき日和:全体のまとめ役(画面の切りかえ、操作、カメラ、写真、見どころ、記録)
import * as THREE from 'three';
import { COURSES } from './courses.js';
import { CRAFTS, ACHIEVEMENTS } from './data.js';
import { buildWorld, makeHeightField, silhouette } from './world.js';
import { buildAircraft } from './models.js';
import { Flyer } from './flight.js';
import { Cockpit, EYE, LOOK_DOWN } from './cockpit.js';
import { Sound } from './audio.js';
import * as SV from './save.js';
import { clamp, damp, wrapAngle, hexToCss } from './util.js';

const $ = (id) => document.getElementById(id);
const S = SV.load();
const coarse = matchMedia('(pointer: coarse)').matches;
const quality = S.settings.quality >= 0 ? S.settings.quality : coarse ? 0 : 1;

// ---------------------------------------------------------------- 描画の準備
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: quality > 0, powerPreference: 'high-performance' });
} catch (e) {
  $('bootText').textContent = 'この端末やブラウザでは 3D 表示(WebGL)が使えないようです。Chrome / Safari / Edge の新しい版でひらいてください。';
  throw e;
}
const PR = Math.min(devicePixelRatio || 1, quality > 1 ? 2 : quality > 0 ? 1.5 : 1.25);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('view').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 12000);

const sound = new Sound();
sound.musicOn = S.settings.music;
sound.sfxOn = S.settings.sfx;

const G = {
  mode: 'boot',
  craft: CRAFTS.find((c) => c.id === S.last.craft) || CRAFTS[0],
  course: COURSES.find((c) => c.id === S.last.course) || COURSES[0],
  world: null, flyer: null, model: null, map: null,
  t: 0, camMode: 0, auto: false, mapOn: false,
  chain: 0, lastMote: -99, found: new Set(),
  skimT: 0, thermalBase: null, drift: 0, edgeT: -99, bumpT: -99, shake: 0,
  photoReq: false, inp: { pitch: 0, roll: 0, yaw: 0, boost: false },
};
window.__game = G; // 動作確認用

// ---------------------------------------------------------------- 世界と機体
function loadCourse(course) {
  if (G.world) {
    scene.remove(G.world.group);
    G.world.dispose();
  }
  G.course = course;
  G.world = buildWorld(course, quality);
  scene.add(G.world.group);
  scene.fog = G.world.fog;
  scene.background = new THREE.Color(course.sky.fog);
  sound.setKey(course.id);
  G.map = G.world.mapCanvas(220);
  G.found = new Set();
  placeCraft();
}

function setCraft(craft) {
  if (G.model) scene.remove(G.model.root);
  G.craft = craft;
  G.model = buildAircraft(craft.id);
  scene.add(G.model.root);
  G.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  placeCraft();
}

function placeCraft() {
  if (!G.world || !G.model) return;
  G.flyer = new Flyer(G.craft, G.model);
  const ground = !!G.craft.ground;
  G.world.setMoteMode(ground);
  // スタート地点:車は陸、水上機は水、ほかは滑走路(設定で「空から」も選べる)
  const rw = G.world.runway;
  const fromRunway = rw && !G.craft.seaplane && !ground && S.settings.start !== 'air';
  let sp = ground ? G.world.landSpawn() : G.course.spawn;
  if (fromRunway) sp = G.craft.balloon ? rw.beside() : rw.start();
  G.flyer.place(G.world, sp.x, sp.z, sp.dir[0], sp.dir[1], fromRunway);
  apReset();
  cam.snap = true;
  cam.cine = null;
}

// ---------------------------------------------------------------- おまかせ飛行(自動操縦)
const AP = { u: 0, climb: false, stuck: 0 };
// 地上ののりものは地面の道、空の機体は空の道をたどる
const apPath = () => (G.craft.ground ? { cv: G.world.groundCurve, len: G.world.groundLen } : { cv: G.world.curve, len: G.world.pathLen });
function apReset() {
  const w = G.world, f = G.flyer;
  if (!w || !f) return;
  const { cv } = apPath();
  let best = 0, bd = Infinity;
  for (let i = 0; i < 300; i++) {
    const p = cv.getPointAt(i / 300);
    if (G.craft.ground) p.y = f.pos.y;
    const d = p.distanceToSquared(f.pos);
    if (d < bd) { bd = d; best = i / 300; }
  }
  AP.u = best;
  AP.climb = false;
}
const _tp = new THREE.Vector3();
function autopilot() {
  const w = G.world, f = G.flyer, c = f.c;
  const { cv, len } = apPath();
  if (c.ground) return autodrive(w, f, cv, len);
  let p = cv.getPointAt(AP.u, _tp);
  for (let k = 0; k < 60 && p.distanceTo(f.pos) < (c.balloon ? 160 : 70 + f.speed); k++) {
    AP.u = (AP.u + 6 / len) % 1;
    p = cv.getPointAt(AP.u, _tp);
  }
  const target = p.clone();
  if (c.glider && w.thermals.length) {
    if (f.agl < 150) AP.climb = true;
    if (AP.climb && f.agl > 420) AP.climb = false;
    if (AP.climb) {
      let th = w.thermals[0], bd = Infinity;
      for (const t of w.thermals) {
        const d = Math.hypot(t.x - f.pos.x, t.z - f.pos.z);
        if (d < bd) { bd = d; th = t; }
      }
      const a = G.t * 0.45;
      target.set(th.x + Math.cos(a) * 55, f.pos.y + 20, th.z + Math.sin(a) * 55);
    }
  }
  const dx = target.x - f.pos.x, dy = target.y - f.pos.y, dz = target.z - f.pos.z;
  const inp = { pitch: 0, roll: 0, yaw: 0, boost: false };
  if (c.balloon) {
    inp.pitch = clamp(dy / 25, -1, 1);
    const wnd = w.windAt(f.pos.y);
    inp.roll = clamp((dx * -Math.cos(wnd.a) + dz * Math.sin(wnd.a)) / 120, -1, 1);
  } else {
    const diff = wrapAngle(Math.atan2(dx, dz) - f.yaw);
    inp.roll = clamp(-diff * 1.8, -1, 1);
    const wantP = Math.atan2(dy, Math.hypot(dx, dz));
    inp.pitch = clamp((wantP - f.pitch) * 2.5, -1, 1);
    if (f.onWater) {
      inp.boost = true;
      inp.pitch = f.speed > c.takeoff ? 1 : 0;
      inp.roll = clamp(-diff, -1, 1);
    }
    if (f.onGround) {
      // 滑走路の上はまっすぐ加速して離陸
      inp.boost = !c.glider || f.speed < 3;
      inp.pitch = f.speed > c.vr ? 1 : 0;
      inp.roll = 0;
    } else if (f.agl < 60 && f.pos.y < target.y) inp.pitch = Math.max(inp.pitch, 0.5);
  }
  return inp;
}

// 地上ののりものの自動運転:道の少し先をめざして走る
function autodrive(w, f, cv, len) {
  let p = cv.getPointAt(AP.u, _tp);
  const near = () => Math.hypot(p.x - f.pos.x, p.z - f.pos.z) < 14 + Math.abs(f.speed) * 0.8 || w.surfaceAt(p.x, p.z).water;
  for (let k = 0; k < 80 && near(); k++) {
    AP.u = (AP.u + 4 / len) % 1;
    p = cv.getPointAt(AP.u, _tp);
  }
  // 動けなくなったら、道の先へ目標をとばす
  AP.stuck = Math.abs(f.speed) < 1 ? AP.stuck + 1 : 0;
  if (AP.stuck > 120) { AP.u = (AP.u + 60 / len) % 1; AP.stuck = 0; }
  const diff = wrapAngle(Math.atan2(p.x - f.pos.x, p.z - f.pos.z) - f.yaw);
  return { pitch: Math.abs(diff) > 1.2 ? 0.35 : 0.7, roll: clamp(-diff * 2, -1, 1), yaw: 0, boost: false };
}

// ---------------------------------------------------------------- 操作
const keys = new Set();
const touch = { x: 0, y: 0, boost: false, id: null };
let gpPrev = [];
function anyKey(...codes) { return codes.some((c) => keys.has(c)); }
function readInput(dt) {
  let pitch = (anyKey('ArrowUp', 'KeyW') ? 1 : 0) - (anyKey('ArrowDown', 'KeyS') ? 1 : 0);
  let roll = (anyKey('ArrowRight', 'KeyD') ? 1 : 0) - (anyKey('ArrowLeft', 'KeyA') ? 1 : 0);
  let yaw = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
  let boost = anyKey('ShiftLeft', 'ShiftRight') || touch.boost;
  pitch += -touch.y;
  roll += touch.x;
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g) : null;
  if (gp) {
    const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    roll += dz(gp.axes[0] || 0);
    pitch += -dz(gp.axes[1] || 0);
    boost = boost || gp.buttons[0]?.pressed || gp.buttons[7]?.pressed;
    const b = gp.buttons.map((x) => x.pressed);
    if (b[2] && !gpPrev[2]) act('photo');
    if (b[3] && !gpPrev[3]) act('view');
    if (b[1] && !gpPrev[1]) act('map');
    if (b[9] && !gpPrev[9]) act('pause');
    gpPrev = b;
  }
  if (S.settings.invert) pitch = -pitch;
  pitch = clamp(pitch, -1, 1);
  roll = clamp(roll, -1, 1);
  const k = damp(7, dt);
  G.inp.pitch += (pitch - G.inp.pitch) * k;
  G.inp.roll += (roll - G.inp.roll) * k;
  G.inp.yaw += (yaw - G.inp.yaw) * k;
  G.inp.boost = boost;
  const manual = Math.abs(pitch) > 0.2 || Math.abs(roll) > 0.2 || boost;
  if (manual && G.auto) {
    G.auto = false;
    syncAutoUI();
    toast('自分で操縦にもどりました');
  }
  document.querySelectorAll('[data-act="boost"]').forEach((b) => b.classList.toggle('on', boost));
  return G.inp;
}

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  firstGesture();
  if (G.mode === 'menu') {
    if (anyOverlay()) {
      if (e.code === 'Escape') closeOverlays();
      return;
    }
    if (e.code === 'Enter' || e.code === 'Space') startFlight();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= CRAFTS.length) chooseCraft(CRAFTS[n - 1]);
    return;
  }
  if (G.mode === 'pause') {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (anyOverlay(true)) closeOverlays(true);
      else resume();
    }
    return;
  }
  if (G.mode !== 'play') return;
  const map = { KeyZ: 'photo', KeyX: 'map', KeyC: 'view', KeyV: 'auto', Escape: 'pause', KeyP: 'pause', KeyM: 'music', Space: 'dialog', KeyH: 'help', KeyB: 'horn', KeyR: 'reset' };
  if (map[e.code]) act(map[e.code]);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function act(a) {
  if (G.mode !== 'play') return;
  sound.click();
  if (a === 'photo') G.photoReq = true;
  else if (a === 'map') { G.mapOn = !G.mapOn; $('mapWrap').classList.toggle('hidden', !G.mapOn); }
  else if (a === 'view') {
    G.camMode = (G.camMode + 1) % 3;
    S.settings.cam = G.camMode;
    SV.save();
    cam.snap = true;
    cam.cine = null;
    $('viewLbl').textContent = ['うしろ', '遠く', '一人称'][G.camMode];
    $('viewBadge').textContent = G.camMode + 1;
  } else if (a === 'auto') {
    G.auto = !G.auto;
    if (G.auto) apReset();
    syncAutoUI();
  } else if (a === 'pause') pause();
  else if (a === 'music') toggleMusic();
  else if (a === 'dialog') closeDialog();
  else if (a === 'help') { pause(); openOverlay('help'); }
  else if (a === 'horn') { if (G.craft.ground) sound.horn(G.craft.id); }
  else if (a === 'reset') {
    placeCraft();
    G.auto = false;
    syncAutoUI();
    toast('スタート地点にもどりました');
  }
}
function syncAutoUI() {
  $('autoTag').classList.toggle('hidden', !G.auto);
  document.querySelectorAll('[data-act="auto"]').forEach((b) => b.classList.toggle('on', G.auto));
}
document.querySelectorAll('#hud [data-act], #touch [data-act]').forEach((b) => {
  const a = b.dataset.act;
  if (a === 'boost') {
    const on = (v) => (e) => { e.preventDefault(); touch.boost = v; };
    b.addEventListener('pointerdown', on(true));
    b.addEventListener('pointerup', on(false));
    b.addEventListener('pointerleave', on(false));
    b.addEventListener('pointercancel', on(false));
  } else {
    b.addEventListener('click', (e) => { e.stopPropagation(); act(a); });
  }
});
$('pauseBtn').addEventListener('click', () => act('pause'));

// スマホのスティック
{
  const st = $('stick'), kn = $('knob');
  const move = (e) => {
    const r = st.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    touch.x = x;
    touch.y = y;
    kn.style.transform = `translate(${x * 44}px, ${y * 44}px)`;
  };
  st.addEventListener('pointerdown', (e) => { touch.id = e.pointerId; st.setPointerCapture(e.pointerId); move(e); });
  st.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) move(e); });
  const end = (e) => {
    if (e.pointerId !== touch.id) return;
    touch.id = null; touch.x = touch.y = 0;
    kn.style.transform = '';
  };
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
}

// ドラッグで見まわす
const cam = { zoom: 1, vel: new THREE.Vector3(), prev: new THREE.Vector3(), pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitch: 0, drag: null, lastDrag: -99, snap: true, cine: null, fov: 60 };
renderer.domElement.addEventListener('pointerdown', (e) => {
  firstGesture();
  cam.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!cam.drag || cam.drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - cam.drag.x) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - cam.drag.y) * 0.004, -0.45, 1.1);
  cam.drag.x = e.clientX;
  cam.drag.y = e.clientY;
  cam.lastDrag = G.t;
});
const endDrag = () => { cam.drag = null; cam.lastDrag = G.t; };
// ホイールで近づく・はなれる
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 0.5, 2.5);
}, { passive: false });
// 2本指でピンチして近づく・はなれる(スマホ)
{
  const pts = new Map();
  let pd = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => pts.set(e.pointerId, [e.clientX, e.clientY]));
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pd) cam.zoom = clamp(cam.zoom * (pd / d), 0.5, 2.5);
      pd = d;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); pd = 0; };
  renderer.domElement.addEventListener('pointerup', up);
  renderer.domElement.addEventListener('pointercancel', up);
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- カメラ
const cockpit = new Cockpit();
window.__cockpit = cockpit; // 動作確認用
const head = new THREE.Vector3();
let headLag = 0;
const lookQ = new THREE.Quaternion(), fpQ = new THREE.Quaternion(), _eL = new THREE.Euler();
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();
function updateCamera(dt) {
  const f = G.flyer, c = f.c, w = G.world;
  const [dist, h] = c.cam;
  f.forward(_f);
  if (!cam.drag && G.t - cam.lastDrag > 1.6) {
    cam.yaw += (0 - cam.yaw) * damp(1.4, dt);
    cam.pitch += (0 - cam.pitch) * damp(1.4, dt);
  }
  const mode = G.mode === 'menu' ? 'menu' : ['chase', 'cine', 'cockpit'][G.camMode];
  G.model.root.visible = mode !== 'cockpit';
  document.body.classList.toggle('fp', mode === 'cockpit');
  let rate = 3.5;
  if (mode === 'menu') {
    const a = G.t * 0.07 + cam.yaw;
    _d.set(Math.sin(a) * dist * 1.7, (c.ground ? h * 0.7 : h * 1.3 + 8) + cam.pitch * 30, Math.cos(a) * dist * 1.7).add(f.pos);
    _l.copy(f.pos);
    if (c.balloon) _l.y += 12;
    rate = 2;
  } else if (mode === 'chase') {
    const yaw = f.yaw + cam.yaw;
    const p = (c.balloon ? 0.32 : 0.16) + cam.pitch;
    _d.set(-Math.sin(yaw) * Math.cos(p), Math.sin(p), -Math.cos(yaw) * Math.cos(p)).multiplyScalar(dist * cam.zoom).add(f.pos);
    _d.y += h * 0.35 * cam.zoom;
    if (c.balloon) {
      _d.y += 8;
      _l.copy(f.pos).y += 11;
    } else if (c.ground) _l.copy(f.pos).addScaledVector(_f, 6).y += 1.4;
    else _l.copy(f.pos).addScaledVector(_f, 14).y += 2;
  } else if (mode === 'cine') {
    if (!cam.cine || f.pos.distanceTo(cam.cine) > 340) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const lead = c.balloon ? 90 : 160 + f.speed * 2;
      cam.cine = f.pos.clone().addScaledVector(_f.clone().setY(0).normalize(), lead);
      cam.cine.x += Math.cos(f.yaw) * 45 * side;
      cam.cine.z -= Math.sin(f.yaw) * 45 * side;
      cam.cine.y = Math.max(f.pos.y + (Math.random() * 30 - 8), w.surfaceAt(cam.cine.x, cam.cine.z).y + 6);
      cam.snap = true;
    }
    _d.copy(cam.cine);
    _l.copy(f.pos);
    if (c.balloon) _l.y += 10;
  } else {
    // 一人称:目の位置にカメラを置き、のりものといっしょに動く
    const o = EYE[c.id];
    const vq = G.model.root.quaternion;
    // 体のゆれ:エンジンの振動と、地面のでこぼこ
    const vib = (f.onGround || c.ground ? 0.006 + Math.min(Math.abs(f.speed), 30) * 0.0006 : 0.0015) + f.throttle * 0.002;
    head.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0);
    // 旋回すると頭が少し外へ(G のかんじ)
    headLag += ((c.ground ? -f.roll * 0.6 : Math.sin(f.roll) * 0.05) - headLag) * damp(3, dt);
    head.x += headLag * 0.15;
    _d.set(o[0], o[1], o[2]).add(head).applyQuaternion(vq).add(f.pos);
    lookQ.setFromEuler(_eL.set(-cam.pitch * 0.9 - LOOK_DOWN[c.id], Math.PI + cam.yaw * 1.3, 0, 'YXZ'));
    fpQ.copy(vq).multiply(lookQ);
    rate = 1000;
  }
  if (cam.snap) {
    cam.pos.copy(_d);
    cam.look.copy(_l);
    cam.snap = false;
  } else {
    cam.pos.lerp(_d, damp(rate, dt));
    cam.look.lerp(_l, damp(mode === 'cockpit' ? 60 : 9, dt));
  }
  const s = w.surfaceAt(cam.pos.x, cam.pos.z);
  if (mode !== 'cockpit') {
    cam.pos.y = Math.max(cam.pos.y, s.y + (c.ground || f.onGround ? 1.2 : 3));
    // 建物の中にカメラが入らないように
    w.collide(cam.pos, 1.5, false);
  }
  if (dt > 0) cam.vel.subVectors(cam.pos, cam.prev).divideScalar(dt);
  cam.prev.copy(cam.pos);
  camera.position.copy(cam.pos);
  if (G.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * G.shake;
    camera.position.y += (Math.random() - 0.5) * G.shake;
    G.shake = Math.max(0, G.shake - dt * 3);
  }
  camera.up.set(0, 1, 0);
  if (mode === 'cockpit') camera.quaternion.copy(fpQ);
  else camera.lookAt(cam.look);
  if (mode === 'chase' && !c.balloon && !c.ground) camera.rotateZ(-f.roll * 0.22);
  const over = c.balloon || c.ground ? 0 : clamp((f.speed - c.cruise) / Math.max(c.boost - c.cruise, 1), 0, 1);
  cam.fov += ((mode === 'cockpit' ? 70 : 60) + over * 9 - cam.fov) * damp(2, dt);
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- けむり・しぶき・土ぼこり
const puffs = [];
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  for (let i = 0; i < 48; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false;
    sp.userData = { life: 0, max: 1, v: new THREE.Vector3(), grow: 1 };
    scene.add(sp);
    puffs.push(sp);
  }
}
let puffI = 0;
function puff(pos, color, n = 6, size = 2, spread = 2, life = 1.4, up = 1.5) {
  for (let i = 0; i < n; i++) {
    const p = puffs[puffI++ % puffs.length];
    p.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * spread);
    p.material.color.set(color);
    p.userData.life = p.userData.max = life * (0.7 + Math.random() * 0.6);
    p.userData.v.set((Math.random() - 0.5) * 2, up * (0.5 + Math.random()), (Math.random() - 0.5) * 2);
    p.userData.grow = size;
    p.scale.setScalar(size * 0.4);
    p.visible = true;
  }
}
let dustT = 0;
function updatePuffs(dt) {
  for (const p of puffs) {
    const u = p.userData;
    if (!p.visible) continue;
    u.life -= dt;
    if (u.life <= 0) { p.visible = false; continue; }
    const k = u.life / u.max;
    p.position.addScaledVector(u.v, dt);
    p.scale.setScalar(u.grow * (0.4 + (1 - k) * 1.4));
    p.material.opacity = 0.55 * k;
  }
  // 車・原付・滑走する飛行機の土ぼこり
  const f = G.flyer;
  if ((f.c.ground || f.onGround) && Math.abs(f.speed) > 9 && !G.course.night) {
    dustT -= dt;
    if (dustT < 0) {
      dustT = 0.12;
      _v.set(-Math.sin(f.yaw) * 2, 0.2 - (f.c.gearH || 0), -Math.cos(f.yaw) * 2).add(f.pos);
      puff(_v, 0xd8ccb0, 1, f.c.ground ? 1.6 : 2.5, 1, 1.0, 0.6);
    }
  }
}

// ---------------------------------------------------------------- 1コマごとの処理
const fpActive = () => (G.mode === 'play' || G.mode === 'pause') && G.camMode === 2;
const _sunC = new THREE.Color(), _skyC = new THREE.Color(), _gndC = new THREE.Color();
function updateCockpit(dt) {
  const f = G.flyer, c = f.c, sky = G.course.sky;
  if (cockpit.id !== c.id) cockpit.set(c.id);
  const head2 = head.clone();
  cockpit.update(dt, G.model.root.quaternion, lookQ, G.world.sunDir, {
    sunColor: _sunC.set(sky.sun), sunI: sky.sunI, sky: _skyC.set(sky.hemiSky), ground: _gndC.set(sky.hemiGround), hemiI: sky.hemiI,
  }, {
    head: head2, speed: f.speed, alt: f.pos.y, vario: f.vel.y || 0, rpm: sound.rpm || 0, throttle: f.throttle,
    roll: f.roll, pitch: f.pitch, heading: Math.atan2(Math.sin(f.yaw), -Math.cos(f.yaw)),
    inRoll: G.inp.roll, inPitch: G.inp.pitch, burner: f.burner, slip: G.inp.yaw * 0.3 - f.roll * 0.05,
  });
}

function step(dt) {
  const w = G.world, f = G.flyer;
  const playing = G.mode === 'play';
  let inp = playing ? readInput(dt) : null;
  if (!playing || G.auto) inp = autopilot();
  const ev = f.update(dt, inp, w, G.t);
  w.update(G.t, dt, camera, f.pos);
  updateCamera(dt);
  if (fpActive()) updateCockpit(dt);
  updatePuffs(dt);

  const cd = w.cloudDensity(camera.position);
  $('cloudfog').style.opacity = (cd * 0.8).toFixed(3);
  // カメラと機体の距離・近づく速さ(ドップラー効果:近づくと高く、遠ざかると低く聞こえる)
  _v.subVectors(camera.position, f.pos);
  const dist = _v.length();
  const vr = dist > 1 ? f.vel.dot(_v) / dist - cam.vel.dot(_v) / dist : 0;
  const dop = clamp(343 / (343 - clamp(vr, -150, 150)), 0.7, 1.5);
  sound.flight({
    id: G.craft.id, speed: f.speed, throttle: f.throttle, onWater: f.onWater,
    burner: f.burner, cloud: cd, active: playing, dist, dop: G.camMode === 1 ? dop : 1,
  });
  if (!playing) return;

  for (const e of ev) handleEvent(e);
  // ひかりの粒
  const got = w.collectMotes(f.pos, G.t, f.c.balloon ? 18 : f.c.id === 'jet' ? 16 : 13);
  for (let i = 0; i < got; i++) {
    G.chain = G.t - G.lastMote < 5 ? G.chain + 1 : 1;
    G.lastMote = G.t;
    sound.chime(G.chain - 1);
    S.motes++;
    if (G.chain > S.bestChain) S.bestChain = G.chain;
    if (G.chain >= 30) ach('chain');
  }
  if (got) SV.save();
  if (G.t - G.lastMote > 5 && G.chain) G.chain = 0;
  if (f.c.ground && f.odo > 2000) ach('road');

  // 見どころ
  for (const s of w.spots) {
    if (G.found.has(s.id)) continue;
    if (Math.hypot(f.pos.x - s.x, f.pos.z - s.z) > s.r) continue;
    if (s.minY && f.pos.y < s.minY) continue;
    if (s.maxY && f.pos.y > s.maxY) continue;
    G.found.add(s.id);
    if (SV.addStamp(G.course.id, s.id)) {
      showDialog(s.name, s.desc, 11);
      sound.jingle();
      toast(`スタンプをもらいました:<b>${s.name}</b>`);
      const list = S.stamps[G.course.id] || [];
      if (list.length >= w.spots.length) ach('course');
      const total = COURSES.reduce((n, c) => n + (S.stamps[c.id] || []).length, 0);
      if (total >= COURSES.length * 4) ach('master');
    } else {
      toast(`<b>${s.name}</b> の上をとおりました`);
    }
  }
  // アーチ
  for (const msg of w.checkGates(f.pos, G.t)) {
    toast(`<b>${msg}</b>`);
    sound.sparkle();
    ach('gate');
  }
  // ちいさな発見
  if (cd > 0.25 && camera.position.distanceTo(f.pos) < 60) ach('cloud');
  if (f.pos.y > 1000) ach('high');
  if (f.overWater && f.agl < 8 && !f.onWater && !f.c.balloon) {
    G.skimT += dt;
    if (G.skimT > 5) ach('skim');
  } else G.skimT = 0;
  if (f.c.glider) {
    if (f.liftNow > 0.3) {
      if (G.thermalBase === null) G.thermalBase = f.pos.y;
      if (f.pos.y - G.thermalBase > 100) ach('thermal');
    } else if (f.liftNow < -0.5) G.thermalBase = null;
  }
  if (f.c.balloon) {
    G.drift += f.drift || 0;
    if (G.drift > 1000) ach('drift');
  }
  updateDialog(dt);
}

function handleEvent(e) {
  if (e.type === 'bump' && G.t - G.bumpT > 1.5) {
    G.bumpT = G.t;
    puff(G.flyer.pos, 0xcbbd9a, 8, 4, 6, 1.4, 2);
    sound.bump();
    G.shake = 1.2;
    hint('ふわっ…地面が近いみたい。↑ で機首を上げよう');
  } else if (e.type === 'splash' && G.t - G.bumpT > 1.5) {
    G.bumpT = G.t;
    puff(G.flyer.pos, 0xffffff, 12, 5, 8, 1.4, 6);
    sound.splash();
    G.shake = 1;
    hint('ざぶん!水しぶきが上がった');
  } else if (e.type === 'splashdown') {
    puff(G.flyer.pos, 0xffffff, 10, 4, 6, 1.4, 4);
    sound.splash();
    toast('水の上におりました。Shift で加速 → ↑ で離水');
    ach('splash');
  } else if (e.type === 'takeoff') {
    toast('離水しました!');
  } else if (e.type === 'liftoff') {
    toast('離陸しました!');
    ach('takeoff');
  } else if (e.type === 'touchdown') {
    const soft = e.sink < 1.6;
    _v.copy(G.flyer.pos);
    _v.y -= G.flyer.c.gearH;
    puff(_v, 0xe8e4dc, 8, 3, 4, 1.6, 1);
    sound.bump();
    G.shake = e.sink > 3 ? 0.8 : 0.3;
    toast(`着陸しました(接地 ${e.sink.toFixed(1)} m/秒${soft ? '・なめらか!' : ''})${e.runway ? '' : '<br><small>滑走路の外でした</small>'}`);
    ach('landing');
    if (soft && e.runway) ach('butter');
    hint('↓ でブレーキ。止まったら ↑ でもう一度離陸できます', 6);
  } else if (e.type === 'stopped') {
    toast('止まりました。↑ を押しつづけると、また離陸できます');
  } else if (e.type === 'winch') {
    hint('ウインチで引っぱっています。そのまま空へ!', 4);
  } else if (e.type === 'shore' && G.t - G.bumpT > 2) {
    G.bumpT = G.t;
    hint(G.craft.ground ? 'ここから先は水。向きをかえよう(橋があればわたれます)' : '岸についた。向きをかえよう');
  } else if (e.type === 'crash' && G.t - G.bumpT > 1.2) {
    G.bumpT = G.t;
    sound.bump();
    G.shake = 0.6;
    hint('ゴツン!ゆっくり行こう');
  } else if (e.type === 'land' && G.t - G.bumpT > 0.8) {
    G.bumpT = G.t;
    sound.bump();
    G.shake = 0.5;
  } else if (e.type === 'edge' && G.t - G.edgeT > 6) {
    G.edgeT = G.t;
    hint('この先は霧がこくて進めないみたい');
  }
}

function ach(id) {
  if (!SV.addAch(id)) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  toast(`ちいさな発見:<b>${a.name}</b><br><small>${a.desc}</small>`, 'ach');
  sound.sparkle();
}

// ---------------------------------------------------------------- 表示
function toast(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + cls;
  d.innerHTML = html;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 4300);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
let hintTimer = 0;
function hint(text, sec = 4) {
  const h = $('hint');
  h.textContent = text;
  h.style.opacity = 1;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.style.opacity = 0; }, sec * 1000);
}

const DLG = { text: '', shown: 0, life: 0, open: false };
function showDialog(title, text, life = 10) {
  $('dlgTitle').textContent = title;
  $('dlgText').textContent = '';
  DLG.text = text;
  DLG.shown = 0;
  DLG.life = life;
  DLG.open = true;
  const d = $('dialog');
  d.classList.remove('hidden');
  d.style.animation = 'none';
  void d.offsetWidth;
  d.style.animation = '';
}
function updateDialog(dt) {
  if (!DLG.open) return;
  if (DLG.shown < DLG.text.length) {
    DLG.shown = Math.min(DLG.text.length, DLG.shown + dt * 22);
    $('dlgText').textContent = DLG.text.slice(0, Math.floor(DLG.shown));
  } else {
    DLG.life -= dt;
    if (DLG.life <= 0) closeDialog(true);
  }
}
function closeDialog(force = false) {
  if (!DLG.open) return;
  if (!force && DLG.shown < DLG.text.length) {
    DLG.shown = DLG.text.length;
    $('dlgText').textContent = DLG.text;
    return;
  }
  DLG.open = false;
  $('dialog').classList.add('hidden');
}
$('dialog').addEventListener('click', () => closeDialog());

// 計器
const compass = $('compass').getContext('2d');
const mini = $('minimap').getContext('2d');
let hudT = 0;
function updateHud(dt) {
  hudT += dt;
  if (hudT < 0.1) return;
  hudT = 0;
  const f = G.flyer, w = G.world, c = f.c;
  $('gAlt').textContent = Math.max(0, Math.round(f.pos.y));
  $('gSpd').textContent = Math.round(f.speed * 3.6);
  let extra = '';
  if (c.glider) {
    const l = f.liftNow || 0;
    extra = `<span class="k">上昇気流</span>&nbsp;<b style="color:${l > 0 ? '#3d8a6a' : '#9a6a5a'}">${l > 0 ? '+' : ''}${l.toFixed(1)}</b>`;
  } else if (c.balloon) {
    extra = `<span class="k">熱</span>&nbsp;<b>${'■'.repeat(Math.round(f.heat * 6))}${'□'.repeat(6 - Math.round(f.heat * 6))}</b>`;
  } else if (f.onWater) extra = '<b>水上</b>';
  else if (f.onGround) extra = '<b>地上</b>';
  else if (G.flyer.model.gear) extra = `<span class="k">車輪</span>&nbsp;<b>${f.gearT > 0.9 ? '出' : f.gearT < 0.1 ? 'しまう' : '…'}</b>`;
  else if (c.ground) extra = `<span class="k">エンジン</span>&nbsp;<b>${Math.round((sound.rpm || 0) / 100) * 100}</b><span class="u">rpm</span>`;
  $('gExtra').innerHTML = extra;
  const list = S.stamps[G.course.id] || [];
  $('spotTxt').textContent = `${list.length}/${w.spots.length}`;
  $('moteTxt').textContent = S.motes;
  $('chainTxt').textContent = G.chain > 1 ? `♪×${G.chain}` : '';
  $('photoBadge').textContent = S.photos.length;
  drawCompass();
  if (G.mapOn) drawMap();
}
function drawCompass() {
  const g = compass, f = G.flyer;
  const W = 84, r = 34;
  g.clearRect(0, 0, W, W);
  g.save();
  g.translate(W / 2, W / 2);
  const head = Math.atan2(Math.sin(f.yaw), -Math.cos(f.yaw)); // 北(-z)からの向き
  g.rotate(-head);
  g.font = '15px "Patrick Hand", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [['N', 0, '#c25b45'], ['E', Math.PI / 2, '#3a3f5c'], ['S', Math.PI, '#3a3f5c'], ['W', -Math.PI / 2, '#3a3f5c']].forEach(([t, a, col]) => {
    g.fillStyle = col;
    g.fillText(t, Math.sin(a) * (r - 6), -Math.cos(a) * (r - 6));
  });
  // 気球には風の矢印(今の高さ・上・下)
  if (f.c.balloon) {
    const arrow = (y, col, len) => {
      const wd = G.world.windAt(y);
      const a = Math.atan2(wd.x, -wd.z);
      g.save();
      g.rotate(a);
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, len * 0.6);
      g.lineTo(0, -len * 0.6);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -len * 0.6 - 6);
      g.lineTo(-5, -len * 0.6 + 2);
      g.lineTo(5, -len * 0.6 + 2);
      g.fill();
      g.restore();
    };
    arrow(f.pos.y + 150, 'rgba(111,166,194,0.55)', 30);
    arrow(Math.max(0, f.pos.y - 150), 'rgba(194,91,69,0.45)', 30);
    arrow(f.pos.y, '#3a6f9a', 40);
  }
  g.restore();
  if (!f.c.balloon) {
    g.fillStyle = '#3a3f5c';
    g.beginPath();
    g.moveTo(W / 2, W / 2 - 13);
    g.lineTo(W / 2 - 8, W / 2 + 9);
    g.lineTo(W / 2, W / 2 + 4);
    g.lineTo(W / 2 + 8, W / 2 + 9);
    g.closePath();
    g.fill();
  }
}
function drawMap() {
  const g = mini, S2 = 220, m = G.map, w = G.world, f = G.flyer;
  const toPx = (x, z) => [(x / m.range * 0.5 + 0.5) * S2, (z / m.range * 0.5 + 0.5) * S2];
  g.clearRect(0, 0, S2, S2);
  g.drawImage(m.canvas, 0, 0, S2, S2);
  // 道
  if (w.roads.length) {
    g.strokeStyle = 'rgba(110,108,114,0.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    for (const [x1, z1, x2, z2] of w.roads) {
      const a = toPx(x1, z1), b = toPx(x2, z2);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.stroke();
  }
  // 滑走路
  if (w.runway) {
    const st = G.course.strip;
    const [x1, z1] = w.runway.frame.toWorld(-st.len / 2, 0), [x2, z2] = w.runway.frame.toWorld(st.len / 2, 0);
    const a = toPx(x1, z1), b = toPx(x2, z2);
    g.strokeStyle = '#3a3f5c';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.strokeStyle = '#f5edd3';
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.stroke();
    g.setLineDash([]);
  }
  // ひかりの道
  g.strokeStyle = 'rgba(255,240,170,0.9)';
  g.setLineDash([2, 5]);
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i <= 120; i++) {
    const p = apPath().cv.getPointAt((i % 120) / 120);
    const [x, y] = toPx(p.x, p.z);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  g.setLineDash([]);
  const got = S.stamps[G.course.id] || [];
  g.font = '15px "Klee One", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const s of w.spots) {
    const [x, y] = toPx(s.x, s.z);
    const ok = got.includes(s.id);
    g.fillStyle = ok ? '#c25b45' : 'rgba(58,63,92,0.75)';
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f5edd3';
    g.fillText(ok ? '✿' : '?', x, y + 1);
  }
  for (const th of w.thermals) {
    const [x, y] = toPx(th.x, th.z);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, 5, 0, Math.PI * 1.6);
    g.stroke();
  }
  const [px, py] = toPx(f.pos.x, f.pos.z);
  g.save();
  g.translate(px, py);
  g.rotate(Math.atan2(Math.sin(f.yaw), -Math.cos(f.yaw)) + Math.PI);
  g.fillStyle = '#3a3f5c';
  g.strokeStyle = '#f5edd3';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(-7, -7);
  g.lineTo(0, -3);
  g.lineTo(7, -7);
  g.closePath();
  g.stroke();
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------- 写真
function takePhoto() {
  const src = renderer.domElement;
  const W = 640, H = 360;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const sr = src.width / src.height, dr = W / H;
  let sw, sh;
  if (sr > dr) { sh = src.height; sw = sh * dr; } else { sw = src.width; sh = sw / dr; }
  g.filter = 'saturate(0.88) sepia(0.18) contrast(0.96) brightness(1.04)';
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
  g.filter = 'none';
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(60,40,10,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  // むかしのフィルムカメラのような日付
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `'${p2(d.getFullYear() % 100)} ${p2(d.getMonth() + 1)} ${p2(d.getDate())}`;
  g.font = 'bold 22px "Courier New", monospace';
  g.textAlign = 'right';
  g.shadowColor = 'rgba(255,120,30,0.8)';
  g.shadowBlur = 6;
  g.fillStyle = '#ffa04a';
  g.fillText(stamp, W - 22, H - 20);
  g.shadowBlur = 0;
  const url = c.toDataURL('image/jpeg', 0.8);
  S.photos.push({ img: url, course: G.course.id, craft: G.craft.id, date: Date.now() });
  if (S.photos.length > 36) S.photos.shift();
  S.photoCount = (S.photoCount || 0) + 1;
  const ok = SV.save();
  sound.shutter();
  const fl = $('flash');
  fl.classList.remove('on');
  void fl.offsetWidth;
  fl.classList.add('on');
  const pol = $('polaroid');
  pol.querySelector('img').src = url;
  pol.querySelector('span').textContent = `${G.course.name}にて`;
  pol.classList.remove('hidden');
  pol.style.animation = 'none';
  void pol.offsetWidth;
  pol.style.animation = '';
  clearTimeout(takePhoto.tm);
  takePhoto.tm = setTimeout(() => pol.classList.add('hidden'), 3000);
  if (!ok) toast('アルバムがいっぱいで保存できませんでした。古い写真を消してください');
  if (S.photoCount >= 10) ach('photo');
}

// ---------------------------------------------------------------- メニュー
const thumbs = {};
function makeThumbs() {
  const ts = new THREE.Scene();
  ts.add(new THREE.HemisphereLight(0xffffff, 0x9a8a6a, 1.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.9);
  dl.position.set(5, 9, 7);
  ts.add(dl);
  const tc = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);
  const S0 = 200;
  renderer.setPixelRatio(1);
  renderer.setSize(S0, S0, false);
  renderer.setClearColor(0xf5edd3);
  const c2 = document.createElement('canvas');
  c2.width = c2.height = S0;
  const g = c2.getContext('2d');
  for (const cr of CRAFTS) {
    const m = buildAircraft(cr.id);
    m.root.rotation.y = cr.balloon ? 0.4 : -0.6;
    m.root.rotation.z = cr.balloon ? 0 : 0.12;
    ts.add(m.root);
    const box = new THREE.Box3().setFromObject(m.root);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    tc.position.copy(sph.center).add(new THREE.Vector3(0.9, 0.55, 1.2).normalize().multiplyScalar(sph.radius * 3.9));
    tc.lookAt(sph.center);
    renderer.render(ts, tc);
    g.clearRect(0, 0, S0, S0);
    g.drawImage(renderer.domElement, 0, 0, S0, S0);
    thumbs[cr.id] = c2.toDataURL('image/png');
    ts.remove(m.root);
  }
  renderer.setPixelRatio(PR);
  renderer.setSize(innerWidth, innerHeight);
}

const LAND = { islands: '#6f9a58', canyon: '#b9805a', fjord: '#7d8494', aurora: '#30445e', hills: '#86b462', town: '#8aae66' };
function coursePic(course) {
  const f = makeHeightField(course);
  const pts = silhouette(course, f);
  const max = Math.max(200, ...pts);
  const sky = course.sky;
  const id = 'g' + course.id;
  let d = 'M0,54 ';
  pts.forEach((h, i) => { d += `L${(i / (pts.length - 1) * 92).toFixed(1)},${(46 - (h / max) * 32).toFixed(1)} `; });
  d += 'L92,54 Z';
  const snow = course.id === 'fjord' ? `<path d="${d}" fill="#f4f7f8" clip-path="url(#c${course.id})"/>` : '';
  return `<svg class="pic" viewBox="0 0 92 54" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hexToCss(sky.top)}"/><stop offset="1" stop-color="${hexToCss(sky.horizon)}"/></linearGradient><clipPath id="c${course.id}"><rect width="92" height="26"/></clipPath></defs><rect width="92" height="54" fill="url(#${id})"/>${course.night ? '<circle cx="20" cy="10" r="1" fill="#fff"/><circle cx="60" cy="7" r="1" fill="#fff"/><circle cx="78" cy="14" r="0.8" fill="#fff"/><path d="M8 20 Q40 6 84 18" stroke="#6effb0" stroke-width="4" fill="none" opacity="0.5"/>' : ''}<rect y="44" width="92" height="10" fill="${hexToCss(sky.water)}"/><path d="${d}" fill="${LAND[course.id]}"/>${snow}</svg>`;
}

let menuFocus = 'craft';
function buildMenu() {
  const cl = $('craftList');
  cl.innerHTML = '';
  CRAFTS.forEach((cr, i) => {
    const b = document.createElement('button');
    b.className = 'craft';
    b.dataset.id = cr.id;
    b.innerHTML = `<span class="cap">${i + 1}</span><span class="disc"><img alt="" src="${thumbs[cr.id]}"></span>${S.flown.includes(cr.id) ? '<span class="badge">♪</span>' : ''}<span class="nm">${cr.name}</span>`;
    b.addEventListener('click', () => { firstGesture(); chooseCraft(cr); });
    cl.appendChild(b);
  });
  const co = $('courseList');
  co.innerHTML = '';
  COURSES.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'course';
    b.dataset.id = c.id;
    const n = (S.stamps[c.id] || []).length;
    b.innerHTML = `${c.pic}<span><span class="nm">${c.name}</span><span class="sb">${c.sub}</span><span class="st">${'✿'.repeat(n)}${'・'.repeat(Math.max(0, 4 - n))}</span></span>`;
    b.addEventListener('click', () => { firstGesture(); chooseCourse(c); });
    co.appendChild(b);
  });
  refreshMenu();
}
function refreshMenu() {
  document.querySelectorAll('.craft').forEach((b) => b.classList.toggle('sel', b.dataset.id === G.craft.id));
  document.querySelectorAll('.course').forEach((b) => b.classList.toggle('sel', b.dataset.id === G.course.id));
  const dots = (n) => `<i>${'●'.repeat(n)}${'○'.repeat(5 - n)}</i>`;
  if (menuFocus === 'craft') {
    const c = G.craft;
    $('mTitle').textContent = `${c.type}「${c.name}」`;
    $('mText').textContent = c.desc;
    $('mStats').innerHTML = `<span>速さ ${dots(c.stats[0])}</span><span>小回り ${dots(c.stats[1])}</span><span>のんびり ${dots(c.stats[2])}</span>`;
  } else {
    const c = G.course;
    const got = (S.stamps[c.id] || []).length;
    $('mTitle').textContent = c.name;
    $('mText').textContent = c.intro;
    $('mStats').innerHTML = `<span>見どころ <i>${'✿'.repeat(got)}${'・'.repeat(4 - got)}</i></span><span>${c.en}</span>`;
  }
  $('btnSound').classList.toggle('off', !S.settings.music);
}
function chooseCraft(cr) {
  menuFocus = 'craft';
  if (cr !== G.craft) setCraft(cr);
  sound.click();
  refreshMenu();
}
let courseBusy = false;
function chooseCourse(c) {
  menuFocus = 'course';
  refreshMenu();
  sound.click();
  if (c === G.course || courseBusy) return;
  courseBusy = true;
  $('mText').textContent = c.intro + '\n(景色を準備しています…)';
  $('loading').classList.remove('hidden');
  setTimeout(() => {
    loadCourse(c);
    courseBusy = false;
    refreshMenu();
    $('loading').classList.add('hidden');
  }, 60);
}

function showMenu() {
  G.mode = 'menu';
  G.auto = false;
  syncAutoUI();
  closeDialog(true);
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('menu').classList.remove('hidden');
  buildMenu();
  placeCraft();
}

function startFlight() {
  if (G.mode !== 'menu' || courseBusy) return;
  firstGesture();
  S.last = { craft: G.craft.id, course: G.course.id };
  if (!S.flown.includes(G.craft.id)) S.flown.push(G.craft.id);
  SV.save();
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (coarse) $('touch').classList.remove('hidden');
  $('boostLbl').textContent = G.craft.balloon ? 'バーナー' : G.craft.glider ? '—' : '加速';
  document.querySelectorAll('.groundOnly').forEach((b) => b.classList.toggle('hidden', !G.craft.ground));
  G.mode = 'play';
  G.camMode = S.settings.cam || 0;
  $('viewLbl').textContent = ['うしろ', '遠く', '一人称'][G.camMode];
  $('viewBadge').textContent = G.camMode + 1;
  G.chain = 0;
  G.drift = 0;
  G.thermalBase = null;
  placeCraft();
  G.found = new Set();
  showDialog(G.course.name, G.course.intro, 8);
  if (S.settings.start === 'air' && !G.craft.ground && !G.craft.seaplane) {
    hint(coarse ? 'スティックで操縦、加速ボタンで速く、写真ボタンで撮影' : '← → で曲がる / ↑ ↓ で上下 / Shift で加速 / Z で写真', 9);
    if (S.flown.length >= CRAFTS.length) ach('allcraft');
    return;
  }
  const H = {
    plane: '↑ を押しつづけると走りだし、速くなると離陸します(Shift でもっと速く)/ ← → で曲がる',
    biplane: '↑ を押しつづけると走りだし、速くなると離陸します(Shift でもっと速く)/ ← → で曲がる',
    jet: '↑ を押しつづけると走りだし、速くなると離陸します(Shift でもっと速く)/ ← → で曲がる',
    seaplane: 'まずは水の上。Shift で加速して、↑ で離水しよう',
    glider: 'Shift でウインチ(巻き上げ機)に引っぱってもらって離陸。白い粒がのぼる所で、くるくる回ると上がれます',
    balloon: '↑ か Shift でバーナー、↓ で弁。高さで風の向きがかわります(右下の矢印)',
    car: '↑ アクセル / ↓ ブレーキ・バック / ← → ハンドル / Shift で加速 / B でクラクション',
    scooter: '↑ アクセル / ↓ ブレーキ・バック / ← → ハンドル / Shift で加速 / B でクラクション',
  };
  const HT = {
    seaplane: 'まずは水の上。加速ボタンで速くして、スティックを上へたおすと離水',
    glider: '加速ボタンでウインチ発航。白い粒がのぼる所で、くるくる回ると上がれます',
    balloon: 'スティック上(加速ボタン)でバーナー、下で弁。高さで風の向きがかわります',
    plane: 'スティックを上にたおしつづけると走りだし、速くなると離陸します',
    biplane: 'スティックを上にたおしつづけると走りだし、速くなると離陸します',
    jet: 'スティックを上にたおしつづけると走りだし、速くなると離陸します',
    car: 'スティックを上でアクセル、下でブレーキ、左右でハンドル',
    scooter: 'スティックを上でアクセル、下でブレーキ、左右でハンドル',
  };
  hint(coarse ? HT[G.craft.id] || 'スティックで操縦、加速ボタンで速く、写真ボタンで撮影' : H[G.craft.id], 9);
  if (S.flown.length >= CRAFTS.length) ach('allcraft');
}

function pause() {
  if (G.mode !== 'play') return;
  G.mode = 'pause';
  $('pSound').textContent = `音楽:${S.settings.music ? 'オン' : 'オフ'}`;
  syncSettingsUI();
  $('pause').classList.remove('hidden');
  sound.flight({ active: false });
}
function resume() {
  closeOverlays(true);
  $('pause').classList.add('hidden');
  G.mode = 'play';
}
// 設定ボタン(ひとやすみ画面)
const QN = ['軽い', 'ふつう', 'きれい'];
function syncSettingsUI() {
  $('pSound').textContent = `音楽:${S.settings.music ? 'オン' : 'オフ'}`;
  $('pSfx').textContent = `効果音・エンジン音:${S.settings.sfx ? 'オン' : 'オフ'}`;
  $('pInvert').textContent = `上下の操作:${S.settings.invert ? '反転' : 'ふつう'}`;
  $('pStart').textContent = `スタート:${S.settings.start === 'air' ? '空から' : '滑走路から'}`;
  $('pQuality').textContent = `画質:${QN[quality]}`;
}
{
  const card = $('pause').querySelector('.card');
  const before = card.querySelector('[data-p="menu"]');
  for (const [p, id] of [['reset', 'pReset'], ['sfx', 'pSfx'], ['invert', 'pInvert'], ['start', 'pStart'], ['quality', 'pQuality']]) {
    const b = document.createElement('button');
    b.dataset.p = p;
    b.id = id;
    if (p === 'reset') b.textContent = 'スタート地点にもどる(R)';
    card.insertBefore(b, before);
  }
}
$('pause').addEventListener('click', (e) => {
  const p = e.target.dataset.p;
  if (!p) return;
  sound.click();
  if (p === 'resume') resume();
  else if (p === 'menu') showMenu();
  else if (p === 'sound') { toggleMusic(); $('pSound').textContent = `音楽:${S.settings.music ? 'オン' : 'オフ'}`; }
  else if (p === 'invert') { S.settings.invert = !S.settings.invert; SV.save(); syncSettingsUI(); }
  else if (p === 'sfx') { S.settings.sfx = !S.settings.sfx; SV.save(); sound.setSfx(S.settings.sfx); syncSettingsUI(); }
  else if (p === 'start') { S.settings.start = S.settings.start === 'air' ? 'runway' : 'air'; SV.save(); syncSettingsUI(); }
  else if (p === 'reset') { resume(); act('reset'); }
  else if (p === 'quality') {
    // 画質は、ページを読みこみなおして切りかえる
    S.settings.quality = (quality + 1) % 3;
    SV.save();
    location.reload();
  }
  else openOverlay(p);
});

function toggleMusic() {
  S.settings.music = !S.settings.music;
  SV.save();
  sound.setMusic(S.settings.music);
  refreshMenu();
  if (G.mode === 'play') toast(`音楽:${S.settings.music ? 'オン' : 'オフ'}`);
}

// ---------------------------------------------------------------- 重ねて出す画面
const OVERLAYS = ['album', 'journal', 'help', 'photoView'];
function anyOverlay() { return OVERLAYS.some((o) => !$(o).classList.contains('hidden')); }
function closeOverlays() {
  if (!$('photoView').classList.contains('hidden')) { $('photoView').classList.add('hidden'); return; }
  OVERLAYS.forEach((o) => $(o).classList.add('hidden'));
}
function openOverlay(name) {
  if (name === 'album') renderAlbum();
  if (name === 'journal') renderJournal();
  $(name).classList.remove('hidden');
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
  sound.click();
  b.closest('.overlay').classList.add('hidden');
}));
OVERLAYS.forEach((o) => $(o).addEventListener('click', (e) => { if (e.target === $(o)) $(o).classList.add('hidden'); }));
$('btnAlbum').addEventListener('click', () => { firstGesture(); sound.click(); openOverlay('album'); });
$('btnJournal').addEventListener('click', () => { firstGesture(); sound.click(); openOverlay('journal'); });
$('btnHelp').addEventListener('click', () => { firstGesture(); sound.click(); openOverlay('help'); });
$('btnSound').addEventListener('click', () => { firstGesture(); toggleMusic(); });
$('btnGo').addEventListener('click', startFlight);

let viewing = -1;
function renderAlbum() {
  const grid = $('albumGrid');
  grid.innerHTML = '';
  $('albumNote').textContent = S.photos.length
    ? `${S.photos.length}枚(写真はこのブラウザの中だけに保存されます。最大36枚)`
    : 'まだ写真がありません。飛んでいるときに Z(スマホは「写真」)でとれます。';
  S.photos.slice().reverse().forEach((p, ri) => {
    const i = S.photos.length - 1 - ri;
    const c = COURSES.find((x) => x.id === p.course);
    const d = new Date(p.date);
    const fig = document.createElement('figure');
    fig.innerHTML = `<img alt="" src="${p.img}"><figcaption>${c ? c.name : ''} ${d.getMonth() + 1}/${d.getDate()}</figcaption>`;
    fig.addEventListener('click', () => {
      viewing = i;
      $('photoImg').src = p.img;
      const cr = CRAFTS.find((x) => x.id === p.craft);
      $('photoCap').textContent = `${c ? c.name : ''}・${cr ? cr.name : ''}・${d.toLocaleDateString('ja-JP')}`;
      $('photoSave').href = p.img;
      $('photoSave').download = `hikouki-${p.date}.jpg`;
      $('photoView').classList.remove('hidden');
    });
    grid.appendChild(fig);
  });
}
$('photoDel').addEventListener('click', () => {
  if (viewing < 0) return;
  S.photos.splice(viewing, 1);
  SV.save();
  viewing = -1;
  $('photoView').classList.add('hidden');
  renderAlbum();
});

function renderJournal() {
  const allSpots = {};
  const html = [];
  const total = COURSES.reduce((n, c) => n + (S.stamps[c.id] || []).length, 0);
  html.push(`<div class="j-stats"><span>見どころ ${total} / ${COURSES.length * 4}</span><span>ひかりの粒 ${S.motes}</span><span>いちばん長いれんさ ${S.bestChain}</span><span>写真 ${S.photoCount || 0}枚</span><span>乗ったのりもの ${S.flown.length} / ${CRAFTS.length}</span></div>`);
  for (const c of COURSES) {
    const names = c.id === G.course.id && G.world ? G.world.spots : (allSpots[c.id] || spotNames(c));
    const got = S.stamps[c.id] || [];
    html.push(`<div class="j-course"><h3>${c.name}<small>${got.length} / ${names.length}</small></h3><div class="stamps">`);
    for (const s of names) {
      const ok = got.includes(s.id);
      html.push(`<div class="stamp ${ok ? 'got' : ''}"><div class="s">${ok ? s.name : '?'}</div>${ok ? '' : '<span>まだ</span>'}</div>`);
    }
    html.push('</div></div>');
  }
  html.push('<h2 style="font-size:19px">ちいさな発見</h2><div class="ach-grid">');
  for (const a of ACHIEVEMENTS) {
    const ok = S.ach.includes(a.id);
    html.push(`<div class="ach ${ok ? 'got' : ''}">${ok ? '★ ' + a.name : '☆ ???'}<small>${a.desc}</small></div>`);
  }
  html.push('</div>');
  $('journalBody').innerHTML = html.join('');
}
// 見どころの名前だけを知るための軽い呼び出し(地形は作らない)
const _spotCache = {};
function spotNames(course) {
  if (_spotCache[course.id]) return _spotCache[course.id];
  const f = makeHeightField(course);
  const stub = {
    R: Math.random, N: f.N, heightAt: f.heightAt, surfaceAt: (x, z) => ({ y: Math.max(0, f.heightAt(x, z)), water: f.heightAt(x, z) < 0 }),
    add: (o) => o, gate() {}, boats() {}, mist() {}, aurora() {}, floaters() {},
    addMesh() {}, updater() {}, solid() {}, road() {}, deck() {},
    findShore: () => ({ x: 0, z: 0 }),
  };
  _spotCache[course.id] = course.build(stub).map((s) => ({ id: s.id, name: s.name }));
  return _spotCache[course.id];
}

// ---------------------------------------------------------------- 起動
let gestured = false;
function firstGesture() {
  if (gestured) return;
  gestured = true;
  sound.init();
  sound.setMusic(S.settings.music);
  sound.setSfx(S.settings.sfx);
  sound.setKey(G.course.id);
  sound.playing = true;
}
addEventListener('pointerdown', firstGesture, { once: true });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.mode === 'play') pause();
});

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (G.mode === 'play' || G.mode === 'menu') {
    G.t += dt;
    step(dt);
    if (G.mode === 'play') updateHud(dt);
  }
  if (fpActive()) {
    // 景色を描いてから、奥行きを消して操縦席を重ねる
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    cockpit.render(renderer, camera.aspect, camera.fov);
    renderer.autoClear = true;
  } else renderer.render(scene, camera);
  if (G.photoReq) {
    G.photoReq = false;
    takePhoto();
  }
}

async function boot() {
  const bt = $('bootText');
  try {
    bt.textContent = '機体を組み立てています…';
    await new Promise((r) => setTimeout(r, 20));
    makeThumbs();
    bt.textContent = '景色を描いています…';
    await new Promise((r) => setTimeout(r, 20));
    for (const c of COURSES) c.pic = coursePic(c);
    loadCourse(G.course);
    setCraft(G.craft);
    showMenu();
    $('boot').classList.add('hidden');
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    bt.textContent = '準備中にエラーが起きました。ページを読みこみなおしてください。(' + e.message + ')';
  }
}
boot();
