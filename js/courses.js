// コース(遊覧の舞台)の設定:地形の形、色、空、見どころ、ひかりの道
import * as M from './models.js';
import { lerp, smooth } from './util.js';
import { buildTown, inTown, TOWN, coastZ, CHURCH } from './town.js';

const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
const ring = (x, z, a = 1900, b = 2400) => smooth(a, b, Math.hypot(x, z));
const jit = (N, x, z, k = 0.05) => N.n2(x * 0.05, z * 0.05) * k;

// 色の小さな道具:hex を少し明るく/暗く
function shade(hex, f) {
  const r = Math.min(255, Math.max(0, ((hex >> 16) & 255) * (1 + f)));
  const g = Math.min(255, Math.max(0, ((hex >> 8) & 255) * (1 + f)));
  const b = Math.min(255, Math.max(0, (hex & 255) * (1 + f)));
  return (r << 16) | (g << 8) | b;
}
function mix(a, b, t) {
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// 水の下の地面は、深いほど水の色に近づける
function underwater(h, sand, deep) {
  return mix(sand, deep, smooth(0, 40, -h));
}

// ---------------------------------------------------------------------------
// 1. 夕凪の群島
// ---------------------------------------------------------------------------
const ISLANDS = [
  [-620, -260, 300, 130], [520, -760, 230, 95], [880, 420, 320, 170], [-260, 860, 250, 95],
  [-1150, 520, 200, 75], [1350, -200, 180, 60], [-1300, -900, 230, 120], [200, 1450, 260, 120], [1500, 1100, 200, 80],
];
const islands = {
  id: 'islands',
  name: '夕凪の群島',
  en: 'Sunset Archipelago',
  sub: '夕日にそまる海と、ちいさな島めぐり',
  intro: '風がやんで、海が金色にひかる時間。\n島から島へ、ゆっくり渡っていこう。',
  seed: 11,
  sky: {
    top: 0x7d88bd, horizon: 0xf6c08c, bottom: 0xe79a76, sun: 0xffc98f, sunDir: [-0.75, 0.13, -0.64], sunI: 2.0, sunSize: 1.4,
    hemiSky: 0xffd9c2, hemiGround: 0x6d5878, hemiI: 1.25, fog: 0xf0bd95, fogNear: 350, fogFar: 2700,
    water: 0x5b8ea6, waterSpec: 0xffc890, cloud: 0xffe6d6, cloudTint: 0xe8a080, clouds: 34, cloudY: [280, 560],
  },
  particles: null,
  windBase: 0.6,
  spawn: { x: 60, z: -120, dir: [-0.6, -0.8] },
  height(N) {
    return (x, z) => {
      let h = (N.fbm(x * 0.0008 + 3, z * 0.0008 - 7, 5) - 0.2) * 380;
      for (const [cx, cz, r, hh] of ISLANDS) {
        h = Math.max(h, hh * bump(x, z, cx, cz, r / 1.25) * (1 + 0.3 * N.fbm(x * 0.004, z * 0.004, 3)) - 22);
      }
      h += N.fbm(x * 0.01, z * 0.01, 2) * 6;
      h = lerp(h, Math.min(h, -18), 1 - smooth(260, 420, Math.hypot(x - 60, z + 120)));
      h = lerp(h, Math.min(h, -30), 1 - smooth(90, 170, Math.hypot(x + 150, z + 700)));
      h = lerp(h, Math.min(h, -26), 1 - smooth(200, 320, Math.hypot(x + 950, z + 350)));
      // 浜辺はゆるやかに
      if (h > 0 && h < 8) h *= 0.6;
      return lerp(h, -70, ring(x, z));
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0xe8d3a2, 0x2f6b80);
    if (h < 5) return 0xead7a6;
    if (ny < 0.72) return mix(0xa7826b, 0x8f6f5e, N.n2(x * 0.02, z * 0.02) * 0.5 + 0.5);
    if (h > 120) return 0x8fa36a;
    return mix(0x8eaa5c, 0x6f9650, N.n2(x * 0.01, z * 0.01) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'palm', count: 900, ok: (h, ny) => h > 3 && h < 45 && ny > 0.85 },
    { kind: 'round', count: 1200, ok: (h, ny) => h > 30 && h < 160 && ny > 0.8 },
  ],
  path: [
    [60, -120, 40], [-150, -700, 15], [-950, -350, 45], [-1300, -900, 150], [-1150, 520, 80], [-260, 860, 100],
    [200, 1450, 160], [1500, 1100, 110], [1080, 330, 70], [1350, -200, 70], [520, -760, 120],
  ],
  thermals: [[880, 420], [-620, -260], [-1300, -900], [200, 1450], [-260, 860]],
  build(ctx) {
    ctx.add(M.lighthouse(), 1090, 330, { exclude: 50, solid: 5, top: 25 });
    const arch = ctx.add(M.rockArch(32, 3), -150, -700, { y: 0, alignPath: true, exclude: 60 });
    ctx.add(M.whale(), -950, -350, { y: 0 });
    ctx.add(M.bench(), -260, 860, { exclude: 30, rot: 2.4 });
    ctx.boats([[300, -300], [-700, 200], [1200, 800], [-400, -1300]], [M.COL.red, M.COL.navy, M.COL.teal, M.COL.yellow]);
    ctx.gate(arch, 'くぐった!岩のアーチ', 18, 26);
    return [
      { id: 'lighthouse', name: '白い灯台', x: 1090, z: 330, r: 230,
        desc: '夕日を背にたつ、古い灯台。\n夜になると、まわる光が船の帰り道をてらす。' },
      { id: 'arch', name: '岩のアーチ', x: -150, z: -700, r: 200,
        desc: '波がながい時間をかけて、けずりだした門。\nくぐりぬけると、いいことがあるらしい。' },
      { id: 'whale', name: 'くじらの入江', x: -950, z: -350, r: 260,
        desc: '夕方になると、くじらが息つぎにやってくる。\nしばらく待っていると、しおをふくかも。' },
      { id: 'cape', name: '夕日の岬', x: -260, z: 860, r: 220,
        desc: '岬のてっぺんに、ベンチがひとつ。\nだれかが毎日、ここで夕日を見ているみたい。' },
    ];
  },
};

// ---------------------------------------------------------------------------
// 2. 大瀑布の渓谷
// ---------------------------------------------------------------------------
const XF = -350;
const rc = (x) => 260 * Math.sin(x * 0.0011 + 0.4) + 110 * Math.sin(x * 0.0029 + 1.3);
const canyon = {
  id: 'canyon',
  name: '大瀑布の渓谷',
  en: 'Great Falls Canyon',
  sub: '朝もやの大きな滝と、赤い岩の谷',
  intro: '台地から、川がまっさかさまに落ちていく。\n朝の光と水しぶきが、虹をかけている。',
  seed: 23,
  sky: {
    top: 0x79acd6, horizon: 0xf3e2c4, bottom: 0xe2cfae, sun: 0xfff0cf, sunDir: [0.55, 0.42, -0.72], sunI: 2.1, sunSize: 1,
    hemiSky: 0xdbeaf2, hemiGround: 0x8a6a52, hemiI: 1.2, fog: 0xe8dcc4, fogNear: 400, fogFar: 2800,
    water: 0x3f8a8a, waterSpec: 0xffffff, cloud: 0xffffff, cloudTint: 0xf0e0d0, clouds: 26, cloudY: [480, 760],
  },
  particles: null,
  windBase: -0.4,
  spawn: { x: XF + 760, z: rc(XF + 760), dir: [-1, 0.15] },
  river: { y: 190, fromX: -2600, toX: XF + 6, width: 128, fn: rc },
  height(N) {
    return (x, z) => {
      const plateau = 250 + N.fbm(x * 0.0012, z * 0.0012, 4) * 70 + N.ridged(x * 0.003, z * 0.003, 3) * 30;
      const zr = rc(x), dz = Math.abs(z - zr);
      const up = x < XF;
      const w = up ? 58 : 150;
      const floorH = up ? 186 : -22;
      const t = smooth(w, w + (up ? 70 : 210), dz);
      let h = lerp(floorH, plateau, t);
      if (!up) {
        const step = 36;
        const q = Math.floor(h / step) * step;
        const f = (h - q) / step;
        const tq = q + smooth(0.55, 0.92, f) * step;
        h = lerp(tq, h, smooth(0.85, 1, t));
        // 滝つぼの湖
        const lx = XF + 330, lz = rc(XF + 330);
        const dl = Math.hypot(x - lx, z - lz);
        h = lerp(h, Math.min(h, -22), (1 - smooth(260, 420, dl)) * smooth(XF - 5, XF + 30, x));
      }
      h += N.fbm(x * 0.012, z * 0.012, 2) * 5;
      return h + ring(x, z) * 380;
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0xc9b48c, 0x2d6d70);
    if (h < 4) return 0xd6c49a;
    if (ny < 0.6) {
      const band = Math.floor((h + N.n2(x * 0.01, z * 0.01) * 6) / 12) % 4;
      return [0xc98f63, 0xb57852, 0xd9a878, 0xa86a48][(band + 4) % 4];
    }
    if (ny < 0.8) return 0xb79a72;
    if (h > 400) return 0x9aa070;
    return mix(0x9cad62, 0x83a056, N.n2(x * 0.008, z * 0.008) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'pine', count: 1600, ok: (h, ny) => h > 200 && ny > 0.86 },
    { kind: 'bush', count: 600, ok: (h, ny) => h > 3 && h < 200 && ny > 0.85 },
    { kind: 'rock', count: 300, ok: (h, ny) => h > 3 && ny > 0.7 },
  ],
  path: [
    [XF + 330, rc(XF + 330), 30], [XF + 70, rc(XF + 70), 70], [XF - 220, rc(XF - 220), 30], [XF - 650, rc(XF - 650), 22],
    [XF - 1100, rc(XF - 1100), 30], [XF - 1500, rc(XF - 1500) + 200, 70], [XF - 1100, rc(XF) + 750, 90],
    [XF - 100, rc(XF) + 820, 110], [XF + 900, rc(XF + 900) + 520, 90], [XF + 1300, rc(XF + 1300), 50],
    [XF + 900, rc(XF + 900) - 60, 40], [XF + 600, rc(XF + 600) + 40, 40],
  ],
  thermals: [[XF - 900, rc(XF - 900) + 500], [XF + 500, rc(XF) - 700], [XF - 300, rc(XF) + 900], [XF + 1100, rc(XF) + 600], [-1500, -1100]],
  build(ctx) {
    ctx.add(M.waterfall(132, 192), XF + 12, rc(XF), { y: -2, rot: Math.PI / 2 - Math.atan(0.0011 * 260 * Math.cos(XF * 0.0011 + 0.4) + 0.0029 * 110 * Math.cos(XF * 0.0029 + 1.3)), exclude: 0 });
    ctx.add(M.rainbow(150), XF + 140, rc(XF + 140), { y: -10, rot: Math.PI / 2 });
    ctx.mist(XF + 40, rc(XF), 120);
    const bx = XF - 650;
    const slope = 0.0011 * 260 * Math.cos(bx * 0.0011 + 0.4) + 0.0029 * 110 * Math.cos(bx * 0.0029 + 1.3);
    const ang = Math.atan(slope);
    const L = 290;
    const ex = -Math.sin(ang) * L / 2, ez = Math.cos(ang) * L / 2;
    const yb = Math.min(ctx.heightAt(bx + ex, rc(bx) + ez), ctx.heightAt(bx - ex, rc(bx) - ez)) - 2;
    ctx.add(M.ropeBridge(L, 14), bx, rc(bx), { y: yb, rot: Math.PI / 2 - ang, exclude: 0 });
    ctx.deck(bx, rc(bx), Math.cos(Math.PI / 2 - ang), -Math.sin(Math.PI / 2 - ang), L / 2, 1.7,
      (u) => yb - 14 * (1 - (u / (L / 2)) ** 2) + 0.1, 12);
    const towers = [[XF + 620, 60, 170], [XF + 900, -90, 210], [XF + 1220, 50, 150], [XF + 1050, 140, 120]];
    towers.forEach(([x, dz, h], i) => ctx.add(M.rockTower(h, 24, i + 1), x, rc(x) + dz, { y: -22, solid: 22, top: h }));
    ctx.add(M.cabin({ wall: 0x9a6a46, roof: M.COL.navy }), XF - 1400, rc(XF - 1400) + 230, { exclude: 40, rot: 0.6, solid: 6, top: 10 });
    ctx.boats([[XF + 330, rc(XF + 330) + 120]], [M.COL.red], 40);
    return [
      { id: 'falls', name: '大瀑布', x: XF + 60, z: rc(XF), r: 280,
        desc: '台地のはしから、川がいっきに落ちていく。\nごうごうという音が、胸にひびく。' },
      { id: 'rainbow', name: '朝の虹', x: XF + 140, z: rc(XF + 140), r: 170, maxY: 220,
        desc: '水しぶきに朝日がさすと、虹があらわれる。\nその下をくぐれるのは、空をとぶ者だけ。' },
      { id: 'bridge', name: '谷の吊り橋', x: bx, z: rc(bx), r: 220,
        desc: 'むかしの人が、谷をわたるためにかけた橋。\n下をくぐると、ぎしぎしと風にゆれていた。' },
      { id: 'towers', name: '岩の塔', x: XF + 950, z: rc(XF + 950), r: 300,
        desc: '川にけずられずに残った、赤い岩の塔。\nてっぺんには、小さな木が根をはっている。' },
    ];
  },
};

// ---------------------------------------------------------------------------
// 3. 雪嶺の峡湾
// ---------------------------------------------------------------------------
const fz = (x) => 380 * Math.sin(x * 0.0008 + 0.2) + 160 * Math.sin(x * 0.0021 + 2);
const fjord = {
  id: 'fjord',
  name: '雪嶺の峡湾',
  en: 'Snowpeak Fjord',
  sub: '雪の山にかこまれた、深い入り江',
  intro: '氷河がけずった谷に、海が入りこんでいる。\n雪の山なみの間を、すべるように飛ぼう。',
  seed: 37,
  sky: {
    top: 0x5a95cf, horizon: 0xd3e5ee, bottom: 0xbcd3de, sun: 0xffffff, sunDir: [0.4, 0.62, 0.68], sunI: 2.2, sunSize: 0.8,
    hemiSky: 0xe0eef8, hemiGround: 0x5a6670, hemiI: 1.25, fog: 0xcfdde8, fogNear: 450, fogFar: 3000,
    water: 0x2e6a82, waterSpec: 0xffffff, cloud: 0xffffff, cloudTint: 0xd8e4ee, clouds: 30, cloudY: [650, 1000],
  },
  particles: 'snow',
  windBase: 2.2,
  spawn: { x: 0, z: fz(0), dir: [1, 0.3] },
  flats: [[520, fz(520) + 330, 70]],
  height(N) {
    return (x, z) => {
      const r = N.ridged(x * 0.0006 + 5, z * 0.0006 - 3, 5);
      let h = Math.pow(r, 1.5) * 820 + N.fbm(x * 0.002, z * 0.002, 3) * 60 + 40;
      const d = Math.abs(z - fz(x));
      h = lerp(h, -70, 1 - smooth(110, 430, d));
      h = Math.max(h, 1150 * bump(x, z, 980, 1020, 230) - 160, 1060 * bump(x, z, 1230, 1230, 210) - 160);
      const gl = bump(x, z, -950, 820, 300);
      h = lerp(h, 220 + (z - 820) * 0.5, gl * 0.85);
      h = lerp(h, Math.min(h, -40), 1 - smooth(60, 120, Math.hypot(x + 600, z - fz(-600))));
      return h + ring(x, z) * 300;
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0x7c7f80, 0x24566a);
    if (h < 6) return 0x7d7a74;
    const g = bump(x, z, -950, 820, 300);
    if (g > 0.35 && h > 60) return mix(0xdcecf2, 0xa9d1e2, N.n2(x * 0.03, z * 0.03) * 0.5 + 0.5);
    const snow = 360 + N.fbm(x * 0.004, z * 0.004, 2) * 90;
    if (h > snow && ny > 0.55) return mix(0xf4f7f8, 0xe2eaee, N.n2(x * 0.02, z * 0.02) * 0.5 + 0.5);
    if (ny < 0.7) return mix(0x7e7d80, 0x939096, N.n2(x * 0.02, z * 0.02) * 0.5 + 0.5);
    if (h > snow - 80) return 0x8a8c7a;
    return mix(0x6f8e5a, 0x86985f, N.n2(x * 0.01, z * 0.01) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'pine', count: 1600, ok: (h, ny) => h > 6 && h < 260 && ny > 0.8 },
    { kind: 'snowpine', count: 800, ok: (h, ny) => h > 220 && h < 380 && ny > 0.82 },
  ],
  path: [
    [0, fz(0), 40], [600, fz(600), 50], [980, 820, 160], [1250, 1050, 220], [1500, fz(1500), 60],
    [1100, fz(1100) - 500, 200], [520, fz(520) + 330, 50], [-200, fz(-200) + 500, 160],
    [-950, 760, 60], [-600, fz(-600), 14], [-1300, fz(-1300), 50], [-700, fz(-700) - 600, 180],
  ],
  thermals: [[400, fz(400) - 500], [-900, 500], [1300, 600], [-1300, fz(-1300) + 500], [200, fz(200) + 600]],
  build(ctx) {
    const cx = 520, cz = fz(520) + 330;
    ctx.add(M.cabin({ wall: 0xa8603f, roof: 0x3d4b6e, lit: true }), cx, cz, { exclude: 40, rot: 2.6, smoke: true, solid: 6, top: 10 });
    const ice = ctx.add(M.iceArch(26), -600, fz(-600), { y: 0, alignPath: true, exclude: 30 });
    ctx.gate(ice, 'くぐった!氷のアーチ', 14, 20);
    ctx.boats([[300, fz(300)], [-1100, fz(-1100)], [1300, fz(1300)]], [M.COL.red, M.COL.yellow, M.COL.red], 70);
    ctx.add(M.pier(34), 40, fz(40) + 300, { y: 0, rot: Math.PI });
    return [
      { id: 'glacier', name: '青い氷河', x: -950, z: 820, r: 330,
        desc: '何千年もかけて、ゆっくり流れてきた氷。\n割れ目の奥は、海よりも青い。' },
      { id: 'hut', name: '山の小屋', x: cx, z: cz, r: 200,
        desc: '煙突から、あたたかそうな煙。\nスープのにおいが、ここまでとどきそう。' },
      { id: 'twin', name: '双子の峰', x: 1100, z: 1120, r: 360,
        desc: 'ならんでそびえる、ふたつの頂。\n山の人たちは「兄さん」「妹」とよんでいる。' },
      { id: 'icearch', name: '氷のアーチ', x: -600, z: fz(-600), r: 200,
        desc: '氷河からはなれた氷が、門のかたちに残った。\n春がくるまでの、期間限定の門。' },
    ];
  },
};

// ---------------------------------------------------------------------------
// 4. オーロラの湖
// ---------------------------------------------------------------------------
const aurora = {
  id: 'aurora',
  name: 'オーロラの湖',
  en: 'Aurora Lake',
  sub: '星ふる夜、ゆらめく光のカーテン',
  intro: 'しんと冷えた、北の夜。\n空いっぱいに、光のカーテンがゆれている。',
  seed: 51,
  night: true,
  sky: {
    top: 0x0d1a38, horizon: 0x2b4a6e, bottom: 0x1a2c44, sun: 0xdfe8ff, sunDir: [-0.3, 0.45, 0.84], sunI: 0.9, sunSize: 0.6,
    hemiSky: 0x7f9fd0, hemiGround: 0x1d2a3a, hemiI: 1.5, fog: 0x203a5a, fogNear: 300, fogFar: 2500,
    water: 0x1b3a55, waterSpec: 0x9fd8c0, cloud: 0x5a6c8a, cloudTint: 0x203048, clouds: 10, cloudY: [500, 700],
  },
  particles: 'snow',
  windBase: -1.8,
  spawn: { x: 0, z: -300, dir: [0, 1] },
  height(N) {
    return (x, z) => {
      let h = 55 + N.fbm(x * 0.0009, z * 0.0009, 5) * 150 + N.fbm(x * 0.004, z * 0.004, 3) * 12;
      const dw = Math.hypot(x * 0.9, z * 1.15) + N.fbm(x * 0.0015 + 9, z * 0.0015, 3) * 420;
      h = lerp(h, -28, 1 - smooth(650, 950, dw));
      h = Math.max(h, 70 * bump(x, z, 300, -120, 80) - 20, 50 * bump(x, z, -350, 260, 60) - 20);
      h = Math.max(h, 430 * bump(x, z, -1150, -950, 360) - 100);
      return h + ring(x, z) * 320;
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0x5d6a72, 0x14304a);
    if (h < 4) return 0xc9d3dc;
    if (ny < 0.72) return 0x6b7380;
    return mix(0xe6edf3, 0xc6d4e2, N.n2(x * 0.01, z * 0.01) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'snowpine', count: 2600, ok: (h, ny) => h > 4 && h < 300 && ny > 0.8 },
  ],
  path: [
    [0, -300, 40], [300, -120, 40], [700, 300, 80], [200, 1300, 380], [-500, 1200, 420], [-700, 400, 120],
    [-350, 260, 40], [-800, -500, 90], [-1150, -950, 60], [-400, -1100, 120],
  ],
  thermals: [],
  build(ctx) {
    const shore = ctx.findShore(0, 0, 0.75, 6);
    ctx.add(M.cabin({ wall: 0x7a4a36, roof: 0x3a3f5c, lit: true }), shore.x, shore.z, { exclude: 40, rot: -0.7 + Math.PI, smoke: true, solid: 6, top: 10 });
    ctx.add(M.cabin({ wall: 0x8a5a3a, roof: 0x5a3a3a, lit: true, scale: 0.8 }), shore.x + 28, shore.z + 16, { exclude: 30, rot: 2.0, solid: 5, top: 9 });
    ctx.add(M.observatory(), -1150, -950, { exclude: 40, rot: 0.8, solid: 6, top: 12 });
    ctx.add(M.lantern(0xffc870), 300, -120, { exclude: 18 });
    ctx.add(M.pier(30), shore.x - Math.cos(0.75) * 24, shore.z - Math.sin(0.75) * 24, { y: 0, rot: -Math.PI / 2 - 0.75 });
    ctx.aurora(0, 1300);
    return [
      { id: 'cabin', name: '湖畔の小屋', x: shore.x, z: shore.z, r: 220,
        desc: '窓にともる、オレンジ色のあかり。\nだれかがココアをいれて、空を見あげている。' },
      { id: 'lights', name: '光のカーテンの下', x: 0, z: 1250, r: 600, minY: 300,
        desc: '見あげても、見おろしても、光の波。\n音はないのに、しゃらしゃらと聞こえる気がする。' },
      { id: 'hill', name: '星見の丘', x: -1150, z: -950, r: 240,
        desc: '丘の上の、ちいさな天文台。\n今夜は望遠鏡より、目で見るほうがきれい。' },
      { id: 'islet', name: '小島のともしび', x: 300, z: -120, r: 160,
        desc: '湖にうかぶ小島に、ひとつだけ灯ろう。\n帰り道をまちがえないための目じるし。' },
    ];
  },
};

// ---------------------------------------------------------------------------
// 5. 花と風車の丘
// ---------------------------------------------------------------------------
const rz = (x) => 320 * Math.sin(x * 0.0009 + 0.5) + 120 * Math.sin(x * 0.0023 + 2.1);
const FLOWERS = [0xeaa0b6, 0xf0d36a, 0xb7a0dc, 0xf6f1e4, 0xeca463, 0x9cc069, 0xe3778d];
function flowerAt(x, z, h, ny, N) {
  const near = Math.hypot(x - 550, z - 300) < 380;
  const field = N.n2(x / 240 + 3, z / 240 - 1) + (near ? 0.8 : 0);
  if (field > 0.3 && ny > 0.86 && h > 3 && h < 230) {
    const fx = Math.floor(x / 240), fzz = Math.floor(z / 240);
    const id = Math.abs((fx * 73856093) ^ (fzz * 19349663));
    const a = (id % 4) * 0.8;
    const s = Math.floor((x * Math.cos(a) + z * Math.sin(a)) / 18);
    return FLOWERS[Math.abs(s + id) % FLOWERS.length];
  }
  return -1;
}
const hills = {
  isFlower: (x, z, h, ny, N) => flowerAt(x, z, h, ny, N) >= 0,
  id: 'hills',
  name: '花と風車の丘',
  en: 'Windmill Hills',
  sub: '春の花畑と、のんびりまわる風車',
  intro: 'あたたかい午後。\n花畑の上を、風車といっしょに風がわたっていく。',
  seed: 67,
  sky: {
    top: 0x86c2e6, horizon: 0xfbf0d6, bottom: 0xeee6cf, sun: 0xfff3da, sunDir: [-0.45, 0.55, 0.7], sunI: 2.0, sunSize: 1,
    hemiSky: 0xeaf4fa, hemiGround: 0x7a8a5a, hemiI: 1.2, fog: 0xf1ead4, fogNear: 400, fogFar: 2800,
    water: 0x5c9fb6, waterSpec: 0xffffff, cloud: 0xffffff, cloudTint: 0xf2e6da, clouds: 30, cloudY: [380, 620],
  },
  particles: 'petals',
  windBase: 0.2,
  spawn: { x: -1000, z: rz(-1000), dir: [1, 0.2] },
  flats: [[-150, 650, 160]],
  height(N) {
    return (x, z) => {
      let h = 70 + N.fbm(x * 0.0006, z * 0.0006, 4) * 190 + N.fbm(x * 0.003, z * 0.003, 2) * 14;
      const d = Math.abs(z - rz(x));
      h = lerp(h, -10, 1 - smooth(35, 150, d));
      h = lerp(h, Math.min(h, -14), 1 - smooth(200, 330, Math.hypot(x + 1000, z - rz(-1000))));
      h = Math.max(h, 300 * bump(x, z, 750, -850, 360) - 60);
      return h + ring(x, z) * 300;
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0xb8b090, 0x3c7f92);
    if (h < 3) return 0xd9cfa8;
    if (ny < 0.75) return 0x9a9a6a;
    const f = flowerAt(x, z, h, ny, N);
    if (f >= 0) return f;
    return mix(0x95bf6a, 0x7fae5c, N.n2(x * 0.01, z * 0.01) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'round', count: 1100, ok: (h, ny, c) => h > 4 && ny > 0.8 && !c.flower },
    { kind: 'blossom', count: 500, ok: (h, ny, c) => h > 4 && h < 160 && ny > 0.85 && !c.flower },
    { kind: 'bush', count: 600, ok: (h, ny, c) => h > 3 && ny > 0.8 && !c.flower },
  ],
  path: [
    [-1000, rz(-1000), 35], [-500, rz(-500), 30], [-150, 650, 70], [300, rz(300), 18], [550, 300, 45],
    [750, -850, 300], [1300, rz(1300), 60], [1000, 900, 120], [200, 1300, 110], [-800, 1000, 100], [-1500, rz(-1500) - 300, 80],
  ],
  thermals: [[750, -850], [-600, -700], [600, 800], [-900, 600], [1200, -200]],
  build(ctx) {
    const vx = -150, vz = 650;
    const R = ctx.R;
    const walls = [0xf2e8d2, 0xe8d0b0, 0xf4eee0, 0xd9c4a0];
    const roofs = [M.COL.red, 0x3d4b6e, 0xc9874a, 0x7a9a6a];
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, r = 30 + R() * 110;
      ctx.add(M.house(walls[i % 4], roofs[(i * 3) % 4], i), vx + Math.cos(a) * r, vz + Math.sin(a) * r, { rot: R() * 6, exclude: 14, solid: 5, top: 10 });
    }
    [[vx - 140, vz - 40], [vx + 150, vz + 30], [vx + 20, vz + 170], [400, -300], [-700, -500], [1100, 300], [-1200, 900], [900, 1200]]
      .forEach(([x, z], i) => ctx.add(M.windmill(i + 1), x, z, { rot: 0.4 + R() * 0.3, exclude: 20, solid: 4, top: 20 }));
    const bx = 300, slope = 0.0009 * 320 * Math.cos(bx * 0.0009 + 0.5) + 0.0023 * 120 * Math.cos(bx * 0.0023 + 2.1);
    const br = Math.PI / 2 - Math.atan(slope);
    ctx.add(M.stoneBridge(90), bx, rz(bx), { y: -6, rot: br, exclude: 0 });
    ctx.deck(bx, rz(bx), Math.cos(br), -Math.sin(br), 50, 4, () => -6 + 90 * 0.45 / 2 * 0.95 - 0.8 + 0.6, 45);
    ctx.add(M.bigTree(), 750, -850, { exclude: 40, solid: 3, top: 35 });
    ctx.floaters([[0xe3778d, 0xf6f1e4], [0xf0d36a, 0x6aa0c8], [0x7fae5c, 0xf4eee0], [0xc65a43, 0xf0d36a]]);
    ctx.boats([[-1000, rz(-1000) + 80]], [M.COL.yellow], 30);
    return [
      { id: 'village', name: '風車の村', x: vx, z: vz, r: 260,
        desc: 'パンを焼くにおいと、風車のきしむ音。\n村の人たちが、空にむかって手をふっている。' },
      { id: 'field', name: '花畑の海', x: 550, z: 300, r: 300, maxY: 180,
        desc: '見わたすかぎり、色とりどりの花のしま。\n低く飛ぶと、あまい香りがする…気がする。' },
      { id: 'sbridge', name: '石の橋', x: bx, z: rz(bx), r: 200,
        desc: '何百年もまえからある、まるい石の橋。\nアーチの下を、小舟がくぐっていく。' },
      { id: 'tree', name: '丘の一本木', x: 750, z: -850, r: 260,
        desc: 'いちばん高い丘に、大きな木がひとつ。\n木かげで昼寝をするのに、ちょうどいい。' },
    ];
  },
};


