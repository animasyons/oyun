// Verlet cloth cape: pinned to the upper back, pushed out of the torso, legs and
// the horse, swung by movement and a little wind.
import * as THREE from 'three';
import { heightAt } from './world.js';

const COLS = 5, ROWS = 9;
const A = new THREE.Vector3(), B = new THREE.Vector3(), Q = new THREE.Vector3(), D = new THREE.Vector3();

export class Cape {
  constructor(actor, material, width = 0.5, length = 1.0) {
    this.a = actor; this.G = actor.G;
    const rig = actor.rig;
    this.bone = rig.b.Spine_03;
    this.b = rig.b;
    rig.reset(); rig.root.updateMatrixWorld(true);
    // pins in bone space: across the shoulder blades, just behind the back
    this.pins = [];
    const inv = this.bone.matrixWorld.clone().invert();
    for (let i = 0; i < COLS; i++) {
      const x = (i / (COLS - 1) - 0.5) * width;
      const wp = rig.root.localToWorld(new THREE.Vector3(x, 1.47, -0.15 - 0.03 * (1 - Math.abs(x) / (width / 2))));
      this.pins.push(wp.applyMatrix4(inv));
    }
    const s = new THREE.Vector3(); rig.root.getWorldScale(s); this.s = s.x;
    this.dx = width / (COLS - 1) * this.s; this.dy = length / (ROWS - 1) * this.s;
    this.n = COLS * ROWS;
    this.p = new Float32Array(this.n * 3); this.o = new Float32Array(this.n * 3);
    const geo = new THREE.PlaneGeometry(1, 1, COLS - 1, ROWS - 1);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.G.scene.add(this.mesh);
    this.caps = [];
    this.init = false;
  }

  pin(i, out) { return out.copy(this.pins[i]).applyMatrix4(this.bone.matrixWorld); }

  reset() {
    this.a.obj.updateMatrixWorld(true);
    const back = this.back();
    for (let c = 0; c < COLS; c++) {
      this.pin(c, A);
      for (let r = 0; r < ROWS; r++) {
        const k = (r * COLS + c) * 3;
        this.p[k] = A.x + back.x * r * 0.02; this.p[k + 1] = A.y - r * this.dy; this.p[k + 2] = A.z + back.z * r * 0.02;
        this.o[k] = this.p[k]; this.o[k + 1] = this.p[k + 1]; this.o[k + 2] = this.p[k + 2];
      }
    }
    this.init = true; this.prevPin = null;
  }

