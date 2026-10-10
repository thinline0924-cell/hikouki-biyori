// 音:風の音、エンジン、オルゴールのようなBGM、効果音。ぜんぶその場で作る(音のファイルは使わない)

// コースごとの音階(五音音階)と和音の進み方
const KEYS = {
  islands: { root: 57, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] },
  canyon: { root: 55, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [-5, -1, 2]] },
  fjord: { root: 52, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]] },
  aurora: { root: 50, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]] },
  hills: { root: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [-7, -3, 0], [-5, -1, 2], [-3, 0, 4]] },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// エンジンの性格:cyl 気筒数 / stroke 4ストか2ストか / blades プロペラの羽根の数 /
// pipe 排気管のひびく高さ(Hz) / body エンジン全体のこもり具合(Hz) / rough ばらつき
const ENGINES = {
  plane: { kind: 'piston', cyl: 4, stroke: 4, blades: 2, pipe: 118, body: 650, rough: 0.07, idle: 950, hi: 2650, vol: 0.13 },
  biplane: { kind: 'piston', cyl: 7, stroke: 4, blades: 2, pipe: 82, body: 480, rough: 0.12, idle: 700, hi: 2150, vol: 0.15 },
  seaplane: { kind: 'piston', cyl: 6, stroke: 4, blades: 3, pipe: 102, body: 600, rough: 0.07, idle: 800, hi: 2550, vol: 0.13 },
  jet: { kind: 'jet', vol: 0.15 },
  car: { kind: 'piston', cyl: 4, stroke: 4, blades: 0, pipe: 165, body: 850, rough: 0.05, idle: 850, red: 5800, gears: [0, 7, 13, 19, 26, 45], vol: 0.12 },
  scooter: { kind: 'piston', cyl: 1, stroke: 2, blades: 0, pipe: 230, body: 1500, rough: 0.14, idle: 1700, red: 7800, cvt: true, vol: 0.1 },
};

