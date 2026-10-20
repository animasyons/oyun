// 2. Perde "Beş Dağ" and 3. Perde "Göğün Yanışı": chapters 10–18 (scenes 11–19).
// Each chapter takes place in its own realm (see realms.js); the last one returns
// to the Kayalı Pınar oba on the steppe map.
import * as THREE from 'three';
import { OBA, GRAVE, heightAt } from './world.js';
import { soldierBrain, allyBrain, idleBrain, wanderBrain, archerBrain } from './ai.js';
import { Drone, Serpent, alien, albasti, karaKam, commander, bossBar } from './foes.js';
import { soldier, playerAt, fightWave } from './story.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const near = (p, dx, dz) => v(p.x + dx, 0, p.z + dz);
const rnd = (a, b) => a + Math.random() * (b - a);
const P = G => G.player;

// ---------------- shared ----------------
// powers and flags a chapter expects, so any chapter can be started from the menu
function ensureFlags(G, scene) {
  const f = G.flags;
  f.tasKiran = true;
  f.tomris = f.tomris ?? 65;
  f.tomrisEnding = f.tomrisEnding || (f.tomris >= 60 ? 'kaldi' : 'dondu');
  f.saved = f.saved || 'aile';
  if (scene > 12) f.yerSarsinti = true;
  if (scene > 13) f.karaSimsek = true;
  if (scene > 14) f.demirKalkan = true;
  if (scene > 16 && f.hatun === undefined) f.hatun = true;
}

function heroIn(G, realm, spot, yaw, scene) {
  ensureFlags(G, scene);
  const r = G.realms.enter(realm);
  const pos = r.spots[spot] || v(0, 0, 0);
  playerAt(G, pos, yaw, 'gokcekic');
  const p = P(G);
  p.setWeapon('gokcekic', 0.22, true); p.skyHammer = true; p.canPower = true; p.charge = 80; p.dmgMul = 1.6; p.setOutfit('gok');
  p.tasKiran = true;
  G.powerHud && G.powerHud();
  return r;
}

function withTomris(G) { return G.flags.tomrisEnding === 'kaldi'; }
function tomrisFoot(G, pos) {
  const t = G.spawn('tomris', { name: 'Tomris', pos: pos.clone(), hp: 90, team: 'oba' });
  t.setBow(); t.floorHp = 12;
  t.brain = archerBrain(G, t);
  return t;
}
function ally(G, pos, opts = {}) {
  const a = G.spawn(opts.key || (Math.random() < 0.5 ? 'asker1' : 'asker2'), { name: opts.name || 'Kağan Askeri', team: 'oba', hp: opts.hp || 70, pos, weapon: opts.weapon || 'sword', helmet: opts.helmet || 'helmet2', atkMul: opts.atkMul || 0.7 });
  a.floorHp = opts.floorHp ?? 6; a.brain = allyBrain(G, a); a.home = pos.clone();
  return a;
}
function citizen(G, key, pos, path, name = 'Ordu-Balıklı') {
  const a = G.spawn(key, { name, pos: pos.clone() });
  a.brain = path ? wanderBrain(G, a, path) : idleBrain(G, a, pos.clone(), near(pos, 0, -3));
  return a;
}
function shot(G, pos, look, speed) { G.cam.shot = { pos: pos.clone(), look: look.clone(), snap: !speed, speed }; }
async function talk(G, who, actor, text, opts) { if (actor) actor.pose.talk = true; await G.say(who, text, opts); if (actor) actor.pose.talk = false; }
async function waitDead(G, list) { await G.until(() => list.every(a => !a.alive)); }
// a fight where every enemy in `list` must fall; drones and serpents count too
async function battle(G, list, label) {
  let left = list.length;
  list.forEach(s => { const od = s.onDie; s.onDie = () => { od && od(); left--; }; });
  G.ui.objective(`${label} (0/${list.length})`);
  await G.until(() => { G.ui.objectiveCount(`${label} (${list.length - left}/${list.length})`); return left <= 0 || list.every(a => !a.alive); });
}
// walk somewhere: a marker shows the way
async function reach(G, pos, r) { G.goalPos = pos; G.ui.marker(pos, ''); await G.until(() => G.player.distTo(pos) < r); G.ui.marker(null); G.goalPos = null; }
function drone(G, pos, opts) { const d = new Drone(G, pos, opts); G.extraTargets.push(d); return d; }
function power(G, flag, name, key, text) {
  G.flags[flag] = true; G.powerHud && G.powerHud();
  G.fx.skyBurst(P(G).pos.clone().add(v(0, 1.4, 0)), 70); G.fx.ring(P(G).pos, 0x9fe8ff, 6, 0.8);
  G.ui.toast(`Yeni güç: ${name}`, 3000);
  G.ui.hint(`<b>${key}</b> ${text}`); setTimeout(() => G.ui.hint(null), 9000);
}
function end(G, o) { G.ui.chapterEnd(o); return 99; }

