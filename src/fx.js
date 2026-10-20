// Particles (fire, smoke, sparks, embers, meteor trail) and one-off effects.
import * as THREE from 'three';

const VERT = `
attribute float size; attribute vec4 rgba;
varying vec4 vC;
uniform float scale;
void main(){
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying vec4 vC;
uniform float soft;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float a = vC.a * pow(1.0 - r, soft);
  gl_FragColor = vec4(vC.rgb, a);
}`;

class Pool {
  constructor(scene, cap, blending, soft) {
    this.cap = cap; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3); this.rgba = new Float32Array(cap * 4); this.size = new Float32Array(cap);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rgba', new THREE.BufferAttribute(this.rgba, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending,
      uniforms: { scale: { value: 600 }, soft: { value: soft } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2;
    scene.add(this.points);
    this.p = []; // particle records
  }
  add(o) {
    if (this.p.length >= this.cap) this.p.shift();
    this.p.push(o);
  }
  update(dt) {
    const arr = this.p;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i];
      o.age += dt;
      if (o.age >= o.life) continue;
      o.vx *= 1 - o.drag * dt; o.vy = o.vy * (1 - o.drag * dt) + o.grav * dt; o.vz *= 1 - o.drag * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.floor && o.y < 0.02) { o.y = 0.02; o.vy *= -0.3; o.vx *= 0.6; o.vz *= 0.6; }
      arr[w++] = o;
    }
    arr.length = w;
    for (let i = 0; i < w; i++) {
      const o = arr[i], k = o.age / o.life;
      this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
      const c0 = o.c0, c1 = o.c1;
      this.rgba[i * 4] = c0[0] + (c1[0] - c0[0]) * k;
      this.rgba[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * k;
      this.rgba[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * k;
      const fadeIn = o.fadeIn ? Math.min(1, o.age / o.fadeIn) : 1;
      this.rgba[i * 4 + 3] = o.a * fadeIn * (1 - k) ** (o.fadePow || 1);
      this.size[i] = o.s0 + (o.s1 - o.s0) * k;
    }
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.rgba.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const col = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const FIRE0 = col(0xffd27a), FIRE1 = col(0xc2310f), SMOKE0 = col(0x3b3530), SMOKE1 = col(0x77706a);

export class FX {
  constructor(G) {
    this.G = G;
    this.add = new Pool(G.scene, 5000, THREE.AdditiveBlending, 1.6);
    this.norm = new Pool(G.scene, 3500, THREE.NormalBlending, 1.2);
    this.fires = [];   // persistent emitters
    this.rings = [];
    this.flashes = [];
    // A fixed pool of point lights: three.js recompiles every material when the
    // number of lights changes, so lights are never added or removed at runtime.
    this.pool = [];
    for (let i = 0; i < (G.lowQ ? 4 : 7); i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1.6); G.scene.add(l); this.pool.push(l); }
    this.reqs = [];
  }

  // ask for a light this frame
  light(pos, color, intensity, distance) { this.reqs.push({ pos, color, intensity, distance }); }

  assignLights() {
    const f = this.G.player ? this.G.player.pos : new THREE.Vector3();
    for (const r of this.reqs) { const d = r.pos.distanceTo(f); r.score = r.intensity / (1 + d * d * 0.004); }
    this.reqs.sort((a, b) => b.score - a.score);
    this.pool.forEach((l, i) => {
      const r = this.reqs[i];
      if (r) { l.position.copy(r.pos); l.color.setHex(r.color); l.intensity = r.intensity; l.distance = r.distance; }
      else l.intensity = 0;
    });
    this.reqs.length = 0;
  }

  clear() {
    this.fires = []; this.flashes = []; this.reqs.length = 0; this.columnAt = null; this.add.p.length = 0; this.norm.p.length = 0;
    for (const r of this.rings) this.G.scene.remove(r.mesh);
    this.rings = [];
  }

  // persistent fire with light; returns handle {pos, scale, on}
  fire(pos, scale = 1, opts = {}) {
    const f = { pos: pos.clone(), scale, acc: 0, sacc: 0, on: true, smoke: opts.smoke !== false, emberRate: opts.embers ?? 1 };
    if (opts.light !== false) {
      f.light = { pos: pos.clone().add(new THREE.Vector3(0, 0.8 * scale, 0)), dist: 14 * scale };
      f.base = opts.intensity ?? 18 * scale;
    }
    this.fires.push(f);
    return f;
  }

  removeFire(f) {
    f.on = false;
    this.fires = this.fires.filter(x => x !== f);
  }

  sparks(p, n = 14, color = 0xffc46b, speed = 5, size = 0.12) {
    const c = col(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = rnd(-0.3, 1);
      this.add.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * speed * rnd(0.3, 1), vy: u * speed, vz: Math.sin(a) * speed * rnd(0.3, 1),
        drag: 1.5, grav: -9, life: rnd(0.25, 0.6), age: 0, c0: c, c1: col(0xff4010), a: 1, s0: size * 2.2, s1: size * 0.5, floor: true });
    }
  }

  dust(p, n = 10, color = 0xb59b72) {
    const c = col(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.norm.add({ x: p.x + Math.cos(a) * 0.3, y: p.y + 0.1, z: p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * rnd(0.5, 2), vy: rnd(0.2, 1), vz: Math.sin(a) * rnd(0.5, 2),
        drag: 2.5, grav: 0, life: rnd(0.6, 1.2), age: 0, c0: c, c1: c, a: 0.45, s0: 0.5, s1: 1.4 });
    }
  }

  skyBurst(p, n = 40) { // cyan lightning sparks of the sky hammer
    const c0 = col(0xd9fbff), c1 = col(0x3aa6ff);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(2, 10);
      this.add.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * s, vy: rnd(0, 6), vz: Math.sin(a) * s, drag: 3, grav: -4,
        life: rnd(0.3, 0.8), age: 0, c0, c1, a: 1, s0: 0.35, s1: 0.05 });
    }
  }

  ring(p, color = 0x7fd8ff, maxR = 7, life = 0.6) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.copy(p); m.position.y = 0.08;
    this.G.scene.add(m);
    this.rings.push({ mesh: m, age: 0, life, maxR });
  }

  flash(p, color = 0xffd9a0, intensity = 60, life = 0.25, dist = 30) {
    this.flashes.push({ pos: p.clone(), color, dist, age: 0, life, i0: intensity });
  }

  // meteor streak: a head moving along a path leaving a burning trail
  meteorTrail(p) {
    const c0 = col(0xfff1c9), c1 = col(0xff3b1a);
    for (let i = 0; i < 6; i++) this.add.add({ x: p.x + rnd(-1, 1), y: p.y + rnd(-1, 1), z: p.z + rnd(-1, 1), vx: rnd(-1, 1), vy: rnd(-1, 1), vz: rnd(-1, 1),
      drag: 0.5, grav: 0, life: rnd(1.2, 2.2), age: 0, c0, c1, a: 1, s0: rnd(10, 18), s1: 2 });
    for (let i = 0; i < 2; i++) this.norm.add({ x: p.x, y: p.y, z: p.z, vx: rnd(-1, 1), vy: rnd(-0.5, 1), vz: rnd(-1, 1), drag: 0.2, grav: 0,
      life: rnd(4, 7), age: 0, c0: col(0x5a4a44), c1: col(0x2a2830), a: 0.4, s0: 10, s1: 28, fadeIn: 0.3 });
  }

  // distant smoke column with glow (meteor site)
  column(pos) {
    this.columnAt = pos.clone(); this.columnAcc = 0;
  }

  update(dt, t) {
    for (const f of this.fires) {
      if (!f.on) continue;
      f.acc += dt * 60 * f.scale;
      while (f.acc > 1) {
        f.acc -= 1;
        const s = f.scale;
        this.add.add({ x: f.pos.x + rnd(-0.25, 0.25) * s, y: f.pos.y + 0.1, z: f.pos.z + rnd(-0.25, 0.25) * s, vx: rnd(-0.2, 0.2), vy: rnd(1.2, 2.4) * Math.sqrt(s), vz: rnd(-0.2, 0.2),
          drag: 1, grav: 0.5, life: rnd(0.5, 0.9), age: 0, c0: FIRE0, c1: FIRE1, a: 0.9, s0: rnd(0.7, 1.1) * s, s1: 0.15 * s, fadePow: 1.3 });
        if (Math.random() < 0.06 * f.emberRate) this.add.add({ x: f.pos.x, y: f.pos.y + 0.5 * s, z: f.pos.z, vx: rnd(-0.6, 0.6), vy: rnd(1.5, 3.5), vz: rnd(-0.6, 0.6),
          drag: 0.4, grav: 0.3, life: rnd(1.2, 2.4), age: 0, c0: col(0xffc46b), c1: col(0xff3010), a: 1, s0: 0.09, s1: 0.03 });
      }
      if (f.smoke) {
        f.sacc += dt * 6 * f.scale;
        while (f.sacc > 1) {
          f.sacc -= 1;
          this.norm.add({ x: f.pos.x + rnd(-0.2, 0.2), y: f.pos.y + 1.0 * f.scale, z: f.pos.z + rnd(-0.2, 0.2), vx: rnd(-0.2, 0.4), vy: rnd(0.8, 1.4), vz: rnd(-0.2, 0.2),
            drag: 0.3, grav: 0.1, life: rnd(2.5, 4), age: 0, c0: SMOKE0, c1: SMOKE1, a: 0.28, s0: 0.8 * f.scale, s1: 3.5 * f.scale, fadeIn: 0.4 });
        }
      }
      if (f.light) this.light(f.light.pos, 0xff8a3a, f.base * (0.8 + 0.25 * Math.sin(t * 17 + f.pos.x) * Math.sin(t * 7.3 + f.pos.z) + Math.random() * 0.1), f.light.dist);
    }
    if (this.columnAt) {
      this.columnAcc += dt * 10;
      while (this.columnAcc > 1) {
        this.columnAcc -= 1;
        const p = this.columnAt;
        this.norm.add({ x: p.x + rnd(-6, 6), y: p.y + rnd(0, 4), z: p.z + rnd(-6, 6), vx: rnd(-1, 2), vy: rnd(5, 8), vz: rnd(-1, 1), drag: 0.1, grav: 0,
          life: rnd(10, 14), age: 0, c0: col(0x4a3530), c1: col(0x2b2a30), a: 0.5, s0: 14, s1: 60, fadeIn: 1 });
        if (Math.random() < 0.5) this.add.add({ x: p.x + rnd(-5, 5), y: p.y + rnd(0, 6), z: p.z + rnd(-5, 5), vx: 0, vy: rnd(2, 5), vz: 0, drag: 0, grav: 0,
          life: rnd(1, 2), age: 0, c0: col(0xff6a2a), c1: col(0x801000), a: 0.7, s0: 18, s1: 4 });
      }
    }
    for (const r of this.rings) {
      r.age += dt; const k = r.age / r.life;
      r.mesh.scale.setScalar(0.5 + k * r.maxR); r.mesh.material.opacity = 1 - k;
    }
    this.rings = this.rings.filter(r => { if (r.age >= r.life) { this.G.scene.remove(r.mesh); return false; } return true; });
    for (const f of this.flashes) { f.age += dt; this.light(f.pos, f.color, f.i0 * Math.max(0, 1 - f.age / f.life) * 3, f.dist); }
    this.flashes = this.flashes.filter(f => f.age < f.life);
    this.assignLights();
    this.add.update(dt); this.norm.update(dt);
  }
}
