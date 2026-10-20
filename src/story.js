// The prologue "Gece Düşen Işık": four scenes and the ending.
import * as THREE from 'three';
import { OBA, heightAt, AKPINAR, GRAVE, ROAD, creekX, YANIK, KIZILSU, KURGAN } from './world.js';
import { Horse } from './horse.js';
import { ACT23 } from './story2.js';
import { soldierBrain, allyBrain, sparBrain, idleBrain, wanderBrain, smithBrain, fleeBrain, archerBrain, companionBrain, guardBrain } from './ai.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const near = (p, dx, dz) => v(p.x + dx, 0, p.z + dz);

export const SCENES = [
  { id: 1, name: 'Sabah', sub: 'Kayalı Pınar Obası' },
  { id: 2, name: 'Gece', sub: 'Gökten düşen ışık' },
  { id: 3, name: 'Baskın', sub: 'Hisar askerleri' },
  { id: 4, name: 'Miras', sub: 'Usta Bars\'ın sandığı' },
];

// ---------------- helpers ----------------
export function soldier(G, pos, opts = {}) {
  const key = opts.key || (Math.random() < 0.5 ? 'asker1' : 'asker2');
  const helmet = opts.helmet || (Math.random() < 0.5 ? 'helmet1' : 'helmet2');
  const a = G.spawn(key, { name: 'Asker', team: 'hisar', hp: opts.hp || 42, pos, weapon: opts.weapon || 'shortsword', helmet, hpBar: true, atkMul: opts.atkMul || 0.85, scale: opts.scale, boss: opts.boss, yaw: opts.yaw });
  a.brain = soldierBrain(G, a, { boss: opts.boss });
  a.fallDir = Math.random() < 0.5 ? 1 : -1;
  if (opts.torch) addTorch(G, a);
  return a;
}

function addTorch(G, a) {
  const hand = a.rig.b.Hand_L; if (!hand) return;
  const t = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 5), new THREE.MeshLambertMaterial({ color: 0x5a3b20 })); stick.position.y = 0.3; t.add(stick);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffb040 })); flame.position.y = 0.66; flame.scale.y = 1.6; t.add(flame);
  a.rig.attach('Hand_L', t, v(0, 1, 0.4), 0.1);
  a.torch = { flame, l: { intensity: 6 } };
  a.tick = () => {
    if (a.dead) { flame.visible = false; return; }
    flame.scale.set(1 + Math.random() * 0.2, 1.4 + Math.random() * 0.5, 1);
    const p = new THREE.Vector3(); flame.getWorldPosition(p);
    G.fx.light(p.clone().add(v(0, 0.6, 0)), 0xff8a3a, 2.2 + Math.random() * 0.8, 8);
    if (Math.random() < 0.35) G.fx.add.add({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 1.4, vz: 0, drag: 1, grav: 0, life: 0.4, age: 0, c0: [1, 0.8, 0.4], c1: [0.8, 0.2, 0.05], a: 0.8, s0: 0.35, s1: 0.05 });
  };
}

function villagers(G, mode) {
  const out = {};
  const spots = [OBA.well, near(OBA.campfire, 4, 3), v(-12, 0, 10), v(12, 0, 4), v(-6, 0, -12), v(8, 0, 13)];
  if (mode === 'day') {
    out.k2 = G.spawn('koylu2', { name: 'Köylü', pos: near(OBA.well, 2, 1) }); out.k2.brain = wanderBrain(G, out.k2, [OBA.well, spots[2], spots[1]]);
    out.k4 = G.spawn('koylu4', { name: 'Köylü', pos: v(12, 0, 4) }); out.k4.brain = wanderBrain(G, out.k4, [spots[3], spots[5], near(OBA.pen, -6, -3)]);
    out.k6 = G.spawn('koylu6', { name: 'Hatun Ana', pos: v(-12, 0, -3) }); out.k6.brain = wanderBrain(G, out.k6, [v(-12, 0, -2), v(-11, 0, 11), spots[4]]);
  } else if (mode === 'fire') {
    const C = OBA.campfire;
    out.k2 = G.spawn('koylu2', { name: 'Köylü', pos: near(C, 2.6, 1.6) }); out.k2.brain = idleBrain(G, out.k2, near(C, 2.6, 1.6), C);
    out.k4 = G.spawn('koylu4', { name: 'Köylü', pos: near(C, -2.4, 1.8) }); out.k4.brain = idleBrain(G, out.k4, near(C, -2.4, 1.8), C);
    out.k6 = G.spawn('koylu6', { name: 'Hatun Ana', pos: near(C, -1.6, -2.6) }); out.k6.brain = idleBrain(G, out.k6, near(C, -1.6, -2.6), C);
  }
  return out;
}

export function playerAt(G, pos, yaw, weapon) {
  const p = G.player;
  p.pos.copy(pos); p.pos.y = heightAt(pos.x, pos.z); p.yaw = yaw; p.vel.set(0, 0, 0); p.knock.set(0, 0, 0);
  p.hp = p.maxHp; p.dead = false; p.model.rotation.x = 0; p.model.position.y = 0; p.attack = -1;
  p.pose = {}; p.sparring = null; p.skyHammer = false; p.canPower = false; p.charge = 0; p.dmgMul = 1; p.floorHp = 0;
  p.setWeapon(weapon || null);
  if ((G.currentScene || 1) < 4) p.clearOutfit(); else if (G.currentScene >= 5) p.setOutfit('gok');
  if (p.carryObj) { p.carryObj.parent && p.carryObj.parent.remove(p.carryObj); p.carryObj = null; }
  p.pourTilt = 0; p.crankTargets = null; p.crankSpin = null;
  G.cam.reset();
}

function fires(G, list) { return list.map(([p, s]) => G.fx.fire(p, s)); }

async function flyover(G, from, to, look, ms) {
  G.cam.shot = { pos: from.clone(), look: look.clone(), snap: true };
  await G.wait(0.05);
  G.cam.shot = { pos: to.clone(), look: look.clone(), speed: 1000 / ms * 0.9 };
}

// ---------------- the well and the trough ----------------
const Y = new THREE.Vector3(0, 1, 0);
const local = (origin, rot, x, y, z) => new THREE.Vector3(x, y, z).applyAxisAngle(Y, rot).add(origin);

function waterBucket(G) {
  const b = G.assets.prop('bucket'); b.scale.setScalar(0.75);
  const w = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshStandardMaterial({ color: 0x4f86a8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.4; b.add(w); b.userData.water = w;
  return b;
}

function drip(G, p, n = 1, spread = 0.2) {
  for (let i = 0; i < n; i++) G.fx.norm.add({ x: p.x + (Math.random() - 0.5) * spread, y: p.y, z: p.z + (Math.random() - 0.5) * spread, vx: 0, vy: -0.5, vz: 0,
    drag: 0, grav: -9, life: 0.45, age: 0, c0: [0.62, 0.8, 0.95], c1: [0.5, 0.7, 0.9], a: 0.85, s0: 0.07, s1: 0.04, floor: true });
}

// lower the bucket on its rope, let it fill, crank it back up
async function drawWater(G) {
  const W = G.world.wellObj, rot = W.rotation.y, o = W.position, p = G.player;
  G.cutscene(true);
  // stand at the crank (local -x side) facing the shaft
  const spot = local(o, rot, -1.56, 0, 0.18);
  p.pos.copy(spot); p.pos.y = heightAt(spot.x, spot.z); p.yaw = Math.atan2(o.x - spot.x, o.z - spot.z) + 0.25;
  G.cam.shot = { pos: local(o, rot, -1.2, 2.1, 3.6), look: local(o, rot, -0.4, 1.0, 0), speed: 2.5 };
  // rope + bucket hanging from the axle
  const axleY = 1.38;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), new THREE.MeshLambertMaterial({ color: 0x8a7350 }));
  const bucket = waterBucket(G); bucket.userData.water.visible = false; bucket.scale.setScalar(0.62);
  G.scene.add(rope, bucket);
  const setDepth = y => {
    const top = local(o, rot, 0, axleY, 0), b = local(o, rot, 0, y, 0);
    bucket.position.copy(b); bucket.rotation.y = rot;
    rope.position.set(top.x, o.y + (axleY + y + 0.3) / 2, top.z); rope.scale.y = Math.max(0.05, axleY - y - 0.3);
  };
  setDepth(1.0);
  let crank = 0;
  const turn = async (from, to, dur, dir) => {
    for (let t = 0; t < 1;) {
      const dt = await G.frame(); t = Math.min(1, t + dt / dur);
      const e = t * t * (3 - 2 * t);
      setDepth(from + (to - from) * e);
      crank += dt * 5.5 * dir; p.pose.crank = crank;
      const sp = G.world.wellSpin;
      if (sp) { p.crankSpin = sp; p.crankAxle = G.world.wellAxleY; p.crankTargets = p.crankTargets || {}; }
      else p.crankTargets = { R: local(o, rot, -1.2, 0.97, 0.02), L: local(o, rot, -1.02, 0.97, 0.02) };
      if (to > from && Math.random() < 0.5) drip(G, bucket.position.clone().add(new THREE.Vector3(0, 0.02, 0)), 1, 0.25);
    }
  };
  await G.wait(0.4);
  G.audio.whoosh(o, 0.15);
  await turn(1.0, -6.35, 2.6, -1);          // down the deep shaft
  G.audio.water('water_drop', 0.6);
  // ripples on the water far below
  for (let i = 0; i < 10; i++) G.fx.norm.add({ x: o.x + (Math.random() - 0.5) * 0.5, y: -6.45, z: o.z + (Math.random() - 0.5) * 0.5, vx: 0, vy: 0.6, vz: 0, drag: 2, grav: -6, life: 0.6, age: 0, c0: [0.5, 0.65, 0.75], c1: [0.3, 0.4, 0.5], a: 0.7, s0: 0.08, s1: 0.04 });
  G.ui.toast('Kova suya değdi...', 1200);
  await G.wait(0.45);
  G.audio.water('water_fill', 0.7);
  bucket.userData.water.visible = true;
  await G.wait(1.0);
  await turn(-6.35, 1.05, 4.2, 1);          // crank it all the way back up, dripping
  // let go of the crank, reach over and lift the bucket off the hook
  p.crankTargets = null; p.crankSpin = null; p.pose.crank = null; p.model.position.x = p.model.position.z = 0;
  const hook = bucket.position.clone().add(new THREE.Vector3(0, 0.36, 0));
  p.reachTarget = hook;
  await G.wait(0.55);
  p.reachTarget = null;
  G.scene.remove(rope, bucket);
  const carry = waterBucket(G);
  G.scene.add(carry); p.carryObj = carry; p.pose.carry = true;
  G.audio.water('water_splash', 0.35);
  G.ui.toast('Kova dolu. Dökmeden taşı.', 1600);
  G.cutscene(false);
  p.dripping = true;
}

