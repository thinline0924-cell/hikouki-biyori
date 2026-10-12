// 港町:碁盤の目の道、建物、行きかう車、海辺の観覧車や倉庫
import * as THREE from 'three';
import { part, merge, G, rng, lowpolyMat } from './util.js';
import * as M from './models.js';
import { buildVillage } from './village.js';
import { buildTram } from './rail.js';

const COLS = M.COL;

export const TOWN = { x0: -660, x1: 660, z0: -260, z1: 520, y: 8 };
export const XS = [-600, -500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500, 600];
export const ZS = [-200, -100, 0, 100, 200, 300, 400, 470];
export const coastZ = (x) => 560 + 25 * Math.sin(x * 0.003);
// 教会へのぼる坂道
export const CHURCH = { x: -450, z: -560 };
export const CHURCH_ROAD = [[-500, -200], [-470, -280], [-560, -340], [-430, -400], [-560, -460], [-470, -530]];

const WALLS = [0xf2e8d2, 0xe8d0b0, 0xd9e4d0, 0xf0d9c8, 0xd8dfe8, 0xf4eee0, 0xe9c9a8, 0xf3e1a8];
const ROOFS = [0xc65a43, 0x3d4b6e, 0x7a8a6a, 0x9a6a4a, 0x5f8f7a];

export function inTown(x, z, pad = 0) {
  return x > TOWN.x0 - pad && x < TOWN.x1 + pad && z > TOWN.z0 - pad && z < TOWN.z1 + pad;
}

