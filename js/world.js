// 世界づくり:コースの設定から、地形・水・空・雲・木・ひかりの粒・小物を組み立てる
import * as THREE from 'three';
import { makeNoise, rng, smooth, lerp, clamp, part, mesh, merge, lowpolyMat, G } from './util.js';
import { treeGeometry, sailboat, miniBalloon } from './models.js';
import { buildRunway } from './runway.js';

export const SIZE = 4800;
export const SEG = 192;
export const HALF = SIZE / 2;
export const CELL = SIZE / SEG;
export const LIMIT = 2050; // ここより外へ出ると、やさしく引きもどす

const _col = new THREE.Color();

// ふんわり丸い点(粒や雪に使う)
let _softTex = null;
function softTexture() {
  if (_softTex) return _softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _softTex = new THREE.CanvasTexture(c);
  return _softTex;
}
let _petalTex = null;
function petalTexture() {
  if (_petalTex) return _petalTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(32, 32, 26, 14, 0.6, 0, Math.PI * 2);
  g.fill();
  _petalTex = new THREE.CanvasTexture(c);
  return _petalTex;
}

// 地形の高さ表だけを作る(画面がなくても使える:メニューの絵やテストで使う)
export function makeHeightField(course) {
  const N = makeNoise(course.seed);
  const base = course.height(N);
  let hf = base;
  if (course.flats) {
    const fl = course.flats.map(([x, z, r]) => [x, z, r, base(x, z)]);
    hf = (x, z) => {
      let h = base(x, z);
      for (const [cx, cz, r, hc] of fl) h = lerp(h, hc, 1 - smooth(r * 0.55, r, Math.hypot(x - cx, z - cz)));
      return h;
    };
  }
  // 滑走路のところは平らにする(高さは、まわりの地面の平均)
  if (course.strip) {
    const st = course.strip;
    const dx = Math.sin(st.ang), dz = Math.cos(st.ang);
    const hl = st.len / 2 + 25, hw = 40;
    let sum = 0, n = 0;
    for (let u = -st.len / 2; u <= st.len / 2; u += st.len / 10) {
      for (const v of [-20, 0, 20]) { sum += hf(st.x + dx * u - dz * v, st.z + dz * u + dx * v); n++; }
    }
    const target = Math.max(6, sum / n);
    st.y = target;
    const inner = hf;
    hf = (x, z) => {
      const h = inner(x, z);
      const rx = x - st.x, rz = z - st.z;
      const u = Math.abs(rx * dx + rz * dz), v = Math.abs(-rx * dz + rz * dx);
      const d = Math.hypot(Math.max(0, u - hl), Math.max(0, v - hw));
      return lerp(h, target, 1 - smooth(0, 90, d));
    };
  }
  const W = SEG + 1;
  const H = new Float32Array(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) H[j * W + i] = hf(-HALF + i * CELL, -HALF + j * CELL);
  }
  // 地形の三角形とぴったり同じ高さを返す
  function heightAt(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, SEG - 0.0001);
    const gz = clamp((z + HALF) / CELL, 0, SEG - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h00 = H[j * W + i], h10 = H[j * W + i + 1], h01 = H[(j + 1) * W + i], h11 = H[(j + 1) * W + i + 1];
    if (fx >= fz) return h00 + (h10 - h00) * fx + (h11 - h10) * fz;
    return h00 + (h01 - h00) * fz + (h11 - h01) * fx;
  }
  function normalYAt(x, z) {
    const e = CELL;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return 2 * e / Math.hypot(dx, 2 * e, dz);
  }
  return { N, H, W, heightAt, normalYAt, hf };
}

// 横から見た山なみの形(コースのカードの絵に使う)
export function silhouette(course, field) {
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = -1800 + (i / 60) * 3600;
    let m = -999;
    for (let k = 0; k < 8; k++) m = Math.max(m, field.heightAt(x, -1600 + k * 450));
    pts.push(Math.max(m, 0));
  }
  return pts;
}

