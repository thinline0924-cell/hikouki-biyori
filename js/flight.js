// 飛び方(やさしい物理):ぶつかっても落ちない、手をはなすと水平にもどる
import * as THREE from 'three';
import { clamp, damp, smooth, wrapAngle } from './util.js';
import { LIMIT } from './world.js';

export class Flyer {
  constructor(craft, model) {
    this.c = craft;
    this.model = model;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = craft.cruise;
    this.vy = 0;
    this.heat = 0.5;
    this.onWater = false;
    this.landed = false;
    this.throttle = 0.5;
    this.burner = false;
    this.agl = 100; // 地面(水面)からの高さ
    this.sway = 0;
    // 地上ののりもの用
    this.gNormal = new THREE.Vector3(0, 1, 0);
    this.vy = 0;
    this.airborne = false;
    this.odo = 0;
    // 滑走路・地面の上の飛行機
    this.onGround = false;
    this.winch = 0;
    this.gearT = 1; // 1 = 車輪が出ている
    this.stopped = true;
  }

  place(world, x, z, dirX, dirZ, onGround = false) {
    this.yaw = Math.atan2(dirX, dirZ);
    const s = world.surfaceAt(x, z);
    this.pitch = this.roll = 0;
    this.onGround = this.onWater = false;
    this.winch = 0;
    if (onGround && this.c.gearH && !s.water) {
      this.pos.set(x, s.y + this.c.gearH, z);
      this.onGround = true;
      this.stopped = true;
      this.speed = 0;
      this.pitch = this.c.groundPitch || 0;
      this.gearT = 1;
      this.throttle = 0.15;
    } else if (this.c.balloon && onGround) {
      this.pos.set(x, s.y, z);
      this.vy = 0;
      this.heat = 0.5;
      this.landed = true;
    } else if (this.c.ground) {
      this.pos.set(x, s.y, z);
      this.speed = 0;
      this.vy = 0;
      this.airborne = false;
    } else if (this.c.seaplane && s.water) {
      this.pos.set(x, s.y + this.c.clear, z);
      this.onWater = true;
      this.speed = 0;
    } else if (this.c.balloon) {
      this.pos.set(x, s.y + 60, z);
      this.vy = 0;
      this.heat = 0.5;
    } else {
      this.pos.set(x, s.y + 70, z);
      this.speed = this.c.cruise;
    }
    this.syncModel();
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  // inp: { pitch(+で上), roll(+で右), yaw, boost, down }
  update(dt, inp, world, t) {
    const ev = [];
    if (this.c.ground) this.updateGround(dt, inp, world, ev);
    else if (this.c.balloon) this.updateBalloon(dt, inp, world, ev);
    else this.updatePlane(dt, inp, world, ev, t);

    // 世界のはしでは、やさしく中心へ向きをかえる
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > LIMIT) {
      const k = smooth(LIMIT, LIMIT + 220, r);
      if (this.c.balloon) {
        this.pos.x -= (this.pos.x / r) * k * 12 * dt;
        this.pos.z -= (this.pos.z / r) * k * 12 * dt;
      } else {
        const want = Math.atan2(-this.pos.x, -this.pos.z);
        this.yaw += wrapAngle(want - this.yaw) * damp(0.9 * k, dt);
      }
      ev.push({ type: 'edge' });
    }
    const s = world.surfaceAt(this.pos.x, this.pos.z);
    this.agl = this.c.ground ? 0 : this.pos.y - s.y;
    this.overWater = s.water;
    this.syncModel(dt);
    return ev;
  }

