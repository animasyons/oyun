// Enemies of the 2nd and 3rd acts and the new hammer powers.
//  - Serpent: the Salt Dragon, a burrowing chain of segments (not an Actor)
//  - Drone: Swarm watcher, flies and shoots bolts (not an Actor)
//  - alien / albasti / karaKam / commander: Actors with dressed-up looks and extra moves
//  - powers: R Yer Sarsıntısı, T Kara Şimşek, passive Demir Kalkan
import * as THREE from 'three';
import { heightAt } from './world.js';
import { soldierBrain } from './ai.js';

const V = () => new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------- boss bar (top of the screen) ----------------
export function bossBar(G, name, k) {
  let el = document.getElementById('bossBar');
  if (!el) {
    el = document.createElement('div'); el.id = 'bossBar';
    el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);width:min(520px,80vw);text-align:center;pointer-events:none;z-index:6;font-family:"Alegreya SC",serif;color:#f3e6c8;text-shadow:0 1px 3px #000;letter-spacing:.06em';
    el.innerHTML = '<div id="bossName" style="font-size:15px;margin-bottom:4px"></div><div style="height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,220,160,.35)"><i id="bossFill" style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#b8321e,#e0a030)"></i></div>';
    document.body.appendChild(el);
  }
  if (name == null) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  document.getElementById('bossName').textContent = name;
  document.getElementById('bossFill').style.width = Math.max(0, k) * 100 + '%';
}

// ---------------- dressing up actors ----------------
function restPos(a, bone) {
  const rig = a.rig; rig.reset(); rig.root.updateMatrixWorld(true);
  const v = V(); rig.b[bone].getWorldPosition(v); return rig.root.worldToLocal(v);
}
function skin(a, color, opts = {}) {
  for (const m of a.mats) {
    if (opts.keepMap !== true) m.map = null;
    m.color.set(color);
    if (opts.opacity != null) { m.transparent = true; m.opacity = opts.opacity; m.depthWrite = opts.opacity > 0.6; }
    m.needsUpdate = true;
  }
}
function glowWeapon(a, color) {
  if (!a.weapon) return;
  a.weapon.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 }); } });
}

// grey sky hunter: big head, glowing almond eyes, an energy blade
export function alien(G, pos, opts = {}) {
  const a = G.spawn(opts.key || (Math.random() < 0.5 ? 'asker1' : 'asker2'), {
    name: opts.name || 'Gök Avcısı', team: 'hisar', hp: opts.hp || 60, pos, weapon: 'sword', hpBar: true,
    atkMul: opts.atkMul || 1.0, scale: opts.scale || 1.1, boss: opts.boss,
  });
  skin(a, opts.color || 0x9aa6b4);
  for (const m of a.mats) { m.emissive.set(0x0a2030); }
  // eyes, placed at rest, then the head grows
  const head = restPos(a, 'Head');
  const eyeM = new THREE.MeshBasicMaterial({ color: opts.eye || 0x8ff8ff });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), eyeM);
    e.scale.set(0.034, 0.02, 0.016); e.rotation.z = s * 0.45;
    e.position.set(head.x + s * 0.042, head.y + 0.105, head.z + 0.095);
    a.rig.attachModelSpace('Head', e);
  }
  a.rig.b.Head.scale.set(1.3, 1.45, 1.3);
  glowWeapon(a, opts.blade || 0x48e8ff);
  a.brain = soldierBrain(G, a, { boss: opts.boss });
  a.fallDir = Math.random() < 0.5 ? 1 : -1;
  a.isAlien = true;
  return a;
}

