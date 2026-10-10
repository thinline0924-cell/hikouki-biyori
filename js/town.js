// 港町:碁盤の目の道、建物、行きかう車、海辺の観覧車や倉庫
import * as THREE from 'three';
import { part, merge, G, rng, lowpolyMat } from './util.js';
import * as M from './models.js';

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
  const PLAZA = [0, 100], PARKS = [[-300, 0], [300, 200], [-500, 300]];
  const isBlock = (x, z, b) => b[0] === x && b[1] === z;
  for (let i = 0; i < XS.length - 1; i++) {
    for (let j = 0; j < ZS.length - 2; j++) {
      const bx = XS[i], bz = ZS[j];
      const cx = bx + 50, cz = bz + 50;
      if (isBlock(bx, bz, PLAZA)) continue;
      if (PARKS.some((p) => isBlock(bx, bz, p))) {
        B.push(part(G.box(86, 0.2, 86), 0x8fbf6a, [cx, Y + 0.1, cz]));
        for (let k = 0; k < 9; k++) {
          const tx = cx + (R() - 0.5) * 70, tz = cz + (R() - 0.5) * 70;
          for (const g of M.treeGeometry(R() > 0.4 ? 'round' : 'blossom')) {
            g.translate(tx, Y, tz);
            B.push(g);
          }
          ctx.solid(tx, tz, 1.4, Y + 8);
        }
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
          if (R() < 0.5) B.push(part(G.box(4, 2.4, 4), 0x9a948a, [x + (R() - 0.5) * w * 0.5, Y + h + 1.6, z + (R() - 0.5) * d * 0.5]));
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
  const bm = new THREE.Mesh(merge(B), lowpolyMat);
  bm.castShadow = true;
  bm.receiveShadow = true;
  ctx.addMesh(bm);
  ctx.addMesh(new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ vertexColors: true })));

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
