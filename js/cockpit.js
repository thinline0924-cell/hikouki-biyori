// 一人称視点の操縦席:計器盤・窓わく・翼・プロペラ・ハンドルなど
// 景色とは別の小さな「操縦席の世界」を作り、景色の上に重ねて描く(地面にめりこまない)
// 座標は「のりもの」基準:目の位置が原点、前が +z、上が +y、左が +x
import * as THREE from 'three';
import { part, merge, G, lowpolyMat } from './util.js';
import { COL } from './models.js';

const PI = Math.PI;
const dark = 0x2f3346, panel = 0x3d4256, grip = 0x2a2a2a;

// 目の位置(機体の模型の中での座標)
// 前を見るときの、目線の下がり具合(計器やハンドルが見えるように)
export const LOOK_DOWN = { plane: 0.1, biplane: 0.06, glider: 0.1, seaplane: 0.1, jet: 0.1, balloon: 0.3, car: 0.08, scooter: 0.32 };
export const EYE = {
  plane: [0, 0.75, 1.15], biplane: [0, 1.3, -0.5], glider: [0, 0.6, 1.75], seaplane: [0, 0.95, 1.0],
  jet: [0.5, 0.75, 6.9], balloon: [0, 2.35, 0], car: [-0.32, 1.22, -0.05], scooter: [0, 1.75, -0.15],
};

function m(list, mat = lowpolyMat) {
  const x = new THREE.Mesh(merge(list), mat);
  return x;
}

function propGroup(color, len, y, z) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  const blades = m([
    part(G.box(0.2, len, 0.06), color, [0, 0, 0], [0, 0.3, 0]),
    part(G.cone(0.28, 0.5, 8), COL.red, [0, 0, 0.2], [PI / 2, 0, 0]),
  ]);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(len / 2, 24),
    new THREE.MeshBasicMaterial({ color: 0xe8eef2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  g.add(blades, disc);
  g.userData = { blades, disc };
  return g;
}

// 計器(まるいメーター)をキャンバスに描く
function makeGaugeTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tex };
}

function drawDial(g, cx, cy, r, item, style) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = style.face;
  g.beginPath();
  g.arc(0, 0, r, 0, PI * 2);
  g.fill();
  g.strokeStyle = style.rim;
  g.lineWidth = r * 0.08;
  g.stroke();
  if (item.kind === 'attitude') {
    // 人工水平儀:空と地面の境目が機体の傾きで回る
    g.save();
    g.beginPath();
    g.arc(0, 0, r * 0.9, 0, PI * 2);
    g.clip();
    g.rotate(item.roll || 0);
    const off = clamp(item.pitch || 0, -0.6, 0.6) * r * 1.4;
    g.fillStyle = '#7fb8e0';
    g.fillRect(-r, -r * 2 + off, r * 2, r * 2);
    g.fillStyle = '#a8784e';
    g.fillRect(-r, off, r * 2, r * 2);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r, off);
    g.lineTo(r, off);
    g.stroke();
    g.restore();
    g.strokeStyle = '#ffcc4a';
    g.lineWidth = r * 0.08;
    g.beginPath();
    g.moveTo(-r * 0.5, 0);
    g.lineTo(-r * 0.15, 0);
    g.lineTo(0, r * 0.12);
    g.lineTo(r * 0.15, 0);
    g.lineTo(r * 0.5, 0);
    g.stroke();
  } else if (item.kind === 'compass') {
    g.save();
    g.rotate(-(item.value || 0));
    g.fillStyle = style.text;
    g.font = `bold ${r * 0.32}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['N', 'E', 'S', 'W'].forEach((t, i) => {
      g.save();
      g.rotate((i * PI) / 2);
      g.fillStyle = i === 0 ? '#ff6a4a' : style.text;
      g.fillText(t, 0, -r * 0.66);
      g.restore();
    });
    for (let i = 0; i < 36; i++) {
      g.rotate(PI / 18);
      g.fillRect(-1, -r * 0.92, 2, i % 3 === 2 ? r * 0.14 : r * 0.07);
    }
    g.restore();
    g.fillStyle = '#ffcc4a';
    g.beginPath();
    g.moveTo(0, -r * 0.5);
    g.lineTo(-r * 0.12, r * 0.2);
    g.lineTo(r * 0.12, r * 0.2);
    g.fill();
  } else {
    // ふつうの針のメーター
    const a0 = -PI * 1.25, a1 = PI * 0.25;
    g.strokeStyle = style.text;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      g.lineWidth = i % 5 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      g.lineTo(Math.cos(a) * r * (i % 5 === 0 ? 0.72 : 0.8), Math.sin(a) * r * (i % 5 === 0 ? 0.72 : 0.8));
      g.stroke();
    }
    if (item.red) {
      g.strokeStyle = '#e0553a';
      g.lineWidth = r * 0.08;
      g.beginPath();
      g.arc(0, 0, r * 0.84, a0 + (a1 - a0) * item.red, a1);
      g.stroke();
    }
    g.fillStyle = style.text;
    g.font = `${r * 0.22}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(item.label, 0, r * 0.36);
    g.font = `bold ${r * 0.26}px sans-serif`;
    g.fillText(item.text, 0, r * 0.66);
    const v = item.center ? 0.5 + clamp(item.value / item.max, -1, 1) * 0.5 : clamp(item.value / item.max, 0, 1);
    const a = a0 + (a1 - a0) * v;
    g.strokeStyle = '#ffcc4a';
    g.lineWidth = r * 0.07;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    g.stroke();
    g.fillStyle = style.rim;
    g.beginPath();
    g.arc(0, 0, r * 0.1, 0, PI * 2);
    g.fill();
  }
  g.restore();
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function drawPanel(gt, items, style) {
  const { g, c } = gt;
  g.fillStyle = style.bg;
  g.fillRect(0, 0, c.width, c.height);
  const n = items.length;
  const r = Math.min(c.height * 0.42, (c.width / n) * 0.42);
  items.forEach((it, i) => drawDial(g, (c.width / n) * (i + 0.5), c.height / 2, r, it, style));
  gt.tex.needsUpdate = true;
}

