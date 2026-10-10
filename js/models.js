// ローポリの模型:機体と、風景の小物(灯台・風車・小屋など)
import * as THREE from 'three';
import { part, mesh, G, rng } from './util.js';

const PI = Math.PI;
export const COL = {
  cream: 0xf1e6c8, red: 0xc65a43, navy: 0x3d4b6e, glass: 0x34425e, dark: 0x2f2a28,
  yellow: 0xe3b54d, teal: 0x5fa7a0, sky: 0x86bcd6, white: 0xf7f4ea, wood: 0x8a5a3a,
  grey: 0x9a9a92, rock: 0x8d8478, green: 0x6f9a55, leaf: 0x7dab5a, pine: 0x4f7a52,
};

const glowMat = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: true });

// ================= 機体 =================

function propeller(color = COL.navy, len = 3.0) {
  const g = new THREE.Group();
  const blades = mesh([
    part(G.box(0.24, len, 0.08), color, [0, 0, 0], [0, 0.25, 0]),
    part(G.cone(0.32, 0.6, 8), COL.red, [0, 0, 0.25], [PI / 2, 0, 0]),
  ], undefined, false);
  // まわっているときの、うすい円盤(ぶれて見える羽根)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(len / 2, 20),
    new THREE.MeshBasicMaterial({ color: 0xdfe6ee, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  g.add(blades, disc);
  g.userData.blades = blades;
  g.userData.disc = disc;
  return g;
}

function buildPlane() {
  const L = [
    part(G.cyl(0.85, 0.32, 7.2, 8), COL.cream, [0, 0, -0.6], [PI / 2, 0, 0]),
    part(G.cyl(0.55, 0.85, 1.0, 8), COL.red, [0, 0, 3.4], [PI / 2, 0, 0]),
    part(G.box(1.0, 0.55, 1.5), COL.glass, [0, 0.72, 1.3]),
    part(G.box(11.5, 0.22, 1.7), COL.cream, [0, 1.0, 0.9]),
    part(G.box(11.6, 0.24, 0.42), COL.red, [0, 1.01, 1.6]),
    part(G.box(4.2, 0.16, 1.1), COL.cream, [0, 0.1, -3.9]),
    part(G.box(0.16, 1.7, 1.3), COL.red, [0, 0.95, -3.95], [-0.25, 0, 0]),
    part(G.box(0.1, 1.4, 0.12), COL.navy, [1.4, 0.35, 0.9], [0, 0, 0.75]),
    part(G.box(0.1, 1.4, 0.12), COL.navy, [-1.4, 0.35, 0.9], [0, 0, -0.75]),
    part(G.cyl(0.36, 0.36, 0.25, 8), COL.dark, [1.0, -1.25, 1.3], [0, 0, PI / 2]),
    part(G.cyl(0.36, 0.36, 0.25, 8), COL.dark, [-1.0, -1.25, 1.3], [0, 0, PI / 2]),
    part(G.box(0.1, 0.9, 0.1), COL.navy, [0.8, -0.8, 1.3], [0, 0, -0.4]),
    part(G.box(0.1, 0.9, 0.1), COL.navy, [-0.8, -0.8, 1.3], [0, 0, 0.4]),
  ];
  const g = new THREE.Group();
  g.add(mesh(L));
  const p = propeller();
  p.position.set(0, 0, 4.0);
  g.add(p);
  return { root: g, props: [p] };
}

function buildBiplane() {
  const L = [
    part(G.cyl(0.8, 0.35, 6.2, 8), COL.yellow, [0, 0, -0.4], [PI / 2, 0, 0]),
    part(G.cyl(0.6, 0.8, 0.9, 8), COL.red, [0, 0, 3.1], [PI / 2, 0, 0]),
    part(G.box(9.6, 0.18, 1.5), COL.red, [0, 1.7, 0.9]),
    part(G.box(9.0, 0.18, 1.4), COL.red, [0, -0.45, 0.8]),
    part(G.box(3.6, 0.15, 1.0), COL.red, [0, 0.15, -3.4]),
    part(G.box(0.15, 1.5, 1.1), COL.yellow, [0, 0.85, -3.4], [-0.2, 0, 0]),
    part(G.box(0.8, 0.25, 0.9), COL.dark, [0, 0.72, -0.3]),
    part(G.sph(0.34, 7, 5), COL.wood, [0, 1.1, -0.35]),
    part(G.box(0.6, 0.1, 0.3), COL.red, [0.25, 0.85, -0.6], [0, 0.4, 0.2]),
    part(G.cyl(0.36, 0.36, 0.25, 8), COL.dark, [0.9, -1.3, 1.2], [0, 0, PI / 2]),
    part(G.cyl(0.36, 0.36, 0.25, 8), COL.dark, [-0.9, -1.3, 1.2], [0, 0, PI / 2]),
  ];
  for (const x of [-3.2, 3.2, -1.0, 1.0]) {
    L.push(part(G.box(0.1, 2.1, 0.1), COL.navy, [x, 0.62, 0.85]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  const p = propeller(COL.wood, 2.6);
  p.position.set(0, 0, 3.6);
  g.add(p);
  return { root: g, props: [p] };
}

function buildGlider() {
  const L = [
    part(G.cyl(0.5, 0.14, 8.5, 8), COL.white, [0, 0, -1.0], [PI / 2, 0, 0]),
    part(G.cone(0.5, 1.3, 8), COL.white, [0, 0, 3.85], [PI / 2, 0, 0]),
    part(G.box(0.62, 0.42, 1.8), COL.glass, [0, 0.38, 1.9], [0.08, 0, 0]),
    part(G.box(8.6, 0.12, 0.95), COL.white, [4.3, 0.42, 0.6], [0, 0, 0.06]),
    part(G.box(8.6, 0.12, 0.95), COL.white, [-4.3, 0.42, 0.6], [0, 0, -0.06]),
    part(G.box(1.0, 0.14, 0.5), COL.teal, [8.3, 0.95, 0.5], [0, 0, 0.06]),
    part(G.box(1.0, 0.14, 0.5), COL.teal, [-8.3, 0.95, 0.5], [0, 0, -0.06]),
    part(G.box(0.12, 1.7, 0.9), COL.teal, [0, 0.8, -5.0], [-0.3, 0, 0]),
    part(G.box(2.8, 0.1, 0.6), COL.white, [0, 1.6, -5.25]),
    part(G.cyl(0.22, 0.22, 0.12, 8), COL.dark, [0, -0.38, 0.6], [0, 0, PI / 2]),
  ];
  const g = new THREE.Group();
  g.add(mesh(L));
  return { root: g, props: [] };
}

function buildSeaplane() {
  const L = [
    part(G.cyl(0.8, 0.35, 6.8, 8), COL.sky, [0, 0.2, -0.5], [PI / 2, 0, 0]),
    part(G.cyl(0.55, 0.8, 0.9, 8), COL.white, [0, 0.2, 3.2], [PI / 2, 0, 0]),
    part(G.box(0.95, 0.5, 1.4), COL.glass, [0, 0.85, 1.2]),
    part(G.box(12, 0.22, 1.7), COL.white, [0, 1.1, 0.9]),
    part(G.box(12.1, 0.24, 0.4), COL.sky, [0, 1.11, 1.6]),
    part(G.box(4.0, 0.16, 1.1), COL.white, [0, 0.3, -3.6]),
    part(G.box(0.16, 1.7, 1.2), COL.sky, [0, 1.1, -3.7], [-0.25, 0, 0]),
  ];
  for (const s of [-1, 1]) {
    L.push(part(G.box(0.7, 0.55, 5.6), COL.red, [s * 1.7, -1.85, 0.4]));
    L.push(part(G.cone(0.42, 1.1, 4), COL.red, [s * 1.7, -1.8, 3.7], [PI / 2, PI / 4, 0]));
    L.push(part(G.box(0.1, 1.6, 0.1), COL.navy, [s * 1.3, -0.9, 1.6], [0, 0, s * 0.35]));
    L.push(part(G.box(0.1, 1.6, 0.1), COL.navy, [s * 1.3, -0.9, -0.8], [0, 0, s * 0.35]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  const p = propeller(COL.navy, 2.8);
  p.position.set(0, 0.2, 3.75);
  g.add(p);
  return { root: g, props: [p] };
}

function buildJet() {
  const L = [
    part(G.cyl(1.15, 1.15, 12, 10), COL.white, [0, 0, 0], [PI / 2, 0, 0]),
    part(G.cyl(0.35, 1.15, 2.6, 10), COL.white, [0, 0, 7.3], [PI / 2, 0, 0]),
    part(G.cyl(1.15, 0.3, 3.4, 10), COL.white, [0, 0.25, -7.7], [PI / 2, 0, 0]),
    part(G.box(2.36, 0.28, 11), COL.navy, [0, 0.35, 0.2]),
    part(G.box(1.7, 0.4, 0.7), COL.glass, [0, 0.55, 7.3], [0.5, 0, 0]),
    part(G.box(7.6, 0.25, 2.5), COL.cream, [4.3, -0.45, -0.6], [0, 0.38, -0.04]),
    part(G.box(7.6, 0.25, 2.5), COL.cream, [-4.3, -0.45, -0.6], [0, -0.38, 0.04]),
    part(G.box(0.25, 3.3, 2.4), COL.red, [0, 2.2, -7.6], [-0.42, 0, 0]),
    part(G.box(6.0, 0.2, 1.6), COL.cream, [0, 0.5, -8.0], [0, 0, 0]),
  ];
  for (const s of [-1, 1]) {
    L.push(part(G.cyl(0.55, 0.5, 2.4, 8), COL.grey, [s * 3.4, -1.0, 0.8], [PI / 2, 0, 0]));
    L.push(part(G.cyl(0.4, 0.4, 0.1, 8), COL.dark, [s * 3.4, -1.0, 2.0], [PI / 2, 0, 0]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  // 車輪(飛ぶとしまわれる)
  const gear = new THREE.Group();
  const GL = [];
  for (const [x, z] of [[1.6, -0.6], [-1.6, -0.6], [0, 5.6]]) {
    GL.push(part(G.box(0.18, 1.6, 0.18), COL.grey, [x, -1.8, z]));
    GL.push(part(G.cyl(0.42, 0.42, 0.35, 10), COL.dark, [x, -2.28, z], [0, 0, PI / 2]));
  }
  gear.add(mesh(GL));
  g.add(gear);
  return { root: g, props: [], gear };
}

function buildBalloon() {
  const stripes = [COL.red, COL.cream, COL.yellow, COL.cream];
  const gore = (c) => stripes[Math.floor(((Math.atan2(c.z, c.x) + PI) / (PI * 2)) * 12) % 4];
  const L = [
    part(G.sph(7, 12, 9), gore, [0, 14, 0], [0, 0, 0], [1, 1.15, 1]),
    part(G.cyl(4.2, 1.5, 3, 12), gore, [0, 6.6, 0]),
    part(G.box(1.9, 1.2, 1.9), COL.wood, [0, 0.6, 0]),
    part(G.box(2.05, 0.16, 2.05), 0x5e3c26, [0, 1.22, 0]),
    part(G.cyl(0.35, 0.35, 0.5, 8), COL.grey, [0, 4.6, 0]),
    part(G.sph(0.3, 6, 4), COL.navy, [0.4, 1.55, 0.3]),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    L.push(part(G.box(0.06, 4.0, 0.06), 0x6b5440, [sx * 1.0, 3.2, sz * 1.0], [-sz * 0.08, 0, sx * 0.08]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  const flame = new THREE.Mesh(G.cone(0.45, 1.8, 6), glowMat(0xffa64a));
  flame.position.set(0, 5.8, 0);
  g.add(flame);
  return { root: g, props: [], flame };
}

const BUILDERS = {
  plane: buildPlane, biplane: buildBiplane, glider: buildGlider,
  seaplane: buildSeaplane, jet: buildJet, balloon: buildBalloon,
  car: () => buildCar(), scooter: () => buildScooter(),
};
export function buildAircraft(id) {
  return BUILDERS[id]();
}

// ================= 木(たくさん並べる用) =================
export function treeGeometry(kind) {
  const L = [];
  if (kind === 'pine' || kind === 'snowpine') {
    L.push(part(G.cyl(0.35, 0.45, 2, 5), COL.wood, [0, 1, 0]));
    const c = kind === 'snowpine' ? [0x3f6450, 0x4c7158, 0xe9f0f2] : [0x3f6a48, 0x4f7a52, 0x5f8a5a];
    L.push(part(G.cone(3.0, 4.2, 6), c[0], [0, 3.6, 0]));
    L.push(part(G.cone(2.3, 3.4, 6), c[1], [0, 5.6, 0]));
    L.push(part(G.cone(1.4, 2.6, 6), c[2], [0, 7.4, 0]));
  } else if (kind === 'palm') {
    L.push(part(G.cyl(0.25, 0.4, 3.2, 5), 0x9a7650, [0, 1.6, 0], [0, 0, 0.08]));
    L.push(part(G.cyl(0.2, 0.25, 3.2, 5), 0x9a7650, [0.35, 4.6, 0], [0, 0, 0.18]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      L.push(part(G.box(0.9, 0.12, 3.6), i % 2 ? 0x6fa24f : 0x5d8e45,
        [0.6 + Math.sin(a) * 1.5, 6.0, Math.cos(a) * 1.5], [0.45, a, 0]));
    }
  } else if (kind === 'round') {
    L.push(part(G.cyl(0.3, 0.45, 2.6, 5), COL.wood, [0, 1.3, 0]));
    L.push(part(G.ico(2.6), 0x78a454, [0, 4.0, 0]));
    L.push(part(G.ico(1.7), 0x8cb862, [0.9, 5.0, 0.4]));
  } else if (kind === 'blossom') {
    L.push(part(G.cyl(0.3, 0.45, 2.6, 5), 0x7a5a48, [0, 1.3, 0]));
    L.push(part(G.ico(2.5), 0xf2b8c6, [0, 4.0, 0]));
    L.push(part(G.ico(1.6), 0xf7d0d8, [0.8, 5.0, -0.5]));
  } else if (kind === 'bush') {
    L.push(part(G.ico(1.4), 0x6d9650, [0, 0.8, 0]));
    L.push(part(G.ico(1.0), 0x7fa85c, [0.9, 0.6, 0.3]));
  } else if (kind === 'rock') {
    L.push(part(G.dod(2.0), 0x8f877c, [0, 0.6, 0], [0.3, 0.5, 0.2], [1.3, 0.7, 1]));
  }
  return L;
}

// ================= 風景の小物 =================
// どれも { group, update(t, dt) } を返す。group の原点は地面

export function lighthouse() {
  const group = new THREE.Group();
  const band = (c) => (Math.floor((c.y + 30) / 3.2) % 2 ? COL.red : COL.white);
  group.add(mesh([
    part(G.cyl(2.0, 3.0, 18, 8), band, [0, 9, 0]),
    part(G.cyl(3.1, 3.1, 0.5, 8), COL.navy, [0, 18.3, 0]),
    part(G.cyl(1.9, 1.9, 0.4, 8), COL.navy, [0, 21.0, 0]),
    part(G.cone(2.3, 2.2, 8), COL.red, [0, 22.3, 0]),
    part(G.box(5, 3.2, 4), COL.white, [5, 1.6, 0]),
    part(G.cyl(0.1, 3.5, 2.6, 4), COL.red, [5, 4.4, 0], [0, PI / 4, 0], [1, 1, 0.75]),
    part(G.box(1.0, 1.0, 0.1), COL.glass, [5, 1.8, 2.05]),
  ]));
  const lamp = new THREE.Mesh(G.cyl(1.6, 1.6, 2.4, 8), glowMat(0xffe7a6));
  lamp.position.y = 19.7;
  group.add(lamp);
  const beamG = new THREE.Group();
  beamG.position.y = 19.7;
  const beamGeo = new THREE.ConeGeometry(9, 120, 10, 1, true);
  beamGeo.translate(0, -60, 0);
  beamGeo.rotateZ(PI / 2);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    color: 0xfff1c4, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beamG.add(beam);
  group.add(beamG);
  return { group, update: (t) => { beamG.rotation.y = t * 0.7; } };
}

export function rockArch(r = 32, seed = 3) {
  const R = rng(seed);
  const shade = [0x9b8f80, 0x8a7f72, 0xa79a87, 0x7e746a];
  const g = new THREE.Group();
  g.add(mesh([
    part(G.torus(r, 9, 5, 9, PI), () => shade[Math.floor(R() * 4)], [0, -6, 0], [0, 0, 0], [1, 1.15, 1]),
    part(G.dod(10), shade[1], [r, -4, 0], [0.2, 0.4, 0], [1, 1.2, 1]),
    part(G.dod(11), shade[2], [-r, -4, 0], [0.5, 0.1, 0], [1, 1.1, 1]),
    part(G.box(8, 3, 6), 0x6f9a55, [0, r * 1.15 + 1.5, 0], [0, 0, 0.1]),
  ]));
  return { group: g, update: null };
}

export function bench() {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(3, 0.2, 0.9), COL.wood, [0, 1.0, 0]),
    part(G.box(3, 0.9, 0.15), COL.wood, [0, 1.6, -0.45]),
    part(G.box(0.15, 1.0, 0.8), COL.dark, [-1.3, 0.5, 0]),
    part(G.box(0.15, 1.0, 0.8), COL.dark, [1.3, 0.5, 0]),
    part(G.cyl(0.12, 0.15, 6, 6), COL.navy, [2.6, 3, 0]),
    part(G.box(0.8, 0.9, 0.8), COL.navy, [2.6, 6.2, 0]),
  ]));
  const lamp = new THREE.Mesh(G.box(0.6, 0.6, 0.6), glowMat(0xffd88a));
  lamp.position.set(2.6, 6.2, 0);
  g.add(lamp);
  return { group: g, update: null };
}

export function whale() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh([
    part(G.ico(1, 1), (c) => (c.y < -0.1 ? 0xd9d2c4 : 0x46566e), [0, 0, 0], [0, 0, 0], [3.2, 2.6, 11]),
    part(G.box(5, 0.4, 2.2), 0x46566e, [2.6, -0.2, -11.5], [0, 0.3, 0]),
    part(G.box(5, 0.4, 2.2), 0x46566e, [-2.6, -0.2, -11.5], [0, -0.3, 0]),
    part(G.box(3.5, 0.3, 1.6), 0x46566e, [3.6, -0.9, 2], [0, 0.3, -0.4]),
    part(G.box(3.5, 0.3, 1.6), 0x46566e, [-3.6, -0.9, 2], [0, -0.3, 0.4]),
  ]));
  g.add(body);
  const spout = new THREE.Mesh(G.cone(2.2, 9, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }));
  spout.position.set(0, 6, 5);
  g.add(spout);
  return {
    group: g,
    update: (t) => {
      // 30秒ごとに、ゆっくり浮かんでは沈む
      const cyc = (t % 30) / 30;
      const a = t * 0.05;
      g.rotation.y = a;
      g.position.x = Math.sin(a) * 60;
      g.position.z = Math.cos(a) * 60;
      const up = Math.sin(Math.min(cyc / 0.4, 1) * PI);
      body.position.y = -9 + up * 9.5;
      body.rotation.x = Math.cos(Math.min(cyc / 0.4, 1) * PI) * 0.18;
      spout.material.opacity = cyc > 0.12 && cyc < 0.24 ? Math.sin(((cyc - 0.12) / 0.12) * PI) * 0.7 : 0;
      spout.scale.y = 0.6 + (cyc - 0.12) * 4;
    },
  };
}

export function sailboat(color = COL.red) {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(2.6, 1.2, 8), COL.white, [0, 0.4, 0]),
    part(G.cone(1.3, 2, 4), COL.white, [0, 0.4, 4.9], [PI / 2, PI / 4, 0], [1, 1, 0.9]),
    part(G.box(2.7, 0.3, 8.1), color, [0, -0.1, 0]),
    part(G.cyl(0.12, 0.15, 11, 5), COL.wood, [0, 6.3, 0.8]),
    part(G.cone(3.2, 9.5, 3), COL.cream, [0, 6.2, -1.0], [0, 0, 0], [0.08, 1, 1]),
    part(G.cone(2.0, 7, 3), color, [0, 5.2, 2.6], [0, 0, 0], [0.08, 1, 1]),
  ]));
  return { group: g, update: null };
}

// 滝:流れる縞もようの幕 + 白い泡
export function waterfall(width, height) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
    vertexShader: `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float t; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(float x){ return fract(sin(x*91.7)*4375.5); }
      void main(){
        float col = floor(vUv.x*26.0);
        float sp = 0.8 + h(col)*0.5;
        float s = fract(vUv.y*5.0 + t*sp + h(col+3.0));
        float streak = smoothstep(0.0,0.25,s)*smoothstep(1.0,0.6,s);
        vec3 c = mix(vec3(0.56,0.78,0.86), vec3(0.97,0.99,1.0), streak*0.8 + (1.0-vUv.y)*0.15);
        float edge = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x);
        gl_FragColor = vec4(c, (0.72 + streak*0.25)*edge);
        #include <fog_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(width, height, 1, 1);
  geo.translate(0, height / 2, 0);
  const sheet = new THREE.Mesh(geo, mat);
  g.add(sheet);
  const foamL = [];
  const R = rng(9);
  for (let i = 0; i < 14; i++) {
    foamL.push(part(G.ico(5 + R() * 6), 0xf4f8fa, [(R() - 0.5) * width, 2 + R() * 3, 4 + R() * 14]));
  }
  const foam = mesh(foamL, undefined, false);
  g.add(foam);
  return {
    group: g,
    update: (t) => {
      mat.uniforms.t.value = -t * 0.9;
      foam.position.y = Math.sin(t * 3) * 0.6;
      foam.scale.setScalar(1 + Math.sin(t * 2.3) * 0.04);
    },
  };
}

export function rainbow(radius = 140) {
  const g = new THREE.Group();
  const cols = [0xff6b6b, 0xffb35c, 0xffe27a, 0x8fdc86, 0x7ab8f5, 0xa58cf0];
  cols.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius - i * 4, 2.2, 3, 40, PI),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(m);
  });
  return { group: g, update: null };
}

export function ropeBridge(len = 220, sag = 12) {
  const L = [];
  const n = Math.floor(len / 2.2);
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = (u - 0.5) * len;
    const y = -sag * (1 - Math.pow(2 * u - 1, 2));
    L.push(part(G.box(1.8, 0.2, 3.2), i % 3 ? COL.wood : 0x6e4630, [x, y, 0]));
    if (i % 3 === 0) {
      L.push(part(G.box(0.12, 1.6, 0.12), 0x5e3c26, [x, y + 0.8, 1.6]));
      L.push(part(G.box(0.12, 1.6, 0.12), 0x5e3c26, [x, y + 0.8, -1.6]));
    }
  }
  for (let i = 0; i < n; i += 2) {
    const u = (i + 1) / n, x = (u - 0.5) * len;
    const y = -sag * (1 - Math.pow(2 * u - 1, 2)) + 1.6;
    L.push(part(G.box(4.4, 0.1, 0.1), 0xd8c8a0, [x, y, 1.6]));
    L.push(part(G.box(4.4, 0.1, 0.1), 0xd8c8a0, [x, y, -1.6]));
  }
  for (const s of [-1, 1]) {
    L.push(part(G.box(1.2, 6, 1.2), 0x5e3c26, [s * len / 2, 2, 2]));
    L.push(part(G.box(1.2, 6, 1.2), 0x5e3c26, [s * len / 2, 2, -2]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  return { group: g, update: null };
}

export function rockTower(h = 160, r = 26, seed = 1) {
  const R = rng(seed);
  const strata = [0xc98f63, 0xb57852, 0xd9a878, 0xa86a48, 0xe0b98c];
  const L = [];
  let y = 0, rr = r;
  while (y < h) {
    const sh = 14 + R() * 18;
    L.push(part(G.cyl(rr * (0.86 + R() * 0.1), rr, sh, 6), strata[Math.floor(R() * 5)], [R() * 2, y + sh / 2, R() * 2], [0, R() * 3, 0]));
    y += sh;
    rr *= 0.93;
  }
  L.push(part(G.cone(rr * 0.8, 6, 6), 0x7a9a50, [0, y + 2, 0]));
  const g = new THREE.Group();
  g.add(mesh(L));
  return { group: g, update: null };
}

export function cabin({ wall = 0x9a6a46, roof = COL.red, lit = false, scale = 1 } = {}) {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(8, 5, 6), wall, [0, 2.5, 0]),
    part(G.prism(4, 9), roof, [0, 6.6, 0], [0, 0, 0], [1, 0.8, 1]),
    part(G.box(1.1, 3, 1.1), 0x6b6560, [2.4, 7.5, 1.2]),
    part(G.box(1.6, 2.8, 0.2), 0x5e3c26, [-1.8, 1.4, 3.05]),
  ]));
  const winMat = lit ? glowMat(0xffd27a) : new THREE.MeshLambertMaterial({ color: COL.glass, flatShading: true });
  for (const x of [1.2, -1.2]) {
    const w = new THREE.Mesh(G.box(0.2, 1.4, 1.6), winMat);
    w.position.set(x < 0 ? -4.05 : 4.05, 2.8, x < 0 ? 1.0 : -1.0);
    g.add(w);
  }
  const front = new THREE.Mesh(G.box(1.6, 1.4, 0.2), winMat);
  front.position.set(1.6, 2.8, 3.05);
  g.add(front);
  g.scale.setScalar(scale);
  return { group: g, update: null };
}

export function iceArch(r = 26) {
  const R = rng(5);
  const ice = [0xd8eef5, 0xbfe2ee, 0xe9f6fa, 0xa9d4e4];
  const g = new THREE.Group();
  g.add(mesh([
    part(G.torus(r, 7, 5, 9, PI), () => ice[Math.floor(R() * 4)], [0, -4, 0], [0, 0, 0], [1, 1.25, 1]),
    part(G.dod(8), ice[0], [r, -2, 0]), part(G.dod(9), ice[1], [-r, -2, 0]),
  ]));
  return { group: g, update: null };
}

export function windmill(seed = 1) {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.cyl(2.4, 3.8, 14, 8), COL.cream, [0, 7, 0]),
    part(G.cone(3.2, 4, 8), COL.red, [0, 16, 0]),
    part(G.box(1.2, 2, 0.3), 0x5e3c26, [0, 1, 3.6]),
    part(G.box(0.9, 0.9, 0.3), COL.glass, [0, 8, 3.0]),
  ]));
  const hub = new THREE.Group();
  hub.position.set(0, 13.5, 3.4);
  const blades = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2;
    blades.push(part(G.box(1.8, 9.5, 0.15), i % 2 ? COL.cream : 0xe8dcc0, [Math.sin(a) * 5, Math.cos(a) * 5, 0], [0, 0, -a]));
    blades.push(part(G.box(0.25, 10, 0.25), COL.wood, [Math.sin(a) * 5, Math.cos(a) * 5, 0.15], [0, 0, -a]));
  }
  blades.push(part(G.cyl(0.6, 0.6, 1, 8), COL.dark, [0, 0, 0], [PI / 2, 0, 0]));
  hub.add(mesh(blades));
  g.add(hub);
  const sp = 0.5 + (seed % 5) * 0.08;
  return { group: g, update: (t) => { hub.rotation.z = t * sp + seed; } };
}

export function house(wall, roof, seed = 0) {
  const R = rng(seed + 7);
  const w = 6 + R() * 3, d = 5 + R() * 2, h = 4 + R() * 2;
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(w, h, d), wall, [0, h / 2, 0]),
    part(G.prism(d * 0.62, w + 0.8), roof, [0, h + d * 0.62 * 0.4, 0], [0, 0, 0], [1, 0.8, 1]),
    part(G.box(1, 1.2, 0.15), COL.glass, [w * 0.2, h * 0.55, d / 2 + 0.05]),
    part(G.box(1.2, 2, 0.15), 0x5e3c26, [-w * 0.2, 1, d / 2 + 0.05]),
  ]));
  return { group: g, update: null };
}

export function stoneBridge(span = 70) {
  const g = new THREE.Group();
  const R = rng(4);
  const st = [0xb7ab98, 0xa79b88, 0xc4b9a6];
  g.add(mesh([
    part(G.torus(span / 2, 3.5, 4, 12, PI), () => st[Math.floor(R() * 3)], [0, -2, 0], [0, 0, 0], [1, 0.45, 2.2]),
    part(G.box(span + 10, 1.2, 8), 0xb0a490, [0, span * 0.45 / 2 * 0.95 - 0.8, 0]),
    part(G.box(span + 10, 1.2, 0.6), 0x9a8e7c, [0, span * 0.225 * 0.95 + 0.4, 3.8]),
    part(G.box(span + 10, 1.2, 0.6), 0x9a8e7c, [0, span * 0.225 * 0.95 + 0.4, -3.8]),
  ]));
  return { group: g, update: null };
}

export function bigTree() {
  const g = new THREE.Group();
  const R = rng(11);
  const L = [
    part(G.cyl(1.4, 2.6, 16, 7), 0x7a5a42, [0, 8, 0]),
    part(G.cyl(0.6, 1.0, 9, 6), 0x7a5a42, [4, 15, 0], [0, 0, -0.8]),
    part(G.cyl(0.6, 1.0, 9, 6), 0x7a5a42, [-3.5, 16, 1], [0.3, 0, 0.8]),
  ];
  for (let i = 0; i < 9; i++) {
    const a = R() * PI * 2, rr = 4 + R() * 7;
    L.push(part(G.ico(6 + R() * 4), R() > 0.5 ? 0x7aa64f : 0x8bb85d, [Math.cos(a) * rr, 20 + R() * 8, Math.sin(a) * rr]));
  }
  g.add(mesh(L));
  return { group: g, update: null };
}

export function observatory() {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.cyl(5, 5.5, 6, 10), COL.cream, [0, 3, 0]),
    part(new THREE.SphereGeometry(5.2, 10, 5, 0, PI * 2, 0, PI / 2), 0xb9c2c8, [0, 6, 0]),
    part(G.box(1.4, 3, 6), COL.navy, [0, 9.5, 1.8], [0.5, 0, 0]),
    part(G.box(1.6, 2.6, 0.2), 0x5e3c26, [0, 1.3, 5.4]),
  ]));
  return { group: g, update: null };
}

export function lantern(color = 0xffd27a) {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(1.6, 0.5, 1.6), 0x8a8478, [0, 0.25, 0]),
    part(G.cyl(0.3, 0.4, 2.5, 6), 0x8a8478, [0, 1.7, 0]),
    part(G.cone(1.5, 1.0, 4), 0x6d675e, [0, 4.4, 0], [0, PI / 4, 0]),
  ]));
  const l = new THREE.Mesh(G.box(1.2, 1.1, 1.2), glowMat(color));
  l.position.y = 3.4;
  g.add(l);
  return { group: g, update: null };
}

export function pier(len = 30) {
  const L = [part(G.box(3, 0.4, len), COL.wood, [0, 1.2, len / 2])];
  for (let z = 2; z < len; z += 6) {
    L.push(part(G.box(0.4, 4, 0.4), 0x5e3c26, [1.4, -0.6, z]));
    L.push(part(G.box(0.4, 4, 0.4), 0x5e3c26, [-1.4, -0.6, z]));
  }
  const g = new THREE.Group();
  g.add(mesh(L));
  return { group: g, update: null };
}

export function miniBalloon(c1, c2) {
  const gore = (c) => (Math.floor(((Math.atan2(c.z, c.x) + PI) / (PI * 2)) * 10) % 2 ? c1 : c2);
  const g = new THREE.Group();
  g.add(mesh([
    part(G.sph(6, 10, 8), gore, [0, 12, 0], [0, 0, 0], [1, 1.15, 1]),
    part(G.cyl(3.6, 1.3, 2.6, 10), gore, [0, 5.6, 0]),
    part(G.box(1.6, 1.1, 1.6), COL.wood, [0, 0.5, 0]),
  ], undefined, false));
  return { group: g, update: null };
}

export function trussBridge(len = 160) {
  const L = [part(G.box(len, 1.4, 7), 0x5b4a44, [0, 0, 0])];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = (i / n - 0.5) * len;
    for (const z of [-3.4, 3.4]) {
      L.push(part(G.box(0.6, 9, 0.6), 0x6e3b32, [x, 4.5, z]));
    }
  }
  for (const z of [-3.4, 3.4]) L.push(part(G.box(len, 0.6, 0.6), 0x6e3b32, [0, 9, z]));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * len;
    const ang = Math.atan2(9, len / n) * (i % 2 ? 1 : -1);
    for (const z of [-3.4, 3.4]) L.push(part(G.box(Math.hypot(len / n, 9), 0.4, 0.4), 0x6e3b32, [x, 4.5, z], [0, 0, ang]));
  }
  for (let i = -2; i <= 2; i += 4) L.push(part(G.cyl(2, 2.6, 30, 6), 0x8a8478, [(i / 4) * len * 0.5, -15, 0]));
  const g = new THREE.Group();
  g.add(mesh(L));
  return { group: g, update: null };
}

// ================= 地上ののりもの =================
// 原点は地面。前は +z

function wheel(r, w, x, y, z) {
  const m = mesh([
    part(G.cyl(r, r, w, 10), COL.dark, [0, 0, 0], [0, 0, PI / 2]),
    part(G.cyl(r * 0.5, r * 0.5, w + 0.02, 8), COL.grey, [0, 0, 0], [0, 0, PI / 2]),
    part(G.box(w + 0.04, r * 1.6, r * 0.18), 0x5a5a5a, [0, 0, 0]),
  ]);
  m.position.set(x, y, z);
  return m;
}

export function buildCar(color = 0x8fcfc0, npc = false) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh([
    part(G.box(1.62, 0.6, 3.3), color, [0, 0.62, 0]),
    part(G.box(1.5, 0.3, 0.5), color, [0, 0.72, 1.75], [0.35, 0, 0]),
    part(G.box(1.5, 0.3, 0.4), color, [0, 0.72, -1.72], [-0.3, 0, 0]),
    part(G.box(1.36, 0.08, 1.7), COL.cream, [0, 1.45, -0.25]),
    part(G.box(1.32, 0.42, 1.62), COL.glass, [0, 1.13, -0.25]),
    part(G.box(1.66, 0.16, 0.14), COL.grey, [0, 0.4, 1.68]),
    part(G.box(1.66, 0.16, 0.14), COL.grey, [0, 0.4, -1.68]),
    part(G.box(1.64, 0.06, 3.32), COL.cream, [0, 0.78, 0]),
    part(G.cyl(0.15, 0.15, 0.06, 8), 0xfff4c8, [0.5, 0.75, 1.66], [PI / 2, 0, 0]),
    part(G.cyl(0.15, 0.15, 0.06, 8), 0xfff4c8, [-0.5, 0.75, 1.66], [PI / 2, 0, 0]),
    part(G.box(0.3, 0.12, 0.04), COL.red, [0.55, 0.72, -1.7]),
    part(G.box(0.3, 0.12, 0.04), COL.red, [-0.55, 0.72, -1.7]),
  ], undefined, !npc));
  g.add(body);
  const wheels = [];
  for (const [x, z] of [[0.78, 1.1], [-0.78, 1.1], [0.78, -1.1], [-0.78, -1.1]]) {
    const w = wheel(0.33, 0.22, x, 0.33, z);
    g.add(w);
    wheels.push(w);
  }
  return { root: g, props: [], wheels, body, wheelR: 0.33 };
}

export function buildScooter() {
  const g = new THREE.Group();
  const lean = new THREE.Group();
  g.add(lean);
  lean.add(mesh([
    part(G.box(0.24, 0.24, 1.0), COL.red, [0, 0.45, -0.05]),
    part(G.box(0.08, 0.75, 0.08), COL.grey, [0, 0.62, 0.55], [-0.3, 0, 0]),
    part(G.box(0.55, 0.7, 0.1), COL.cream, [0, 0.68, 0.36], [-0.15, 0, 0]),
    part(G.box(0.5, 0.16, 0.5), COL.red, [0, 0.3, 0.62], [0, 0, 0]),
    part(G.box(0.34, 0.12, 0.68), 0x4a3426, [0, 0.84, -0.28]),
    part(G.box(0.42, 0.06, 0.36), COL.grey, [0, 0.88, -0.75]),
    part(G.box(0.72, 0.06, 0.06), COL.grey, [0, 1.08, 0.5]),
    part(G.cyl(0.1, 0.1, 0.08, 8), 0xfff4c8, [0, 1.0, 0.62], [PI / 2, 0, 0]),
    part(G.box(0.3, 0.3, 0.45), COL.grey, [0.1, 0.32, -0.25]),
    // 乗っている人
    part(G.box(0.34, 0.2, 0.55), 0x3d4b6e, [0, 0.95, -0.12]),
    part(G.box(0.12, 0.5, 0.12), 0x3d4b6e, [0.17, 0.62, 0.1], [0.4, 0, 0]),
    part(G.box(0.12, 0.5, 0.12), 0x3d4b6e, [-0.17, 0.62, 0.1], [0.4, 0, 0]),
    part(G.box(0.4, 0.55, 0.26), 0xe3b54d, [0, 1.3, -0.2], [0.25, 0, 0]),
    part(G.box(0.1, 0.45, 0.1), 0xe3b54d, [0.24, 1.25, 0.12], [-1.0, 0, 0]),
    part(G.box(0.1, 0.45, 0.1), 0xe3b54d, [-0.24, 1.25, 0.12], [-1.0, 0, 0]),
    part(G.sph(0.17, 8, 6), 0xf0c8a8, [0, 1.66, -0.12]),
    part(G.sph(0.21, 8, 6), COL.red, [0, 1.72, -0.15], [0, 0, 0], [1, 0.9, 1.05]),
    part(G.box(0.3, 0.08, 0.06), COL.glass, [0, 1.68, 0.06]),
  ]));
  const wheels = [wheel(0.28, 0.1, 0, 0.28, 0.62), wheel(0.28, 0.12, 0, 0.28, -0.6)];
  wheels.forEach((w) => lean.add(w));
  return { root: g, props: [], wheels, lean, wheelR: 0.28 };
}

// ================= 街の小物 =================
export function ferrisWheel() {
  const g = new THREE.Group();
  const H = 26, R = 21;
  const L = [];
  for (const z of [-2.2, 2.2]) {
    L.push(part(G.box(0.8, H + 4, 0.8), COL.cream, [-7, H / 2 - 1, z], [0, 0, -0.27]));
    L.push(part(G.box(0.8, H + 4, 0.8), COL.cream, [7, H / 2 - 1, z], [0, 0, 0.27]));
  }
  L.push(part(G.box(18, 1.2, 7), 0x9a8e7c, [0, 0.6, 0]));
  L.push(part(G.box(4, 3, 3), COL.red, [9, 1.5, 4]));
  g.add(mesh(L));
  const wheelG = new THREE.Group();
  wheelG.position.set(0, H, 0);
  const W = [];
  for (const z of [-1.6, 1.6]) W.push(part(G.torus(R, 0.35, 4, 32), COL.cream, [0, 0, z]));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2;
    W.push(part(G.box(0.2, R, 0.2), 0xe8dcc0, [Math.cos(a) * R / 2, Math.sin(a) * R / 2, 1.6], [0, 0, a - PI / 2]));
    W.push(part(G.box(0.2, R, 0.2), 0xe8dcc0, [Math.cos(a) * R / 2, Math.sin(a) * R / 2, -1.6], [0, 0, a - PI / 2]));
  }
  W.push(part(G.cyl(1, 1, 4, 8), COL.red, [0, 0, 0], [PI / 2, 0, 0]));
  wheelG.add(mesh(W));
  const cars = [];
  const cc = [COL.red, COL.yellow, COL.teal, 0xeaa0b6, COL.sky, 0xb7a0dc];
  for (let i = 0; i < 12; i++) {
    const cg = mesh([
      part(G.box(2.2, 2.0, 2.4), cc[i % cc.length], [0, -1.6, 0]),
      part(G.box(2.3, 0.3, 2.5), COL.cream, [0, -0.5, 0]),
      part(G.box(2.24, 0.8, 2.0), COL.glass, [0, -1.3, 0]),
      part(G.box(0.15, 0.8, 0.15), COL.grey, [0, 0, 0]),
    ]);
    wheelG.add(cg);
    cars.push(cg);
  }
  g.add(wheelG);
  return {
    group: g,
    update: (t) => {
      wheelG.rotation.z = t * 0.06;
      cars.forEach((c, i) => {
        const a = (i / 12) * PI * 2 + t * 0.06;
        c.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        c.rotation.z = -t * 0.06;
      });
    },
  };
}

export function clockTower() {
  const g = new THREE.Group();
  const brick = (c) => (Math.floor(c.y / 2) % 2 ? 0xb8735a : 0xa9664f);
  g.add(mesh([
    part(G.box(9, 2, 9), 0x9a8e7c, [0, 1, 0]),
    part(G.box(7, 26, 7), brick, [0, 15, 0]),
    part(G.box(8, 7, 8), COL.cream, [0, 31.5, 0]),
    part(G.cyl(0.1, 6.6, 8, 4), 0x5f8f7a, [0, 39, 0], [0, PI / 4, 0]),
    part(G.box(8.6, 0.6, 8.6), COL.cream, [0, 28, 0]),
    part(G.box(2, 3.4, 0.2), COL.glass, [0, 4, 3.55]),
  ]));
  const hands = [];
  for (let k = 0; k < 4; k++) {
    const face = new THREE.Group();
    face.rotation.y = (k * PI) / 2;
    const f = mesh([part(G.cyl(2.8, 2.8, 0.2, 16), 0xfbf6e4, [0, 0, 0], [PI / 2, 0, 0])], undefined, false);
    face.add(f);
    const hh = new THREE.Mesh(G.box(0.3, 1.6, 0.1), new THREE.MeshBasicMaterial({ color: 0x2f2a28 }));
    const mm = new THREE.Mesh(G.box(0.2, 2.4, 0.1), new THREE.MeshBasicMaterial({ color: 0x2f2a28 }));
    hh.geometry.translate(0, 0.8, 0);
    mm.geometry.translate(0, 1.2, 0);
    hh.position.z = mm.position.z = 0.16;
    face.add(hh, mm);
    const holder = new THREE.Group();
    holder.position.y = 31.5;
    holder.add(face);
    face.position.z = 4.05;
    holder.rotation.y = (k * PI) / 2;
    face.rotation.y = 0;
    g.add(holder);
    hands.push([hh, mm]);
  }
  return {
    group: g,
    update: () => {
      // ほんとうの時刻をさす
      const d = new Date();
      const m = d.getMinutes() + d.getSeconds() / 60;
      const h = (d.getHours() % 12) + m / 60;
      for (const [hh, mm] of hands) {
        hh.rotation.z = -(h / 12) * PI * 2;
        mm.rotation.z = -(m / 60) * PI * 2;
      }
    },
  };
}

export function church() {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.box(10, 8, 18), COL.white, [0, 4, 0]),
    part(G.prism(6.4, 18.6), 0x5a6a8a, [0, 8 + 2.56, 0], [0, PI / 2, 0], [1, 0.8, 1]),
    part(G.box(4.6, 16, 4.6), COL.white, [0, 8, 10.5]),
    part(G.cone(3.2, 9, 4), 0x5a6a8a, [0, 20.5, 10.5], [0, PI / 4, 0]),
    part(G.box(0.3, 3, 0.3), COL.yellow, [0, 26.2, 10.5]),
    part(G.box(1.6, 0.3, 0.3), COL.yellow, [0, 26.8, 10.5]),
    part(G.box(2, 3.6, 0.2), 0x5e3c26, [0, 1.8, 12.85]),
    part(G.cyl(1.2, 1.2, 0.2, 12), 0x8fbfd6, [0, 11.5, 12.85], [PI / 2, 0, 0]),
  ]));
  return { group: g, update: null };
}

export function warehouse(len = 40, seed = 1) {
  const R = rng(seed);
  const brick = [0xb5664c, 0xa85d45, 0xbf6f52];
  const g = new THREE.Group();
  const L = [
    part(G.box(14, 9, len), () => brick[Math.floor(R() * 3)], [0, 4.5, 0]),
    part(G.prism(8.6, len + 0.6), 0x7a7a80, [0, 9 + 3.44, 0], [0, PI / 2, 0], [1, 0.8, 1]),
  ];
  for (let z = -len / 2 + 5; z < len / 2; z += 7) {
    L.push(part(G.box(0.2, 4, 3.2), 0x3a3230, [7.02, 2, z]));
    L.push(part(G.box(0.2, 1.4, 1.6), COL.glass, [7.02, 6.8, z]));
  }
  g.add(mesh(L));
  return { group: g, update: null };
}

export function harborCrane() {
  const g = new THREE.Group();
  const stripe = (c) => (Math.floor(c.y / 3) % 2 ? COL.red : COL.white);
  g.add(mesh([
    part(G.box(1, 20, 1), stripe, [-3, 10, -3]), part(G.box(1, 20, 1), stripe, [3, 10, -3]),
    part(G.box(1, 20, 1), stripe, [-3, 10, 3]), part(G.box(1, 20, 1), stripe, [3, 10, 3]),
    part(G.box(8, 4, 8), COL.cream, [0, 22, 0]),
    part(G.box(1.4, 1.4, 34), COL.red, [0, 24, 12], [0.15, 0, 0]),
    part(G.box(0.15, 14, 0.15), COL.dark, [0, 19, 27]),
    part(G.box(2.4, 1.2, 2.4), COL.yellow, [0, 11.5, 27]),
  ]));
  return { group: g, update: null };
}

export function lampPost() {
  const g = new THREE.Group();
  g.add(mesh([
    part(G.cyl(0.12, 0.16, 5, 6), COL.navy, [0, 2.5, 0]),
    part(G.box(0.5, 0.6, 0.5), COL.navy, [0, 5.2, 0]),
  ], undefined, false));
  const l = new THREE.Mesh(G.box(0.36, 0.36, 0.36), glowMat(0xffe6a8));
  l.position.y = 5.1;
  g.add(l);
  return { group: g, update: null };
}
