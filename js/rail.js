// 鉄道:地形にそった線路、高い所は橋げた、駅、走る汽車。港町の路面電車も
import * as THREE from 'three';
import { part, merge, G, lowpolyMat, clamp } from './util.js';
import { COL } from './models.js';

const PI = Math.PI;

// やわらかいけむり(汽車の煙突)
function smokePool(ctx, n = 14) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const list = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xeeeae2, opacity: 0 }));
    s.userData.life = 0;
    ctx.addMesh(s);
    list.push(s);
  }
  let k = 0;
  return {
    emit(p) {
      const s = list[k++ % n];
      s.position.copy(p);
      s.userData.life = 1;
    },
    update(dt) {
      for (const s of list) {
        if (s.userData.life <= 0) { s.material.opacity = 0; continue; }
        s.userData.life -= dt * 0.35;
        s.position.y += dt * 3;
        s.scale.setScalar(2 + (1 - s.userData.life) * 9);
        s.material.opacity = s.userData.life * 0.6;
      }
    },
  };
}

function locomotive() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge([
    part(G.cyl(1.25, 1.25, 7, 12), 0x2f4a3a, [0, 2.6, 1.0], [PI / 2, 0, 0]),
    part(G.cyl(1.3, 1.3, 0.3, 12), COL.yellow, [0, 2.6, 4.4], [PI / 2, 0, 0]),
    part(G.cyl(0.45, 0.6, 1.6, 8), 0x2a2a2a, [0, 4.4, 3.4]),
    part(G.sph(0.6, 8, 5), 0x2f4a3a, [0, 3.9, 1.0]),
    part(G.box(2.8, 3.2, 3.0), 0x2f4a3a, [0, 3.0, -3.6]),
    part(G.box(3.1, 0.3, 3.4), 0x2a2a2a, [0, 4.75, -3.6]),
    part(G.box(2.82, 1.0, 1.2), COL.glass, [0, 3.6, -3.0]),
    part(G.box(2.6, 0.5, 10.5), 0x2a2a2a, [0, 1.0, 0]),
    part(G.box(2.6, 0.5, 0.6), COL.red, [0, 0.9, 5.3]),
    part(G.cyl(0.25, 0.25, 0.2, 8), 0xfff4c8, [0, 2.6, 4.6], [PI / 2, 0, 0]),
  ]), lowpolyMat));
  const wheels = [];
  for (const z of [3, 1.2, -0.6]) for (const x of [-1.25, 1.25]) {
    const w = new THREE.Mesh(merge([part(G.cyl(0.85, 0.85, 0.25, 12), COL.red, [0, 0, 0], [0, 0, PI / 2]), part(G.box(0.27, 1.5, 0.2), 0x2a2a2a, [0, 0, 0])]), lowpolyMat);
    w.position.set(x, 0.85, z);
    g.add(w);
    wheels.push(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, wheels, len: 11 };
}