// 1サンプルずつエンジン音を作るプログラム(音の専用スレッドで動く)
// ・気筒ごとの爆発 → 排気管の共鳴 → こもった響き
// ・プロペラ:羽根が空気を切る「ブンブン」といううなり
// ・ジェット:ごう音 + タービンの高い音 + ファンのうなり
const WORKLET = `
class EngineSynth extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'fire', defaultValue: 0, minValue: 0, maxValue: 4000, automationRate: 'k-rate' },
      { name: 'pipe', defaultValue: 120, minValue: 20, maxValue: 2000, automationRate: 'k-rate' },
      { name: 'body', defaultValue: 700, minValue: 50, maxValue: 8000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rough', defaultValue: 0.06, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cyl', defaultValue: 4, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'bp', defaultValue: 0, minValue: 0, maxValue: 1000, automationRate: 'k-rate' },
      { name: 'jet', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'n', defaultValue: 0, minValue: 0, maxValue: 1.2, automationRate: 'k-rate' },
      { name: 'dop', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.ph = 0; this.k = 0; this.jit = 0; this.amp = 0; this.pt = 1;
    this.r1 = 0; this.r2 = 0; this.lp1 = 0; this.lp2 = 0;
    this.bpPh = 0; this.svL = 0; this.svB = 0;
    this.jl = 0; this.jl2 = 0; this.wp = 0; this.wp2 = 0; this.fan = 0; this.g = 0; this.hp = 0;
    this.cylAmp = new Float32Array(16);
    for (let i = 0; i < 16; i++) this.cylAmp[i] = 0.82 + Math.random() * 0.36;
  }
  process(inputs, outputs, P) {
    const out = outputs[0][0];
    if (!out) return true;
    const sr = sampleRate, n = out.length;
    const fire = P.fire[0], pipe = P.pipe[0], body = P.body[0], load = P.load[0], rough = P.rough[0];
    const cyl = Math.max(1, Math.round(P.cyl[0])), bp = P.bp[0], jet = P.jet[0], N = P.n[0], dop = P.dop[0], gainT = P.gain[0];
    const fb = Math.min(0.95, 2 * Math.sin(Math.PI * Math.min(body * (0.7 + load * 0.9), sr / 6) / sr));
    const rr = 0.985, w = 2 * Math.PI * pipe / sr, c1 = 2 * rr * Math.cos(w), c2 = rr * rr, b0 = (1 - rr) * 2 * Math.sin(w);
    const fBlade = 2 * Math.sin(Math.PI * 850 / sr);
    const tau = 0.0022 + (1 - load) * 0.0022;
    for (let i = 0; i < n; i++) {
      this.g += (gainT - this.g) * 0.002;
      const noise = Math.random() * 2 - 1;
      let s = 0;
      if (jet < 0.5) {
        if (fire > 1) {
          this.ph += fire * (1 + this.jit) / sr;
          if (this.ph >= 1) {
            this.ph -= 1;
            this.k = (this.k + 1) % cyl;
            this.jit = (Math.random() - 0.5) * rough;
            this.amp = (0.45 + 0.55 * load) * this.cylAmp[this.k] * (1 + (Math.random() - 0.5) * rough * 2);
            this.pt = 0;
          }
        }
        // 爆発のパルス(すぐ立ち上がって、すっと消える)
        const e = this.amp * Math.exp(-this.pt / tau);
        this.pt += 1 / sr;
        const exc = e * (0.7 + noise * (0.3 + 0.4 * load));
        // 排気管の共鳴
        const y = exc * b0 * 2.5 + c1 * this.r1 - c2 * this.r2;
        this.r2 = this.r1; this.r1 = y;
        s = y * 0.9 + exc * 0.35;
        // エンジン全体のこもり
        this.lp1 += fb * (s - this.lp1);
        this.lp2 += fb * (this.lp1 - this.lp2);
        s = this.lp2 * 1.4;
        // プロペラ
        if (bp > 0) {
          this.bpPh += bp / sr;
          if (this.bpPh >= 1) this.bpPh -= 1;
          const m = 0.5 + 0.5 * Math.cos(2 * Math.PI * this.bpPh);
          const m3 = m * m * m;
          const hpv = noise - this.svL - 0.8 * this.svB;
          this.svB += fBlade * hpv;
          this.svL += fBlade * this.svB;
          s += this.svB * m3 * (0.18 + 0.4 * load) + Math.sin(2 * Math.PI * this.bpPh) * 0.12 * (0.3 + load);
        }
      } else {
        // ジェット
        const fr = 2 * Math.sin(Math.PI * Math.min(350 + N * 1500, sr / 6) / sr);
        this.jl += fr * (noise - this.jl);
        this.jl2 += 0.003 * (noise - this.jl2);
        const fw = (1700 + N * 2700) * dop;
        this.wp += fw / sr; this.wp2 += fw * 1.504 / sr; this.fan += (80 + N * 170) * dop / sr;
        if (this.wp >= 1) this.wp -= 1;
        if (this.wp2 >= 1) this.wp2 -= 1;
        if (this.fan >= 1) this.fan -= 1;
        const whine = Math.sin(2 * Math.PI * this.wp) * 0.06 + Math.sin(2 * Math.PI * this.wp2) * 0.025;
        const buzz = (this.fan * 2 - 1) * 0.05 * N;
        s = this.jl * (0.6 + N * 0.7) + this.jl2 * 5 * (0.4 + N * 0.6) + whine * (0.4 + N) + buzz;
      }
      // 直流分をのぞいて、やわらかく頭打ち
      this.hp += 0.001 * (s - this.hp);
      out[i] = Math.tanh((s - this.hp) * 1.5) * this.g;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('engine-synth', EngineSynth);
`;

export class Sound {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.key = KEYS.islands;
    this.playing = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.55 : 0;
    this.music.connect(this.master);

    // ひびき(リバーブ)
    this.verb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.verb.connect(wet);
    wet.connect(this.master);

    // 雑音のもと
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // 風
    const wind = ctx.createBufferSource();
    wind.buffer = nb;
    wind.loop = true;
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.Q.value = 0.6;
    this.windF.frequency.value = 400;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    wind.connect(this.windF).connect(this.windG).connect(this.sfx);
    wind.start();

