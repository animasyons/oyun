// Visibility system: don't draw or animate what the camera can't see.
//  - actors and horses outside the view (or far away) are hidden and skip their
//    skeleton work; close ones stay so their shadows still fall into view
//  - static scenery is hidden past the fog / draw distance
//  - only nearby scenery casts shadows
//  - the render resolution follows the frame rate
import * as THREE from 'three';

const S = new THREE.Sphere(), M = new THREE.Matrix4(), B = new THREE.Box3();

export class Culler {
  constructor(G, renderer) {
    this.G = G; this.renderer = renderer;
    this.frustum = new THREE.Frustum();
    this.items = []; this.known = new WeakSet();
    this.t = 0; this.scanT = 0;
    this.fpsT = 0; this.baseRatio = renderer.getPixelRatio(); this.ratio = this.baseRatio;
  }

  drawDist() {
    const f = this.G.scene.fog;
    const base = this.G.lowQ ? 120 : 170;
    return f && f.far ? Math.min(base, f.far + 25) : base;
  }

  // register top-level scenery that isn't a person, horse or effect
  scan() {
    const G = this.G;
    for (const o of G.scene.children) {
      if (this.known.has(o)) continue;
      this.known.add(o);
      if (o.isLight || o.isCamera || o.userData.dynamic || o.userData.noCull) continue;
      let skip = false; o.traverse(c => { if (c.frustumCulled === false || c.isPoints || c.isSprite) skip = true; });
      if (skip) continue;
      B.setFromObject(o); if (B.isEmpty()) continue;
      const sph = B.getBoundingSphere(new THREE.Sphere());
      if (sph.radius > 120) continue; // terrain, sky, big water: always on
      const casters = []; o.traverse(c => { if (c.isMesh && c.castShadow) casters.push(c); });
      this.items.push({ o, sph, casters, shadow: true, moving: !!o.userData.moving, p0: o.position.clone() });
    }
    // things taken out of the scene are restored and forgotten, so re-adding them works
    this.items = this.items.filter(it => {
      if (it.o.parent) return true;
      it.o.visible = true; for (const c of it.casters) c.castShadow = true;
      this.known.delete(it.o); return false;
    });
  }

  update(dt) {
    const G = this.G, cam = G.camera;
    cam.updateMatrixWorld();
    M.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(M);
    const cp = cam.position, far = this.drawDist();
    // people and horses, every frame (cheap)
    for (const a of G.actors) {
      if (a === G.player) { a.culled = false; a.obj.visible = true; continue; }
      const s = a.obj.scale.x || 1;
      S.center.set(a.pos.x, a.pos.y + 1 * s, a.pos.z); S.radius = 1.6 * s;
      const d = cp.distanceTo(S.center);
      const vis = d < 22 || (d < far && this.frustum.intersectsSphere(S));
      a.culled = !vis; a.obj.visible = vis;
      if (a.cape) a.cape.mesh.visible = vis;
      a.farLod = d > 45; // far people animate at a lower rate
    }
    for (const h of G.horses) {
      S.center.set(h.pos.x, h.pos.y + 1.2, h.pos.z); S.radius = 2.2;
      const d = cp.distanceTo(S.center);
      const vis = h.rider === G.player || d < 22 || (d < far && this.frustum.intersectsSphere(S));
      h.culled = !vis; h.obj.visible = vis;
    }
    // scenery, a few times a second
    this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 1.5; this.scan(); }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.2;
      const shadowR = G.lowQ ? 38 : 60;
      for (const it of this.items) {
        if (it.o.userData.realmHidden) { it.o.visible = false; continue; }
        if (!it.moving && it.o.position.distanceToSquared(it.p0) > 0.01) it.moving = true;
        if (it.moving) { B.setFromObject(it.o); B.getBoundingSphere(it.sph); }
        const d = cp.distanceTo(it.sph.center) - it.sph.radius;
        it.o.visible = d < far;
        const sh = d < shadowR;
        if (sh !== it.shadow) { it.shadow = sh; for (const c of it.casters) c.castShadow = sh; }
      }
    }
    this.adaptResolution(dt);
  }

  // keep the frame rate up by trading resolution, slowly and within limits
  adaptResolution(dt) {
    const G = this.G; if (G.test) return;
    this.fpsT += dt; if (this.fpsT < 2) return; this.fpsT = 0;
    const fps = G.fps || 60, min = Math.max(0.6, this.baseRatio * 0.6);
    let r = this.ratio;
    if (fps < 38) r = Math.max(min, r - 0.1);
    else if (fps > 56) r = Math.min(this.baseRatio, r + 0.05);
    if (Math.abs(r - this.ratio) > 0.01) {
      this.ratio = r; this.renderer.setPixelRatio(r);
      const c = this.renderer.domElement; this.renderer.setSize(c.clientWidth, c.clientHeight, false);
    }
  }
}
