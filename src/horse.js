// Boz and other rideable horses: animated model, steering, and a saddle for the rider.
import * as THREE from 'three';
import { heightAt } from './world.js';

export class Horse {
  constructor(G, key, pos, yaw = 0) {
    this.G = G;
    this.obj = new THREE.Group(); this.obj.userData.dynamic = true;
    this.model = G.assets.char(key);
    this.obj.add(this.model);
    G.scene.add(this.obj);
    this.pos = this.obj.position; this.pos.copy(pos); this.pos.y = heightAt(pos.x, pos.z);
    this.yaw = yaw; this.speed = 0; this.radius = 0.9; this.rider = null;
    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = G.assets.anims(key);
    this.act = {};
    for (const n of ['Idle', 'Walk', 'Run']) {
      const c = clips.find(x => x.name === n); if (!c) continue;
      const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); this.act[n] = a;
    }
    // which way does the model face? measure head vs pelvis once
    this.model.updateMatrixWorld(true);
    const find = n => { let b = null; this.model.traverse(o => { if (!b && o.name === n) b = o; }); return b; };
    this.headB = find('head'); this.backB = find('spine.004') || find('spine.003') || find('abdomen');
    const hp = new THREE.Vector3(), bp = new THREE.Vector3();
    if (this.headB && this.backB) {
      this.headB.getWorldPosition(hp); this.backB.getWorldPosition(bp);
      this.model.worldToLocal(hp); this.model.worldToLocal(bp);
      this.modelYaw = -Math.atan2(hp.x - bp.x, hp.z - bp.z);
    } else this.modelYaw = 0;
    this.model.rotation.y = this.modelYaw;
    this.stepT = 0;
    this.target = null;   // AI: walk to a point
    this.obj.rotation.y = this.yaw;
  }

  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  distTo(o) { const p = o.pos || o; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  // world position where the rider sits
  saddle(out = new THREE.Vector3()) {
    if (this.backB) { this.backB.getWorldPosition(out); out.y += 0.18; }
    else out.copy(this.pos).add(new THREE.Vector3(0, 1.3, 0));
    return out;
  }

  // throttle: -0.3 .. 1 (walk) .. 2 (gallop); steer: -1 .. 1
  drive(throttle, steer, dt) {
    const want = throttle >= 1.5 ? 11.5 : throttle > 0.05 ? 4.2 * Math.min(1, throttle) : throttle < -0.05 ? -1.6 : 0;
    const acc = want > this.speed ? 4.5 : 7;
    this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), acc * dt);
    const turnRate = 1.9 - Math.min(1.1, Math.abs(this.speed) * 0.08);
    this.yaw += steer * turnRate * dt * (Math.abs(this.speed) > 0.2 ? 1 : 0.6);
  }

  update(dt) {
    const G = this.G;
    if (!this.rider && this.target) { // led by the story: walk to a point
      const d = this.distTo(this.target);
      if (d > 0.8) {
        let a = Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z) - this.yaw; a = Math.atan2(Math.sin(a), Math.cos(a));
        this.drive(this.targetRun ? 2 : 1, Math.max(-1, Math.min(1, a * 2)), dt);
      } else { this.drive(0, 0, dt); if (Math.abs(this.speed) < 0.1) this.target = null; }
    } else if (!this.rider) this.drive(0, 0, dt);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt; this.pos.z += f.z * this.speed * dt;
    const before = this.pos.clone();
    G.world.collide(this.pos, this.radius);
    // pushed sideways by a tree or a yurt: lose some speed, and if led, steer around it
    const pushed = before.distanceTo(this.pos);
    if (pushed > 0.02) { this.speed *= 0.92; if (!this.rider && this.target) this.yaw += 0.08; }
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    if (this.jumpY > 0 || this.jumpV > 0) {
      this.jumpV -= 18 * dt; this.jumpY += this.jumpV * dt;
      if (this.jumpY <= 0) { this.jumpY = this.jumpV = 0; G.fx.dust(this.pos, 12); G.audio && G.audio.hoof && G.audio.hoof(this.pos, true); G.shake && G.shake(0.12); }
      this.pos.y += this.jumpY;
      // tuck: pitch the body up on the way up, nose down on the way down
      this.model.rotation.x = 0;
      this.obj.rotation.x = -THREE.MathUtils.clamp(this.jumpV * 0.035, -0.25, 0.25);
    } else this.obj.rotation.x *= 0.8;
    this.obj.rotation.y = this.yaw;
    // gait blend
    const s = Math.abs(this.speed);
    const wI = Math.max(0, 1 - s / 1.5), wR = THREE.MathUtils.clamp((s - 5) / 4, 0, 1), wW = Math.max(0, 1 - wI - wR);
    if (this.act.Idle) this.act.Idle.setEffectiveWeight(wI);
    if (this.act.Walk) { this.act.Walk.setEffectiveWeight(wW); this.act.Walk.timeScale = Math.max(0.5, s / 3.5) * Math.sign(this.speed || 1); }
    if (this.act.Run) { this.act.Run.setEffectiveWeight(wR); this.act.Run.timeScale = Math.max(0.7, s / 10); }
    if (this.culled) this.mixDt = (this.mixDt || 0) + dt; else { this.mixer.update(dt + (this.mixDt || 0)); this.mixDt = 0; }
    // hooves
    if (s > 0.6) {
      this.stepT -= dt * (s > 6 ? 4.2 : 2.6 * s / 3.5);
      if (this.stepT <= 0) { this.stepT = 1; G.audio && G.audio.hoof && G.audio.hoof(this.pos, s > 6); if (s > 6 && Math.random() < 0.5) G.fx.dust(this.pos, 3); }
    }
  }

  jump() {
    if (this.jumpY > 0 || this.jumpV > 0 || this.speed < 1.5) return false;
    this.jumpV = 6.2; this.jumpY = 0.001; return true;
  }

  remove() { this.G.scene.remove(this.obj); }
}
