// BOZKIR — Prolog: engine glue, main loop and the start menu.
import * as THREE from 'three';
import { Assets } from './assets.js';
import { World, OBA, heightAt } from './world.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Actor } from './actor.js';
import { Input, Player, FollowCam } from './player.js';
import { runStory, SCENES } from './story.js';
import { Culler } from './cull.js';
import { Realms } from './realms.js';
import { setupPowers } from './foes.js';

class Abort extends Error {}

const LOWQ = /low/.test(location.search) || (() => { try { return localStorage.getItem('bozkir.low') === '1'; } catch (_) { return false; } })();
const G = window.G = {
  horses: [], projectiles: [], tickers: [], extraTargets: [], gravityMul: 1,
  lowQ: LOWQ,
  actors: [], flags: {}, run: 0, waiters: [], interactables: [], time: 0,
  shakeT: 0, hitstopT: 0, freeze: false, cutsceneOn: false,
};

// ---------- renderer ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOWQ ? 1 : Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = !LOWQ; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  if (G.fx) { const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov / 2))); G.fx.add.mat.uniforms.scale.value = s; G.fx.norm.mat.uniforms.scale.value = s; }
}
addEventListener('resize', resize);

// ---------- helpers used by the story ----------
function guard(run) { if (run !== G.run) throw new Abort(); }
G.wait = sec => { const run = G.run; return new Promise((res, rej) => G.waiters.push({ t: G.time + sec, res, rej, run })).then(() => guard(run)); };
G.until = fn => { const run = G.run; return new Promise((res, rej) => G.waiters.push({ fn, res, rej, run })).then(() => guard(run)); };
G.frame = () => { const run = G.run; return new Promise((res, rej) => G.waiters.push({ frame: true, res, rej, run })).then(dt => { guard(run); return dt; }); };
G.say = async (who, text, opts) => {
  const run = G.run, free = !G.cutsceneOn;
  if (free) { G.input.enabled = false; G.player.controls = false; }
  try { await G.ui.say(who, text, opts); }
  finally { if (free && !G.cutsceneOn) { G.input.enabled = true; G.player.controls = true; G.input.block(0.3); } }
  guard(run);
};
G.interact = ({ pos, actor, r = 2, label, hold }) => {
  const run = G.run;
  return new Promise((res, rej) => {
    const it = { pos, actor, r, label, hold, res, rej, run, prog: 0 };
    G.interactables.push(it);
    G.ui.marker(actor ? actor.pos : pos, '');
    if (actor) it.track = true;
  }).then(() => { guard(run); G.ui.marker(null); });
};
G.spawn = (key, opts = {}) => { const a = new Actor(G, key, opts); G.actors.push(a); return a; };
G.clearActors = () => { for (const a of [...G.actors]) if (a !== G.player) a.remove(); };
G.cutscene = on => {
  G.cutsceneOn = on; G.input.enabled = !on; G.player.controls = !on; G.ui.letterbox(on); G.ui.prompt(null);
  if (!on) { G.cam.shot = null; G.cam.yaw = G.player.yaw + Math.PI; G.input.block(0.3); }
};
G.shake = k => { G.shakeT = Math.max(G.shakeT, k); };
G.raiseAlarm = who => {
  if (G.alarm) return;
  G.alarm = true; G.ui.toast('Fark edildin! Kamp ayakta!', 2000); G.audio.setMood('battle');
  if (who) G.fx.sparks(who.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), 12, 0xff4020, 2);
};
G.hitstop = t => { G.hitstopT = Math.max(G.hitstopT, t); };

G.resetScene = () => {
  for (const w of G.waiters) if (w.run !== G.run) w.rej(new Abort());
  G.waiters = G.waiters.filter(w => w.run === G.run);
  G.interactables = [];
  G.clearActors(); G.fx.clear();
  G.freeze = false; G.bossFight = false; G.hitstopT = 0; G.alarm = false;
  G.player.tasKiran = false;
  const y = G.world.yurts.family; y.traverse(o => { if (o.isMesh && o.userData.burnt) { o.material.color.multiplyScalar(1 / 0.45); o.userData.burnt = false; } }); y.userData.collapse = false; y.userData.ck = 0; y.position.y = 0; y.rotation.z = 0; y.scale.setScalar(1);
  G.world.chest.rotation.x = 0;
  G.world.setTroughLevel(G.checkpoint > 1 ? 1 : 0);
  for (const o of G.world.temp) G.scene.remove(o); G.world.temp = [];
  G.ui.objective(null); G.ui.marker(null); G.ui.hint(null); G.ui.prompt(null); G.ui.hold(null);
  G.ui.panel('dialogue', false); G.ui.panel('forgeGame', false); G.ui.panel('deathScreen', false);
  G.player.dead = false; G.player.hp = G.player.maxHp;
  if (G.player.mount) G.player.dismount();
  for (const h of G.horses) h.remove(); G.horses = []; G.boz = null; G.bozFree = false;
  for (const a of G.projectiles) G.scene.remove(a.mesh); G.projectiles = [];
  for (const e of G.extraTargets) e.remove && e.remove(); G.extraTargets = []; G.tickers = [];
  G.realms && G.realms.exit(); G.gravityMul = 1; G.powerHud && G.powerHud();
  G.world.bound = { x: 0, z: 0, R: 62 }; G.world.grave.visible = false;
  G.cutscene(false);
};

