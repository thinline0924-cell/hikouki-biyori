// 村や家並み:地形の上に家をならべる(たくさんあっても軽いように、1つの形にまとめる)
import * as THREE from 'three';
import { part, merge, G, rng, lowpolyMat } from './util.js';
import { COL, treeGeometry } from './models.js';

const PI = Math.PI;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

// 部品のまとまりを、まとめて動かす・回す
function place(list, x, y, z, rot) {
  _m.compose(_v.set(x, y, z), _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), _s);
  for (const g of list) g.applyMatrix4(_m);
  return list;
}

const STYLES = {
  fishing: { walls: [0xf7f4ea, 0xf1e6c8, 0xe9d6c0, 0xdfe8ec], roofs: [0x3d6e9a, 0x5fa7a0, 0xc65a43, 0x86bcd6], size: [6, 9], floors: [1, 2] },
  nordic: { walls: [0xa8463a, 0xc98a3a, 0xf1ead8, 0x8a3a32, 0xd9c48a], roofs: [0x3a3a3a, 0x4d5a3a, 0x2f3346], size: [6, 10], floors: [1, 2] },
  cabin: { walls: [0x7a4a36, 0x8a5a3a, 0x6b4430], roofs: [0x3a3f5c, 0x5a3a3a, 0x2f2a28], size: [6, 8], floors: [1, 1], lit: true },
  adobe: { walls: [0xd9b48a, 0xcfa070, 0xe2c49a], roofs: [0xb08a62], size: [7, 11], floors: [1, 2], flat: true },
  hillside: { walls: [0xf2e8d2, 0xe8d0b0, 0xd9e4d0, 0xf0d9c8, 0xf4eee0], roofs: [0xc65a43, 0x3d4b6e, 0x7a8a6a, 0x9a6a4a], size: [8, 12], floors: [1, 2] },
  farm: { walls: [0xf4eee0, 0xe8dcc0], roofs: [0x7a5a42, 0x3d4b6e], size: [9, 12], floors: [2, 2] },
};

// 1けんの家の部品(原点は家の真ん中の地面、正面は +z)
function houseParts(st, R, lit, glow) {
  const w = st.size[0] + R() * (st.size[1] - st.size[0]);
  const d = w * (0.7 + R() * 0.3);
  const floors = st.floors[0] + Math.floor(R() * (st.floors[1] - st.floors[0] + 1));
  const h = floors * 3.2;
  const wall = st.walls[Math.floor(R() * st.walls.length)];
  const roof = st.roofs[Math.floor(R() * st.roofs.length)];
  const L = [part(G.box(w, h + 1.5, d), wall, [0, h / 2 - 0.75, 0])];
  if (st.flat) {
    L.push(part(G.box(w + 0.4, 0.6, d + 0.4), roof, [0, h + 0.3, 0]));
    if (R() < 0.4) L.push(part(G.box(w * 0.4, 2.8, d * 0.4), wall, [w * 0.2, h + 1.4, -d * 0.2]));
    L.push(part(G.box(0.3, 0.3, 1.2), 0x6b4430, [w * 0.3, h - 0.6, d / 2 + 0.6]));
  } else {
    L.push(part(G.prism(d * 0.62, w + 0.8), roof, [0, h + d * 0.62 * 0.4, 0], [0, 0, 0], [1, 0.85, 1]));
    if (R() < 0.6) L.push(part(G.box(0.9, 2.4, 0.9), 0x8a8478, [w * 0.25, h + d * 0.35, -d * 0.15]));
  }
  L.push(part(G.box(1.2, 2.1, 0.12), 0x5e3c26, [-w * 0.2, 1.05, d / 2 + 0.05]));
  const win = [];
  for (let f = 0; f < floors; f++) {
    for (const x of [w * 0.15, w * 0.35]) win.push([x, f * 3.2 + 1.9, d / 2 + 0.06, 0]);
    win.push([w / 2 + 0.06, f * 3.2 + 1.9, 0, 1]);
    win.push([-w / 2 - 0.06, f * 3.2 + 1.9, 0, 1]);
  }
  for (const [x, y, z, side] of win) {
    const g = part(G.box(side ? 0.12 : 1.1, 1.2, side ? 1.1 : 0.12), lit ? 0xffd27a : COL.glass, [x, y, z]);
    (lit ? glow : L).push(g);
  }
  return { L, w, d, h };
}

