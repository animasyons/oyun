// The steppe, the sky, light over a day, and the Kayalı Pınar oba.
import * as THREE from 'three';

// ---------- noise / terrain height ----------
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { let s = 0, a = 1, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, z * f); a *= 0.5; f *= 2.03; } return s / 1.875; }

// ---- the eastern road, the creek and Ak Pınar (1. Perde) ----
export const AKPINAR = new THREE.Vector3(235, 0, -35);
export const YANIK = new THREE.Vector3(178, 0, -98);
export const KIZILSU = new THREE.Vector3(88, 0, 128);
export const KURGAN = new THREE.Vector3(48, 0, -188);
export const ROAD = [[22, 2], [70, -2], [118, -6], [165, -18], [205, -30], [AKPINAR.x - 22, AKPINAR.z]];
export const ROADS = [ROAD,
  [[70, -2], [76, 50], [86, 104]],                    // south to Kızılsu
  [[12, -20], [26, -80], [40, -150]],                 // north to Kurgan
  [[165, -18], [170, -55], [176, -78]]];              // up to Yanık Söğüt
const ZONES = [[AKPINAR, 55, 120], [YANIK, 26, 70], [KIZILSU, 34, 85], [KURGAN, 42, 95]];
export const creekX = z => 118 + 14 * Math.sin(z * 0.025);
function segDist(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export function roadDist(x, z) { let d = 1e9; for (const R of ROADS) for (let i = 0; i < R.length - 1; i++) d = Math.min(d, segDist(x, z, R[i], R[i + 1])); return d; }
export function creekDist(x, z) { return Math.abs(x - creekX(z)) * 0.95; }

function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, 55, 160);
  const hills = k * (fbm(x * 0.012, z * 0.012) * 26 - 6) + k * k * 8;
  // keep the road and Ak Pınar's valley gentle
  let flat = 1 - THREE.MathUtils.smoothstep(roadDist(x, z), 12, 55);
  for (const [c, r0, r1] of ZONES) flat = Math.max(flat, 1 - THREE.MathUtils.smoothstep(Math.hypot(x - c.x, z - c.z), r0, r1));
  return hills * (1 - flat * 0.92) + flat * (fbm(x * 0.03, z * 0.03) - 0.5) * 1.6;
}
export function creekWaterY(z) { return baseHeight(creekX(z), z) - 0.45; }
// while a separate region (realm) is active, its own ground replaces the steppe
let REALM_H = null;
export function setRealmHeight(fn) { REALM_H = fn; }
export function heightAt(x, z) {
  if (REALM_H) return REALM_H(x, z);
  const h = baseHeight(x, z);
  const c = creekDist(x, z);
  return c < 6 ? h - 1.0 * (1 - THREE.MathUtils.smoothstep(c, 1.5, 5)) : h;
}

export const GRAVE = new THREE.Vector3(18, 0, -27);
export const OBA = {
  forge: new THREE.Vector3(7, 0, -5),
  anvil: new THREE.Vector3(5.6, 0, -3.2),
  trough: new THREE.Vector3(9.6, 0, -2.6),
  chest: new THREE.Vector3(10.2, 0, -5.8),
  well: new THREE.Vector3(-9, 0, 7),
  campfire: new THREE.Vector3(-1.5, 0, -1),
  spar: new THREE.Vector3(1, 0, 9),
  pen: new THREE.Vector3(22, 0, 14),
  gate: new THREE.Vector3(16.5, 0, 14),
  alpYurt: new THREE.Vector3(-3, 0, 17),
  familyYurt: new THREE.Vector3(-14, 0, -6),
  entrance: new THREE.Vector3(-34, 0, 2),
  meteor: new THREE.Vector3(40, 0, -300),
};

export class World {
  constructor(G) {
    this.G = G;
    const scene = G.scene;
    this.colliders = [];   // {x, z, r}
    this.dynamic = new THREE.Group(); scene.add(this.dynamic);

    // ---- sky dome ----
    this.skyU = { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, glow: { value: 0 }, glowDir: { value: new THREE.Vector3(0.13, 0.02, -1).normalize() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, hor, sunCol, sunDir, glowDir; uniform float glow; varying vec3 vD;
        void main(){ float h = clamp(vD.y, -0.1, 1.0); vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
          float s = max(dot(vD, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.25);
          float g = max(dot(vD, glowDir), 0.0); c += vec3(1.0,0.28,0.08) * glow * (pow(g, 40.0)*1.4 + pow(g,6.0)*0.25) * (1.0 - clamp(h*3.0,0.0,1.0)*0.5);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.renderOrder = -10; scene.add(sky); this.sky = sky;

    // stars
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1600; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(Math.random() * 0.95);
      sp.push(Math.sin(v) * Math.cos(u) * 800, Math.cos(v) * 800, Math.sin(v) * Math.sin(u) * 800);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
    // moon
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xf2efe0, fog: false, transparent: true, opacity: 0 }));
    this.moon.position.set(-300, 420, 420); this.moon.lookAt(0, 0, 0); scene.add(this.moon);

    // ---- lights ----
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6b5a3a, 1); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(G.lowQ ? 1024 : 2048, G.lowQ ? 1024 : 2048);
    const sc = this.sun.shadow.camera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun); scene.add(this.sun.target);
    scene.fog = new THREE.Fog(0xcfd8d6, 70, 520);

    this.buildGround();
    this.buildMountains();
    this.buildGrass();
    this.buildOba();
    this.buildCreek();
    this.buildTrees();
    this.buildAkPinar();
    this.buildYanik();
    this.buildKizilsu();
    this.buildKurgan();
    this.bound = { x: 0, z: 0, R: 62 };
    // everything that belongs to the steppe map (hidden while a realm is active)
    const keep = new Set([sky, this.stars, this.moon, this.hemi, this.sun, this.sun.target, this.dynamic]);
    this.baseObjs = scene.children.filter(o => !keep.has(o));
    this.baseColliders = this.colliders;