async function startStory(at) {
  G.run++;
  const run = G.run;
  try { await runStory(G, at); }
  catch (e) { if (!(e instanceof Abort)) { console.error(e); } }
}

// ---------- loop ----------
let last = performance.now(), fpsAcc = 0, fpsN = 0;
G.fps = 0;
const V = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000; let real = Math.min(G.test ? 0.2 : 0.05, rawDt); last = now;
  fpsAcc += rawDt; fpsN++; if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  if (G.paused || !G.ready) { if (G.ready) renderer.render(G.scene, G.camera); return; }
  let dt = real;
  if (G.hitstopT > 0) { G.hitstopT -= real; dt *= 0.08; }
  G.time += dt;
  G.shakeT = Math.max(0, G.shakeT - real * 2.2);
  const p = G.player;

  // brains then bodies
  if (!G.freeze) {
    for (const h of G.horses) h.update(dt);
    updateProjectiles(dt);
    p.update(dt);
    for (const a of G.actors) { if (a !== p) { a.brain && a.brain(dt); a.update(dt); } }
    // keep people from standing inside each other
    const L = G.actors;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; if (a.dead || b.dead || !a.solid || !b.solid) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), m = a.radius + b.radius;
      if (d < m && d > 1e-4) { const k = (m - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
    }
    for (const a of [...G.actors]) if (a.gone) a.remove();
  } else {
    for (const a of G.actors) a.rig.pose({ time: G.time, attack: a.attack, attackType: a.attackType, guard: a.pose.guard, talk: a.pose.talk, kneel: a.pose.kneel });
  }

  for (const a of G.actors) a.tick && a.tick(dt);
  // a full bucket sloshes a little while walking
  if (p.dripping && p.carryObj && Math.random() < Math.hypot(p.vel.x, p.vel.z) * 0.08) {
    const q = new THREE.Vector3(0, 0.45, 0); p.carryObj.localToWorld(q);
    G.fx.norm.add({ x: q.x, y: q.y, z: q.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, vz: (Math.random() - 0.5) * 0.4, drag: 0, grav: -9, life: 0.5, age: 0, c0: [0.62, 0.8, 0.95], c1: [0.5, 0.7, 0.9], a: 0.85, s0: 0.07, s1: 0.04, floor: true });
  }

  // free mounting: walk up to a saddled horse and press E; H whistles Boz over
  G.interactBusy = false;
  if (G.boz && !p.mount && !G.cutsceneOn && G.input.enabled && G.bozFree) {
    if (G.input.hit('KeyH')) { G.boz.target = p.pos.clone(); G.boz.targetRun = p.distTo(G.boz) > 20; G.ui.toast('Islık: Boz geliyor', 1200); }
  }

  // interactions
  let best = null;
  for (const it of G.interactables) {
    const pos = it.actor ? it.actor.pos : it.pos;
    if (it.track) G.ui.markerPos && G.ui.markerPos.copy(pos);
    const d = p.distTo(pos);
    if (d < it.r && (!best || d < best.d)) best = { it, d };
  }
  if (best && G.input.enabled) {
    const it = best.it;
    if (it.hold) {
      G.ui.prompt(`<kbd>E</kbd> ${it.label}`);
      if (G.input.down('KeyE')) { it.prog += dt / it.hold; G.ui.hold(it.prog); if (Math.random() < 0.2) G.fx.sparks(p.pos.clone().add(V.set(0, 1, 0)).addScaledVector(p.forward(), 0.6), 3, 0xff9040, 2); }
      else { it.prog = Math.max(0, it.prog - dt); G.ui.hold(it.prog > 0 ? it.prog : null); }
      if (it.prog >= 1) { G.ui.hold(null); G.ui.prompt(null); G.interactables = G.interactables.filter(x => x !== it); it.res(); }
    } else {
      G.ui.prompt(`<kbd>E</kbd> ${it.label}`);
      if (G.input.hit('KeyE')) { G.ui.prompt(null); G.interactables = G.interactables.filter(x => x !== it); it.res(); }
    }
  } else if (!G.cutsceneOn) {
    if (G.boz && G.bozFree && !p.mount && !(p.remountAt > performance.now()) && p.distTo(G.boz) < 2.8 && G.input.enabled) {
      G.ui.prompt('<kbd>E</kbd> Boz\'a bin');
      if (G.input.hit('KeyE')) { p.mountHorse(G.boz); G.ui.prompt(null); G.interactBusy = true; }
    } else G.ui.prompt(null);
  }
  if (best) G.interactBusy = true;

  // story waiters
  const ws = G.waiters; G.waiters = [];
  for (const w of ws) {
    if (w.run !== G.run) { w.rej(new Abort()); continue; }
    if (w.frame) w.res(dt);
    else if (w.fn ? w.fn() : G.time >= w.t) w.res();
    else G.waiters.push(w);
  }

  // family yurt collapsing
  const fy = G.world.yurts.family;
  if (fy.userData.collapse && (fy.userData.ck || 0) < 1) {
    fy.userData.ck = Math.min(1, (fy.userData.ck || 0) + dt * 0.35);
    const k = fy.userData.ck;
    fy.scale.set(1 + k * 0.15, 1 - k * 0.72, 1 + k * 0.15); fy.rotation.z = k * 0.12;
    if (Math.random() < 0.3) G.fx.dust(fy.position, 4, 0x3a3230);
  }

  // death
  if (p.dead && !G.deathShown && !G.cutsceneOn) { G.deathShown = true; setTimeout(showDeath, 1400); }

  G.world.update(dt, G.time, p.pos);
  G.realms && G.realms.update(dt, G.time);
  G.powerTick && !G.freeze && G.powerTick(dt);
  for (const t of [...G.tickers]) if (t(dt) === false) G.tickers.splice(G.tickers.indexOf(t), 1);
  for (const e of [...G.extraTargets]) if (e.update && e.update(dt) === false) G.extraTargets.splice(G.extraTargets.indexOf(e), 1);
  G.fx.update(dt, G.time);
  G.cam.update(real);
  G.audio.listener = G.camera.position;
  // fire sound by distance
  let fd = 99; for (const f of G.fx.fires) fd = Math.min(fd, f.pos.distanceTo(p.pos) / f.scale);
  G.audio.setFire && G.audio.on && G.audio.setFire(Math.max(0, 1 - fd / 12) * 0.12);
  G.ui.setBars(p);
  G.ui.updateMarker();
  if (!G.culler) G.culler = new Culler(G, renderer);
  G.culler.update(real);
  renderer.render(G.scene, G.camera);
  // story code runs in microtasks after the frame; keep this frame's key presses for it
  G.framePressed = new Set(G.input.live ? G.input.pressed : []);
  G.input.endFrame();
}

