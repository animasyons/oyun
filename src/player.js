// Keyboard/mouse input, the player's controller and the follow camera.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { heightAt } from './world.js';

export class Input {
  constructor(el) {
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, down: [false, false, false], clicked: [false, false, false] };
    this.el = el; this.locked = false; this.enabled = true;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k); this.pressed.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = [false, false, false]; });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', e => {
      if (!this.locked && this.wantLock) { try { const r = el.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (_) {} }
      this.mouse.down[e.button] = true; this.mouse.clicked[e.button] = true; this.dragging = true;
    });
    addEventListener('mouseup', e => { this.mouse.down[e.button] = false; this.dragging = false; });
    addEventListener('mousemove', e => {
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
      else if (this.dragging && (this.mouse.down[2] || this.mouse.down[1] || this.mouse.down[0] && this.dragLook)) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    this.wantLock = true;
  }
  block(sec) { this.blockUntil = performance.now() + sec * 1000; this.pressed.clear(); this.mouse.clicked = [false, false, false]; }
  get live() { return this.enabled && !(this.blockUntil > performance.now()); }
  down(k) { return this.enabled && this.keys.has(k); }
  hit(k) { return this.live && this.pressed.has(k); }
  click(b) { return this.live && this.mouse.clicked[b]; }
  endFrame() { this.pressed.clear(); this.mouse.clicked = [false, false, false]; this.mouse.dx = 0; this.mouse.dy = 0; }
}

export class Player extends Actor {
  constructor(G, opts) {
    super(G, 'alp', { name: 'Alp', team: 'oba', hp: 100, ...opts });
    this.stamina = 100;
    this.combo = 0; this.comboT = 0; this.queued = -1;
    this.charge = 0;           // sky hammer power 0..100
    this.canPower = false;
    this.controls = true;
    this.floorHp = 0;
    this.onLand = (n, type) => {
      if (this.skyHammer) {
        this.charge = Math.min(100, this.charge + 14 * n);
        const p = this.pos.clone().addScaledVector(this.forward(), 1.4); p.y += 1.1;
        G.fx.skyBurst(p, 10);
      }
      G.hitstop(type === 2 ? 0.09 : 0.05);
    };
    this.afterPose = () => this.handsOnThings();
    this.onHit = (dmg, from, blocked) => { if (!blocked) G.shake(0.18); G.ui.hurt(blocked ? 0.15 : 0.5); };
  }

  mountHorse(h) {
    this.mount = h; h.rider = this; this.solid = false; this.blocking = false; this.dodgeT = 0;
    if (this.carryObj) return;
    this.G.audio.whoosh(this.pos, 0.25);
    const G = this.G;
    if (this === G.player && !G.cutsceneOn && G.ui.hint) {
      G.ui.hint('<b>W</b> yürü · <b>W + Shift</b> dörtnal · <b>A / D</b> dön · <b>S</b> yavaşla · <b>Boşluk</b> sıçra · <b>E</b> in');
      clearTimeout(this.horseHintT); this.horseHintT = setTimeout(() => G.ui.hint(null), 7000);
    }
  }
  dismount() {
    const h = this.mount; if (!h) return;
    h.rider = null; this.mount = null; this.solid = true;
    // the E that got us off must not put us straight back on this frame
    this.G.input.pressed.delete("KeyE"); this.remountAt = performance.now() + 400;
    const side = new THREE.Vector3(Math.cos(h.yaw), 0, -Math.sin(h.yaw)).multiplyScalar(1.3);
    this.pos.set(h.pos.x + side.x, 0, h.pos.z + side.z);
    this.model.position.y = 0;
  }