// ---------------- Swarm drone ----------------
export class Drone {
  constructor(G, pos, opts = {}) {
    this.G = G; this.team = 'hisar'; this.alive = true; this.radius = 0.7; this.hitR = 0.9;
    this.hp = this.maxHp = opts.hp || 34; this.alt = opts.alt || 4.6; this.y = this.alt;
    this.color = opts.color || 0xff3a5a; this.low = !!opts.low; // low: a melee wisp that explodes
    this.pos = new THREE.Vector3(pos.x, 0, pos.z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshStandardMaterial({ color: opts.body || 0x3a3f4a, metalness: 0.8, roughness: 0.35, emissive: 0x000000 }));
    body.scale.y = 0.6; g.add(body); this.bodyMat = body.material;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: opts.ring || 0x48e8ff })); ring.rotation.x = Math.PI / 2; g.add(ring); this.ring = ring;
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: this.color })); this.eye.position.set(0, -0.05, 0.48); g.add(this.eye);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.mesh = g; G.scene.add(g);
    this.ang = Math.random() * 6.28; this.orbit = opts.orbit || rnd(7, 10); this.fireT = rnd(1.5, 3); this.diveT = rnd(5, 8); this.state = 'fly'; this.t = 0;
    this.fireEvery = opts.fireEvery || [2.2, 3.4]; this.dmg = opts.dmg || 10;
  }
  center() { return new THREE.Vector3(this.pos.x, heightAt(this.pos.x, this.pos.z) + this.y, this.pos.z); }
  hitY() { return heightAt(this.pos.x, this.pos.z) + this.y; }
  update(dt) {
    const G = this.G, p = G.player; this.t += dt;
    if (!this.alive) {
      this.y -= dt * 6; this.mesh.rotation.x += dt * 4;
      this.mesh.position.set(this.pos.x, heightAt(this.pos.x, this.pos.z) + Math.max(0.3, this.y), this.pos.z);
      if ((this.goneT -= dt) <= 0) { this.remove(); return false; }
      return;
    }
    if (G.freeze || G.cutsceneOn) { this.mesh.position.set(this.pos.x, heightAt(this.pos.x, this.pos.z) + this.y + Math.sin(this.t * 2) * 0.15, this.pos.z); return; }
    const tgt = p.pos;
    if (this.low) { // wisp: drift in and burst
      const d = Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z);
      const k = Math.min(1, dt * 1.6 / Math.max(d, 0.1)) * 2.2;
      this.pos.x += (tgt.x - this.pos.x) * k * 0.5; this.pos.z += (tgt.z - this.pos.z) * k * 0.5;
      this.y = 1.3 + Math.sin(this.t * 3) * 0.2;
      if (d < 1.2) { p.takeHit(this.dmg, null, 5); this.die(); }
    } else {
      this.ang += dt * 0.5;
      const wantX = tgt.x + Math.cos(this.ang) * this.orbit, wantZ = tgt.z + Math.sin(this.ang) * this.orbit;
      this.pos.x += (wantX - this.pos.x) * Math.min(1, dt * 1.2); this.pos.z += (wantZ - this.pos.z) * Math.min(1, dt * 1.2);
      G.world.collide(this.pos, 0.5);
      // dive down for a while: the moment to hit it with the hammer
      this.diveT -= dt;
      const wantY = this.diveT < 0 ? 1.7 : this.alt + Math.sin(this.t * 1.7) * 0.4;
      if (this.diveT < -2.6) this.diveT = rnd(6, 9);
      this.y += (wantY - this.y) * Math.min(1, dt * 2.5);
      this.fireT -= dt;
      const tele = this.fireT < 0.5;
      this.eye.scale.setScalar(tele ? 1.6 + Math.sin(this.t * 40) * 0.3 : 1);
      if (this.fireT <= 0) {
        this.fireT = rnd(...this.fireEvery);
        const from = this.center(), to = p.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        G.shootBolt(from, to, this.dmg, 'hisar', this.color, 24);
      }
    }
    const c = this.center();
    this.mesh.position.copy(c);
    this.mesh.lookAt(p.pos.x, c.y - 0.3, p.pos.z);
    this.ring.rotation.z += dt * 3;
    this.bodyMat.emissive.setHex(this.flashT > 0 ? 0xffffff : 0x000000); this.flashT = (this.flashT || 0) - dt;
  }
  takeHit(dmg, from) {
    if (!this.alive) return 'miss';
    this.hp -= dmg; this.flashT = 0.12;
    this.G.fx.sparks(this.center(), 14, 0x9fe8ff, 4);
    this.G.audio.clang(this.pos, 0.4);
    if (this.hp <= 0) this.die();
    return 'hit';
  }
  die() {
    if (!this.alive) return;
    this.alive = false; this.goneT = 1.2;
    const c = this.center();
    this.G.fx.flash(c, this.color, 50, 0.3, 14); this.G.fx.sparks(c, 30, 0xffc070, 7); this.G.audio.boom && this.G.audio.boom(0);
    this.onDie && this.onDie();
  }
  remove() { this.G.scene.remove(this.mesh); }
}

