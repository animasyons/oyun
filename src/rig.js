// Procedural animation for the craftpix humanoid rig (T-pose, no clips).
// Every pose is expressed as rotations about axes in the CHARACTER's frame
// (x = character's left, y = up, z = forward), converted into each bone's
// local frame from its rest orientation. That keeps the code readable:
// "swing the right thigh forward" = rotate about +x.
import * as THREE from 'three';

const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _w = new THREE.Quaternion();

const BONES = ['Pelvis', 'Spine_01', 'Spine_02', 'Spine_03', 'Neck_01', 'Head',
  'Clavicle_L', 'Upperarm_L', 'Lowerarm_L', 'Hand_L', 'Clavicle_R', 'Upperarm_R', 'Lowerarm_R', 'Hand_R',
  'Thigh_L', 'Calf_L', 'Foot_L', 'Thigh_R', 'Calf_R', 'Foot_R',
  ...['L', 'R'].flatMap(s => ['Thumb', 'Index', 'Ring'].flatMap(f => [1, 2, 3].map(i => `${f}_0${i}_${s}`)))];
const UPRIGHT = new Set(['Pelvis', 'Spine_01', 'Spine_02', 'Spine_03', 'Neck_01', 'Head']);
const FINGER_CURL = { 1: 1.15, 2: 1.35, 3: 0.9 };

