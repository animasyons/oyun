// All sound is synthesised with WebAudio: no files to load.
const SAMPLES = ['hit', 'anvil', 'water_drop', 'water_fill', 'water_pour', 'water_pour2', 'water_splash',
  'step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7', 'step8', 'step9', 'step10',
  'epic_intro', 'epic_main', 'epic_medium', 'inspire'];

export class Audio {
  constructor() { this.ctx = null; this.on = false; this.raw = {}; this.buf = {}; this.track = null; }

  // fetch the files early (no AudioContext needed), decode once audio starts
  prefetch(base = 'assets/sound/') {
    this.prefetched = Promise.all(SAMPLES.map(n => fetch(base + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) this.raw[n] = b; }).catch(() => {})));
    return this.prefetched;
  }
  async decodeAll() {
    await this.prefetched;
    await Promise.all(Object.entries(this.raw).map(([n, b]) => new Promise(res => {
      try { this.ctx.decodeAudioData(b.slice(0), d => { this.buf[n] = d; res(); }, () => res()); } catch (_) { res(); }
    })));
    if (this.pendingMusic) { const [n, o] = this.pendingMusic; this.pendingMusic = null; this.music(n, o); }
  }

  // one-shot sample; vol 0..1, rate playback speed
  play(name, { vol = 1, rate = 1, dest } = {}) {
    if (!this.on || !this.buf[name]) return null;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.buf[name]; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(dest || this.sfx); s.start();
    return { src: s, gain: g };
  }
  // volume falls off with distance from the listener
  near(pos, maxD = 18) {
    const L = this.listener; if (!pos || !L) return 1;
    const d = Math.hypot(pos.x - L.x, pos.z - L.z);
    return Math.max(0, 1 - d / maxD);
  }

  // background music: crossfades, optional loop, optional follow-up track
  music(name, { loop = true, fade = 2, vol = 0.55, then } = {}) {
    if (!this.on) return;
    if (!this.buf[name] && name) { this.pendingMusic = [name, { loop, fade, vol, then }]; return; }
    if (this.track && this.track.name === name) return;
    const c = this.ctx, t = c.currentTime;
    if (this.track) { const old = this.track; old.gain.gain.cancelScheduledValues(t); old.gain.gain.setValueAtTime(old.gain.gain.value, t); old.gain.gain.linearRampToValueAtTime(0, t + fade); setTimeout(() => { try { old.src.stop(); } catch (_) {} }, fade * 1000 + 100); }
    this.track = null;
    if (!name) return;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.buf[name]; s.loop = loop;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + fade);
    s.connect(g); g.connect(this.master); s.start();
    const tr = { name, src: s, gain: g };
    if (!loop && then) s.onended = () => { if (this.track === tr) { this.track = null; this.music(then, { loop: true }); } };
    this.track = tr;
  }

  step(pos, k = 1) {
    if (!this.on) return;
    const v = this.near(pos, 16) * k; if (v < 0.03) return;
    this.play('step' + (1 + Math.floor(Math.random() * 10)), { vol: 0.32 * v, rate: 0.9 + Math.random() * 0.2 });
  }
  hoof(pos, gallop) {
    if (!this.on) return;
    const v = this.near(pos, 30); if (v < 0.03) return;
    this.play('step' + (1 + Math.floor(Math.random() * 10)), { vol: (gallop ? 0.55 : 0.4) * v, rate: 0.55 + Math.random() * 0.1 });
  }
  anvil(pos, k = 1) {
    if (!this.on) return;
    if (!this.play('anvil', { vol: 0.8 * k * this.near(pos, 40), rate: 0.94 + Math.random() * 0.12 })) this.clang(pos, k);
  }
  water(name, vol = 0.8) { this.play(name, { vol }); }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
    } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.32; this.mus.connect(this.master);
    // noise buffer
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    // steppe wind bed
    const n = this.noise(true), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
    n.connect(f); f.connect(this.windGain); this.windGain.connect(this.master); n.start();
    this.windF = f;
    // fire crackle bed (volume driven by the game)
    const n2 = this.noise(true), f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 1800;
    this.fireGain = c.createGain(); this.fireGain.gain.value = 0;
    n2.connect(f2); f2.connect(this.fireGain); this.fireGain.connect(this.sfx); n2.start();
    this.on = true;
    this.decodeAll();
    this.musicLoop();
  }

  noise(loop) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = !!loop; return s; }
  env(g, t, a, peak, dcy) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }

  setMood(m) { // 'calm' | 'night' | 'battle' | 'grief'
    this.mood = m;
    if (!this.ctx) return;
    if (m === 'battle') this.music('epic_main', { fade: 1.5, vol: 0.5 });
    else if (m === 'calm' || m === 'night') this.music('inspire', { fade: 2.5, vol: m === 'night' ? 0.35 : 0.45 });
    else if (m === 'grief') this.music('epic_medium', { fade: 2, vol: 0.45 });
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(m === 'battle' ? 0.03 : (m === 'night' ? 0.07 : 0.05), t, 1);
  }
  setFire(v) { if (this.ctx) this.fireGain.gain.setTargetAtTime(Math.min(0.12, v) * (0.6 + Math.random() * 0.4), this.ctx.currentTime, 0.1); }

  hit(p, k = 0.6) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    this.play('hit', { vol: (0.35 + 0.5 * k) * Math.max(0.25, this.near(p, 25)), rate: 0.92 + Math.random() * 0.16 });
    k *= 0.5;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(g, t, 0.005, 0.7 * k + 0.2, 0.2); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.3);
    const n = this.noise(), f = c.createBiquadFilter(), g2 = c.createGain(); f.type = 'lowpass'; f.frequency.value = 1400;
    this.env(g2, t, 0.002, 0.5 * k + 0.1, 0.12); n.connect(f); f.connect(g2); g2.connect(this.sfx); n.start(t); n.stop(t + 0.2);
  }
  clang(p, k = 0.6) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    [523, 1187, 1641, 2213, 3120].forEach((fr, i) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = fr * (0.98 + Math.random() * 0.04);
      this.env(g, t, 0.002, 0.18 * k / (i * 0.6 + 1), 0.5 + 0.4 / (i + 1)); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1.2);
    });
  }
  whoosh(p, k = 0.4) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    this.env(g, t, 0.06, 0.25 * k, 0.15); n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t); n.stop(t + 0.35);
  }
  thunder() {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
    this.env(g, t, 0.01, 0.9, 1.6); n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t); n.stop(t + 2);
    this.clang(null, 0.5);
  }
  boom(delay = 0) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(25, t + 2.5);
    this.env(g, t, 0.05, 1.0, 3); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 3.2);
    const n = this.noise(), f = c.createBiquadFilter(), g2 = c.createGain(); f.type = 'lowpass'; f.frequency.value = 400;
    this.env(g2, t, 0.05, 0.8, 3.5); n.connect(f); f.connect(g2); g2.connect(this.master); n.start(t); n.stop(t + 4);
  }
  rumble(dur = 3) {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur); f.Q.value = 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.3);
    n.connect(f); f.connect(g); g.connect(this.master); n.start(t); n.stop(t + dur + 0.4);
  }
  ui() {
    if (!this.on) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 660;
    this.env(g, t, 0.003, 0.06, 0.08); o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.12);
  }

  // plucked string (Karplus-Strong-ish via filtered noise burst into feedback delay)
  pluck(freq, t, k = 0.3) {
    const c = this.ctx;
    const n = this.noise(), g = c.createGain(), d = c.createDelay(), fb = c.createGain(), lp = c.createBiquadFilter(), out = c.createGain();
    d.delayTime.value = 1 / freq; fb.gain.value = 0.965; lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.gain.setValueAtTime(k, t); g.gain.setValueAtTime(0, t + 1 / freq * 1.2);
    n.connect(g); g.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
    out.gain.setValueAtTime(1, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    out.connect(this.mus); n.start(t); n.stop(t + 0.05);
    setTimeout(() => { try { fb.disconnect(); out.disconnect(); } catch (_) {} }, 3000 + (t - c.currentTime) * 1000);
  }

  // a sparse kopuz-like phrase over a drone; mood changes the scale and pace
  musicLoop() {
    const c = this.ctx;
    this.drone = c.createOscillator(); this.drone.type = 'sawtooth'; this.drone.frequency.value = 55;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    this.droneG = c.createGain(); this.droneG.gain.value = 0.12;
    this.drone.connect(lp); lp.connect(this.droneG); this.droneG.connect(this.mus); this.drone.start();
    const d5 = c.createOscillator(); d5.type = 'sawtooth'; d5.frequency.value = 82.4; d5.connect(lp); d5.start(); this.d5 = d5;
    const scales = { calm: [220, 247, 277, 330, 370, 440], night: [196, 220, 262, 294, 330, 392], battle: [220, 233, 277, 294, 330, 349], grief: [196, 220, 233, 294, 311, 392] };
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      if (this.track) { this.droneG.gain.setTargetAtTime(0, c.currentTime, 0.8); setTimeout(tick, 2000); return; }
      const m = this.mood || 'calm', sc = scales[m];
      const t = c.currentTime + 0.05;
      const pace = m === 'battle' ? 0.22 : 0.42;
      const pattern = m === 'battle' ? [0, 2, 1, 2, 0, 3, 2, 1] : [0, 3, 2, -1, 4, 2, 3, -1, 1, 2, 0, -1];
      for (let i = 0; i < 4; i++) {
        const idx = pattern[(step + i) % pattern.length];
        if (idx >= 0) this.pluck(sc[idx] * (m === 'battle' && i % 2 ? 0.5 : 1), t + i * pace, m === 'battle' ? 0.35 : 0.25);
      }
      step += 4;
      this.drone.frequency.setTargetAtTime(m === 'grief' ? 49 : 55, t, 0.5);
      this.droneG.gain.setTargetAtTime(m === 'battle' ? 0.16 : 0.1, t, 0.5);
      setTimeout(tick, pace * 4000 + (m === 'battle' ? 0 : 1600 + Math.random() * 1800));
    };
    setTimeout(tick, 800);
  }
}