// ---------------- Tuz Ejderi: the burrowing salt serpent ----------------
export class Serpent {
  constructor(G, center) {
    this.G = G; this.team = 'hisar'; this.alive = true; this.radius = 1.4; this.hitR = 1.6;
    this.hp = this.maxHp = 300; this.center0 = center.clone(); this.name = 'Tuz Ejderi';
    this.N = 24; this.segs = []; this.pts = [];
    const scaleM = new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.65, metalness: 0.05 });
    const backM = new THREE.MeshStandardMaterial({ color: 0xb8a890, roughness: 0.8 });
    this.mats = [scaleM, backM];
    const g = new THREE.Group();
    for (let i = 0; i < this.N; i++) {
      const r = THREE.MathUtils.lerp(1.25, 0.35, i / (this.N - 1));
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), i % 2 ? backM : scaleM);
      s.castShadow = true; g.add(s);
      if (i % 2 === 0 && i < this.N - 3) { // back spikes
        const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 0.9, 5), backM); sp.position.y = r * 0.9; s.add(sp);
      }
      this.segs.push(s); this.pts.push(new THREE.Vector3(center.x, -6 - i, center.z));
    }
    // the head: snout, jaw, horns, eyes
    const head = this.segs[0];
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.0, 6), scaleM); snout.rotation.x = Math.PI / 2; snout.position.z = 1.3; head.add(snout);
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 6), backM); jaw.rotation.x = Math.PI / 2 + 0.35; jaw.position.set(0, -0.5, 1.0); head.add(jaw); this.jaw = jaw;
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.3, 5), backM); horn.position.set(s * 0.6, 0.9, -0.3); horn.rotation.set(-0.8, 0, s * 0.3); head.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); eye.position.set(s * 0.55, 0.35, 0.9); head.add(eye);
    }
    this.mesh = g; G.scene.add(g);
    this.pos = new THREE.Vector3(center.x, 0, center.z);
    this.state = 'under'; this.t = 0; this.target = V(); this.pickTarget();
    this.dustT = 0;
  }
  pickTarget() {
    const p = this.G.player.pos, a = Math.random() * 6.28;
    this.target.set(p.x + Math.cos(a) * 7, 0, p.z + Math.sin(a) * 7);
    const c = this.center0, dx = this.target.x - c.x, dz = this.target.z - c.z, d = Math.hypot(dx, dz);
    if (d > 55) { this.target.x = c.x + dx / d * 55; this.target.z = c.z + dz / d * 55; }
  }
  hitY() { return this.pts[0].y; }
  center() { return this.pts[0].clone(); }
  get vulnerable() { return this.state === 'stuck' || this.state === 'aim'; }
  update(dt) {
    const G = this.G, p = G.player, H = this.pts[0];
    this.t += dt;
    const enraged = this.hp < this.maxHp * 0.5;
    const gy = heightAt(H.x, H.z);
    if (!this.alive) {
      H.y -= dt * 1.2; // sinks into the salt
    } else if (G.cutsceneOn || G.freeze) {
      // hold still
    } else if (this.state === 'under') {
      const dx = this.target.x - H.x, dz = this.target.z - H.z, d = Math.hypot(dx, dz);
      const sp = enraged ? 16 : 12;
      if (d > 0.5) { H.x += dx / d * Math.min(d, sp * dt); H.z += dz / d * Math.min(d, sp * dt); }
      H.y += (gy - 4 - H.y) * Math.min(1, dt * 3);
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = 0.08; G.fx.dust(new THREE.Vector3(H.x, gy, H.z), 4, 0xe8e2d6); }
      if (d < 0.6 || this.t > 4) { this.state = 'rise'; this.t = 0; G.audio.rumble && G.audio.rumble(1.2); G.shake(0.3); }
    } else if (this.state === 'rise') {
      H.y += (gy + 5.2 - H.y) * Math.min(1, dt * 4);
      if (this.t > 0.9) { this.state = 'aim'; this.t = 0; this.strikeAt = p.pos.clone(); G.fx.ring(this.strikeAt, 0xff5a3a, 2.6, 0.9); }
    } else if (this.state === 'aim') {
      const back = H.clone().sub(p.pos).setY(0).normalize();
      H.x += back.x * dt * 0.6; H.z += back.z * dt * 0.6;
      H.y = gy + 5.2 + Math.sin(this.t * 10) * 0.15;
      if (this.t > (enraged ? 0.55 : 0.85)) { this.state = 'strike'; this.t = 0; this.strikeFrom = H.clone(); }
    } else if (this.state === 'strike') {
      const k = Math.min(1, this.t / 0.28);
      const to = this.strikeAt.clone(); to.y = heightAt(to.x, to.z) + 0.8;
      H.lerpVectors(this.strikeFrom, to, k * k);
      if (k >= 1) {
        this.state = 'stuck'; this.t = 0; G.shake(0.5); G.fx.dust(to, 26, 0xe8e2d6); G.fx.ring(to, 0xffffff, 4, 0.5); G.audio.boom && G.audio.boom(0);
        for (const a of G.actors) if (a.alive && a.team !== 'hisar' && Math.hypot(a.pos.x - to.x, a.pos.z - to.z) < 2.4) a.takeHit(enraged ? 30 : 24, this, 9);
        this.strikes = (this.strikes || 0) + 1;
      }
    } else if (this.state === 'stuck') {
      H.y = heightAt(H.x, H.z) + 0.8 + Math.sin(this.t * 3) * 0.1;
      // enraged: a quick second strike before resting
      if (enraged && this.strikes % 2 === 1 && this.t > 0.6) { this.state = 'rise'; this.t = 0.3; }
      else if (this.t > (enraged ? 2.2 : 3.0)) { this.state = 'dive'; this.t = 0; }
    } else if (this.state === 'dive') {
      H.y -= dt * 7;
      if (H.y < gy - 4) { this.state = 'under'; this.t = 0; this.pickTarget(); }
    }
    // the body follows the head like a chain, never above it by much
    for (let i = 1; i < this.N; i++) {
      const a = this.pts[i - 1], b = this.pts[i], seg = 1.05 * (1 - i / this.N * 0.35);
      const d = b.distanceTo(a);
      if (d > seg) b.lerp(a, (d - seg) / d);
      const gyb = heightAt(b.x, b.z);
      if (this.state === 'under' || this.state === 'dive') b.y = Math.min(b.y, gyb - 1 + (this.N - i) * 0.0); // stay buried
      else b.y = Math.max(b.y - dt * 2, Math.min(b.y, a.y)) ;
    }
    for (let i = 0; i < this.N; i++) {
      const s = this.segs[i]; s.position.copy(this.pts[i]);
      const n = i === 0 ? this.pts[0].clone().add(this.pts[0].clone().sub(this.pts[1])) : this.pts[i - 1];
      s.lookAt(n);
    }
    if (this.state === 'aim' || this.state === 'rise') this.segs[0].lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
    this.jaw.rotation.x = Math.PI / 2 + 0.35 + (this.state === 'aim' ? 0.35 + Math.sin(this.t * 14) * 0.1 : 0);
    this.pos.set(H.x, 0, H.z);
    const fl = (this.flashT = (this.flashT || 0) - dt) > 0 ? 0.6 : 0;
    for (const m of this.mats) { m.emissive.setRGB(fl, fl, fl); }
    if (this.alive) bossBar(G, this.name, this.hp / this.maxHp);
  }
  takeHit(dmg, from, knock, opts = {}) {
    if (!this.alive) return 'miss';
    const G = this.G;
    if (!this.vulnerable && !opts.quake) {
      G.fx.sparks(this.pts[0].clone(), 8, 0xffffff, 3); G.audio.clang(this.pos, 0.4);
      if (!this.warned) { this.warned = true; G.ui.toast('Pulları çok sert: başı yerdeyken vur!', 1800); }
      return 'blocked';
    }
    this.hp -= dmg; this.flashT = 0.12;
    G.fx.sparks(this.pts[0].clone(), 14, 0xffc070, 4); G.audio.hit(this.pos, 0.8);
    if (this.hp <= 0) { this.hp = 0; this.alive = false; bossBar(G, null); G.shake(0.8); this.onDie && this.onDie(); }
    return 'hit';
  }
  remove() { this.G.scene.remove(this.mesh); bossBar(this.G, null); }
}