// tip the bucket into the trough; the water level rises
async function pourWater(G) {
  const T = G.world.troughObj, rot = T.rotation.y, o = T.position, p = G.player;
  G.cutscene(true);
  const spot = local(o, rot, 0, 0, 1.3);
  p.pos.copy(spot); p.pos.y = heightAt(spot.x, spot.z); p.yaw = Math.atan2(o.x - spot.x, o.z - spot.z);
  G.cam.shot = { pos: local(o, rot, 1.9, 1.5, -1.9), look: local(o, rot, 0, 0.75, 0.6), speed: 2.5 };
  const b = p.carryObj;
  await G.wait(0.4);
  const water = G.world.troughWater; water.visible = true;
  G.audio.water('water_pour', 0.85);
  for (let t = 0; t < 1;) {
    const dt = await G.frame(); t = Math.min(1, t + dt / 2.8);
    const lift = Math.min(1, t / 0.2), tip = t < 0.2 ? 0 : Math.min(1, (t - 0.2) / 0.25) * (t > 0.85 ? (1 - t) / 0.15 : 1);
    p.pose.pour = lift * (t > 0.9 ? (1 - t) / 0.1 : 1);
    p.pourTilt = tip * 1.9;
    b.userData.water.visible = t < 0.75;
    if (tip > 0.4 && t < 0.85) {
      // the stream leaves the lip of the bucket
      const lip = new THREE.Vector3(0, 0.45, 0.3); b.localToWorld(lip);
      const f = p.forward();
      for (let i = 0; i < 4; i++) G.fx.norm.add({ x: lip.x + (Math.random() - 0.5) * 0.08, y: lip.y, z: lip.z + (Math.random() - 0.5) * 0.08,
        vx: f.x * 1.1 + (Math.random() - 0.5) * 0.3, vy: 0.2, vz: f.z * 1.1 + (Math.random() - 0.5) * 0.3,
        drag: 0.2, grav: -9, life: 0.5, age: 0, c0: [0.7, 0.86, 0.98], c1: [0.45, 0.65, 0.85], a: 0.8, s0: 0.11, s1: 0.07, floor: true });
      if (Math.random() < 0.4) drip(G, local(o, rot, (Math.random() - 0.5) * 0.6, 0.3, 0.05), 3, 0.4);
      G.world.setTroughLevel(Math.min(1, (t - 0.3) / 0.55));
    }
  }
  G.world.setTroughLevel(1);
  p.pose.pour = 0;
  // leave the empty bucket on the ground
  p.carryObj = null; p.pose.carry = false; p.dripping = false; p.pourTilt = 0;
  b.rotation.set(0, p.yaw, 0); b.userData.water.visible = false;
  b.position.copy(local(o, rot, 1.2, 0, 0.5)); b.scale.setScalar(0.75); G.scene.add(b); G.world.temp.push(b);
  G.audio.water('water_splash', 0.4);
  await G.wait(0.3);
  G.cutscene(false);
}

// ---------------- scene 1: morning ----------------
async function scene1(G) {
  G.world.setTime('day', 0); G.audio.setMood('calm'); G.audio.music('epic_intro', { loop: false, then: 'inspire', fade: 0.5 });
  G.world.ship.visible = false; G.fx.columnAt = null; G.world.skyU.glow.value = 0;
  G.world.gateOpen(true, true);
  const forgeFire = G.fx.fire(v(OBA.forge.x, heightAt(OBA.forge.x, OBA.forge.z) + 0.58, OBA.forge.z), 0.55, { intensity: 4 });
  G.fx.fire(v(OBA.campfire.x, heightAt(OBA.campfire.x, OBA.campfire.z) + 0.1, OBA.campfire.z), 0.6, { intensity: 6 });
  const bars = G.spawn('bars', { name: 'Usta Bars', pos: near(OBA.anvil, -0.4, 1.0), weapon: 'hammer10' });
  bars.brain = smithBrain(G, bars, OBA.anvil);
  const kacin = G.spawn('kacin', { name: 'Kaçın', pos: near(OBA.spar, 1, 0) });
  kacin.brain = wanderBrain(G, kacin, [OBA.spar, near(OBA.spar, 3, -2), near(OBA.spar, -2, 2)]);
  villagers(G, 'day');
  playerAt(G, near(OBA.anvil, -2.2, 2.6), Math.PI * 0.8);

  G.cutscene(true);
  await flyover(G, v(-40, 22, 40), v(-10, 7, 20), v(4, 1, -2), 5200);
  await G.ui.fade(0, 1500);
  await G.ui.title('Kayalı Pınar Obası', 'Sabah · Prolog: Gece Düşen Işık', 3000);
  G.cam.shot = { pos: near(OBA.anvil, -4, 4.5).add(v(0, 2.2, 0)), look: near(OBA.anvil, 0, 0).add(v(0, 1.3, 0)), speed: 1.5 };
  await G.wait(1.5);
  bars.brain = idleBrain(G, bars, bars.pos.clone(), G.player); bars.pose.talk = true;
  await G.say('Usta Bars', 'Demiri sen dövmezsin Alp. Demir sana ne olacağını söyler, sen dinlersin.');
  const c = await G.ui.choice('Alp', '', ['"Demir konuşmaz usta, ben vururum." (cesur)', '"Bugün ne söylüyor peki?" (meraklı)', '(Sessizce başını salla.) (sakin)']);
  G.flags.trait = ['cesur', 'merakli', 'sakin'][c];
  await G.say('Usta Bars', [
    'Vurursun, vurursun... Bir gün demir de sana vurur. O gün anlarsın.',
    'Bugün mü? Bugün sus diyor. Garip bir gün.',
    'İyi. Susan adam dinler. Dinleyen adam öğrenir.'][c]);
  await G.say('Usta Bars', 'Ocak susuz kaldı. Kuyudan bir kova su getir, sonra konuşuruz.');
  bars.pose.talk = false;
  G.cutscene(false);

  G.ui.hint('<b>W A S D</b> yürü · <b>Shift</b> koş · <b>Fare</b> kamerayı çevir · <b>E</b> etkileşim');
  G.ui.objective('Kuyudan bir kova su getir');
  await G.interact({ pos: OBA.well, r: 2.6, label: 'Kovayı kuyuya sarkıt' });
  G.ui.hint(null);
  await drawWater(G);
  G.ui.objective('Suyu ocağın yanındaki yalağa dök');
  await G.interact({ pos: OBA.trough, r: 2.2, label: 'Suyu dök' });
  await pourWater(G);
  await G.say('Usta Bars', 'Aferin. Şimdi Kaçın\'ı bul, biraz talim yapın. Kolların ısınmadan örse dokunma.');

  // ---- sparring ----
  G.ui.objective('Kaçın\'la talim yap');
  await G.interact({ actor: kacin, r: 2.4, label: 'Kaçın\'la konuş' });
  G.cutscene(true);
  kacin.brain = idleBrain(G, kacin, kacin.pos.clone(), G.player); kacin.pose.talk = true;
  await G.say('Kaçın', 'Demirci çırağı! Yine mi kovayla oynadın? Al şu söğüt dalını, bakalım kolların ne âlemde.');
  await G.say('Kaçın', 'Beş kez değdirirsen pes ederim. Ama ben de boş durmam, haberin olsun!');
  kacin.pose.talk = false;
  G.player.setWeapon('stick'); kacin.setWeapon('stick');
  kacin.team = 'spar'; kacin.hp = kacin.maxHp = 999; kacin.floorHp = 1; kacin.atkMul = 0.4;
  G.player.sparring = kacin; kacin.sparring = G.player; G.player.floorHp = 15;
  let landed = 0;
  kacin.onHit = (d, from, blocked) => { if (!blocked && from === G.player) { landed++; G.ui.objective(`Kaçın'a değdir (${Math.min(landed, 5)}/5)`); } };
  G.player.onHitExtra = null;
  kacin.brain = sparBrain(G, kacin);
  G.cutscene(false);
  G.ui.objective('Kaçın\'a değdir (0/5)');
  G.ui.hint('<b>Sol tık</b> vur (art arda üç vuruş) · <b>Sağ tık</b> basılı tut: blok · <b>C</b> yuvarlan · <b>Boşluk</b> zıpla<br>Kaçın vurmadan önce kızarır: o an kaç ya da blokla.');
  let warned = false;
  await G.until(() => {
    if (G.player.hp <= 20 && !warned) { warned = true; G.ui.toast('Kaçın: "Dur dur, nefeslen biraz!"'); G.player.hp = 70; setTimeout(() => warned = false, 3000); }
    return landed >= 5;
  });
  G.ui.hint(null);
  kacin.onHit = null; G.player.sparring = null; kacin.sparring = null; kacin.team = 'oba'; G.player.floorHp = 0;
  kacin.brain = idleBrain(G, kacin, kacin.pos.clone(), G.player);
  G.cutscene(true);
  kacin.pose.talk = true;
  await G.say('Kaçın', 'Tamam, tamam! Pes ediyorum! Usta seni boşuna çekiç başında tutmuyormuş.');
  kacin.pose.talk = false; kacin.setWeapon(null); G.player.setWeapon(null);
  G.cutscene(false);
  kacin.brain = wanderBrain(G, kacin, [OBA.spar, near(OBA.spar, 3, -2), near(OBA.campfire, 3, 3)]);
  G.player.hp = G.player.maxHp;

  // ---- forging ----
  G.ui.objective('Örse dön ve ilk çekicini döv');
  await G.interact({ pos: OBA.anvil, r: 2.2, label: 'Örse geç' });
  G.cutscene(true);
  G.player.pos.copy(near(OBA.anvil, -0.9, 0.9)); G.player.yaw = G.player.angleTo(OBA.anvil);
  G.player.setWeapon('hammer10');
  bars.brain = idleBrain(G, bars, near(OBA.anvil, 1.4, 1.6), G.world.anvil.position);
  G.cam.shot = { pos: near(OBA.anvil, -2.6, 3.0).add(v(0, 2.1, 0)), look: OBA.anvil.clone().add(v(0, 1, 0)), speed: 3 };
  await G.say('Usta Bars', 'Kızgın demir örste. Altın ışığı yakaladığında vur. Üç vuruş, ne eksik ne fazla.');
  G.ui.hint('<b>Boşluk</b> ya da <b>tık</b>: ibre altın bölgedeyken vur');
  const score = await G.ui.forgeGame();
  G.ui.hint(null);
  G.flags.forge = score;
  G.player.setWeapon('hammer');
  await G.say('Usta Bars', [
    'Eğri büğrü... Ama elinde durursa çekiçtir. Al, bu artık senin.',
    'Fena değil. Sapı biraz yamuk, ama başı sağlam. Al, bu senin.',
    'İyi dinledin. Demir de seni dinledi. Al, bu senin.',
    'Hah! Benim ilk çekicim bundan kötüydü. Al, bu senin. Taşı onu.'][score]);
  G.ui.toast('İlk çekicin: Demir Çekiç');
  await G.say('Usta Bars', 'Göğe bak bu gece. Dedemin dedesi, Tengri\'nin örsü yere düştüğünde gök böyle kızıl olmuş, derdi.');
  await G.say('Alp', 'Bugün gök mavi usta.', { italic: true });
  await G.say('Usta Bars', 'Şimdilik.');
  await G.ui.fade(1, 1400);
  G.cutscene(false);
  return 2;
}