// arrows: fly with a little drop, hit the first enemy they touch, stick in the ground
function updateProjectiles(dt) {
  for (const a of G.projectiles) {
    const prev = a.mesh.position.clone();
    a.vel.y -= (a.grav ?? 4) * dt;
    a.mesh.position.addScaledVector(a.vel, dt);
    if (!a.stuck) a.mesh.lookAt(a.mesh.position.clone().add(a.vel));
    a.life -= dt;
    const cur = a.mesh.position;
    if (!a.stuck && a.dmg > 0) {
      // swept test along this frame's flight, so fast arrows never skip a target
      const seg = cur.clone().sub(prev), L2 = Math.max(1e-6, seg.lengthSq());
      for (const t of [...G.actors, ...G.extraTargets]) {
        if (!t.alive || t.team === a.team || t.team === 'neutral') continue;
        const c = t.center ? t.center() : t.pos.clone().add(new THREE.Vector3(0, 1.1, 0));
        const rad = t.hitR || 0.45;
        const k = Math.max(0, Math.min(1, c.clone().sub(prev).dot(seg) / L2));
        const q = prev.clone().addScaledVector(seg, k);
        if (Math.hypot(q.x - c.x, q.z - c.z) < rad && Math.abs(q.y - c.y) < Math.max(0.9, rad)) { t.takeHit(a.dmg, a.from, 1.5); a.life = 0; if (a.onHit) a.onHit(q); break; }
      }
    }
    if (!a.stuck && cur.y < heightAt(cur.x, cur.z)) { a.stuck = true; a.vel.set(0, 0, 0); a.life = a.grav === 0 ? 0 : Math.min(a.life, 6); }
  }
  G.projectiles = G.projectiles.filter(a => { if (a.life <= 0) { G.scene.remove(a.mesh); return false; } return true; });
}
G.shootArrow = (from, to, dmg = 16, team) => {
  const m = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x8a6a40 })); shaft.rotation.x = Math.PI / 2; m.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), new THREE.MeshLambertMaterial({ color: 0x555555 })); tip.rotation.x = Math.PI / 2; tip.position.z = 0.42; m.add(tip);
  m.position.copy(from); G.scene.add(m);
  const d = to.clone().sub(from), t = Math.max(0.15, d.length() / 38);
  const vel = d.multiplyScalar(1 / t); vel.y += 2 * t;
  G.projectiles.push({ mesh: m, vel, life: 8, dmg, team: team || 'oba', from: null });
  G.audio.whoosh(from, 0.2);
};

