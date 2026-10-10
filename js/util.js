// こまかい道具:数学、乱数、ノイズ(地形の起伏を作るなめらかな乱数)、ローポリ部品づくり
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// フレームの長さに左右されない「なめらかに近づく」係数
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// 種(seed)から毎回同じ並びになる乱数
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// バリューノイズ:-1〜1 のなめらかな起伏
export function makeNoise(seed) {
  const r = rng(seed);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const P = new Uint16Array(512);
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const V = new Float32Array(256);
  for (let i = 0; i < 256; i++) V[i] = r() * 2 - 1;

  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]];
    const c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 5) {
    let s = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * n2(x * f + i * 31.7, y * f - i * 12.9);
      n += amp; amp *= 0.5; f *= 2.03;
    }
    return s / n;
  }
  // 尾根のような、するどい山並み(0〜1)
  function ridged(x, y, oct = 5) {
    let s = 0, amp = 0.5, f = 1, n = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let v = 1 - Math.abs(n2(x * f + i * 17.3, y * f - i * 9.1));
      v *= v; v *= w;
      w = clamp(v * 1.6, 0, 1);
      s += v * amp; n += amp; amp *= 0.5; f *= 2.1;
    }
    return s / n;
  }
  return { n2, fbm, ridged };
}

// ---- ローポリ部品 ----
// 形(geometry)に色と位置・回転・大きさを焼きこんで、角ばった面の部品にする
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function part(geom, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  let g = geom.index ? geom.toNonIndexed() : geom;
  geom !== g && geom.dispose();
  const sc = Array.isArray(scl) ? scl : [scl, scl, scl];
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(sc[0], sc[1], sc[2]));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  if (typeof color === 'function') {
    // 面ごとに色を決める(color(面の中心, 面の番号) → 色)
    const pa = g.attributes.position.array;
    const cen = new THREE.Vector3();
    for (let f = 0; f < n / 3; f++) {
      const i = f * 9;
      cen.set((pa[i] + pa[i + 3] + pa[i + 6]) / 3, (pa[i + 1] + pa[i + 4] + pa[i + 7]) / 3, (pa[i + 2] + pa[i + 5] + pa[i + 8]) / 3);
      _c.set(color(cen, f));
      for (let k = 0; k < 3; k++) col.set([_c.r, _c.g, _c.b], (f * 3 + k) * 3);
    }
  } else {
    _c.set(color);
    for (let i = 0; i < n; i++) col.set([_c.r, _c.g, _c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

// 部品をひとつの形にまとめる(描く回数が減って軽くなる)
export function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// ローポリ用の共通の材質(頂点の色を使い、面を角ばらせる)
export const lowpolyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function mesh(list, mat = lowpolyMat, shadow = true) {
  const m = new THREE.Mesh(merge(list), mat);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

// よく使う形の短い書き方
export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s),
  cone: (r, h, s = 7) => new THREE.ConeGeometry(r, h, s),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  sph: (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h),
  oct: (r) => new THREE.OctahedronGeometry(r, 0),
  dod: (r) => new THREE.DodecahedronGeometry(r, 0),
  torus: (r, t, rs, ts, arc) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  // 三角の屋根(長さ方向が x、とがった所が上)
  prism: (r, len) => new THREE.CylinderGeometry(r, r, len, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2),
};

export function hexToCss(c) {
  return '#' + new THREE.Color(c).getHexString();
}