function gaugePlane(gt, w, h, pos) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: gt.tex, color: 0xe8e8e8 }));
  mesh.rotation.y = PI;
  mesh.position.set(...pos);
  return mesh;
}

// ---------------------------------------------------------------- 機体ごとの操縦席
function buildPlaneLike(id) {
  const g = new THREE.Group();
  const sea = id === 'seaplane';
  const body = sea ? COL.sky : COL.cream;
  const cowl = sea ? COL.white : COL.red;
  const L = [
    part(G.box(1.3, 0.38, 0.14), panel, [0, -0.56, 0.8]),
    part(G.box(1.36, 0.06, 0.34), dark, [0, -0.35, 0.82]),
    part(G.cyl(0.78, 0.82, 1.5, 10), body, [0, -1.2, 1.55], [PI / 2, 0, 0]),
    part(G.cyl(0.55, 0.78, 0.9, 10), cowl, [0, -1.2, 2.7], [PI / 2, 0, 0]),
    part(G.box(0.07, 0.8, 0.07), body, [0.64, 0.02, 0.86], [-0.32, 0, -0.08]),
    part(G.box(0.07, 0.8, 0.07), body, [-0.64, 0.02, 0.86], [-0.32, 0, 0.08]),
    part(G.box(1.36, 0.08, 0.1), body, [0, 0.42, 0.72]),
    part(G.box(1.4, 0.05, 1.5), 0xd8d2c4, [0, 0.47, 0.05]),
    part(G.box(0.06, 1.1, 0.06), body, [0.7, -0.05, -0.35]),
    part(G.box(0.06, 1.1, 0.06), body, [-0.7, -0.05, -0.35]),
    part(G.box(0.06, 0.08, 1.4), body, [0.7, -0.32, 0.2]),
    part(G.box(0.06, 0.08, 1.4), body, [-0.7, -0.32, 0.2]),
    // 翼(頭の上から左右へ)
    part(G.box(5.2, 0.22, 1.7), sea ? COL.white : COL.cream, [3.3, 0.28, -0.3]),
    part(G.box(5.2, 0.22, 1.7), sea ? COL.white : COL.cream, [-3.3, 0.28, -0.3]),
    part(G.box(5.2, 0.24, 0.4), sea ? COL.sky : COL.red, [3.3, 0.29, 0.4]),
    part(G.box(5.2, 0.24, 0.4), sea ? COL.sky : COL.red, [-3.3, 0.29, 0.4]),
    part(G.box(0.08, 1.6, 0.1), COL.navy, [1.5, -0.35, -0.3], [0, 0, 0.78]),
    part(G.box(0.08, 1.6, 0.1), COL.navy, [-1.5, -0.35, -0.3], [0, 0, -0.78]),
    part(G.box(0.07, 0.07, 0.34), dark, [0, -0.62, 0.6]),
  ];
  if (sea) {
    for (const s of [-1, 1]) {
      L.push(part(G.box(0.7, 0.55, 5.6), COL.red, [s * 1.7, -2.8, 0.6]));
      L.push(part(G.box(0.1, 1.5, 0.1), COL.navy, [s * 1.3, -1.9, 1.4], [0, 0, s * 0.35]));
    }
  }
  g.add(m(L));
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.5, 0.44);
  yoke.add(m([
    part(G.box(0.36, 0.05, 0.05), grip, [0, 0, 0]),
    part(G.box(0.05, 0.12, 0.05), grip, [0.17, 0.05, 0]),
    part(G.box(0.05, 0.12, 0.05), grip, [-0.17, 0.05, 0]),
  ]));
  g.add(yoke);
  const prop = propGroup(COL.navy, 2.8, -1.2, 3.2);
  g.add(prop);
  const gt = makeGaugeTex(512, 128);
  g.add(gaugePlane(gt, 1.16, 0.29, [0, -0.56, 0.725]));
  return { group: g, gt, yoke, prop, style: { bg: '#3d4256', face: '#1e2130', rim: '#7a7f92', text: '#f2eedc' }, kind: 'plane' };
}