// ---------------- Albastı Ana: vanishes and strikes from behind ----------------
export function albasti(G, pos) {
  const a = G.spawn('koylu6', { name: 'Albastı Ana', team: 'hisar', hp: 340, pos, weapon: 'scythe', hpBar: false, atkMul: 1.4, scale: 1.45, boss: true });
  skin(a, 0xd8e4ea, { opacity: 0.9 });
  for (const m of a.mats) { m.emissive.set(0x6fa8a0); m.emissiveIntensity = 0.5; }
  a.weapon && a.weapon.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x202024); } });
  const base = soldierBrain(G, a, { boss: true });
  let vanishT = 6, gone = 0, wisped = 0;
  a.brain = dt => {
    bossBar(G, a.name, a.hp / a.maxHp);
    if (G.cutsceneOn) return;
    if (gone > 0) {
      gone -= dt;
      const k = Math.max(0, gone / 1.2);
      for (const m of a.mats) m.opacity = 0.9 * (1 - Math.min(1, (1.2 - gone) * 3)) ;
      if (gone <= 0) { // reappear behind the player and strike
        const p = G.player, back = p.forward().multiplyScalar(-2.2);
        a.pos.set(p.pos.x + back.x, 0, p.pos.z + back.z); G.world.collide(a.pos, a.radius);
        a.yaw = a.angleTo(p); for (const m of a.mats) m.opacity = 0.9;
        a.invuln = 0; G.fx.dust(a.pos, 16, 0xbfe0d8); G.audio.whoosh(a.pos, 0.6);
        a.telegraph = 0.8; setTimeout(() => { if (a.alive && a.attack < 0) a.startAttack(1); }, 380);
      }
      return;
    }
    base(dt);
    vanishT -= dt;
    if (vanishT <= 0 && a.attack < 0) {
      vanishT = rnd(6, 9); gone = 1.2; a.invuln = 1.5;
      G.fx.dust(a.pos, 20, 0xbfe0d8); G.audio.whoosh(a.pos, 0.5);
    }
    const k = a.hp / a.maxHp;
    if ((k < 0.66 && wisped === 0) || (k < 0.33 && wisped === 1)) {
      wisped++; G.ui.toast('Albastı ruhlarını çağırıyor!', 1500);
      for (let i = 0; i < 3; i++) { const d = new Drone(G, a.pos.clone().add(new THREE.Vector3(rnd(-4, 4), 0, rnd(-4, 4))), { low: true, hp: 14, dmg: 12, color: 0x8affd0, ring: 0x8affd0, body: 0xcff6ea }); G.extraTargets.push(d); }
    }
  };
  a.onDie = () => bossBar(G, null);
  return a;
}