    this.tod = { from: null, to: null, k: 1 };
    this.setTime('day', 0);
  }

  // ---------- time of day ----------
  static PRESETS = {
    day:   { top: 0x4f86c6, hor: 0xd9e2d8, fog: 0xcad3cf, sun: 0xfff1d6, sunI: 2.6, hemiS: 0xdfe9ff, hemiG: 0x7a6542, hemiI: 1.05, sunPos: [60, 90, 40], stars: 0, moon: 0, exposure: 1.0, fogFar: 520 },
    dusk:  { top: 0x2d3d6e, hor: 0xe08a52, fog: 0x8a6a5a, sun: 0xffa060, sunI: 1.4, hemiS: 0x8b8fb8, hemiG: 0x4b3a2a, hemiI: 0.7, sunPos: [-120, 18, 30], stars: 0.2, moon: 0.4, exposure: 1.0, fogFar: 460 },
    night: { top: 0x070b1c, hor: 0x1f2a44, fog: 0x141b2c, sun: 0x9fb4ff, sunI: 0.55, hemiS: 0x4a5a8c, hemiG: 0x1a1612, hemiI: 0.42, sunPos: [-60, 80, 60], stars: 1, moon: 1, exposure: 1.15, fogFar: 380 },
    raid:  { top: 0x0b0a16, hor: 0x5a2416, fog: 0x2a1812, sun: 0xffc0a0, sunI: 0.55, hemiS: 0x7a5a6c, hemiG: 0x2a180e, hemiI: 0.6, sunPos: [-60, 80, 60], stars: 0.6, moon: 0.8, exposure: 1.2, fogFar: 300 },
    desert: { top: 0x5b9bd8, hor: 0xf2e9d8, fog: 0xeee4d2, sun: 0xfff3dc, sunI: 3.0, hemiS: 0xf6f2ea, hemiG: 0xb8a888, hemiI: 1.15, sunPos: [40, 100, 30], stars: 0, moon: 0, exposure: 0.95, fogFar: 420 },
    forest: { top: 0x3a4a48, hor: 0x6f7f6a, fog: 0x45564a, sun: 0xd8e8c0, sunI: 1.4, hemiS: 0x9aaa98, hemiG: 0x3a3a2c, hemiI: 1.0, sunPos: [30, 90, 20], stars: 0, moon: 0, exposure: 1.1, fogFar: 115 },
    cave:   { top: 0x05070c, hor: 0x0d1424, fog: 0x0b1220, sun: 0x8fb0ff, sunI: 0.55, hemiS: 0x5a6a90, hemiG: 0x1a1410, hemiI: 0.6, sunPos: [10, 90, 10], stars: 0, moon: 0, exposure: 1.3, fogFar: 95 },
    storm:  { top: 0x2a1838, hor: 0x8a3a2a, fog: 0x5a3430, sun: 0xffc0a0, sunI: 1.8, hemiS: 0xb08aa8, hemiG: 0x4a3024, hemiI: 1.0, sunPos: [-80, 40, -60], stars: 0.15, moon: 0, exposure: 1.15, fogFar: 380 },
    space:  { top: 0x000004, hor: 0x04050c, fog: 0x000000, sun: 0xffffff, sunI: 2.8, hemiS: 0x6a7aa8, hemiG: 0x1a1a24, hemiI: 0.6, sunPos: [120, 60, -80], stars: 1, moon: 0, exposure: 1.05, fogFar: 2000 },
    dawn:  { top: 0x3a5a8a, hor: 0xf0b48a, fog: 0xc0a090, sun: 0xffd2a0, sunI: 1.9, hemiS: 0xc8c8e0, hemiG: 0x5a4a38, hemiI: 0.85, sunPos: [140, 22, -60], stars: 0, moon: 0.15, exposure: 1.0, fogFar: 520 },
  };

  setTime(name, dur = 3) {
    const P = World.PRESETS[name];
    this.todName = name;
    const cur = this.tod.cur || this.snapshot(P);
    this.tod = { from: cur, to: this.snapshot(P), k: dur > 0 ? 0 : 1, dur: Math.max(dur, 0.0001), cur };
    if (dur <= 0) this.applyTod(this.tod.to);
  }
  snapshot(P) {
    return { top: new THREE.Color(P.top), hor: new THREE.Color(P.hor), fog: new THREE.Color(P.fog), sun: new THREE.Color(P.sun), sunI: P.sunI,
      hemiS: new THREE.Color(P.hemiS), hemiG: new THREE.Color(P.hemiG), hemiI: P.hemiI, sunPos: new THREE.Vector3(...P.sunPos), stars: P.stars, moon: P.moon, exposure: P.exposure, fogFar: P.fogFar };
  }
  applyTod(s) {
    this.tod.cur = s;
    this.skyU.top.value.copy(s.top); this.skyU.hor.value.copy(s.hor);
    this.skyU.sunDir.value.copy(s.sunPos).normalize(); this.skyU.sunCol.value.copy(s.sun).multiplyScalar(Math.min(1, s.sunI / 2));
    this.G.scene.fog.color.copy(s.fog); this.G.scene.fog.far = s.fogFar;
    this.sun.color.copy(s.sun); this.sun.intensity = s.sunI;
    this.hemi.color.copy(s.hemiS); this.hemi.groundColor.copy(s.hemiG); this.hemi.intensity = s.hemiI;
    this.sunOffset = s.sunPos;
    this.stars.material.opacity = s.stars; this.moon.material.opacity = s.moon;
    this.G.renderer.toneMappingExposure = s.exposure;
  }
  lerpTod(a, b, k) {
    const L = (x, y) => x + (y - x) * k;
    return { top: a.top.clone().lerp(b.top, k), hor: a.hor.clone().lerp(b.hor, k), fog: a.fog.clone().lerp(b.fog, k), sun: a.sun.clone().lerp(b.sun, k), sunI: L(a.sunI, b.sunI),
      hemiS: a.hemiS.clone().lerp(b.hemiS, k), hemiG: a.hemiG.clone().lerp(b.hemiG, k), hemiI: L(a.hemiI, b.hemiI), sunPos: a.sunPos.clone().lerp(b.sunPos, k),
      stars: L(a.stars, b.stars), moon: L(a.moon, b.moon), exposure: L(a.exposure, b.exposure), fogFar: L(a.fogFar, b.fogFar) };
  }

  update(dt, t, focus) {
    if (this.tod.k < 1) {
      this.tod.k = Math.min(1, this.tod.k + dt / this.tod.dur);
      const k = this.tod.k * this.tod.k * (3 - 2 * this.tod.k);
      this.applyTod(this.lerpTod(this.tod.from, this.tod.to, k));
    }
    // shadow camera follows the action
    const f = focus || new THREE.Vector3();
    this.sun.target.position.set(f.x, 0, f.z);
    this.sun.position.set(f.x + this.sunOffset.x, this.sunOffset.y, f.z + this.sunOffset.z);
    this.sky.position.set(f.x, 0, f.z); this.stars.position.copy(this.sky.position);
    if (this.gateMesh) this.gateMesh.rotation.y += (this.gateTarget - this.gateMesh.rotation.y) * Math.min(1, dt * 4);
    for (const h of this.horses) h.mixer.update(dt);
    if (this.kurganCore) { this.kurganCore.rotation.y += dt * 0.8; this.kurganCore.position.y += Math.sin(t * 2) * 0.002; }
  }

  // ---------- terrain ----------
  buildGround() {
    const size = 1200, seg = 240;
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, cols = [];
    const grassA = new THREE.Color(0x8a9a4e), grassB = new THREE.Color(0xb7a560), dry = new THREE.Color(0xc9b27a), dirt = new THREE.Color(0x8c7454), rock = new THREE.Color(0x8a8578);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z); pos.setY(i, h);
      const n = fbm(x * 0.03, z * 0.03), n2 = fbm(x * 0.15 + 9, z * 0.15);
      c.copy(grassA).lerp(grassB, n).lerp(dry, Math.max(0, n2 - 0.45) * 1.4);
      // trampled ground in the oba and the road from the west
      const r = Math.hypot(x, z);
      const camp = 1 - THREE.MathUtils.smoothstep(r, 10, 26);
      const road = Math.max((1 - THREE.MathUtils.smoothstep(Math.abs(z - 2 - Math.sin(x * 0.03) * 4), 1.2, 3.2)) * (x < -6 ? 1 : 0),
        (1 - THREE.MathUtils.smoothstep(roadDist(x, z), 1.2, 3.4)) * 0.9);
      const bank = 1 - THREE.MathUtils.smoothstep(creekDist(x, z), 2, 9);
      c.lerp(new THREE.Color(0x5f7a3a), bank * 0.6);
      const ak = 1 - THREE.MathUtils.smoothstep(Math.hypot(x - AKPINAR.x, z - AKPINAR.z), 10, 30);
      c.lerp(dirt, ak * 0.45);
      c.lerp(dirt, Math.min(0.75, camp * 0.55 + road * 0.8) * (0.7 + 0.3 * n2));
      if (h > 14) c.lerp(rock, Math.min(1, (h - 14) / 10));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    this.G.scene.add(m); this.ground = m;
  }

  buildMountains() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2 + hash(i, 3) * 0.1;
      const r = 330 + hash(i, 7) * 90;
      const hgt = 60 + hash(i, 11) * 110, rad = 70 + hash(i, 13) * 70;
      const g = new THREE.ConeGeometry(rad, hgt, 7, 3);
      const p = g.attributes.position, cl = [];
      for (let j = 0; j < p.count; j++) {
        const y = p.getY(j) + hgt / 2;
        p.setX(j, p.getX(j) * (0.85 + hash(j, i) * 0.3)); p.setZ(j, p.getZ(j) * (0.85 + hash(i, j) * 0.3));
        const snow = y > hgt * 0.72 ? 1 : 0;
        const cc = new THREE.Color(0x6f6a64).lerp(new THREE.Color(0x9a8c74), hash(j, 5) * 0.5).lerp(new THREE.Color(0xeef0f2), snow);
        cl.push(cc.r, cc.g, cc.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.position.set(Math.cos(a) * r, hgt / 2 - 4, Math.sin(a) * r);
      grp.add(m);
    }
    this.G.scene.add(grp);
  }

  buildGrass() {
    // three crossed blades per tuft
    const blade = new THREE.BufferGeometry();
    const v = [];
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3, cx = Math.cos(a) * 0.12, cz = Math.sin(a) * 0.12;
      v.push(-cx * 1.4, 0, -cz * 1.4, cx * 1.4, 0, cz * 1.4, cx * 0.3, 0.32, cz * 0.3);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); blade.computeVertexNormals();
    const n = this.G.lowQ ? 5000 : 19000;
    const mesh = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let i = 0;
    while (i < n) {
      const x = -130 + Math.random() * 430, z = -230 + Math.random() * 400;
      const r = Math.hypot(x, z);
      if (r > 130 && roadDist(x, z) > 45 && Math.hypot(x - AKPINAR.x, z - AKPINAR.z) > 90 && Math.hypot(x - YANIK.x, z - YANIK.z) > 60 && Math.hypot(x - KIZILSU.x, z - KIZILSU.z) > 60) continue;
      if (Math.abs(x - KIZILSU.x) < 19 && Math.abs(z - KIZILSU.z) < 19) continue;
      if (creekDist(x, z) < 2.6) continue;
      if (r < 13 && Math.random() < 0.85) continue;
      if (roadDist(x, z) < 2.2 && x > 20) continue;
      if (x < -6 && Math.abs(z - 2 - Math.sin(x * 0.03) * 4) < 2.5) continue;
      p.set(x, heightAt(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6.28);
      const sc = 0.5 + Math.random() * 0.9; s.set(sc, sc * (0.6 + Math.random() * 0.7), sc);
      m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
      c.setHSL(0.15 + Math.random() * 0.07, 0.28 + Math.random() * 0.18, 0.3 + Math.random() * 0.12); mesh.setColorAt(i, c);
      i++;
    }
    mesh.receiveShadow = true;
    this.G.scene.add(mesh);
    // scattered rocks
    const rg = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0x8e877c, flatShading: true }), 220);
    for (let j = 0; j < 220; j++) {
      let x, z; do { x = (Math.random() - 0.5) * 400; z = (Math.random() - 0.5) * 400; } while (Math.hypot(x, z) < 30 || roadDist(x, z) < 6 || Math.hypot(x - AKPINAR.x, z - AKPINAR.z) < 40);
      p.set(x, heightAt(x, z) - 0.2, z); q.setFromEuler(new THREE.Euler(Math.random(), Math.random() * 6, Math.random()));
      const sc = 0.3 + Math.random() ** 3 * 2.8; s.set(sc, sc * 0.7, sc * 1.1);
      m4.compose(p, q, s); rocks.setMatrixAt(j, m4);
    }
    rocks.castShadow = true; rocks.receiveShadow = true;
    this.G.scene.add(rocks);
  }

  place(key, x, z, rotY = 0, scale = 1, collideR = 0) {
    const o = this.G.assets.prop(key);
    o.position.set(x, heightAt(x, z), z); o.rotation.y = rotY; o.scale.setScalar(scale);
    this.G.scene.add(o);
    if (collideR) this.colliders.push({ x, z, r: collideR });
    return o;
  }

  // the well model is one mesh; pull the crank and the rope drum out into their own
  // pivot so they can actually turn. Parts are found as connected pieces of the mesh.
  splitWellCrank(well) {
    let mesh = null; well.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return;
    mesh.geometry = mesh.geometry.clone(); // prop clones share geometry
    const g = mesh.geometry, P = g.attributes.position, idx = g.index;
    const n = P.count, par = new Int32Array(n).map((_, i) => i);
    const f = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const tri = idx ? idx.array : null, triCount = idx ? idx.count / 3 : n / 3;
    const vi = (t, k) => (tri ? tri[t * 3 + k] : t * 3 + k);
    for (let t = 0; t < triCount; t++) { const a = f(vi(t, 0)); par[f(vi(t, 1))] = a; par[f(vi(t, 2))] = a; }
    const seen = new Map();
    for (let i = 0; i < n; i++) { const k = P.getX(i).toFixed(4) + ',' + P.getY(i).toFixed(4) + ',' + P.getZ(i).toFixed(4); if (seen.has(k)) par[f(i)] = f(seen.get(k)); else seen.set(k, i); }
    const box = new Map();
    for (let i = 0; i < n; i++) {
      const r = f(i); let b = box.get(r); if (!b) box.set(r, b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
    }
    const spin = new Set();
    for (const [r, b] of box) if (b[3] - b[0] > 1.0 && b[4] - b[1] < 0.6 && b[1] > 0.9 && b[4] < 1.7) spin.add(r);
    if (!spin.size) return;
    // axle height: centre of the drum (the narrower of the two pieces)
    let axleY = 1.43;
    for (const r of spin) { const b = box.get(r); if (b[3] - b[0] < 1.5) axleY = (b[1] + b[4]) / 2; }
    const keep = [], move = [];
    for (let t = 0; t < triCount; t++) (spin.has(f(vi(t, 0))) ? move : keep).push(vi(t, 0), vi(t, 1), vi(t, 2));
    const g2 = g.clone(); g2.setIndex(move); g2.translate(0, -axleY, 0);
    g.setIndex(keep);
    const pivot = new THREE.Group(); pivot.position.copy(mesh.position).add(new THREE.Vector3(0, axleY, 0));
    const m2 = new THREE.Mesh(g2, mesh.material); m2.castShadow = true; m2.receiveShadow = true;
    pivot.add(m2); mesh.parent.add(pivot);
    this.wellSpin = pivot; this.wellAxleY = axleY;
  }

  buildOba() {
    const A = this.G.assets, S = this.G.scene;
    this.yurts = {};
    const yurt = (name, key, p, rot, r) => { const o = this.place(key, p.x, p.z, rot, 1, r); this.yurts[name] = o; return o; };
    // doors face the oba centre
    const face = p => Math.atan2(-p.x, -p.z) - Math.PI / 2;
    yurt('family', 'yurt_beyaz', OBA.familyYurt, face(OBA.familyYurt), 3.3);
    yurt('alp', 'yurt_kucuk', OBA.alpYurt, face(OBA.alpYurt), 2.3);
    const others = [['yurt_kahve', 15, 7], ['yurt_beyaz', 17, -12], ['yurt_kahve', -17, 12], ['yurt_kucuk', 3, -19], ['yurt_beyaz', -6, -20], ['yurt_kucuk', 11, 19]];
    others.forEach(([k, x, z], i) => yurt('y' + i, k, new THREE.Vector3(x, 0, z), face(new THREE.Vector3(x, 0, z)), k === 'yurt_kucuk' ? 2.3 : 3.3));

    // forge: stone hearth, anvil, tools
    const stone = new THREE.MeshLambertMaterial({ color: 0x7d746a, flatShading: true });
    const iron = new THREE.MeshStandardMaterial({ color: 0x2e2f33, metalness: 0.7, roughness: 0.45 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    const F = OBA.forge, fy = heightAt(F.x, F.z) - 0.04;
    // hearth: an open ring of stones with a glowing coal bed sunk inside it
    const fstone = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 1, flatShading: true });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.78, 10, 1, true), fstone);
    ring.material.side = THREE.DoubleSide; ring.position.set(F.x, fy + 0.39, F.z); ring.castShadow = ring.receiveShadow = true; S.add(ring);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.11, 4, 10), fstone); rim.rotation.x = Math.PI / 2; rim.position.set(F.x, fy + 0.78, F.z); rim.castShadow = true; S.add(rim);
    const cc = document.createElement('canvas'); cc.width = cc.height = 64; const cx = cc.getContext('2d');
    cx.fillStyle = '#2a120a'; cx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 90; i++) { cx.fillStyle = ['#ff7a1a', '#d4400f', '#ffb347', '#3a1a0e'][i % 4]; cx.beginPath(); cx.arc(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 4, 0, 7); cx.fill(); }
    const ct = new THREE.CanvasTexture(cc); ct.colorSpace = THREE.SRGBColorSpace;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshBasicMaterial({ map: ct }));
    coals.rotation.x = -Math.PI / 2; coals.position.set(F.x, fy + 0.6, F.z); S.add(coals);
    // low back wall, a stone hood and a narrow chimney
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 0.45), fstone); wall.position.set(F.x, fy + 0.75, F.z - 1.25); wall.castShadow = wall.receiveShadow = true; S.add(wall);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.95, 0.95, 4), fstone); hood.rotation.y = Math.PI / 4; hood.position.set(F.x, fy + 1.95, F.z - 0.85); hood.castShadow = true; S.add(hood);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.5, 0.46), fstone); chim.position.set(F.x, fy + 3.15, F.z - 0.85); chim.castShadow = true; S.add(chim);
    for (const sx of [-0.85, 0.85]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.22), fstone); post.position.set(F.x + sx, fy + 1.3, F.z - 0.55); post.castShadow = true; S.add(post); }
    this.colliders.push({ x: F.x, z: F.z, r: 1.3 }, { x: F.x - 1, z: F.z - 1.25, r: 0.5 }, { x: F.x + 1, z: F.z - 1.25, r: 0.5 });
    const anvil = new THREE.Group();
    const ab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.4), iron); ab.position.y = 0.72;
    const at = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.32), iron); at.position.y = 0.98;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), iron); horn.rotation.z = Math.PI / 2; horn.position.set(0.66, 0.98, 0);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.55, 8), wood); st.position.y = 0.27;
    anvil.add(ab, at, horn, st); anvil.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    anvil.position.copy(OBA.anvil); anvil.position.y = heightAt(OBA.anvil.x, OBA.anvil.z) - 0.03; anvil.rotation.y = 0.5; S.add(anvil); this.anvil = anvil;
    this.colliders.push({ x: OBA.anvil.x, z: OBA.anvil.z, r: 0.6 });
    this.troughObj = this.place('trough', OBA.trough.x, OBA.trough.z, 0.3, 1, 0.9);
    // the water lives inside the trough, so it always lines up with it
    this.troughWater = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshStandardMaterial({ color: 0x4f86a8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.88 }));
    this.troughWater.rotation.x = -Math.PI / 2; this.troughWater.position.set(0, 0.06, 0); this.troughWater.visible = false;
    this.troughObj.add(this.troughWater);
    this.temp = [];
    this.place('firewood', F.x - 2.8, F.z - 2.2, 0.4, 1, 0.8);
    this.place('barrel', F.x - 1.6, F.z - 1.8, 0, 1, 0.5);
    this.place('stump', OBA.anvil.x - 1.3, OBA.anvil.z + 0.4, 0, 1, 0.4);
    this.chest = this.place('chest', OBA.chest.x, OBA.chest.z, -0.6, 1, 0.6);
    this.place('basin', F.x + 2.6, F.z + 1.2, 0, 1, 0.5);

    // well, campfire ring, clothesline, haystacks, sign
    this.wellObj = this.place('well', OBA.well.x, OBA.well.z, 0.7, 1, 0.95);
    this.buildWellShaft(OBA.well);
    this.splitWellCrank(this.wellObj);
    this.place('bucket', OBA.well.x + 1.3, OBA.well.z + 0.6, 0, 0.8);
    const C = OBA.campfire, cy = heightAt(C.x, C.z);
    // campfire: a ring of small stones and a teepee of logs over an ember bed
    for (let i = 0; i < 13; i++) {
      const a = i / 13 * Math.PI * 2, r = 0.66 + Math.random() * 0.05;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + Math.random() * 0.04, 0), stone);
      { const sx = C.x + Math.cos(a) * r, sz = C.z + Math.sin(a) * r; st.position.set(sx, heightAt(sx, sz) + 0.06, sz); } st.rotation.set(Math.random(), Math.random(), 0); st.scale.y = 0.7; st.castShadow = true; S.add(st);
    }
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), new THREE.MeshBasicMaterial({ color: 0x5a1a08 }));
    ember.rotation.x = -Math.PI / 2; ember.position.set(C.x, cy + 0.03, C.z); S.add(ember);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.95, 6), new THREE.MeshLambertMaterial({ color: 0x4a3220 }));
      l.position.set(C.x + Math.cos(a) * 0.2, cy + 0.36, C.z + Math.sin(a) * 0.2);
      l.lookAt(C.x, cy + 0.95, C.z); l.rotateX(Math.PI / 2); l.position.set(C.x + Math.cos(a) * 0.22, cy + 0.33, C.z + Math.sin(a) * 0.22);
      l.castShadow = true; S.add(l);
    }
    this.colliders.push({ x: C.x, z: C.z, r: 1.0 });
    this.place('bench', C.x + 2.6, C.z + 0.4, Math.PI / 2, 1, 0.6);
    this.place('bench', C.x - 2.4, C.z - 1.2, -Math.PI / 2.4, 1, 0.6);
    this.place('clothesline', -12, 12, 0.6);
    this.place('pot1', -15.5, -2.6, 0); this.place('pot2', -12.6, -9.8, 0);
    this.place('box', 14.2, 3.6, 0.3, 1, 0.5);
    this.hay = [this.place('hay1', 19, 4, 0, 1, 1.0), this.place('hay2', 23, 6, 1, 1, 1.0), this.place('hay3', -19, 0, 0.5, 1, 1.0), this.place('hay1', 12, -16, 0.2, 1, 1.0)];
    this.place('signpost', OBA.entrance.x + 2, OBA.entrance.z + 3.5, Math.PI / 2, 1);
    this.place('barrel_broken', -7, -12, 0.8);
    this.place('rake', 18.5, 2.6, 0.4); this.place('fork', 21.4, 3.2, 1.2);

    // horse pen: posts and rails, gate on the west side
    const pen = new THREE.Group(), P = OBA.pen, w = 11, d = 9;
    const post = (x, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.4, 6), wood); m.position.set(x, 0.7, z); m.castShadow = true; pen.add(m); };
    const rail = (x1, z1, x2, z2) => {
      for (const y of [0.55, 1.05]) {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.06), wood);
        m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); m.rotation.y = -Math.atan2(z2 - z1, x2 - x1); m.castShadow = true; pen.add(m);
      }
    };
    const x0 = P.x - w / 2, x1 = P.x + w / 2, z0 = P.z - d / 2, z1 = P.z + d / 2;
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    corners.forEach(([x, z]) => post(x, z));
    rail(x0, z0, x1, z0); rail(x1, z0, x1, z1); rail(x1, z1, x0, z1);
    // west side with a 2.4 m gate gap
    const gz0 = OBA.gate.z - 1.2, gz1 = OBA.gate.z + 1.2;
    post(x0, gz0); post(x0, gz1); rail(x0, z0, x0, gz0); rail(x0, gz1, x0, z1);
    for (let i = 0; i <= 10; i++) { // extra posts along long sides
      const t = i / 10; post(x0 + (x1 - x0) * t, z0); post(x0 + (x1 - x0) * t, z1);
    }
    S.add(pen);
    for (let i = 0; i <= 12; i++) { const t = i / 12; this.colliders.push({ x: x0 + (x1 - x0) * t, z: z0, r: 0.5 }, { x: x0 + (x1 - x0) * t, z: z1, r: 0.5 }); }
    for (let i = 0; i <= 10; i++) { const t = i / 10, z = z0 + (z1 - z0) * t; this.colliders.push({ x: x1, z, r: 0.5 }); if (z < gz0 || z > gz1) this.colliders.push({ x: x0, z, r: 0.5 }); }
    // gate: pivots at the north post
    const gate = new THREE.Group(); gate.position.set(x0, 0, gz0);
    for (const y of [0.5, 0.85, 1.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 2.4), wood); r.position.set(0, y, 1.2); r.castShadow = true; gate.add(r); }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 2.6), wood); brace.position.set(0, 0.85, 1.2); brace.rotation.x = 0.3; gate.add(brace);
    S.add(gate); this.gateMesh = gate; this.gateOpen(true, true);

    // horses (idle clip)
    this.horses = [];
    const hk = ['horse1', 'horse2', 'horse4'];
    hk.forEach((k, i) => {
      const h = A.char(k);
      h.position.set(P.x - 1.5 + i * 2.6, 0, P.z - 1.5 + (i % 2) * 3); h.rotation.y = i * 1.7 + 0.5;
      S.add(h);
      const mixer = new THREE.AnimationMixer(h);
      const clips = A.anims(k);
      const idle = clips.find(c => c.name === 'Idle') || clips[0];
      const act = mixer.clipAction(idle); act.play(); act.time = Math.random() * idle.duration;
      this.horses.push({ obj: h, mixer, clips });
    });

    // the sky ship lies on the horizon; hidden until it falls
    const ship = A.prop('ship');
    ship.scale.setScalar(1.25);
    ship.position.set(OBA.meteor.x, heightAt(OBA.meteor.x, OBA.meteor.z) - 9, OBA.meteor.z);
    ship.rotation.set(0.28, 0.9, -0.42);
    ship.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.55); } });
    ship.visible = false; S.add(ship); this.ship = ship;
  }

  // the creek: a ribbon of water following its bed
  buildCreek() {
    const pos = [], idx = [];
    let n = 0;
    for (let z = -170; z <= 170; z += 3) {
      const x = creekX(z), y = creekWaterY(z), w = 2.4;
      const dz = 3, dx = creekX(z + dz) - x, l = Math.hypot(dx, dz), nx = dz / l, nz = -dx / l;
      pos.push(x - nx * w, y, z - nz * w, x + nx * w, y, z + nz * w);
      if (n) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      n++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.creekMat = new THREE.MeshStandardMaterial({ color: 0x3f6f8a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 });
    const m = new THREE.Mesh(g, this.creekMat); m.receiveShadow = true;
    this.G.scene.add(m);
  }

  // Kenney trees, instanced: willows along the creek, groves around Ak Pınar, a few near home
  buildTrees() {
    const A = this.G.assets, rnd = (a, b) => a + Math.random() * (b - a);
    const spots = { treeL: [], treeS: [] };
    const add = (x, z, big) => {
      if (roadDist(x, z) < 5 || Math.hypot(x, z) < 34 || Math.hypot(x - AKPINAR.x, z - AKPINAR.z) < 26) return;
      if (Math.hypot(x - YANIK.x, z - YANIK.z) < 17 || (Math.abs(x - KIZILSU.x) < 26 && Math.abs(z - KIZILSU.z) < 26) || Math.hypot(x - KURGAN.x, z - KURGAN.z) < 40) return;
      if (creekDist(x, z) < 3.2) return;
      const s = big ? rnd(2.8, 3.9) : rnd(2.0, 2.9);
      spots[big ? 'treeL' : 'treeS'].push([x, z, s, Math.random() * 6.28]);
      this.colliders.push({ x, z, r: 0.18 * s });
    };
    for (let z = -150; z <= 150; z += 4.5) for (const side of [-1, 1]) if (Math.random() < 0.75) add(creekX(z) + side * rnd(4, 10), z + rnd(-2, 2), Math.random() < 0.6);
    for (let i = 0; i < 70; i++) { const a = Math.random() * 6.28, r = rnd(32, 70); add(AKPINAR.x + Math.cos(a) * r, AKPINAR.z + Math.sin(a) * r, Math.random() < 0.5); }
    for (let i = 0; i < 12; i++) { const a = rnd(-0.9, 1.2), r = rnd(46, 60); add(Math.cos(a) * r, Math.sin(a) * r, Math.random() < 0.4); }
    for (let i = 0; i < 26; i++) { const x = rnd(60, 220), z = rnd(-110, 90); if (roadDist(x, z) > 18) add(x, z, Math.random() < 0.4); }
    // Yanık Söğüt sits in a wooded hollow
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.28, r = rnd(19, 42); add(YANIK.x + Math.cos(a) * r, YANIK.z + Math.sin(a) * r, Math.random() < 0.6); }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    // instanced per 48 m cell, so whole cells drop out of view and out of shadows
    const CELL = 48;
    for (const [key, all] of Object.entries(spots)) {
      if (!all.length) continue;
      const cells = new Map();
      for (const t of all) { const k = Math.floor(t[0] / CELL) + ',' + Math.floor(t[1] / CELL); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(t); }
      const src = A.prop(key); src.updateMatrixWorld(true);
      for (const list of cells.values()) {
        const grp = new THREE.Group();
        src.traverse(o => {
          if (!o.isMesh) return;
          const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
          list.forEach(([x, z, s, r], i) => {
            p.set(x, heightAt(x, z) - 0.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r); sc.setScalar(s);
            m4.compose(p, q, sc).multiply(o.matrixWorld); im.setMatrixAt(i, m4);
          });
          im.computeBoundingSphere(); im.computeBoundingBox && im.computeBoundingBox();
          im.castShadow = true; im.receiveShadow = true;
          grp.add(im);
        });
        this.G.scene.add(grp);
      }
    }
  }

  // Ak Pınar: a larger oba at a spring, with the bey's tent and pens
  buildAkPinar() {
    const C = AKPINAR, S = this.G.scene;
    this.ak = { yurts: [], cages: [] };
    const face = p => Math.atan2(C.x - p.x, C.z - p.z) - Math.PI / 2;
    const ring = [['yurt_beyaz', 0.3], ['yurt_kahve', 1.1], ['yurt_beyaz', 1.9], ['yurt_kucuk', 2.6], ['yurt_kahve', 3.4], ['yurt_beyaz', 4.2], ['yurt_kucuk', 5.0], ['yurt_kahve', 5.7]];
    for (const [k, a] of ring) {
      const r = k === 'yurt_kucuk' ? 15 : 17, p = new THREE.Vector3(C.x + Math.cos(a) * r, 0, C.z + Math.sin(a) * r);
      this.ak.yurts.push(this.place(k, p.x, p.z, face(p), 1, k === 'yurt_kucuk' ? 2.3 : 3.3));
    }
    this.ak.otag = this.place('otag', C.x + 2, C.z - 2, Math.PI / 2 + 0.2, 1, 5.3);
    this.ak.otag.position.set(C.x + 30, heightAt(C.x + 30, C.z - 4), C.z - 4);
    this.colliders[this.colliders.length - 1].x = C.x + 30; this.colliders[this.colliders.length - 1].z = C.z - 4;
    this.place('well', C.x - 4, C.z - 6, 0.3, 1, 0.95);
    this.place('hay1', C.x + 8, C.z + 22, 0, 1, 1); this.place('hay2', C.x + 12, C.z + 24, 1, 1, 1);
    this.place('barrel', C.x - 9, C.z + 3, 0, 1, 0.5); this.place('box', C.x - 8, C.z + 5, 0.4, 1, 0.5);
    this.place('clothesline', C.x + 5, C.z - 12, 1.2);
    // wooden cages for the captives
    const wood = new THREE.MeshLambertMaterial({ color: 0x5c3d22 });
    [[-7, 4], [0, 8], [7, 4]].forEach(([dx, dz]) => {
      const g = new THREE.Group(); const x = C.x + dx, z = C.z + dz;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if (i > 0 && i < 3 && j > 0 && j < 3) continue;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), wood); b.position.set(-0.9 + i * 0.6, 0.95, -0.9 + j * 0.6); b.castShadow = true; g.add(b);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 2.0), wood); top.position.y = 1.9; top.castShadow = true; g.add(top);
      g.position.set(x, heightAt(x, z), z); S.add(g);
      this.colliders.push({ x, z, r: 1.15 });
      this.ak.cages.push({ g, pos: new THREE.Vector3(x, 0, z), collider: this.colliders[this.colliders.length - 1] });
    });
    // Bars' grave on the edge of home: a cairn with his hammer standing in it
    const stone = new THREE.MeshLambertMaterial({ color: 0x8a8278, flatShading: true });
    const grave = new THREE.Group();
    for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + Math.random() * 0.15, 0), stone); const a = Math.random() * 6.28, d = Math.random() * 0.7; r.position.set(Math.cos(a) * d * 1.3, 0.15 + (0.7 - d) * 0.5, Math.sin(a) * d * 0.7); r.castShadow = true; grave.add(r); }
    const hm = this.G.assets.prop('hammer10'); hm.position.set(0, 0.55, 0); hm.rotation.z = 0.12; grave.add(hm);
    grave.position.set(GRAVE.x, heightAt(GRAVE.x, GRAVE.z), GRAVE.z); grave.visible = false; S.add(grave);
    this.grave = grave;
  }

  // Hisar canvas tent: a ridge tent with a red stripe
  tent(x, z, rot, S) {
    const g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 32; c.height = 32; const cx = c.getContext('2d');
    cx.fillStyle = '#cbb894'; cx.fillRect(0, 0, 32, 32); cx.fillStyle = '#8f2a1c'; cx.fillRect(0, 22, 32, 4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CylinderGeometry(0, 1.9, 2.0, 3, 1); geo.rotateZ(Math.PI / 2); geo.rotateY(0); geo.scale(1.6, 1, 1);
    const m = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.2, 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 1, side: THREE.DoubleSide }));
    m.rotation.y = Math.PI / 4; m.scale.set(1.4, 1, 0.9); m.position.y = 1.1; m.castShadow = true; m.receiveShadow = true;
    g.add(m); g.position.set(x, heightAt(x, z), z); g.rotation.y = rot; S.add(g);
    this.colliders.push({ x, z, r: 1.6 });
    return g;
  }

  // Yanık Söğüt: the raiders' night camp in a wooded hollow
  buildYanik() {
    const C = YANIK, S = this.G.scene;
    this.yanik = { posts: [] };
    [[-8, -4, 0.4], [6, -7, -0.3], [9, 5, 2.4], [-7, 7, 2.9]].forEach(([dx, dz, r]) => this.tent(C.x + dx, C.z + dz, r, S));
    const wood = new THREE.MeshLambertMaterial({ color: 0x5c3d22 });
    [[-3, 9], [1, 10], [5, 9]].forEach(([dx, dz]) => {
      const x = C.x + dx, z = C.z + dz;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.8, 6), wood); post.position.set(x, heightAt(x, z) + 0.9, z); post.castShadow = true; S.add(post);
      this.colliders.push({ x, z, r: 0.25 });
      this.yanik.posts.push(new THREE.Vector3(x, 0, z + 0.45));
    });
    this.place('barrel', C.x - 2, C.z - 9, 0, 1, 0.5); this.place('box', C.x + 2, C.z - 10, 0.5, 1, 0.5); this.place('firewood', C.x + 3, C.z + 2, 0.4);
  }

  // market stall: four posts, a counter and a striped cloth roof
  stall(x, z, rot, color, S) {
    const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2c });
    for (const [px, pz] of [[-1.2, -0.7], [1.2, -0.7], [-1.2, 0.7], [1.2, 0.7]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, pz < 0 ? 2.3 : 2.0, 5), wood); p.position.set(px, pz < 0 ? 1.15 : 1.0, pz); p.castShadow = true; g.add(p); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.8), wood); counter.position.set(0, 0.9, 0.55); counter.castShadow = true; g.add(counter);
    const front = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.06), wood); front.position.set(0, 0.45, 0.92); g.add(front);
    const c = document.createElement('canvas'); c.width = 64; c.height = 16; const cx = c.getContext('2d');
    for (let i = 0; i < 8; i++) { cx.fillStyle = i % 2 ? '#efe4cc' : color; cx.fillRect(i * 8, 0, 8, 16); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.8), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2 + 0.2; roof.position.set(0, 2.18, 0); roof.castShadow = true; g.add(roof);
    g.position.set(x, heightAt(x, z), z); g.rotation.y = rot; S.add(g);
    this.colliders.push({ x, z, r: 1.1 });
  }

  // Kızılsu: a Hisar market town with a wooden palisade
  buildKizilsu() {
    const C = KIZILSU, S = this.G.scene, A = this.G.assets, half = 18, seg = 4;
    // palisade: sharpened logs, instanced
    const logs = [];
    const side = (x0, z0, x1, z1, gap) => {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.42);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        if (gap && Math.abs(x - C.x) < 3.2) continue;
        logs.push([x, z, 3.3 + Math.random() * 0.5]);
      }
      const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.ceil(len / 3);
      for (let i = 0; i <= steps; i++) { const t = i / steps, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (!(gap && Math.abs(x - C.x) < 3.2)) this.colliders.push({ x, z, r: 1.6 }); }
    };
    side(C.x - half, C.z - half, C.x + half, C.z - half, true); side(C.x - half, C.z + half, C.x + half, C.z + half);
    side(C.x - half, C.z - half, C.x - half, C.z + half); side(C.x + half, C.z - half, C.x + half, C.z + half);
    const logGeo = new THREE.CylinderGeometry(0.2, 0.22, 1, 7); logGeo.translate(0, 0.5, 0);
    const tipGeo = new THREE.ConeGeometry(0.2, 0.45, 7); tipGeo.translate(0, 0.22, 0);
    const logMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2c }), tipMat = new THREE.MeshLambertMaterial({ color: 0x8a6440 });
    const li = new THREE.InstancedMesh(logGeo, logMat, logs.length), ti = new THREE.InstancedMesh(tipGeo, tipMat, logs.length);
    const m4 = new THREE.Matrix4();
    logs.forEach(([x, z, h], i) => {
      const y = heightAt(x, z) - 0.3;
      m4.makeScale(1, h, 1).setPosition(x, y, z); li.setMatrixAt(i, m4);
      m4.makeTranslation(x, y + h, z); ti.setMatrixAt(i, m4);
    });
    li.castShadow = ti.castShadow = true; li.receiveShadow = true; S.add(li, ti);
    for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half], [-4.5, -half], [4.5, -half]]) {
      const x = C.x + dx, z = C.z + dz, t = A.prop('tower'); t.scale.set(3.4, 4.2, 3.4); t.position.set(x, heightAt(x, z), z); S.add(t);
      const r = A.prop('towerRoof'); r.scale.setScalar(3.6); r.position.set(x, heightAt(x, z) + 5.4, z); S.add(r);
      this.colliders.push({ x, z, r: 2.0 });
    }
    const b = A.prop('banner'); b.scale.setScalar(3); b.position.set(C.x + 4.5, heightAt(C.x, C.z) + 6.5, C.z - half); S.add(b);
    const houses = [['house15', -11, -9, 0], ['house03', -11, 2, Math.PI / 2], ['house04', -10, 11, Math.PI], ['house15', 11, -9, Math.PI], ['house04', 11, 3, -Math.PI / 2], ['house03', 10, 12, Math.PI]];
    for (const [k, dx, dz, r] of houses) { this.place(k, C.x + dx, C.z + dz, r, 1, 3.2); }
    // market in the square
    this.kz = { stall: new THREE.Vector3(C.x - 2, 0, C.z + 4) };
    this.stall(C.x - 2, C.z + 5.4, 0, '#a8332a', S); this.place('box', C.x - 4.2, C.z + 6, 0.2, 1, 0.4); this.place('barrel', C.x + 0.8, C.z + 6.5, 0, 1, 0.4);
    this.stall(C.x + 4, C.z - 2.4, Math.PI, '#2f5d8a', S); this.place('pot1', C.x + 5.6, C.z - 3, 0);
    this.place('well', C.x + 3, C.z + 9, 0.4, 1, 0.95);
    this.kz.camp = new THREE.Vector3(C.x + 24, 0, C.z + 4);   // by the river, outside the east wall
  }

  // Kurgan Dağı: burial mounds and an old sky ship half sunk in the earth
  buildKurgan() {
    const C = KURGAN, S = this.G.scene;
    const grass = new THREE.MeshLambertMaterial({ color: 0x7d8a4a, flatShading: true });
    [[-28, 10, 9], [-20, -18, 7], [24, -14, 8], [30, 16, 10], [-6, 30, 7], [8, -32, 6]].forEach(([dx, dz, r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), grass);
      m.scale.y = 0.45; m.position.set(C.x + dx, heightAt(C.x + dx, C.z + dz) - 0.3, C.z + dz); m.receiveShadow = true; m.castShadow = true; S.add(m);
      this.colliders.push({ x: C.x + dx, z: C.z + dz, r: r * 0.95 });
    });
    const ship = this.G.assets.prop('ship2');
    ship.scale.setScalar(0.55);
    ship.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color = new THREE.Color(0x7a5a44); o.material.roughness = 1; o.material.metalness = 0.2; } });
    ship.position.set(C.x + 2, heightAt(C.x, C.z) - 3.2, C.z - 16); ship.rotation.set(0.12, 0.35, -0.18);
    S.add(ship); this.kurganShip = ship;
    for (let i = -3; i <= 3; i++) this.colliders.push({ x: C.x + 2 + i * 6 * Math.cos(0.35), z: C.z - 16 - i * 6 * Math.sin(0.35), r: 5 });
    // the breach in the hull and the glowing core inside it
    this.kurganCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    this.kurganCore.position.set(C.x - 1, heightAt(C.x, C.z) + 1.6, C.z - 9); S.add(this.kurganCore);
    this.colliders.push({ x: C.x - 1, z: C.z - 9, r: 0.8 });
    this.tent(C.x - 14, C.z + 6, 0.5, S); this.tent(C.x + 15, C.z + 4, -0.4, S);
    this.place('box', C.x - 10, C.z + 2, 0.3, 1, 0.5); this.place('barrel', C.x + 11, C.z, 0, 1, 0.5); this.place('axe', C.x + 9, C.z - 1, 1.2);
    this.kurganPost = new THREE.Vector3(C.x + 6, 0, C.z + 8);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.8, 6), new THREE.MeshLambertMaterial({ color: 0x5c3d22 }));
    post.position.set(this.kurganPost.x, heightAt(this.kurganPost.x, this.kurganPost.z) + 0.9, this.kurganPost.z - 0.45); S.add(post);
  }

  // A deep shaft under the well. The ground is masked out inside the rim with the
  // stencil buffer, so you look down a stone throat to dark water ~6.5 m below.
  buildWellShaft(c) {
    const S = this.G.scene, R = 0.6, D = 7;
    const mask = new THREE.Mesh(new THREE.CircleGeometry(R, 20), new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
      stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
    mask.rotation.x = -Math.PI / 2; mask.position.set(c.x, 0.04, c.z); mask.renderOrder = -5;
    S.add(mask);
    const gm = this.ground.material;
    gm.stencilWrite = true; gm.stencilRef = 1; gm.stencilFunc = THREE.NotEqualStencilFunc;
    gm.stencilFail = THREE.KeepStencilOp; gm.stencilZFail = THREE.KeepStencilOp; gm.stencilZPass = THREE.KeepStencilOp;
    this.ground.renderOrder = 0;
    // stone throat, fading to black with depth
    const g = new THREE.CylinderGeometry(R, R, D, 18, 8, true);
    const col = [], p = g.attributes.position, top = new THREE.Color(0x605c58), bot = new THREE.Color(0x050505), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = (p.getY(i) + D / 2) / D;            // 1 at the top, 0 at the bottom
      cc.copy(bot).lerp(top, Math.pow(k, 2.2)).multiplyScalar(0.8 + 0.2 * Math.sin(i * 1.7));
      col.push(cc.r, cc.g, cc.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const shaft = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    shaft.position.set(c.x, -D / 2 + 0.05, c.z); S.add(shaft);
    const water = new THREE.Mesh(new THREE.CircleGeometry(R, 20), new THREE.MeshBasicMaterial({ color: 0x0d1a22, fog: false }));
    water.rotation.x = -Math.PI / 2; water.position.set(c.x, -6.5, c.z); S.add(water);
    this.wellWater = water;
  }

  setTroughLevel(k) { this.troughWater.visible = k > 0; this.troughWater.position.y = 0.06 + 0.19 * k; }

  gateOpen(open, instant) {
    this.gateTarget = open ? -1.9 : 0;
    if (instant) this.gateMesh.rotation.y = this.gateTarget;
    this.gateIsOpen = open;
  }

  // push a circle out of static colliders and keep it inside the play area
  collide(p, r) {
    for (const c of this.colliders) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
    }
    const B = this.bound || { x: 0, z: 0, R: 62 };
    const dx = p.x - B.x, dz = p.z - B.z, d = Math.hypot(dx, dz);
    if (d > B.R) { p.x = B.x + dx * B.R / d; p.z = B.z + dz * B.R / d; return true; }
    return false;
  }
}
