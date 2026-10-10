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

    // エンジン
    this.engF = ctx.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.frequency.value = 500;
    this.engG = ctx.createGain();
    this.engG.gain.value = 0;
    this.engF.connect(this.engG).connect(this.sfx);
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const o2g = ctx.createGain();
    o2g.gain.value = 0.4;
    this.osc1.connect(this.engF);
    this.osc2.connect(o2g).connect(this.engF);
    this.osc1.start();
    this.osc2.start();
    // ジェットのごう音
    const jet = ctx.createBufferSource();
    jet.buffer = nb;
    jet.loop = true;
    this.jetF = ctx.createBiquadFilter();
    this.jetF.type = 'bandpass';
    this.jetF.frequency.value = 900;
    this.jetF.Q.value = 1.2;
    this.jetG = ctx.createGain();
    this.jetG.gain.value = 0;
    jet.connect(this.jetF).connect(this.jetG).connect(this.sfx);
    jet.start();
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

  // 飛んでいる間、毎フレーム
  flight({ speed = 0, throttle = 0, engine = 'none', pitch = 60, burner = false, cloud = 0, active = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = active ? 1 : 0;
    this.windF.frequency.setTargetAtTime(250 + speed * 9 + cloud * 300, t, 0.2);
    this.windG.gain.setTargetAtTime(k * (0.015 + Math.min(speed, 130) * 0.0011 + cloud * 0.05), t, 0.3);
    const prop = engine === 'prop';
    const f = pitch * (0.85 + throttle * 0.45);
    this.osc1.frequency.setTargetAtTime(f, t, 0.15);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.15);
    this.engF.frequency.setTargetAtTime(380 + throttle * 600, t, 0.2);
    this.engG.gain.setTargetAtTime(k * (prop ? 0.035 + throttle * 0.03 : engine === 'jet' ? 0.012 : 0), t, 0.2);
    this.jetG.gain.setTargetAtTime(k * (engine === 'jet' ? 0.05 + throttle * 0.05 : 0), t, 0.3);
    this.jetF.frequency.setTargetAtTime(700 + throttle * 700, t, 0.3);
    this.burG.gain.setTargetAtTime(k * (burner ? 0.16 : 0), t, 0.06);
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