  update(dt) {
    const G = this.G, I = G.input;
    if (this.mount) {
      const h = this.mount;
      if (this.controls && !this.dead) {
        let throttle = 0, steer = 0;
        if (I.down('KeyW') || I.down('ArrowUp')) throttle = (I.down('ShiftLeft') || I.down('ShiftRight')) ? 2 : 1;
        if (I.down('KeyS') || I.down('ArrowDown')) throttle = -1;
        if (I.down('KeyA') || I.down('ArrowLeft')) steer += 1;
        if (I.down('KeyD') || I.down('ArrowRight')) steer -= 1;
        h.drive(throttle, steer, dt);
        if (I.hit('Space') && h.jump()) G.audio && G.audio.whoosh && G.audio.whoosh(h.pos, 0.3);
        if (this.weapon && (I.click(0) || I.hit('KeyJ')) && this.attack < 0) { this.startAttack(this.combo++ % 2 ? 1 : 0); }
        if (I.hit('KeyE') && Math.abs(h.speed) < 3 && !G.interactBusy) this.dismount();
      } else h.drive(0, 0, dt);
      this.blocking = false; this.pose.guard = true;
      this.stamina = Math.min(100, this.stamina + dt * 22);
      if (this.weaponLight && this.weapon) { const wp = new THREE.Vector3(0, 0.7, 0); this.weapon.localToWorld(wp); G.fx.light(wp, 0x66ccff, 3 + this.charge / 20, 7); }
      if (this.canPower && I.hit('KeyF') && this.charge >= 100 && this.controls) this.gokGurlemesi();
      super.update(dt);
      return;
    }
    if (this.controls && !this.dead) {
      // camera-relative movement
      const f = new THREE.Vector3(-Math.sin(G.cam.yaw), 0, -Math.cos(G.cam.yaw));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const dir = new THREE.Vector3();
      if (I.down('KeyW') || I.down('ArrowUp')) dir.add(f);
      if (I.down('KeyS') || I.down('ArrowDown')) dir.sub(f);
      if (I.down('KeyD') || I.down('ArrowRight')) dir.add(r);
      if (I.down('KeyA') || I.down('ArrowLeft')) dir.sub(r);
      const moving = dir.lengthSq() > 0;
      if (moving) dir.normalize();
      const wasBlocking = this.blocking;
      this.blocking = !!(I.enabled && (I.mouse.down[2] || I.down('KeyK')) && this.weapon && this.attack < 0 && this.dodgeT <= 0 && !this.pose.carry);
      if (this.blocking && !wasBlocking) this.blockStart = performance.now();
      const run = I.down('ShiftLeft') || I.down('ShiftRight');
      let speed = this.blocking ? 1.6 : (run ? 6.2 : 3.4);
      if (this.attack >= 0) speed = 0.6;
      if (this.pose.carry) speed = Math.min(speed, 2.6);
      if (this.dodgeT > 0) { dir.copy(this.dodgeDir); speed = 9 * (this.dodgeT / 0.45) + 2; }
      this.move(dir, moving || this.dodgeT > 0 ? speed : 0, dt);
      if (moving && this.attack < 0 && !this.blocking) {
        let d = Math.atan2(dir.x, dir.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 12);
      }
      if (this.blocking) { // keep facing where the camera looks
        let d = Math.atan2(f.x, f.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 10);
      }
      // jump
      if (I.hit('Space') && this.attack < 0 && !this.pose.carry && this.dodgeT <= 0 && this.stamina >= 8 && this.jump()) {
        this.stamina -= 8; G.audio && G.audio.whoosh && G.audio.whoosh(this.pos, 0.15);
      }
      // dodge roll
      if ((I.hit('KeyC') || I.hit('ControlLeft')) && this.jumpY <= 0 && this.dodgeT <= 0 && this.stamina >= 20 && !this.pose.carry && this.attack < 0) {
        this.dodgeT = 0.45; this.stamina -= 20;
        this.dodgeDir = moving ? dir.clone() : this.forward().multiplyScalar(-1);
        G.fx.dust(this.pos, 8); G.audio && G.audio.whoosh(this.pos, 0.3);
      }
      // attacks: left click chains chop → sweep → slam
      if (this.weapon && !this.pose.carry && (I.click(0) || I.hit('KeyJ'))) {
        if (this.attack < 0) this.doAttack();
        else if (this.attack > 0.35) this.queued = 1;
      }
      if (this.attack < 0 && this.queued > 0) { this.queued = -1; this.doAttack(); }
      // sky hammer power
      if (this.canPower && I.hit('KeyF') && this.charge >= 100) this.gokGurlemesi();
    } else {
      this.move(new THREE.Vector3(), 0, dt); this.blocking = false;
    }
    this.comboT -= dt; if (this.comboT < 0) this.combo = 0;
    this.stamina = Math.min(100, this.stamina + dt * 22);
    if (this.weaponLight && this.weapon) {
      const wp = new THREE.Vector3(0, 0.7, 0); this.weapon.localToWorld(wp);
      G.fx.light(wp, 0x66ccff, 3 + this.charge / 20 + Math.sin(this.time * 9) * 0.6, 7);
    }
    this.pose.guard = true;
    super.update(dt);
  }