function coach(color) {
  const g = new THREE.Group();
  const L = [
    part(G.box(2.8, 2.6, 11), color, [0, 2.4, 0]),
    part(G.box(2.9, 0.25, 11.2), COL.cream, [0, 3.8, 0]),
    part(G.cyl(1.5, 1.5, 11.2, 10, 1, false, -PI / 2, PI), 0x4a4a4a, [0, 3.7, 0], [PI / 2, 0, PI / 2], [1, 0.35, 1]),
    part(G.box(2.6, 0.5, 10), 0x2a2a2a, [0, 0.9, 0]),
  ];
  for (let z = -4; z <= 4; z += 1.6) for (const x of [-1.42, 1.42]) L.push(part(G.box(0.06, 0.9, 1.0), COL.glass, [x, 2.8, z]));
  g.add(new THREE.Mesh(merge(L), lowpolyMat));
  const wheels = [];
  for (const z of [3.8, -3.8]) for (const x of [-1.2, 1.2]) {
    const w = new THREE.Mesh(merge([part(G.cyl(0.55, 0.55, 0.22, 10), 0x2a2a2a, [0, 0, 0], [0, 0, PI / 2])]), lowpolyMat);
    w.position.set(x, 0.55, z);
    g.add(w);
    wheels.push(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, wheels, len: 11.6 };
}

// pts:[[x,z],...] を通る、ひとまわりの線路
export function buildRailway(ctx, pts, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const len = curve.getLength();
  const STEP = 4;
  const n = Math.floor(len / STEP);
  // 線路の高さ:地面をなめらかにしたもの。水や谷の上では橋になる
  const raw = new Float32Array(n), gnd = new Float32Array(n);
  const P = [], T = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
    P.push(p);
    T.push(t);
    const s = ctx.surfaceAt(p.x, p.z);
    gnd[i] = s.water ? -5 : s.y;
    raw[i] = Math.max(s.y, s.water ? 6 : s.y) + 0.4;
  }
  const smoothArr = (a, win) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -win; k <= win; k++) s += a[(i + k + n) % n];
      out[i] = s / (2 * win + 1);
    }
    return out;
  };
  let Y = smoothArr(raw, 25);
  for (let i = 0; i < n; i++) Y[i] = Math.max(Y[i], gnd[i] + 0.4);
  Y = smoothArr(Y, 6);
  for (let i = 0; i < n; i++) Y[i] = Math.max(Y[i], gnd[i] + 0.4);
  P.forEach((p, i) => { p.y = Y[i]; });

  // 枕木・レール・橋げた
  const L = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const p = P[i], t = T[i];
    const yaw = Math.atan2(t.x, t.z);
    const sleeper = part(G.box(2.6, 0.25, 0.5), 0x6b4a32, [0, 0, 0]);
    m.makeRotationY(yaw).setPosition(p.x, p.y - 0.15, p.z);
    sleeper.applyMatrix4(m);
    L.push(sleeper);
    // 地面より高いところ:5本ごとに橋げた
    const gap = p.y - gnd[i];
    if (gap > 3 && i % 5 === 0) {
      const hgt = gap + 8;
      const pier = part(G.box(3.2, hgt, 1.2), 0x8a8478, [0, 0, 0]);
      m.makeRotationY(yaw).setPosition(p.x, p.y - 0.4 - hgt / 2, p.z);
      pier.applyMatrix4(m);
      L.push(pier);
      const deck = part(G.box(3.4, 0.6, STEP * 5 + 0.2), 0x6e5a4a, [0, 0, 0]);
      m.makeRotationY(yaw).setPosition(p.x, p.y - 0.55, p.z);
      deck.applyMatrix4(m);
      L.push(deck);
    }
  }
  // レール:2本の細長い帯(上の面と外がわの面)
  {
    const pos = [];
    const sideAt = (i, sx) => {
      const t = T[i % n], p = P[i % n];
      const yaw = Math.atan2(t.x, t.z);
      return [p.x + Math.cos(yaw) * sx, p.y + 0.12, p.z - Math.sin(yaw) * sx];
    };
    for (const sx of [-0.75, 0.75]) {
      for (let i = 0; i < n; i++) {
        const a0 = sideAt(i, sx - 0.08), a1 = sideAt(i, sx + 0.08), b0 = sideAt(i + 1, sx - 0.08), b1 = sideAt(i + 1, sx + 0.08);
        pos.push(...a0, ...b1, ...a1, ...a0, ...b0, ...b1);
        const o = sx > 0 ? [a1, b1] : [a0, b0];
        const lo = (v) => [v[0], v[1] - 0.2, v[2]];
        pos.push(...o[0], ...lo(o[0]), ...o[1], ...o[1], ...lo(o[0]), ...lo(o[1]));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const c = new THREE.Color(0x8a8a90), col = new Float32Array(pos.length);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    L.push(g);
  }
  const track = new THREE.Mesh(merge(L), lowpolyMat);
  track.receiveShadow = true;
  ctx.addMesh(track);
  for (let i = 0; i < n; i += 30) ctx.road(P[i].x, P[i].z, P[(i + 30) % n].x, P[(i + 30) % n].z, 'rail');

  // 駅(いちばん近い所に)
  let stIdx = 0;
  if (opts.station) {
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (P[i].x - opts.station[0]) ** 2 + (P[i].z - opts.station[1]) ** 2;
      const flat = Math.abs(P[i].y - gnd[i]) < 1.5;
      if (flat && d < bd) { bd = d; stIdx = i; }
    }
    const p = P[stIdx], t = T[stIdx];
    const yaw = Math.atan2(t.x, t.z);
    const SL = [
      part(G.box(5, 1.0, 60), 0xb8b0a0, [4.3, 0.1, 0]),
      part(G.box(8, 4, 12), COL.cream, [9, 2.6, 0]),
      part(G.prism(5.5, 13), COL.red, [9, 4.6 + 2.2, 0], [0, PI / 2, 0], [1, 0.8, 1]),
      part(G.box(4.6, 0.25, 30), 0x7a5a42, [4.3, 3.8, 0]),
      part(G.box(0.2, 3.2, 0.2), 0x5e3c26, [2.4, 2.3, 12]),
      part(G.box(0.2, 3.2, 0.2), 0x5e3c26, [2.4, 2.3, -12]),
      part(G.box(0.2, 3.2, 0.2), 0x5e3c26, [2.4, 2.3, 0]),
      part(G.box(0.2, 2.4, 0.2), COL.navy, [3, 1.6, 22]),
      part(G.box(2.4, 0.9, 0.12), 0xf7f4ea, [3, 3.0, 22]),
    ];
    m.makeRotationY(yaw).setPosition(p.x, p.y - 0.4, p.z);
    for (const g of SL) g.applyMatrix4(m);
    const sm = new THREE.Mesh(merge(SL), lowpolyMat);
    sm.castShadow = sm.receiveShadow = true;
    ctx.addMesh(sm);
    ctx.solid(p.x + Math.cos(yaw) * 9, p.z - Math.sin(yaw) * 9, 7, p.y + 8);
  }

  // 汽車
  const cars = [locomotive(), coach(0x8a3a32), coach(0x3d6e5a), coach(0x8a3a32)];
  ctx.trains = (ctx.trains || []).concat([cars[0].g]); // 動作確認用
  cars.forEach((c) => ctx.addMesh(c.g));
  const smoke = smokePool(ctx);
  const stS = (stIdx / n) * len;
  let s = (stS + 600) % len, v = 14, wait = 0, smokeT = 0;
  const posAt = (dist) => {
    const u = ((dist % len) + len) % len / len;
    const f = u * n, i = Math.floor(f) % n, k = f - Math.floor(f);
    return P[i].clone().lerp(P[(i + 1) % n], k);
  };
  const _f = new THREE.Vector3();
  ctx.updater((t, dt) => {
    // 駅に近づくとゆっくりになり、止まって、また走りだす
    const toSt = ((stS - s) % len + len) % len;
    let target = 14;
    if (opts.station) {
      if (toSt < 160) target = Math.max(1.5, toSt * 0.09);
      if (toSt < 2 && wait <= 0 && v < 3) { wait = 9; s = stS + 2.1; }
    }
    if (wait > 0) { wait -= dt; v = 0; } else v += clamp(target - v, -2 * dt, 1.2 * dt);
    s += v * dt;
    let d = s;
    for (const c of cars) {
      const a = posAt(d + c.len / 2), b = posAt(d - c.len / 2);
      c.g.position.copy(a).add(b).multiplyScalar(0.5);
      _f.subVectors(a, b).normalize();
      c.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _f);
      for (const w of c.wheels) w.rotation.x += (v / 0.8) * dt;
      d -= c.len + 0.8;
    }
    smokeT -= dt * (0.4 + v / 10);
    if (smokeT < 0) {
      smokeT = 0.25;
      const lc = cars[0].g;
      smoke.emit(new THREE.Vector3(0, 5.3, 3.4).applyQuaternion(lc.quaternion).add(lc.position));
    }
    smoke.update(dt);
  });
  return { curve, P, len };
}