// ---------------- scene 2: night, the light falls ----------------
async function scene2(G) {
  G.world.setTime('night', 0); G.audio.setMood('night');
  G.world.ship.visible = false; G.fx.columnAt = null; G.world.skyU.glow.value = 0;
  G.world.gateOpen(true, true);
  G.fx.fire(v(OBA.campfire.x, heightAt(OBA.campfire.x, OBA.campfire.z) + 0.1, OBA.campfire.z), 1.1, { intensity: 26 });
  G.fx.fire(v(OBA.forge.x, heightAt(OBA.forge.x, OBA.forge.z) + 0.58, OBA.forge.z), 0.4, { intensity: 3, smoke: false });
  const C = OBA.campfire;
  const bars = G.spawn('bars', { name: 'Usta Bars', pos: near(C, 2.2, -1.6) }); bars.brain = idleBrain(G, bars, near(C, 2.2, -1.6), C);
  const kacin = G.spawn('kacin', { name: 'Kaçın', pos: near(C, -2.6, -0.4) }); kacin.brain = idleBrain(G, kacin, near(C, -2.6, -0.4), C);
  villagers(G, 'fire');
  playerAt(G, near(C, 0.6, 2.8), Math.PI, 'hammer');

  G.cutscene(true);
  G.cam.shot = { pos: near(C, 4.5, 6).add(v(0, 2.4, 0)), look: C.clone().add(v(0, 0.8, 0)), snap: true };
  await G.ui.fade(0, 1500);
  await G.ui.title('Gece', 'Ateşin başında', 2600);
  await G.say('Köylü', 'Bu yıl kış erken gelecek. Kuşlar güneye erken döndü.');
  await G.say('Kaçın', 'Kuşlar her yıl erken döner, sen her yıl aynı şeyi söylersin.');
  // ---- the meteor ----
  const start = v(150, 120, 40), end = OBA.meteor.clone().add(v(0, 8, 0));
  G.cam.shot = { pos: near(C, -2, 5).add(v(0, 1.4, 0)), look: v(60, 60, -40), speed: 0.9 };
  await G.wait(1.2);
  G.audio.rumble(4.4);
  const head = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.25, 'rgba(255,150,60,.7)'); g.addColorStop(1, 'rgba(255,60,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.scale.setScalar(40); head.add(glow);
  G.scene.add(head);
  const hl = { position: new THREE.Vector3(), intensity: 0 };
  for (let t = 0; t < 1; t += 0) {
    const dt = await G.frame();
    t = Math.min(1, t + dt / 4.6);
    const p = start.clone().lerp(end, t * t * 0.5 + t * 0.5);
    head.position.copy(p); G.fx.light(p, 0xff7a3a, 400 + t * 900, 700);
    for (let i = 0; i < 3; i++) G.fx.meteorTrail(p);
    G.world.skyU.glow.value = t * 0.6;
    G.cam.shot.look.lerp(p, Math.min(1, dt * 3));
  }
  G.scene.remove(head);
  G.fx.flash(OBA.meteor.clone().add(v(0, 30, 0)), 0xffb070, 4000, 1.6, 900);
  G.world.ship.visible = true; G.fx.column(OBA.meteor);
  G.world.skyU.glow.value = 1;
  await G.wait(0.15);
  G.ui.whiteFlash();
  G.audio.boom(0.9); await G.wait(0.9); G.shake(1.2);
  for (const a of G.actors) if (a !== G.player) a.pose.guard = false;
  await G.wait(1.8);
  G.cam.shot = { pos: near(C, 3.2, 3.5).add(v(0, 1.8, 0)), look: kacin.pos.clone().add(v(0, 1.5, 0)), speed: 2.2 };
  kacin.pose.talk = true;
  await G.say('Kaçın', 'Yıldız mı düştü o? Gördün mü Alp? Gidelim, sabah ilk biz bulalım!');
  kacin.pose.talk = false; bars.pose.talk = true;
  G.cam.shot = { pos: near(C, 4.6, -0.6).add(v(0, 1.8, 0)), look: bars.pos.clone().add(v(0, 1.5, 0)), speed: 2.2 };
  await G.say('Usta Bars', 'Kimse gitmiyor. Hiç kimse.');
  await G.say('Usta Bars', 'Atları ağıla kapatın. Ateşi küçültün. Bu gece obanın ışığı uzaktan görünmesin.');
  bars.pose.talk = false;
  G.cutscene(false);
  G.world.skyU.glow.value = 0.7;

  G.ui.objective('Ağılın kapısını kapat');
  await G.interact({ pos: OBA.gate, r: 2.2, label: 'Kapıyı kapat' });
  G.world.gateOpen(false); G.audio.whoosh(OBA.gate, 0.3);
  G.ui.toast('Atlar ağılda.');
  await G.wait(0.8);
  G.ui.objective('Yurduna dön ve uyu');
  await G.interact({ pos: near(OBA.alpYurt, 2.4, -0.4), r: 2.0, label: 'Uyu' });
  await G.ui.fade(1, 1600);
  return 3;
}

// ---------------- scene 3: the raid ----------------
function raidSetup(G, opts = {}) {
  G.world.setTime('raid', 0); G.audio.setMood('battle');
  G.world.ship.visible = true; G.fx.column(OBA.meteor); G.world.skyU.glow.value = 0.55;
  G.world.gateOpen(false, true);
  fires(G, [[G.world.hay[2].position, 1.5], [G.world.hay[3].position, 1.4], [v(-17, 0, 12), 1.6], [v(OBA.forge.x, heightAt(OBA.forge.x, OBA.forge.z) + 0.58, OBA.forge.z), 0.45]]);
  if (opts.familyBurning) burnYurt(G);
}

function burnYurt(G) {
  const c = OBA.familyYurt;
  G.fx.fire(c.clone().setY(2.9), 1.8, { intensity: 40 });
  [0.6, 2.4, 4.2].forEach(a => G.fx.fire(v(c.x + Math.cos(a) * 3.1, 1.0, c.z + Math.sin(a) * 3.1), 1.0, { light: false, smoke: a === 2.4 }));
  // scorch the felt
  G.world.yurts.family.traverse(o => { if (o.isMesh && !o.userData.burnt) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.45); o.userData.burnt = true; } });
}

async function scene3(G) {
  raidSetup(G);
  const bars = G.spawn('bars', { name: 'Usta Bars', pos: near(OBA.forge, -2.4, 2.2), weapon: 'hammer10' });
  bars.brain = idleBrain(G, bars, near(OBA.forge, -2.4, 2.2), OBA.entrance);
  const kacin = G.spawn('kacin', { name: 'Kaçın', pos: near(OBA.alpYurt, 3, -4), weapon: 'axe', hp: 60, atkMul: 0.45 });
  kacin.floorHp = 8; kacin.home = near(OBA.campfire, -4, 6); kacin.brain = allyBrain(G, kacin);
  const k2 = G.spawn('koylu2', { name: 'Köylü', pos: near(OBA.campfire, -3, -2), weapon: 'rake', hp: 50, atkMul: 0.35 }); k2.floorHp = 8; k2.home = near(OBA.campfire, -5, -3); k2.brain = allyBrain(G, k2);
  const k4 = G.spawn('koylu4', { name: 'Köylü', pos: near(OBA.campfire, 2, 3), weapon: 'fork', hp: 50, atkMul: 0.35 }); k4.floorHp = 8; k4.home = near(OBA.campfire, 3, 4); k4.brain = allyBrain(G, k4);
  const hatun = G.spawn('koylu6', { name: 'Hatun Ana', pos: near(OBA.familyYurt, 3.5, 1) }); hatun.brain = idleBrain(G, hatun, near(OBA.familyYurt, 3.5, 1), OBA.familyYurt);
  playerAt(G, near(OBA.alpYurt, 2.4, -0.6), Math.PI * 1.2, 'hammer');
  G.player.dmgMul = 1.0;

  // soldiers storm in from the west road
  G.cutscene(true);
  const wave1 = [v(-44, 0, 1), v(-46, 0, 4), v(-47, 0, -1)].map(p => soldier(G, p, { torch: true, yaw: Math.PI / 2 }));
  for (const s of wave1) s.brain = (b => dt => { if (G.cutsceneOn) { s.move(new THREE.Vector3(1, 0, 0), 4.2, dt); s.yaw = Math.PI / 2; s.pose.guard = true; } else b(dt); })(s.brain);
  G.cam.shot = { pos: v(-20, 4, 10), look: v(-40, 1.2, 2), snap: true };
  await G.ui.fade(0, 900);
  G.ui.toast('Çığlıklar... at kişnemeleri... ateş!', 2400);
  G.cam.shot = { pos: v(-22, 3, 9), look: v(-32, 1.4, 2), speed: 0.8 };
  await G.ui.title('Baskın', 'Gece yarısı', 2400);
  G.cam.shot = { pos: near(G.player.pos, 2, 3).add(v(0, 2, 0)), look: kacin.pos.clone().add(v(0, 1.4, 0)), speed: 2 };
  kacin.pose.talk = true;
  await G.say('Kaçın', 'Alp! Uyan! Hisar askerleri! Samanlıkları yakıyorlar!');
  kacin.pose.talk = false;
  G.cutscene(false);

  G.ui.hint('Askerler vurmadan önce <b>kızarır</b>. <b>Sağ tık</b> blok, <b>C</b> yuvarlan, <b>Boşluk</b> zıpla. Üçüncü vuruşun (ağır darbe) en güçlüsü.');
  setTimeout(() => G.ui.hint(null), 9000);
  await fightWave(G, wave1, 'Obayı savun');

  // ---- wave 2 and the choice ----
  const wave2 = [v(-48, 0, 6), v(-46, 0, -6), v(-36, 0, 22), v(-30, 0, -22)].map((p, i) => soldier(G, p, { torch: i < 2 }));
  burnYurt(G);
  G.ui.toast('Yeni askerler geliyor!');
  let killed = 0;
  const totalW2 = wave2.length;
  wave2.forEach(s => { const od = s.onDie; s.onDie = () => { od && od(); killed++; }; });
  G.ui.objective(`Obayı savun (0/${totalW2})`);
  await G.until(() => { G.ui.objectiveCount(`Obayı savun (${killed}/${totalW2})`); return killed >= 2; });

  // freeze the fight for the choice
  G.cutscene(true); G.freeze = true;
  hatun.pose.talk = true;
  G.cam.shot = { pos: near(OBA.familyYurt, 7, 7).add(v(0, 3, 0)), look: OBA.familyYurt.clone().add(v(0, 1.5, 0)), speed: 2.5 };
  await G.say('Hatun Ana', 'Alp! Yurdum yanıyor! Torunlarım içeride, kapı sıkıştı!');
  hatun.pose.talk = false;
  // Kaçın gets surrounded near the west yurt
  const kSpot = v(-20, 0, 14);
  kacin.pos.copy(kSpot); kacin.home = kSpot.clone();
  const grab = [soldier(G, near(kSpot, -2.5, 1)), soldier(G, near(kSpot, 2, -2.2)), soldier(G, near(kSpot, -1, -2.8))];
  G.cam.shot = { pos: near(kSpot, 6, 6).add(v(0, 2.6, 0)), look: kSpot.clone().add(v(0, 1.2, 0)), speed: 2.5 };
  await G.say('Kaçın', 'Alp! Sardılar beni! Tek başıma tutamam!');
  const ch = await G.ui.choice('Alp', 'İkisine birden yetişemezsin.', [
    { t: 'Yanan yurda koş, çocukları çıkar', tag: 'Hatun Ana' },
    { t: 'Kaçın\'a yardım et', tag: 'Kaçın' },
  ], { time: 10, defaultIndex: 0 });
  G.freeze = false; G.cutscene(false);
  G.flags.saved = ch === 0 ? 'aile' : 'kacin';

  if (ch === 0) {
    G.ui.objective('Yanan yurttan çocukları çıkar');
    const door = OBA.familyYurt.clone().add(new THREE.Vector3(1, 0, 0).applyAxisAngle(v(0, 1, 0), G.world.yurts.family.rotation.y).multiplyScalar(3.6));
    await G.interact({ pos: door, r: 2.2, label: 'Kapıyı zorla (basılı tut)', hold: 2.0 });
    const kids = [G.spawn('koylu2', { name: 'Çocuk', pos: door.clone(), scale: 0.7 }), G.spawn('koylu6', { name: 'Çocuk', pos: near(door, 0.6, 0.6), scale: 0.68 })];
    const safe = v(30, 0, 2);
    kids.forEach(k => { k.solid = false; k.brain = fleeBrain(G, k, safe); });
    hatun.brain = fleeBrain(G, hatun, safe);
    G.ui.toast('Çocuklar kurtuldu!');
    // meanwhile Kaçın is dragged away
    kacin.gone = true; grab.forEach(g => g.gone = true);
    await G.wait(1.2);
    G.ui.toast('Kaçın\'ın sesi kesildi... Onu götürdüler.', 3200);
  } else {
    G.ui.objective('Kaçın\'ı kurtar');
    G.ui.marker(kSpot, 'Kaçın');
    await G.until(() => grab.every(g => !g.alive));
    G.ui.marker(null);
    kacin.pose.talk = true;
    await G.say('Kaçın', 'Sağ ol kardeşim... Ama Hatun Ana\'nın yurdu...', { auto: 2200 });
    kacin.pose.talk = false;
    // the family yurt collapses
    G.world.yurts.family.userData.collapse = true;
    hatun.brain = fleeBrain(G, hatun, v(30, 0, 2));
    G.ui.toast('Hatun Ana\'nın yurdu çöktü.', 3200);
  }
  // clean up the rest of wave 2
  const rest = () => G.actors.filter(a => a.team === 'hisar' && a.alive);
  if (rest().length) {
    G.ui.objective('Kalan askerleri püskürt');
    await G.until(() => rest().length === 0);
  }
  G.ui.objective(null);
  await G.wait(1.0);

  // ---- the captain at the forge ----
  G.cutscene(true);
  const cap = soldier(G, v(-3, 0, -10), { key: 'yuzbasi', helmet: 'helmet3', hp: 190, weapon: 'sword', boss: true, scale: 1.1, atkMul: 1.25, torch: false });
  cap.name = 'Hisar Yüzbaşısı';
  const guards = [soldier(G, v(-5, 0, -11), { torch: true }), soldier(G, v(-2, 0, -12.5), { torch: true })];
  for (const a of G.actors) if (a.fighter && a.alive) a.brain = idleBrain(G, a, a.pos.clone(), bars);
  const capPos = near(OBA.forge, -5.5, 1.5);
  [cap, ...guards].forEach((s, i) => { s.brain = idleBrain(G, s, i === 0 ? capPos : near(capPos, -1.6, (i - 1.5) * 2.6), bars); s.pose.guard = true; });
  bars.brain = idleBrain(G, bars, near(OBA.forge, -2.6, 1.8), cap);
  playerAt(G, near(OBA.forge, -4.5, 8.5), Math.PI, 'hammer');
  G.cam.shot = { pos: near(OBA.forge, 0.5, 5.5).add(v(0, 2.0, 0)), look: near(OBA.forge, -4.2, 1.6).add(v(0, 1.3, 0)), speed: 1.4 };
  await G.until(() => cap.distTo(capPos) < 0.8);
  await G.wait(0.4);
  cap.pose.talk = true;
  await G.say('Hisar Yüzbaşısı', 'Demirci Bars! Dağın yerini söyle, obanı sağ bırakalım.');
  cap.pose.talk = false; bars.pose.talk = true;
  await G.say('Usta Bars', 'Dağı Tengri gömdü. Siz de gömülürsünüz.');
  bars.pose.talk = false;
  await G.say('Hisar Yüzbaşısı', 'Kırk yıl sakladın, değil mi ihtiyar? Kara Kam her şeyi anlattı.');
  bars.setWeapon('hammer10'); bars.pose.guard = true;
  await G.wait(0.4);
  cap.brain = dt => { cap.faceTo(bars, dt); cap.move(new THREE.Vector3(), 0, dt); };
  cap.startAttack(2);
  await G.wait(0.55);
  bars.takeHit(5, cap, 3); bars.pose.kneel = 1; bars.setWeapon(null);
  G.shake(0.4);
  await G.wait(1.0);
  return 4;
}