  // keep carried things in the hands, and hands on the well crank
  handsOnThings() {
    const rig = this.rig; if (!rig.hand || !rig.hand.R) return;
    const f = this.forward(), right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const down = new THREE.Vector3(0, -1, 0);
    const b = this.carryObj;
    const k = this.pose.pour || 0;
    if (b) {
      if (k > 0.02) {
        // bucket held in front of the chest with both hands on the rim, tipping forward
        b.position.copy(this.pos).add(new THREE.Vector3(0, 0.55 + 0.45 * k, 0)).addScaledVector(f, 0.38 + 0.12 * k);
        b.rotation.set(this.pourTilt || 0, this.yaw, 0, 'YXZ');
        b.updateMatrixWorld(true);
        const sR = b.localToWorld(new THREE.Vector3(-0.31, 0.3, 0)), sL = b.localToWorld(new THREE.Vector3(0.31, 0.3, 0));
        rig.ik('R', sR, down.clone().addScaledVector(right, 0.8));
        rig.ik('L', sL, down.clone().addScaledVector(right, -0.8));
      } else {
        // hanging from the right fist by its handle
        const palm = rig.palm('R');
        b.position.copy(palm).add(new THREE.Vector3(0, -0.36, 0)).addScaledVector(right, 0.04);
        b.rotation.set(0, this.yaw + Math.PI / 2, 0);
      }
    }
    if (this.reachTarget) rig.ik('R', this.reachTarget, down.clone().addScaledVector(right, 0.8));
    if (this.crankTargets) {
      if (this.crankSpin) {
        // turn the drum to this frame's crank angle, then put both palms on the handle
        const sp = this.crankSpin; sp.rotation.x = this.pose.crank || 0; sp.updateMatrixWorld(true);
        this.crankTargets.R = sp.localToWorld(new THREE.Vector3(-1.17, 1.085 - this.crankAxle, 0));
        this.crankTargets.L = sp.localToWorld(new THREE.Vector3(-1.04, 1.085 - this.crankAxle, 0));
        // when the handle swings out of reach, the body leans after it
        const sh = new THREE.Vector3(); rig.b.Upperarm_R.getWorldPosition(sh);
        const reach = 0.5, to = this.crankTargets.R.clone().sub(sh), d = to.length();
        const want = d > reach ? to.multiplyScalar((d - reach) / d) : new THREE.Vector3();
        want.clampLength(0, 0.28);
        const local = want.applyQuaternion(this.obj.quaternion.clone().invert());
        this.leanOff = (this.leanOff || new THREE.Vector3()).lerp(local, 0.5);
        this.model.position.x = this.leanOff.x; this.model.position.z = this.leanOff.z; this.model.position.y += this.leanOff.y;
        this.model.updateMatrixWorld(true);
      }
      rig.ik('R', this.crankTargets.R, down.clone().addScaledVector(right, 0.7));
      rig.ik('L', this.crankTargets.L, down.clone().addScaledVector(right, -0.7));
    }
  }

  doAttack() {
    const G = this.G;
    // soft lock: turn toward the nearest enemy in front
    const foes = G.actors.filter(a => a.alive && a.team !== this.team && a.team !== 'neutral' && (!this.sparring || a === this.sparring));
    let best = null, bd = 4.5;
    const f = new THREE.Vector3(-Math.sin(G.cam.yaw), 0, -Math.cos(G.cam.yaw));
    for (const e of foes) {
      const d = this.distTo(e); if (d > bd) continue;
      const to = new THREE.Vector3(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
      if (to.dot(this.forward()) < -0.2 && to.dot(f) < 0.2) continue;
      best = e; bd = d;
    }
    if (best) this.yaw = this.angleTo(best);
    const type = this.combo % 3;
    if (this.startAttack(type)) { this.combo++; this.comboT = 1.1; }
  }

  gokGurlemesi() {
    const G = this.G;
    this.charge = 0;
    this.invuln = 0.8;
    G.fx.ring(this.pos, 0x9fe8ff, 9, 0.7); G.fx.ring(this.pos, 0xffffff, 6, 0.45);
    G.fx.skyBurst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), 80);
    G.fx.flash(this.pos.clone().add(new THREE.Vector3(0, 3, 0)), 0x9fdcff, 140, 0.5, 40);
    G.shake(0.6); G.audio && G.audio.thunder();
    this.pose.hammerRaise = 1; setTimeout(() => this.pose.hammerRaise = 0, 450);
    for (const e of [...G.actors, ...(G.extraTargets || [])]) {
      if (!e.alive || e.team === this.team || e.team === 'neutral') continue;
      const d = this.distTo(e);
      if (d < 7.5) e.takeHit(55 * (1 - d / 12), this, 9, { sky: true });
    }
    G.ui.toast('Gök Gürlemesi!');
  }
}