  updatePlane(dt, inp, world, ev, t) {
    const c = this.c;
    if (this.onWater) return this.updateOnWater(dt, inp, world, ev);
    if (this.onGround) return this.updateOnGround(dt, inp, world, ev);

    // 傾き(ロール):手をはなすと水平にもどる
    this.roll += (inp.roll * c.maxRoll - this.roll) * damp(c.rollRate, dt);
    // 機首の上げ下げ(ピッチ):手をはなすと、ゆっくり水平へ
    if (Math.abs(inp.pitch) > 0.05) this.pitch += inp.pitch * c.pitchRate * dt;
    else this.pitch += -this.pitch * damp(0.7, dt);
    this.pitch = clamp(this.pitch, -0.85, 0.85);
    // 高すぎたら機首をさげる
    if (this.pos.y > 1500) this.pitch -= (this.pos.y - 1500) * 0.002 * dt;
    // 旋回
    this.yaw -= (Math.sin(this.roll) * c.turn + inp.yaw * 0.3) * dt;

    // 速さ
    if (c.glider) {
      this.speed += (-9.8 * Math.sin(this.pitch) - 0.05 * (this.speed - c.cruise)) * dt;
      this.speed = clamp(this.speed, 12, c.max);
      this.throttle = 0;
    } else {
      const target = inp.boost ? c.boost : c.cruise;
      this.throttle += ((inp.boost ? 1 : 0.45) - this.throttle) * damp(2, dt);
      this.speed += (target - this.speed) * damp(0.45, dt) - 9.8 * Math.sin(this.pitch) * 0.45 * dt;
      this.speed = clamp(this.speed, c.min * 0.85, c.boost * 1.2);
    }
    // 遅すぎると機首がさがる(失速のかわり)
    if (this.speed < c.min) this.pitch -= (c.min - this.speed) * 0.06 * dt;

    this.forward(this.vel).multiplyScalar(this.speed);
    let lift = 0;
    if (c.glider) {
      // グライダーはゆっくり沈み、上昇気流でのぼる
      const sink = 0.9 + 0.0012 * (this.speed - c.cruise) ** 2;
      lift = world.thermalLift(this.pos) - sink;
    } else {
      lift = world.thermalLift(this.pos) * 0.15;
    }
    this.vel.y += lift;
    this.liftNow = lift;
    this.pos.addScaledVector(this.vel, dt);

    // 地面・水面
    const s = world.surfaceAt(this.pos.x, this.pos.z);
    const floor = s.y + c.clear;
    if (this.pos.y < floor) {
      if (s.water && c.seaplane && this.vel.y > -7 && Math.abs(this.roll) < 0.5) {
        this.onWater = true;
        this.pos.y = floor;
        this.pitch = 0;
        ev.push({ type: 'splashdown' });
      } else if (!s.water && c.gearH && (!this.model?.gear || this.gearT > 0.9) && this.vel.y > -5.5 && Math.abs(this.roll) < 0.4 &&
        this.pitch > -0.22 && this.pitch < 0.5 && world.normalYAt(this.pos.x, this.pos.z) > 0.94) {
        // 着陸:ゆっくり降りて、機体が水平に近ければ地面につける
        const sink = -this.vel.y;
        this.onGround = true;
        this.stopped = false;
        this.pos.y = floor;
        this.roll = 0;
        ev.push({ type: 'touchdown', sink, runway: !!(world.runway && world.runway.onRunway(this.pos.x, this.pos.z)) });
        return;
      } else {
        this.pos.y = floor + 0.5;
        this.pitch = Math.max(this.pitch, 0.28);
        this.speed = Math.max(this.speed * 0.96, c.min);
        ev.push({ type: s.water ? 'splash' : 'bump' });
      }
    }
    // 建物などにぶつかったら、よけて上へ
    if (world.collide(this.pos, 3, false)) {
      this.pitch = Math.max(this.pitch, 0.3);
      ev.push({ type: 'bump' });
    }
    // 山や崖が目の前にせまったときだけ、少し自動で上をむく(着陸のじゃまはしない)
    const ahead = world.surfaceAt(this.pos.x + this.vel.x * 1.5, this.pos.z + this.vel.z * 1.5);
    if (this.pos.y < ahead.y + c.clear + 6 && ahead.y - s.y > 4 && !(c.seaplane && ahead.water)) {
      this.pitch += damp(2.5, dt) * (0.35 - this.pitch) * 0.6;
    }
    // 車輪:低くゆっくり飛ぶと出る
    const wantGear = this.agl < 90 && this.speed < c.cruise * 1.2 ? 1 : 0;
    this.gearT += clamp(wantGear - this.gearT, -dt * 0.6, dt * 0.6);
  }