export async function fightWave(G, list, label) {
  let killed = 0;
  list.forEach(s => { const od = s.onDie; s.onDie = () => { od && od(); killed++; }; });
  G.ui.objective(`${label} (0/${list.length})`);
  await G.until(() => { G.ui.objectiveCount(`${label} (${killed}/${list.length})`); return killed >= list.length; });
}

// ---------------- scene 4: the inheritance ----------------
async function scene4(G) {
  raidSetup(G, { familyBurning: G.flags.saved !== 'kacin' });
  if (G.flags.saved === 'kacin') G.world.yurts.family.userData.collapse = true;
  const bars = G.spawn('bars', { name: 'Usta Bars', pos: near(OBA.chest, -1.2, 0.8) });
  bars.pose.kneel = 1; bars.brain = idleBrain(G, bars, near(OBA.chest, -1.2, 0.8), OBA.chest);
  const cap = soldier(G, near(OBA.forge, -9, 1), { key: 'yuzbasi', helmet: 'helmet3', hp: 190, weapon: 'sword', boss: true, scale: 1.1, atkMul: 1.25 });
  cap.name = 'Hisar Yüzbaşısı';
  const foes = [cap,
    soldier(G, near(OBA.forge, -10, 4), { torch: true, atkMul: 0.7 }), soldier(G, near(OBA.forge, -11, -2), { torch: true, atkMul: 0.7 }),
    soldier(G, v(-14, 0, 2), { atkMul: 0.7 }), soldier(G, v(-10, 0, 9), { atkMul: 0.7 })];
  const realBrains = foes.map(f => f.brain);
  foes.forEach((f, i) => { f.brain = idleBrain(G, f, f.pos.clone(), OBA.forge); });
  if (G.flags.saved === 'kacin') {
    const kacin = G.spawn('kacin', { name: 'Kaçın', pos: v(-2, 0, 10), weapon: 'axe', hp: 60, atkMul: 0.45 });
    kacin.floorHp = 8; kacin.home = v(0, 0, 4); kacin.brain = allyBrain(G, kacin); kacin.passive = true;
    const kb = kacin.brain; kacin.brain = dt => { if (!G.bossFight) { kacin.move(new THREE.Vector3(), 0, dt); return; } kb(dt); };
  }
  playerAt(G, near(OBA.forge, -2.5, 9), Math.PI * 0.95, 'hammer');

  G.cutscene(true);
  G.cam.shot = { pos: near(OBA.chest, -4, 4).add(v(0, 2.2, 0)), look: bars.pos.clone().add(v(0, 0.8, 0)), snap: true };
  await G.ui.fade(0, 900);
  await G.ui.title('Miras', '', 2000);
  G.cutscene(false);
  G.ui.objective('Usta Bars\'ın yanına koş');
  await G.interact({ actor: bars, r: 2.4, label: 'Ustanın yanına diz çök' });

  G.cutscene(true); G.audio.setMood('grief');
  G.player.pos.copy(near(bars.pos, -0.9, 0.9)); G.player.yaw = G.player.angleTo(bars); G.player.pose.kneel = 0.6;
  G.cam.shot = { pos: near(bars.pos, -2.4, 2.6).add(v(0, 1.6, 0)), look: bars.pos.clone().add(v(0, 0.9, 0)), speed: 2 };
  await G.say('Usta Bars', 'Sandık... ocağın dibindeki sandık, Alp.');
  G.world.chest.rotation.x = -0.2;
  await G.say('Usta Bars', 'Bunu ben dövmedim. Dağın kendisinden kopardım. Kırk yıl sakladım.');
  const c = await G.ui.choice('Alp', '', ['"Seni bırakmam usta!"', '"Bu dağ ne usta? Ne sakladın?"', '"Kim yaptı bunu? Adını söyle." (intikam)']);
  G.flags.lastWords = c;
  await G.say('Usta Bars', [
    'Bırakacaksın. Bırakmazsan ikimiz de gideriz. Doğuya git.',
    'Gökten düşen bir dağ... Tengri\'nin örsü. Bu gece bir tane daha düştü. Uyanıyorlar, Alp.',
    'Adı önemli değil. Onlar yalnızca el. Asıl kol... asıl kol başka yerde.'][c]);
  // the sky hammer
  G.player.pose.kneel = 0;
  G.player.setWeapon('gokcekic', 0.22, true); G.player.skyHammer = true; G.player.canPower = true; G.player.charge = 100;
  G.player.dmgMul = 1.6;
  G.fx.skyBurst(G.player.pos.clone().add(v(0, 1.4, 0)), 50); G.fx.flash(G.player.pos.clone().add(v(0, 2, 0)), 0x8fd8ff, 80, 0.6, 20);
  G.audio.thunder();
  G.ui.toast('Gök Çekiç', 2600);
  await G.wait(1.2);
  await G.say('Usta Bars', 'Altında... benim zırhım da var. Gençken giydiğim. Sana olur.');
  G.player.setOutfit('gok');
  G.fx.skyBurst(G.player.pos.clone().add(v(0, 1.3, 0)), 24);
  G.ui.toast('Bars\'ın zırhı: omuzluklar ve mavi keçe pelerin', 2600);
  await G.say('Usta Bars', 'Doğuya git. Kağan\'a değil... Hatun\'a götür.');
  await G.say('Usta Bars', 'Dağ uyanıyor... Kara Kam... kardeşim...', { italic: true });
  bars.pose.kneel = 0; bars.die(); bars.fallDir = -1;
  await G.wait(1.6);
  G.flags.barsDead = true;
  // the captain turns on Alp
  G.cam.shot = { pos: near(G.player.pos, 2.5, 3).add(v(0, 2, 0)), look: cap.pos.clone().add(v(0, 1.5, 0)), speed: 1.6 };
  cap.pose.talk = true;
  await G.say('Hisar Yüzbaşısı', 'Demek çırağa vermiş. Getirin o çekici bana!');
  cap.pose.talk = false;
  G.audio.setMood('battle');
  G.cutscene(false); G.bossFight = true;
  foes.forEach((f, i) => f.brain = realBrains[i]);
  G.ui.hint('Gök çekiç parlıyor. Gök barı doluyken <b>F</b>: <b>Gök Gürlemesi</b>. Vuruşların barı yeniden doldurur.');
  setTimeout(() => G.ui.hint(null), 10000);
  cap.makeHpBar && (cap.hpBar.g.visible = true);
  let left = foes.length;
  foes.forEach(f => { const od = f.onDie; f.onDie = () => { od && od(); left--; if (left === 0) G.hitstop(0.6); }; });
  G.ui.objective('Yüzbaşıyı ve adamlarını yen');
  await G.until(() => foes.every(f => !f.alive));
  G.bossFight = false;
  await G.wait(1.4);
  return 5;
}