// ---- gait helpers (Williams, "The Animator's Survival Kit": walks & runs) ----
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// smooth minimum: the pelvis follows whichever leg is the most loaded, without a kink
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// periodic Catmull-Rom through 12 keys, one every 30 degrees of the stride
function cyc12(k, u) {
  u = ((u % 1) + 1) % 1; const f = u * 12, i = Math.floor(f), t = f - i;
  const p0 = k[(i + 11) % 12], p1 = k[i % 12], p2 = k[(i + 1) % 12], p3 = k[(i + 2) % 12];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
// Sole angle against the ground (toe up = +) over one foot's cycle: heel strike, flat, heel lift, toe-off, swing.
const SOLE_WALK = [0.28, 0.05, 0, 0, 0, -0.08, -0.30, -0.55, -0.45, -0.25, -0.05, 0.18];
const SOLE_RUN = [0.10, 0.02, 0, -0.02, -0.05, -0.12, -0.35, -0.65, -0.60, -0.35, -0.05, 0.08];
// ground speed (m/s) -> stride. The phase advances so that a planted foot moves back exactly as fast as the body
// moves forward (no skating). A walk becomes a run (with flight) between about 2.2 and 3.1 m/s.
export function gait(v) {
  const run = sstep((v - 2.2) / 0.9), sprint = clamp((v - 3.4) / 2.8, 0, 1);
  const S = lerp(0.40 + 0.16 * v, 0.9 + 0.08 * v, run);   // ground covered per step
  const fs = lerp(lerp(0.62, 0.40, run), 0.27, sprint);   // fraction of the cycle a foot is planted (a run has flight)
  return { run, S, fs, rate: v > 0.01 ? Math.PI * v / S : 0 };  // rate: phase radians per second
}

export class Rig {
  constructor(root) {
    this.root = root;
    this.b = {};
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Quaternion();
    root.getWorldQuaternion(rootInv).invert();
    root.traverse(o => { if (o.isBone && BONES.includes(o.name) && !this.b[o.name]) this.b[o.name] = o; });
    this.rest = {};      // local rest quaternion
    this.restW = {};     // rest orientation relative to the character root
    for (const [n, bone] of Object.entries(this.b)) {
      this.rest[n] = bone.quaternion.clone();
      const w = new THREE.Quaternion(); bone.getWorldQuaternion(w);
      this.restW[n] = rootInv.clone().multiply(w);
    }
    this.pelvisRestPos = this.b.Pelvis ? this.b.Pelvis.position.clone() : null;
    // Which side is the character's left? Measure from the arm bones so the
    // model frame is right regardless of export conventions.
    const pl = new THREE.Vector3(), pr = new THREE.Vector3();
    if (this.b.Upperarm_L && this.b.Upperarm_R) {
      this.b.Upperarm_L.getWorldPosition(pl); this.b.Upperarm_R.getWorldPosition(pr);
      root.worldToLocal(pl); root.worldToLocal(pr);
      this.leftSign = Math.sign(pl.x - pr.x) || 1;
    } else this.leftSign = 1;
    // leg geometry in the sagittal plane, for the stride's two-bone IK
    if (this.b.Thigh_L && this.b.Calf_L && this.b.Foot_L) {
      const Wl = n => root.worldToLocal(this.b[n].getWorldPosition(new THREE.Vector3()));
      const hp = Wl('Thigh_L'), kn = Wl('Calf_L'), an = Wl('Foot_L');
      const rs = new THREE.Vector3(); root.getWorldScale(rs); const k = rs.x;
      this.geo = {
        l1: hp.distanceTo(kn) * k, l2: kn.distanceTo(an) * k,
        th0: Math.atan2(kn.z - hp.z, hp.y - kn.y), sh0: Math.atan2(an.z - kn.z, kn.y - an.y),
        hA: 1.17 * an.y * k, heel: 0.425 * an.y * k, ball: 2.3 * an.y * k,   // ankle height / heel / ball, from the sole
        hipRest: (hp.y - an.y + 1.17 * an.y) * k,
      };
    }
    this.t = 0;
    this.setupHands();
    const pw = new THREE.Vector3(), rw = new THREE.Vector3();
    if (this.b.Pelvis) { this.b.Pelvis.getWorldPosition(pw); root.getWorldPosition(rw); this.pelvisH = pw.y - rw.y; } else this.pelvisH = 0.95;
  }

  // attach an object given in the character's own (model) space to a bone, at rest pose
  attachModelSpace(boneName, obj) {
    const bone = this.b[boneName]; if (!bone) return;
    this.reset(); this.root.updateMatrixWorld(true);
    obj.updateMatrix();
    const m = bone.matrixWorld.clone().invert().multiply(this.root.matrixWorld).multiply(obj.matrix);
    m.decompose(obj.position, obj.quaternion, obj.scale);
    bone.add(obj);
  }

  // Knuckle line, finger direction and palm offset per hand, measured at rest,
  // so fists and grips work whatever the export conventions are.
  setupHands() {
    this.hand = {};
    const P = n => { const v = new THREE.Vector3(); this.b[n].getWorldPosition(v); return this.root.worldToLocal(v); };
    for (const s of ['L', 'R']) {
      const h = this.b['Hand_' + s], i1 = this.b['Index_01_' + s], r1 = this.b['Ring_01_' + s];
      if (!h || !i1 || !r1) continue;
      const hp = P('Hand_' + s), ip = P('Index_01_' + s), rp = P('Ring_01_' + s);
      const mid = ip.clone().add(rp).multiplyScalar(0.5);
      const fingerDir = mid.clone().sub(hp).normalize();
      // root-local distances include the armature scale; convert to metres
      const rs = new THREE.Vector3(); this.root.getWorldScale(rs);
      const palmOff = mid.distanceTo(hp) * rs.x * 0.8;
      let across = ip.clone().sub(rp).normalize();
      // curl direction: fingertips should move toward the thumb side of the palm
      const tp = this.b['Thumb_01_' + s] ? P('Thumb_01_' + s) : null;
      const palmN = new THREE.Vector3().crossVectors(fingerDir, across).normalize();
      if (tp && tp.clone().sub(hp).dot(palmN) < 0) palmN.negate();
      // rotating about `across` by +a must swing fingerDir toward palmN
      const test = fingerDir.clone().applyAxisAngle(across, 0.3);
      if (test.dot(palmN) < fingerDir.dot(palmN)) across.negate();
      const axes = {};
      for (const f of ['Index', 'Ring', 'Thumb']) for (const i of [1, 2, 3]) {
        const n = `${f}_0${i}_${s}`; if (!this.b[n]) continue;
        const ax = f === 'Thumb' ? (i === 1 ? fingerDir.clone() : across.clone()) : across.clone();
        axes[n] = ax.applyQuaternion(this.restW[n].clone().invert()).normalize();
      }
      this.hand[s] = { fingerDir, across, palmN, palmOff, axes };
    }
  }

  grip(s, k) {
    const H = this.hand && this.hand[s]; if (!H || !k) return;
    for (const [n, ax] of Object.entries(H.axes)) {
      const i = +n.split('_')[1], thumb = n.startsWith('Thumb');
      _q.setFromAxisAngle(ax, (thumb ? (i === 1 ? 0.35 : 0.6) : FINGER_CURL[i]) * k);
      this.b[n].quaternion.multiply(_q);
    }
  }

  // centre of the palm in world space
  palm(s, out = new THREE.Vector3()) {
    const H = this.hand[s], h = this.b['Hand_' + s];
    h.getWorldPosition(out);
    const q = new THREE.Quaternion(); h.getWorldQuaternion(q);
    const rw = this.restW['Hand_' + s].clone().invert();
    const rootQ = new THREE.Quaternion(); this.root.getWorldQuaternion(rootQ);
    // direction that was fingerDir at rest, carried along by the hand's current rotation
    const d = H.fingerDir.clone().applyQuaternion(rw).applyQuaternion(q);
    const n = H.palmN.clone().applyQuaternion(rw).applyQuaternion(q);
    return out.addScaledVector(d, H.palmOff).addScaledVector(n, 0.025);
  }

  // turn `bone` so the direction toward its child points along `toDir` (world)
  aim(bone, child, toDir) {
    const a = new THREE.Vector3(), c = new THREE.Vector3();
    bone.getWorldPosition(a); child.getWorldPosition(c);
    const from = c.sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(from, toDir.clone().normalize());
    const wq = new THREE.Quaternion(); bone.getWorldQuaternion(wq);
    const pq = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pq);
    bone.quaternion.copy(pq.invert().multiply(q.multiply(wq)));
    bone.updateMatrixWorld(true);
  }

  // two-bone arm IK: put the palm of hand `s` on `target`; `pole` pulls the elbow
  ik(s, target, pole) {
    const up = this.b['Upperarm_' + s], lo = this.b['Lowerarm_' + s], ha = this.b['Hand_' + s];
    if (!up || !lo || !ha || !this.hand[s]) return;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    up.getWorldPosition(A); lo.getWorldPosition(B); ha.getWorldPosition(C);
    const l1 = A.distanceTo(B), l2 = C.distanceTo(B) + this.hand[s].palmOff;
    const toT = target.clone().sub(A); let d = toT.length();
    const dir = toT.normalize();
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.002);
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const n = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = A.clone().addScaledVector(dir, cosA * l1).addScaledVector(n, sinA * l1);
    this.aim(up, lo, E.clone().sub(A));
    lo.getWorldPosition(B);
    this.aim(lo, ha, target.clone().sub(B));
  }

  // Rotate bone n by `ang` radians about character-frame axis `axis`, on top of
  // whatever was already set this frame.
  rot(n, axis, ang) {
    const bone = this.b[n]; if (!bone || !ang) return;
    const a = axis === 'x' ? AX.x.clone().multiplyScalar(-this.leftSign) : AX[axis];
    // bones that point up (spine, neck, head): positive x means lean forward
    if (axis === 'x' && UPRIGHT.has(n)) ang = -ang;
    _q.setFromAxisAngle(a, ang);
    // current orientation relative to the character root
    bone.getWorldQuaternion(_w); _w.premultiply(this._rootInv);
    // newLocal = local * W^-1 * R * W
    _inv.copy(_w).invert();
    _q2.copy(_inv).multiply(_q).multiply(_w);
    bone.quaternion.multiply(_q2);
    bone.updateMatrixWorld(true);
  }

  // Attach an object (weapon, bucket, helmet) to a bone so that its local +Y
  // points along character-frame direction `dir` while the rig is at rest.
  attach(boneName, obj, dir = new THREE.Vector3(0, 0, 1), offset = 0, up = null) {
    const bone = this.b[boneName]; if (!bone) return;
    const ws = new THREE.Vector3(); bone.getWorldScale(ws);
    const rootS = new THREE.Vector3(); this.root.getWorldScale(rootS);
    obj.scale.multiplyScalar(rootS.x / ws.x);
    const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    if (up) want.premultiply(up);
    obj.quaternion.copy(this.restW[boneName].clone().invert().multiply(want));
    // slide along the shaft so the grip sits in the fist
    const off = new THREE.Vector3(0, -offset, 0).applyQuaternion(obj.quaternion).multiplyScalar(rootS.x / ws.x);
    const side = boneName.endsWith('_L') ? 'L' : 'R', H = this.hand && this.hand[side];
    if (H && boneName.startsWith('Hand')) {
      const palm = H.fingerDir.clone().multiplyScalar(H.palmOff).addScaledVector(H.palmN, 0.025);
      off.add(palm.applyQuaternion(this.restW[boneName].clone().invert()).multiplyScalar(1 / ws.x));
    }
    obj.position.copy(off);
    bone.add(obj);
  }

  reset() {
    for (const n in this.b) this.b[n].quaternion.copy(this.rest[n]);
    this.root.updateMatrixWorld(true);
    this._rootInv = this._rootInv || new THREE.Quaternion();
    this.root.getWorldQuaternion(this._rootInv).invert();
  }

  // p: { speed 0..1+, phase, attack 0..1 (swing progress) or -1, attackType,
  //      block, hit 0..1, dead 0..1, carry, talk, cheer, guard, hammerRaise }
  pose(p) {
    this.reset();
    this.drop = 0; this.bob = 0; this.yGait = 0; this.miss = 0;
    const s = Math.min(p.speed || 0, 1.6), ph = p.phase || 0, t = p.time || 0;
    const v = p.vel != null ? p.vel : s * 3.2;
    const L = 1; // positive x rotation = swing forward (verified in testing)

    // arms down from T-pose (rotate about forward axis z)
    this.rot('Upperarm_L', 'z', -1.25);
    this.rot('Upperarm_R', 'z', 1.25);
    this.rot('Lowerarm_L', 'x', 0.2 * L); this.rot('Lowerarm_R', 'x', 0.2 * L);

    // a body that is standing still is never frozen: breathing, a slow weight shift, a wandering glance
    const still = 1 - sstep(v / 0.6), br = Math.sin(t * 1.8);
    this.rot('Spine_02', 'x', br * 0.02); this.rot('Spine_03', 'x', br * 0.012);
    if (still > 0) {
      const sh = Math.sin(t * 0.45);
      this.rot('Pelvis', 'z', 0.03 * sh * still); this.rot('Spine_01', 'z', -0.025 * sh * still);
      this.rot('Head', 'y', (Math.sin(t * 0.31) * 0.1 + Math.sin(t * 0.83) * 0.03) * still);
      this.rot('Head', 'x', Math.sin(t * 0.27 + 1) * 0.03 * still);
    }

    const gw = sstep(v / 0.9);
    if (gw > 0 && this.geo) this.locomotion(p, ph, v, gw);

    if (p.carry && !p.pour) { // bucket hangs from the right hand by its handle
      this.rot('Upperarm_R', 'z', -0.22);
      this.rot('Lowerarm_R', 'x', -0.18 * L);
      this.rot('Spine_01', 'z', 0.06);
    }

    if (p.pour) { // lift the bucket to chest height and tip it forward
      const k = p.pour;
      this.rot('Upperarm_L', 'x', 0.95 * k * L); this.rot('Upperarm_R', 'x', 0.95 * k * L);
      this.rot('Upperarm_L', 'z', -0.12 * k); this.rot('Upperarm_R', 'z', 0.12 * k);
      this.rot('Lowerarm_L', 'x', 0.55 * k * L); this.rot('Lowerarm_R', 'x', 0.55 * k * L);
      this.rot('Spine_01', 'x', 0.15 * k * L);
    }

    if (p.crank != null) { // turning the well's crank with the right hand, left hand on the frame
      const a = p.crank;
      this.rot('Upperarm_R', 'x', (0.95 + Math.sin(a) * 0.35) * L);
      this.rot('Upperarm_R', 'z', Math.cos(a) * 0.22);
      this.rot('Lowerarm_R', 'x', (0.55 - Math.sin(a) * 0.3) * L);
      this.rot('Upperarm_L', 'x', 0.75 * L); this.rot('Lowerarm_L', 'x', 0.6 * L);
      this.rot('Spine_01', 'x', (0.12 + Math.sin(a) * 0.05) * L);
    }

    if (p.guard && !(p.attack >= 0)) { // weapon held ready
      this.rot('Upperarm_R', 'x', 0.35 * L);
      this.rot('Lowerarm_R', 'x', 0.9 * L);
    }

    if (p.block) {
      this.rot('Upperarm_R', 'x', 1.1 * L); this.rot('Upperarm_R', 'z', 0.4);
      this.rot('Lowerarm_R', 'x', 1.2 * L);
      this.rot('Upperarm_L', 'x', 0.9 * L); this.rot('Upperarm_L', 'z', -0.4);
      this.rot('Lowerarm_L', 'x', 1.3 * L);
      this.rot('Spine_02', 'x', 0.1 * L);
    }

    if (p.air && !p.ride) { // airborne: knees tucked, arms out for balance
      const a = p.air;
      this.rot('Thigh_L', 'x', 0.75 * a); this.rot('Calf_L', 'x', -1.1 * a);
      this.rot('Thigh_R', 'x', 0.35 * a); this.rot('Calf_R', 'x', -0.7 * a);
      this.rot('Upperarm_L', 'z', -0.5 * a); this.rot('Spine_01', 'x', 0.12 * a);
      if (!p.gripR) this.rot('Upperarm_R', 'z', 0.5 * a);
    }
    if (p.ride) this.ridePose(p);
    if (p.aim) this.aimPose(p.aim);
    this.riding = !!p.ride;
    if (p.stance && !p.ride && !(p.attack >= 0) && !p.block) this.stance(p.stance * Math.max(0, 1 - s * 1.5));
    if (p.attack != null && p.attack >= 0) this.attackPose(p.attack, p.attackType || 0);
    this.grip('R', p.gripR ? 1 : 0.25); this.grip('L', p.gripL ? 1 : 0.25);

    if (p.hammerRaise) { // overhead sky-hammer pose
      const k = p.hammerRaise;
      this.rot('Upperarm_R', 'x', 2.6 * k * L); this.rot('Upperarm_L', 'x', 2.4 * k * L);
      this.rot('Lowerarm_R', 'x', 0.4 * k * L); this.rot('Lowerarm_L', 'x', 0.6 * k * L);
      this.rot('Spine_02', 'x', -0.25 * k * L);
    }

    if (p.talk) {
      const t = p.time || 0;
      this.rot('Head', 'y', Math.sin(t * 1.3) * 0.12);
      this.rot('Lowerarm_L', 'x', (0.6 + Math.sin(t * 2.1) * 0.25) * L);
      this.rot('Upperarm_L', 'x', 0.25 * L);
    }

    if (p.cheer) {
      const t = p.time || 0;
      this.rot('Upperarm_R', 'x', (2.4 + Math.sin(t * 6) * 0.2) * L);
      this.rot('Lowerarm_R', 'x', 0.3 * L);
    }

    if (p.land > 0) { // landing: the weight arrives at once, then the body rises
      const k = sstep(p.land);
      this.rot('Thigh_L', 'x', 0.5 * k); this.rot('Thigh_R', 'x', 0.5 * k);
      this.rot('Calf_L', 'x', -0.9 * k); this.rot('Calf_R', 'x', -0.9 * k);
      this.rot('Spine_01', 'x', 0.2 * k); this.rot('Head', 'x', -0.12 * k);
      this.rot('Upperarm_L', 'x', 0.35 * k); this.rot('Upperarm_R', 'x', 0.35 * k);
      this.drop = Math.max(this.drop, 0.2 * k);
    }

    if (p.roll > 0) { // a roll: tuck the whole body into a ball
      const k = p.roll;
      this.rot('Thigh_L', 'x', 1.5 * k); this.rot('Thigh_R', 'x', 1.5 * k);
      this.rot('Calf_L', 'x', -2.0 * k); this.rot('Calf_R', 'x', -2.0 * k);
      this.rot('Spine_01', 'x', 0.6 * k); this.rot('Spine_02', 'x', 0.4 * k); this.rot('Head', 'x', 0.35 * k);
      this.rot('Upperarm_L', 'x', 0.9 * k); this.rot('Upperarm_R', 'x', 0.9 * k);
      this.rot('Lowerarm_L', 'x', 1.4 * k); this.rot('Lowerarm_R', 'x', 1.4 * k);
      this.drop = Math.max(this.drop, 0.12 * k);
    }

    if (p.hit > 0) { // the blow lands at full strength on the first frame, then eases out; the head whips later
      const k = p.hit * p.hit, kh = Math.pow(p.hit, 1.4);
      this.rot('Spine_01', 'x', -0.35 * k * L); this.rot('Spine_02', 'x', -0.12 * k * L);
      this.rot('Head', 'x', -0.3 * kh * L); this.rot('Pelvis', 'y', 0.15 * k);
      this.rot('Upperarm_L', 'z', 0.4 * k); this.rot('Upperarm_R', 'z', -0.4 * k);
    }

    if (p.dead > 0) { // the knees go first, then the body follows
      const k = sstep(p.dead * 2);
      this.rot('Thigh_L', 'x', 0.9 * k); this.rot('Thigh_R', 'x', 0.6 * k);
      this.rot('Calf_L', 'x', -1.5 * k); this.rot('Calf_R', 'x', -1.3 * k);
      this.rot('Spine_01', 'x', 0.3 * k); this.rot('Head', 'x', 0.25 * k);
      this.rot('Upperarm_L', 'z', -0.5 * k); this.rot('Upperarm_R', 'z', 0.5 * k);
      this.drop = Math.max(this.drop, 0.35 * k);
    }

    if (p.kneel) {
      const k = p.kneel;
      this.rot('Thigh_R', 'x', 1.4 * k * L); this.rot('Calf_R', 'x', -1.5 * k * L);
      this.rot('Thigh_L', 'x', -0.2 * k * L); this.rot('Calf_L', 'x', -1.6 * k * L);
      this.rot('Spine_01', 'x', 0.3 * k * L); this.rot('Head', 'x', 0.3 * k * L);
      this.drop = Math.max(this.drop, 0.5 * k);   // knee on the ground, not in the air
    }
    // final height: the stride's own pelvis path minus any crouch; bob/drop kept for older callers
    const yOff = this.yGait * (1 - Math.min(1, p.air || 0)) - this.drop;
    this.bob = Math.max(0, yOff); this.drop = Math.max(0, -yOff);
  }

  // Walk and run as Williams builds them: contact -> down -> passing -> up, arms opposite to the legs and
  // widest on the "down", hands and forearms dragging behind, hips against shoulders, head kept level.
  // The legs are solved with IK so a planted foot never slides, and the pelvis height falls out of the leg
  // reach: lowest just after contact (the weight lands), highest after the passing position. A run adds a
  // real flight phase.
  locomotion(p, ph, v, w) {
    const G = this.geo, { run, S, fs } = gait(v);
    const Lmax = (G.l1 + G.l2) * lerp(0.975, 0.94, run);
    const fr = lerp(0.42, 0.30, run);                      // share of the planted travel that is ahead of the hips
    const d = Math.min(S * fs, 0.6 * Lmax / (2 * (1 - fr)));   // half the planted foot's travel under the hips
    const uR = ph / TAU - 0.25, uL = uR - 0.5;              // right foot touches at phase pi/2
    const sinP = Math.sin(ph), L = 1;
    const sigK = SOLE_WALK.map((a, i) => lerp(a, SOLE_RUN[i], run));

    // hips turn with the leading leg, chest against them, head holds its gaze
    const aP = lerp(0.12, 0.2, run) * w, aC = lerp(0.14, 0.24, run) * w;
    this.rot('Pelvis', 'y', aP * sinP);
    this.rot('Spine_01', 'y', -(aP + aC) * 0.5 * sinP); this.rot('Spine_02', 'y', -(aP + aC) * 0.5 * sinP);
    this.rot('Head', 'y', aC * 0.8 * sinP);
    // the faster the figure runs, the more it leans
    const lean = clamp(v / 6.2, 0, 1) * w;
    this.rot('Spine_01', 'x', 0.03 * w + 0.2 * lean); this.rot('Spine_02', 'x', 0.16 * lean);
    this.rot('Head', 'x', -0.14 * lean);

    // foot targets (ankle, relative to the hip joint) for each leg
    const ankle = (zf, sg) => {
      let dz, dy;
      if (sg >= 0) { dz = G.heel * (Math.cos(sg) - 1) - G.hA * Math.sin(sg); dy = G.hA * Math.cos(sg) + G.heel * Math.sin(sg); }
      else { dz = G.ball * (1 - Math.cos(sg)) - G.hA * Math.sin(sg); dy = G.hA * Math.cos(sg) - G.ball * Math.sin(sg); }
      return [zf + dz, dy];
    };
    const clr = lerp(0.09, 0.2, run);
    const foot = u => {
      u = ((u % 1) + 1) % 1;
      const stance = u < fs, up = stance ? 0.6 * u / fs : 0.6 + 0.4 * (u - fs) / (1 - fs), sg = cyc12(sigK, up);
      let zf, lift = 0, bump = 0, mid = 0;
      const z0 = 2 * d * fr, z1 = -2 * d * (1 - fr);
      if (stance) { zf = z0 + (z1 - z0) * (u / fs); bump = u < fs * 0.5 ? Math.sin(Math.PI * u / (fs * 0.5)) : 0; mid = Math.sin(Math.PI * u / fs); }
      else {
        const q = (u - fs) / (1 - fs), q2 = q * q, q3 = q2 * q, m = (z1 - z0) / fs * (1 - fs);
        zf = (2 * q3 - 3 * q2 + 1) * z1 + (q3 - 2 * q2 + q) * m + (-2 * q3 + 3 * q2) * z0 + (q3 - q2) * m;
        lift = Math.sin(Math.PI * q) * clr;
      }
      const [az, ay] = ankle(zf, sg);
      return { z: az, y: ay + lift, sg, bump, mid };
    };
    const T = { L: foot(uL), R: foot(uR) };
    const reach = f => f.y + Math.sqrt(Math.max(0.01, Lmax * Lmax - f.z * f.z));
    const uu = [((uL % 1) + 1) % 1, ((uR % 1) + 1) % 1];
    let H;
    const planted = [T.L, T.R].filter((f, i) => uu[i] < fs);
    if (planted.length === 2) H = smin(reach(planted[0]), reach(planted[1]), 0.05);
    else if (planted.length === 1) H = reach(planted[0]);
    else { // flight: the body travels on an arc from the last toe-off to the next touchdown
      const uA = Math.min(uu[0], uu[1]), x = clamp((uA - fs) / (0.5 - fs), 0, 1);
      H = lerp(reach(foot(fs - 1e-4)), reach(foot(0)), x) + lerp(0.02, 0.035, run) * Math.sin(Math.PI * x);
    }
    H -= lerp(0.025, 0.0, run) * Math.max(T.L.bump, T.R.bump);   // walk: the "down" just after contact, the knee gives
    H -= run * 0.075 * Math.max(T.L.mid, T.R.mid);               // run: the passing position is the down, the body rises in flight
    this.yGait = w * (H - G.hipRest);
    for (const side of ['L', 'R']) {
      const f = T[side], dz = f.z, dy = Math.max(0.05, H - f.y);
      const want = Math.hypot(dz, dy), dist = clamp(want, Math.abs(G.l1 - G.l2) + 0.01, G.l1 + G.l2 - 0.002);
      this.miss = Math.max(this.miss || 0, Math.abs(want - dist));   // how far a foot could not reach its mark
      const kb = Math.PI - Math.acos(clamp((G.l1 * G.l1 + G.l2 * G.l2 - dist * dist) / (2 * G.l1 * G.l2), -1, 1));
      const phi = Math.acos(clamp((G.l1 * G.l1 + dist * dist - G.l2 * G.l2) / (2 * G.l1 * dist), -1, 1));
      const A1 = Math.atan2(dz, dy) + phi, A2 = A1 - kb;
      this.rot('Thigh_' + side, 'x', w * (A1 - G.th0) * L);
      this.rot('Calf_' + side, 'x', w * (-kb - (G.sh0 - G.th0)) * L);
      this.rot('Foot_' + side, 'x', w * (f.sg - (A2 - G.sh0)) * L);
    }

    // arms swing opposite the legs, widest on the down position; forearm and hand lag behind (overlap)
    if (p.carry) return;
    const armA = lerp(0.45, 0.8, run) * w, eB = lerp(0.0, 0.8, run) * w, eA = lerp(0.45, 0.5, run) * w;
    const arm = (side, uOpp, free) => {
      const ua = uOpp - 0.125, k = free ? 1 : 0.45;
      this.rot('Upperarm_' + side, 'x', (armA * Math.cos(TAU * ua) * k + run * 0.15 * w) * L);
      if (free) {
        this.rot('Lowerarm_' + side, 'x', (eB + eA * (0.5 + 0.5 * Math.cos(TAU * (ua - 0.1)))) * L);
        this.rot('Hand_' + side, 'x', 0.3 * w * Math.sin(TAU * ua) * L);
      }
    };
    arm('L', uR, true);
    if (p.attack == null || p.attack < 0) arm('R', uL, !p.gripR);
  }

  // Attacks as key poses: wind-up, impact, follow-through, then back to rest.
  // Angles are [x, y, z] in the character frame (x: swing forward, y: turn left, z: roll).
  attackPose(t, type) {
    const K = ATTACK_KEYS[type] || ATTACK_KEYS[0];
    const [tw, ti, tf] = K.times;
    const sm = x => x * x * (3 - 2 * x);
    let A, B, k;
    if (t < tw) { A = null; B = K.wind; k = 1 - (1 - t / tw) ** 2; }                 // ease-out into the coil
    else if (t < ti) { A = K.wind; B = K.impact; k = ((t - tw) / (ti - tw)) ** 2; }  // accelerate into the blow
    else if (t < tf) { A = K.impact; B = K.follow; const x = (t - ti) / (tf - ti) - 1; k = 1 + 2.7 * x * x * x + 1.7 * x * x; } // overshoots, then settles
    else { A = K.follow; B = null; k = sm((t - tf) / (1 - tf)); }
    const bones = new Set([...Object.keys(A || {}), ...Object.keys(B || {})]);
    for (const n of bones) {
      if (n === 'drop' || (this.riding && (n.startsWith('Thigh') || n.startsWith('Calf')))) continue;
      const a = (A && A[n]) || Z3, b = (B && B[n]) || Z3;
      const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k, z = a[2] + (b[2] - a[2]) * k;
      if (x) this.rot(n, 'x', x); if (y) this.rot(n, 'y', y); if (z) this.rot(n, 'z', z);
    }
    const da = (A && A.drop) || 0, db = (B && B.drop) || 0;
    if (!this.riding) this.drop = Math.max(this.drop || 0, da + (db - da) * k);
  }

  // seated on a horse, hands on the reins
  ridePose(p) {
    // upright dressage seat: thighs angled down and out round the barrel, long lower legs, heels under the hip
    const g = p.gallop || 0, bob = g * Math.sin((this.rideT = (this.rideT || 0) + 0.25) ) * 0.05;
    this.rot('Thigh_L', 'x', 0.62); this.rot('Thigh_L', 'z', 0.5);
    this.rot('Thigh_R', 'x', 0.62); this.rot('Thigh_R', 'z', -0.5);
    this.rot('Calf_L', 'x', -0.85); this.rot('Calf_R', 'x', -0.85);
    this.rot('Calf_L', 'z', -0.32); this.rot('Calf_R', 'z', 0.32);
    this.rot('Foot_L', 'x', 0.25); this.rot('Foot_R', 'x', 0.25);
    this.rot('Spine_01', 'x', 0.02 + g * 0.2 + bob);
    if (!(p.attack >= 0)) {
      this.rot('Upperarm_L', 'x', 0.55); this.rot('Lowerarm_L', 'x', 1.0);
      if (!p.guard) { this.rot('Upperarm_R', 'x', 0.55); this.rot('Lowerarm_R', 'x', 1.0); }
    }
    this.drop = Math.max(this.drop || 0, this.pelvisH - 0.36 - bob * 0.5);
  }

  // drawing a bow: bow arm straight forward, string hand pulled to the cheek
  aimPose(k) {
    this.rot('Spine_02', 'y', -0.5 * k); this.rot('Head', 'y', 0.45 * k);
    this.rot('Upperarm_L', 'x', 1.5 * k); this.rot('Upperarm_L', 'y', 0.35 * k);
    this.rot('Upperarm_R', 'x', 1.45 * k); this.rot('Upperarm_R', 'y', 0.5 * k);
    this.rot('Lowerarm_R', 'x', 1.9 * k);
  }

  // ready stance: knees bent, weapon up, off hand forward
  stance(k) {
    if (!k) return;
    this.rot('Thigh_L', 'x', 0.28 * k); this.rot('Calf_L', 'x', -0.4 * k);
    this.rot('Thigh_R', 'x', -0.12 * k); this.rot('Calf_R', 'x', -0.35 * k);
    this.rot('Spine_01', 'x', 0.1 * k); this.rot('Spine_01', 'y', -0.15 * k);
    this.rot('Upperarm_L', 'x', 0.55 * k); this.rot('Lowerarm_L', 'x', 0.95 * k);
    this.drop = Math.max(this.drop || 0, 0.06 * k);
  }
}

