// A person in the world: model + procedural rig + health + simple physics.
import * as THREE from 'three';
import { Cape } from './cloth.js';
import { Rig, gait } from './rig.js';
import { heightAt } from './world.js';
import { ATTACK_KEYS } from './rig.js';

// how far the striking end sits from the grip, per weapon
const REACH = { hammer: 0.62, hammer10: 0.7, gokcekic: 0.72, stick: 1.05, sword: 1.0, shortsword: 0.75, axe: 0.6, rake: 1.2, fork: 1.2 };

const ATTACKS = [
  { dur: 0.55, hitAt: 0.45, dmg: 12, reach: 2.1, arc: 1.2, knock: 2.5 },   // chop
  { dur: 0.6, hitAt: 0.48, dmg: 11, reach: 2.3, arc: 2.2, knock: 3.5 },    // sweep (hits several)
  { dur: 0.95, hitAt: 0.55, dmg: 24, reach: 2.4, arc: 1.5, knock: 6 },     // overhead slam
];
export { ATTACKS };

export class Actor {
  constructor(G, key, opts = {}) {
    this.G = G;
    this.key = key;
    this.name = opts.name || key;
    this.team = opts.team || 'oba';
    this.obj = new THREE.Group(); this.obj.userData.dynamic = true;
    this.model = G.assets.char(key);
    const sc = opts.scale || 1;
    this.model.scale.multiplyScalar(sc);
    this.obj.add(this.model);
    G.scene.add(this.obj);
    this.rig = new Rig(this.model);
    this.radius = 0.38 * sc;
    this.height = 1.75 * sc;
    this.pos = this.obj.position;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = opts.yaw || 0;
    this.maxHp = opts.hp || 50; this.hp = this.maxHp;
    this.jumpY = 0; this.jumpV = 0; this.landT = 0;
    this.speedK = 0; this.phase = Math.random() * 6; this.time = Math.random() * 10;
    this.attack = -1; this.attackType = 0; this.attackDone = false; this.atkMul = opts.atkMul || 1;
    this.hitT = 0; this.dead = false; this.deadT = 0; this.dodgeT = 0; this.blocking = false;
    this.invuln = 0; this.flashT = 0;
    this.pose = {};  // extra pose flags (talk, carry, kneel, cheer, guard...)
    this.mats = [];
    this.model.traverse(o => { if (o.isMesh) { this.mats.push(o.material); o.material.emissive = o.material.emissive || new THREE.Color(); } });
    if (opts.weapon) this.setWeapon(opts.weapon, opts.weaponOffset);
    if (opts.helmet) this.setHelmet(opts.helmet, opts.helmetScale, opts.helmetLift);
    if (opts.pos) this.pos.copy(opts.pos);
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.obj.rotation.y = this.yaw;
    this.solid = true;
    this.hpBar = null;
    if (opts.hpBar) this.makeHpBar(opts.boss);
  }