// energy bolts (alien drones and soldiers): straight, glowing, no drop
G.shootBolt = (from, to, dmg = 12, team = 'hisar', color = 0xff3a5a, speed = 26) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), new THREE.MeshBasicMaterial({ color }));
  m.geometry.rotateX(Math.PI / 2);
  m.position.copy(from); G.scene.add(m);
  const vel = to.clone().sub(from).normalize().multiplyScalar(speed);
  G.projectiles.push({ mesh: m, vel, life: 3, dmg, team, from: null, grav: 0, onHit: q => G.fx.sparks(q, 10, color, 4) });
  G.audio.whoosh(from, 0.15);
};

function showDeath() {
  G.ui.panel('deathScreen', true);
  G.input.enabled = false;
  document.exitPointerLock && document.exitPointerLock();
}

// ---------- boot ----------
async function boot() {
  const bar = document.getElementById('loadFill'), lt = document.getElementById('loadText');
  G.assets = new Assets('assets/');
  await G.assets.load((k, name) => { bar.style.width = (k * 100).toFixed(0) + '%'; lt.textContent = `Yükleniyor… ${(k * 100).toFixed(0)}%`; });
  G.assets.applyTownAtlas();
  G.input = new Input(canvas);
  G.audio = new Audio(); G.audio.prefetch();
  G.ui = new UI(G);
  G.world = new World(G);
  G.realms = new Realms(G);
  G.fx = new FX(G);
  G.player = new Player(G, { pos: OBA.campfire.clone().add(new THREE.Vector3(2, 0, 4)) });
  G.actors.push(G.player);
  setupPowers(G);
  G.cam = new FollowCam(G);
  resize();
  G.cam.shot = { pos: new THREE.Vector3(-34, 16, 34), look: new THREE.Vector3(2, 2, -6), snap: true };
  G.world.setTime('dusk', 0);
  G.ready = true;
  document.getElementById('loading').hidden = true;
  document.getElementById('menu').hidden = false;
  // slow orbit behind the menu
  let a = 0.8;
  const orbit = () => { if (!G.menuOpen) return; a += 0.0012; G.cam.shot = { pos: new THREE.Vector3(Math.cos(a) * 40, 14, Math.sin(a) * 40), look: new THREE.Vector3(0, 2, 0), speed: 2 }; requestAnimationFrame(orbit); };
  G.menuOpen = true; orbit();
  G.player.controls = false; G.input.enabled = false;
  G.ui.show(false);
  window.__ready = true;
}

function begin(at, keepFlags) {
  G.menuOpen = false;
  document.getElementById('menu').hidden = true;
  G.ui.show(true);
  G.audio.start();
  G.deathShown = false;
  G.ui.el.fade.style.transition = 'none'; G.ui.el.fade.style.opacity = 1;
  if (!keepFlags) G.flags = {};
  startStory(at);
}

document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => begin(+b.dataset.start)));
document.getElementById('retry').addEventListener('click', () => {
  G.ui.panel('deathScreen', false); G.deathShown = false;
  G.ui.el.fade.style.transition = 'none'; G.ui.el.fade.style.opacity = 1;
  startStory(G.checkpoint || 1);
});
document.getElementById('again').addEventListener('click', () => { G.ui.panel('endScreen', false); begin(1); });
document.getElementById('next').addEventListener('click', () => { G.ui.panel('endScreen', false); begin(G.nextScene || 6, true); });
document.getElementById('toMenu').addEventListener('click', () => location.reload());
addEventListener('keydown', e => {
  if (e.code === 'Escape' && G.ready && !G.menuOpen) {
    G.paused = !G.paused; G.ui.panel('pause', G.paused);
  }
});
const qb = document.getElementById('quality');
qb.textContent = 'Grafik: ' + (G.lowQ ? 'Düşük' : 'Yüksek');
qb.addEventListener('click', () => { try { localStorage.setItem('bozkir.low', G.lowQ ? '0' : '1'); } catch (_) {} location.reload(); });
document.getElementById('resume').addEventListener('click', () => { G.paused = false; G.ui.panel('pause', false); });

boot().catch(e => { document.getElementById('loadText').textContent = 'Yüklenemedi: ' + e.message; console.error(e); });
requestAnimationFrame(frame);
// debug hook for automated tests
window.__begin = begin;