function barnParts(R) {
  return [
    part(G.box(10, 6, 16), 0xa8463a, [0, 3, 0]),
    part(G.prism(6.4, 16.6), 0x4a4a4a, [0, 6 + 2.6, 0], [0, PI / 2, 0], [1, 0.8, 1]),
    part(G.box(4, 4.6, 0.2), 0xf4eee0, [0, 2.3, 8.05]),
    part(G.box(3.4, 4, 0.22), 0x8a3a32, [0, 2.1, 8.1]),
    part(G.cyl(2.4, 2.4, 13, 10), 0xb8bcc0, [8, 6.5, -3]),
    part(new THREE.SphereGeometry(2.45, 10, 5, 0, PI * 2, 0, PI / 2), 0x9aa0a6, [8, 13, -3]),
    part(G.box(0.6, 0.6, 0.6), R() < 0.5 ? COL.red : COL.yellow, [8, 15.6, -3]),
  ];
}

// cfg: { x, z, r, n, style, face(家の正面の向き、省略すると村の中心), water(水ぎわに小屋), farm }
export function buildVillage(ctx, cfg) {
  const R = rng(cfg.seed || Math.floor(cfg.x * 7 + cfg.z * 13));
  const st = STYLES[cfg.style];
  const L = [], glow = [];
  const placed = [];
  const okAt = (x, z, pad) => {
    const s = ctx.surfaceAt(x, z);
    if (s.water || s.y < 2) return false;
    if (ctx.normalYAt(x, z) < 0.86) return false;
    if (ctx.isBlocked && ctx.isBlocked(x, z)) return false;
    if (cfg.avoid && cfg.avoid(x, z)) return false;
    for (const [px, pz, pr] of placed) if ((x - px) ** 2 + (z - pz) ** 2 < (pr + pad) ** 2) return false;
    return true;
  };
  for (let tries = 0; tries < cfg.n * 30 && placed.length < cfg.n; tries++) {
    const a = R() * PI * 2, rr = Math.sqrt(R()) * cfg.r;
    const x = cfg.x + Math.cos(a) * rr, z = cfg.z + Math.sin(a) * rr;
    if (!okAt(x, z, 9)) continue;
    const y = ctx.heightAt(x, z);
    const rot = cfg.face !== undefined ? cfg.face + (R() - 0.5) * 0.5 : Math.atan2(cfg.x - x, cfg.z - z) + (R() - 0.5) * 0.4;
    let H;
    const hg = [];
    if (cfg.farm && placed.length === 1) {
      const parts = barnParts(R);
      H = { L: parts, w: 12, d: 16, h: 9 };
    } else H = houseParts(st, R, st.lit, hg);
    if (hg.length) glow.push(...place(hg, x, y, z, rot));
    // 土台(坂でも家が浮かないように)
    H.L.push(part(G.box(H.w + 1, 3, H.d + 1), 0x8a8478, [0, -1.4, 0]));
    L.push(...place(H.L, x, y, z, rot));
    placed.push([x, z, Math.max(H.w, H.d) * 0.6]);
    ctx.solid(x, z, Math.max(H.w, H.d) * 0.6, y + H.h + 3);
    ctx.exclude(x, z, Math.max(H.w, H.d) * 0.8);
  }
  // 家のまわりの小物
  for (const [x, z, pr] of placed) {
    const y = ctx.heightAt(x, z);
    if (R() < 0.5) {
      const tx = x + (R() - 0.5) * pr * 3, tz = z + (R() - 0.5) * pr * 3;
      if (okAt(tx, tz, 2)) for (const g of treeGeometry(cfg.style === 'cabin' ? 'snowpine' : cfg.style === 'adobe' ? 'bush' : 'round')) L.push(...place([g], tx, ctx.heightAt(tx, tz), tz, R() * 6));
    }
    if (cfg.style === 'adobe' && R() < 0.4) L.push(...place([part(G.cyl(1.2, 1.2, 1.4, 8), 0x8a6a4a, [0, 0.7, 0])], x + pr + 3, y, z, 0));
  }
  // 畑の干し草ロール・柵
  if (cfg.farm) {
    for (let k = 0; k < 10; k++) {
      const a = R() * PI * 2, rr = cfg.r + 20 + R() * 60;
      const x = cfg.x + Math.cos(a) * rr, z = cfg.z + Math.sin(a) * rr;
      if (!okAt(x, z, 1)) continue;
      L.push(...place([part(G.cyl(1.3, 1.3, 1.5, 10), 0xe0c070, [0, 1.3, 0], [0, 0, PI / 2])], x, ctx.heightAt(x, z), z, R() * 6));
    }
    const fr = cfg.r + 14;
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * PI * 2;
      const x = cfg.x + Math.cos(a) * fr, z = cfg.z + Math.sin(a) * fr;
      if (ctx.surfaceAt(x, z).water) continue;
      const y = ctx.heightAt(x, z);
      L.push(...place([part(G.box(0.2, 1.3, 0.2), 0x6b4430, [0, 0.65, 0]), part(G.box(0.12, 0.12, fr * 0.23), 0x8a6a4a, [0, 1.0, 0])], x, y, z, -a));
    }
  }
  // 水ぎわの小屋とさんばし
  if (cfg.water) {
    for (let k = 0; k < cfg.water; k++) {
      const a = R() * PI * 2;
      const s = ctx.waterEdge(cfg.x, cfg.z, a, cfg.r + 260);
      if (!s) continue;
      const [x, z] = [s.x, s.z];
      const rot = Math.atan2(s.dx, s.dz);
      const bh = [
        part(G.box(6, 4, 8), cfg.style === 'nordic' ? 0xa8463a : 0xf1e6c8, [0, 2.6, 0]),
        part(G.prism(4, 8.6), 0x3a3a3a, [0, 4.6 + 1.6, 0], [0, PI / 2, 0], [1, 0.8, 1]),
        part(G.box(3, 0.3, 14), COL.wood, [0, 1.0, 10]),
      ];
      for (const px of [-1.4, 1.4]) for (const pz of [5, 10, 16]) bh.push(part(G.box(0.3, 4, 0.3), 0x5e3c26, [px, -1, pz]));
      L.push(...place(bh, x, 0.3, z, rot));
    }
  }
  if (L.length) {
    const m = new THREE.Mesh(merge(L), lowpolyMat);
    m.castShadow = m.receiveShadow = true;
    ctx.addMesh(m);
  }
  if (glow.length) ctx.addMesh(new THREE.Mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));
  return placed;
}

