// Separate regions for the 2nd and 3rd acts. Each realm has its own ground,
// scenery, colliders and light, built once on first visit and kept. While a realm
// is active the steppe map is hidden and heightAt() reads the realm's ground.
import * as THREE from 'three';
import { fbm, setRealmHeight } from './world.js';

const ss = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

export class Realms {
  constructor(G) { this.G = G; this.cache = {}; this.active = null; }

  enter(name) {
    const G = this.G, W = G.world;
    if (this.active && this.active.name === name) return this.active;
    this.exit();
    const r = this.cache[name] || (this.cache[name] = this.build(name));
    for (const o of W.baseObjs) { if (o.userData.prevVis === undefined) o.userData.prevVis = o.visible; o.visible = false; o.userData.realmHidden = true; }
    r.group.visible = true;
    setRealmHeight(r.height);
    W.colliders = r.colliders;
    W.bound = { ...r.bound };
    G.gravityMul = r.gravity || 1;
    this.active = r;
    return r;
  }

  exit() {
    const G = this.G, W = G.world;
    if (!this.active) return;
    this.active.group.visible = false;
    for (const o of W.baseObjs) { o.visible = o.userData.prevVis ?? true; delete o.userData.prevVis; o.userData.realmHidden = false; }
    setRealmHeight(null);
    W.colliders = W.baseColliders;
    G.gravityMul = 1;
    this.active = null;
  }

  update(dt, t) { const r = this.active; if (r && r.update) r.update(dt, t); }

  // ---------- shared builders ----------
  ground(r, size, seg, colorFn) {
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, cols = [], c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + r.cx, z = pos.getZ(i) + r.cz;
      pos.setX(i, x); pos.setZ(i, z);
      const h = r.height(x, z); pos.setY(i, h);
      colorFn(x, z, h, c); cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = true; r.group.add(m);
    return m;
  }

  mountains(r, n, R0, R1, h0, h1, c0, c1, snow = true) {
    const grp = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + hash(i, 3) * 0.1, rr = R0 + hash(i, 7) * (R1 - R0);
      const hgt = h0 + hash(i, 11) * (h1 - h0), rad = hgt * 0.8 + hash(i, 13) * 40;
      const g = new THREE.ConeGeometry(rad, hgt, 7, 3), p = g.attributes.position, cl = [];
      for (let j = 0; j < p.count; j++) {
        const y = p.getY(j) + hgt / 2;
        p.setX(j, p.getX(j) * (0.85 + hash(j, i) * 0.3)); p.setZ(j, p.getZ(j) * (0.85 + hash(i, j) * 0.3));
        const cc = new THREE.Color(c0).lerp(new THREE.Color(c1), hash(j, 5) * 0.6);
        if (snow && y > hgt * 0.74) cc.set(0xeef0f2);
        cl.push(cc.r, cc.g, cc.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.position.set(r.cx + Math.cos(a) * rr, hgt / 2 - 6, r.cz + Math.sin(a) * rr); grp.add(m);
    }
    r.group.add(grp);
  }

  place(r, key, x, z, rot = 0, scale = 1, col = 0, yOff = 0) {
    const o = this.G.assets.prop(key);
    o.position.set(x, r.height(x, z) + yOff, z); o.rotation.y = rot;
    if (typeof scale === 'number') o.scale.setScalar(scale); else o.scale.set(...scale);
    r.group.add(o);
    if (col) r.colliders.push({ x, z, r: col });
    return o;
  }

  tint(o, color, opts = {}) {
    o.traverse(m => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      if (m.material.color) m.material.color = new THREE.Color(color);
      if (opts.map === false) m.material.map = null;
      if (opts.emissive) { m.material.emissive = new THREE.Color(opts.emissive); m.material.emissiveIntensity = opts.ei ?? 0.4; }
      if ('roughness' in m.material) { m.material.roughness = opts.rough ?? 0.9; m.material.metalness = opts.metal ?? 0.2; }
    });
    return o;
  }