// Third-person camera: orbits the player, can be taken over by cutscenes.
export class FollowCam {
  constructor(G) {
    this.G = G; this.yaw = Math.PI; this.pitch = 0.32; this.dist = 5.2;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.shot = null;   // {pos, look, k}
    this.sens = 0.0028;
  }
  update(dt) {
    const G = this.G, I = G.input, cam = G.camera, p = G.player;
    if (I.enabled) {
      this.yaw -= I.mouse.dx * this.sens; this.pitch += I.mouse.dy * this.sens;
      if (I.down('KeyQ')) this.yaw += dt * 2.2;
      if (I.down('KeyE') && false) this.yaw -= dt * 2.2;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.15, 1.1);
    }
    let wantPos, wantLook;
    if (this.shot) {
      wantPos = this.shot.pos; wantLook = this.shot.look;
      const k = this.shot.snap ? 1 : Math.min(1, dt * (this.shot.speed || 2.2));
      this.pos.lerp(wantPos, k); this.look.lerp(wantLook, k);
      if (this.shot.snap) this.shot.snap = false;
    } else if (p) {
      const riding = !!p.mount;
      this.curDist = (this.curDist || this.dist) + ((riding ? 7.8 : this.dist) - (this.curDist || this.dist)) * Math.min(1, dt * 3);
      const target = p.pos.clone().add(new THREE.Vector3(0, riding ? 1.0 : 1.55, 0));
      // while riding, the camera drifts in behind the horse
      if (riding && Math.abs(p.mount.speed) > 2 && !(I.mouse.dx || I.mouse.dy)) {
        let d = (p.mount.yaw + Math.PI) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 1.2);
      }
      const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.curDist);
      // pull in when a collider (palisade, yurt, house) sits between player and camera
      let dist = this.curDist;
      const cols = G.world.colliders || [];
      for (const c of cols) {
        if ((c.r || 1) < 0.45) continue;
        const r = (c.r || 1) + 0.25, dx = c.x - target.x, dz = c.z - target.z;
        if (dx * dx + dz * dz > (dist + r) * (dist + r)) continue;
        const ox = off.x / this.curDist, oz = off.z / this.curDist, hl = Math.hypot(ox, oz) || 1;
        const t = (dx * ox + dz * oz) / (hl * hl); if (t <= 0.3) continue;
        const px = ox * t - dx, pz = oz * t - dz;
        if (px * px + pz * pz < r * r) dist = Math.min(dist, Math.max(1.6, t - r * 0.6));
      }
      this.camDist = (!this.camDist || dist < this.camDist) ? dist : this.camDist + (dist - this.camDist) * Math.min(1, dt * 2.5);
      off.multiplyScalar(this.camDist / this.curDist);
      wantPos = target.clone().add(off);
      const gh = heightAt(wantPos.x, wantPos.z) + 0.4; if (wantPos.y < gh) wantPos.y = gh;
      // shoulder offset
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.45);
      wantPos.add(right); target.add(right);
      this.pos.lerp(wantPos, Math.min(1, dt * 12)); this.look.lerp(target, Math.min(1, dt * 16));
    }
    cam.position.copy(this.pos);
    if (G.shakeT > 0) {
      const s = G.shakeT * 0.35;
      cam.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    cam.lookAt(this.look);
  }
  // snap behind the player
  reset() {
    const p = this.G.player; if (!p) return;
    this.yaw = p.yaw + Math.PI; this.shot = null;
    const t = p.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    this.look.copy(t);
    this.pos.copy(t).add(new THREE.Vector3(Math.sin(this.yaw) * this.dist, 1.6, Math.cos(this.yaw) * this.dist));
  }
}