  back() { const y = this.a.yaw; return new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)); }

  // body as capsules in world space
  bodyCaps() {
    const b = this.b, s = this.s, caps = this.caps; caps.length = 0;
    const W = (n, v) => (b[n] ? b[n].getWorldPosition(v) : null);
    const cap = (n1, n2, r) => { const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(); if (W(n1, p1) && W(n2, p2)) caps.push([p1, p2, r * s]); };
    cap('Pelvis', 'Spine_03', 0.2); cap('Spine_03', 'Neck_01', 0.17);
    cap('Thigh_L', 'Calf_L', 0.11); cap('Calf_L', 'Foot_L', 0.085);
    cap('Thigh_R', 'Calf_R', 0.11); cap('Calf_R', 'Foot_R', 0.085);
    const m = this.a.mount;
    if (m) { // horse barrel and rump, measured from the saddle bone
      const f = m.forward(), c = m.saddle(new THREE.Vector3()); c.y -= 0.12;
      caps.push([c.clone().addScaledVector(f, 0.9), c.clone().addScaledVector(f, -1.05), 0.4]);
      caps.push([c.clone().addScaledVector(f, -1.05), c.clone().addScaledVector(f, -1.05).add(new THREE.Vector3(0, -0.5, 0)), 0.36]);
    }
  }

  update(dt) {
    const a = this.a;
    a.obj.updateMatrixWorld(true);
    this.pin(0, A);
    if (!this.init || A.distanceTo(Q.set(this.p[0], this.p[1], this.p[2])) > 1.5) this.reset();
    this.bodyCaps();
    if (!this.prevPin) this.prevPin = this.pins.map((_, c) => this.pin(c, new THREE.Vector3()));
    const steps = Math.min(8, Math.max(1, Math.ceil(dt / 0.017))), h = Math.min(dt, 0.14) / steps;
    const back = this.back();
    const t = a.time || 0;
    // relative wind: still air plus a breeze, felt against movement
    const wind = new THREE.Vector3(Math.sin(t * 0.7) * 0.6 + 0.4, 0, Math.cos(t * 0.5) * 0.4);
    for (let st = 0; st < steps; st++) {
      // integrate
      for (let i = 0; i < this.n; i++) {
        const k = i * 3, r = Math.floor(i / COLS);
        if (r === 0) continue;
        const fl = 0.6 + 0.4 * Math.sin(t * 6 + i * 0.7);
        const dmp = Math.pow(0.18, h); // air drag, frame-rate independent
        let vx = (this.p[k] - this.o[k]) * dmp, vy = (this.p[k + 1] - this.o[k + 1]) * dmp, vz = (this.p[k + 2] - this.o[k + 2]) * dmp;
        const vm = Math.hypot(vx, vy, vz), lim = 14 * h; if (vm > lim) { vx *= lim / vm; vy *= lim / vm; vz *= lim / vm; }
        this.o[k] = this.p[k]; this.o[k + 1] = this.p[k + 1]; this.o[k + 2] = this.p[k + 2];
        this.p[k] += vx + wind.x * fl * h * h * 3; this.p[k + 1] += vy - 9.8 * h * h; this.p[k + 2] += vz + wind.z * fl * h * h * 3;
      }
      // pins follow the back
      const f = (st + 1) / steps;
      for (let c = 0; c < COLS; c++) { this.pin(c, A); A.lerp(this.prevPin[c], 1 - f); const k = c * 3; this.p[k] = this.o[k] = A.x; this.p[k + 1] = this.o[k + 1] = A.y; this.p[k + 2] = this.o[k + 2] = A.z; }
      for (let it = 0; it < 4; it++) {
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          if (c < COLS - 1) this.link(i, i + 1, this.dx);
          if (r < ROWS - 1) this.link(i, i + COLS, this.dy);
          if (r < ROWS - 2) this.link(i, i + 2 * COLS, this.dy * 2, 0.5);
          if (c < COLS - 2) this.link(i, i + 2, this.dx * 2, 0.3);
        }
        this.collide(back);
      }
    }
    for (let c = 0; c < COLS; c++) this.pin(c, this.prevPin[c]);
    // write mesh: plane geometry vertices run row by row from the top left
    const pos = this.mesh.geometry.attributes.position;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c, k = i * 3;
      pos.setXYZ(r * COLS + (COLS - 1 - c), this.p[k], this.p[k + 1], this.p[k + 2]);
    }
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingSphere();
  }

  link(i, j, rest, stiff = 1) {
    const ki = i * 3, kj = j * 3;
    const dx = this.p[kj] - this.p[ki], dy = this.p[kj + 1] - this.p[ki + 1], dz = this.p[kj + 2] - this.p[ki + 2];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    if (stiff < 1 && d < rest) return; // bend links only resist stretch, so the cloth can fold
    const diff = (d - rest) / d * 0.5 * stiff;
    const pinI = i < COLS, pinJ = j < COLS;
    const wi = pinI ? 0 : pinJ ? 2 : 1, wj = pinJ ? 0 : pinI ? 2 : 1;
    this.p[ki] += dx * diff * wi; this.p[ki + 1] += dy * diff * wi; this.p[ki + 2] += dz * diff * wi;
    this.p[kj] -= dx * diff * wj; this.p[kj + 1] -= dy * diff * wj; this.p[kj + 2] -= dz * diff * wj;
  }

  collide(back) {
    // torso plane: cloth never passes in front of the shoulder blades
    this.pin((COLS - 1) >> 1, B);
    for (let i = COLS; i < this.n; i++) {
      const k = i * 3; Q.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      for (const [p1, p2, r] of this.caps) {
        D.subVectors(p2, p1); const L = D.lengthSq();
        const tt = L > 0 ? Math.max(0, Math.min(1, A.subVectors(Q, p1).dot(D) / L)) : 0;
        A.copy(p1).addScaledVector(D, tt);
        const dd = Q.distanceTo(A);
        if (dd < r + 0.02) { if (dd < 1e-5) Q.addScaledVector(back, r); else Q.sub(A).multiplyScalar((r + 0.02) / dd).add(A); }
      }
      // above the hips, keep behind the back plane
      if (Q.y > B.y - 0.55 * this.s && !this.a.mount) {
        const depth = (Q.x - B.x) * back.x + (Q.z - B.z) * back.z;
        if (depth < 0.01) Q.addScaledVector(back, 0.01 - depth);
      }
      const gy = heightAt(Q.x, Q.z) + 0.03; if (Q.y < gy) Q.y = gy;
      this.p[k] = Q.x; this.p[k + 1] = Q.y; this.p[k + 2] = Q.z;
    }
  }

  dispose() { this.G.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