// ---------------------------------------------------------------------------
// 6. 港町と時計台(地上ののりもので走れる街)
// ---------------------------------------------------------------------------
const town = {
  id: 'town',
  name: '港町と時計台',
  en: 'Harbor Town',
  sub: '碁盤の目の街と、海辺の観覧車',
  intro: '坂と港のある、ちいさな街。\n空からながめても、車や原付で走ってもいい。',
  seed: 83,
  sky: {
    top: 0x82b6e2, horizon: 0xf7e8cf, bottom: 0xe8dcc0, sun: 0xfff1d6, sunDir: [0.35, 0.5, 0.8], sunI: 2.1, sunSize: 1,
    hemiSky: 0xeaf2f8, hemiGround: 0x8a7a62, hemiI: 1.2, fog: 0xf0e8d6, fogNear: 400, fogFar: 2800,
    water: 0x5a98b4, waterSpec: 0xffffff, cloud: 0xffffff, cloudTint: 0xf2e6da, clouds: 26, cloudY: [380, 640],
  },
  particles: null,
  windBase: 1.2,
  spawn: { x: 0, z: 950, dir: [0, -1] },
  groundSpawn: { x: -60, z: 100, dir: [1, 0] },
  height(N) {
    return (x, z) => {
      let h = 8 + Math.max(0, -260 - z) * 0.22 + N.fbm(x * 0.001, z * 0.001, 4) * 140 * smooth(-250, -700, z);
      h += smooth(720, 1200, Math.abs(x)) * (140 + N.fbm(x * 0.002, z * 0.002, 3) * 90);
      h += 60 * bump(x, z, CHURCH.x, CHURCH.z, 230);
      h += N.fbm(x * 0.01, z * 0.01, 2) * 4;
      const dX = Math.max(0, Math.abs(x) - 660), dZ = Math.max(0, TOWN.z0 - z, z - TOWN.z1);
      h = lerp(h, TOWN.y, 1 - smooth(0, 90, Math.hypot(dX, dZ)));
      h = lerp(h, -24, smooth(coastZ(x) - 10, coastZ(x) + 90, z));
      return h + ring(x, z) * 300;
    };
  },
  color(h, ny, x, z, N) {
    if (h < 0) return underwater(h, 0xd8c8a0, 0x2f6f88);
    if (h < 5) return 0xe2d2a6;
    if (inTown(x, z, -4)) return mix(0xcfc6b2, 0xbdb5a2, N.n2(x * 0.03, z * 0.03) * 0.5 + 0.5);
    if (ny < 0.72) return 0x9a8e7c;
    return mix(0x90b866, 0x7aa258, N.n2(x * 0.01, z * 0.01) * 0.5 + 0.5);
  },
  trees: [
    { kind: 'round', count: 1300, ok: (h, ny, c) => h > 4 && ny > 0.82 && !inTown(c.x, c.z, 40) },
    { kind: 'pine', count: 700, ok: (h, ny, c) => h > 120 && ny > 0.82 && !inTown(c.x, c.z, 40) },
    { kind: 'blossom', count: 300, ok: (h, ny, c) => h > 10 && h < 150 && ny > 0.86 && !inTown(c.x, c.z, 40) },
  ],
  path: [
    [0, 950, 60], [0, 600, 45], [420, 505, 55], [600, 150, 70], [50, 150, 60], [-300, 300, 50],
    [-320, 505, 35], [-650, 200, 80], [-450, -560, 60], [0, -700, 150], [700, -400, 120], [900, 500, 90],
  ],
  groundPath: [[-100, 100], [500, 100], [500, 470], [-500, 470], [-500, -200], [-100, -200]],
  thermals: [[-450, -560], [800, -500], [-900, -300], [1000, 300]],
  build(ctx) {
    return buildTown(ctx);
  },
};

export const COURSES = [islands, canyon, fjord, aurora, hills, town];
export { shade, mix };