const Z3 = [0, 0, 0];
const ATTACK_KEYS = {
  // 0: diagonal chop from over the right shoulder down across the body
  0: {
    times: [0.3, 0.45, 0.62],
    wind: { Spine_01: [-0.08, -0.4, 0], Spine_02: [0, -0.2, 0], Upperarm_R: [2.4, 0, -0.45], Lowerarm_R: [1.1, 0, 0], Hand_R: [-0.5, 0, 0],
      Upperarm_L: [0.6, 0, 0.15], Lowerarm_L: [0.8, 0, 0], Thigh_R: [-0.15, 0, 0], Thigh_L: [0.12, 0, 0] },
    impact: { Spine_01: [0.3, 0.35, 0], Spine_02: [0.1, 0.2, 0], Upperarm_R: [0.95, 0, 0.3], Lowerarm_R: [0.15, 0, 0], Hand_R: [1.25, 0, 0],
      Upperarm_L: [0.2, 0, -0.1], Lowerarm_L: [0.5, 0, 0], Thigh_L: [0.5, 0, 0], Calf_L: [-0.55, 0, 0], Thigh_R: [-0.3, 0, 0], Calf_R: [-0.2, 0, 0], drop: 0.06 },
    follow: { Spine_01: [0.35, 0.5, 0], Spine_02: [0.12, 0.25, 0], Upperarm_R: [0.5, 0, 0.45], Lowerarm_R: [0.25, 0, 0], Hand_R: [1.3, 0, 0],
      Upperarm_L: [0.1, 0, -0.1], Lowerarm_L: [0.4, 0, 0], Thigh_L: [0.45, 0, 0], Calf_L: [-0.5, 0, 0], Thigh_R: [-0.3, 0, 0], Calf_R: [-0.2, 0, 0], drop: 0.06 },
  },
  // 1: flat sweep from the right side to the left
  1: {
    times: [0.3, 0.48, 0.64],
    wind: { Spine_01: [0, -0.6, 0], Spine_02: [0, -0.3, 0], Upperarm_R: [1.35, -1.0, 0], Lowerarm_R: [0.7, 0, 0], Hand_R: [0, 0, 1.3],
      Upperarm_L: [0.8, 0.4, 0], Lowerarm_L: [0.9, 0, 0], Thigh_R: [-0.12, 0, 0], Calf_R: [-0.15, 0, 0], drop: 0.04 },
    impact: { Spine_01: [0.1, 0.45, 0], Spine_02: [0, 0.3, 0], Upperarm_R: [1.35, 0.45, 0], Lowerarm_R: [0.15, 0, 0], Hand_R: [0, 0, 1.3],
      Upperarm_L: [0.3, 0, -0.1], Lowerarm_L: [0.5, 0, 0], Thigh_L: [0.35, 0.2, 0], Calf_L: [-0.4, 0, 0], Thigh_R: [-0.25, 0, 0], drop: 0.07 },
    follow: { Spine_01: [0.12, 0.8, 0], Spine_02: [0, 0.4, 0], Upperarm_R: [1.15, 1.0, 0.2], Lowerarm_R: [0.45, 0, 0], Hand_R: [0, 0, 1.3],
      Upperarm_L: [0.2, 0, -0.1], Lowerarm_L: [0.5, 0, 0], Thigh_L: [0.35, 0.2, 0], Calf_L: [-0.4, 0, 0], Thigh_R: [-0.25, 0, 0], drop: 0.06 },
  },
  // 2: two-handed overhead slam into the ground
  2: {
    times: [0.42, 0.55, 0.72],
    wind: { Spine_01: [-0.28, -0.1, 0], Spine_02: [-0.1, 0, 0], Upperarm_R: [2.9, 0, -0.15], Lowerarm_R: [0.9, 0, 0], Hand_R: [-0.6, 0, 0],
      Upperarm_L: [2.9, 0, 0.15], Lowerarm_L: [0.9, 0, 0], Thigh_R: [-0.1, 0, 0], Calf_R: [-0.15, 0, 0], Thigh_L: [0.15, 0, 0] },
    impact: { Spine_01: [0.65, 0.05, 0], Spine_02: [0.2, 0, 0], Upperarm_R: [0.65, 0, 0.15], Lowerarm_R: [0.1, 0, 0], Hand_R: [-1.2, 0, 0],
      Upperarm_L: [0.65, 0, -0.15], Lowerarm_L: [0.1, 0, 0], Thigh_L: [0.7, 0, 0], Calf_L: [-0.9, 0, 0], Thigh_R: [-0.45, 0, 0], Calf_R: [-0.5, 0, 0], drop: 0.16 },
    follow: { Spine_01: [0.7, 0.05, 0], Spine_02: [0.22, 0, 0], Upperarm_R: [0.55, 0, 0.15], Lowerarm_R: [0.12, 0, 0], Hand_R: [-1.25, 0, 0],
      Upperarm_L: [0.55, 0, -0.15], Lowerarm_L: [0.12, 0, 0], Thigh_L: [0.7, 0, 0], Calf_L: [-0.9, 0, 0], Thigh_R: [-0.45, 0, 0], Calf_R: [-0.5, 0, 0], drop: 0.16 },
  },
};
export { ATTACK_KEYS };