// ====================================================================
// 10 · Ordu-Balık — the Kağan's capital
async function scene11(G) {
  const r = heroIn(G, 'ordu', 'gate', Math.PI, 11);
  G.world.setTime('day', 0); G.audio.setMood('calm');
  const p = P(G); p.pos.z += 6;
  const tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 2, 1)) : null;
  // the town
  const crowd = [
    citizen(G, 'koylu2', v(-6, 0, 20), [v(-6, 0, 20), v(-5, 0, 2), v(-6, 0, 30)]), citizen(G, 'koylu4', v(5, 0, 14), [v(5, 0, 14), v(6, 0, -6), v(4, 0, 28)]),
    citizen(G, 'koylu6', v(-3, 0, 6)), citizen(G, 'asker1', v(9, 0, 4)), citizen(G, 'koylu2', v(-18, 0, 24), [v(-18, 0, 24), v(-20, 0, -8)]),
    citizen(G, 'koylu4', v(3, 0, 26)),
  ];
  const kagan = G.spawn('kutlu', { name: 'Kağan', pos: near(r.spots.throne, 0, 1.2), scale: 1.1 });
  kagan.brain = idleBrain(G, kagan, kagan.pos.clone(), r.spots.gate);
  const hatun = G.spawn('koylu6', { name: 'Hatun', pos: near(r.spots.throne, -2.6, 1.6) });
  hatun.brain = idleBrain(G, hatun, hatun.pos.clone(), r.spots.gate);
  const guards = [-4.5, 4.5].map(x => { const g = G.spawn('asker2', { name: 'Saray Muhafızı', pos: near(r.spots.terrace, x, 0), weapon: 'sword', helmet: 'helmet3' }); g.brain = idleBrain(G, g, g.pos.clone(), r.spots.gate); return g; });
  const varos = G.spawn('yuzbasi', { name: 'Demir Eldiven Varos', pos: near(r.spots.throne, 3, 2), team: 'neutral', helmet: 'helmet2', weapon: 'sword', scale: 1.1 });
  varos.brain = idleBrain(G, varos, varos.pos.clone(), r.spots.gate);
  // arrival
  G.cutscene(true);
  shot(G, v(30, 26, 80), v(0, 6, 0));
  G.ui.fade(0, 1600);
  await G.ui.title('Ordu-Balık', '2. Perde · Bölüm 1', 3000);
  shot(G, near(p.pos, 3, 5).add(v(0, 2.2, 0)), near(p.pos, 0, -20).add(v(0, 4, 0)), 1.2);
  if (tom) await talk(G, 'Tomris', tom, 'Kağan\'ın şehri. Babam buraya bir kez gelmiş, "taş çadırlar" demişti.');
  await G.say('Alp', 'Çekiç sessiz. Burada uyuyan bir şey yok... sanırım.', { italic: true });
  G.cutscene(false);
  G.ui.objective('Saray terasına çık, Kağan\'ın huzuruna gir');
  await reach(G, r.spots.terrace, 5);
  // the audience
  G.cutscene(true);
  p.pos.copy(near(r.spots.terrace, 0, 2)); p.yaw = Math.PI; if (tom) tom.pos.copy(near(r.spots.terrace, 2, 3));
  shot(G, near(r.spots.terrace, 4, 4).add(v(0, 2.4, 0)), kagan.pos.clone().add(v(0, 1.6, 0)), 1.5);
  await talk(G, 'Kağan', kagan, 'Demirci. Gökten düşen çekici taşıyan oba çocuğu sen misin?');
  await G.say('Alp', 'Benim. Obam yandı. Bunu yakanlar Hisar\'ın askerleriydi.');
  await talk(G, 'Kağan', kagan, 'Göster.');
  p.pose.hammerRaise = 1; G.fx.skyBurst(p.pos.clone().add(v(0, 2.2, 0)), 40); G.audio.thunder();
  await G.wait(1.0); p.pose.hammerRaise = 0;
  await talk(G, 'Kağan', kagan, 'Gök kendi demirini sana vermiş. Bugünden sonra sen Demir Bey\'sin.');
  await talk(G, 'Kağan', kagan, 'Bozkırda dört demir dağ daha var. Uyandırılmadan önce onları bul. Ordum arkanda.');
  shot(G, near(varos.pos, 2, 3).add(v(0, 1.8, 0)), varos.pos.clone().add(v(0, 1.6, 0)), 2);
  await talk(G, 'Demir Eldiven Varos', varos, 'Bir oba çocuğuna bey unvanı mı? Kağanım, önce kılıcı tutabiliyor mu görelim.');
  await talk(G, 'Kağan', kagan, 'Meydanda. Kan dökülmeyecek.');
  // the duel in the market square
  await G.ui.fade(1, 700);
  const sq = v(0, 0, 9 + 6);
  p.pos.copy(near(sq, 0, 5)); p.yaw = Math.PI; varos.pos.copy(near(sq, 0, -4)); varos.yaw = 0;
  crowd.forEach((c, i) => { const a = i / crowd.length * 6.28; c.pos.copy(near(sq, Math.cos(a) * 9, Math.sin(a) * 8)); c.brain = idleBrain(G, c, c.pos.clone(), sq); c.pose.cheer = 1; });
  if (tom) { tom.pos.copy(near(sq, 7, 6)); tom.brain = idleBrain(G, tom, tom.pos.clone(), sq); }
  kagan.pos.copy(near(sq, -8, -6)); kagan.brain = idleBrain(G, kagan, kagan.pos.clone(), sq);
  hatun.pos.copy(near(sq, -9.5, -4.5)); hatun.brain = idleBrain(G, hatun, hatun.pos.clone(), sq);
  shot(G, near(sq, 7, 9).add(v(0, 3, 0)), sq.clone().add(v(0, 1.2, 0)));
  await G.ui.fade(0, 700);
  G.audio.setMood('battle');
  varos.team = 'hisar'; varos.hp = varos.maxHp = 190; varos.floorHp = 55; varos.atkMul = 1.15; varos.makeHpBar && !varos.hpBar && varos.makeHpBar(true);
  varos.brain = soldierBrain(G, varos, { boss: true });
  p.floorHp = 14;
  G.cutscene(false);
  G.ui.objective('Varos\'u yen (öldürmek yok)');
  G.ui.hint('Sağ tık: blok · Sol tık: vuruş · C: yuvarlan'); setTimeout(() => G.ui.hint(null), 6000);
  await G.until(() => varos.hp <= 56 || p.hp <= 15);
  const won = varos.hp <= 56;
  G.flags.varosDuel = won ? 'kazandi' : 'kaybetti';
  varos.team = 'neutral'; varos.brain = idleBrain(G, varos, varos.pos.clone(), p); p.floorHp = 0; p.hp = Math.max(p.hp, 40);
  G.cutscene(true); G.audio.setMood('calm');
  shot(G, near(sq, 5, 6).add(v(0, 2, 0)), varos.pos.clone().add(v(0, 1.4, 0)), 2);
  if (won) await talk(G, 'Demir Eldiven Varos', varos, 'Yeter! ...Kolun güçlü, demirci. Ama savaşta seyirci olmaz. Bunu unutma.');
  else await talk(G, 'Demir Eldiven Varos', varos, 'Gördün mü, Kağanım? Çekiç güçlü, eli acemi. Yine de... ayakta kaldı.');
  await talk(G, 'Kağan', kagan, won ? 'Gök yanılmamış. Demir Bey, Tuz Gölü\'nden başla.' : 'Acemi ama yürekli. Demir Bey, yolun Tuz Gölü\'nden başlıyor.');
  // Hatun's warning
  shot(G, near(hatun.pos, 2, 2).add(v(0, 1.7, 0)), hatun.pos.clone().add(v(0, 1.5, 0)), 2);
  hatun.pos.copy(near(p.pos, -1.4, -0.6)); hatun.yaw = hatun.angleTo(p);
  await talk(G, 'Hatun', hatun, '(fısıltıyla) Demir Bey. Kağan\'ın yanında bir gölge var. Geceleri biriyle konuşuyor, ama odada kimse yok.');
  await talk(G, 'Hatun', hatun, 'Dağlara git, ama gözün arkanda olsun.');
  G.flags.muhur = true;
  await G.ui.fade(1, 1600);
  G.cutscene(false);
  return end(G, {
    title: 'Ordu-Balık', sub: '2. Perde · Bölüm 1',
    lede: 'Kağan seni Demir Bey ilan etti. Mührü kemerinde, Tuz Gölü önünde.',
    lines: [['Kağan\'ın mührü', 'Alındı'], ['Varos ile sınav', won ? 'Kazandın' : 'Kaybettin, ama ayakta kaldın'], ['Hatun', '"Kağan\'ın yanında bir gölge var."']],
    next: 'Sıradaki bölüm: Tuz Gölü.', nextScene: 12,
  });
}

// ====================================================================
// 11 · Tuz Gölü — the buried ship and the Salt Dragon
async function scene12(G) {
  const r = heroIn(G, 'tuz', 'start', Math.PI, 12);
  G.world.setTime('desert', 0); G.audio.setMood('calm');
  const p = P(G), tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 2.5, 1)) : null;
  G.cutscene(true);
  shot(G, v(-20, 14, 70), v(0, 2, -30));
  G.ui.fade(0, 1600);
  await G.ui.title('Tuz Gölü', '2. Perde · Bölüm 2', 3000);
  shot(G, near(p.pos, 3, 4).add(v(0, 2, 0)), near(r.spots.core, 0, 0).add(v(0, 3, 0)), 1.2);
  if (tom) await talk(G, 'Tomris', tom, 'Burada su yok, kuş yok. Sadece tuz... ve şu yarı gömülü demir dağ.');
  await G.say('Alp', 'Çekiç titriyor. Gemi bizi duyuyor.', { italic: true });
  G.cutscene(false);
  G.ui.objective('Tuzun içindeki gemiye yürü');
  await reach(G, r.spots.arena, 10);
  // the ship speaks
  G.cutscene(true);
  shot(G, near(r.spots.arena, 4, 6).add(v(0, 2.5, 0)), r.spots.core.clone().add(v(0, 2, 0)), 1.4);
  G.audio.rumble && G.audio.rumble(2);
  await G.say('Gök sesi', '...uyanık... değil... Beşten... dördü... uyuyor.', { italic: true });
  if (tom) await talk(G, 'Tomris', tom, 'Bunu sen de duydun mu? Çekici tutarken mi konuşuyor?');
  await G.say('Alp', 'Elimi çekince sadece uğultu. Tutunca... kelimeler.');
  // the dragon
  G.shake(0.8); G.audio.boom(0);
  const dr = new Serpent(G, r.spots.arena.clone()); G.extraTargets.push(dr);
  dr.pts[0].set(r.spots.arena.x + 6, heightAt(r.spots.arena.x, r.spots.arena.z) + 5, r.spots.arena.z - 6);
  dr.state = 'aim'; dr.t = -1.2; dr.strikeAt = p.pos.clone();
  shot(G, near(p.pos, 5, 6).add(v(0, 3, 0)), dr.pts[0].clone(), 2);
  await G.wait(1.0);
  await G.say('Alp', 'Evren! Masallardaki tuz yılanı!');
  G.cutscene(false); G.audio.setMood('battle'); G.bossFight = true;
  G.ui.hint('Ejder tuzun altından gelir. <b>Halkadan çık</b>, başı yere çakılınca vur.'); setTimeout(() => G.ui.hint(null), 8000);
  G.ui.objective('Tuz Ejderi\'ni yen');
  await G.until(() => !dr.alive);
  G.bossFight = false; G.hitstop(0.6); bossBar(G, null);
  await G.wait(2);
  // the core: Yer Sarsıntısı
  G.audio.setMood('calm');
  G.ui.objective('Geminin kalbine dokun');
  await G.interact({ pos: r.spots.core, r: 3, label: 'Işığa dokun' });
  G.cutscene(true); G.ui.whiteFlash(); G.audio.thunder();
  await G.say('Gök sesi', 'Kardeşlerimiz... uzakta... sesleniyoruz... duyan yok.', { italic: true });
  power(G, 'yerSarsinti', 'Yer Sarsıntısı', 'R', 'Yer Sarsıntısı: çevrendeki herkesi yere serer.');
  await G.say('Alp', 'Gemiler birbirine sesleniyor. Biri onları uyandırmaya çalışıyor.');
  await G.ui.fade(1, 1600); G.cutscene(false);
  return end(G, {
    title: 'Tuz Gölü', sub: '2. Perde · Bölüm 2',
    lede: 'Evren tuzun altında sustu. İkinci gemi de uykusunda konuştu.',
    lines: [['Tuz Ejderi', 'Yenildi'], ['Yeni güç', 'R · Yer Sarsıntısı'], ['Öğrenilen', 'Gemiler birbirine sesleniyor']],
    next: 'Sıradaki bölüm: Kara Orman.', nextScene: 13,
  });
}