  // 滑走路(地面)の上:↑ でエンジンを上げて走り、速くなったら ↑ で離陸。↓ でブレーキ
  updateOnGround(dt, inp, world, ev) {
    const c = this.c;
    const vr = c.vr;
    let target = Math.min(this.speed, 7), rate = 1.6;
    let thr = 0.15;
    if (c.glider) {
      // グライダーはウインチ(地上の巻き上げ機)で引っぱってもらう
      if (inp.boost && this.speed < 3 && this.winch <= 0) { this.winch = 6; ev.push({ type: 'winch' }); }
      if (this.winch > 0) { this.winch -= dt; target = 34; rate = 9; }
      else target = 0;
    } else if (inp.boost) { target = c.boost; rate = c.gacc; thr = 1; }
    else if (inp.pitch > 0.15) { target = c.cruise; rate = c.gacc * 0.75; thr = 0.75; }
    if (inp.pitch < -0.3) { target = 0; rate = 7; thr = 0.1; }
    this.throttle += (thr - this.throttle) * damp(2, dt);
    this.speed += clamp(target - this.speed, -rate * dt, rate * dt);
    if (this.speed < 0.3 && !this.stopped && target === 0) {
      this.stopped = true;
      ev.push({ type: 'stopped' });
    }
    if (this.speed > 2) this.stopped = false;
    // 前輪(後輪)で向きをかえる
    const k = clamp(this.speed / 6, 0.25, 1) * (1 - clamp(this.speed / (vr * 2.2), 0, 0.6));
    this.yaw -= (inp.roll * 0.7 * k + inp.yaw * 0.3) * dt;
    this.roll += (0 - this.roll) * damp(6, dt);
    const rotate = (inp.pitch > 0.2 || this.winch > 0) && this.speed > vr * 0.8;
    this.pitch += ((rotate ? 0.14 : c.groundPitch || 0) - this.pitch) * damp(3, dt);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const s = world.surfaceAt(nx, nz);
    if (s.water) {
      if (this.speed > 3) ev.push({ type: 'shore' });
      this.speed = 0;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
      this.pos.y = s.y + c.gearH + (this.speed > 3 ? Math.sin(this.odo * 0.7) * 0.03 : 0);
      this.odo += this.speed * dt;
      if (world.normalYAt(nx, nz) < 0.86 && this.speed > 6) {
        ev.push({ type: 'bump' });
        this.speed *= 0.97;
      }
    }
    if (world.collide(this.pos, 4)) {
      if (this.speed > 4) ev.push({ type: 'crash' });
      this.speed *= 0.3;
    }
    this.forward(this.vel).multiplyScalar(this.speed);
    this.liftNow = 0;
    // 離陸
    if (this.speed > vr && (inp.pitch > 0.2 || (c.glider && this.winch > 0))) {
      this.onGround = false;
      this.pitch = Math.max(this.pitch, 0.16);
      this.pos.y += 0.4;
      if (c.glider) { this.pitch = 0.35; this.winch = 0; }
      ev.push({ type: 'liftoff' });
    }
  }

  // 地上ののりもの(車・原付):↑アクセル ↓ブレーキ・バック ←→ハンドル
  groundY(world, x, z, y) {
    const s = world.surfaceAt(x, z);
    const deck = world.deckAt(x, z, y);
    if (deck !== null && (s.water || deck > s.y - 0.5)) return { y: deck, deck: true };
    if (s.water) return null;
    return { y: s.y, deck: false };
  }