// ---------------- Kara Kam: the shaman, lightning and shadows ----------------
export function karaKam(G, pos, spawnShadow) {
  const a = G.spawn('bars', { name: 'Kara Kam', team: 'hisar', hp: 460, pos, weapon: 'stick', hpBar: false, atkMul: 1.3, scale: 1.25, boss: true });
  skin(a, 0x3a3440, { keepMap: true });
  for (const m of a.mats) { m.emissive.set(0x400818); m.emissiveIntensity = 0.5; }
  if (a.weapon) {
    a.weapon.traverse(o => { if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: 0x1a1414 }); });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); orb.position.y = 1.22; a.weapon.add(orb);
  }
  const base = soldierBrain(G, a, { boss: true });
  let boltT = 4, called = 0;
  a.brain = dt => {
    bossBar(G, a.name, a.hp / a.maxHp);
    if (G.cutsceneOn) return;
    base(dt);
    G.fx.light(a.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0xff3a2a, 4, 8);
    if (Math.random() < 0.3) G.fx.norm.add({ x: a.pos.x + rnd(-0.5, 0.5), y: a.pos.y + rnd(0.2, 2.2), z: a.pos.z + rnd(-0.5, 0.5), vx: 0, vy: 0.8, vz: 0, drag: 1, grav: 0, life: 0.9, age: 0, c0: [0.25, 0.05, 0.08], c1: [0.05, 0.0, 0.02], a: 0.8, s0: 0.25, s1: 0.05 });
    boltT -= dt;
    const enr = a.hp < a.maxHp * 0.5;
    if (boltT <= 0) { // lightning from the storm onto where you stand
      boltT = enr ? rnd(2.4, 3.4) : rnd(3.6, 5);
      const n = enr ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const p = G.player.pos.clone().add(new THREE.Vector3(i ? rnd(-3, 3) : 0, 0, i ? rnd(-3, 3) : 0));
        G.fx.ring(p, 0xff3a2a, 2.2, 1.0);
        setTimeout(() => {
          if (!a.alive) return;
          G.fx.flash(p.clone().add(new THREE.Vector3(0, 4, 0)), 0xff6a5a, 120, 0.25, 30); G.fx.sparks(p.clone().add(new THREE.Vector3(0, 0.3, 0)), 30, 0xff8a6a, 7);
          G.audio.thunder(); G.shake(0.3);
          for (const t of G.actors) if (t.alive && t.team !== 'hisar' && Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < 2.2 && t.dodgeT <= 0) t.takeHit(22, null, 5);
        }, 900);
      }
    }
    const k = a.hp / a.maxHp;
    if ((k < 0.7 && called === 0) || (k < 0.35 && called === 1)) { called++; spawnShadow && spawnShadow(called); }
  };
  a.onDie = () => bossBar(G, null);
  return a;
}