function buildBiplane() {
  const g = new THREE.Group();
  const L = [
    part(G.cyl(0.82, 0.78, 3.4, 10), COL.yellow, [0, -1.25, 2.1], [PI / 2, 0, 0]),
    part(G.cyl(0.6, 0.82, 0.8, 10), COL.red, [0, -1.25, 4.1], [PI / 2, 0, 0]),
    part(G.box(9.6, 0.18, 1.5), COL.red, [0, 0.42, 1.4]),
    part(G.box(9.0, 0.18, 1.4), COL.red, [0, -1.72, 1.3]),
    part(G.box(0.9, 0.08, 0.08), 0x6b4a32, [0, -0.46, 0.45]),
    part(G.box(0.08, 0.08, 1.0), 0x6b4a32, [0.45, -0.46, 0]),
    part(G.box(0.08, 0.08, 1.0), 0x6b4a32, [-0.45, -0.46, 0]),
    part(G.box(0.7, 0.24, 0.1), 0x5e3c26, [0, -0.6, 0.42]),
  ];
  for (const x of [-3.2, 3.2, -1.0, 1.0]) L.push(part(G.box(0.1, 2.15, 0.1), COL.navy, [x, -0.65, 1.35]));
  g.add(m(L));
  // 小さな風よけ(すきとおったガラス)
  const ws = new THREE.Mesh(G.box(0.6, 0.3, 0.02), new THREE.MeshBasicMaterial({ color: 0xcfe4ee, transparent: true, opacity: 0.22, depthWrite: false }));
  ws.position.set(0, -0.3, 0.5);
  ws.rotation.x = -0.4;
  g.add(ws);
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.95, 0.25);
  yoke.add(m([part(G.box(0.05, 0.5, 0.05), grip, [0, 0.25, 0]), part(G.box(0.1, 0.1, 0.1), grip, [0, 0.5, 0])]));
  g.add(yoke);
  const prop = propGroup(COL.wood, 2.6, -1.25, 4.6);
  g.add(prop);
  const gt = makeGaugeTex(384, 128);
  g.add(gaugePlane(gt, 0.6, 0.2, [0, -0.6, 0.365]));
  return { group: g, gt, yoke, prop, style: { bg: '#5e3c26', face: '#1e1a16', rim: '#c9a46a', text: '#f2eedc' }, kind: 'plane' };
}