  updateGround(dt, inp, world, ev) {
    const c = this.c;
    const top = inp.boost ? c.boost : c.top;
    const pedal = inp.pitch;
    let target = 0, rate = 2.5;
    if (pedal > 0.1) { target = top * pedal; rate = c.accel * (inp.boost ? 1.3 : 1); }
    else if (pedal < -0.1) {
      if (this.speed > 0.5) { target = 0; rate = 14; } else { target = -6 * -pedal; rate = 4; }
    }
    if (!this.airborne) this.speed += clamp(target - this.speed, -rate * dt, rate * dt);
    this.throttle = clamp(Math.max(pedal, 0) * (inp.boost ? 1 : 0.8), 0, 1);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // 坂道:のぼりは遅く、くだりは速く
    if (!this.airborne) {
      const a = this.groundY(world, this.pos.x + fx * 1.5, this.pos.z + fz * 1.5, this.pos.y);
      const b = this.groundY(world, this.pos.x - fx * 1.5, this.pos.z - fz * 1.5, this.pos.y);
      if (a && b) {
        const sl = (a.y - b.y) / 3;
        this.speed -= 9.8 * (sl / Math.sqrt(1 + sl * sl)) * 0.75 * dt;
      }
    }
    // ハンドル
    const sp = Math.abs(this.speed);
    const k = clamp(sp / 5, 0, 1) * (1 - 0.4 * clamp(sp / c.boost, 0, 1));
    if (!this.airborne) this.yaw -= c.steer * inp.roll * k * Math.sign(this.speed || 1) * dt * 1.6;
    // 原付はかたむく、車は少しゆれる
    const leanT = c.id === 'scooter' ? inp.roll * clamp(sp / 9, 0, 1) * 0.5 : -inp.roll * clamp(sp / 15, 0, 1) * 0.05;
    this.roll += (leanT - this.roll) * damp(5, dt);
    this.pitch = 0;

    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const g = this.groundY(world, nx, nz, this.pos.y);
    if (!g) {
      if (sp > 3) ev.push({ type: 'shore' });
      this.speed = 0;
    } else if (!this.airborne && g.y - this.pos.y > 1.6 && !g.deck) {
      // 急ながけはのぼれない
      this.speed *= -0.2;
      if (sp > 4) ev.push({ type: 'crash' });
    } else {
      const moved = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.odo += moved;
      this.pos.x = nx;
      this.pos.z = nz;
      if (this.airborne) {
        this.vy -= 9.8 * 1.5 * dt;
        this.pos.y += this.vy * dt;
        if (this.pos.y <= g.y) {
          if (this.vy < -7) ev.push({ type: 'land' });
          this.pos.y = g.y;
          this.vy = 0;
          this.airborne = false;
        }
      } else if (g.y < this.pos.y - 1.0 && sp > 9) {
        // 坂のてっぺんで、ふわっと浮く
        this.airborne = true;
        this.vy = this.gvy || 0;
      } else {
        this.gvy = (g.y - this.pos.y) / Math.max(dt, 0.001);
        this.pos.y = g.y;
      }
    }
    // ぶつかる物(建物・木・小物)
    const hit = world.collide(this.pos, c.rad);
    if (hit) {
      if (sp > 4) ev.push({ type: 'crash' });
      this.speed *= 0.4;
    }
    // 地面の傾き(車体の向き)
    if (!this.airborne) {
      const e = 1.6;
      const h = (x, z) => { const q = this.groundY(world, x, z, this.pos.y); return q ? q.y : this.pos.y; };
      const dx = h(this.pos.x + e, this.pos.z) - h(this.pos.x - e, this.pos.z);
      const dz = h(this.pos.x, this.pos.z + e) - h(this.pos.x, this.pos.z - e);
      const n = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
      this.gNormal.lerp(n, damp(10, dt)).normalize();
    }
    this.vel.set(fx * this.speed, this.vy, fz * this.speed);
  }

  updateOnWater(dt, inp, world, ev) {
    const c = this.c;
    const target = inp.boost ? c.boost : inp.pitch > 0.2 ? c.takeoff + 2 : 10;
    this.throttle += ((inp.boost ? 1 : inp.pitch > 0.2 ? 0.8 : 0.2) - this.throttle) * damp(2, dt);
    this.speed += (target - this.speed) * damp(0.35, dt);
    this.yaw -= inp.roll * 0.7 * dt * clamp(this.speed / 10, 0.3, 1);
    this.roll += (inp.roll * 0.08 - this.roll) * damp(3, dt);
    this.pitch += ((this.speed > c.takeoff * 0.8 ? 0.06 : 0) - this.pitch) * damp(2, dt);
    this.forward(this.vel).multiplyScalar(this.speed);
    this.vel.y = 0;
    this.pos.addScaledVector(this.vel, dt);
    const s = world.surfaceAt(this.pos.x, this.pos.z);
    if (!s.water) {
      // 岸にぶつかったら止まって向きをかえる
      this.pos.addScaledVector(this.vel, -dt * 2);
      this.speed = 0;
      this.yaw += Math.PI * 0.5 * dt * 4;
      ev.push({ type: 'shore' });
    }
    this.pos.y = s.y + c.clear + Math.sin(performance.now() * 0.002) * 0.15;
    if (this.speed > c.takeoff && inp.pitch > 0.2) {
      this.onWater = false;
      this.pitch = 0.2;
      this.pos.y += 1;
      ev.push({ type: 'takeoff' });
    }
  }