    // エンジン(AudioWorklet で1サンプルずつ作る。使えないブラウザでは簡単な音にする)
    this.engBus = ctx.createGain();
    this.engBus.gain.value = 1;
    this.engBus.connect(this.sfx);
    this.setupEngine();
    // バーナー
    const bur = ctx.createBufferSource();
    bur.buffer = nb;
    bur.loop = true;
    const burF = ctx.createBiquadFilter();
    burF.type = 'lowpass';
    burF.frequency.value = 700;
    this.burG = ctx.createGain();
    this.burG.gain.value = 0;
    bur.connect(burF).connect(this.burG).connect(this.sfx);
    bur.start();

    this.nextBeat = ctx.currentTime + 0.3;
    this.beat = 0;
    setInterval(() => this.schedule(), 120);
  }

  setKey(courseId) {
    this.key = KEYS[courseId] || KEYS.islands;
  }
  setMusic(on) {
    this.musicOn = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.3);
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  async setupEngine() {
    const ctx = this.ctx;
    try {
      if (!ctx.audioWorklet) throw new Error('no worklet');
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      this.eng = new AudioWorkletNode(ctx, 'engine-synth', { numberOfInputs: 0, outputChannelCount: [1] });
      this.eng.connect(this.engBus);
      this.engP = (name) => this.eng.parameters.get(name);
    } catch (e) {
      // 予備:ノコギリ波の簡単なエンジン音
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.value = 0;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.connect(f).connect(g).connect(this.engBus);
      o.start();
      this.fallback = { o, f, g };
    }
  }

  // エンジンの回転数などを計算して音に送る(毎フレーム)
  // id: 機体のID、throttle: 0〜1、speed: m/秒、dist: カメラまでの距離、dop: ドップラーの倍率
  flight({ id = 'none', speed = 0, throttle = 0, burner = false, cloud = 0, active = true, dist = 10, dop = 1, onWater = false }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = active ? 1 : 0;
    this.windF.frequency.setTargetAtTime(250 + speed * 9 + cloud * 300, t, 0.2);
    const groundish = id === 'car' || id === 'scooter';
    this.windG.gain.setTargetAtTime(k * (0.015 + Math.min(speed, 130) * (groundish ? 0.0006 : 0.0011) + cloud * 0.05), t, 0.3);
    this.burG.gain.setTargetAtTime(k * (burner ? 0.16 : 0), t, 0.06);

    const E = ENGINES[id];
    const att = 1 / (1 + Math.max(0, dist - 12) / 40);
    let fire = 0, bp = 0, load = throttle, jet = 0, n = 0, rpm = 0, vol = 0;
    if (E && E.kind === 'piston') {
      if (E.gears) {
        // 車:ギアが上がるたびに回転数が下がる
        const G = E.gears;
        let g = 0;
        while (g < G.length - 2 && Math.abs(speed) > G[g + 1]) g++;
        const f = (Math.abs(speed) - G[g]) / (G[g + 1] - G[g]);
        rpm = g === 0 ? E.idle + f * 3200 + throttle * 700 : 1700 + f * 3600 + throttle * 300;
      } else if (E.cvt) {
        // 原付:アクセルを開けると回転数が先に上がる
        rpm = throttle > 0.1 ? 4600 + 2900 * Math.min(Math.abs(speed) / 17, 1) : E.idle + Math.abs(speed) * 120;
      } else {
        const th = onWater ? throttle * 0.7 : throttle;
        rpm = E.idle + (E.hi - E.idle) * Math.pow(Math.min(th, 1), 0.8) + Math.max(0, speed - 40) * 2;
      }
      rpm = Math.min(rpm, E.red || E.hi * 1.08);
      fire = (rpm / 60) * E.cyl / (E.stroke === 4 ? 2 : 1);
      bp = (rpm / 60) * E.blades;
      vol = E.vol * (0.75 + throttle * 0.35);
    } else if (E && E.kind === 'jet') {
      jet = 1;
      n = 0.55 + 0.45 * throttle;
      vol = E.vol * (0.7 + throttle * 0.4);
    }
    this.rpm = rpm;
    const gain = k * vol * att;
    if (this.eng) {
      const P = this.engP;
      const set = (name, v, tc = 0.08) => P(name).setTargetAtTime(v, t, tc);
      set('fire', fire * dop, 0.06);
      set('bp', bp * dop, 0.06);
      set('load', load, 0.1);
      set('n', n, 0.6);
      set('dop', dop, 0.1);
      P('jet').setValueAtTime(jet, t);
      if (E && E.kind === 'piston') {
        P('cyl').setValueAtTime(E.cyl, t);
        set('pipe', E.pipe * dop, 0.1);
        set('body', E.body, 0.1);
        set('rough', E.rough, 0.1);
      }
      set('gain', gain, 0.12);
    } else if (this.fallback) {
      const F = this.fallback;
      F.o.frequency.setTargetAtTime(Math.max(fire, jet ? 120 : 30), t, 0.1);
      F.f.frequency.setTargetAtTime(400 + throttle * 700, t, 0.2);
      F.g.gain.setTargetAtTime(gain * 0.3, t, 0.15);
    }
  }

  // クラクション
  horn(id) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fs = id === 'scooter' ? [560, 700] : [392, 494];
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.setValueAtTime(0.07, t + 0.32);
    g.gain.linearRampToValueAtTime(0, t + 0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    for (const f of fs) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.45);
    }
    lp.connect(g).connect(this.sfx);
  }

  // ---- BGM(オルゴールのような、ゆっくりした音楽) ----
  schedule() {
    if (!this.ctx || !this.playing) return;
    const spb = 60 / 66 / 2; // 8分音符の長さ
    while (this.nextBeat < this.ctx.currentTime + 0.5) {
      const b = this.beat, t = this.nextBeat;
      const K = this.key;
      const bar = Math.floor(b / 8);
      const chord = K.chords[Math.floor(bar / 2) % K.chords.length];
      if (b % 16 === 0) {
        chord.forEach((n) => this.pad(mtof(K.root - 12 + n), t, spb * 16));
        this.bass(mtof(K.root - 24 + chord[0]), t, spb * 8);
      }
      if (b % 16 === 8) this.bass(mtof(K.root - 24 + chord[0] + (chord[0] < -4 ? 12 : 0)), t, spb * 8);
      // メロディ:和音の音を多めに、ときどき休む
      if (Math.random() < (b % 2 === 0 ? 0.5 : 0.22)) {
        let n;
        if (Math.random() < 0.55) n = chord[Math.floor(Math.random() * 3)] + 12;
        else n = K.scale[Math.floor(Math.random() * 5)] + (Math.random() < 0.5 ? 12 : 0);
        this.musicBox(mtof(K.root + n), t, 0.09);
      }
      this.beat++;
      this.nextBeat += spb;
    }
  }

  musicBox(f, t, vol = 0.1, bus = null) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 3.01;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(bus || this.music);
    g.connect(this.verb);
    o.start(t); o2.start(t);
    o.stop(t + 2.4); o2.stop(t + 2.4);
  }
  pad(f, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.025, t + 1.5);
    g.gain.setValueAtTime(0.025, t + dur - 1.5);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    for (const d of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
    lp.connect(g);
    g.connect(this.music);
    g.connect(this.verb);
  }
  bass(f, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  // ---- 効果音 ----
  chime(step) {
    if (!this.ctx) return;
    const K = this.key;
    const s = step % 15;
    const n = K.scale[s % 5] + 12 * Math.floor(s / 5);
    this.musicBox(mtof(K.root + 12 + n), this.ctx.currentTime, 0.14, this.sfx);
  }
  jingle() {
    if (!this.ctx) return;
    const K = this.key, t = this.ctx.currentTime;
    [0, 4, 7, 12, 16].forEach((n, i) => this.musicBox(mtof(K.root + 12 + n), t + i * 0.12, 0.12, this.sfx));
  }
  sparkle() {
    if (!this.ctx) return;
    const K = this.key, t = this.ctx.currentTime;
    [12, 16, 19, 24].forEach((n, i) => this.musicBox(mtof(K.root + 12 + n), t + i * 0.07, 0.08, this.sfx));
  }
  noise(dur, freq, vol, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  shutter() {
    this.noise(0.06, 3000, 0.25, 'highpass');
    setTimeout(() => this.noise(0.08, 2200, 0.18, 'highpass'), 90);
  }
  splash() { this.noise(0.9, 1200, 0.25); }
  bump() { this.noise(0.4, 300, 0.3); }
  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = 1200;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.1);
  }
}
