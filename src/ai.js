// Behaviours for everyone who is not the player.
import * as THREE from 'three';

const V = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export function nearest(G, from, pred, maxD = 999) {
  let best = null, bd = maxD;
  for (const a of G.actors) { if (a === from || !pred(a)) continue; const d = from.distTo(a); if (d < bd) { bd = d; best = a; } }
  return best;
}

// Hisar soldier / captain
export function soldierBrain(G, a, opts = {}) {
  a.cool = rnd(0.6, 1.6); a.state = 'approach'; a.retarget = 0; a.circleDir = Math.random() < 0.5 ? 1 : -1;
  a.engaged = false;
  const reach = opts.reach || 1.9;
  return dt => {
    if (a.dead) { if (a.engaged) { a.engaged = false; } return; }
    a.retarget -= dt; a.cool -= dt;
    if (!a.target || !a.target.alive || a.retarget <= 0) {
      a.retarget = rnd(1, 2);
      const p = G.player;
      const ally = nearest(G, a, o => o.alive && o.team === 'oba' && o !== p && o.fighter, 9);
      a.target = (p && p.alive && (!ally || Math.random() < 0.7 || a.distTo(p) < a.distTo(ally) + 2)) ? p : (ally || p);
    }
    const t = a.target; if (!t) return;
    const d = a.distTo(t);
    a.pose.guard = true;
    // only two soldiers press the player at once; the rest circle and wait
    if (t === G.player) {
      const engaged = G.actors.filter(o => o.engaged && o.alive && o.target === G.player).length;
      if (!a.engaged && engaged < (opts.boss ? 3 : 2) && d < 7) a.engaged = true;
    } else a.engaged = true;
    if (a.state === 'windup') {
      a.faceTo(t, dt, 8);
      a.move(V.set(0, 0, 0), 0, dt);
      a.windT -= dt; a.telegraph = 0.45 * (1 - a.windT / a.windDur);
      if (a.windT <= 0) { a.telegraph = 0; a.startAttack(a.nextType); a.state = 'swing'; }
      return;
    }
    if (a.state === 'swing') {
      a.move(V.set(0, 0, 0), 0, dt);
      if (a.attack < 0) { a.state = 'approach'; a.cool = opts.boss ? rnd(0.8, 1.6) : rnd(1.6, 2.9); if (Math.random() < 0.4) { a.state = 'back'; a.backT = 0.6; } }
      return;
    }
    if (a.state === 'back') {
      a.backT -= dt;
      V.set(a.pos.x - t.pos.x, 0, a.pos.z - t.pos.z).normalize();
      a.move(V, 2.2, dt); a.faceTo(t, dt);
      if (a.backT <= 0) a.state = 'approach';
      return;
    }
    if (a.hitT > 0.4) { a.move(V.set(0, 0, 0), 0, dt); return; }
    // the captain raises his guard when the player swings at him
    if (opts.boss) a.blocking = !!(G.player.attack >= 0 && G.player.attack < 0.4 && d < 3 && Math.random() < 0.6 && a.cool > 0.2) || (a.blocking && G.player.attack >= 0);
    const want = a.engaged ? reach * 0.85 : 4.5;
    if (d > want + 0.4) {
      V.set(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize();
      // drift sideways to surround
      if (!a.engaged) V.add(new THREE.Vector3(-V.z, 0, V.x).multiplyScalar(0.6 * a.circleDir)).normalize();
      a.move(V, d > 8 ? 4.4 : 3.0, dt);
    } else if (!a.engaged) {
      V.set(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize();
      a.move(new THREE.Vector3(-V.z, 0, V.x).multiplyScalar(a.circleDir), 1.4, dt);
      if (Math.random() < dt * 0.3) a.circleDir *= -1;
    } else {
      a.move(V.set(0, 0, 0), 0, dt);
    }
    a.faceTo(t, dt, 6);
    if (a.engaged && d < reach + 0.3 && a.cool <= 0 && a.attack < 0) {
      a.state = 'windup';
      a.windDur = a.windT = opts.boss ? rnd(0.45, 0.7) : rnd(0.55, 0.8);
      a.nextType = opts.boss ? (Math.random() < 0.45 ? 2 : (Math.random() < 0.5 ? 1 : 0)) : (Math.random() < 0.25 ? 2 : 0);
      a.blocking = false;
    }
  };
}

// villagers and Kaçın fighting alongside the player
export function allyBrain(G, a) {
  a.cool = rnd(0.5, 1.5); a.fighter = true;
  return dt => {
    if (a.dead) return;
    a.cool -= dt;
    a.hp = Math.min(a.maxHp, a.hp + dt * 3);
    const t = nearest(G, a, o => o.alive && o.team === 'hisar', 30);
    a.pose.guard = true;
    if (!t) { a.move(V.set(0, 0, 0), 0, dt); if (a.home) { const d = a.distTo(a.home); if (d > 1.5) { V.set(a.home.x - a.pos.x, 0, a.home.z - a.pos.z).normalize(); a.move(V, 3, dt); a.faceTo(a.home, dt); } } return; }
    const d = a.distTo(t);
    if (a.hitT > 0.4) { a.move(V.set(0, 0, 0), 0, dt); return; }
    if (d > 1.7) { V.set(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize(); a.move(V, d > 6 ? 4.6 : 3.2, dt); }
    else a.move(V.set(0, 0, 0), 0, dt);
    a.faceTo(t, dt, 7);
    if (d < 2.1 && a.cool <= 0 && a.attack < 0) { a.startAttack(Math.random() < 0.3 ? 1 : 0); a.cool = rnd(1.4, 2.6); }
  };
}

// Kaçın during practice: telegraphs clearly, never hurts much
export function sparBrain(G, a) {
  a.cool = 1.5; a.state = 'idle';
  return dt => {
    const p = G.player; if (!p) return;
    const d = a.distTo(p);
    a.cool -= dt; a.pose.guard = true;
    if (a.state === 'windup') {
      a.faceTo(p, dt, 8); a.move(V.set(0, 0, 0), 0, dt);
      a.windT -= dt; a.telegraph = 0.5 * (1 - a.windT / 0.8);
      if (a.windT <= 0) { a.telegraph = 0; a.startAttack(0); a.state = 'swing'; }
      return;
    }
    if (a.state === 'swing') { a.move(V.set(0, 0, 0), 0, dt); if (a.attack < 0) { a.state = 'idle'; a.cool = rnd(1.6, 2.8); } return; }
    if (a.hitT > 0.4) { a.move(V.set(0, 0, 0), 0, dt); return; }
    a.blocking = p.attack >= 0 && p.attack < 0.3 && d < 3 && Math.random() < 0.02 ? true : (a.blocking && p.attack >= 0 && Math.random() < 0.97);
    if (d > 2.2) { V.set(p.pos.x - a.pos.x, 0, p.pos.z - a.pos.z).normalize(); a.move(V, 2.6, dt); }
    else if (d < 1.3) { V.set(a.pos.x - p.pos.x, 0, a.pos.z - p.pos.z).normalize(); a.move(V, 2, dt); }
    else { V.set(p.pos.x - a.pos.x, 0, p.pos.z - a.pos.z).normalize(); a.move(new THREE.Vector3(-V.z, 0, V.x), 1.1, dt); }
    a.faceTo(p, dt, 6);
    if (d < 2.4 && a.cool <= 0) { a.state = 'windup'; a.windT = 0.8; a.blocking = false; }
  };
}

// stand at a spot, optionally facing something and fidgeting
export function idleBrain(G, a, spot, faceTo) {
  return dt => {
    if (a.dead) return;
    const d = a.distTo(spot);
    if (d > 0.4) { V.set(spot.x - a.pos.x, 0, spot.z - a.pos.z).normalize(); a.move(V, d > 4 ? 3.5 : 1.6, dt); a.faceTo(spot, dt); }
    else { a.move(V.set(0, 0, 0), 0, dt); if (faceTo) a.faceTo(faceTo.pos || faceTo, dt, 3); }
  };
}

// wander between a few points with pauses
export function wanderBrain(G, a, points) {
  let i = Math.floor(Math.random() * points.length), wait = rnd(0, 4);
  return dt => {
    if (a.dead) return;
    const p = points[i];
    const d = a.distTo(p);
    if (wait > 0) { wait -= dt; a.move(V.set(0, 0, 0), 0, dt); return; }
    if (d < 0.6) { wait = rnd(2, 7); i = (i + 1 + Math.floor(Math.random() * (points.length - 1))) % points.length; return; }
    V.set(p.x - a.pos.x, 0, p.z - a.pos.z).normalize(); a.move(V, 1.5, dt); a.faceTo(p, dt, 5);
  };
}

// Bars at the anvil: slow heavy strikes with sparks
export function smithBrain(G, a, anvil) {
  let t = 1;
  return dt => {
    if (a.dead) return;
    a.move(V.set(0, 0, 0), 0, dt);
    a.faceTo(anvil, dt, 4);
    t -= dt;
    if (t <= 0 && a.attack < 0) { a.startAttack(2); a.atkSlow = 1.4; a.smithing = true; t = rnd(1.6, 2.4); a.smithHit = false; }
    if (a.attack > 0.55 && !a.smithHit) {
      a.smithHit = true;
      const p = anvil.clone(); p.y = 1.05;
      G.fx.sparks(p, 18, 0xffc46b, 4, 0.08);
      G.audio && G.audio.anvil(p, 0.7);
    }
  };
}

// run away to a point and disappear
export function fleeBrain(G, a, to) {
  return dt => {
    if (a.dead) return;
    const d = a.distTo(to);
    V.set(to.x - a.pos.x, 0, to.z - a.pos.z).normalize(); a.move(V, 5.2, dt); a.faceTo(to, dt, 8);
    if (d < 1.5) a.gone = true;
  };
}

// Tomris: keeps her distance and shoots arrows; follows Alp when the fight is over
export function archerBrain(G, a) {
  a.cool = 1.2; a.fighter = true; a.drawT = 0;
  return dt => {
    if (a.dead) return;
    a.cool -= dt;
    a.hp = Math.min(a.maxHp, a.hp + dt * 4);
    const t = nearest(G, a, o => o.alive && o.team === 'hisar', 32);
    if (!t) {
      a.pose.aim = Math.max(0, (a.pose.aim || 0) - dt * 3);
      const p = G.player, d = a.distTo(p);
      const goal = a.home || p.pos;
      const dg = a.distTo(goal);
      if (a.home ? dg > 1 : d > 4.5) { V.set(goal.x - a.pos.x, 0, goal.z - a.pos.z).normalize(); a.move(V, (a.home ? dg : d) > 10 ? 5 : 3, dt); a.faceTo(goal, dt); }
      else { a.move(V.set(0, 0, 0), 0, dt); a.faceTo(p, dt, 3); }
      return;
    }
    const d = a.distTo(t);
    if (a.drawT > 0) {                       // drawing: stand, aim, release
      a.move(V.set(0, 0, 0), 0, dt); a.faceTo(t, dt, 10);
      a.yaw += 0.45; a.yaw -= 0.45;
      a.drawT -= dt; a.pose.aim = Math.min(1, (a.pose.aim || 0) + dt * 3);
      if (a.drawT <= 0) {
        const from = a.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(a.forward(), 0.5);
        const lead = t.vel.clone().multiplyScalar(d / 38);
        G.shootArrow(from, t.pos.clone().add(lead).add(new THREE.Vector3(0, 1.2, 0)), 16, 'oba');
        a.cool = rnd(1.4, 2.4);
      }
      return;
    }
    a.pose.aim = Math.max(0, (a.pose.aim || 0) - dt * 2.5);
    if (d < 7) { V.set(a.pos.x - t.pos.x, 0, a.pos.z - t.pos.z).normalize(); a.move(V, 3.6, dt); }
    else if (d > 22) { V.set(t.pos.x - a.pos.x, 0, t.pos.z - a.pos.z).normalize(); a.move(V, 4, dt); }
    else a.move(V.set(0, 0, 0), 0, dt);
    a.faceTo(t, dt, 6);
    if (a.cool <= 0 && d <= 24) a.drawT = 0.75;
  };
}

// rides alongside the player when he rides, walks with `base` when he walks
export function companionBrain(G, a, horse, base) {
  return dt => {
    if (a.dead) return;
    const p = G.player;
    if (p.mount) {
      if (!a.mount) {
        if (horse.distTo(a) > 4) { horse.pos.copy(a.pos).add(new THREE.Vector3(1.5, 0, 0)); }
        a.mount = horse; horse.rider = a; a.solid = false; a.pose.aim = 0;
      }
      const ph = p.mount, f = ph.forward(), left = new THREE.Vector3(f.z, 0, -f.x);
      const goal = ph.pos.clone().addScaledVector(f, -3.2).addScaledVector(left, 2.6);
      const d = horse.distTo(goal);
      let ang = Math.atan2(goal.x - horse.pos.x, goal.z - horse.pos.z) - horse.yaw; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (d < 1.5) { let m = ph.yaw - horse.yaw; m = Math.atan2(Math.sin(m), Math.cos(m)); horse.drive(Math.abs(ph.speed) > 6 ? 2 : Math.abs(ph.speed) > 0.5 ? 1 : 0, Math.max(-1, Math.min(1, m * 2)), dt); }
      else horse.drive(d > 9 || Math.abs(ph.speed) > 6 ? 2 : 1, Math.max(-1, Math.min(1, ang * 2)), dt);
    } else if (a.mount) {
      horse.drive(0, 0, dt);
      if (Math.abs(horse.speed) < 1.2) {
        a.mount = null; horse.rider = null; a.solid = true;
        a.pos.set(horse.pos.x + Math.cos(horse.yaw) * 1.3, 0, horse.pos.z - Math.sin(horse.yaw) * 1.3); a.model.position.y = 0;
      }
    } else base(dt);
  };
}

// a guard who can be crept up on; anything suspicious raises the alarm
export function guardBrain(G, a, spot, look, asleep) {
  a.asleep = !!asleep;
  if (asleep) a.pose.kneel = 1;
  return dt => {
    if (a.dead) return;
    if (G.alarm) { a.pose.kneel = 0; a.asleep = false; a.brain = soldierBrain(G, a); return; }
    const p = G.player, d = a.distTo(p);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (a.asleep) {
      a.move(V.set(0, 0, 0), 0, dt);
      if (d < 1.4 && sp > 4.5) G.raiseAlarm(a);
      return;
    }
    // slow look-around
    a.lookT = (a.lookT || 0) + dt;
    const yaw0 = Math.atan2(look.x - spot.x, look.z - spot.z) + Math.sin(a.lookT * 0.6) * 0.9;
    let dy = yaw0 - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * 2);
    a.move(V.set(0, 0, 0), 0, dt);
    let ang = a.angleTo(p) - a.yaw; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    const seen = (d < 8 && Math.abs(ang) < 1.0) || (d < 4.5 && sp > 4.5) || (d < 1.2 && Math.abs(ang) < 1.6);
    a.telegraph = seen ? 0.3 : (d < 10 && Math.abs(ang) < 1.2 ? 0.08 : 0);
    if (seen) { a.suspicion = (a.suspicion || 0) + dt * (d < 4 ? 3 : 1.5); if (a.suspicion > 0.8) G.raiseAlarm(a); }
    else a.suspicion = Math.max(0, (a.suspicion || 0) - dt * 0.5);
  };
}