function buildGlider() {
  const g = new THREE.Group();
  const L = [
    part(G.cone(0.5, 2.0, 10), COL.white, [0, -0.62, 1.6], [PI / 2, 0, 0]),
    part(G.box(0.8, 0.26, 0.12), panel, [0, -0.38, 0.6]),
    part(G.torus(0.52, 0.025, 4, 14, PI), dark, [0, -0.3, -0.45], [0, 0, 0], [0.9, 1, 1]),
    part(G.box(0.04, 0.04, 0.9), dark, [0, 0.24, -0.1]),
    part(G.box(0.05, 0.08, 1.6), COL.white, [0.46, -0.32, 0.1]),
    part(G.box(0.05, 0.08, 1.6), COL.white, [-0.46, -0.32, 0.1]),
    part(G.box(8.6, 0.12, 0.95), COL.white, [4.75, -0.18, -1.15], [0, 0, 0.06]),
    part(G.box(8.6, 0.12, 0.95), COL.white, [-4.75, -0.18, -1.15], [0, 0, -0.06]),
    part(G.box(1.0, 0.14, 0.5), COL.teal, [8.7, 0.38, -1.2], [0, 0, 0.06]),
    part(G.box(1.0, 0.14, 0.5), COL.teal, [-8.7, 0.38, -1.2], [0, 0, -0.06]),
  ];
  g.add(m(L));
  // 毛糸(横すべりを知らせる)
  const yarn = new THREE.Mesh(G.box(0.012, 0.012, 0.12), new THREE.MeshBasicMaterial({ color: 0xd04030 }));
  yarn.geometry.translate(0, 0, -0.06);
  yarn.position.set(0, 0.2, 0.74);
  g.add(yarn);
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.75, 0.3);
  yoke.add(m([part(G.box(0.04, 0.4, 0.04), grip, [0, 0.2, 0])]));
  g.add(yoke);
  const gt = makeGaugeTex(384, 128);
  g.add(gaugePlane(gt, 0.72, 0.22, [0, -0.38, 0.535]));
  return { group: g, gt, yoke, yarn, style: { bg: '#3d4256', face: '#1e2130', rim: '#7a7f92', text: '#f2eedc' }, kind: 'glider' };
}

function buildJet() {
  const g = new THREE.Group();
  const cx = -0.5; // 機体のまんなか(右に0.5m)
  const L = [
    part(G.box(2.0, 0.42, 0.2), 0x30343f, [cx, -0.58, 0.8]),
    part(G.box(2.1, 0.07, 0.4), 0x22252e, [cx, -0.35, 0.85]),
    part(G.box(0.1, 0.65, 0.1), 0xdcdcd4, [cx, 0.05, 1.0], [-0.5, 0, 0]),
    part(G.box(0.08, 0.7, 0.08), 0xdcdcd4, [0.75, 0.0, 0.95], [-0.4, 0, -0.15]),
    part(G.box(0.08, 0.7, 0.08), 0xdcdcd4, [cx - 1.25, 0.0, 0.95], [-0.4, 0, 0.15]),
    part(G.box(2.2, 0.1, 0.5), 0xdcdcd4, [cx, 0.36, 0.6]),
    part(G.box(2.2, 0.06, 1.8), 0xc8c8c0, [cx, 0.42, -0.4]),
    part(G.box(0.45, 0.25, 0.9), 0x30343f, [cx, -0.62, 0.2]),
    part(G.box(0.06, 0.18, 0.06), 0x111111, [cx + 0.08, -0.42, 0.25]),
    part(G.box(0.06, 0.18, 0.06), 0x111111, [cx - 0.08, -0.42, 0.25]),
    part(G.box(0.08, 0.5, 1.2), 0xdcdcd4, [0.8, -0.25, 0.2]),
  ];
  g.add(m(L));
  const yoke = new THREE.Group();
  yoke.position.set(0, -0.55, 0.45);
  yoke.add(m([
    part(G.box(0.34, 0.05, 0.05), grip, [0, 0, 0]),
    part(G.box(0.05, 0.14, 0.05), grip, [0.16, 0.06, 0]),
    part(G.box(0.05, 0.14, 0.05), grip, [-0.16, 0.06, 0]),
  ]));
  g.add(yoke);
  const gt = makeGaugeTex(640, 128);
  g.add(gaugePlane(gt, 1.85, 0.37, [cx, -0.58, 0.695]));
  return { group: g, gt, yoke, style: { bg: '#141820', face: '#0b0e14', rim: '#3a4250', text: '#9fe6c8' }, kind: 'plane' };
}