  // a straight stone wall of castle-kit segments, with colliders
  wall(r, x0, z0, x1, z1, opts = {}) {
    const A = this.G.assets, len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 4));
    const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (opts.gap && opts.gap(x, z)) continue;
      const w = A.prop('cwall'); w.scale.set(len / n, opts.h || 4.2, 2.2); w.rotation.y = rot;
      w.position.set(x, r.height(x, z) - 0.2, z); r.group.add(w);
      r.colliders.push({ x, z, r: 2.1 });
    }
  }
  tower(r, x, z, s = 5, h = 7) {
    const A = this.G.assets, t = A.prop('tower'); t.scale.set(s, h, s); t.position.set(x, r.height(x, z) - 0.2, z); r.group.add(t);
    const roof = A.prop('towerRoof'); roof.scale.setScalar(s * 1.05); roof.position.set(x, r.height(x, z) + h * 1.31 - 0.5, z); r.group.add(roof);
    r.colliders.push({ x, z, r: s * 0.6 });
  }

  glowMat(color, k = 1) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }); }

  build(name) {
    const r = { name, group: new THREE.Group(), colliders: [], cx: 0, cz: 0, spots: {}, height: () => 0, bound: { x: 0, z: 0, R: 100 } };
    r.group.visible = false; r.group.userData.noCull = true;
    this.G.scene.add(r.group);
    setRealmHeight((x, z) => r.height(x, z)); // helpers borrowed from World read heightAt
    this['build_' + name](r);
    setRealmHeight(null);
    return r;
  }

  // ======================= Ordu-Balık: the Kağan's capital =======================
  build_ordu(r) {
    const half = 42;
    const terrace = (x, z) => ss(14.5 - Math.abs(x), 0, 2.5) * ss(-21.5 + -z, -1.5, 2.5) * ss(46 + z, 0, 2);
    r.height = (x, z) => {
      const d = Math.max(Math.abs(x), Math.abs(z));
      return fbm(x * 0.02 + 40, z * 0.02) * 4 * ss(d, 55, 130) + ss(d, 110, 220) * 18 + terrace(x, z) * 2.2;
    };
    r.bound = { x: 0, z: 18, R: 105 };
    const grass = new THREE.Color(0x8f9a52), dirt = new THREE.Color(0x9a8360), stone = new THREE.Color(0xa49a8a);
    this.ground(r, 520, 160, (x, z, h, c) => {
      const inside = Math.max(Math.abs(x), Math.abs(z)) < half - 1;
      c.copy(grass).lerp(new THREE.Color(0xb7a560), fbm(x * 0.05, z * 0.05));
      if (inside) c.lerp(dirt, 0.75);
      const street = 1 - ss(Math.abs(x), 3, 5); if (z > -22) c.lerp(new THREE.Color(0x8a7a66), street * (inside || z > 0 ? 1 : 0.6));
      if (terrace(x, z) > 0.5) c.copy(stone).lerp(new THREE.Color(0x8e8576), hash(Math.floor(x), Math.floor(z)) * 0.4);
    });
    this.mountains(r, 40, 300, 380, 70, 170, 0x6f6a64, 0x9a8c74);
    // walls, corner towers, south gate
    const gate = (x, z) => z > 0 && Math.abs(x) < 5;
    this.wall(r, -half, -half, half, -half); this.wall(r, -half, half, half, half, { gap: gate });
    this.wall(r, -half, -half, -half, half); this.wall(r, half, -half, half, half);
    for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half], [-6.5, half], [6.5, half], [-half, 0], [half, 0]]) this.tower(r, x, z, 5.5, 7.5);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 3), new THREE.MeshLambertMaterial({ color: 0x8e8576 }));
    lintel.position.set(0, r.height(0, half) + 7.6, half); lintel.castShadow = true; r.group.add(lintel);
    for (const x of [-6.5, 6.5]) { const b = this.G.assets.prop('banner'); b.scale.setScalar(3.4); b.position.set(x, r.height(x, half) + 10, half + 2.8); r.group.add(b); }
    // houses along the street and around the market
    const H = ['house15', 'house03', 'house04'];
    let k = 0;
    for (const z of [32, 20, 8, -4, -14]) for (const sx of [-1, 1]) {
      if (z === 8) continue; // market square
      this.place(r, H[k++ % 3], sx * 13, z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.15, 3.6);
      this.place(r, H[k++ % 3], sx * 28, z + 2, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.1, 3.6);
    }
    // market
    const W = this.G.world;
    const stall = (x, z, rot, col) => { W.stall(x, z, rot, col, r.group); W.colliders.pop(); r.colliders.push({ x, z, r: 1.1 }); };
    // World.stall places at steppe height; fix up the last group to realm height
    const fixLast = () => { const g = r.group.children[r.group.children.length - 1]; g.position.y = r.height(g.position.x, g.position.z); };
    stall(-8, 5, Math.PI / 2, '#a8332a'); fixLast(); stall(8, 11, -Math.PI / 2, '#2f5d8a'); fixLast(); stall(-8, 12, Math.PI / 2, '#3c7a3a'); fixLast();
    this.place(r, 'well', 0, 8, 0.4, 1, 0.95);
    this.place(r, 'barrel', -10, 3, 0, 1, 0.5); this.place(r, 'box', 10, 13.5, 0.4, 1, 0.5); this.place(r, 'pot1', -10, 14, 0);
    // the palace terrace: a great otağ, banners and a throne
    const otag = this.place(r, 'otag', 0, -33, Math.PI / 2, 1.9, 9.5);
    this.tint(otag, 0xf2e8d0, { rough: 0.95 });
    for (const x of [-9, 9]) { const b = this.G.assets.prop('banner'); b.scale.setScalar(3.2); b.position.set(x, r.height(x, -23) + 6.5, -23); r.group.add(b); }
    const throne = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.6, roughness: 0.4 }), red = new THREE.MeshLambertMaterial({ color: 0x8a2420 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.1), gold); seat.position.y = 0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.2), gold); back.position.set(0, 1.1, -0.45);
    const cush = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.9), red); cush.position.y = 0.66;
    throne.add(seat, back, cush); throne.traverse(o => { if (o.isMesh) o.castShadow = true; });
    throne.position.set(0, r.height(0, -25.5), -25.5); r.group.add(throne);
    r.colliders.push({ x: 0, z: -25.8, r: 0.9 });
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), new THREE.MeshLambertMaterial({ color: 0x8a2420 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, r.height(0, -17) + 0.03, -17); r.group.add(rug);
    // camp of yurts outside the gate
    for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.22, R = 66 + (i % 2) * 8; this.place(r, i % 3 ? 'yurt_beyaz' : 'yurt_kahve', Math.sin(a) * R, half + 12 + Math.cos(a) * 14 + (i % 2) * 6, -a, 1, 3.3); }
    r.spots = { gate: new THREE.Vector3(0, 0, half + 14), market: new THREE.Vector3(0, 0, 9), throne: new THREE.Vector3(0, 0, -25.5), terrace: new THREE.Vector3(0, 0, -21), dungeon: new THREE.Vector3(26, 0, -30) };
    // a dungeon door in the north-east corner (scene 15)
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.4), new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
    door.position.set(26, r.height(26, -32) + 1.5, -32.3); r.group.add(door); r.dungeonDoor = door;
    const dHouse = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 5), new THREE.MeshLambertMaterial({ color: 0x8e8576, flatShading: true }));
    dHouse.position.set(26, r.height(26, -35) + 2.2, -35); dHouse.castShadow = true; r.group.add(dHouse); r.colliders.push({ x: 26, z: -35, r: 3.6 });
  }

  // ======================= Tuz Gölü: the salt flat =======================
  build_tuz(r) {
    r.height = (x, z) => { const d = Math.hypot(x, z); return (fbm(x * 0.04, z * 0.04) - 0.5) * 0.6 + ss(d, 85, 150) * (8 + fbm(x * 0.03, z * 0.03) * 10); };
    r.bound = { x: 0, z: 0, R: 80 };
    const salt = new THREE.Color(0xeee9de), pink = new THREE.Color(0xe6c8be), sand = new THREE.Color(0xc9b28a);
    this.ground(r, 520, 170, (x, z, h, c) => {
      const d = Math.hypot(x, z);
      // hexagonal-ish cracks: dark lines where a cellular noise is near a border
      const cx = x * 0.35, cz = z * 0.35, fx = cx - Math.floor(cx), fz = cz - Math.floor(cz);
      const crack = (Math.min(fx, 1 - fx) < 0.05 || Math.min(fz, 1 - fz) < 0.05) ? 1 : 0;
      c.copy(salt).lerp(pink, ss(d, 40, 80) * 0.5 * fbm(x * 0.02, z * 0.02)).lerp(sand, ss(d, 85, 120));
      if (crack && d < 80) c.multiplyScalar(0.86);
    });
    this.mountains(r, 36, 260, 340, 50, 120, 0xb89a78, 0xd8c4a4, false);
    const ship = this.tint(this.G.assets.prop('ship2'), 0xd8d0c4, { rough: 1, metal: 0.1 });
    ship.scale.setScalar(0.6); ship.position.set(4, r.height(4, -38) - 4.2, -38); ship.rotation.set(-0.1, 0.4, 0.22); r.group.add(ship);
    for (let i = -3; i <= 3; i++) r.colliders.push({ x: 4 + i * 6.5 * Math.cos(0.4), z: -38 - i * 6.5 * Math.sin(0.4), r: 5.5 });
    // salt crystals and the bones of something huge
    const cryst = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 60; i++) {
      const a = hash(i, 1) * 6.28, d = 18 + hash(i, 2) * 60, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 + hash(i, 3) * 1.1, 0), cryst);
      m.scale.y = 1.6 + hash(i, 4); m.position.set(x, r.height(x, z) + 0.3, z); m.rotation.set(hash(i, 5), hash(i, 6) * 3, 0.3); m.castShadow = true; r.group.add(m);
    }
    const bone = new THREE.MeshLambertMaterial({ color: 0xf4efe2 });
    for (let i = 0; i < 9; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(3.2 - Math.abs(i - 4) * 0.25, 0.22, 6, 14, Math.PI), bone);
      rib.position.set(-30 + i * 2.2, r.height(-30, 22), 22 + i * 0.6); rib.rotation.y = 0.25; rib.castShadow = true; r.group.add(rib);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
    core.position.set(-2, r.height(-2, -27) + 1.8, -27); r.group.add(core); r.core = core;
    r.update = (dt, t) => { core.rotation.y += dt; core.position.y = r.height(-2, -27) + 1.8 + Math.sin(t * 2) * 0.1; };
    r.spots = { start: new THREE.Vector3(0, 0, 55), arena: new THREE.Vector3(0, 0, 5), core: new THREE.Vector3(-2, 0, -27) };
  }

  // ======================= Kara Orman: the dark forest =======================
  build_orman(r) {
    r.height = (x, z) => (fbm(x * 0.03, z * 0.03) - 0.4) * 4 + ss(Math.hypot(x, z), 90, 140) * 14;
    r.bound = { x: 0, z: 0, R: 70 };
    this.ground(r, 400, 130, (x, z, h, c) => {
      c.set(0x3e4a2c).lerp(new THREE.Color(0x2a3020), fbm(x * 0.08, z * 0.08)).lerp(new THREE.Color(0x4a3a28), ss(Math.hypot(x, z - 30), 6, 0) * 0.6);
    });
    // trees: dense outside the clearing, thinner along the path
    const A = this.G.assets, spots = { treeL: [], treeS: [] };
    for (let i = 0; i < 900; i++) {
      const x = (hash(i, 9) - 0.5) * 300, z = (hash(i, 19) - 0.5) * 300, d = Math.hypot(x, z);
      if (d < 16 || (Math.abs(x) < 4 && z > 0 && d < 70)) continue;
      if (d < 70 && hash(i, 29) < 0.35) continue;
      spots[hash(i, 39) < 0.6 ? 'treeL' : 'treeS'].push([x, z, 3 + hash(i, 49) * 2.2, hash(i, 59) * 6.28]);
      if (d < 75) r.colliders.push({ x, z, r: 0.6 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [key, list] of Object.entries(spots)) {
      const src = A.prop(key); src.updateMatrixWorld(true);
      src.traverse(o => {
        if (!o.isMesh) return;
        const mat = o.material.clone(); mat.color = new THREE.Color(0x6a7a6a);
        const im = new THREE.InstancedMesh(o.geometry, mat, list.length);
        list.forEach(([x, z, s, a], i) => { p.set(x, r.height(x, z) - 0.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); sc.setScalar(s); m4.compose(p, q, sc).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); r.group.add(im);
      });
    }
    // glowing mushrooms and will-o'-wisps
    const glow = this.glowMat(0x7fffd0);
    for (let i = 0; i < 70; i++) {
      const a = hash(i, 7) * 6.28, d = 6 + hash(i, 8) * 60, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16 + hash(i, 3) * 0.12, 8, 4, 0, 6.3, 0, 1.6), glow);
      cap.position.set(x, r.height(x, z) + 0.18, z); r.group.add(cap);
    }
    const ship = this.tint(this.G.assets.prop('ship'), 0x3a4a34, { rough: 1, metal: 0.2 });
    ship.scale.setScalar(0.45); ship.position.set(-3, r.height(-3, -34) - 3.4, -34); ship.rotation.set(0.15, -0.3, 0.12); r.group.add(ship);
    for (let i = -3; i <= 3; i++) r.colliders.push({ x: -3 + i * 5.2 * Math.cos(-0.3), z: -34 - i * 5.2 * Math.sin(-0.3), r: 4.6 });
    // the pod with the sleeping sky warrior
    const pod = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide }));
    glass.position.y = 1.4; const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.7, roughness: 0.4 }));
    base.position.y = 0.15; const cap = base.clone(); cap.position.y = 2.75;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 6, 24), this.glowMat(0x7fe8ff)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.32;
    pod.add(glass, base, cap, ring); pod.position.set(2, r.height(2, -20), -20); r.group.add(pod);
    r.colliders.push({ x: 2, z: -20, r: 1.2 }); r.pod = pod;
    r.spots = { start: new THREE.Vector3(0, 0, 62), clearing: new THREE.Vector3(0, 0, 4), pod: new THREE.Vector3(2, 0, -20) };
  }

  // ======================= Hisar'ın Altı: caves under the city =======================
  build_magara(r) {
    r.height = (x, z) => (fbm(x * 0.06, z * 0.06) - 0.5) * 1.2 + ss(Math.hypot(x * 1.4, z), 40, 62) * 20;
    r.bound = { x: 0, z: 0, R: 48 };
    this.ground(r, 220, 110, (x, z, h, c) => {
      c.set(0x3a3a40).lerp(new THREE.Color(0x24242a), fbm(x * 0.1, z * 0.1)).lerp(new THREE.Color(0x4a4650), ss(h, 2, 12));
    });
    // a ring of rock walls and a low rocky ceiling far up
    const rock = new THREE.MeshLambertMaterial({ color: 0x2c2c33, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const a = i / 70 * 6.28, d = 44 + hash(i, 1) * 8, x = Math.cos(a) * d / 1.4, z = Math.sin(a) * d;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(7 + hash(i, 2) * 6, 0), rock);
      m.position.set(x, 4 + hash(i, 3) * 6, z); m.scale.y = 1.8; m.rotation.set(hash(i, 4), hash(i, 5), 0); r.group.add(m);
    }
    const ceil = new THREE.Mesh(new THREE.SphereGeometry(80, 18, 8, 0, 6.3, 0, 1.2), new THREE.MeshLambertMaterial({ color: 0x14141a, side: THREE.BackSide, flatShading: true }));
    ceil.scale.y = 0.35; ceil.position.y = 2; r.group.add(ceil);
    // stalagmite pillars and crystals
    for (let i = 0; i < 24; i++) {
      const a = hash(i, 11) * 6.28, d = 12 + hash(i, 12) * 26, x = Math.cos(a) * d * 0.75, z = Math.sin(a) * d;
      if (Math.abs(x) < 5) continue;
      const h = 4 + hash(i, 13) * 8, m = new THREE.Mesh(new THREE.ConeGeometry(1 + hash(i, 14) * 1.2, h, 6), rock);
      m.position.set(x, r.height(x, z) + h / 2 - 0.3, z); m.castShadow = true; r.group.add(m); r.colliders.push({ x, z, r: 1.4 });
    }
    const cm = new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x30c8ff, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 40; i++) {
      const a = hash(i, 21) * 6.28, d = 10 + hash(i, 22) * 32, x = Math.cos(a) * d * 0.75, z = Math.sin(a) * d;
      const g = new THREE.Group();
      for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.25 + hash(i, j) * 0.4, 0), cm); c.scale.y = 2.5; c.position.set((hash(j, i) - 0.5) * 0.6, 0.3, (hash(i + 1, j) - 0.5) * 0.6); c.rotation.set((hash(j, i + 2) - 0.5) * 0.8, 0, (hash(i, j + 3) - 0.5) * 0.8); g.add(c); }
      g.position.set(x, r.height(x, z), z); r.group.add(g);
    }
    // the ship's metal hall at the far end, ribs of glowing lines
    const ship = this.tint(this.G.assets.prop('ship2'), 0x6a7480, { rough: 0.5, metal: 0.6 });
    ship.scale.setScalar(0.5); ship.position.set(0, r.height(0, -38) - 2, -38); ship.rotation.set(0, Math.PI / 2, 0.05); r.group.add(ship);
    for (let i = -2; i <= 2; i++) r.colliders.push({ x: i * 5.5, z: -40, r: 4.2 });
    const line = this.glowMat(0x7fe8ff);
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 0.12), line); b.position.set(-12 + i * 4.8, r.height(0, -30) + 1.75, -31); r.group.add(b); }
    r.spots = { start: new THREE.Vector3(0, 0, 38), hall: new THREE.Vector3(0, 0, 4), ship: new THREE.Vector3(0, 0, -28) };
  }

  // ======================= Hisar: the fortress under siege =======================
  build_hisar(r) {
    const C = { x: 0, z: -40 }, half = 26;
    r.height = (x, z) => fbm(x * 0.02, z * 0.02) * 3 + ss(Math.max(Math.abs(x - C.x), Math.abs(z - C.z)), 60, 30) * 3 + ss(Math.hypot(x, z), 160, 240) * 25;
    r.bound = { x: 0, z: -10, R: 85 };
    this.ground(r, 560, 160, (x, z, h, c) => {
      c.set(0x8a9a4e).lerp(new THREE.Color(0xb7a560), fbm(x * 0.05, z * 0.05));
      if (Math.max(Math.abs(x - C.x), Math.abs(z - C.z)) < half) c.lerp(new THREE.Color(0x8e8576), 0.75);
      c.lerp(new THREE.Color(0x7a6a50), (1 - ss(Math.abs(x), 3, 6)) * (z > C.z ? 0.7 : 0));
    });
    this.mountains(r, 40, 300, 380, 70, 160, 0x6f6a64, 0x9a8c74);
    const gate = (x, z) => z > C.z && Math.abs(x - C.x) < 4;
    this.wall(r, C.x - half, C.z - half, C.x + half, C.z - half, { h: 5 }); this.wall(r, C.x - half, C.z + half, C.x + half, C.z + half, { h: 5, gap: gate });
    this.wall(r, C.x - half, C.z - half, C.x - half, C.z + half, { h: 5 }); this.wall(r, C.x + half, C.z - half, C.x + half, C.z + half, { h: 5 });
    for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half], [-6, half], [6, half]]) this.tower(r, C.x + dx, C.z + dz, 6, 8.5);
    // the gate: two heavy leaves that the ram breaks
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    const gateG = new THREE.Group();
    for (const s of [-1, 1]) { const leaf = new THREE.Mesh(new THREE.BoxGeometry(3.6, 6, 0.5), wood); leaf.position.set(s * 1.8, 3, 0); leaf.castShadow = true; gateG.add(leaf); }
    gateG.position.set(C.x, r.height(C.x, C.z + half), C.z + half); r.group.add(gateG); r.gate = gateG;
    r.gateCols = [-2.6, 0, 2.6].map(dx => ({ x: C.x + dx, z: C.z + half, r: 1.6 })); r.colliders.push(...r.gateCols);
    // keep and houses
    this.tower(r, C.x, C.z - 6, 12, 10);
    for (const [k, dx, dz, rot] of [['house15', -14, 8, Math.PI / 2], ['house03', 14, 8, -Math.PI / 2], ['house04', -14, -12, Math.PI / 2], ['house15', 14, -12, -Math.PI / 2]]) this.place(r, k, C.x + dx, C.z + dz, rot, 1.1, 3.6);
    for (const x of [-6, 6]) { const b = this.G.assets.prop('banner'); this.tint(b, 0x7a1a1a); b.scale.setScalar(3.2); b.position.set(C.x + x, r.height(C.x + x, C.z + half) + 12, C.z + half + 3); r.group.add(b); }
    // the Kağan's camp to the south
    for (let i = 0; i < 7; i++) this.G.world.tent && (() => { const x = -30 + i * 10, z = 40 + (i % 2) * 6; this.G.world.tent(x, z, 0.2 * i, r.group); this.G.world.colliders.pop(); const g = r.group.children[r.group.children.length - 1]; g.position.y = r.height(x, z); r.colliders.push({ x, z, r: 2 }); })();
    r.spots = { camp: new THREE.Vector3(0, 0, 34), gate: new THREE.Vector3(C.x, 0, C.z + half), yard: new THREE.Vector3(C.x, 0, C.z + 8), keep: new THREE.Vector3(C.x, 0, C.z - 6) };
    r.openGate = () => { r.colliders = r.colliders.filter(c => !r.gateCols.includes(c)); this.G.world.colliders = r.colliders; };
    r.closeGate = () => { if (!r.colliders.includes(r.gateCols[0])) r.colliders.push(...r.gateCols); gateG.children.forEach((l, i) => { l.rotation.set(0, 0, 0); l.position.set(i ? 1.8 : -1.8, 3, 0); }); };
  }

  // ======================= Ergenekon: the hidden valley =======================
  build_ergenekon(r) {
    r.height = (x, z) => { const d = Math.hypot(x, z); return (fbm(x * 0.03, z * 0.03) - 0.5) * 2 + ss(d, 62, 92) * (34 + fbm(x * 0.05, z * 0.05) * 18); };
    r.bound = { x: 0, z: 0, R: 60 };
    this.ground(r, 360, 150, (x, z, h, c) => {
      c.set(0x8a7258).lerp(new THREE.Color(0x6a5444), fbm(x * 0.07, z * 0.07));
      if (h > 6) c.lerp(new THREE.Color(0x4a4048), ss(h, 6, 30));
      // veins of molten iron in the cliffs
      if (h > 4 && fbm(x * 0.2, z * 0.2) > 0.68) c.set(0xff6a20);
    });
    this.mountains(r, 30, 140, 200, 90, 180, 0x3a3038, 0x5a4048);
    const ship = this.tint(this.G.assets.prop('ship'), 0x4a4250, { rough: 0.7, metal: 0.5, emissive: 0x200810, ei: 0.5 });
    ship.scale.setScalar(0.9); ship.position.set(0, r.height(0, -48) - 5, -48); ship.rotation.set(-0.05, 0, 0.04); r.group.add(ship); r.ship = ship;
    for (let i = -4; i <= 4; i++) r.colliders.push({ x: i * 8.5, z: -46, r: 8 });
    // the altar: a stone circle with four pillars of light (the four woken ships)
    const stone = new THREE.MeshLambertMaterial({ color: 0x6a6070, flatShading: true });
    r.pillars = [];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.28, x = Math.cos(a) * 9, z = -10 + Math.sin(a) * 9;
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2 + (i % 2), 0.7), stone); st.position.set(x, r.height(x, z) + 1.5, z); st.rotation.y = -a; st.castShadow = true; r.group.add(st);
      r.colliders.push({ x, z, r: 0.8 });
      if (i % 2 === 0) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
        p.position.set(x * 1.25, 60, z * 1.25 + 2.5); r.group.add(p); r.pillars.push(p);
      }
    }
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 0.8, 8), stone); altar.position.set(0, r.height(0, -10) + 0.4, -10); r.group.add(altar);
    r.colliders.push({ x: 0, z: -10, r: 2.4 });
    const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4ab8ff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.2 }));
    anvil.position.set(0, r.height(0, -10) + 1.1, -10); r.group.add(anvil); r.anvil = anvil;
    r.update = (dt, t) => { r.pillars.forEach((p, i) => { p.material.opacity = 0.35 + Math.sin(t * 3 + i) * 0.12; }); };
    r.spots = { start: new THREE.Vector3(0, 0, 50), altar: new THREE.Vector3(0, 0, -10), field: new THREE.Vector3(0, 0, 12) };
  }

  // ======================= Space: the Swarm's mothership above the Earth =======================
  build_uzay(r) {
    const R = 46;
    r.height = (x, z) => { const d = Math.hypot(x, z); return d < R + 2 ? 0 : -400; };
    r.bound = { x: 0, z: 0, R: R - 2 };
    r.gravity = 0.45;
    // deck: a saucer of dark metal plates with glowing seams
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.7, roughness: 0.45 });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.8, 3, 48, 1), deckMat); deck.position.y = -1.5; deck.receiveShadow = true; r.group.add(deck);
    const under = new THREE.Mesh(new THREE.SphereGeometry(R * 0.82, 40, 12, 0, 6.3, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.8, roughness: 0.5 }));
    under.scale.y = 0.3; under.position.y = -3; r.group.add(under);
    const seam = this.glowMat(0x48e8ff);
    for (const rr of [10, 22, 34, R - 0.6]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.12, 4, 96), seam); ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; r.group.add(ring); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28, b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, R - 10), seam); b.position.set(Math.cos(a) * (R / 2 + 5), 0.02, Math.sin(a) * (R / 2 + 5)); b.rotation.y = -a + Math.PI / 2; r.group.add(b); }
    // rim pylons with lights and a low glowing guard rail
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.28, x = Math.cos(a) * (R - 1.2), z = Math.sin(a) * (R - 1.2);
      const py = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 5, 6), deckMat); py.position.set(x, 2.5, z); py.castShadow = true; r.group.add(py);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), this.glowMat(i % 2 ? 0xff4a6a : 0x48e8ff)); tip.position.set(x, 5.2, z); r.group.add(tip);
      r.colliders.push({ x, z, r: 0.8 });
    }
    // central spire: the boss stands before it
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4, 26, 6), new THREE.MeshStandardMaterial({ color: 0x2a2e3a, metalness: 0.8, roughness: 0.35 }));
    spire.position.set(0, 13, -24); spire.castShadow = true; r.group.add(spire); r.colliders.push({ x: 0, z: -24, r: 4.2 });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), this.glowMat(0xff3a5a)); eye.position.set(0, 9, -21.4); r.group.add(eye); r.eye = eye;
    // cover blocks
    for (const [x, z, w, d] of [[-14, 6, 3, 1.4], [14, 6, 3, 1.4], [-8, 20, 1.4, 3], [8, 20, 1.4, 3], [-22, -8, 3, 1.4], [22, -8, 3, 1.4]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), deckMat); b.position.set(x, 0.8, z); b.castShadow = true; b.receiveShadow = true; r.group.add(b);
      r.colliders.push({ x, z, r: Math.max(w, d) * 0.55 });
    }
    // our old sky ship docked at the rim
    const ship = this.tint(this.G.assets.prop('ship'), 0x7a6a5a, { rough: 0.9, metal: 0.3 });
    ship.scale.setScalar(0.35); ship.position.set(0, -2, R + 14); ship.rotation.y = Math.PI / 2; r.group.add(ship);
    // the Earth far below, with a soft atmosphere
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#1d4f8a'; x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 70; i++) { x.fillStyle = ['#3d7a3a', '#8a7a4a', '#4a8a3a', '#a89a6a'][i % 4]; x.beginPath(); x.ellipse(hash(i, 1) * 512, 40 + hash(i, 2) * 176, 10 + hash(i, 3) * 40, 6 + hash(i, 4) * 22, hash(i, 5) * 3, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 90; i++) { x.beginPath(); x.ellipse(hash(i, 6) * 512, hash(i, 7) * 256, 12 + hash(i, 8) * 30, 3 + hash(i, 9) * 6, hash(i, 10) * 0.6, 0, 7); x.fill(); }
    x.fillStyle = '#f0f4f8'; x.fillRect(0, 0, 512, 14); x.fillRect(0, 242, 512, 14);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), new THREE.MeshLambertMaterial({ map: tex, fog: false }));
    earth.position.set(-120, -560, -260); earth.rotation.z = 0.4; r.group.add(earth); r.earth = earth;
    const atm = new THREE.Mesh(new THREE.SphereGeometry(436, 48, 32), new THREE.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.18, side: THREE.BackSide, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    atm.position.copy(earth.position); r.group.add(atm);
    // a distant moon and two more Swarm ships hanging in the dark
    const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshLambertMaterial({ color: 0xbab4aa, fog: false })); moon.position.set(380, 160, -620); r.group.add(moon);
    for (const [px, py, pz, s] of [[-180, 60, -320, 1], [220, 30, -260, 0.7]]) {
      const sh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(18 * s, 12 * s, 3 * s, 24), new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.8, roughness: 0.4, fog: false }));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(18 * s, 0.4 * s, 4, 48), new THREE.MeshBasicMaterial({ color: 0x48e8ff, fog: false })); rim.rotation.x = Math.PI / 2;
      sh.add(body, rim); sh.position.set(px, py, pz); sh.rotation.z = 0.2; r.group.add(sh);
    }
    r.update = (dt, t) => { earth.rotation.y += dt * 0.01; r.eye.scale.setScalar(1 + Math.sin(t * 3) * 0.08); };
    r.spots = { start: new THREE.Vector3(0, 0, 36), center: new THREE.Vector3(0, 0, 4), boss: new THREE.Vector3(0, 0, -16) };
  }
}