// ---------------- ending ----------------
async function ending(G) {
  await G.ui.fade(1, 1200);
  G.clearActors();
  G.fx.clear();
  G.world.setTime('dawn', 0); G.audio.setMood('grief');
  G.world.ship.visible = true; G.fx.column(OBA.meteor); G.world.skyU.glow.value = 0.25;
  fires(G, [[v(-17, 0, 12), 0.6], [G.world.hay[2].position, 0.5]]);
  const edge = v(14, 0, -30);
  playerAt(G, edge, Math.atan2(OBA.meteor.x - edge.x, OBA.meteor.z - edge.z), 'gokcekic');
  G.player.setWeapon('gokcekic', 0.22, true); G.player.skyHammer = true;
  if (G.flags.saved === 'kacin') {
    const k = G.spawn('kacin', { name: 'Kaçın', pos: near(edge, 1.6, 1.2) }); k.yaw = G.player.yaw; k.brain = idleBrain(G, k, near(edge, 1.6, 1.2), OBA.meteor);
  }
  G.cutscene(true);
  G.cam.shot = { pos: near(edge, -2.5, 5).add(v(0, 2.2, 0)), look: OBA.meteor.clone().add(v(0, 25, 0)), snap: true };
  await G.ui.fade(0, 2200);
  G.cam.shot = { pos: near(edge, -1.2, 3.2).add(v(0, 1.9, 0)), look: OBA.meteor.clone().add(v(0, 20, 0)), speed: 0.25 };
  await G.wait(3);
  await G.say('Alp', G.flags.lastWords === 2 ? 'Kara Kam. Adını unutmayacağım.' : 'Doğuya, usta. Hatun\'a.', { italic: true });
  await G.wait(0.8);
  await G.ui.fade(1, 1600);
  G.ui.ending(G.flags);
}

// ================= 1. PERDE: KAÇIŞ =================
function act1World(G) {
  G.world.bound = { x: 110, z: -15, R: 200 };
  G.world.setTime('dawn', 0); G.world.setTime('day', 40); G.audio.setMood('calm');
  G.world.ship.visible = true; G.fx.column(OBA.meteor); G.world.skyU.glow.value = 0.2;
  G.world.grave.visible = true;
  G.world.yurts.family.userData.collapse = true;
  fires(G, [[v(-17, 0, 12), 0.35], [G.world.hay[2].position, 0.3]]);
}

function spawnBoz(G, pos, yaw) {
  const h = new Horse(G, 'horse2', pos, yaw);
  G.horses.push(h); G.boz = h; return h;
}

// 5 · Boz — the grave, the horse, the ride to the creek
async function scene6(G) {
  act1World(G);
  playerAt(G, near(GRAVE, -1.4, 1.6), Math.atan2(GRAVE.x - (GRAVE.x - 1.4), GRAVE.z - (GRAVE.z + 1.6)), 'gokcekic');
  const p = G.player; p.setWeapon('gokcekic', 0.22, true); p.skyHammer = true; p.canPower = true; p.charge = 60; p.dmgMul = 1.5; p.setOutfit('gok');
  G.flags.tomris = G.flags.tomris || 0;
  G.cutscene(true);
  G.cam.shot = { pos: near(GRAVE, 3.5, 4).add(v(0, 1.8, 0)), look: GRAVE.clone().add(v(0, 0.8, 0)), snap: true };
  await G.ui.fade(0, 1800);
  await G.ui.title('1. Perde: Kaçış', 'Bölüm 1 · Boz', 3000);
  p.pose.kneel = 0.7;
  await G.say('Alp', 'Doğuya, usta. Hatun\'a. Sözüm söz.', { italic: true });
  p.pose.kneel = 0;
  await G.wait(0.6);
  // a whinny from the north: Boz comes back
  const boz = spawnBoz(G, v(30, 0, -75), Math.PI * 0.95);
  boz.target = near(GRAVE, 2.5, -3); boz.targetRun = false;
  G.cam.shot = { pos: near(GRAVE, -3, 4).add(v(0, 2.4, 0)), look: v(26, 1.2, -55), speed: 1.2 };
  G.audio.hoof(boz.pos, false);
  await G.say('Alp', 'Boz? Sen... kaçmıştın.', { italic: true });
  const t0 = G.time;
  await G.until(() => !boz.target || boz.distTo(boz.target) < 1.6 || G.time - t0 > 7);
  if (boz.target) { boz.pos.copy(boz.target); boz.pos.y = heightAt(boz.pos.x, boz.pos.z); boz.target = null; boz.speed = 0; }
  G.cam.shot = { pos: near(GRAVE, 4, 2).add(v(0, 2, 0)), look: boz.pos.clone().add(v(0, 1.2, 0)), speed: 2 };
  await G.say('Alp', 'Ustanın atı ustasız kalmaz. Gel bakalım.');
  G.cutscene(false);
  G.bozFree = true;
  G.ui.objective('Boz\'a bin');
  G.ui.marker(boz.pos, '');
  await G.until(() => !!p.mount);
  G.ui.marker(null);
  G.ui.hint('<b>W</b> ilerle · <b>A D</b> dön · <b>Shift</b> dörtnala · <b>S</b> yavaşla · <b>E</b> in · <b>H</b> ıslıkla Boz\'u çağır · Atın üstünden <b>sol tık</b> ile vurabilirsin.');
  setTimeout(() => G.ui.hint(null), 11000);
  // ride east to the ford
  const ford = v(creekX(-6) - 8, 0, -5);
  G.ui.objective('Doğuya, Söğütlü Dere\'nin geçidine sür');
  G.ui.marker(ford, 'Geçit');
  await G.until(() => p.distTo(ford) < 14);
  G.ui.marker(null);
  // a patrol at the ford
  const patrol = [soldier(G, v(creekX(-6) + 10, 0, -2)), soldier(G, v(creekX(-6) + 12, 0, -9))];
  G.ui.toast('Akıncı devriyesi!', 1600);
  await G.say('Asker', 'Şu ata bak! Yüzbaşının dediği at bu! Yakala!', { auto: 1800 });
  await fightWave(G, patrol, 'Devriyeyi püskürt');
  G.ui.objective(null);
  await G.wait(1);
  await G.say('Alp', 'Peşimdeler. Ama nereye gittiğimi bilmiyorlar... henüz.', { italic: true, auto: 2400 });
  // smoke rising over Ak Pınar
  G.fx.fire(AKPINAR.clone().add(v(-14, 0, 6)), 1.4, { light: false });
  G.fx.fire(AKPINAR.clone().add(v(12, 0, -10)), 1.6, { light: false });
  G.ui.objective('Doğudaki dumana, Ak Pınar Obası\'na git');
  G.ui.marker(AKPINAR, 'Ak Pınar');
  await G.until(() => p.distTo(AKPINAR) < 60);
  G.ui.marker(null);
  return 7;
}

// 6 · Ak Pınar — the raid, Tomris, the cages, Kutlu Bey
async function scene7(G) {
  act1World(G);
  G.audio.setMood('battle');
  const p = G.player;
  if (!G.boz) {   // entered from the menu
    playerAt(G, near(AKPINAR, -55, 8), Math.PI / 2, 'gokcekic');
    p.setWeapon('gokcekic', 0.22, true); p.skyHammer = true; p.canPower = true; p.charge = 60; p.dmgMul = 1.5; p.setOutfit('gok');
    const boz = spawnBoz(G, near(AKPINAR, -55, 8), Math.PI / 2); p.mountHorse(boz); G.bozFree = true;
  }
  G.flags.tomris = G.flags.tomris || 0;
  const A = AKPINAR;
  fires(G, [[A.clone().add(v(-14, 0, 6)), 1.4], [A.clone().add(v(12, 0, -10)), 1.6], [G.world.ak.yurts[2].position.clone().setY(2.8), 1.5]]);
  // raiders in the camp, captives in cages
  const w1 = [soldier(G, near(A, -10, -2)), soldier(G, near(A, -4, 10)), soldier(G, near(A, 6, -6)), soldier(G, near(A, 2, 2))];
  const captives = G.world.ak.cages.map((c, i) => { const a = G.spawn(['koylu2', 'koylu4', 'koylu6'][i], { name: 'Esir', pos: c.pos.clone() }); a.pose.kneel = 1; a.solid = false; a.brain = idleBrain(G, a, c.pos.clone(), A); return a; });
  const tomris = G.spawn('tomris', { name: 'Tomris', pos: near(A, -26, 16), hp: 80, team: 'oba' });
  tomris.setBow(); tomris.floorHp = 10; tomris.brain = idleBrain(G, tomris, near(A, -26, 16), p);
  // arrival
  G.cutscene(true);
  if (p.mount) { p.mount.speed = 0; }
  G.cam.shot = { pos: near(A, -46, 14).add(v(0, 4, 0)), look: A.clone().add(v(0, 2, 0)), snap: true };
  G.ui.fade(0, 1000);
  await G.ui.title('Ak Pınar\'da Duman', 'Bölüm 2', 2600);
  // an arrow thuds into the ground in front of Alp
  const front = p.pos.clone().addScaledVector(p.forward(), 2.2);
  G.shootArrow(tomris.pos.clone().add(v(0, 1.5, 0)), front, 0, 'neutral');
  G.cam.shot = { pos: p.pos.clone().add(v(2.5, 2.4, 3)), look: tomris.pos.clone().add(v(0, 1.4, 0)), speed: 1.6 };
  tomris.pose.aim = 1;
  await G.wait(1.2);
  await G.say('Tomris', 'Bir adım daha atarsan ikinci ok boğazına gelir, Hisarlı.');
  const c = await G.ui.choice('Alp', '', [
    { t: '"Hisarlı olsaydım sırtımı sana dönmezdim."', tag: 'dön ve savaş' },
    { t: '"Okunu sakla, onların sayısı daha çok."', tag: 'Tomris +5' },
    { t: '(Sessizce yanından geçip askerlere atıl.)', tag: 'Tomris +10' }]);
  G.flags.tomris += [0, 5, 10][c];
  tomris.pose.aim = 0;
  await G.say('Tomris', ['Sırtın açık ama dilin keskin. Göreceğiz.', 'Hmph. Doğru söylüyorsun. Sol taraf senin.', '...Deli mi bu?'][c], { auto: 2200 });
  G.cutscene(false);
  tomris.brain = archerBrain(G, tomris);
  G.ui.hint('Tomris uzaktan ok atıyor. Askerleri ona yaklaştırma. Attan inmek için <b>E</b>.');
  setTimeout(() => G.ui.hint(null), 9000);
  await fightWave(G, w1, 'Ak Pınar\'ı kurtar');
  const w2 = [soldier(G, near(A, 40, 10)), soldier(G, near(A, 42, -6)), soldier(G, near(A, 38, 22)), soldier(G, near(A, 44, 2), { helmet: 'helmet3', hp: 70, atkMul: 1.0 })];
  G.ui.toast('Doğudan yeni akıncılar!', 1800);
  await fightWave(G, w2, 'İkinci dalga');
  // free the captives
  G.ui.objective('Kafeslerdeki obalıları kurtar (0/3)');
  let freed = 0;
  await Promise.all(G.world.ak.cages.map(async (cg, i) => {
    await G.interact({ pos: cg.pos, r: 2.6, label: 'Kafesin ipini kes (basılı tut)', hold: 1.4 });
    cg.g.rotation.z = 0.5; cg.g.position.y = -0.4; cg.collider.r = 0;
    const cap = captives[i]; cap.pose.kneel = 0; cap.solid = true; cap.brain = wanderBrain(G, cap, [near(A, -4, -4), near(A, 4, -2), near(A, 0, -8)]);
    freed++; G.ui.objectiveCount(`Kafeslerdeki obalıları kurtar (${freed}/3)`); G.audio.whoosh(cg.pos, 0.3);
  }));
  G.ui.objective(null);
  // Kutlu Bey
  const kutlu = G.spawn('kutlu', { name: 'Kutlu Bey', pos: near(A, 26, -4) });
  kutlu.brain = idleBrain(G, kutlu, near(A, 4, -3), p);
  G.ui.objective('Kutlu Bey ile konuş');
  await G.interact({ actor: kutlu, r: 3, label: 'Kutlu Bey ile konuş' });
  if (p.mount) p.dismount();
  G.cutscene(true); G.audio.setMood('calm');
  tomris.brain = idleBrain(G, tomris, near(kutlu.pos, 1.8, 1.4), kutlu);
  G.cam.shot = { pos: near(kutlu.pos, -3, 3.2).add(v(0, 1.8, 0)), look: kutlu.pos.clone().add(v(0, 1.4, 0)), speed: 2 };
  kutlu.pose.talk = true;
  await G.say('Kutlu Bey', 'O çekiç... Bars\'ın elinde görmüştüm onu, kırk yıl önce. Demek gitti ihtiyar kurt.');
  await G.say('Kutlu Bey', 'Akıncıların başı Demir Eldiven Varos. Yüzbaşının ağabeyi. Kardeşinin kanını senden isteyecek.');
  await G.say('Kutlu Bey', 'Kuzeyde, Kurgan Dağı\'nda bir demir dağ daha var. Kara Kam\'ın adamları orada kazıyor. Varos\'un yolu da oraya çıkar.');
  await G.say('Kutlu Bey', 'Kızım Tomris yolu bilir. Gitmek istemiyor. Ama burada kalırsa Varos onu da bulur. Senin yanında en azından kime ok atacağını bilir.');
  kutlu.pose.talk = false; tomris.pose.talk = true;
  G.cam.shot = { pos: near(tomris.pos, 2.6, 2.6).add(v(0, 1.7, 0)), look: tomris.pos.clone().add(v(0, 1.45, 0)), speed: 2 };
  await G.say('Tomris', 'Baba!');
  await G.say('Tomris', '...Peki. Ama o çekici benden uzak tut, demirci. Gökten düşen hiçbir şeye güvenmem.');
  const c2 = await G.ui.choice('Alp', '', [
    { t: '"Ben de güvenmiyorum. Ama ustamın son sözü buydu."', tag: 'Tomris +10' },
    { t: '"Bu çekiç olmasa obanı kurtaramazdık."', tag: 'Tomris −5' },
    { t: '"Yol uzun. Belki bir gün nedenini anlatırsın."', tag: 'Tomris +5' }]);
  G.flags.tomris = Math.max(0, G.flags.tomris + [10, -5, 5][c2]);
  await G.say('Tomris', ['Son söz... Babamın son sözünü duymak istemem. Hadi, at sür.', 'Kurtarmak mı? Onlar o çekiç için geldi, demirci.', 'Belki. Belki de hiç.'][c2]);
  tomris.pose.talk = false;
  await G.ui.fade(1, 1400);
  G.cutscene(false);
  G.ui.chapterEnd({
    title: 'Ak Pınar', sub: '1. Perde · Bölüm 2 tamamlandı',
    lede: 'Ak Pınar kurtuldu. Tomris, istemeye istemeye de olsa artık yol arkadaşın.',
    lines: [['Tomris\'in güveni', `${G.flags.tomris} / 100`], ['Kazandığın', 'Boz, Bars\'ın zırhı, bir okçu yol arkadaşı'], ['Sıradaki yer', 'Yanık Söğüt: akıncıların gece kampı']],
    next: 'Sıradaki bölüm: Yanık Söğüt\'ün Esirleri.', nextScene: 8,
  });
  return 99;
}