function buildBalloon() {
  const g = new THREE.Group();
  const B = 1.0, rim = -1.13;
  const L = [];
  for (const [x, z, w, d] of [[0, B, 2.05, 0.16], [0, -B, 2.05, 0.16], [B, 0, 0.16, 2.05], [-B, 0, 0.16, 2.05]]) {
    L.push(part(G.box(w, 0.16, d), 0x5e3c26, [x, rim, z]));
    L.push(part(G.box(w * 0.98, 1.2, d * 0.98), COL.wood, [x, rim - 0.68, z]));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const a = new THREE.Vector3(sx * 0.95, rim, sz * 0.95), b = new THREE.Vector3(sx * 0.35, 2.0, sz * 0.35);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const geo = G.box(0.03, len, 0.03);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    geo.applyQuaternion(q);
    L.push(part(geo, 0x6b5440, [mid.x, mid.y, mid.z]));
  }
  L.push(part(G.cyl(0.35, 0.35, 0.5, 8), COL.grey, [0, 2.25, 0]));
  L.push(part(G.box(0.8, 0.05, 0.8), COL.grey, [0, 2.0, 0]));
  L.push(part(G.box(0.3, 0.12, 0.2), panel, [0, rim + 0.12, 0.85]));
  g.add(m(L));
  // 気球の中(見上げると、しま模様の天井)
  const stripes = [COL.red, COL.cream, COL.yellow, COL.cream];
  const inner = part(G.sph(7, 16, 10), (c) => stripes[Math.floor(((Math.atan2(c.z, c.x) + PI) / (PI * 2)) * 12) % 4], [0, 11.6, 0], [0, 0, 0], [1, 1.15, 1]);
  const env = new THREE.Mesh(inner, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.BackSide, emissive: 0x6a3a20, emissiveIntensity: 0.35 }));
  g.add(env);
  const flame = new THREE.Mesh(G.cone(0.42, 1.8, 6), new THREE.MeshBasicMaterial({ color: 0xffa64a }));
  flame.position.set(0, 3.4, 0);
  g.add(flame);
  const gt = makeGaugeTex(256, 128);
  const gp = gaugePlane(gt, 0.3, 0.15, [0, rim + 0.22, 0.74]);
  gp.rotation.x = -0.6;
  g.add(gp);
  return { group: g, gt, flame, style: { bg: '#3d4256', face: '#1e2130', rim: '#7a7f92', text: '#f2eedc' }, kind: 'balloon' };
}