export function buildWorld(course, quality = 1) {
  const group = new THREE.Group();
  const R = rng(course.seed * 97 + 5);
  const field = makeHeightField(course);
  const { N, H, W, heightAt, normalYAt } = field;
  const sky = course.sky;
  const updaters = [];
  const exclusions = [];
  const gates = [];
  const flowerFn = course.isFlower ? (x, z, h, ny) => course.isFlower(x, z, h, ny, N) : () => false;

  // ---------- 地形 ----------
  {
    const tris = SEG * SEG * 2;
    const pos = new Float32Array(tris * 9), nor = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    let o = 0;
    const put = (i0, j0, i1, j1, i2, j2) => {
      a.set(-HALF + i0 * CELL, H[j0 * W + i0], -HALF + j0 * CELL);
      b.set(-HALF + i1 * CELL, H[j1 * W + i1], -HALF + j1 * CELL);
      c.set(-HALF + i2 * CELL, H[j2 * W + i2], -HALF + j2 * CELL);
      n.crossVectors(t1.subVectors(b, a), t2.subVectors(c, a)).normalize();
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
      _col.set(course.color(cy, n.y, cx, cz, N));
      const j = 1 + (R() - 0.5) * 0.07;
      _col.r *= j; _col.g *= j; _col.b *= j;
      for (const v of [a, b, c]) {
        pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        nor[o] = n.x; nor[o + 1] = n.y; nor[o + 2] = n.z;
        col[o] = _col.r; col[o + 1] = _col.g; col[o + 2] = _col.b;
        o += 3;
      }
    };
    for (let j = 0; j < SEG; j++) {
      for (let i = 0; i < SEG; i++) {
        put(i, j, i + 1, j + 1, i + 1, j);
        put(i, j, i, j + 1, i + 1, j + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    const terrain = new THREE.Mesh(g, lowpolyMat);
    terrain.receiveShadow = true;
    terrain.castShadow = quality > 1;
    group.add(terrain);
  }

  // ---------- 水 ----------
  const waterMat = new THREE.MeshPhongMaterial({
    color: sky.water, specular: sky.waterSpec, shininess: 70, flatShading: true,
    transparent: true, opacity: 0.86,
  });
  const WSEG = 64, WSIZE = 7000, WCELL = WSIZE / WSEG;
  const waterGeo = new THREE.PlaneGeometry(WSIZE, WSIZE, WSEG, WSEG);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  group.add(water);
  const wpos = waterGeo.attributes.position;
  const wbase = Float32Array.from(wpos.array);
  const wave = (x, z, t) => Math.sin(x * 0.021 + t * 0.9) * 0.9 + Math.sin(z * 0.017 - t * 0.7) * 0.8 + Math.sin((x + z) * 0.034 + t * 1.3) * 0.4;
  updaters.push((t, dt, cam) => {
    water.position.x = Math.round(cam.position.x / WCELL) * WCELL;
    water.position.z = Math.round(cam.position.z / WCELL) * WCELL;
    const arr = wpos.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] = wave(wbase[i] + water.position.x, wbase[i + 2] + water.position.z, t);
    }
    wpos.needsUpdate = true;
  });

  // 台地の上の川(大瀑布の渓谷)
  if (course.river) {
    const rv = course.river;
    const pts = [];
    for (let x = rv.fromX; x <= rv.toX; x += 25) pts.push(x);
    if (pts[pts.length - 1] !== rv.toX) pts.push(rv.toX);
    const posA = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const x0 = pts[k], x1 = pts[k + 1];
      const z0 = rv.fn(x0), z1 = rv.fn(x1);
      const w = rv.width / 2;
      const q = [[x0, z0 - w], [x0, z0 + w], [x1, z1 - w], [x1, z1 + w]];
      posA.push(...q[0], ...q[1], ...q[2], ...q[2], ...q[1], ...q[3]);
    }
    const arr = new Float32Array(posA.length / 2 * 3);
    for (let i = 0, o = 0; i < posA.length; i += 2, o += 3) {
      arr[o] = posA[i];
      arr[o + 1] = rv.y + Math.sin(posA[i] * 0.05 + posA[i + 1] * 0.08) * 0.6;
      arr[o + 2] = posA[i + 1];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    const river = new THREE.Mesh(g, waterMat);
    river.material.side = THREE.DoubleSide;
    group.add(river);
  }

  // 水の上かどうか / 地面または水面の高さ
  const riverAt = (x, z) => {
    const rv = course.river;
    if (!rv || x < rv.fromX || x > rv.toX) return null;
    return Math.abs(z - rv.fn(x)) < rv.width / 2 ? rv.y : null;
  };
  const surfaceAt = (x, z) => {
    const h = heightAt(x, z);
    const r = riverAt(x, z);
    if (r !== null && h < r) return { y: r, water: true };
    if (h < 0) return { y: 0, water: true };
    return { y: h, water: false };
  };

  // ---------- 空 ----------
  const sunDir = new THREE.Vector3(...sky.sunDir).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) }, horizon: { value: new THREE.Color(sky.horizon) },
      bottom: { value: new THREE.Color(sky.bottom) }, sunColor: { value: new THREE.Color(sky.sun) },
      sunDir: { value: sunDir }, sunSize: { value: sky.sunSize },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunColor, sunDir; uniform float sunSize; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 1.0, y), 0.55)) : mix(horizon, bottom, smoothstep(0.0, -0.25, y));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (smoothstep(0.9993 - 0.0006 * sunSize, 0.9996 - 0.0004 * sunSize, s) * 1.2 + pow(s, 12.0) * 0.28 * sunSize + pow(s, 3.0) * 0.06);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -10;
  group.add(skyMesh);
  updaters.push((t, dt, cam) => skyMesh.position.copy(cam.position));

  if (course.night) {
    const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * Math.PI * 2, v = Math.acos(1 - R() * 0.95);
      p.set([Math.sin(v) * Math.cos(u) * 7000, Math.cos(v) * 7000, Math.sin(v) * Math.sin(u) * 7000], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff6e0, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, map: softTexture(), depthWrite: false }));
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    group.add(stars);
    updaters.push((t, dt, cam) => stars.position.copy(cam.position));
  }

  // ---------- 光 ----------
  const hemi = new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiI);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(sky.sun, sky.sunI);
  sun.castShadow = quality > 0;
  sun.shadow.mapSize.set(quality > 1 ? 2048 : 1024, quality > 1 ? 2048 : 1024);
  const sc = sun.shadow.camera;
  sc.left = -200; sc.right = 200; sc.top = 200; sc.bottom = -200; sc.near = 10; sc.far = 1600;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  group.add(sun, sun.target);
  const fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);

  // ---------- 雲 ----------
  const cloudMat = new THREE.MeshLambertMaterial({ color: sky.cloud, emissive: sky.cloudTint, emissiveIntensity: 0.6, flatShading: true, transparent: true, opacity: 0.96 });
  const clouds = [];
  for (let i = 0; i < sky.clouds; i++) {
    const L = [];
    const n = 4 + Math.floor(R() * 5);
    const sz = 22 + R() * 30;
    for (let k = 0; k < n; k++) {
      const s = sz * (0.6 + R() * 0.6);
      L.push(part(G.ico(s, 1), 0xffffff, [(k - n / 2) * sz * 0.7 + R() * 10, R() * sz * 0.4, (R() - 0.5) * sz], [R(), R(), R()], [1, 0.75, 1]));
    }
    const m = new THREE.Mesh(merge(L), cloudMat);
    m.position.set((R() - 0.5) * 4400, lerp(sky.cloudY[0], sky.cloudY[1], R()), (R() - 0.5) * 4400);
    m.rotation.y = R() * 6;
    m.userData.r = sz * n * 0.4;
    m.castShadow = quality > 1;
    group.add(m);
    clouds.push(m);
  }
  const windDir = new THREE.Vector2(Math.sin(course.windBase), Math.cos(course.windBase));
  updaters.push((t, dt) => {
    for (const c of clouds) {
      c.position.x += windDir.x * 3 * dt;
      c.position.z += windDir.y * 3 * dt;
      if (c.position.x > 2400) c.position.x -= 4800;
      if (c.position.x < -2400) c.position.x += 4800;
      if (c.position.z > 2400) c.position.z -= 4800;
      if (c.position.z < -2400) c.position.z += 4800;
    }
  });
  function cloudDensity(p) {
    let d = 0;
    for (const c of clouds) {
      const r = c.userData.r;
      const dx = p.x - c.position.x, dy = (p.y - c.position.y) * 1.6, dz = p.z - c.position.z;
      const q = (dx * dx + dy * dy + dz * dz) / (r * r);
      if (q < 1) d = Math.max(d, 1 - q);
    }
    return d;
  }

  // ---------- 小物を置く道具 ----------
  const colliders = [];
  const roads = [];
  const decks = [];
  const ctx = {
    R, N, heightAt, surfaceAt,
    addMesh(m) { group.add(m); return m; },
    updater(fn) { updaters.push(fn); },
    windAngle: () => course.windBase,
    solid(x, z, r, top) { colliders.push({ x, z, r, top }); },
    road(x1, z1, x2, z2) { roads.push([x1, z1, x2, z2]); },
    // 橋の上を車で走れるようにする(dir は橋の長さの向き、topAt(u) は橋の上の高さ)
    deck(x, z, dx, dz, hl, hw, topAt, ramp = 0) {
      const l = Math.hypot(dx, dz);
      decks.push({ x, z, dx: dx / l, dz: dz / l, hl, hw, topAt, ramp });
    },
    add(obj, x, z, o = {}) {
      const y = (o.y !== undefined ? o.y : heightAt(x, z)) + (o.yOff || 0);
      if (o.solid) colliders.push({ x, z, r: o.solid, top: y + (o.top || 20) });
      obj.group.position.set(x, y, z);
      obj.group.rotation.y = o.rot || 0;
      obj.group.traverse((m) => { if (m.isMesh && m.castShadow === false && m.material === lowpolyMat) m.castShadow = true; });
      group.add(obj.group);
      if (obj.update) updaters.push((t, dt) => obj.update(t, dt));
      if (o.exclude) exclusions.push([x, z, o.exclude]);
      if (o.alignPath) obj.alignPath = true;
      if (o.smoke) addSmoke(obj.group);
      return obj;
    },
    gate(obj, msg, hw, top) { gates.push({ obj, msg, hw, top, last: -99, prevZ: null }); },
    boats(list, colors, rad = 60) {
      list.forEach(([x, z], i) => {
        const b = sailboat(colors[i % colors.length]);
        group.add(b.group);
        const ph = R() * 6, sp = 0.03 + R() * 0.02;
        updaters.push((t) => {
          const a = ph + t * sp;
          b.group.position.set(x + Math.cos(a) * rad, Math.sin(t * 1.3 + ph) * 0.4, z + Math.sin(a) * rad);
          b.group.rotation.y = -a;
          b.group.rotation.z = Math.sin(t * 0.9 + ph) * 0.05;
        });
      });
    },
    mist(x, z, r) {
      const n = 220, p = new Float32Array(n * 3), seed = [];
      for (let i = 0; i < n; i++) seed.push([R(), R(), R()]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 26, map: softTexture(), transparent: true, opacity: 0.35, depthWrite: false }));
      pts.frustumCulled = false;
      group.add(pts);
      updaters.push((t) => {
        for (let i = 0; i < n; i++) {
          const [a, b, c] = seed[i];
          const life = (t * (0.08 + c * 0.05) + a) % 1;
          p[i * 3] = x + (b - 0.5) * r * (0.6 + life) + 20 + life * 60;
          p[i * 3 + 1] = life * 130;
          p[i * 3 + 2] = z + (c - 0.5) * r * (0.8 + life);
        }
        g.attributes.position.needsUpdate = true;
      });
    },
    aurora(cx, cz) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
        uniforms: { t: { value: 0 } },
        vertexShader: `uniform float t; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.x * 9.0 + t * 0.25) * 40.0 * uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: `uniform float t; varying vec2 vUv;
          void main(){
            float rays = pow(sin(vUv.x * 160.0 + sin(vUv.x * 17.0 + t * 0.6) * 4.0) * 0.5 + 0.5, 3.0);
            float wave = sin(vUv.x * 30.0 + t * 0.7) * 0.5 + 0.5;
            float fade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            float a = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.35, vUv.y) * (0.35 + 0.65 * rays) * (0.55 + 0.45 * wave) * fade;
            vec3 col = mix(vec3(0.2, 1.0, 0.55), vec3(0.75, 0.35, 1.0), smoothstep(0.45, 1.0, vUv.y));
            gl_FragColor = vec4(col * a * 0.8, a);
          }`,
      });
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(2600, 420, 90, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          p.setZ(i, Math.sin(x * 0.0022 + k * 2.1) * 260 + k * 160);
          p.setY(i, p.getY(i) + 680 + k * 70);
        }
        const m = new THREE.Mesh(g, mat);
        m.position.set(cx + (k - 1) * 150, 0, cz - k * 120);
        m.rotation.y = 0.2 * (k - 1);
        m.frustumCulled = false;
        group.add(m);
      }
      updaters.push((t) => { mat.uniforms.t.value = t; });
    },
    floaters(pairs) {
      pairs.forEach(([a, b], i) => {
        const f = miniBalloon(a, b);
        group.add(f.group);
        const cx = (R() - 0.5) * 2600, cz = (R() - 0.5) * 2600, y0 = 180 + R() * 200, ph = R() * 6;
        updaters.push((t) => {
          const u = ph + t * 0.012;
          f.group.position.set(cx + Math.cos(u) * 400, y0 + Math.sin(t * 0.2 + ph) * 20, cz + Math.sin(u) * 300);
        });
      });
    },
    findShore(cx, cz, ang, minH) {
      for (let d = 0; d < 2200; d += 6) {
        const x = cx + Math.cos(ang) * d, z = cz + Math.sin(ang) * d;
        if (heightAt(x, z) > minH) return { x: x + Math.cos(ang) * 22, z: z + Math.sin(ang) * 22 };
      }
      return { x: cx, z: cz };
    },
  };

  // 煙突のけむり
  function addSmoke(parent) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xdedad2, transparent: true, opacity: 0.6, flatShading: true, depthWrite: false });
    const puffs = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(G.ico(1.4, 0), mat.clone());
      parent.add(p);
      puffs.push(p);
    }
    const s = parent.scale.x || 1;
    updaters.push((t) => {
      puffs.forEach((p, i) => {
        const life = (t * 0.18 + i / 6) % 1;
        p.position.set(2.4 + life * 6, 9 + life * 22 / s, 1.2 + Math.sin(life * 5 + i) * 1.5);
        p.scale.setScalar(0.6 + life * 2.2);
        p.material.opacity = 0.55 * (1 - life);
      });
    });
  }

  // ---------- ひかりの道(集める粒) ----------
  // 空を飛ぶときは空中に、地上ののりものでは地面の上にならぶ
  const ctrl = course.path.map(([x, z, a]) => {
    const s = surfaceAt(x, z);
    return new THREE.Vector3(x, s.y + a, z);
  });
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const pathLen = curve.getLength();
  let groundCurve = curve, groundLen = pathLen;
  if (course.groundPath) {
    const gp = course.groundPath;
    groundCurve = new THREE.CurvePath();
    for (let i = 0; i < gp.length; i++) {
      const a = gp[i], b = gp[(i + 1) % gp.length];
      groundCurve.add(new THREE.LineCurve3(new THREE.Vector3(a[0], 0, a[1]), new THREE.Vector3(b[0], 0, b[1])));
    }
    groundLen = groundCurve.getLength();
  }
  function motePoints(ground) {
    const pts = [];
    if (!ground) {
      const n = Math.floor(pathLen / 42);
      for (let i = 0; i < n; i++) {
        const p = curve.getPointAt(i / n);
        p.y = Math.max(p.y, surfaceAt(p.x, p.z).y + 14);
        pts.push(p);
      }
    } else {
      const n = Math.floor(groundLen / 30);
      for (let i = 0; i < n; i++) {
        const p = groundCurve.getPointAt(i / n);
        const s = surfaceAt(p.x, p.z);
        if (s.water || Math.hypot(p.x, p.z) > LIMIT) continue;
        if (!course.groundPath && normalYAt(p.x, p.z) < 0.8) continue;
        p.y = s.y + 2.2;
        pts.push(p);
      }
    }
    return pts;
  }
  const airPts = motePoints(false), groundPts = motePoints(true);
  const CAP = Math.max(airPts.length, groundPts.length, 1);
  let motes = [], moteN = 0;
  const moteGeo = new THREE.OctahedronGeometry(1.7, 0);
  const moteMesh = new THREE.InstancedMesh(moteGeo, new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), CAP);
  // まわりのふんわりした光(やわらかい点)
  const haloPos = new Float32Array(CAP * 3);
  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({
    color: 0xffe2a0, size: 16, map: softTexture(), transparent: true, opacity: course.night ? 0.8 : 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  moteMesh.frustumCulled = halo.frustumCulled = false;
  group.add(moteMesh, halo);
  function setMoteMode(ground) {
    motes = (ground ? groundPts : airPts).map((p) => ({ p: p.clone(), alive: true, back: 0, ph: Math.random() * 6 }));
    moteN = motes.length;
    moteMesh.count = moteN;
    haloGeo.setDrawRange(0, moteN);
  }
  setMoteMode(false);
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  updaters.push((t) => {
    for (let i = 0; i < moteN; i++) {
      const m = motes[i];
      if (!m.alive && t > m.back) m.alive = true;
      const sc = m.alive ? 1 : 0;
      _p.copy(m.p);
      _p.y += Math.sin(t * 1.6 + m.ph) * 1.2;
      _q.setFromEuler(_e.set(0, t * 1.5 + m.ph, 0));
      _m4.compose(_p, _q, _s.setScalar(sc));
      moteMesh.setMatrixAt(i, _m4);
      haloPos[i * 3] = _p.x;
      haloPos[i * 3 + 1] = m.alive ? _p.y : -9999;
      haloPos[i * 3 + 2] = _p.z;
    }
    moteMesh.instanceMatrix.needsUpdate = true;
    haloGeo.attributes.position.needsUpdate = true;
  });
  function collectMotes(pos, t, radius = 13) {
    let got = 0;
    const r2 = radius * radius;
    for (const m of motes) {
      if (!m.alive) continue;
      if (m.p.distanceToSquared(pos) < r2) {
        m.alive = false;
        m.back = t + 150;
        got++;
      }
    }
    return got;
  }
  // 道のいちばん近い点の向き(アーチの向きをそろえる)
  function pathTangentNear(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < 400; i++) {
      const p = curve.getPointAt(i / 400);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i / 400; }
    }
    return curve.getTangentAt(best);
  }

  // ---------- 見どころと小物 ----------
  const spots = course.build(ctx).map((s) => ({ ...s, found: false }));
  const runway = course.strip ? buildRunway(ctx, course.strip, !!course.night) : null;
  // 滑走路のまわりには木を植えない
  const nearRunway = (x, z) => {
    if (!runway) return false;
    const [u, v] = runway.frame.toLocal(x, z);
    return Math.abs(u) < course.strip.len / 2 + 70 && Math.abs(v) < 95;
  };
  for (const g of gates) {
    if (g.obj.alignPath) {
      const tg = pathTangentNear(g.obj.group.position.x, g.obj.group.position.z);
      g.obj.group.rotation.y = Math.atan2(tg.x, tg.z);
    }
  }

  // ---------- 木 ----------
  const treeHash = new Map();
  for (const tdef of course.trees) {
    const geo = merge(treeGeometry(tdef.kind));
    const inst = new THREE.InstancedMesh(geo, lowpolyMat, tdef.count);
    inst.castShadow = quality > 0;
    inst.receiveShadow = true;
    let n = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let tries = 0; tries < tdef.count * 12 && n < tdef.count; tries++) {
      const x = (R() - 0.5) * (SIZE - 300), z = (R() - 0.5) * (SIZE - 300);
      if (Math.hypot(x, z) > 2350) continue;
      const h = heightAt(x, z), ny = normalYAt(x, z);
      if (riverAt(x, z) !== null || nearRunway(x, z)) continue;
      if (!tdef.ok(h, ny, { flower: flowerFn(x, z, h, ny), x, z })) continue;
      let bad = false;
      for (const [ex, ez, er] of exclusions) if ((x - ex) ** 2 + (z - ez) ** 2 < er * er) { bad = true; break; }
      if (bad) continue;
      const sc = 0.8 + R() * 0.9;
      m4.compose(p.set(x, h - 0.4, z), q.setFromEuler(e.set(0, R() * 6.28, 0)), s.set(sc, sc * (0.85 + R() * 0.35), sc));
      inst.setMatrixAt(n, m4);
      if (tdef.kind !== 'bush') {
        const key = Math.floor(x / 20) + ',' + Math.floor(z / 20);
        (treeHash.get(key) || treeHash.set(key, []).get(key)).push([x, z, 0.75 * sc, h + 7 * sc]);
      }
      _col.setHSL(0, 0, 0.88 + R() * 0.24);
      inst.setColorAt(n, _col);
      n++;
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    group.add(inst);
  }

  // ---------- 上昇気流(サーマル) ----------
  const thermals = course.thermals.map(([x, z]) => ({ x, z, r: 110, lift: 4.2 }));
  if (thermals.length) {
    const per = 40, n = per * thermals.length, p = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) seed.push([R(), R(), R()]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfffbe8, size: 7, map: softTexture(), transparent: true, opacity: 0.5, depthWrite: false }));
    pts.frustumCulled = false;
    group.add(pts);
    const baseY = thermals.map((th) => surfaceAt(th.x, th.z).y);
    updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const th = thermals[Math.floor(i / per)], by = baseY[Math.floor(i / per)];
        const [a, b, c] = seed[i];
        const life = (t * 0.05 + a) % 1;
        const ang = b * 6.28 + t * 0.4 + life * 6;
        const rr = th.r * (0.2 + c * 0.6);
        p[i * 3] = th.x + Math.cos(ang) * rr;
        p[i * 3 + 1] = by + 20 + life * 520;
        p[i * 3 + 2] = th.z + Math.sin(ang) * rr;
      }
      g.attributes.position.needsUpdate = true;
    });
    // 気流の上をまわる鳥
    thermals.forEach((th, k) => addFlock(th.x, th.z, baseY[k] + 160 + R() * 80, 3, 55, 0.25));
  }
  function thermalLift(p) {
    let lift = 0;
    for (const th of thermals) {
      const d = Math.hypot(p.x - th.x, p.z - th.z);
      if (d < th.r * 1.6) lift += th.lift * (1 - smooth(th.r * 0.4, th.r * 1.6, d));
    }
    return lift;
  }

  // ---------- 鳥 ----------
  function addFlock(cx, cz, y, n, rad, speed) {
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 0, 0, -0.6, 2.2, 0, -0.2]), 3));
    wingGeo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: course.night ? 0x223044 : 0x3a3f5c, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const L = new THREE.Mesh(wingGeo, mat), Rw = new THREE.Mesh(wingGeo, mat);
      Rw.scale.x = -1;
      b.add(L, Rw);
      b.scale.setScalar(1.6);
      group.add(b);
      const ph = (i / n) * Math.PI * 2 + R(), off = R() * 20;
      updaters.push((t) => {
        const a = ph + t * speed;
        b.position.set(cx + Math.cos(a) * (rad + off), y + Math.sin(t * 0.7 + ph) * 6 + i * 3, cz + Math.sin(a) * (rad + off));
        b.rotation.y = -a;
        const f = Math.sin(t * 7 + ph * 3) * 0.6;
        L.rotation.z = f;
        Rw.rotation.z = -f;
      });
    }
  }
  for (let k = 0; k < 4; k++) {
    const x = (R() - 0.5) * 3000, z = (R() - 0.5) * 3000;
    addFlock(x, z, surfaceAt(x, z).y + 70 + R() * 80, 6, 160 + R() * 120, 0.06 + R() * 0.04);
  }

  // ---------- 舞う粒(雪・花びら) ----------
  let weather = null;
  if (course.particles) {
    const n = quality > 0 ? 700 : 350, BOX = 320;
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p.set([(R() - 0.5) * BOX * 2, (R() - 0.5) * BOX, (R() - 0.5) * BOX * 2], i * 3);
      v.push(R());
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const petals = course.particles === 'petals';
    const pm = new THREE.PointsMaterial({
      color: petals ? 0xf6c2d0 : 0xffffff, size: petals ? 2.4 : 1.8, map: petals ? petalTexture() : softTexture(),
      transparent: true, opacity: 0.9, depthWrite: false,
    });
    weather = new THREE.Points(g, pm);
    weather.frustumCulled = false;
    group.add(weather);
    updaters.push((t, dt, cam) => {
      const c = cam.position;
      for (let i = 0; i < n; i++) {
        let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        y -= (petals ? 2.5 : 4) * (0.6 + v[i]) * dt;
        x += (windDir.x * 4 + Math.sin(t + v[i] * 10) * (petals ? 3 : 1.5)) * dt;
        z += windDir.y * 4 * dt;
        // カメラのまわりの箱の中にとどめる
        const rx = ((x - c.x + BOX) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX;
        const ry = ((y - c.y + BOX / 2) % BOX + BOX) % BOX - BOX / 2;
        const rzz = ((z - c.z + BOX) % (BOX * 2) + BOX * 2) % (BOX * 2) - BOX;
        p[i * 3] = c.x + rx; p[i * 3 + 1] = c.y + ry; p[i * 3 + 2] = c.z + rzz;
      }
      g.attributes.position.needsUpdate = true;
    });
  }

  // ---------- 小地図用の絵 ----------
  function mapCanvas(size = 256) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    const wc = new THREE.Color(sky.water);
    const range = LIMIT * 1.15;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = (px / size - 0.5) * 2 * range, z = (py / size - 0.5) * 2 * range;
        const s = surfaceAt(x, z);
        const h = heightAt(x, z);
        if (s.water) {
          _col.copy(wc).convertLinearToSRGB();
          const k = 0.85 + 0.15 * smooth(-40, 0, h);
          _col.multiplyScalar(k * 1.15);
        } else {
          _col.set(course.color(h, normalYAt(x, z), x, z, N)).convertLinearToSRGB();
          const sh = clamp(1 + (heightAt(x - 12, z - 12) - heightAt(x + 12, z + 12)) * 0.012, 0.7, 1.25);
          _col.multiplyScalar(sh);
        }
        // 紙の色に少し寄せる
        const o = (py * size + px) * 4;
        img.data[o] = clamp(lerp(_col.r, 0.95, 0.25) * 255, 0, 255);
        img.data[o + 1] = clamp(lerp(_col.g, 0.91, 0.25) * 255, 0, 255);
        img.data[o + 2] = clamp(lerp(_col.b, 0.8, 0.25) * 255, 0, 255);
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { canvas: cv, range };
  }

  // ---------- 毎フレーム ----------
  function update(t, dt, cam, focus) {
    for (const u of updaters) u(t, dt, cam);
    // 影のカメラを主役のまわりに
    sun.position.set(focus.x + sunDir.x * 700, focus.y + sunDir.y * 700, focus.z + sunDir.z * 700);
    sun.target.position.copy(focus);
  }

  // アーチなどをくぐったか
  const _inv = new THREE.Matrix4(), _lp = new THREE.Vector3();
  function checkGates(pos, t) {
    const out = [];
    for (const g of gates) {
      g.obj.group.updateMatrixWorld();
      _inv.copy(g.obj.group.matrixWorld).invert();
      _lp.copy(pos).applyMatrix4(_inv);
      if (g.prevZ !== null && Math.sign(g.prevZ) !== Math.sign(_lp.z) && Math.abs(_lp.x) < g.hw && _lp.y > -3 && _lp.y < g.top && t - g.last > 8) {
        g.last = t;
        out.push(g.msg);
      }
      g.prevZ = _lp.z;
    }
    return out;
  }

  // 気球のための風:高さによって向きが変わる
  function windAt(y) {
    const a = course.windBase + y / 240;
    const s = 5 + Math.min(Math.max(y, 0), 1200) * 0.006;
    return { x: Math.sin(a) * s, z: Math.cos(a) * s, a, s };
  }

  // 地上ののりもの用:ぶつかる物から押し出す(ぶつかった物を返す)
  function collide(p, rad, trees = true) {
    let hit = null;
    for (const c of colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + rad;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && p.y < c.top) {
        const d = Math.sqrt(d2) || 0.01;
        p.x = c.x + (dx / d) * rr;
        p.z = c.z + (dz / d) * rr;
        hit = c;
      }
    }
    if (trees) {
      const ix = Math.floor(p.x / 20), iz = Math.floor(p.z / 20);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = treeHash.get(ix + a + ',' + (iz + b));
        if (!list) continue;
        for (const [x, z, r, top] of list) {
          const dx = p.x - x, dz = p.z - z, rr = r + rad;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && p.y < top) {
            const d = Math.sqrt(d2) || 0.01;
            p.x = x + (dx / d) * rr;
            p.z = z + (dz / d) * rr;
            hit = { x, z, r, tree: true };
          }
        }
      }
    }
    return hit;
  }
  // 橋の上の高さ(今の高さ y から乗れる橋だけ)
  function deckAt(x, z, y) {
    let best = null;
    for (const d of decks) {
      const rx = x - d.x, rz = z - d.z;
      const u = rx * d.dx + rz * d.dz, v = -rx * d.dz + rz * d.dx;
      if (Math.abs(v) > d.hw || Math.abs(u) > d.hl + d.ramp) continue;
      let top;
      if (Math.abs(u) <= d.hl) top = d.topAt(u);
      else {
        const e = Math.sign(u) * d.hl;
        top = lerp(d.topAt(e), Math.max(heightAt(x, z), 0), (Math.abs(u) - d.hl) / d.ramp);
      }
      if (top < y + 3 && top > y - 6 && (best === null || top > best)) best = top;
    }
    return best;
  }
  // 地上ののりもののスタート地点
  // まわりも陸か(小さな島にとじこめられないように)
  function roomy(x, z) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      for (const r of [60, 140]) if (surfaceAt(x + Math.cos(a) * r, z + Math.sin(a) * r).water) return false;
    }
    return true;
  }
  function landSpawn() {
    if (course.groundSpawn) return course.groundSpawn;
    for (let i = 0; i < 300; i++) {
      const p = groundCurve.getPointAt(i / 300);
      const s = surfaceAt(p.x, p.z);
      if (!s.water && s.y < 400 && normalYAt(p.x, p.z) > 0.93 && Math.hypot(p.x, p.z) < LIMIT - 200 && roomy(p.x, p.z)) {
        const tg = groundCurve.getTangentAt(i / 300);
        return { x: p.x, z: p.z, dir: [tg.x, tg.z] };
      }
    }
    for (let r = 40; r < 2000; r += 30) {
      for (let a = 0; a < 6.28; a += 0.25) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (!surfaceAt(x, z).water && normalYAt(x, z) > 0.93 && roomy(x, z)) return { x, z, dir: [-x, -z] };
      }
    }
    return course.spawn;
  }

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== lowpolyMat) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
  }

  return {
    course, group, fog, heightAt, surfaceAt, spots, collectMotes, curve, pathLen,
    thermals, thermalLift, cloudDensity, windAt, update, checkGates, mapCanvas, dispose, sunDir, field,
    groundCurve, groundLen, setMoteMode, runway, collide, deckAt, landSpawn, roads, colliders, normalYAt,
    get moteCount() { return moteN; },
  };
}
