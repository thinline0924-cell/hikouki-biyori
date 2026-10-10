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
  }

  place(world, x, z, dirX, dirZ) {
    this.yaw = Math.atan2(dirX, dirZ);
    const s = world.surfaceAt(x, z);
    this.pitch = this.roll = 0;
    if (this.c.seaplane && s.water) {
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
    if (this.c.balloon) this.updateBalloon(dt, inp, world, ev);
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
    this.agl = this.pos.y - s.y;
    this.overWater = s.water;
    this.syncModel(dt);
    return ev;
  }

  updatePlane(dt, inp, world, ev, t) {
    const c = this.c;
    if (this.onWater) return this.updateOnWater(dt, inp, world, ev);

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
      } else {
        this.pos.y = floor + 0.5;
        this.pitch = Math.max(this.pitch, 0.28);
        this.speed = Math.max(this.speed * 0.96, c.min);
        ev.push({ type: s.water ? 'splash' : 'bump' });
      }
    }
    // 地面が近いと、少し自動で上をむく(やさしさ)
    const ahead = world.surfaceAt(this.pos.x + this.vel.x * 1.5, this.pos.z + this.vel.z * 1.5);
    if (this.pos.y < ahead.y + c.clear + 6 && !(c.seaplane && ahead.water)) {
      this.pitch += damp(2.5, dt) * (0.35 - this.pitch) * 0.6;
    }
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
    if (this.c.balloon) {
      this.sway += dt;
      m.root.rotation.set(Math.sin(this.sway * 0.7) * 0.03, this.yaw, Math.sin(this.sway * 0.53) * 0.03, 'YXZ');
      if (m.flame) {
        m.flame.visible = this.burner;
        m.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      }
    } else {
      m.root.rotation.set(-this.pitch, this.yaw, this.roll, 'YXZ');
    }
    for (const p of m.props) {
      const rate = this.onWater && this.speed < 1 ? 8 : 25 + this.throttle * 30;
      p.rotation.z += rate * dt;
      p.userData.blades.visible = rate < 30 || Math.random() < 0.5;
      p.userData.disc.material.opacity = clamp((rate - 10) / 60, 0.05, 0.22);
    }
  }
}
