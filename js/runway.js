// 滑走路:舗装、白線、ふちの灯り、吹き流し、格納庫、管制塔、進入角を知らせる灯り(PAPI)
import * as THREE from 'three';
import { part, merge, G, lowpolyMat } from './util.js';
import { COL } from './models.js';

export const RUNWAY_W = 30;

// 滑走路の向きにそった座標(u:長さ方向、v:幅方向)
export function runwayFrame(st) {
  const dx = Math.sin(st.ang), dz = Math.cos(st.ang);
  return {
    dx, dz,
    toWorld: (u, v) => [st.x + dx * u - dz * v, st.z + dz * u + dx * v],
    toLocal: (x, z) => {
      const rx = x - st.x, rz = z - st.z;
      return [rx * dx + rz * dz, -rx * dz + rz * dx];
    },
  };
}

export function buildRunway(ctx, st, night) {
  const Y = st.y;
  const F = runwayFrame(st);
  const L = st.len, hw = RUNWAY_W / 2;
  const group = new THREE.Group();
  group.position.set(st.x, Y, st.z);
  group.rotation.y = st.ang; // ローカルの +z が滑走路の向き
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });

  // 舗装と白線
  const P = [part(G.box(RUNWAY_W + 8, 0.1, L + 30), 0x9a9486, [0, 0.03, 0]), part(G.box(RUNWAY_W, 0.1, L), 0x5f5e64, [0, 0.07, 0])];
  for (let z = -L / 2 + 60; z < L / 2 - 60; z += 30) P.push(part(G.box(0.8, 0.1, 14), 0xf4efe0, [0, 0.1, z]));
  for (const s of [-1, 1]) {
    P.push(part(G.box(0.5, 0.1, L - 4), 0xf4efe0, [s * (hw - 1), 0.1, 0]));
    for (let k = 0; k < 6; k++) {
      const x = (k - 2.5) * 4.2;
      P.push(part(G.box(1.8, 0.1, 22), 0xf4efe0, [x, 0.1, s * (L / 2 - 16)]));
    }
    // 接地帯のしるし
    for (const x of [-7, 7]) P.push(part(G.box(3, 0.1, 30), 0xf4efe0, [x, 0.1, s * (L / 2 - 90)]));
  }
  const pave = new THREE.Mesh(merge(P), mat);
  pave.receiveShadow = true;
  group.add(pave);

  // ふちの灯り
  const lights = [];
  for (let z = -L / 2; z <= L / 2; z += 40) {
    for (const s of [-1, 1]) lights.push(part(G.box(0.5, 0.5, 0.5), 0xfff3c8, [s * (hw + 2), 0.35, z]));
  }
  for (const s of [-1, 1]) for (let k = -5; k <= 5; k++) lights.push(part(G.box(0.5, 0.5, 0.5), s > 0 ? 0xa8f0b0 : 0xf0a0a0, [k * 2.8, 0.35, s * (L / 2 + 1)]));
  const lm = new THREE.Mesh(merge(lights), new THREE.MeshBasicMaterial({ vertexColors: true }));
  lm.material.color.setScalar(night ? 1.6 : 1);
  group.add(lm);

  // 格納庫と管制塔(滑走路の左がわ)
  const side = hw + 45;
  const B = [
    part(G.box(26, 9, 20), 0xd9d2c0, [side + 6, 4.5, -60]),
    part(new THREE.CylinderGeometry(13, 13, 20.4, 10, 1, false, -Math.PI / 2, Math.PI), 0x8a9aa8, [side + 6, 9, -60], [Math.PI / 2, 0, Math.PI / 2], [1, 0.35, 1]),
    part(G.box(0.2, 7, 14), 0x3a3f5c, [side + 6 - 13.05, 3.5, -60]),
    part(G.box(5, 14, 5), COL.cream, [side, 7, 40]),
    part(G.box(7, 3.4, 7), COL.glass, [side, 15.7, 40]),
    part(G.box(8, 0.6, 8), COL.red, [side, 17.7, 40]),
    part(G.cyl(0.1, 0.1, 4, 4), COL.dark, [side, 20, 40]),
    part(G.box(60, 0.1, 30), 0x9a9486, [side - 12, 0.04, -60]),
  ];
  const bm = new THREE.Mesh(merge(B), lowpolyMat);
  bm.castShadow = bm.receiveShadow = true;
  group.add(bm);
  const [hx, hz] = F.toWorld(-60, -(side + 6));
  ctx.solid(hx, hz, 15, Y + 12);
  const [tx, tz] = F.toWorld(40, -side);
  ctx.solid(tx, tz, 5, Y + 20);
  const beacon = new THREE.Mesh(G.box(0.8, 0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  beacon.position.set(side, 22.3, 40);
  group.add(beacon);

  // 吹き流し(風の向きを見せる)
  const sock = new THREE.Group();
  sock.position.set(-(hw + 20), 0, L / 2 - 120);
  sock.add(new THREE.Mesh(merge([part(G.cyl(0.12, 0.15, 8, 6), COL.grey, [0, 4, 0])]), lowpolyMat));
  const cone = new THREE.Group();
  cone.position.y = 7.8;
  const coneGeo = merge([
    part(G.cyl(0.55, 0.3, 1.2, 8), COL.red, [0, 0, 0.6], [Math.PI / 2, 0, 0]),
    part(G.cyl(0.3, 0.2, 1.2, 8), COL.white, [0, 0, 1.8], [Math.PI / 2, 0, 0]),
    part(G.cyl(0.2, 0.12, 1.2, 8), COL.red, [0, 0, 3.0], [Math.PI / 2, 0, 0]),
  ]);
  const coneMesh = new THREE.Mesh(coneGeo, lowpolyMat);
  cone.add(coneMesh);
  sock.add(cone);
  group.add(sock);

  // PAPI:4つの灯り。正しい角度(約3°)で近づくと「白白赤赤」
  const papis = [];
  for (const end of [-1, 1]) {
    const g = new THREE.Group();
    const lamps = [];
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(G.box(1.4, 1.0, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.position.set(-(hw + 8 + k * 4), 0.6, end * (L / 2 - 90));
      g.add(m);
      lamps.push(m);
    }
    group.add(g);
    papis.push({ end, lamps });
  }
  ctx.addMesh(group);

  const _lp = new THREE.Vector3();
  ctx.updater((t, dt, cam) => {
    beacon.visible = Math.floor(t * 1.2) % 2 === 0;
    // 吹き流しは風下を向く
    const wa = ctx.windAngle();
    cone.rotation.y = wa - st.ang + Math.sin(t * 2.3) * 0.08;
    cone.rotation.x = 0.25 + Math.sin(t * 3.1) * 0.05;
    if (!cam) return;
    _lp.copy(cam.position);
    const [u, v] = F.toLocal(_lp.x, _lp.z);
    for (const p of papis) {
      // 接地点(滑走路のはしから90m)から見た、カメラの高さの角度
      const touch = p.end * (L / 2 - 90);
      const dist = (u - touch) * p.end;
      const ang = dist > 20 ? (Math.atan2(_lp.y - Y, dist) * 180) / Math.PI : 0;
      const th = [3.5, 3.2, 2.8, 2.5];
      p.lamps.forEach((m, k) => m.material.color.set(dist > 20 && Math.abs(v) < 400 && ang > th[k] ? 0xffffff : 0xff4a3a));
    }
  });

  return {
    // 滑走路の上か
    onRunway(x, z) {
      const [u, v] = F.toLocal(x, z);
      return Math.abs(u) < L / 2 + 10 && Math.abs(v) < hw + 2;
    },
    // スタート位置(はしから少し内側、滑走路の向き)
    start(end = -1) {
      const [x, z] = F.toWorld(end * (L / 2 - 30), 0);
      return { x, z, dir: [-end * F.dx, -end * F.dz] };
    },
    beside() {
      const [x, z] = F.toWorld(-L / 2 + 120, -(hw + 25));
      return { x, z, dir: [F.dx, F.dz] };
    },
    frame: F,
  };
}