  updateBalloon(dt, inp, world, ev) {
    // バーナー:Shift か ↑ / 弁:↓
    this.burner = !!(inp.boost || inp.pitch > 0.3);
    if (this.burner) this.heat += 0.32 * dt;
    else if (inp.pitch < -0.3) this.heat -= 0.4 * dt;
    else this.heat += (0.5 - this.heat) * damp(0.08, dt);
    this.heat = clamp(this.heat, 0, 1);
    const ay = (this.heat - 0.5) * 6 - this.vy * 0.6;
    this.vy += ay * dt;
    if (this.pos.y > 1400) this.vy = Math.min(this.vy, 0);

    const w = world.windAt(this.pos.y);
    // 風の向きに対して左右へ、ほんの少しだけ動ける
    const rx = -Math.cos(w.a), rz = Math.sin(w.a);
    const want = new THREE.Vector3(w.x + rx * inp.roll * 3, 0, w.z + rz * inp.roll * 3);
    this.vel.x += (want.x - this.vel.x) * damp(0.5, dt);
    this.vel.z += (want.z - this.vel.z) * damp(0.5, dt);
    this.vel.y = this.vy;
    if (this.landed) {
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }
    this.pos.addScaledVector(this.vel, dt);
    this.drift = Math.hypot(this.vel.x, this.vel.z) * dt;
    const s = world.surfaceAt(this.pos.x, this.pos.z);
    // 地面の傾きで急に高くなったときも、下にもぐらない
    if (this.pos.y < s.y) {
      if (!this.landed && this.vy < -1.5) ev.push({ type: s.water ? 'splash' : 'bump' });
      this.pos.y = s.y;
      this.vy = Math.max(this.vy, 0);
      this.landed = true;
    } else if (this.pos.y > s.y + 0.5) {
      this.landed = false;
    }
    // かごの向きは、ゆっくり風下へ
    const wantYaw = Math.atan2(this.vel.x, this.vel.z) + inp.yaw * 0.6;
    this.yaw += wrapAngle(wantYaw - this.yaw) * damp(0.3, dt);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.throttle = this.heat;
  }

  syncModel(dt = 0) {
    const m = this.model;
    if (!m) return;
    m.root.position.copy(this.pos);
    if (this.c.ground) {
      const up = this.gNormal;
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      f.addScaledVector(up, -f.dot(up)).normalize();
      const x = new THREE.Vector3().crossVectors(up, f);
      m.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, f));
      if (m.lean) m.lean.rotation.z = this.roll;
      if (m.body) m.body.rotation.z = this.roll;
      for (const w of m.wheels) w.rotation.x += (this.speed / m.wheelR) * dt;
    } else if (this.c.balloon) {
      this.sway += dt;
      m.root.rotation.set(Math.sin(this.sway * 0.7) * 0.03, this.yaw, Math.sin(this.sway * 0.53) * 0.03, 'YXZ');
      if (m.flame) {
        m.flame.visible = this.burner;
        m.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      }
    } else {
      m.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
      if (m.gear) {
        m.gear.visible = this.gearT > 0.02;
        m.gear.scale.y = this.gearT;
      }
    }
    for (const p of m.props) {
      const rate = this.onWater && this.speed < 1 ? 8 : 25 + this.throttle * 30;
      p.rotation.z += rate * dt;
      p.userData.blades.visible = rate < 30 || Math.random() < 0.5;
      p.userData.disc.material.opacity = clamp((rate - 10) / 60, 0.05, 0.22);
    }
  }
}
