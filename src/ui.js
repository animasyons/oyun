// HUD, dialogue, choices, title cards and the forging mini-game (DOM overlay).
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class UI {
  constructor(G) {
    this.G = G;
    this.el = {
      hud: $('hud'), hp: $('hpFill'), st: $('stFill'), ch: $('chFill'), chWrap: $('charge'),
      obj: $('objective'), objText: $('objText'), toast: $('toast'), prompt: $('prompt'), hint: $('hint'),
      dlg: $('dialogue'), who: $('dlgWho'), text: $('dlgText'), choices: $('dlgChoices'), more: $('dlgMore'),
      title: $('titleCard'), tBig: $('tBig'), tSmall: $('tSmall'), fade: $('fade'), hurt: $('hurt'),
      marker: $('marker'), mDist: $('markerDist'), forge: $('forgeGame'), fNeedle: $('fNeedle'), fZone: $('fZone'), fHits: $('fHits'),
      hold: $('holdBar'), holdFill: $('holdFill'), letter: $('letterbox'), timer: $('choiceTimer'),
    };
    this.markerPos = null;
    this.speakers = {
      'Tomris': '#b9e08a', 'Kutlu Bey': '#e0c070', 'Esir': '#c9bda4', 'Tüccar Arslan': '#e6c48a', 'Demir Eldiven Varos': '#e46a4c', 'Kurgan Bekçisi': '#8fa0b8', 'Gök sesi': '#9fe8ff',
      'Usta Bars': '#d9a441', 'Alp': '#9fd1ff', 'Kaçın': '#9ed27f', 'Hisar Yüzbaşısı': '#e46a4c', 'Hatun Ana': '#e6b3c8', 'Köylü': '#c9bda4', 'Asker': '#e46a4c',
      'Kağan': '#f0c860', 'Hatun': '#e6b3c8', 'Kara Kam': '#ff6a5a', 'Sürü Komutanı': '#ff4a6a', 'Albastı Ana': '#bfe8e0', 'Avcı': '#c9bda4', 'Hisar Komutanı': '#e46a4c', 'Vasilyos\'un Muhafızı': '#9aa8b8',
    };
  }

  show(on) { this.el.hud.hidden = !on; }
  setBars(p) {
    this.el.hp.style.width = (p.hp / p.maxHp * 100).toFixed(1) + '%';
    this.el.st.style.width = p.stamina.toFixed(1) + '%';
    this.el.chWrap.hidden = !p.skyHammer;
    this.el.ch.style.width = p.charge.toFixed(1) + '%';
    this.el.chWrap.classList.toggle('ready', p.charge >= 100);
  }
  objective(t) {
    if (!t) { this.el.obj.hidden = true; return; }
    this.el.obj.hidden = false; this.el.objText.textContent = t;
    this.el.obj.classList.remove('pop'); void this.el.obj.offsetWidth; this.el.obj.classList.add('pop');
    this.G.audio.ui();
  }
  toast(t, ms = 1800) {
    const e = this.el.toast; e.textContent = t; e.hidden = false; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in');
    clearTimeout(this._tt); this._tt = setTimeout(() => e.hidden = true, ms);
  }
  prompt(t) { this.el.prompt.hidden = !t; if (t) this.el.prompt.innerHTML = t; }
  hint(html) { this.el.hint.hidden = !html; if (html) this.el.hint.innerHTML = html; }
  hurt(k) { const e = this.el.hurt; e.style.transition = 'none'; e.style.opacity = k; requestAnimationFrame(() => { e.style.transition = 'opacity .6s'; e.style.opacity = 0; }); }
  letterbox(on) { this.el.letter.classList.toggle('on', on); }
  marker(p, label) { this.markerPos = p ? p.clone() : null; this.markerLabel = label || ''; this.el.marker.hidden = !p; }
  hold(k) { this.el.hold.hidden = k == null; if (k != null) this.el.holdFill.style.width = (k * 100) + '%'; }

  updateMarker() {
    const p = this.markerPos; if (!p) return;
    const cam = this.G.camera;
    const v = p.clone().add(new THREE.Vector3(0, 2.6, 0)).project(cam);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
    if (behind) { x = innerWidth - x; y = innerHeight - 40; }
    x = Math.max(30, Math.min(innerWidth - 30, x)); y = Math.max(60, Math.min(innerHeight - 60, y));
    this.el.marker.style.transform = `translate(${x}px, ${y}px)`;
    const d = this.G.player ? Math.round(this.G.player.distTo(p)) : 0;
    this.el.mDist.textContent = (this.markerLabel ? this.markerLabel + ' · ' : '') + d + ' m';
  }

  // waits for Space / Enter / E / click, ignoring the keypress that opened it
  waitAdvance() {
    return new Promise(res => {
      const t0 = performance.now();
      const done = () => { removeEventListener('keydown', kd); this.el.dlg.removeEventListener('click', ck); res(); };
      const kd = e => { if (performance.now() - t0 < 180) return; if (['Space', 'Enter', 'KeyE', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); done(); } };
      const ck = () => { if (performance.now() - t0 < 180) return; done(); };
      addEventListener('keydown', kd); this.el.dlg.addEventListener('click', ck);
    });
  }

  async type(text) {
    const e = this.el.text; e.textContent = '';
    let skip = false;
    const kd = ev => { if (['Space', 'Enter', 'KeyE'].includes(ev.code)) skip = true; };
    const ck = () => skip = true;
    addEventListener('keydown', kd); this.el.dlg.addEventListener('click', ck);
    await sleep(120); skip = false;
    for (let i = 0; i <= text.length; i++) {
      if (skip) { e.textContent = text; break; }
      e.textContent = text.slice(0, i);
      if (i % 2 === 0 && /\S/.test(text[i] || '')) this.G.audio.ui && Math.random() < 0.15 && this.G.audio.ui();
      await sleep(text[i - 1] === '.' || text[i - 1] === ',' || text[i - 1] === '…' ? 90 : 18);
    }
    removeEventListener('keydown', kd); this.el.dlg.removeEventListener('click', ck);
  }

  async say(who, text, opts = {}) {
    if (this.auto) { this.log && this.log.push(who + ': ' + text); await sleep(30); return; }
    const d = this.el.dlg;
    d.hidden = false; this.el.choices.hidden = true; this.el.more.hidden = true;
    this.el.who.textContent = who; this.el.who.style.color = this.speakers[who] || '#e8dcc4';
    d.classList.toggle('italic', !!opts.italic);
    await this.type(text);
    this.el.more.hidden = false;
    if (opts.auto) await sleep(opts.auto); else await this.waitAdvance();
    if (!opts.keep) d.hidden = true;
  }

  // returns the chosen index; options can be strings or {t, tag}
  async choice(who, text, options, opts = {}) {
    if (this.auto) { await sleep(30); return this.autoPick ?? 0; }
    const d = this.el.dlg;
    d.hidden = false; this.el.more.hidden = true;
    this.el.who.textContent = who; this.el.who.style.color = this.speakers[who] || '#e8dcc4';
    if (text) await this.type(text); else this.el.text.textContent = '';
    const list = this.el.choices; list.innerHTML = ''; list.hidden = false;
    return new Promise(res => {
      let timer;
      const pick = i => { removeEventListener('keydown', kd); clearInterval(timer); this.el.timer.hidden = true; list.hidden = true; d.hidden = true; this.G.audio.ui(); res(i); };
      options.forEach((o, i) => {
        const b = document.createElement('button'); b.type = 'button';
        b.innerHTML = `<kbd>${i + 1}</kbd><span>${typeof o === 'string' ? o : o.t}</span>${o.tag ? `<em>${o.tag}</em>` : ''}`;
        b.onclick = () => pick(i); list.appendChild(b);
      });
      const kd = e => { const n = parseInt(e.key, 10); if (n >= 1 && n <= options.length) pick(n - 1); };
      addEventListener('keydown', kd);
      setTimeout(() => list.querySelector('button')?.focus({ preventScroll: true }), 50);
      if (opts.time) {
        let left = opts.time; this.el.timer.hidden = false; this.el.timer.style.width = '100%';
        timer = setInterval(() => { left -= 0.1; this.el.timer.style.width = (left / opts.time * 100) + '%'; if (left <= 0) pick(opts.defaultIndex ?? 0); }, 100);
      }
    });
  }

  async title(big, small, ms = 3200) {
    if (this.auto) ms = 100;
    const e = this.el.title; this.el.tBig.textContent = big; this.el.tSmall.textContent = small || '';
    e.hidden = false; e.classList.remove('in'); void e.offsetWidth; e.classList.add('in');
    await sleep(ms); e.classList.remove('in'); await sleep(700); e.hidden = true;
  }

  async fade(to, ms = 900) {
    const e = this.el.fade; e.style.transition = `opacity ${ms}ms ease`; e.style.opacity = to;
    e.style.pointerEvents = to > 0.5 ? 'auto' : 'none';
    await sleep(ms);
  }

  // three strikes on a sliding needle; returns how many landed in the gold zone
  forgeGame() {
    if (this.auto) return Promise.resolve(2);
    const e = this.el; e.forge.hidden = false;
    return new Promise(res => {
      let x = 0, dir = 1, hits = 0, n = 0, zone = 0, zw = 0, live = true, t0 = performance.now();
      const pips = [...e.fHits.children]; pips.forEach(p => p.className = '');
      const newZone = () => { zw = 0.16 - n * 0.025; zone = 0.2 + Math.random() * (0.6 - zw); e.fZone.style.left = (zone * 100) + '%'; e.fZone.style.width = (zw * 100) + '%'; };
      newZone();
      const strike = () => {
        if (!live || performance.now() - t0 < 300) return;
        const ok = x >= zone && x <= zone + zw;
        pips[n].className = ok ? 'ok' : 'bad';
        const G = this.G; const p = G.world.anvil.position.clone(); p.y = 1.05;
        G.fx.sparks(p, ok ? 30 : 8, ok ? 0xffd27a : 0xff7040, ok ? 5 : 2.5, 0.09);
        G.audio.anvil(p, ok ? 1 : 0.5);
        G.player.startAttack(2);
        if (ok) hits++;
        n++;
        if (n >= 3) { live = false; setTimeout(() => { e.forge.hidden = true; cleanup(); res(hits); }, 700); }
        else newZone();
      };
      const kd = ev => { if (ev.code === 'Space' || ev.code === 'KeyE') { ev.preventDefault(); strike(); } };
      const md = () => strike();
      addEventListener('keydown', kd); e.forge.addEventListener('mousedown', md);
      const cleanup = () => { removeEventListener('keydown', kd); e.forge.removeEventListener('mousedown', md); };
      let last = performance.now();
      const loop = now => {
        if (!live) return;
        const dt = (now - last) / 1000; last = now;
        x += dir * dt * (0.7 + n * 0.25); if (x > 1) { x = 1; dir = -1; } if (x < 0) { x = 0; dir = 1; }
        e.fNeedle.style.left = (x * 100) + '%';
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
  }

  panel(id, on) { $(id).hidden = !on; }

  objectiveCount(t) { if (this.el.objText.textContent !== t) this.el.objText.textContent = t; }

  whiteFlash() {
    const e = this.el.fade; e.style.transition = 'none'; e.style.background = '#fff4dc'; e.style.opacity = 0.85;
    requestAnimationFrame(() => { e.style.transition = 'opacity 1.4s ease'; e.style.opacity = 0; setTimeout(() => e.style.background = '', 1500); });
  }

  ending(f) {
    const lines = [];
    lines.push(['Mizacın', { cesur: 'Cesur', merakli: 'Meraklı', sakin: 'Sakin' }[f.trait] || 'Belirsiz']);
    lines.push(['İlk çekicin', ['Eğri büğrü', 'Yamuk saplı', 'Sağlam', 'Usta işi'][f.forge ?? 1]]);
    lines.push(['Baskın gecesi', f.saved === 'kacin' ? 'Kaçın\'ı kurtardın. Hatun Ana\'nın yurdu çöktü.' : 'Çocukları kurtardın. Kaçın\'ı Hisar götürdü.']);
    lines.push(['Ustanın son sözü', ['"Doğuya git."', '"Uyanıyorlar, Alp."', '"Asıl kol başka yerde."'][f.lastWords ?? 0]]);
    $('endList').innerHTML = lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('endNext').textContent = f.saved === 'kacin'
      ? 'Kaçın yanında. 1. Perde\'de Kağan\'ın şehrine birlikte gideceksiniz.'
      : 'Kaçın Hisar\'ın elinde. 1. Perde\'de onu bulmak için bir yol açılacak.';
    $('endTitle').textContent = 'BOZKIR'; $('endSub').textContent = "Gök Tanrı'nın Mirası";
    $('endLede').textContent = 'Prolog tamamlandı. Kuzeyde, gökten düşen dağ hâlâ tütüyor.';
    $('next').hidden = false; $('next').textContent = "1. Perde'ye devam"; this.G.nextScene = 6;
    this.panel('endScreen', true);
  }

  chapterEnd({ title, sub, lede, lines, next, nextScene }) {
    $('endTitle').textContent = title; $('endSub').textContent = sub; $('endLede').textContent = lede;
    $('endList').innerHTML = lines.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('endNext').textContent = next || '';
    $('next').hidden = !nextScene; $('next').textContent = 'Sonraki bölüm'; this.G.nextScene = nextScene;
    this.panel('endScreen', true);
  }
}