// ====================================================================
// 12 · Kara Orman — Albastı Ana and the sleeping sky warrior
async function scene13(G) {
  const r = heroIn(G, 'orman', 'start', Math.PI, 13);
  G.world.setTime('forest', 0); G.audio.setMood('night');
  const p = P(G), tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 2, 1)) : null;
  // lost hunters at the edge of the clearing
  const hunters = [near(r.spots.clearing, -3, 10), near(r.spots.clearing, 3, 11)].map((pp, i) => { const a = G.spawn(i ? 'koylu4' : 'koylu2', { name: 'Avcı', pos: pp }); a.pose.kneel = 1; a.brain = idleBrain(G, a, pp.clone(), r.spots.clearing); return a; });
  G.cutscene(true);
  shot(G, near(p.pos, 0, 8).add(v(0, 5, 0)), near(p.pos, 0, -20).add(v(0, 2, 0)));
  G.ui.fade(0, 1600);
  await G.ui.title('Kara Orman', '2. Perde · Bölüm 3', 3000);
  if (tom) await talk(G, 'Tomris', tom, 'Annem bu ormana girilmez derdi. Albastılar yolcuyu kendi sesiyle çağırırmış.');
  await G.say('Alp', 'Ağaçların arasında ışıklar var. Ateşböceği değil bunlar.', { italic: true });
  G.cutscene(false);
  G.ui.objective('Patikadan ormanın içine ilerle');
  await reach(G, hunters[0].pos, 7);
  G.cutscene(true);
  shot(G, near(hunters[0].pos, 3, 3).add(v(0, 1.8, 0)), hunters[0].pos.clone().add(v(0, 1, 0)), 2);
  await talk(G, 'Avcı', hunters[0], 'Sen... gerçek misin? Üç gündür ormanda dönüyoruz. Her yol buraya çıkıyor.');
  await talk(G, 'Avcı', hunters[1], 'Kara cübbeliler geldi. Gemiye bir şey taşıdılar. Sonra o kadın... beyaz kadın uyandı.');
  G.cutscene(false);
  // wisps first
  G.audio.setMood('battle');
  const wisps = [0, 1, 2, 3].map(i => drone(G, near(p.pos, Math.cos(i * 1.6) * 9, Math.sin(i * 1.6) * 9), { low: true, hp: 16, dmg: 10, color: 0x8affd0, ring: 0x8affd0, body: 0xcff6ea }));
  G.ui.hint('Ruhlar sana doğru süzülür ve patlar: yaklaşmadan vur.'); setTimeout(() => G.ui.hint(null), 6000);
  await battle(G, wisps, 'Orman ruhlarını dağıt');
  // Albastı Ana
  G.cutscene(true);
  const boss = albasti(G, near(r.spots.clearing, 0, -6));
  shot(G, near(r.spots.clearing, 5, 3).add(v(0, 2.4, 0)), boss.pos.clone().add(v(0, 2, 0)), 1.5);
  G.audio.whoosh(boss.pos, 0.6);
  await talk(G, 'Albastı Ana', boss, 'Demir kokusu... Gök demiri. Onlar da aynı kokuyu taşıyordu. Kara cübbeliler.');
  await talk(G, 'Albastı Ana', boss, 'Benim ormanımı uyandırdılar. Şimdi sen uyuyacaksın.');
  G.cutscene(false); G.bossFight = true;
  G.ui.hint('Albastı kaybolur ve <b>arkandan</b> çıkar. Kaybolunca yuvarlan (C) ya da arkanı kolla.'); setTimeout(() => G.ui.hint(null), 8000);
  G.ui.objective('Albastı Ana\'yı yen');
  await G.until(() => !boss.alive);
  G.bossFight = false; G.hitstop(0.6); bossBar(G, null);
  await G.wait(1.5);
  // the pod
  G.audio.setMood('calm');
  const warrior = alien(G, r.spots.pod.clone(), { name: 'Gök savaşçısı', hp: 999 });
  warrior.team = 'neutral'; warrior.hpBar && (warrior.hpBar.g.visible = false); warrior.setWeapon(null);
  warrior.brain = idleBrain(G, warrior, r.spots.pod.clone(), r.spots.clearing); warrior.solid = false;
  warrior.pos.y = heightAt(r.spots.pod.x, r.spots.pod.z) + 0.3;
  G.ui.objective('Gemideki camlı beşiğe bak');
  await G.interact({ pos: r.spots.pod, r: 3, label: 'Camlı beşiğe bak' });
  G.cutscene(true);
  shot(G, near(r.spots.pod, 2.2, 2.4).add(v(0, 1.8, 0)), r.spots.pod.clone().add(v(0, 1.6, 0)), 2);
  await G.say('Alp', 'İnsana benziyor... ama değil. Gözleri... uyuyor mu, ölü mü?');
  if (tom) await talk(G, 'Tomris', tom, 'Kara cübbelilerin işareti, beşiğin camına kazınmış. Kara Kam buradaydı.');
  await G.say('Gök sesi', 'Avcılar... bizi arıyor... uyanmayın... uyanmayın...', { italic: true });
  G.ui.whiteFlash();
  power(G, 'karaSimsek', 'Kara Şimşek', 'T', 'Kara Şimşek: çekici baktığın yöne fırlat; vurur ve geri döner.');
  await G.wait(1.2);
  await G.ui.fade(1, 1600); G.cutscene(false);
  return end(G, {
    title: 'Kara Orman', sub: '2. Perde · Bölüm 3',
    lede: 'Albastı Ana dağıldı. Gemide uyuyan şey insan değildi.',
    lines: [['Albastı Ana', 'Yenildi'], ['Avcılar', 'Kurtuldu'], ['Yeni güç', 'T · Kara Şimşek'], ['Öğrenilen', 'Kara Kam\'ın tarikatı buradaydı; "avcılar" geliyor']],
    next: 'Sıradaki bölüm: Hisar\'ın Altı.', nextScene: 14,
  });
}