// ---- shared set-up for the later chapters ----
function act1Player(G, pos, yaw, mounted = true) {
  const p = G.player;
  playerAt(G, pos, yaw, 'gokcekic');
  p.setWeapon('gokcekic', 0.22, true); p.skyHammer = true; p.canPower = true; p.charge = 80; p.dmgMul = 1.5; p.setOutfit('gok');
  p.tasKiran = !!G.flags.tasKiran;
  const boz = spawnBoz(G, pos.clone(), yaw); G.bozFree = true;
  if (mounted) p.mountHorse(boz);
  G.flags.tomris = G.flags.tomris ?? 15;
  return boz;
}
function spawnTomris(G, pos, mounted) {
  const t = G.spawn('tomris', { name: 'Tomris', pos: pos.clone(), hp: 80, team: 'oba' });
  t.setBow(); t.floorHp = 10;
  const h = new Horse(G, 'horse4', pos.clone().add(v(1.5, 0, 0)), 0); G.horses.push(h);
  t.horse = h;
  t.fightBrain = archerBrain(G, t);
  t.brain = companionBrain(G, t, h, dt => t.fightBrain(dt));
  if (mounted) { t.mount = h; h.rider = t; t.solid = false; }
  return t;
}
function holdBrain(G, a, b) { a.savedBrain = a.brain; a.brain = b; }

// 7 · Yanık Söğüt'ün Esirleri — a night camp, stealth or steel, a wound to dress
async function scene8(G) {
  act1World(G);
  G.world.setTime('night', 0); G.audio.setMood('night');
  const start = v(168, 0, -40);
  act1Player(G, start, Math.PI, true);
  const tomris = spawnTomris(G, start.clone().add(v(3, 0, 2)), true);
  const C = YANIK;
  // the camp: two guards awake, two asleep by the fire, captives at the posts
  G.fx.fire(C.clone().setY(0.1), 0.9, { intensity: 14 });
  const guards = [
    guardSoldier(G, near(C, -2, -14), near(C, 0, -40)), guardSoldier(G, near(C, 12, 0), near(C, 40, 0)),
    guardSoldier(G, near(C, 2, -2), near(C, 0, 0), true), guardSoldier(G, near(C, -3, 2), near(C, 0, 0), true),
    guardSoldier(G, near(C, -12, 3), near(C, -40, 10)),
  ];
  const captives = G.world.yanik.posts.map((pp, i) => { const a = G.spawn(['koylu2', 'koylu4', 'kacin'][i] === 'kacin' ? 'koylu6' : ['koylu2', 'koylu4'][i], { name: 'Esir', pos: pp.clone() }); a.pose.kneel = 1; a.solid = false; a.brain = idleBrain(G, a, pp.clone(), C); return a; });
  G.cutscene(true);
  G.cam.shot = { pos: start.clone().add(v(4, 3, 6)), look: C.clone().add(v(0, 1, 0)), snap: true };
  G.ui.fade(0, 1400);
  await G.ui.title('Yanık Söğüt\'ün Esirleri', '1. Perde · Bölüm 3', 2800);
  tomris.pose.talk = true;
  await G.say('Tomris', 'Kamp ileride, söğütlerin arasındaki çukurda. Yanık Söğüt\'ün insanlarını orada bağlamışlar.');
  await G.say('Tomris', 'Atları burada bırakalım. Nasıl gireceğiz, demirci?');
  tomris.pose.talk = false;
  const plan = await G.ui.choice('Alp', '', [
    { t: 'Sessizce: nöbetçileri arkadan etkisiz bırak, ipleri kes', tag: 'gizlilik' },
    { t: 'Dal: Tomris yukarıdan ok atsın, ben ortalığı dağıtayım', tag: 'savaş' }]);
  G.flags.yanikPlan = plan ? 'savas' : 'gizli';
  await G.say('Tomris', plan ? 'Sonunda bir şeyde anlaştık. Ateşin ışığına girme, okum seni tanımaz.' : 'Gölgede kal. Nöbetçi sana bakarken kıpırdama. Koşarsan duyarlar.');
  G.cutscene(false);
  if (p().mount) p().dismount();
  await G.wait(0.4);
  // Tomris stays at the edge of the hollow until the camp wakes
  const perch = near(C, -22, -18);
  tomris.brain = companionBrain(G, tomris, tomris.horse, dt => G.alarm ? tomris.fightBrain(dt) : idleBrain(G, tomris, perch, C)(dt));
  if (plan === 1) G.raiseAlarm(null);
  else G.ui.hint('Nöbetçinin <b>önüne</b> girme: görüş alanında kalırsan kızarır ve alarm verir. <b>Arkasından</b> yaklaş ve <b>E</b> ile etkisiz bırak. Koşmak ses çıkarır.');
  G.ui.objective('Esirlerin iplerini kes (0/3)');
  let freed = 0;
  const cut = Promise.all(G.world.yanik.posts.map(async (pp, i) => {
    await G.interact({ pos: pp, r: 1.8, label: 'İpi kes (basılı tut)', hold: 1.6 });
    const cap = captives[i]; cap.pose.kneel = 0; cap.solid = true; cap.brain = fleeBrain(G, cap, near(C, -30, -25));
    freed++; G.ui.objectiveCount(`Esirlerin iplerini kes (${freed}/3)`);
  }));
  // takedowns while the camp sleeps
  let done = false; cut.then(() => done = true);
  while (!done) {
    await G.frame();
    if (G.alarm) { G.ui.hint(null); continue; }
    const pl = p(); let target = null;
    for (const g of guards) {
      if (!g.alive || g.dead) continue;
      const d = g.distTo(pl); if (d > 1.9) continue;
      let ang = g.angleTo(pl) - g.yaw; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (g.asleep || Math.abs(ang) > 1.9) { target = g; break; }
    }
    if (target && !G.interactables.some(it => pl.distTo(it.pos) < it.r)) {
      G.ui.prompt('<kbd>E</kbd> Sessizce etkisiz bırak');
      if (G.framePressed && G.framePressed.has('KeyE')) { pl.yaw = pl.angleTo(target); pl.startAttack(0); target.die(); G.flags.takedowns = (G.flags.takedowns || 0) + 1; G.audio.hit(target.pos, 0.3); }
    }
  }
  G.ui.hint(null);
  // anyone still standing comes for us
  const rest = () => G.actors.filter(a => a.team === 'hisar' && a.alive);
  if (rest().length) {
    if (!G.alarm) G.raiseAlarm(rest()[0]);
    G.ui.objective('Kamptaki akıncıları püskürt');
    await G.until(() => rest().length === 0);
  }
  if (!G.alarm) { G.flags.tomris += 5; G.ui.toast('Kamp hiç uyanmadı. Tomris bunu fark etti.', 2400); }
  // Tomris is hit by a last arrow from the dark
  await G.wait(0.8);
  tomris.brain = idleBrain(G, tomris, tomris.pos.clone(), p());
  tomris.takeHit(1, null, 1); tomris.pose.kneel = 0.6;
  G.ui.toast('Karanlıktan bir ok! Tomris yaralandı.', 2200);
  G.ui.objective('Tomris\'in yanına git');
  await G.interact({ actor: tomris, r: 2.4, label: 'Yarasını sar' });
  G.cutscene(true); G.audio.setMood('night');
  p().pose.kneel = 0.5; p().yaw = p().angleTo(tomris);
  G.cam.shot = { pos: near(tomris.pos, 2.2, 2.2).add(v(0, 1.2, 0)), look: tomris.pos.clone().add(v(0, 0.9, 0)), speed: 2 };
  await G.say('Tomris', 'Sıyırdı sadece. Bakma öyle, ölmüyorum.');
  const c = await G.ui.choice('Alp', '', [
    { t: '(Sessizce kolunu tut, yarayı sar.)', tag: 'Tomris +10' },
    { t: '"Okçunun koluna ok... Bunu obada anlatırlar."', tag: 'şaka' },
    { t: '"Esirler kaçıyor, sen burada bekle."', tag: 'Tomris −5' }]);
  G.flags.tomris = Math.max(0, G.flags.tomris + [10, 0, -5][c]);
  await G.say('Tomris', [
    '...Ellerin demirci eli. Ama acıtmıyor. Teşekkür ederim, Alp.',
    'Anlatsınlar. Sonra da ikinci okun kimin boğazına gittiğini anlatsınlar.',
    'Git o zaman. Ben kendi yaramı sararım.'][c]);
  p().pose.kneel = 0; tomris.pose.kneel = 0;
  await G.ui.fade(1, 1400);
  G.cutscene(false);
  G.ui.chapterEnd({
    title: 'Yanık Söğüt', sub: '1. Perde · Bölüm 3 tamamlandı',
    lede: 'Yanık Söğüt\'ün insanları kurtuldu. Tomris\'in kolu sarılı, dili hâlâ keskin.',
    lines: [['Tomris\'in güveni', `${G.flags.tomris} / 100`], ['Kamp', G.flags.yanikPlan === 'gizli' && !G.alarm ? 'Sessizce boşaltıldı' : 'Kılıçla boşaltıldı'], ['Sıradaki yer', 'Kızılsu: Hisar\'ın sınır kasabası']],
    next: 'Sıradaki bölüm: Kızılsu.', nextScene: 9,
  });
  return 99;
}
const p = () => window.G.player;