export function buildTown(ctx) {
  const R = rng(321);
  const Y = TOWN.y;
  const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const RW = 12; // 道の幅

  // ---------- 道 ----------
  const roads = [];
  const zMin = ZS[0], zMax = ZS[ZS.length - 1];
  for (const x of XS) {
    roads.push(part(G.box(RW, 0.1, zMax - zMin + RW), 0x6e6c72, [x, Y + 0.05, (zMin + zMax) / 2]));
    ctx.road(x, zMin, x, zMax);
    for (let z = zMin + 14; z < zMax - 8; z += 12) {
      if (ZS.some((zz) => Math.abs(zz - z) < 9)) continue;
      roads.push(part(G.box(0.25, 0.12, 5), 0xf4efe0, [x, Y + 0.08, z]));
    }
  }
  for (const z of ZS) {
    roads.push(part(G.box(XS[XS.length - 1] - XS[0] + RW, 0.1, RW), 0x6e6c72, [0, Y + 0.05, z]));
    ctx.road(XS[0], z, XS[XS.length - 1], z);
    for (let x = XS[0] + 14; x < XS[XS.length - 1] - 8; x += 12) {
      if (XS.some((xx) => Math.abs(xx - x) < 9)) continue;
      roads.push(part(G.box(5, 0.12, 0.25), 0xf4efe0, [x, Y + 0.08, z]));
    }
  }
  // 教会への坂道(地面にそわせた帯)
  {
    const pts = CHURCH_ROAD.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const cv = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const n = Math.floor(cv.getLength() / 5);
    const pos = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p = cv.getPointAt(i / n), tg = cv.getTangentAt(i / n);
      const sx = -tg.z * 4.5, sz = tg.x * 4.5;
      const a = [p.x + sx, ctx.heightAt(p.x + sx, p.z + sz) + 0.25, p.z + sz];
      const b = [p.x - sx, ctx.heightAt(p.x - sx, p.z - sz) + 0.25, p.z - sz];
      if (prev) pos.push(...prev[0], ...a, ...prev[1], ...prev[1], ...a, ...b);
      prev = [a, b];
      if (i % 2 === 0 && i < n) { const q = cv.getPointAt(Math.min(1, (i + 2) / n)); ctx.road(p.x, p.z, q.x, q.z); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const c = new THREE.Color(0x8a8278);
    const col = new Float32Array(pos.length);
    for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true;
    ctx.addMesh(m);
  }
  const roadMesh = new THREE.Mesh(merge(roads), roadMat);
  roadMesh.receiveShadow = true;
  ctx.addMesh(roadMesh);

  // ---------- 建物 ----------
  const B = [];
  const lamps = [];
  const PLAZA = [0, 100], PARKS = [[-300, 0], [300, 200], [-500, 300]], SCHOOL = [400, -100];
  const blocks = [];
  const fountains = [];
  const isBlock = (x, z, b) => b[0] === x && b[1] === z;
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 2; j++) {
      const bx = XS[i], bz = ZS[j];
      const cx = bx + 50, cz = bz + 50;
      blocks.push([cx, cz]);
      // 歩道(区画のまわり)
      for (const sz of [-1, 1]) B.push(part(G.box(88, 0.25, 3.5), 0xc8c2b4, [cx, Y + 0.12, cz + sz * 42.2]));
      for (const sx of [-1, 1]) B.push(part(G.box(3.5, 0.25, 81), 0xc8c2b4, [cx + sx * 42.2, Y + 0.12, cz]));
      if (isBlock(bx, bz, PLAZA)) {
        B.push(part(G.box(80, 0.18, 80), 0xd8cdb4, [cx, Y + 0.09, cz]));
        continue;
      }
      if (isBlock(bx, bz, SCHOOL)) {
        // 学校:校舎と校庭
        B.push(part(G.box(80, 0.15, 46), 0xd2b48a, [cx, Y + 0.08, cz + 14]));
        B.push(part(G.box(70, 10.5, 16), 0xf4eee0, [cx, Y + 5.25, cz - 28]));
        B.push(part(G.box(71, 0.6, 17), 0xb8b0a0, [cx, Y + 10.8, cz - 28]));
        B.push(part(G.box(8, 14, 8), 0xf4eee0, [cx, Y + 7, cz - 24]));
        B.push(part(G.cyl(2, 2, 0.3, 14), 0xfbf6e4, [cx, Y + 11.5, cz - 19.9], [Math.PI / 2, 0, 0]));
        for (let f = 0; f < 3; f++) for (let k = 0; k < 12; k++) B.push(part(G.box(3.2, 1.8, 0.2), COLS.glass, [cx - 30 + k * 5.4, Y + 1.8 + f * 3.4, cz - 19.9]));
        for (const gx of [-30, 30]) {
          B.push(part(G.box(0.25, 2.4, 0.25), 0xf7f4ea, [cx + gx, Y + 1.2, cz + 10]));
          B.push(part(G.box(0.25, 2.4, 0.25), 0xf7f4ea, [cx + gx, Y + 1.2, cz + 18]));
          B.push(part(G.box(0.25, 0.25, 8.2), 0xf7f4ea, [cx + gx, Y + 2.4, cz + 14]));
        }
        B.push(part(G.box(0.2, 7, 0.2), COLS.grey, [cx + 36, Y + 3.5, cz - 12]));
        ctx.solid(cx, cz - 28, 34, Y + 14);
        continue;
      }
      if (PARKS.some((p) => isBlock(bx, bz, p))) {
        B.push(part(G.box(80, 0.2, 80), 0x8fbf6a, [cx, Y + 0.1, cz]));
        B.push(part(G.box(80, 0.22, 4), 0xd8cdb4, [cx, Y + 0.11, cz]));
        B.push(part(G.box(4, 0.22, 80), 0xd8cdb4, [cx, Y + 0.11, cz]));
        for (let k = 0; k < 9; k++) {
          const tx = cx + (R() - 0.5) * 70, tz = cz + (R() - 0.5) * 70;
          for (const g of M.treeGeometry(R() > 0.4 ? 'round' : 'blossom')) {
            g.translate(tx, Y, tz);
            B.push(g);
          }
          ctx.solid(tx, tz, 1.4, Y + 8);
        }
        if (isBlock(bx, bz, PARKS[1])) fountains.push([cx, cz]);
        continue;
      }
      // 区画を4つに分けて、それぞれに建物
      const center = Math.hypot(cx - 50, cz - 150);
      for (const [ox, oz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        if (R() < 0.08) continue;
        const w = 22 + R() * 14, d = 22 + R() * 14;
        const floors = Math.max(1, Math.round(1 + R() * 2 + 3 * Math.max(0, 1 - center / 700)));
        const h = floors * 3.4;
        const x = cx + ox, z = cz + oz;
        const wall = WALLS[Math.floor(R() * WALLS.length)];
        B.push(part(G.box(w, h, d), wall, [x, Y + h / 2, z]));
        if (floors <= 2 && R() < 0.7) {
          B.push(part(G.prism(d * 0.6, w + 1), ROOFS[Math.floor(R() * ROOFS.length)], [x, Y + h + d * 0.24, z], [0, 0, 0], [1, 0.8, 1]));
        } else {
          B.push(part(G.box(w + 0.6, 0.8, d + 0.6), 0xb8b0a0, [x, Y + h + 0.4, z]));
          // 屋上:給水タンク・室外機・アンテナ
          if (R() < 0.5) B.push(part(G.box(4, 2.4, 4), 0x9a948a, [x + (R() - 0.5) * w * 0.5, Y + h + 1.6, z + (R() - 0.5) * d * 0.5]));
          if (R() < 0.5) {
            const tx = x + (R() - 0.5) * w * 0.5, tz = z + (R() - 0.5) * d * 0.5;
            B.push(part(G.cyl(1.6, 1.6, 2.6, 10), 0xd8d2c4, [tx, Y + h + 3.3, tz]));
            for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.push(part(G.box(0.2, 1.6, 0.2), 0x7a7a80, [tx + lx, Y + h + 1.4, tz + lz]));
          }
          for (let k = 0; k < 1 + Math.floor(R() * 3); k++) B.push(part(G.box(1.4, 1, 1), 0xe8e4dc, [x + (R() - 0.5) * w * 0.7, Y + h + 1.3, z + (R() - 0.5) * d * 0.7]));
          if (R() < 0.35) B.push(part(G.box(0.12, 5, 0.12), 0x5a5a60, [x + w * 0.3, Y + h + 3.3, z - d * 0.3]));
          // ベランダ
          if (floors >= 3) {
            const fz2 = oz > 0 ? 1 : -1;
            for (let f = 1; f < floors; f++) {
              B.push(part(G.box(w * 0.7, 0.18, 1.3), 0xd8d2c4, [x, Y + f * 3.4 + 0.2, z + fz2 * (d / 2 + 0.65)]));
              B.push(part(G.box(w * 0.7, 0.9, 0.08), 0xe8e4dc, [x, Y + f * 3.4 + 0.75, z + fz2 * (d / 2 + 1.28)]));
            }
          }
        }
        // 窓(道に面した2つの面)
        const fz = oz > 0 ? 1 : -1, fx = ox > 0 ? 1 : -1;
        const nw = Math.floor(w / 5), nd = Math.floor(d / 5);
        for (let f = 0; f < floors; f++) {
          const wy = Y + f * 3.4 + 2.0;
          if (f === 0 && R() < 0.5) {
            // 1階はお店:日よけとショーウィンドウ
            const ac = [COLS.red, COLS.teal, COLS.yellow, COLS.navy][Math.floor(R() * 4)];
            B.push(part(G.box(w * 0.8, 0.25, 2.4), ac, [x, Y + 3.0, z + fz * (d / 2 + 1.1)], [fz * 0.35, 0, 0]));
            B.push(part(G.box(w * 0.7, 1.8, 0.2), COLS.glass, [x, Y + 1.3, z + fz * (d / 2 + 0.05)]));
            continue;
          }
          for (let k = 0; k < nw; k++) {
            B.push(part(G.box(1.5, 1.7, 0.2), COLS.glass, [x - w / 2 + (k + 0.5) * (w / nw), wy, z + fz * (d / 2 + 0.05)]));
          }
          for (let k = 0; k < nd; k++) {
            B.push(part(G.box(0.2, 1.7, 1.5), COLS.glass, [x + fx * (w / 2 + 0.05), wy, z - d / 2 + (k + 0.5) * (d / nd)]));
          }
        }
        ctx.solid(x, z, Math.max(w, d) * 0.56, Y + h + 2);
      }
    }
  }
  // 街灯(道ぞい)
  for (const x of XS) {
    for (let z = ZS[0] + 25; z < ZS[ZS.length - 1]; z += 50) {
      const lx = x + RW / 2 + 1.2;
      B.push(part(G.cyl(0.14, 0.18, 5.5, 6), COLS.navy, [lx, Y + 2.75, z]));
      lamps.push(part(G.box(0.5, 0.5, 0.5), 0xfff0c0, [lx, Y + 5.6, z]));
    }
  }
  // 並木(大通り)
  for (const x of [0, 100]) {
    for (let z = ZS[0] + 12; z < ZS[ZS.length - 1] - 8; z += 24) {
      if (ZS.some((zz) => Math.abs(zz - z) < 12)) continue;
      for (const sx of [-1, 1]) {
        const tx = x + sx * 8.2;
        for (const g of M.treeGeometry('round')) { g.scale(0.62, 0.62, 0.62); g.translate(tx, Y + 0.2, z); B.push(g); }
        ctx.solid(tx, z, 0.9, Y + 6);
      }
    }
  }
  // 横断歩道と信号(まんなかの交差点)
  const sigA = [], sigB = [];
  for (const x of XS) for (const z of ZS) {
    if (Math.abs(x - 50) > 260 || z < 0 || z > 400) continue;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = -2; k <= 2; k++) {
        const ox = ax ? ax * 10.5 : k * 2.2, oz = az ? az * 10.5 : k * 2.2;
        B.push(part(G.box(ax ? 2.6 : 1.2, 0.12, ax ? 1.2 : 2.6), 0xf4efe0, [x + ox, Y + 0.09, z + oz]));
      }
    }
    if ((x === 0 || x === 200 || x === -200) && (z === 100 || z === 300)) {
      for (const [cx2, cz2, grp] of [[x + 8, z + 8, sigA], [x - 8, z - 8, sigA], [x + 8, z - 8, sigB], [x - 8, z + 8, sigB]]) {
        B.push(part(G.cyl(0.13, 0.16, 5.2, 6), 0x5a5a60, [cx2, Y + 2.6, cz2]));
        B.push(part(G.box(0.7, 1.6, 0.7), 0x3a3a40, [cx2, Y + 5.4, cz2]));
        grp.push(part(G.box(0.75, 0.5, 0.75), 0xffffff, [cx2, Y + 5.6, cz2]));
      }
    }
  }
  const sigMats = [new THREE.MeshBasicMaterial({ vertexColors: true }), new THREE.MeshBasicMaterial({ vertexColors: true })];
  if (sigA.length) ctx.addMesh(new THREE.Mesh(merge(sigA), sigMats[0]));
  if (sigB.length) ctx.addMesh(new THREE.Mesh(merge(sigB), sigMats[1]));
  ctx.updater((t) => {
    const c = t % 16;
    sigMats[0].color.set(c < 6 ? 0x5fe08a : c < 8 ? 0xffd24a : 0xff5a4a);
    sigMats[1].color.set(c < 8 ? 0xff5a4a : c < 14 ? 0x5fe08a : 0xffd24a);
  });
  // 道ばたにとまっている車
  const PCOL = [0xc65a43, 0x86bcd6, 0xe3b54d, 0xf1e6c8, 0x7fae5c, 0xb7a0dc, 0xf7f4ea];
  for (let k = 0; k < 34; k++) {
    const alongX = R() < 0.5;
    const line = alongX ? ZS[1 + Math.floor(R() * (ZS.length - 3))] : XS[1 + Math.floor(R() * (XS.length - 2))];
    const t0 = alongX ? XS[0] + 15 + R() * (XS[XS.length - 1] - XS[0] - 30) : ZS[0] + 15 + R() * (ZS[ZS.length - 2] - ZS[0] - 30);
    if ((alongX ? XS : ZS).some((v) => Math.abs(v - t0) < 14)) continue;
    const sd = R() < 0.5 ? -1 : 1;
    const x = alongX ? t0 : line + sd * 4.6, z = alongX ? line + sd * 4.6 : t0;
    const c = PCOL[Math.floor(R() * PCOL.length)];
    const rot = alongX ? Math.PI / 2 : 0;
    const car = [
      part(G.box(1.7, 0.65, 3.6), c, [0, 0.7, 0]), part(G.box(1.45, 0.55, 1.9), COLS.glass, [0, 1.3, -0.2]),
      part(G.box(1.5, 0.08, 1.8), c, [0, 1.6, -0.2]),
    ];
    for (const [wx, wz] of [[0.8, 1.2], [-0.8, 1.2], [0.8, -1.2], [-0.8, -1.2]]) car.push(part(G.cyl(0.34, 0.34, 0.24, 8), 0x2f2a28, [wx, 0.34, wz], [0, 0, Math.PI / 2]));
    const mm = new THREE.Matrix4().makeRotationY(rot).setPosition(x, Y, z);
    for (const g of car) { g.applyMatrix4(mm); B.push(g); }
    ctx.solid(x, z, 1.8, Y + 2);
  }
  // 港:コンテナと、とまっている小舟
  const CC = [0xc65a43, 0x3d6e9a, 0xe3b54d, 0x5fa7a0, 0x8a3a32, 0xf1e6c8];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 1 + Math.floor(R() * 3); k++) {
    B.push(part(G.box(6, 2.5, 2.4), CC[Math.floor(R() * CC.length)], [-640 + i * 6.4, Y + 1.25 + k * 2.55, 498 + j * 2.6]));
  }
  ctx.solid(-624, 500, 20, Y + 9);

  const bm = new THREE.Mesh(merge(B), lowpolyMat);
  bm.castShadow = true;
  bm.receiveShadow = true;
  ctx.addMesh(bm);
  ctx.addMesh(new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ vertexColors: true })));

  // 噴水
  for (const [fx, fz] of fountains) {
    ctx.addMesh(new THREE.Mesh(merge([
      part(G.cyl(8, 8.5, 0.9, 16), 0xb8b0a0, [fx, Y + 0.45, fz]),
      part(G.cyl(7.3, 7.3, 0.2, 16), 0x6aaed0, [fx, Y + 0.85, fz]),
      part(G.cyl(0.6, 0.9, 3, 8), 0xb8b0a0, [fx, Y + 2.3, fz]),
      part(G.cyl(2.4, 1.2, 0.6, 12), 0xb8b0a0, [fx, Y + 3.9, fz]),
    ]), lowpolyMat));
    const jet = new THREE.Mesh(G.cone(1.6, 4, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8f6fc, transparent: true, opacity: 0.55, depthWrite: false }));
    jet.position.set(fx, Y + 5.6, fz);
    jet.rotation.x = Math.PI;
    ctx.addMesh(jet);
    ctx.updater((t) => { jet.scale.set(1 + Math.sin(t * 7) * 0.06, 1 + Math.sin(t * 5.3) * 0.12, 1 + Math.cos(t * 6.1) * 0.06); });
    ctx.solid(fx, fz, 8.5, Y + 5);
  }

  // ---------- 歩く人 ----------
  {
    const NP = 80;
    const bodyGeo = merge([part(G.box(0.55, 0.75, 0.32), 0xffffff, [0, 1.15, 0])]);
    const restGeo = merge([
      part(G.box(0.22, 0.8, 0.22), 0x3d4b6e, [0.14, 0.4, 0]), part(G.box(0.22, 0.8, 0.22), 0x3d4b6e, [-0.14, 0.4, 0]),
      part(G.sph(0.2, 7, 5), 0xf0c8a8, [0, 1.75, 0]), part(G.sph(0.21, 7, 4), 0x3a2a20, [0, 1.84, -0.03], [0, 0, 0], [1, 0.7, 1]),
    ]);
    const bodies = new THREE.InstancedMesh(bodyGeo, lowpolyMat, NP);
    const rest = new THREE.InstancedMesh(restGeo, lowpolyMat, NP);
    const SH = [0xc65a43, 0x86bcd6, 0xe3b54d, 0xf7f4ea, 0x7fae5c, 0xeaa0b6, 0xb7a0dc, 0x5fa7a0];
    const ppl = [];
    const _c = new THREE.Color();
    for (let i = 0; i < NP; i++) {
      const [bx, bz] = blocks[Math.floor(R() * blocks.length)];
      ppl.push({ bx, bz, off: R() * 336, sp: (1.1 + R() * 0.6) * (R() < 0.5 ? 1 : -1), ph: R() * 6 });
      bodies.setColorAt(i, _c.set(SH[i % SH.length]));
    }
    bodies.castShadow = rest.castShadow = true;
    ctx.addMesh(bodies);
    ctx.addMesh(rest);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    ctx.updater((t) => {
      for (let i = 0; i < NP; i++) {
        const P = ppl[i];
        // 区画のまわりの歩道(1辺84m)を歩く
        let s = ((P.off + t * P.sp) % 336 + 336) % 336;
        const side = Math.floor(s / 84), u = s % 84 - 42;
        const r = 42.2;
        let x, z, hd;
        if (side === 0) { x = P.bx + u; z = P.bz - r; hd = Math.PI / 2; }
        else if (side === 1) { x = P.bx + r; z = P.bz + u; hd = 0; }
        else if (side === 2) { x = P.bx - u; z = P.bz + r; hd = -Math.PI / 2; }
        else { x = P.bx - r; z = P.bz - u; hd = Math.PI; }
        if (P.sp < 0) hd += Math.PI;
        p.set(x, Y + 0.25 + Math.abs(Math.sin(t * 7 + P.ph)) * 0.06, z);
        q.setFromAxisAngle(up, hd);
        m4.compose(p, q, sc);
        bodies.setMatrixAt(i, m4);
        rest.setMatrixAt(i, m4);
      }
      bodies.instanceMatrix.needsUpdate = true;
      rest.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------- 路面電車(海ぞいの道) ----------
  buildTram(ctx, { z: 470, x0: -560, x1: 560, y: Y });

  // ---------- 丘の家並みと、小さな神社 ----------
  // 坂道の近くと、碁盤の目の中には建てない
  const nearRoad = (x, z) => {
    for (let i = 0; i < CHURCH_ROAD.length - 1; i++) {
      const [ax, az] = CHURCH_ROAD[i], [bx2, bz2] = CHURCH_ROAD[i + 1];
      const dx = bx2 - ax, dz = bz2 - az, l2 = dx * dx + dz * dz;
      const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * tt, z - az - dz * tt) < 22) return true;
    }
    return false;
  };
  const avoid = (x, z) => inTown(x, z, 25) || nearRoad(x, z) || Math.hypot(x - CHURCH.x, z - CHURCH.z) < 40;
  buildVillage(ctx, { x: -60, z: -470, r: 420, n: 46, style: 'hillside', seed: 11, avoid });
  buildVillage(ctx, { x: 930, z: 40, r: 230, n: 18, style: 'hillside', seed: 12, avoid });
  buildVillage(ctx, { x: -930, z: 120, r: 230, n: 18, style: 'hillside', seed: 13, avoid });
  {
    const sx = -780, sz = -170, sy = ctx.heightAt(sx, sz);
    const T = [
      part(G.box(0.7, 7, 0.7), 0xd0402a, [-3, 3.5, 0]), part(G.box(0.7, 7, 0.7), 0xd0402a, [3, 3.5, 0]),
      part(G.box(9, 0.7, 0.9), 0x2a2a2a, [0, 7.2, 0]), part(G.box(7.6, 0.5, 0.6), 0xd0402a, [0, 6.1, 0]),
      part(G.box(8, 4.5, 6), 0x8a5a3a, [0, 2.3, -16]), part(G.prism(5, 9.5), 0x3a3f5c, [0, 4.5 + 2, -16], [0, 0, 0], [1, 0.75, 1]),
      part(G.box(9, 0.5, 7), 0xb8b0a0, [0, 0.2, -16]), part(G.box(2.4, 0.2, 14), 0xb8b0a0, [0, 0.1, -6]),
    ];
    const mm = new THREE.Matrix4().makeRotationY(Math.atan2(50 - sx, 150 - sz)).setPosition(sx, sy, sz);
    for (const g of T) g.applyMatrix4(mm);
    ctx.addMesh(new THREE.Mesh(merge(T), lowpolyMat));
    ctx.solid(sx, sz, 6, sy + 8);
  }

  // ---------- 広場・海辺・丘 ----------
  ctx.add(M.clockTower(), 50, 150, { exclude: 0, solid: 6, top: 45 });
  ctx.add(M.bench(), 20, 120, { rot: 0.4 });
  ctx.add(M.bench(), 80, 180, { rot: 3.5 });
  ctx.add(M.ferrisWheel(), 420, 505, { exclude: 0, solid: 9, top: 50 });
  ctx.add(M.warehouse(44, 1), -380, 505, { rot: Math.PI / 2, solid: 14, top: 16 });
  ctx.add(M.warehouse(36, 2), -260, 505, { rot: Math.PI / 2, solid: 12, top: 16 });
  ctx.add(M.harborCrane(), -560, 530, { rot: Math.PI, solid: 5, top: 26 });
  ctx.add(M.pier(80), 120, coastZ(120) - 18, { y: 0 });
  ctx.add(M.pier(60), -120, coastZ(-120) - 18, { y: 0, rot: 0 });
  ctx.add(M.lighthouse(), 120, coastZ(120) + 80, { y: 0.5, solid: 4, top: 26 });
  [[106, coastZ(106) + 30, 0.1], [134, coastZ(134) + 45, -0.1], [-106, coastZ(-106) + 25, 0.2], [-134, coastZ(-134) + 40, -0.15]].forEach(([bx2, bz2, r], i) => {
    const b = M.sailboat([COLS.red, COLS.navy, COLS.yellow, COLS.teal][i]);
    ctx.add(b, bx2, bz2, { y: 0, rot: r });
  });
  ctx.boats([[0, 760], [-400, 700], [350, 820], [700, 650]], [COLS.red, COLS.navy, COLS.yellow, COLS.teal], 70);
  ctx.add(M.church(), CHURCH.x, CHURCH.z, { exclude: 40, rot: 0.3, solid: 10, top: 30 });

  // ---------- 行きかう車 ----------
  const carCols = [0xc65a43, 0x86bcd6, 0xe3b54d, 0xf1e6c8, 0x7fae5c, 0xeaa0b6, 0x3d4b6e, 0xb7a0dc];
  for (let i = 0; i < 16; i++) {
    const a = Math.floor(R() * (XS.length - 2)), b = a + 1 + Math.floor(R() * 4);
    const c = Math.floor(R() * (ZS.length - 2)), d = c + 1 + Math.floor(R() * 3);
    const x0 = XS[a], x1 = XS[Math.min(b, XS.length - 1)], z0 = ZS[c], z1 = ZS[Math.min(d, ZS.length - 1)];
    const per = 2 * (x1 - x0 + z1 - z0);
    const car = M.buildCar(carCols[i % carCols.length], true);
    car.root.scale.setScalar(1.1);
    ctx.addMesh(car.root);
    const sp = 7 + R() * 5, off = R() * per;
    const dir = R() < 0.5 ? 1 : -1;
    ctx.updater((t) => {
      let s = ((off + dir * t * sp) % per + per) % per;
      let x, z, hx, hz;
      if (s < x1 - x0) { x = x0 + s; z = z0; hx = 1; hz = 0; }
      else if ((s -= x1 - x0) < z1 - z0) { x = x1; z = z0 + s; hx = 0; hz = 1; }
      else if ((s -= z1 - z0) < x1 - x0) { x = x1 - s; z = z1; hx = -1; hz = 0; }
      else { s -= x1 - x0; x = x0; z = z1 - s; hx = 0; hz = -1; }
      hx *= dir; hz *= dir;
      // 進む向きの左側を走る
      car.root.position.set(x + hz * 3, Y, z - hx * 3);
      car.root.rotation.y = Math.atan2(hx, hz);
      for (const w of car.wheels) w.rotation.x = t * sp / 0.33;
    });
  }

  return [
    { id: 'clock', name: '時計台の広場', x: 50, z: 150, r: 170,
      desc: '街のまんなかの、赤れんがの時計台。\n針はいつも、ほんとうの時刻をさしている。' },
    { id: 'wheel', name: '港の観覧車', x: 420, z: 505, r: 190,
      desc: '海辺でゆっくりまわる、大きな観覧車。\nてっぺんからは、街と海がいっぺんに見える。' },
    { id: 'brick', name: '赤れんが倉庫', x: -320, z: 505, r: 190,
      desc: 'むかしは船の荷物でいっぱいだった倉庫。\nいまは小さなお店と、パンのいいにおい。' },
    { id: 'church', name: '丘の上の教会', x: CHURCH.x, z: CHURCH.z, r: 200,
      desc: '坂道をのぼった先の、白い教会。\n鐘が鳴ると、港の船が汽笛でこたえる。' },
  ];
}