// ====================================================================
// 13 · Hisar'ın Altı — the caves under the fortress
async function scene14(G) {
  const r = heroIn(G, 'magara', 'start', Math.PI, 14);
  G.world.setTime('cave', 0); G.audio.setMood('night');
  const p = P(G), tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 2, 1)) : null;
  G.cutscene(true);
  shot(G, near(p.pos, 4, 6).add(v(0, 4, 0)), near(r.spots.hall, 0, 0).add(v(0, 2, 0)));
  G.ui.fade(0, 1600);
  await G.ui.title('Hisar\'ın Altı', '2. Perde · Bölüm 4', 3000);
  if (tom) await talk(G, 'Tomris', tom, 'Hisar\'ın lağımından girdik, ama burası lağım değil. Kristaller kendiliğinden yanıyor.');
  await G.say('Alp', 'Hisar\'ın zenginliği... altın değil. Gök demiri. Gemiyi kazıyorlar.', { italic: true });
  G.cutscene(false);
  // miners' guards
  const guards = [near(r.spots.hall, -6, -2), near(r.spots.hall, 6, -3), near(r.spots.hall, -3, -9), near(r.spots.hall, 4, -10)].map(pp => soldier(G, pp, { torch: true, atkMul: 0.9, hp: 55 }));
  G.audio.setMood('battle');
  await fightWave(G, guards, 'Maden muhafızlarını temizle');
  // the ship wall: Demir Kalkan
  G.audio.setMood('calm');
  G.ui.objective('Geminin metal duvarına dokun');
  await G.interact({ pos: near(r.spots.ship, 0, -1), r: 3.2, label: 'Duvardaki yazıya dokun' });
  G.cutscene(true); G.ui.whiteFlash();
  shot(G, near(r.spots.ship, 3, 5).add(v(0, 2.2, 0)), near(r.spots.ship, 0, -4).add(v(0, 2, 0)), 2);
  await G.say('Gök sesi', 'Biz... Tengri\'nin Sürüsü\'nden kaçanlarız. Sürü... avlar. Sürü... dinler.', { italic: true });
  await G.say('Alp', 'Sürü. Gemiler bir donanma. Ve biri onları avlıyor.');
  power(G, 'demirKalkan', 'Demir Kalkan', 'Sağ tık', 'Demir Kalkan: darbe gelirken <b>tam zamanında</b> blok yap, darbe saldırana geri döner.');
  await G.wait(1);
  // Vasilyos' armoured guard
  const boss = soldier(G, near(r.spots.hall, 0, -6), { key: 'yuzbasi', helmet: 'helmet3', hp: 380, weapon: 'sword', boss: true, scale: 1.5, atkMul: 1.4 });
  boss.name = 'Vasilyos\'un Muhafızı'; boss.atkSlow = 1.3;
  boss.mats.forEach(m => m.color && m.color.setHex(0x6a7684));
  shot(G, near(boss.pos, 3, 5).add(v(0, 2, 0)), boss.pos.clone().add(v(0, 2, 0)), 1.6);
  await G.say('Vasilyos\'un Muhafızı', 'Bey Vasilyos\'un madenine izinsiz girilmez. Demirini bırak, belki yaşarsın.');
  G.cutscene(false); G.bossFight = true; G.audio.setMood('battle');
  const bb = boss.brain; let blockT = 3;
  boss.brain = dt => { bb(dt); blockT -= dt; boss.blocking = blockT < 0 && blockT > -1.6 && boss.attack < 0; if (blockT < -1.6) blockT = rnd(2.5, 4); bossBar(G, boss.name, boss.hp / boss.maxHp); };
  boss.onDie = () => bossBar(G, null);
  G.ui.hint('Muhafız ağır vurur: kızardığı anda <b>blok</b> yap, Demir Kalkan darbeyi geri yollar. Kalkanını Taş Kıran (üçüncü vuruş) kırar.'); setTimeout(() => G.ui.hint(null), 9000);
  G.ui.objective('Vasilyos\'un muhafızını yen');
  await G.until(() => !boss.alive);
  G.bossFight = false; G.hitstop(0.6); bossBar(G, null);
  await G.wait(1.2);
  G.cutscene(true);
  if (tom) await talk(G, 'Tomris', tom, 'Yukarıda, Hisar\'ın kapısında Kağan\'ın ordusu toplanıyormuş. Haberci geldi.');
  await G.say('Alp', 'O zaman kapıyı içeriden değil, dışarıdan kıracağız.');
  await G.ui.fade(1, 1600); G.cutscene(false);
  return end(G, {
    title: 'Hisar\'ın Altı', sub: '2. Perde · Bölüm 4',
    lede: 'Hisar\'ın zenginliği gemiden geliyormuş. Gemiler bir donanma, peşlerinde bir sürü var.',
    lines: [['Vasilyos\'un muhafızı', 'Yenildi'], ['Yeni güç', 'Demir Kalkan · tam zamanında blok'], ['Öğrenilen', '"Tengri\'nin Sürüsü" avlıyor']],
    next: 'Sıradaki bölüm: Hisar Kuşatması.', nextScene: 15,
  });
}

// ====================================================================
// 14 · Hisar Kuşatması — the gate, the walls, the commander
async function scene15(G) {
  const r = heroIn(G, 'hisar', 'camp', Math.PI, 15);
  r.closeGate && r.closeGate();
  G.world.setTime('storm', 0); G.audio.setMood('battle');
  const p = P(G), tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 3, 1)) : null;
  const army = [-8, -4, 4, 8, -6, 6].map((x, i) => ally(G, near(r.spots.camp, x, -4 - (i > 3 ? 3 : 0))));
  const varos = ally(G, near(r.spots.camp, 0, -7), { key: 'yuzbasi', name: 'Demir Eldiven Varos', hp: 160, helmet: 'helmet2', atkMul: 1.0, floorHp: 30 });
  G.cutscene(true);
  shot(G, near(r.spots.camp, 12, 12).add(v(0, 9, 0)), near(r.spots.gate, 0, 0).add(v(0, 5, 0)));
  G.ui.fade(0, 1600);
  await G.ui.title('Hisar Kuşatması', '2. Perde · Bölüm 5', 3000);
  shot(G, near(varos.pos, 2.5, 3).add(v(0, 1.8, 0)), varos.pos.clone().add(v(0, 1.6, 0)), 1.6);
  await talk(G, 'Demir Eldiven Varos', varos, 'Koç takıldı, kapı yerinde. Gökten gelen çekicin bir kapıyı kıramıyorsa söyle, ben kırarım.');
  await G.say('Alp', 'Sen surlardakileri oyala. Kapı benim.');
  G.cutscene(false);
  // defenders outside the gate
  const outside = [-6, -2, 2, 6].map(x => soldier(G, near(r.spots.gate, x, 8 + Math.random() * 3), { helmet: 'helmet1', atkMul: 0.85 }));
  outside.push(soldier(G, near(r.spots.gate, 0, 5), { helmet: 'helmet2', atkMul: 0.9, hp: 60 }));
  // archers on the wall: bolts of arrows every few seconds
  const archerT = G.tickers.push(dt => {
    if (G.cutsceneOn || r.gateOpen) return r.gateOpen ? false : undefined;
    if (Math.random() < dt * 0.6) {
      const from = near(r.spots.gate, rnd(-10, 10), -1).add(v(0, 7, 0)), to = p.pos.clone().add(v(rnd(-1, 1), 1, rnd(-1, 1)));
      G.shootArrow(from, to, 8, 'hisar');
    }
  });
  G.ui.hint('Surlardaki okçular ateş ediyor: durma, hareket et.'); setTimeout(() => G.ui.hint(null), 6000);
  await fightWave(G, outside, 'Kapının önündekileri temizle');
  // break the gate
  G.ui.objective('Kapıyı gök çekiçle kır');
  await G.interact({ pos: r.spots.gate.clone().add(v(0, 0, 2)), r: 3.2, label: 'Kapıya vur (basılı tut)', hold: 2.2 });
  G.cutscene(true);
  shot(G, near(r.spots.gate, 6, 9).add(v(0, 3, 0)), r.spots.gate.clone().add(v(0, 3, 0)), 2.5);
  p.pose.hammerRaise = 1; await G.wait(0.5); p.pose.hammerRaise = 0;
  G.fx.skyBurst(r.spots.gate.clone().add(v(0, 2, 0)), 80); G.fx.flash(r.spots.gate.clone().add(v(0, 3, 0)), 0x9fe8ff, 120, 0.3, 30); G.audio.thunder(); G.shake(0.9);
  r.gateOpen = true; r.openGate();
  let gt = 0; G.tickers.push(dt => { gt += dt; const k = Math.min(1, gt * 2); r.gate.children.forEach((l, i) => { l.rotation.y = (i ? -1 : 1) * 1.5 * k; l.position.x = (i ? 1.8 : -1.8) + (i ? 1 : -1) * 1.6 * k; l.position.z = 1.6 * k; }); return k < 1; });
  await G.wait(1.2);
  G.cutscene(false);
  // the yard and the commander
  const yard = r.spots.yard;
  const inner = [near(yard, -6, 0), near(yard, 6, 0), near(yard, -3, -6), near(yard, 3, -6), near(yard, 0, -3)].map(pp => soldier(G, pp, { helmet: 'helmet2', atkMul: 0.9, hp: 55 }));
  const cmd = soldier(G, near(r.spots.keep, 0, 8), { key: 'yuzbasi', helmet: 'helmet3', hp: 280, weapon: 'sword', boss: true, scale: 1.2, atkMul: 1.3 });
  cmd.name = 'Hisar Komutanı'; cmd.floorHp = 40;
  army.forEach(a => { a.home = near(yard, rnd(-6, 6), rnd(-4, 4)); });
  await fightWave(G, inner, 'Avluyu al');
  G.ui.objective('Hisar Komutanı\'nı dize getir');
  await G.until(() => cmd.hp <= 42);
  cmd.team = 'neutral'; cmd.brain = idleBrain(G, cmd, cmd.pos.clone(), p); cmd.pose.kneel = 1;
  G.cutscene(true); G.audio.setMood('grief');
  shot(G, near(cmd.pos, 2.5, 2.5).add(v(0, 1.6, 0)), cmd.pos.clone().add(v(0, 1, 0)), 2);
  await G.say('Hisar Komutanı', 'Dur... teslim. Teslim! Beni öldürme, demirci. Ben sadece emirleri...');
  await G.say('Alp', 'Gemileri kim uyandırıyor? Tengri mi?');
  await G.say('Hisar Komutanı', 'Tengri değil. Kara Kam. Vasilyos\'a gök demirini o satıyordu. Sizin Kağan\'a da... gölgesini.');
  await talk(G, 'Demir Eldiven Varos', varos, 'Kara Kam. Kardeşimi o yollamıştı obana. Bunu bilmiyordum.');
  if (tom) await talk(G, 'Tomris', tom, 'Kağan\'ın yanındaki gölge. Hatun haklıydı.');
  await G.ui.fade(1, 1800); G.cutscene(false);
  return end(G, {
    title: 'Hisar Kuşatması', sub: '2. Perde · Bölüm 5',
    lede: 'Hisar düştü. Esir komutan gerçeği söyledi: gemileri uyandıran Kara Kam.',
    lines: [['Hisar kapısı', 'Gök çekiçle kırıldı'], ['Hisar Komutanı', 'Teslim oldu'], ['Öğrenilen', 'Kara Kam hem Hisar\'ı hem Kağan\'ı kullanıyor']],
    next: 'Sıradaki bölüm: İhanet.', nextScene: 16,
  });
}