// 8 · Kızılsu — the market town, the trader, the river at night, Varos' trap
async function scene9(G) {
  act1World(G);
  G.world.setTime('day', 0); G.audio.setMood('calm');
  const C = KIZILSU, gateOut = near(C, 0, -32);
  act1Player(G, gateOut, 0, true);
  const tomris = spawnTomris(G, gateOut.clone().add(v(3, 0, -2)), true);
  // townsfolk
  const folk = [['koylu2', -4, -6], ['koylu4', 6, 4], ['koylu6', -6, 10], ['asker1', 2, -12]].map(([k, dx, dz]) => {
    const a = G.spawn(k, { name: k === 'asker1' ? 'Kasaba muhafızı' : 'Kasabalı', pos: near(C, dx, dz), team: 'neutral' });
    a.brain = wanderBrain(G, a, [near(C, dx, dz), near(C, dx + 3, dz - 4), near(C, -dx, dz)]); return a;
  });
  const arslan = G.spawn('asker2', { name: 'Tüccar Arslan', pos: G.world.kz.stall.clone(), team: 'neutral' });
  arslan.brain = idleBrain(G, arslan, G.world.kz.stall.clone(), near(C, -2, -10));
  G.cutscene(true);
  G.cam.shot = { pos: near(C, 10, -44).add(v(0, 8, 0)), look: C.clone().add(v(0, 3, 0)), snap: true };
  G.ui.fade(0, 1400);
  await G.ui.title('Kızılsu', '1. Perde · Bölüm 4', 2800);
  tomris.pose.talk = true;
  await G.say('Tomris', 'Hisar\'ın pazarı. Burada kimse kılıç çekmez; herkes satar, herkes satın alır. Bilgi de.');
  await G.say('Tomris', 'Atları kapının dışında bırak. Çekicini de pelerinin altına sakla, demirci.');
  tomris.pose.talk = false;
  G.cutscene(false);
  G.ui.objective('Kasabaya gir ve Tüccar Arslan\'ı bul');
  await G.interact({ actor: arslan, r: 2.6, label: 'Tüccar Arslan ile konuş' });
  if (p().mount) p().dismount();
  G.cutscene(true);
  arslan.pose.talk = true;
  G.cam.shot = { pos: near(arslan.pos, -2.4, -2.6).add(v(0, 1.7, 0)), look: arslan.pos.clone().add(v(0, 1.5, 0)), speed: 2 };
  await G.say('Tüccar Arslan', 'Hoş geldin bozkırlı! Kürk mü, tuz mu, yoksa... haber mi?');
  await G.say('Tüccar Arslan', 'Haber pahalıdır. Ama o pelerinin altında parlayan şeyi bir kez görmek için ucuza veririm.');
  if (G.flags.saved !== 'kacin') {
    await G.say('Tüccar Arslan', 'Kaçın adında bir çocuk mu? Zincirli bir kervan gördüm. Hisar\'a değil, kuzeye, Kurgan Dağı\'na gitti.');
    await G.say('Tüccar Arslan', 'Kara Kam\'ın adamları orada toprak kazıyor. Kazmaya el lazım, anlarsın.');
  } else {
    await G.say('Tüccar Arslan', 'Kuzeye, Kurgan Dağı\'na kazma ve zincir taşıyan kervanlar gidiyor. Kara Kam\'ın adamları bir şey arıyor.');
  }
  await G.say('Tüccar Arslan', 'Bir de... Demir Eldiven Varos dün buradaydı. Kardeşinin katilini soruyordu. Tarifi sana çok benziyordu.');
  arslan.pose.talk = false;
  G.cutscene(false);
  // evening by the river
  G.ui.objective('Kasabadan çık, nehir kıyısında kamp kur');
  const camp = G.world.kz.camp;
  G.ui.marker(camp, 'Kamp');
  await G.until(() => p().distTo(camp) < 4);
  G.ui.marker(null);
  await G.ui.fade(1, 1200);
  G.world.setTime('night', 0); G.audio.setMood('night');
  const fire = G.fx.fire(camp.clone().setY(0.1), 0.7, { intensity: 10 });
  if (p().mount) p().dismount();
  if (tomris.mount) { tomris.mount.rider = null; tomris.mount = null; tomris.solid = true; }
  tomris.brain = idleBrain(G, tomris, near(camp, 1.4, 1.2), camp);
  tomris.pos.copy(near(camp, 1.4, 1.2)); p().pos.copy(near(camp, -1.4, 1.0)); p().yaw = p().angleTo(camp);
  G.cutscene(true);
  G.cam.shot = { pos: near(camp, 0, 4.5).add(v(0, 1.4, 0)), look: camp.clone().add(v(0, 0.8, 0)), snap: true };
  await G.ui.fade(0, 1400);
  tomris.pose.kneel = 0.5; p().pose.kneel = 0.5;
  tomris.pose.talk = true;
  await G.say('Tomris', 'Annem kırk yıl önce öldü. İki adam gökten düşen bir taş için kavga etmiş; o arada kalmış.');
  await G.say('Tomris', 'Babam adlarını hiç söylemedi. Ben de o yüzden gökten düşen hiçbir şeye güvenmem.');
  tomris.pose.talk = false;
  const c = await G.ui.choice('Alp', '', [
    { t: '"Birinin adını biliyorum. Bars. Ustam."', tag: 'dürüst · +20' },
    { t: '"Kim olurlarsa olsunlar, o kavga bitti."', tag: '+0' },
    { t: '(Elini onun elinin üstüne koy, sus.)', tag: '+10' }]);
  G.flags.river = ['durust', 'gecistir', 'sessiz'][c];
  G.flags.tomris += [20, 0, 10][c];
  if (c === 0) {
    await G.say('Tomris', '...Bars.');
    await G.say('Tomris', 'Bunu bana söylemek zorunda değildin. Neden söyledin?');
    await G.say('Alp', 'Çünkü yanımda yürüyeceksen, neyin yanında yürüdüğünü bilmelisin.');
    await G.say('Tomris', 'Bu gece konuşmayalım. Ama gitmiyorum. Bunu bil.', { italic: true });
  } else if (c === 1) {
    await G.say('Tomris', 'Kavgalar bitmez, demirci. Sadece el değiştirir.');
  } else {
    await G.say('Tomris', '...', { italic: true });
    await G.say('Tomris', 'Elin hâlâ sıcak. Ocak kokuyor.', { italic: true });
  }
  tomris.pose.kneel = 0; p().pose.kneel = 0;
  await G.ui.fade(1, 1400);
  G.fx.removeFire(fire);
  // morning: Varos' men come out of the gate
  G.world.setTime('dawn', 0); G.world.setTime('day', 30); G.audio.setMood('battle');
  G.cam.shot = null;
  await G.ui.fade(0, 1000);
  G.cutscene(false);
  tomris.brain = companionBrain(G, tomris, tomris.horse, dt => tomris.fightBrain(dt));
  const trap = [0, 1, 2, 3, 4].map(i => soldier(G, near(C, 18 + (i % 2) * 3, -6 + i * 3), { atkMul: 0.9 }));
  const varos = G.spawn('yuzbasi', { name: 'Demir Eldiven Varos', pos: near(C, 14, -14), team: 'neutral', helmet: 'helmet2', weapon: 'sword', scale: 1.1 });
  const vh = new Horse(G, 'horse1', varos.pos.clone(), Math.PI / 2); G.horses.push(vh); varos.mount = vh; vh.rider = varos; varos.solid = false;
  varos.brain = dt => { varos.faceTo(p(), dt, 3); };
  varos.pose.talk = true;
  await G.say('Demir Eldiven Varos', 'Demirci! Kardeşimin kanı o çekicin başında hâlâ kuru mu?', { auto: 2600 });
  await G.say('Demir Eldiven Varos', 'Seni burada öldürmeyeceğim. Kurgan\'da, Kara Kam\'ın önünde dizlerinin üstünde öldüreceğim.', { auto: 2800 });
  varos.pose.talk = false;
  vh.rider = null; varos.mount = null; vh.target = near(C, 60, -90); vh.targetRun = true; varos.remove();
  vh.rider = null;
  await fightWave(G, trap, 'Varos\'un adamlarını püskürt');
  G.ui.objective('Boz\'a bin ve kuzeye, Kurgan Dağı\'na sür');
  G.ui.marker(KURGAN, 'Kurgan Dağı');
  await G.until(() => p().distTo(C) > 70 || p().distTo(KURGAN) < 120);
  G.ui.marker(null);
  G.ui.chapterEnd({
    title: 'Kızılsu', sub: '1. Perde · Bölüm 4 tamamlandı',
    lede: 'Varos artık nereye gittiğini biliyor. Sen de onun nerede bekleyeceğini.',
    lines: [['Tomris\'in güveni', `${G.flags.tomris} / 100`], ['Nehir kıyısı', { durust: 'Bars\'ın adını söyledin', gecistir: 'Konuyu geçiştirdin', sessiz: 'Sustun, elini tuttun' }[G.flags.river]], ['Sıradaki yer', 'Kurgan Dağı: ilk demir dağ']],
    next: 'Sıradaki bölüm: Kurgan Dağı. 1. Perde\'nin sonu.', nextScene: 10,
  });
  return 99;
}