  setWeapon(key, offset = 0.22, glow) {
    if (this.weapon) this.weapon.parent.remove(this.weapon);
    this.weapon = null; this.weaponKey = key;
    if (!key) return;
    let w;
    if (key === 'stick') {
      w = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }));
      w.geometry.translate(0, 0.6, 0); w.castShadow = true;
      w = new THREE.Group().add(w);
    } else {
      w = this.G.assets.prop(key);
      if (key === 'sword' || key === 'shortsword') { w.scale.multiplyScalar(0.85); offset = 0.32; }
    }
    this.rig.attach('Hand_R', w, new THREE.Vector3(0, 0, 1), offset);
    this.weapon = w;
    if (glow) {
      w.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x3ab8ff); o.material.emissiveIntensity = 0.5; } });
      this.weaponLight = { i: 3 };
    }
  }

  setHelmet(key, scale = 0.56, lift = 0.13) {
    const h = this.G.assets.prop(key);
    h.scale.multiplyScalar(scale);
    // helmets were modelled around a head at the origin; keep them upright
    const head = this.rig.b.Head;
    if (!head) return;
    const ws = new THREE.Vector3(); head.getWorldScale(ws);
    const rs = new THREE.Vector3(); this.model.getWorldScale(rs);
    h.scale.multiplyScalar(rs.x / ws.x);
    const restW = this.rig.restW.Head;
    h.quaternion.copy(restW.clone().invert());
    h.position.copy(new THREE.Vector3(0, lift, 0).applyQuaternion(restW.clone().invert()).multiplyScalar(1 / ws.x * rs.x));
    head.add(h);
    this.helmet = h;
  }

  // Bars' old armour from the chest: shoulder guards and a blue felt cape
  clearOutfit() {
    for (const o of this.outfitParts || []) o.parent && o.parent.remove(o);
    if (this.cape) this.cape.dispose();
    this.outfitParts = []; this.outfit = null; this.cape = null;
  }

  setOutfit(name) {
    if (name !== 'gok' || this.outfit === 'gok') return;
    this.outfit = 'gok';
    const pads = this.G.assets.prop('shoulderpads');
    pads.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x8a96a4); o.material.metalness = 0.6; o.material.roughness = 0.4; } });
    // fit to this body: centre between the shoulder joints, scaled to shoulder width
    {
      const rig = this.rig; rig.reset(); rig.root.updateMatrixWorld(true);
      const P = n => { const v = new THREE.Vector3(); rig.b[n].getWorldPosition(v); return rig.root.worldToLocal(v); };
      const L = P('Upperarm_L'), R = P('Upperarm_R'), mid = L.clone().add(R).multiplyScalar(0.5);
      const box = new THREE.Box3().setFromObject(pads), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      const k = (L.distanceTo(R) + 0.2) / Math.max(size.x, size.z, 1e-3);
      pads.scale.setScalar(k);
      pads.position.set(mid.x - c.x * k, mid.y + 0.06 - c.y * k, mid.z - c.z * k);
    }
    this.rig.attachModelSpace('Spine_03', pads);
    // cape: felt with a gold zigzag border, like a yurt band
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#23406e'; x.fillRect(0, 0, 64, 128);
    x.strokeStyle = '#d9a441'; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= 8; i++) x.lineTo(i * 8, 116 + (i % 2 ? 6 : 0)); x.stroke();
    x.fillStyle = '#d9a441'; x.fillRect(0, 0, 64, 4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide, roughness: 0.95 });
    this.cape = new Cape(this, mat, 0.5, 0.98);
    this.outfitParts = [pads];
  }

  setBow() {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.018, 4, 18, Math.PI * 0.8), new THREE.MeshLambertMaterial({ color: 0x5a3a1c }));
    arc.rotation.z = Math.PI / 2 - Math.PI * 0.4; arc.position.x = -0.42;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.05, 3), new THREE.MeshBasicMaterial({ color: 0xe8e0c8 }));
    str.position.x = -0.1;
    g.add(arc, str);
    const holder = new THREE.Group(); holder.add(g); g.rotation.y = Math.PI / 2;
    this.rig.attach('Hand_L', holder, new THREE.Vector3(0, 0, 1), 0);
    this.bow = holder;
  }

  makeHpBar(boss) {
    const g = new THREE.Group();
    const w = boss ? 1.4 : 0.9;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.09), new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.7, depthTest: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.09), new THREE.MeshBasicMaterial({ color: boss ? 0xe0a030 : 0xc8452a, depthTest: false }));
    fg.position.z = 0.001; bg.renderOrder = 5; fg.renderOrder = 6;
    g.add(bg, fg); g.position.y = this.height + 0.35;
    this.obj.add(g); this.hpBar = { g, fg, w };
    g.visible = false;
  }

  get alive() { return !this.dead; }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  distTo(o) { const p = o.pos || o; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  angleTo(o) { const p = o.pos || o; return Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  faceTo(o, dt, rate = 10) {
    const target = this.angleTo(o);
    let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  // desired horizontal velocity; physics integrates it
  move(dir, speed, dt) {
    const k = Math.min(1, dt * 10);
    this.vel.x += (dir.x * speed - this.vel.x) * k;
    this.vel.z += (dir.z * speed - this.vel.z) * k;
  }

  startAttack(type = 0) {
    if (this.attack >= 0 || this.dead || this.hitT > 0.3) return false;
    this.attack = 0; this.attackType = type; this.attackDone = false;
    this.G.audio && this.G.audio.whoosh(this.pos, type === 2 ? 0.7 : 0.4);
    return true;
  }

  takeHit(dmg, from, knock = 3, opts = {}) {
    if (this.dead || this.invuln > 0) return 'miss';
    if (this.dodgeT > 0) return 'dodged';
    const G = this.G;
    // blocking works against attacks from the front half
    // Taş Kıran: the heavy blow of the sky hammer goes straight through a guard
    const breaks = from && from.tasKiran && from.attackType === 2;
    if (this.blocking && from && !breaks) {
      let d = this.angleTo(from) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) < 1.3) {
        dmg *= 0.15; knock *= 0.4;
        G.fx.sparks(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(this.forward(), 0.4), 16, 0xffe2a0, 5);
        G.audio && G.audio.clang(this.pos, 0.5); G.audio && G.audio.play('anvil', { vol: 0.45, rate: 1.35 });
        this.hp = Math.max(this.floorHp ?? 0, this.hp - dmg);
        this.knock.addScaledVector(this.forward(), -knock);
        this.onHit && this.onHit(dmg, from, true);
        // Demir Kalkan: a block raised just in time sends the blow back
        if (this === G.player && G.flags && G.flags.demirKalkan && from.takeHit && from.alive && performance.now() - (this.blockStart || 0) < 480) {
          from.takeHit(dmg / 0.15 * 1.1, this, 7, { quake: true });
          G.fx.flash(this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(this.forward(), 0.6), 0x9fe8ff, 60, 0.25, 12);
          G.fx.ring(this.pos, 0x9fe8ff, 2.5, 0.4); G.ui.toast('Demir Kalkan!', 800);
        }
        return 'blocked';
      }
    }
    if (breaks && this.blocking) { G.fx.sparks(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 30, 0x9fe8ff, 6); this.blocking = false; G.ui.toast('Taş Kıran!', 900); }
    this.hp = Math.max(this.floorHp ?? 0, this.hp - dmg);
    this.hitT = 1; this.flashT = 0.15;
    if (this.attack >= 0 && (opts.interrupt !== false) && dmg > 6) this.attack = -1; // stagger cancels swings
    if (from) {
      const dir = new THREE.Vector3(this.pos.x - from.pos.x, 0, this.pos.z - from.pos.z).normalize();
      this.knock.addScaledVector(dir, knock);
    }
    G.fx.sparks(this.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 10, opts.sky ? 0x9fe8ff : 0xffb070, 3.5, 0.1);
    G.fx.dust(this.pos, 5);
    G.audio && G.audio.hit(this.pos, Math.min(1, dmg / 20));
    if (this.hpBar) this.hpBar.g.visible = true;
    this.onHit && this.onHit(dmg, from, false);
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  die() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0; this.attack = -1;
    if (this.hpBar) this.hpBar.g.visible = false;
    this.onDie && this.onDie();
  }

  // swing resolution: hit everything of other teams inside the arc
  resolveAttack() {
    const a = ATTACKS[this.attackType];
    const G = this.G;
    const targets = G.actors.filter(o => o !== this && o.alive && o.team !== this.team && o.team !== 'neutral' && !(this.sparring && o !== this.sparring) && !(o.sparring && o.sparring !== this));
    for (const e of G.extraTargets || []) if (e.alive && e.team !== this.team && (e.hitY == null || Math.abs(e.hitY() - (this.pos.y + 1)) < 2.2)) targets.push(e);
    let hits = 0;
    for (const t of targets) {
      const d = this.distTo(t);
      if (d > a.reach + t.radius) continue;
      let ang = this.angleTo(t) - this.yaw; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(ang) > a.arc / 2 + 0.2) continue;
      const r = t.takeHit(a.dmg * this.atkMul * (this.dmgMul || 1), this, a.knock, { sky: this.skyHammer });
      if (r === 'hit' || r === 'blocked') hits++;
      if (this.attackType !== 1) break;
    }
    if (hits) { this.hitStop = this.attackType === 2 ? 0.12 : 0.07; this.onLand && this.onLand(hits, this.attackType); }   // hold on impact
    if (this.attackType === 2) { // slam shakes the ground
      const p = this.pos.clone().addScaledVector(this.forward(), 1.6);
      G.fx.dust(p, 14); if (this === G.player) G.shake(0.25);
      if (this.skyHammer) G.fx.skyBurst(p.add(new THREE.Vector3(0, 0.3, 0)), 24);
    }
  }

  update(dt) {
    this.time += dt;
    const G = this.G;
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 1.6);
      const k = this.deadT * this.deadT;
      this.model.rotation.x = -Math.PI / 2 * k * (this.fallDir || 1);
      this.model.position.y = 0.15 * k;
      this.vel.multiplyScalar(0.9);
      this.pos.addScaledVector(this.knock, dt); this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.rig.pose({ time: this.time, dead: this.deadT });
      if (this.hpBar) this.hpBar.g.visible = false;
      return;
    }
    // who is near enough to fight (checked a few times a second)
    this.combatCheck = (this.combatCheck || 0) - dt;
    if (this.combatCheck <= 0) {
      this.combatCheck = 0.4;
      this.inCombat = !!this.weapon && !this.pose.talk && G.actors.some(o => o !== this && o.alive && o.team !== this.team && o.team !== 'neutral' && (o.team === 'hisar' || this.team === 'hisar' || o.sparring === this) && this.distTo(o) < 9);
    }
    // attack progress
    if (this.attack >= 0) {
      const a = ATTACKS[this.attackType];
      const prev = this.attack;
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.attack += dt / (a.dur * (this.atkSlow || 1));
      const tw = ATTACK_KEYS[this.attackType].times[0];
      if (prev < tw && this.attack >= tw && !this.smithing) this.knock.addScaledVector(this.forward(), this === G.player ? (this.attackType === 2 ? 3.2 : 2.4) : 1.6);
      if (!this.attackDone && this.attack >= a.hitAt) { this.attackDone = true; this.resolveAttack(); }
      if (this.attack >= 1) { this.attack = -1; this.onAttackEnd && this.onAttackEnd(); }
    }
    this.hitT = Math.max(0, this.hitT - dt * 3.5);
    this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    // integrate (a rider just sits in the saddle)
    if (this.mount) {
      this.vel.set(0, 0, 0); this.knock.set(0, 0, 0);
      this.mount.saddle(this.pos); this.yaw = this.mount.yaw;
    } else {
      this.pos.x += (this.vel.x + this.knock.x) * dt;
      this.pos.z += (this.vel.z + this.knock.z) * dt;
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
      G.world.collide(this.pos, this.radius);
      this.pos.y = heightAt(this.pos.x, this.pos.z);
      if (this.jumpY > 0 || this.jumpV > 0) { // a jump: simple ballistic hop over the terrain
        this.jumpV -= 21 * (G.gravityMul || 1) * dt; this.jumpY += this.jumpV * dt;
        if (this.jumpY <= 0) {
          this.jumpY = 0; this.jumpV = 0; this.landT = 0.18;
          G.fx.dust(this.pos, 6); G.audio && G.audio.step && G.audio.step(this.pos, 1);
        }
        this.pos.y += this.jumpY;
      }
      if (this.landT > 0) this.landT -= dt;
    }
    this.obj.rotation.y = this.yaw;
    // animation
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.vSm = (this.vSm || 0) + (sp - (this.vSm || 0)) * Math.min(1, dt * 8);
    this.speedK += (Math.min(sp / 3.2, 1.5) - this.speedK) * Math.min(1, dt * 8);
    // the stride sets the cadence: a planted foot moves back exactly as fast as the body moves forward
    this.phase += dt * gait(this.vSm).rate * (sp > 0.15 ? 1 : 0);
    // a footstep sounds when the foot touches (phase pi/2 + n*pi), not when the legs pass
    const stepIdx = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    if (stepIdx !== this.lastStep) { if (sp > 0.6 && this.dodgeT <= 0) G.audio && G.audio.step(this.pos, this === G.player ? 1 : 0.55); this.lastStep = stepIdx; }
    if (sp < 0.15) this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 6);
    const dodge = this.dodgeT > 0 ? Math.sin((1 - this.dodgeT / 0.45) * Math.PI) : 0;
    if (!this.culled) { // off-screen people skip the skeleton work
    this.rig.pose({
      speed: this.speedK, vel: this.vSm, phase: this.phase, time: this.time, roll: this.dodgeT > 0 ? Math.sin((1 - this.dodgeT / 0.45) * Math.PI) : 0,
      attack: this.attack, attackType: this.attackType,
      block: this.blocking, hit: this.hitT, guard: this.pose.guard && !!this.weapon,
      carry: this.pose.carry, pour: this.pose.pour, crank: this.pose.crank,
      stance: this.inCombat ? 1 : 0,
      air: this.jumpY > 0.04 ? Math.min(1, this.jumpY * 3 + 0.4) : 0, land: this.landT > 0 ? this.landT / 0.18 : 0, ride: !!this.mount, gallop: this.mount ? Math.min(1, Math.abs(this.mount.speed) / 10) : 0, aim: this.pose.aim || 0,
      gripR: !!this.weapon || this.pose.carry || this.pose.crank != null || this.pose.pour > 0, gripL: !!this.torch || !!this.bow || !!this.mount || this.pose.crank != null || this.pose.pour > 0, talk: this.pose.talk, cheer: this.pose.cheer, kneel: this.pose.kneel, hammerRaise: this.pose.hammerRaise,
    });
    this.model.position.y = (this.rig.bob || 0) - (this.rig.drop || 0) - dodge * 0.35;
    this.model.rotation.x = dodge * 0.5;
    this.model.updateMatrixWorld(true);
    // heavy blows are two-handed: the off hand closes on the shaft below the right fist
    if (this.weapon && this.attack >= 0 && this.attackType === 2 && this.rig.hand && this.rig.hand.L) {
      const tgt = this.weapon.localToWorld(new THREE.Vector3(0, 0.04, 0));
      const rightV = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      this.rig.ik('L', tgt, new THREE.Vector3(0, -1, 0).addScaledVector(rightV, -0.8));
    }
    if (this.afterPose) this.afterPose();
    if (this.cape) this.cape.update(dt);
    }
    this.updateTrail(dt);
    // hit flash
    this.flashT = Math.max(0, this.flashT - dt);
    const fl = this.flashT > 0 ? 0.6 : (this.telegraph || 0);
    const fc = this.flashT > 0 ? 0xffffff : 0xff2a00;
    for (const m of this.mats) { m.emissive.setHex(fc); m.emissiveIntensity = fl; }
    if (this.hpBar) {
      const k = Math.max(0, this.hp / this.maxHp);
      this.hpBar.fg.scale.x = Math.max(0.001, k); this.hpBar.fg.position.x = -(1 - k) * this.hpBar.w / 2;
      this.hpBar.g.quaternion.copy(G.camera.quaternion).premultiply(this.obj.quaternion.clone().invert());
      if (this.hpBar.g.visible || this.hpShown) { this.hpShown = true; this.hpBar.g.visible = this.hp < this.maxHp && G.camera.position.distanceTo(this.pos) > 3.2; }
    }
  }

  // a fading ribbon behind the weapon's head during the fast part of a swing
  updateTrail(dt) {
    const G = this.G;
    const swinging = this.weapon && this.attack >= 0 && this.attack > ATTACK_KEYS[this.attackType].times[0] - 0.05 && this.attack < ATTACK_KEYS[this.attackType].times[2];
    if (!this.trail) {
      if (!swinging) return;
      const N = 14, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N * 2), 1).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const col = this.skyHammer ? new THREE.Color(0x9fe8ff) : (this.team === 'hisar' ? new THREE.Color(0xffc0a0) : new THREE.Color(0xfff2d6));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { col: { value: col } },
        vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col, vA * 0.55); }' });
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; G.scene.add(mesh);
      this.trail = { mesh, N, pts: [] };
    }
    const T = this.trail;
    if (swinging) {
      const reach = REACH[this.weaponKey] || 0.7;
      const head = this.weapon.localToWorld(new THREE.Vector3(0, 0.22 + reach, 0));
      const mid = this.weapon.localToWorld(new THREE.Vector3(0, 0.22 + reach * 0.45, 0));
      T.pts.unshift([head, mid, 1]);
    }
    for (const p of T.pts) p[2] -= dt * 6;
    T.pts = T.pts.filter(p => p[2] > 0).slice(0, T.N);
    const pos = T.mesh.geometry.attributes.position, al = T.mesh.geometry.attributes.alpha;
    for (let i = 0; i < T.N; i++) {
      const p = T.pts[Math.min(i, T.pts.length - 1)];
      if (!p) { al.setX(i * 2, 0); al.setX(i * 2 + 1, 0); continue; }
      pos.setXYZ(i * 2, p[0].x, p[0].y, p[0].z); pos.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const a = i < T.pts.length ? p[2] * (1 - i / T.N) : 0;
      al.setX(i * 2, a); al.setX(i * 2 + 1, a * 0.2);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
    T.mesh.visible = T.pts.length > 1;
  }

  jump(v = 7.2) {
    if (this.jumpY > 0 || this.jumpV > 0 || this.mount) return false;
    this.jumpV = v; this.jumpY = 0.001; return true;
  }

  remove() {
    if (this.cape) this.cape.dispose();
    if (this.trail) this.G.scene.remove(this.trail.mesh);
    this.G.scene.remove(this.obj);
    this.G.actors = this.G.actors.filter(a => a !== this);
  }
}