function buildCar() {
  const g = new THREE.Group();
  const cx = 0.32;
  const L = [
    part(G.box(1.52, 0.3, 0.42), 0xe8dfc8, [cx, -0.4, 0.78]),
    part(G.box(1.54, 0.05, 0.5), 0x8fcfc0, [cx, -0.24, 0.85]),
    part(G.box(0.08, 0.72, 0.08), 0x8fcfc0, [cx + 0.68, -0.02, 0.72], [-0.45, 0, -0.08]),
    part(G.box(0.08, 0.72, 0.08), 0x8fcfc0, [cx - 0.68, -0.02, 0.72], [-0.45, 0, 0.08]),
    part(G.box(1.44, 0.06, 0.1), 0x8fcfc0, [cx, 0.27, 0.56]),
    part(G.box(1.42, 0.04, 1.6), 0xd8d2c4, [cx, 0.3, -0.25]),
    part(G.box(1.5, 0.12, 1.3), 0x8fcfc0, [cx, -0.48, 1.7], [0.1, 0, 0]),
    part(G.box(0.24, 0.07, 0.03), 0x222222, [cx, 0.17, 0.52]),
    part(G.box(0.06, 0.06, 0.06), 0x222222, [cx, 0.23, 0.53]),
    part(G.box(0.08, 0.6, 0.06), 0x8fcfc0, [cx + 0.73, -0.3, 0.1]),
    part(G.box(0.08, 0.6, 0.06), 0x8fcfc0, [cx - 0.73, -0.3, 0.1]),
    part(G.box(0.07, 0.06, 1.6), 0x8fcfc0, [cx + 0.73, -0.32, -0.3]),
    part(G.box(0.07, 0.06, 1.6), 0x8fcfc0, [cx - 0.73, -0.32, -0.3]),
    part(G.box(0.5, 0.03, 0.03), 0x222222, [cx - 0.2, -0.22, 1.02], [0, 0.2, 0.08]),
    part(G.box(0.5, 0.03, 0.03), 0x222222, [cx + 0.45, -0.22, 1.02], [0, 0.2, 0.08]),
    part(G.box(0.06, 0.2, 0.2), grip, [0, -0.55, 0.62], [0.5, 0, 0]),
  ];
  g.add(m(L));
  const wheel = new THREE.Group();
  wheel.position.set(0, -0.33, 0.45);
  wheel.rotation.x = 0.45;
  wheel.add(m([
    part(G.torus(0.19, 0.028, 5, 16), grip, [0, 0, 0]),
    part(G.box(0.36, 0.035, 0.03), grip, [0, 0, 0]),
    part(G.box(0.035, 0.18, 0.03), grip, [0, -0.09, 0]),
    part(G.cyl(0.05, 0.05, 0.04, 8), 0xc65a43, [0, 0, -0.02], [PI / 2, 0, 0]),
  ]));
  g.add(wheel);
  const gt = makeGaugeTex(256, 128);
  g.add(gaugePlane(gt, 0.42, 0.21, [0, -0.32, 0.6]));
  return { group: g, gt, wheel, style: { bg: '#e8dfc8', face: '#fbf6e4', rim: '#3d4b6e', text: '#3a3f5c' }, kind: 'car' };
}

function buildScooter() {
  const g = new THREE.Group();
  const L = [
    part(G.box(0.55, 0.1, 0.12), COL.cream, [0, -1.0, 0.55]),
    part(G.box(0.5, 0.3, 0.08), COL.cream, [0, -1.15, 0.55], [-0.2, 0, 0]),
  ];
  g.add(m(L));
  const bar = new THREE.Group();
  bar.position.set(0, -0.67, 0.62);
  bar.add(m([
    part(G.box(0.72, 0.05, 0.05), COL.grey, [0, 0, 0]),
    part(G.box(0.12, 0.06, 0.06), grip, [0.32, 0, 0]),
    part(G.box(0.12, 0.06, 0.06), grip, [-0.32, 0, 0]),
    part(G.box(0.2, 0.04, 0.16), COL.red, [0, 0.02, 0.0]),
    part(G.box(0.02, 0.3, 0.02), COL.grey, [0.26, 0.15, 0.02]),
    part(G.box(0.02, 0.3, 0.02), COL.grey, [-0.26, 0.15, 0.02]),
    part(G.cyl(0.06, 0.06, 0.02, 10), 0xcfd8de, [0.26, 0.32, 0.02], [PI / 2, 0, 0]),
    part(G.cyl(0.06, 0.06, 0.02, 10), 0xcfd8de, [-0.26, 0.32, 0.02], [PI / 2, 0, 0]),
    part(G.box(0.1, 0.08, 0.16), 0xe3b54d, [0.32, 0.02, -0.12]),
    part(G.box(0.1, 0.08, 0.16), 0xe3b54d, [-0.32, 0.02, -0.12]),
  ]));
  g.add(bar);
  const gt = makeGaugeTex(128, 128);
  const gp = gaugePlane(gt, 0.15, 0.15, [0, -0.58, 0.6]);
  gp.rotation.x = -0.4;
  bar.add(gp);
  gp.position.set(0, 0.09, 0.0);
  return { group: g, gt, bar, style: { bg: '#c65a43', face: '#fbf6e4', rim: '#3d4b6e', text: '#3a3f5c' }, kind: 'scooter' };
}