// 9 · Kurgan Dağı — the dig, the Barrow Warden, the core of the sky ship, Tomris' test
async function scene10(G) {
  act1World(G);
  G.world.bound = { x: 110, z: -10, R: 240 };
  G.world.setTime('dusk', 0); G.audio.setMood('battle');
  const C = KURGAN, start = near(C, 0, 48);
  act1Player(G, start, Math.PI, true);
  const tomris = spawnTomris(G, start.clone().add(v(3, 0, 2)), true);
  G.flags.saved = G.flags.saved || 'aile';
  // the cult's diggers
  const cult = [near(C, -10, 6), near(C, 9, 4), near(C, -4, 12), near(C, 13, -4)].map(pp => {
    const s = soldier(G, pp, { helmet: 'helmet1', atkMul: 0.9 });
    s.name = 'Kara Kam\'ın adamı';
    s.mats.forEach(m => m.color && m.color.multiplyScalar(0.55));
    return s;
  });
  let kacin = null;
  if (G.flags.saved !== 'kacin') {
    kacin = G.spawn('kacin', { name: 'Kaçın', pos: G.world.kurganPost.clone() });
    kacin.pose.kneel = 1; kacin.solid = false; kacin.brain = idleBrain(G, kacin, G.world.kurganPost.clone(), C);
  }
  G.cutscene(true);
  G.cam.shot = { pos: near(C, 18, 40).add(v(0, 10, 0)), look: G.world.kurganShip.position.clone().add(v(0, 4, 0)), snap: true };
  G.ui.fade(0, 1600);
  await G.ui.title('Kurgan Dağı', '1. Perde · Bölüm 5', 3000);
  tomris.pose.talk = true;
  await G.say('Tomris', 'Bu... bu bir dağ değil. Babamın masallarındaki demir dağ.');
  await G.say('Alp', 'Çekiç ısınıyor. Dağ onu tanıyor.', { italic: true });
  tomris.pose.talk = false;
  G.cutscene(false);
  await fightWave(G, cult, 'Kazı kampını temizle');
  if (kacin) {
    G.ui.objective('Kaçın\'ın zincirlerini kır');
    await G.interact({ actor: kacin, r: 2.2, label: 'Zinciri kır (basılı tut)', hold: 1.4 });
    kacin.pose.kneel = 0; kacin.solid = true; kacin.setWeapon('axe'); kacin.hp = kacin.maxHp = 60; kacin.floorHp = 8; kacin.atkMul = 0.5;
    kacin.brain = allyBrain(G, kacin);
    await G.say('Kaçın', 'Alp! Biliyordum, biliyordum geleceğini! O gece... seni suçlamıyorum, duydun mu?', { auto: 3000 });
    G.flags.kacinBack = true;
  }
  // the Barrow Warden climbs out of the breach
  G.ui.objective('Gemi yarığına yaklaş');
  const breach = near(C, -1, -4);
  await G.until(() => p().distTo(breach) < 9);
  if (p().mount) p().dismount();
  G.cutscene(true);
  const warden = soldier(G, near(C, -1, -11), { key: 'yuzbasi', helmet: 'helmet3', hp: 420, weapon: 'sword', boss: true, scale: 1.55, atkMul: 1.5 });
  warden.name = 'Kurgan Bekçisi'; warden.atkSlow = 1.25; warden.radius = 0.6;
  warden.mats.forEach(m => { m.color && m.color.setHex(0x3a3a44); });
  G.cam.shot = { pos: near(C, 4, 2).add(v(0, 2.2, 0)), look: warden.pos.clone().add(v(0, 2.2, 0)), speed: 1.5 };
  G.shake(0.5); G.audio.boom(0);
  await G.say('Kurgan Bekçisi', 'K-k-kapı... kapalı... kalmalı...', { italic: true });
  G.cutscene(false); G.bossFight = true;
  // every few seconds the warden slams the ground: get out of the ring
  const wb = warden.brain; let slamT = 5;
  warden.brain = dt => {
    wb(dt);
    slamT -= dt;
    if (slamT < 1 && slamT + dt >= 1) { G.fx.ring(warden.pos, 0xff6040, 6, 1.0); G.ui.toast('Bekçi yeri dövecek: uzaklaş!', 900); }
    if (slamT <= 0 && warden.alive) {
      slamT = 6 + Math.random() * 2; warden.startAttack(2);
      setTimeout(() => {
        if (!warden.alive) return;
        G.fx.ring(warden.pos, 0xffa060, 7, 0.5); G.fx.dust(warden.pos, 30, 0x8a7a60); G.shake(0.5); G.audio.boom(0);
        for (const a of G.actors) if (a.alive && a.team !== 'hisar' && a.distTo(warden) < 6 && a.dodgeT <= 0) a.takeHit(22, warden, 7);
      }, 600);
    }
  };
  G.ui.hint('Kurgan Bekçisi kalkanla korunuyor. Halka belirince uzaklaş; arkasından vur.');
  setTimeout(() => G.ui.hint(null), 8000);
  G.ui.objective('Kurgan Bekçisi\'ni yen');
  warden.hpBar && (warden.hpBar.g.visible = true);
  await G.until(() => !warden.alive);
  G.bossFight = false; G.hitstop(0.5);
  await G.wait(1.5);
  // the core
  G.ui.objective('Yarıktaki ışığa dokun');
  await G.interact({ pos: G.world.kurganCore.position.clone().setY(0), r: 2.6, label: 'Işığa dokun' });
  G.cutscene(true);
  G.ui.whiteFlash(); G.audio.thunder();
  G.world.setTime('night', 0.3);
  G.cam.shot = { pos: p().pos.clone().add(v(0, 60, 0)), look: p().pos.clone().add(v(0, 200, -200)), speed: 0.6 };
  await G.ui.title('Bir görü', 'Ateş içinde birbirine çarpan demir dağlar. Aralarından düşen beş ışık.', 4200);
  await G.say('Gök sesi', 'Beşten... dördü... uyuyor.', { italic: true });
  G.world.setTime('dusk', 0.5);
  G.cam.shot = { pos: p().pos.clone().add(v(2.5, 2, 3)), look: p().pos.clone().add(v(0, 1.4, 0)), speed: 2 };
  G.flags.tasKiran = true; p().tasKiran = true; p().charge = 100;
  G.fx.skyBurst(p().pos.clone().add(v(0, 1.4, 0)), 60);
  G.ui.toast('Yeni güç: Taş Kıran. Ağır darbe artık blokları kırıyor.', 3200);
  await G.wait(1.5);
  // Varos at the mouth of the camp, then Tomris' test
  const varos = G.spawn('yuzbasi', { name: 'Demir Eldiven Varos', pos: near(C, 0, 22), team: 'neutral', helmet: 'helmet2', weapon: 'sword', scale: 1.1 });
  varos.brain = dt => varos.faceTo(p(), dt, 3); varos.pose.talk = true;
  G.cam.shot = { pos: near(C, 4, 12).add(v(0, 2.2, 0)), look: varos.pos.clone().add(v(0, 1.6, 0)), speed: 1.5 };
  await G.say('Demir Eldiven Varos', 'Bekçiyi devirdin. Kara Kam buna sevinmeyecek. Ben de sevinmiyorum; seni öldürmek bana kalmalıydı.');
  await G.say('Demir Eldiven Varos', 'Ordu-Balık\'a git, demirci. Kağan\'ın sarayında görüşürüz. Orada kaçacak bozkır yok.');
  varos.remove();
  tomris.brain = idleBrain(G, tomris, near(p().pos, 1.6, 1.0), p());
  G.cam.shot = { pos: near(p().pos, 3.2, 2.6).add(v(0, 1.7, 0)), look: tomris.pos.clone().add(v(0, 1.4, 0)), speed: 2 };
  tomris.pose.talk = true;
  await G.say('Tomris', 'Şu yarığın dibi kuyu gibi, sonu yok. Çekici oraya at, Alp. Bu dağlar uyusun. Annem için. Bars için.');
  const c = await G.ui.choice('Alp', '', [
    { t: '(Çekici kaldır, yarığa atmaya yürü.)', tag: 'güvene bağlı' },
    { t: '"Bu benim mirasım. Atmam."', tag: 'Tomris −15' }]);
  const stays = c === 0 ? G.flags.tomris >= 60 : false;
  if (c === 1) G.flags.tomris = Math.max(0, G.flags.tomris - 15);
  if (c === 0 && stays) {
    p().pose.hammerRaise = 1;
    await G.wait(0.8);
    await G.say('Tomris', 'Dur!');
    p().pose.hammerRaise = 0;
    await G.say('Tomris', 'Silahı atmak, onu kimin tuttuğunu unutmak demek. Ben... seni unutmak istemiyorum.');
    await G.say('Tomris', 'Al. Annemden kalan kurt dişi. Ordu-Balık\'a birlikte gidiyoruz.');
    G.ui.toast('Tomris\'in muskası: kurt dişi', 2600);
    G.flags.tomrisEnding = 'kaldi';
  } else if (c === 0) {
    p().pose.hammerRaise = 1;
    await G.wait(0.8);
    await G.say('Tomris', '...Dur. Hayır. Bunu ben isteyemem senden. Ama seninle de gelemem.');
    p().pose.hammerRaise = 0;
    await G.say('Tomris', 'Sen yolunu buldun, demirci. Ben de benimkini bulmalıyım. Ak Pınar\'a dönüyorum.');
    G.flags.tomrisEnding = 'dondu';
  } else {
    await G.say('Tomris', 'Biliyordum. Gökten düşen her şey birini kendine bağlar.');
    await G.say('Tomris', 'Ak Pınar\'a dönüyorum. Yolun açık olsun, Alp.');
    G.flags.tomrisEnding = 'dondu';
  }
  tomris.pose.talk = false;
  await G.ui.fade(1, 1800);
  G.cutscene(false);
  G.ui.chapterEnd({
    title: '1. Perde Sonu', sub: 'Kaçış',
    lede: 'Kurgan\'ın demir dağı sustu. Doğuda, Ordu-Balık\'ın surları ufukta.',
    lines: [
      ['Tomris', G.flags.tomrisEnding === 'kaldi' ? `Yanında. Güveni ${G.flags.tomris} / 100` : `Ak Pınar\'a döndü. Güveni ${G.flags.tomris} / 100`],
      ['Kaçın', G.flags.kacinBack ? 'Zincirlerinden kurtardın, yanında' : (G.flags.saved === 'kacin' ? 'Baskın gecesinden beri yanında' : 'Kayıp')],
      ['Gök çekiç', 'Taş Kıran gücü uyandı'],
      ['Gök sesi', '"Beşten dördü uyuyor."']],
    next: '2. Perde: Ordu-Balık. Kağan, Hatun ve Varos seni bekliyor.', nextScene: 11,
  });
  return 99;
}
function guardSoldier(G, pos, look, asleep) {
  const s = soldier(G, pos, { torch: !asleep });
  s.brain = guardBrain(G, s, pos.clone(), look, asleep);
  s.yaw = Math.atan2(look.x - pos.x, look.z - pos.z);
  return s;
}

export async function runStory(G, startAt = 1) {
  let s = startAt;
  const table = { 1: scene1, 2: scene2, 3: scene3, 4: scene4, 5: ending, 6: scene6, 7: scene7, 8: scene8, 9: scene9, 10: scene10, ...ACT23 };
  while (table[s]) {
    G.currentScene = s;
    G.checkpoint = s;
    G.resetScene();
    const next = await table[s](G);
    s = next;
  }
}