// ---------------- Swarm commander: shielded while his watchers fly ----------------
export function commander(G, pos) {
  const a = alien(G, pos, { name: 'Sürü Komutanı', hp: 620, scale: 1.75, atkMul: 1.6, boss: true, color: 0x6a7484, eye: 0xff4a6a, blade: 0xff3a5a, key: 'asker2' });
  a.hpBar && (a.hpBar.g.visible = false);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xff4a6a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.position.y = 1.6; a.obj.add(shield); a.shield = shield;
  const base = a.brain; let waveT = 6;
  a.drones = [];
  a.brain = dt => {
    bossBar(G, a.name + (a.shielded ? ' · kalkan' : ''), a.hp / a.maxHp);
    if (G.cutsceneOn) return;
    base(dt);
    a.drones = a.drones.filter(d => d.alive);
    a.shielded = a.drones.length > 0;
    shield.visible = a.shielded; shield.material.opacity = 0.18 + Math.sin(G.time * 6) * 0.05;
    waveT -= dt;
    if (waveT <= 0 && a.attack < 0) { // shockwave ring: jump over it or roll through it
      waveT = rnd(6, 8.5);
      G.fx.ring(a.pos, 0xff4a6a, 9, 1.1); G.shake(0.3); G.audio.boom && G.audio.boom(0);
      setTimeout(() => {
        const p = G.player, d = p.distTo(a);
        if (a.alive && d < 9 && d > 1 && p.jumpY < 0.4 && p.dodgeT <= 0) p.takeHit(18, a, 8);
      }, 520);
    }
  };
  const hit = a.takeHit.bind(a);
  a.takeHit = (dmg, from, knock, opts) => {
    if (a.shielded) { G.fx.sparks(a.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), 12, 0xff4a6a, 4); G.audio.clang(a.pos, 0.5); if (!a.warnS) { a.warnS = true; G.ui.toast('Kalkan gözcülerden besleniyor: önce onları düşür!', 2200); } return 'blocked'; }
    return hit(dmg, from, knock, opts);
  };
  a.onDie = () => bossBar(G, null);
  return a;
}