// ====================================================================
// 15 · İhanet — the victory feast turns
async function scene16(G) {
  const r = heroIn(G, 'ordu', 'market', Math.PI, 16);
  G.world.setTime('night', 0); G.audio.setMood('night');
  const p = P(G); const sq = r.spots.market;
  p.pos.copy(near(sq, 0, 6));
  const fire = v(sq.x, heightAt(sq.x, sq.z + 2) + 0.1, sq.z + 2);
  G.fx.fire(fire, 1.1, { intensity: 16 });
  const tom = withTomris(G) ? tomrisFoot(G, near(sq, 3, 5)) : null; if (tom) tom.brain = idleBrain(G, tom, tom.pos.clone(), fire);
  const kagan = G.spawn('kutlu', { name: 'Kağan', pos: near(sq, -3, -3), scale: 1.1 }); kagan.brain = idleBrain(G, kagan, kagan.pos.clone(), fire);
  const hatun = G.spawn('koylu6', { name: 'Hatun', pos: near(sq, -5, -2) }); hatun.brain = idleBrain(G, hatun, hatun.pos.clone(), fire);
  const kacin = G.spawn('kacin', { name: 'Kaçın', pos: near(sq, 4, -2) }); kacin.brain = idleBrain(G, kacin, kacin.pos.clone(), fire);
  const feast = [0, 1, 2, 3, 4].map(i => { const a = i / 5 * 6.28 + 0.3, c = G.spawn(['koylu2', 'koylu4', 'asker1', 'asker2', 'koylu2'][i], { name: 'Ordu-Balıklı', pos: near(fire, Math.cos(a) * 6, Math.sin(a) * 6) }); c.brain = idleBrain(G, c, c.pos.clone(), fire); c.pose.cheer = i % 2; return c; });
  G.cutscene(true);
  shot(G, near(sq, 8, 10).add(v(0, 4, 0)), fire.clone().add(v(0, 1, 0)));
  G.ui.fade(0, 1600);
  await G.ui.title('İhanet', '2. Perde · Bölüm 6', 3000);
  await talk(G, 'Kağan', kagan, 'Hisar düştü! Demir Bey\'in çekici kapıyı kırdı! İçin!');
  shot(G, near(kacin.pos, 2, 2.5).add(v(0, 1.7, 0)), kacin.pos.clone().add(v(0, 1.5, 0)), 2);
  await talk(G, 'Kaçın', kacin, 'Alp... seninle konuşmam lazım. Burada değil.');
  // the reveal
  G.audio.setMood('grief');
  kagan.mats.forEach(m => { m.emissive && m.emissive.set(0x400818); m.emissiveIntensity = 0.6; });
  G.fx.ring(kagan.pos, 0xff3a2a, 4, 1.2); G.audio.thunder();
  shot(G, near(kagan.pos, 3, 3).add(v(0, 1.9, 0)), kagan.pos.clone().add(v(0, 1.6, 0)), 1.6);
  await talk(G, 'Kağan', kagan, '(başka bir sesle) Konuşacak bir şey kalmadı, çocuk. Kaçın bana her şeyi anlattı. Gemileri, yerlerini, gücünü.');
  await talk(G, 'Kaçın', kacin, 'Özür dilerim, Alp. Kara Kam annemi rehin aldı. Baskın gecesinden beri... ona yazıyordum.');
  await talk(G, 'Hatun', hatun, 'Bu senin sesin değil! Kağanım, uyan!');
  await talk(G, 'Kağan', kagan, 'Hatun\'u zindana atın. Demir Bey\'i de... çekiciyle birlikte getirin.');
  hatun.team = 'neutral'; hatun.pos.copy(r.spots.dungeon); hatun.brain = idleBrain(G, hatun, r.spots.dungeon.clone(), sq);
  kacin.remove(); kagan.remove();
  const c = await G.ui.choice('Alp', 'Muhafızlar geliyor.', [
    { t: 'Hatun\'u zindandan kurtar.', tag: 'Hatun yaşar · zor yol' },
    { t: 'Şehirden kaç, Ergenekon\'a git.', tag: 'Hatun zindanda kalır' }]);
  G.audio.setMood('battle');
  const pal = [near(sq, -6, -6), near(sq, 6, -6), near(sq, -8, 2), near(sq, 8, 2)].map(pp => { const s = soldier(G, pp, { key: 'asker2', helmet: 'helmet3', weapon: 'sword', hp: 60, atkMul: 1 }); s.name = 'Saray Muhafızı'; return s; });
  feast.forEach(f => { f.brain = wanderBrain(G, f, [near(r.spots.gate, rnd(-5, 5), 4)]); f.pose.cheer = 0; });
  G.cutscene(false);
  if (c === 0) {
    await fightWave(G, pal, 'Saray muhafızlarını yen');
    const more = [near(r.spots.dungeon, -4, 6), near(r.spots.dungeon, 4, 6)].map(pp => { const s = soldier(G, pp, { key: 'asker2', helmet: 'helmet3', weapon: 'sword', hp: 60 }); s.name = 'Zindan Bekçisi'; return s; });
    await fightWave(G, more, 'Zindanın bekçilerini yen');
    G.ui.objective('Zindan kapısını kır');
    await G.interact({ pos: near(r.spots.dungeon, 0, -1), r: 3, label: 'Kapıyı kır (basılı tut)', hold: 1.4 });
    G.cutscene(true); G.fx.skyBurst(r.spots.dungeon.clone().add(v(0, 1.5, 0)), 40); G.audio.thunder();
    r.dungeonDoor.visible = false;
    hatun.pos.copy(near(r.spots.dungeon, 0, 2.5)); hatun.yaw = hatun.angleTo(p);
    shot(G, near(hatun.pos, 2.4, 2.4).add(v(0, 1.7, 0)), hatun.pos.clone().add(v(0, 1.5, 0)), 2);
    await talk(G, 'Hatun', hatun, 'Demir Bey. Onu öldürme. Kağan\'ı Kara Kam\'ın elinden geri al. Bana söz ver.');
    await G.say('Alp', 'Söz.');
    G.flags.hatun = true;
  } else {
    G.ui.objective('Şehir kapısına koş');
    await reach(G, r.spots.gate, 7);
    G.flags.hatun = false;
    G.cutscene(true);
  }
  // four pillars of light
  G.cutscene(true); G.audio.setMood('grief');
  shot(G, near(p.pos, 0, 6).add(v(0, 2, 0)), near(p.pos, 0, -80).add(v(0, 40, 0)), 1);
  const cols = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 400, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(-180 + i * 120, 200, -300 - (i % 2) * 60); r.group.add(m); cols.push(m);
  }
  G.audio.thunder();
  if (tom) await talk(G, 'Tomris', tom, 'Dört ışık... dört gemi. Tuz Gölü, Kara Orman, Hisar... ve Kurgan.');
  await G.say('Alp', 'Kara Kam onları birbirine bağladı. Beşincisi Ergenekon\'da.');
  await G.ui.fade(1, 1800); G.cutscene(false);
  cols.forEach(m => m.removeFromParent());
  return end(G, {
    title: 'İhanet', sub: '2. Perde · Bölüm 6',
    lede: 'Kaçın\'ın casusluğu ortaya çıktı. Kağan artık Kara Kam\'ın sesiyle konuşuyor.',
    lines: [['Kaçın', 'Kara Kam\'ın casusuydu (annesi rehin)'], ['Hatun', G.flags.hatun ? 'Zindandan kurtarıldı · Kağan\'ı öldürmeden durdurma yolu açık' : 'Zindanda kaldı'], ['Gökte', 'Dört ışık sütunu']],
    next: '3. Perde: Göğün Yanışı. Sıradaki bölüm: Ergenekon.', nextScene: 17,
  });
}