// 夜の村:窓にあかりをともした丸太小屋(オーロラの湖)
export function buildCabins(ctx, cfg) {
  const R = rng(cfg.seed || 5);
  const L = [], glow = [];
  const placed = [];
  for (let tries = 0; tries < cfg.n * 40 && placed.length < cfg.n; tries++) {
    const a = R() * PI * 2, rr = Math.sqrt(R()) * cfg.r;
    const x = cfg.x + Math.cos(a) * rr, z = cfg.z + Math.sin(a) * rr;
    const s = ctx.surfaceAt(x, z);
    if (s.water || ctx.normalYAt(x, z) < 0.88) continue;
    if (placed.some(([px, pz]) => (x - px) ** 2 + (z - pz) ** 2 < 22 * 22)) continue;
    const y = s.y, rot = Math.atan2(cfg.x - x, cfg.z - z);
    const w = 7 + R() * 2;
    const parts = [
      part(G.box(w, 4.2, 6), 0x6b4430, [0, 1.6, 0]),
      part(G.prism(4.2, w + 1), 0x3a3f5c, [0, 3.7 + 1.7, 0], [0, 0, 0], [1, 0.8, 1]),
      part(G.prism(4.0, w + 1.1), 0xeef3f6, [0, 3.7 + 1.95, 0], [0, 0, 0], [1, 0.75, 1]),
      part(G.box(0.9, 2.6, 0.9), 0x6b6560, [w * 0.3, 6.2, -1]),
      part(G.box(w + 1, 3, 7), 0x8a8478, [0, -1.4, 0]),
    ];
    L.push(...place(parts, x, y, z, rot));
    glow.push(...place([part(G.box(1.2, 1.1, 0.12), 0xffc870, [-w * 0.2, 1.9, 3.06]), part(G.box(1.2, 1.1, 0.12), 0xffc870, [w * 0.25, 1.9, 3.06])], x, y, z, rot));
    placed.push([x, z]);
    ctx.solid(x, z, 5, y + 8);
    ctx.exclude(x, z, 9);
  }
  // たき火
  const fx = cfg.x, fz = cfg.z;
  if (!ctx.surfaceAt(fx, fz).water) {
    const fy = ctx.heightAt(fx, fz);
    for (let k = 0; k < 6; k++) L.push(...place([part(G.box(0.3, 0.3, 1.6), 0x4a3426, [0, 0.2, 0])], fx, fy, fz, (k / 6) * PI));
    const fire = new THREE.Mesh(G.cone(0.7, 1.6, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    fire.position.set(fx, fy + 0.9, fz);
    ctx.addMesh(fire);
    ctx.updater((t) => fire.scale.set(1, 0.7 + Math.abs(Math.sin(t * 9) * 0.3) + Math.random() * 0.2, 1));
  }
  if (L.length) {
    const m = new THREE.Mesh(merge(L), lowpolyMat);
    m.castShadow = m.receiveShadow = true;
    ctx.addMesh(m);
  }
  if (glow.length) ctx.addMesh(new THREE.Mesh(merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));
  return placed;
}