// ---------------- powers ----------------
export function setupPowers(G) {
  const P = G.player;
  P.cdR = 0; P.cdT = 0;
  // HUD line for the powers that are unlocked
  let el = document.getElementById('powers');
  if (!el) {
    el = document.createElement('div'); el.id = 'powers';
    el.style.cssText = 'position:fixed;left:20px;bottom:118px;font:13px "Alegreya Sans",sans-serif;color:#efe2c4;text-shadow:0 1px 2px #000;pointer-events:none;z-index:5;line-height:1.6';
    document.body.appendChild(el);
  }
  G.powerHud = () => {
    const f = G.flags || {}, rows = [];
    const cd = v => v > 0 ? `<span style="opacity:.6">${Math.ceil(v)} sn</span>` : '<span style="color:#9fe8ff">hazır</span>';
    if (f.yerSarsinti) rows.push(`<b>R</b> Yer Sarsıntısı · ${cd(P.cdR)}`);
    if (f.karaSimsek) rows.push(`<b>T</b> Kara Şimşek · ${cd(P.cdT)}`);
    if (f.demirKalkan) rows.push('<b>Sağ tık</b> Demir Kalkan · darbeyi yansıtır');
    const hud = document.getElementById('hud');
    el.style.display = rows.length && hud && !hud.hidden ? 'block' : 'none';
    el.innerHTML = rows.join('<br>');
  };
  let hudT = 0;
  G.tickersPersistent = G.tickersPersistent || [];
  G.powerTick = dt => {
    P.cdR = Math.max(0, P.cdR - dt); P.cdT = Math.max(0, P.cdT - dt);
    if ((hudT -= dt) <= 0) { hudT = 0.25; G.powerHud(); }
    const I = G.input, f = G.flags || {};
    if (!P.controls || P.dead || P.mount || !I.live) return;
    if (f.yerSarsinti && I.hit('KeyR') && P.cdR <= 0 && P.jumpY <= 0 && P.attack < 0) quake(G, P);
    if (f.karaSimsek && I.hit('KeyT') && P.cdT <= 0 && P.weapon && !P.thrown && P.attack < 0) throwHammer(G, P);
  };
}

function quake(G, P) {
  P.cdR = 7; P.pose.hammerRaise = 1;
  setTimeout(() => {
    P.pose.hammerRaise = 0;
    const p = P.pos.clone();
    G.fx.ring(p, 0xc8a070, 9, 0.8); G.fx.ring(p, 0xffffff, 5, 0.4); G.fx.dust(p, 40, 0xb59b72); G.shake(0.7);
    G.audio.boom && G.audio.boom(0); G.audio.rumble && G.audio.rumble(1);
    for (const e of [...G.actors, ...G.extraTargets]) {
      if (!e.alive || e.team === P.team || e.team === 'neutral' || e === P) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d > 8.5) continue;
      if (e.hitY && e.hitY() - p.y > 3.2) continue; // flying high: out of reach
      e.takeHit(34 * (1 - d / 14), P, 11, { quake: true });
      if (e.attack !== undefined && e.alive) { e.attack = -1; e.hitT = 1; }
    }
    G.ui.toast('Yer Sarsıntısı!', 900);
  }, 320);
}

function throwHammer(G, P) {
  P.cdT = 2.5; P.thrown = true;
  const w = P.weapon; w.visible = false;
  const proj = G.assets.prop(P.weaponKey === 'gokcekic' ? 'gokcekic' : 'hammer'); proj.scale.setScalar(1.1);
  proj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x48c8ff); o.material.emissiveIntensity = 0.6; } });
  const cam = G.camera, dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = Math.max(-0.15, Math.min(0.35, dir.y)); dir.normalize();
  const start = P.pos.clone().add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(P.forward(), 0.6);
  P.yaw = Math.atan2(dir.x, dir.z);
  proj.position.copy(start); G.scene.add(proj);
  let t = 0, back = false; const hitSet = new Set();
  G.audio.whoosh(start, 0.6);
  G.tickers.push(dt => {
    t += dt;
    if (!back) {
      proj.position.addScaledVector(dir, 30 * dt);
      for (const e of [...G.actors, ...G.extraTargets]) {
        if (!e.alive || e.team === P.team || e.team === 'neutral' || hitSet.has(e)) continue;
        const c = e.center ? e.center() : e.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        if (c.distanceTo(proj.position) < (e.hitR || 0.6) + 0.7) {
          hitSet.add(e); e.takeHit(38, P, 6, { sky: true, quake: true });
          G.fx.skyBurst(proj.position.clone(), 30); G.fx.flash(proj.position.clone(), 0x9fdcff, 60, 0.2, 16);
          back = true;
        }
      }
      if (t > 0.62 || proj.position.y < heightAt(proj.position.x, proj.position.z)) back = true;
    } else {
      const hand = P.pos.clone().add(new THREE.Vector3(0, 1.3, 0));
      const to = hand.sub(proj.position), d = to.length();
      proj.position.addScaledVector(to.normalize(), Math.min(d, 34 * dt));
      if (d < 0.6 || t > 3) { G.scene.remove(proj); w.visible = true; P.thrown = false; return false; }
    }
    proj.rotation.x += dt * 22;
    G.fx.light(proj.position, 0x66ccff, 4, 7);
  });
}