const BUILD = {
  plane: () => buildPlaneLike('plane'), seaplane: () => buildPlaneLike('seaplane'), biplane: buildBiplane,
  glider: buildGlider, jet: buildJet, balloon: buildBalloon, car: buildCar, scooter: buildScooter,
};

export class Cockpit {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.02, 60);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6a6050, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.cache = {};
    this.cur = null;
    this.gaugeT = 0;
    this._q = new THREE.Quaternion();
    this._white = new THREE.Color(0xffffff);
  }

  set(id) {
    if (this.cur) this.scene.remove(this.cur.group);
    this.cur = this.cache[id] || (this.cache[id] = BUILD[id]());
    this.scene.add(this.cur.group);
    this.id = id;
    this.gaugeT = 1; // すぐに計器を描く
  }

  // vq: のりものの向き / look: 見回し(のりもの基準)/ s: 計器にうつす値
  update(dt, vq, look, sunDir, light, s) {
    const C = this.cur;
    if (!C) return;
    // 光は景色と同じ方向から(のりもの基準に直す)
    this._q.copy(vq).invert();
    this.sun.position.copy(sunDir).applyQuaternion(this._q).multiplyScalar(10);
    this.hemi.position.set(0, 1, 0).applyQuaternion(this._q);
    this.sun.color.copy(light.sunColor);
    this.sun.intensity = light.sunI * 0.85;
    this.hemi.color.copy(light.sky);
    this.hemi.groundColor.copy(light.ground).lerp(this._white, 0.45);
    this.hemi.intensity = light.hemiI;
    this.camera.quaternion.copy(look);
    this.camera.position.copy(s.head);
    // 動く部品
    if (C.prop) {
      C.prop.rotation.z += (25 + s.throttle * 35) * dt;
      C.prop.userData.blades.visible = s.throttle < 0.05 && s.speed < 1 ? true : Math.random() < 0.35;
      C.prop.userData.disc.material.opacity = s.throttle < 0.05 && s.speed < 1 ? 0.03 : 0.1;
    }
    if (C.yoke) {
      C.yoke.rotation.z = s.inRoll * 0.6;
      C.yoke.rotation.x = -s.inPitch * 0.25;
    }
    if (C.wheel) C.wheel.rotation.z = s.inRoll * 1.6;
    if (C.bar) C.bar.rotation.y = -s.inRoll * 0.25;
    if (C.flame) {
      C.flame.visible = s.burner;
      C.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    }
    if (C.yarn) C.yarn.rotation.y = clamp(s.slip * 3, -0.8, 0.8);
    // 計器は1秒に10回描きなおす
    this.gaugeT += dt;
    if (this.gaugeT > 0.1) {
      this.gaugeT = 0;
      drawPanel(C.gt, this.items(s), C.style);
    }
  }

  items(s) {
    const kmh = Math.abs(s.speed) * 3.6;
    const spd = (max) => ({ label: 'km/h', text: String(Math.round(kmh)), value: kmh, max });
    const alt = { label: 'm', text: String(Math.max(0, Math.round(s.alt))), value: s.alt % 1000, max: 1000 };
    const vario = { label: 'm/s', text: (s.vario >= 0 ? '+' : '') + s.vario.toFixed(1), value: s.vario, max: 6, center: true };
    switch (this.id) {
      case 'car': return [spd(140), { label: 'rpm', text: String(Math.round(s.rpm / 100) * 100), value: s.rpm, max: 7000, red: 0.8 }];
      case 'scooter': return [spd(70)];
      case 'balloon': return [alt, vario];
      case 'glider': return [spd(200), vario, alt];
      case 'jet': return [spd(600), { kind: 'attitude', roll: s.roll, pitch: s.pitch }, alt, { kind: 'compass', value: s.heading }, vario];
      default: return [spd(this.id === 'biplane' ? 250 : 300), { kind: 'attitude', roll: s.roll, pitch: s.pitch }, alt, { kind: 'compass', value: s.heading }];
    }
  }

  render(renderer, aspect, fov) {
    if (!this.cur) return;
    if (this.camera.aspect !== aspect || this.camera.fov !== fov) {
      this.camera.aspect = aspect;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    renderer.render(this.scene, this.camera);
  }
}