// ====================================================================
// 16 · Ergenekon — Kara Kam, the Kağan, the anvil, and the first light of the Swarm
async function scene17(G) {
  const r = heroIn(G, 'ergenekon', 'start', Math.PI, 17);
  G.world.setTime('storm', 0); G.audio.setMood('battle');
  const p = P(G), tom = withTomris(G) ? tomrisFoot(G, near(p.pos, 2.5, 1)) : null;
  if (r.ship) { r.ship.position.y = r.shipY0 ?? r.ship.position.y; r.shipY0 = r.ship.position.y; }
  const kagan = G.spawn('kutlu', { name: 'Kağan', pos: near(r.spots.altar, -4, 4), scale: 1.1, team: 'neutral' });
  kagan.mats.forEach(m => { m.emissive && m.emissive.set(0x400818); m.emissiveIntensity = 0.6; });
  kagan.brain = idleBrain(G, kagan, kagan.pos.clone(), p);
  const kk = karaKam(G, near(r.spots.altar, 0, 3.5), n => {
    G.ui.toast('Kara Kam gölgelerini çağırıyor!', 1600);
    for (let i = 0; i < 2; i++) { const s = soldier(G, near(kk.pos, rnd(-4, 4), rnd(-4, 4)), { helmet: 'helmet1', hp: 40 }); s.name = 'Gölge'; s.mats.forEach(m => m.color && m.color.setHex(0x1a1420)); }
  });
  kk.team = 'neutral'; const kkBrain = kk.brain; kk.brain = dt => { kk.faceTo && kk.faceTo(p, dt, 3); }; bossBar(G, null);
  const cult = [near(r.spots.field, -8, 0), near(r.spots.field, 8, -2), near(r.spots.field, -4, -6), near(r.spots.field, 5, -8)].map(pp => { const s = soldier(G, pp, { helmet: 'helmet1', atkMul: 0.95, hp: 50 }); s.name = 'Kara Kam\'ın adamı'; s.mats.forEach(m => m.color && m.color.multiplyScalar(0.5)); return s; });
  G.cutscene(true);
  shot(G, v(30, 30, 60), v(0, 10, -30));
  G.ui.fade(0, 1600);
  await G.ui.title('Ergenekon', '3. Perde · Bölüm 1', 3200);
  shot(G, near(p.pos, 3, 4).add(v(0, 2, 0)), r.spots.altar.clone().add(v(0, 3, 0)), 1.2);
  await G.say('Alp', 'Demir dağların anası. Atalarımızın eritip çıktığı dağ bu muydu?', { italic: true });
  if (tom) await talk(G, 'Tomris', tom, 'Dört ışık buraya akıyor. Ve şu sunaktaki... Kağan!');
  G.cutscene(false);
  await fightWave(G, cult, 'Tarikatın adamlarını yen');
  // the Kağan
  G.cutscene(true);
  shot(G, near(kagan.pos, 3, 3).add(v(0, 1.9, 0)), kagan.pos.clone().add(v(0, 1.6, 0)), 1.6);
  await talk(G, 'Kağan', kagan, '(Kara Kam\'ın sesiyle) Demir Bey. Çekici sunağa koy. Beşinci gemi onu bekliyor.');
  let kaganFree = false;
  if (G.flags.hatun) {
    const c = await G.ui.choice('Alp', '', [
      { t: '"Hatun seni bekliyor, Kağanım. Onun sesini hatırla."', tag: 'Hatun\'un sözü' },
      { t: '(Çekici kaldır.)', tag: 'savaş' }]);
    if (c === 0) {
      await talk(G, 'Kağan', kagan, '...Hatun? Hatun... zindanda... Ben ne... ne yaptım?');
      kagan.mats.forEach(m => { m.emissiveIntensity = 0; }); kagan.pose.kneel = 1;
      kaganFree = true;
    }
  }
  if (!kaganFree) {
    G.cutscene(false);
    kagan.team = 'hisar'; kagan.setWeapon('sword'); kagan.hp = kagan.maxHp = 200; kagan.floorHp = 30; kagan.makeHpBar && kagan.makeHpBar(true);
    kagan.brain = soldierBrain(G, kagan, { boss: true });
    G.ui.objective('Kağan\'ı dize getir');
    await G.until(() => kagan.hp <= 32);
    kagan.team = 'neutral'; kagan.brain = idleBrain(G, kagan, kagan.pos.clone(), p); kagan.pose.kneel = 1;
    G.cutscene(true);
    await talk(G, 'Kağan', kagan, '...Gölge... gitti. Çocuk, Kara Kam\'ı durdur.');
  }
  G.flags.kagan = kaganFree ? 'kurtarildi' : 'yenildi';
  // Kara Kam
  shot(G, near(kk.pos, 3, 3.5).add(v(0, 2.2, 0)), kk.pos.clone().add(v(0, 2, 0)), 1.5);
  await talk(G, 'Kara Kam', kk, 'Kırk yıl, Bars\'ın kardeşi olarak bu dağları dinledim. Gemiler bir kapı, çocuk. Göğe açılan bir kapı.');
  await talk(G, 'Kara Kam', kk, 'Ben kapıyı açtım. Gelenler de bana güç verecek. Çekici ver!');
  G.cutscene(false); G.bossFight = true;
  kk.team = 'hisar'; kk.brain = kkBrain;
  G.ui.hint('Kara Kam\'ın şimşeği <b>kırmızı halkaya</b> düşer: halkadan çık.'); setTimeout(() => G.ui.hint(null), 7000);
  G.ui.objective('Kara Kam\'ı yen');
  await G.until(() => !kk.alive);
  G.bossFight = false; G.hitstop(0.7); bossBar(G, null);
  for (const a of G.actors) if (a.alive && a.team === 'hisar') a.takeHit(999, null, 2);
  await G.wait(1.5);
  // the anvil
  G.audio.setMood('calm');
  G.ui.objective('Tengri\'nin Örsü\'ne çekici koy');
  await G.interact({ pos: r.spots.altar, r: 3.4, label: 'Çekici örse koy' });
  G.cutscene(true); G.ui.whiteFlash(); G.audio.thunder();
  shot(G, near(r.spots.altar, 4, 5).add(v(0, 3, 0)), r.spots.altar.clone().add(v(0, 1.5, 0)), 2);
  p.charge = 100; p.dmgMul = 2.2;
  G.flags.ors = true;
  G.ui.toast('Tengri\'nin Örsü: bütün güçler birleşti. Vuruşların iki kat güçlü.', 3200);
  await G.say('Gök sesi', 'Beşten... beşi... uyanık. Sinyal... gitti. Sürü... duydu.', { italic: true });
  // the light in the sky: the Swarm arrives
  G.world.setTime('night', 2);
  shot(G, near(p.pos, 0, 8).add(v(0, 2, 0)), near(p.pos, 0, -60).add(v(0, 90, 0)), 1);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(6, 0.4, 260, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x48e8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  beam.position.set(0, 130, -20); r.group.add(beam);
  G.fx.flash(v(0, 60, -20), 0x48e8ff, 200, 0.5, 120); G.audio.boom(0); G.shake(0.6);
  await G.wait(1.2);
  if (tom) await talk(G, 'Tomris', tom, 'Gökte bir delik açıldı. Bir şey... iniyor.');
  const al = [near(r.spots.field, -5, -2), near(r.spots.field, 5, -2)].map(pp => alien(G, pp, { hp: 70 }));
  al.forEach(a => G.fx.flash(a.pos.clone().add(v(0, 1, 0)), 0x48e8ff, 80, 0.3, 14));
  const dr = [drone(G, near(r.spots.field, -8, 6)), drone(G, near(r.spots.field, 8, 6))];
  shot(G, near(al[0].pos, 4, 5).add(v(0, 2, 0)), al[0].pos.clone().add(v(0, 1.8, 0)), 1.5);
  await G.say('Alp', 'Bunlar... beşikteki savaşçı gibi. Ama uyanık.');
  G.cutscene(false); G.audio.setMood('battle');
  G.ui.hint('Gözcüler havadan ateş eder: yere alçaldıklarında vur ya da <b>T</b> ile çekici fırlat.'); setTimeout(() => G.ui.hint(null), 7000);
  await battle(G, [...al, ...dr], 'Gökten inenleri yen');
  // the ship wakes and rises with Alp on its back
  G.cutscene(true); G.audio.setMood('grief');
  if (tom) { tom.pos.copy(near(p.pos, 1.6, 1)); await talk(G, 'Tomris', tom, 'Gemi titriyor! Alp, in oradan!'); }
  await G.say('Alp', 'Hayır. Gelenler yukarıda. Gemi beni onlara götürecek.');
  if (tom) await talk(G, 'Tomris', tom, G.flags.tomris >= 60 ? 'O zaman ben de geliyorum. Tartışma.' : 'Dönmezsen... Ak Pınar seni bekleyecek.');
  G.flags.tomrisUzay = !!tom && G.flags.tomris >= 60;
  shot(G, near(p.pos, 18, 22).add(v(0, 10, 0)), r.ship ? r.ship.position.clone() : r.spots.altar, 0.8);
  let rt = 0; G.tickers.push(dt => { rt += dt; if (r.ship) r.ship.position.y += dt * (2 + rt * 3); G.shake(0.25); return rt < 6; });
  G.audio.rumble && G.audio.rumble(4);
  await G.wait(2.6); G.ui.whiteFlash(); await G.ui.fade(1, 1400);
  if (r.ship) r.ship.position.y = r.shipY0;
  beam.removeFromParent();
  G.cutscene(false);
  return end(G, {
    title: 'Ergenekon', sub: '3. Perde · Bölüm 1',
    lede: 'Kara Kam düştü, ama sinyali göğe ulaştı. Beşinci gemi Alp\'i sırtında göğe taşıyor.',
    lines: [['Kağan', kaganFree ? 'Hatun\'un adıyla uyandı' : 'Dize getirildi, gölgeden kurtuldu'], ['Kara Kam', 'Yenildi'], ['Tengri\'nin Örsü', 'Bütün güçler birleşti'], ['Gökte', 'Sürü geldi']],
    next: 'Sıradaki bölüm: Gök Sürüsü. Uzay.', nextScene: 18,
  });
}

// ====================================================================
// 17 · Gök Sürüsü — on the mothership's deck above the Earth
async function scene18(G) {
  const r = heroIn(G, 'uzay', 'start', Math.PI, 18);
  G.world.setTime('space', 0); G.audio.setMood('battle');
  G.flags.ors = true;
  const p = P(G); p.dmgMul = 2.2; p.charge = 100;
  const tom = (G.flags.tomrisUzay ?? withTomris(G)) ? tomrisFoot(G, near(p.pos, 2.5, 1)) : null;
  // Swarm fighters streaking overhead, now and then strafing the deck
  const fighters = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 3), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.8, roughness: 0.4 })); body.rotation.x = Math.PI / 2; f.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 1.4), body.material); wing.position.z = -0.6; f.add(wing);
    const eng = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a6a })); eng.position.z = -2; f.add(eng);
    r.group.add(f); fighters.push({ m: f, a: i * 1.57, R: 60 + i * 12, h: 22 + i * 6, s: 0.35 + i * 0.06, fireT: rnd(4, 8) });
  }
  G.tickers.push(dt => {
    for (const f of fighters) {
      f.a += dt * f.s; const x = Math.cos(f.a) * f.R, z = Math.sin(f.a) * f.R;
      f.m.position.set(x, f.h + Math.sin(f.a * 3) * 4, z); f.m.lookAt(Math.cos(f.a + 0.1) * f.R, f.h, Math.sin(f.a + 0.1) * f.R);
      if (G.cutsceneOn) continue;
      f.fireT -= dt;
      if (f.fireT <= 0) { // a strafing run: marks, then bolts rain on the ring
        f.fireT = rnd(7, 11);
        const at = p.pos.clone(); G.fx.ring(at, 0xff4a6a, 3, 1.1);
        for (let k = 0; k < 4; k++) setTimeout(() => { const to = at.clone().add(v(rnd(-1.5, 1.5), 0.2, rnd(-1.5, 1.5))); G.shootBolt(f.m.position.clone(), to, 9, 'hisar', 0xff4a6a, 60); }, 700 + k * 90);
      }
    }
  });
  G.cutscene(true);
  shot(G, v(30, 18, 70), v(0, 2, 0));
  G.ui.fade(0, 2000);
  await G.ui.title('Gök Sürüsü', '3. Perde · Bölüm 2', 3200);
  shot(G, near(p.pos, -4, 5).add(v(0, 2, 0)), v(-120, -200, -260), 0.8);
  await G.say('Alp', 'Bozkır... aşağıda. Mavi bir taş gibi. Babam bunu hiç görmedi.', { italic: true });
  if (tom) await talk(G, 'Tomris', tom, 'Ayaklarım yere zor basıyor. Zıplarsan uçacaksın, dikkat et.');
  G.cutscene(false);
  G.ui.hint('Burada yerçekimi az: <b>Boşluk</b> ile uzun zıpla. Gemiler halka çizip ateş eder: halkadan çık.'); setTimeout(() => G.ui.hint(null), 8000);
  // wave 1
  const w1 = [v(-10, 0, 10), v(10, 0, 10), v(-6, 0, 2), v(6, 0, 2)].map(pp => alien(G, pp, { hp: 70 }));
  await battle(G, w1, 'Güvertedeki avcıları yen');
  // wave 2: watchers and hunters
  G.ui.toast('Gözcüler geliyor!', 1500);
  const w2 = [drone(G, v(-12, 0, -4)), drone(G, v(12, 0, -4)), drone(G, v(0, 0, 18)), alien(G, v(-14, 0, 14), { hp: 80 }), alien(G, v(14, 0, 14), { hp: 80 })];
  await battle(G, w2, 'Gözcüleri ve avcıları düşür');
  // the commander
  G.cutscene(true);
  const boss = commander(G, r.spots.boss.clone());
  shot(G, near(r.spots.boss, 5, 9).add(v(0, 3, 0)), r.spots.boss.clone().add(v(0, 2.6, 0)), 1.4);
  await G.say('Sürü Komutanı', '(ses doğrudan kafanın içinde) Kaçak gemilerin enkazında bir hayvan. Bir... demirci.');
  await G.say('Sürü Komutanı', 'Bin gök gezdik. Hepsini söndürdük. Seninki de sönecek.');
  await G.say('Alp', 'Bizim gökte demircinin örsü var. Gel, ölç.');
  G.cutscene(false); G.bossFight = true;
  const feed = () => { const ds = [0, 1, 2].map(i => drone(G, near(boss.pos, Math.cos(i * 2.1) * 8, Math.sin(i * 2.1) * 8), { hp: 30 })); boss.drones.push(...ds); };
  feed(); let refed = false;
  G.ui.hint('Komutanın kalkanı gözcülerden beslenir: <b>önce gözcüleri</b> düşür. Kırmızı dalgayı zıplayarak ya da yuvarlanarak atla.'); setTimeout(() => G.ui.hint(null), 9000);
  G.ui.objective('Sürü Komutanı\'nı yen');
  await G.until(() => { if (!refed && boss.hp < boss.maxHp * 0.5) { refed = true; G.ui.toast('Komutan yeni gözcüler çağırdı!', 1600); feed(); } return !boss.alive; });
  G.bossFight = false; G.hitstop(0.8); bossBar(G, null);
  for (const d of G.extraTargets) d.alive && d.die && d.die();
  await G.wait(1.5);
  // strike the heart of the ship
  G.audio.setMood('calm');
  G.ui.objective('Ana geminin kalbine Tengri\'nin Örsü\'yle vur');
  await G.interact({ pos: r.spots.boss.clone().add(v(0, 0, -3)), r: 3.4, label: 'Örsle vur (basılı tut)', hold: 1.6 });
  G.cutscene(true);
  shot(G, near(p.pos, 6, 8).add(v(0, 3, 0)), r.eye.position.clone(), 1.5);
  p.pose.hammerRaise = 1; await G.wait(0.7); p.pose.hammerRaise = 0;
  G.fx.skyBurst(r.eye.position.clone(), 120); G.fx.flash(r.eye.position.clone(), 0x9fe8ff, 300, 0.6, 80); G.audio.thunder(); G.shake(1.2);
  r.eye.visible = false;
  await G.say('Gök sesi', 'Sürü... kör. Kardeşlerimiz... özgür.', { italic: true });
  if (tom) await talk(G, 'Tomris', tom, 'Gemi düşüyor! Bizim gemimize, çabuk!');
  else await G.say('Alp', 'Gemi düşüyor. Eski gemiye... şimdi!');
  let ft = 0; G.tickers.push(dt => { ft += dt; G.shake(0.3 + ft * 0.1); if (Math.random() < dt * 8) G.fx.flash(v(rnd(-30, 30), rnd(0, 6), rnd(-30, 30)), 0xffa060, 80, 0.3, 20); return ft < 5; });
  await G.wait(2.4); G.ui.whiteFlash(); await G.ui.fade(1, 1600);
  G.cutscene(false);
  return end(G, {
    title: 'Gök Sürüsü', sub: '3. Perde · Bölüm 2',
    lede: 'Sürü\'nün ana gemisi kör, düşüyor. Eski gök gemisi bozkıra doğru süzülüyor.',
    lines: [['Sürü Komutanı', 'Yenildi'], ['Ana gemi', 'Kalbi kırıldı'], ['Tomris', tom ? 'Yanında' : 'Bozkırda bekliyor']],
    next: 'Sıradaki bölüm: Son.', nextScene: 19,
  });
}