// 港町の路面電車:x0〜x1 を行ったり来たり
export function buildTram(ctx, { z, x0, x1, y }) {
  const L = [];
  for (const sz of [-0.7, 0.7]) L.push(part(G.box(x1 - x0 + 30, 0.06, 0.18), 0x4a4a50, [(x0 + x1) / 2, y + 0.11, z + sz]));
  const rails = new THREE.Mesh(merge(L), lowpolyMat);
  ctx.addMesh(rails);
  const g = new THREE.Group();
  const B = [
    part(G.box(2.5, 1.2, 12), 0x3d6e5a, [0, 1.1, 0]),
    part(G.box(2.5, 1.5, 12), COL.cream, [0, 2.45, 0]),
    part(G.box(2.6, 0.3, 12.2), 0x3d6e5a, [0, 3.35, 0]),
    part(G.box(0.08, 0.6, 2), 0x2a2a2a, [0, 3.8, 0], [0, 0, 0]),
    part(G.box(1.6, 0.06, 0.1), 0x2a2a2a, [0, 4.1, 0]),
  ];
  for (let zz = -4.8; zz <= 4.8; zz += 1.6) for (const x of [-1.27, 1.27]) B.push(part(G.box(0.06, 0.9, 1.1), COL.glass, [x, 2.5, zz]));
  for (const zz of [-6.02, 6.02]) B.push(part(G.box(1.8, 0.9, 0.06), COL.glass, [0, 2.5, zz]));
  g.add(new THREE.Mesh(merge(B), lowpolyMat));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.rotation.y = PI / 2;
  ctx.addMesh(g);
  let x = x0, dir = 1, v = 0, wait = 3;
  ctx.updater((t, dt) => {
    if (wait > 0) { wait -= dt; v = 0; }
    else {
      const left = dir > 0 ? x1 - x : x - x0;
      const target = left < 60 ? Math.max(1, left * 0.15) : 9;
      v += clamp(target - v, -2 * dt, 1.5 * dt);
      x += dir * v * dt;
      if (left < 0.5) { dir = -dir; wait = 6; }
    }
    g.position.set(x, y, z);
    ctx.solidMove && ctx.solidMove(g.position);
  });
}