// ====================================================================
// 18 · Son — home to Kayalı Pınar
async function scene19(G) {
  ensureFlags(G, 19);
  G.world.setTime('dawn', 0); G.audio.setMood('grief');
  G.world.grave.visible = true; G.world.bound = { x: 0, z: 0, R: 70 };
  playerAt(G, near(OBA.entrance, 6, 0), -Math.PI / 2, 'gokcekic');
  const p = P(G); p.setWeapon('gokcekic', 0.22, true); p.skyHammer = true; p.setOutfit('gok');
  const tom = withTomris(G) ? G.spawn('tomris', { name: 'Tomris', pos: near(p.pos, 1.8, 1.2) }) : null;
  if (tom) tom.brain = idleBrain(G, tom, tom.pos.clone(), GRAVE);
  const kacin = G.flags.kacinBack || G.flags.saved === 'kacin' ? G.spawn('kacin', { name: 'Kaçın', pos: near(GRAVE, 3, 3) }) : null;
  if (kacin) kacin.brain = idleBrain(G, kacin, kacin.pos.clone(), GRAVE);
  // the falling mothership
  const ship = new THREE.Mesh(new THREE.SphereGeometry(12, 20, 10), new THREE.MeshStandardMaterial({ color: 0x2a2e36, emissive: 0xff5a20, emissiveIntensity: 0.6, metalness: 0.7 }));
  ship.scale.y = 0.3; ship.position.set(-400, 260, -420); G.scene.add(ship); G.world.temp.push(ship);
  G.cutscene(true);
  shot(G, near(p.pos, 4, 6).add(v(0, 2, 0)), v(-200, 120, -300));
  G.ui.fade(0, 2000);
  await G.ui.title('Son', 'Kayalı Pınar Obası', 3000);
  let ft = 0;
  G.tickers.push(dt => { ft += dt; ship.position.add(v(dt * 70, -dt * 48, dt * 40)); ship.rotation.z += dt * 0.4; G.fx.light(ship.position, 0xff7a3a, 8, 120); if (Math.random() < 0.6) G.fx.add.add({ x: ship.position.x, y: ship.position.y, z: ship.position.z, vx: 0, vy: 2, vz: 0, drag: 0.5, grav: 0, life: 2.5, age: 0, c0: [1, 0.6, 0.2], c1: [0.3, 0.1, 0.05], a: 0.9, s0: 9, s1: 2 }); return ft < 5.2; });
  await G.wait(5.2);
  G.fx.flash(v(-60, 20, -200), 0xffa060, 400, 1.2, 600); G.audio.boom(0); G.shake(0.8);
  ship.visible = false;
  await G.wait(1);
  if (tom) await talk(G, 'Tomris', tom, 'Dağların ardına düştü. Yanıyor. Bitti mi?');
  await G.say('Alp', 'Gökteki bitti. Burada yapacak bir işim kaldı.');
  G.cutscene(false);
  G.ui.objective('Usta Bars\'ın mezarına git');
  await reach(G, GRAVE, 4);
  G.cutscene(true);
  shot(G, near(GRAVE, 3, 3).add(v(0, 1.8, 0)), GRAVE.clone().add(v(0, 1, 0)), 1.5);
  await G.say('Alp', 'Usta. Dağ uyandı, dediğin gibi. Kardeşin... Kara Kam artık yok.');
  await G.say('Alp', 'Çekici geri getirdim. Örsüne.');
  G.cutscene(false);
  G.ui.objective('Gök çekici Bars\'ın örsüne bırak');
  await G.interact({ pos: OBA.anvil, r: 2.4, label: 'Çekici örse bırak' });
  G.cutscene(true);
  shot(G, near(OBA.anvil, -2.6, 3).add(v(0, 2, 0)), OBA.anvil.clone().add(v(0, 1, 0)), 2);
  p.setWeapon(null);
  const h = G.assets.prop('gokcekic'); h.position.copy(G.world.anvil.position).add(v(0, 1.08, 0)); h.rotation.z = Math.PI / 2; G.scene.add(h); G.world.temp.push(h);
  G.fx.skyBurst(h.position.clone(), 40); G.audio.play && G.audio.play('anvil', { vol: 0.6 });
  G.audio.setMood('calm');
  if (tom && G.flags.tomris >= 60) await talk(G, 'Tomris', tom, 'Kurt dişi hâlâ boynunda. Bir oba kurmaya ne dersin, Demir Bey? Bu sefer çekiç örste kalsın.');
  else if (tom) await talk(G, 'Tomris', tom, 'Ak Pınar\'a dönüyorum. Ama yolun hep açık, demirci.');
  if (kacin) await talk(G, 'Kaçın', kacin, 'Beni affeder misin bilmiyorum. Ama ocağı yine birlikte yakabiliriz.');
  if (G.flags.hatun) await G.say('Alp', 'Ordu-Balık\'ta Hatun, Kağan\'ın yanında. Gölge gitti.', { italic: true });
  await G.ui.fade(1, 2600);
  G.cutscene(false);
  const lines = [
    ['Gök Sürüsü', 'Ana gemisi bozkıra düştü'],
    ['Tomris', tom ? (G.flags.tomris >= 60 ? 'Seninle, Kayalı Pınar\'da' : 'Ak Pınar\'a döndü') : 'Ak Pınar\'da'],
    ['Kaçın', kacin ? 'Obaya döndü' : 'Kayıp'],
    ['Kağan', G.flags.kagan === 'kurtarildi' ? 'Hatun\'un adıyla uyandı' : 'Gölgeden kurtuldu'],
    ['Gök çekiç', 'Bars\'ın örsünde'],
  ];
  G.ui.chapterEnd({ title: 'BOZKIR', sub: 'Gök Tanrı\'nın Mirası · Son', lede: 'Demir dağlar uyudu. Örs sustu. Bozkırda rüzgâr yine kendi sesiyle esiyor.', lines, next: 'Oynadığın için sağ ol.' });
  return 99;
}

export const ACT23 = { 11: scene11, 12: scene12, 13: scene13, 14: scene14, 15: scene15, 16: scene16, 17: scene17, 18: scene18, 19: scene19 };
