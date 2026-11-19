// Mission pass: story state machine frozen for the r7 entry.
// Marker pass: mission staging and marker frozen from the frame fix.
// The story: Courier Run, Hot Pursuit and Marina Heist as a real mission state machine with
// world markers, staged objectives, timers, dialogue with named speakers, fail and retry,
// cash rewards and unlocks. Marisol, Nico and Rico carry the chapter cards.

import { MISSION_DEFS } from './config.js';
import { seededRandom, dist2, clamp } from './rng.js';
import { createVehicle } from './vehicle.js';

export const storyMissions = MISSION_DEFS;

export function missionById(id) {
  return storyMissions.find((m) => m.id === id) || null;
}

export const stagePositions = {
  'courier-run': [{ x: -132, z: 236 }, { x: 30, z: 96 }, { x: -28, z: 96 }],
  'hot-pursuit': [{ x: -60, z: 196 }, { x: -160, z: 196 }, { x: -240, z: 160 }],
  'marina-heist': [{ x: -118, z: 254 }, { x: -95, z: 262 }, { x: -72, z: 254 }],
};

export class MissionRunner {
  constructor(scene, economy, hooks = {}) {
    this.scene = scene;
    this.economy = economy;
    this.hooks = hooks;
    this.rng = seededRandom(23);
    this.missions = storyMissions;
    this.active = null;
    this.state = 'idle';
    this.stage = 0;
    this.timer = 0;
    this.retryCount = 0;
    this.marker = null;
    this.markerGroup = null;
    this.props = [];
    this.crates = [];
    this.target = null;
    this.currentLine = null;
    this.lastResult = null;
    this.resultTimer = 0;
    this.startedAt = 0;
  }

  availableMissions() {
    return this.missions.filter((m) => !this.economy.isComplete(m.id) && this.economy.isUnlocked(m.id));
  }

  nearestAvailable(player) {
    let best = null;
    for (const m of this.availableMissions()) {
      const p = stagePositions[m.id]?.[0] || m.marker;
      const d = dist2(player.pos.x, player.pos.z, p.x, p.z);
      if (!best || d < best.d) best = { mission: m, d, pos: p };
    }
    return best;
  }

  beginMission(id, player, opts = {}) {
    const def = missionById(id);
    if (!def) return null;
    this.clearProps();
    this.active = def;
    this.state = 'active';
    this.stage = opts.stage || 0;
    this.timer = opts.timer ?? def.timeLimit;
    this.startedAt = 0;
    this.lastResult = null;
    this.setMarker(this.posFor(def, this.stage));
    this.currentLine = opts.line || { speaker: def.dialogue[0].speaker, text: def.dialogue[0].text };
    if (def.id === 'courier-run') {
      this.spawnParcel(this.posFor(def, 0));
    } else if (def.id === 'marina-heist') {
      this.spawnCrates(def);
    } else if (def.id === 'hot-pursuit') {
      this.spawnTarget(player, opts);
    }
    if (opts.wanted) this.hooks.setWanted?.(opts.wanted, player);
    this.hooks.onBegin?.(def);
    return def;
  }

  posFor(def, stage) {
    const list = stagePositions[def.id];
    return list?.[Math.min(stage, list.length - 1)] || def.marker;
  }

  spawnParcel(pos) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), new THREE.MeshStandardMaterial({ color: 0xffc35c, roughness: 0.6, emissive: 0x5a3a00 }));
    box.position.y = 1.1;
    g.add(box);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.1, 0.75), new THREE.MeshBasicMaterial({ color: 0xe8735a }));
    stripe.position.y = 1.1;
    g.add(stripe);
    g.position.set(pos.x, 0.3, pos.z);
    this.scene.add(g);
    this.props.push(g);
  }

  spawnCrates(def) {
    const positions = stagePositions[def.id];
    this.crates = [];
    positions.forEach((p, i) => {
      const g = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.5), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x2f7f86 : 0xb98a5a, roughness: 0.8 }));
      crate.position.y = 1.05;
      crate.castShadow = true;
      g.add(crate);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.12, 1.56), new THREE.MeshBasicMaterial({ color: 0x39e6e0 }));
      band.position.y = 1.18;
      g.add(band);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x39e6e0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.y = 3;
      g.add(glow);
      g.position.set(p.x, 0.6, p.z);
      this.scene.add(g);
      this.props.push(g);
      this.crates.push({ group: g, x: p.x, z: p.z, taken: false });
    });
  }

  spawnTarget(player, opts = {}) {
    const x = opts.targetX ?? -44;
    const z = opts.targetZ ?? 196;
    const car = createVehicle(this.scene, 'coupe', x, z, -Math.PI / 2, {});
    car.spec = { ...car.spec, body: 0x22262b, label: 'Talbot GT' };
    car.name = 'Talbot GT';
    car.health = 110;
    car.maxHealth = 110;
    car.targetAI = { waypoint: 0, route: [{ x: -140, z: 196 }, { x: -250, z: 196 }, { x: -300, z: 150 }, { x: -300, z: 40 }] };
    this.target = car;
    this.props.push(car);
  }

  setMarker(pos) {
    if (this.markerGroup) { this.scene.remove(this.markerGroup); this.markerGroup = null; }
    this.marker = { x: pos.x, z: pos.z };
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.16, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffc35c, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.35;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 6.5, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc35c, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 3.5;
    g.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
    gem.position.y = 3.2;
    g.add(gem);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    this.markerGroup = g;
    this.markerGem = gem;
  }

  markCrateColliders(city) {
    this.crates.forEach((c) => city.colliders.push({ minX: c.x - 1, maxX: c.x + 1, minZ: c.z - 1, maxZ: c.z + 1, height: 2, kind: 'crate' }));
  }

  advanceStage(player) {
    if (!this.active || this.state !== 'active') return;
    this.stage++;
    const def = this.active;
    if (this.stage >= def.stages.length) { this.completeMission(player); return; }
    if (def.id === 'marina-heist') {
      const c = this.crates[this.stage - 1];
      if (c) { c.taken = true; c.group.visible = false; }
    }
    const pos = this.posFor(def, this.stage);
    this.setMarker(pos);
    this.currentLine = { speaker: def.dialogue[Math.min(this.stage, def.dialogue.length - 1)].speaker, text: def.stages[this.stage] };
    this.hooks.onStage?.(def, this.stage);
  }

  completeMission(player) {
    if (!this.active) return;
    const def = this.active;
    this.state = 'complete';
    this.lastResult = { ok: true, text: `${def.title} complete`, reward: def.reward };
    this.economy.addCash(def.reward, def.title);
    this.economy.completeMission(def.id);
    if (def.unlock) this.economy.unlockMission(def.unlock);
    this.economy.saveGame({ mission: def.id });
    this.clearProps();
    if (this.markerGroup) { this.scene.remove(this.markerGroup); this.markerGroup = null; }
    this.hooks.onComplete?.(def, def.reward);
    this.resultTimer = 5;
  }

  failMission(reason = 'The run went cold.') {
    if (!this.active) return;
    const def = this.active;
    this.state = 'failed';
    this.lastResult = { ok: false, text: reason, reward: 0 };
    this.resultTimer = 6;
    this.hooks.onFail?.(def, reason);
    this.clearProps();
    this.retryCount++;
  }

  retry(player) {
    if (!this.active) return;
    const id = this.active.id;
    this.beginMission(id, player);
  }

  clearProps() {
    for (const p of this.props) {
      if (p && p.group && p.group.parent) p.group.parent.remove(p.group);
      else if (p && p.parent) p.parent.remove(p);
    }
    if (this.target?.group?.parent) this.target.group.parent.remove(this.target.group);
    this.props = [];
    this.crates = [];
    this.target = null;
  }

  card() {
    if (!this.active) return null;
    const def = this.active;
    return {
      chapter: def.chapter, title: def.title, objective: def.objective, stages: def.stages,
      stage: Math.min(this.stage + 1, def.stages.length), total: def.stages.length,
      stageText: def.stages[Math.min(this.stage, def.stages.length - 1)],
      timer: Math.max(0, this.timer), state: this.state, result: this.lastResult,
    };
  }

  updateMission(dt, player, playerVehicle, police) {
    if (!this.active) return;
    if (this.state === 'complete' || this.state === 'failed') {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.active = null;
        this.state = 'idle';
        this.currentLine = null;
        this.lastResult = null;
        if (this.markerGroup) { this.scene.remove(this.markerGroup); this.markerGroup = null; }
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) { this.failMission('Time ran out. The syndicate is not patient.'); return; }
    if (this.markerGem) {
      this.markerGem.rotation.y += dt * 2;
      this.markerGem.position.y = 3.2 + Math.sin(performance.now() * 0.002) * 0.25;
    }
    const def = this.active;
    const p = this.posFor(def, this.stage);
    if (def.id === 'courier-run') {
      if (dist2(player.pos.x, player.pos.z, p.x, p.z) < 4.2) {
        this.advanceStage(player);
      }
    } else if (def.id === 'marina-heist') {
      const c = this.crates[this.stage];
      if (c && !c.taken && dist2(player.pos.x, player.pos.z, c.x, c.z) < 3.2) {
        c.taken = true;
        c.group.visible = false;
        this.advanceStage(player);
        this.hooks.alarm?.(player, 2);
      }
    } else if (def.id === 'hot-pursuit') {
      if (!this.target) return;
      const car = this.target;
      const route = car.targetAI.route;
      const wp = route[car.targetAI.waypoint % route.length];
      const d = dist2(car.pos.x, car.pos.z, wp.x, wp.z);
      if (d < 14) car.targetAI.waypoint++;
      const desired = Math.atan2(wp.x - car.pos.x, wp.z - car.pos.z);
      let diff = ((desired - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      car.controls = { throttle: 0.9, brake: false, steer: clamp(diff * 2, -1, 1), handbrake: false };
      car.update(dt, { colliders: [], bounds: this.hooks.bounds, onCrash: () => car.damage(6) });
      if (playerVehicle) {
        const gap = dist2(playerVehicle.pos.x, playerVehicle.pos.z, car.pos.x, car.pos.z);
        if (gap < 5.5 && Math.abs(playerVehicle.speed) > 4) {
          car.damage(dt * 26);
          playerVehicle.damage(dt * 4);
          if (Math.random() < dt * 4) { car.puffSmoke(); playerVehicle.puffSmoke(); }
          if (this.stage === 0) {
            this.stage = 1;
            this.timer = Math.max(this.timer, 80);
            this.currentLine = { speaker: 'NICO', text: 'That was the first hit. Keep him off the boulevard!' };
          }
        }
      }
      if (car.health <= 25 && this.stage < 2) {
        this.stage = 2;
        car.speed = 0;
        car.wrecked = true;
        this.setMarker(stagePositions['hot-pursuit'][2]);
        this.currentLine = { speaker: 'MARISOL', text: 'He is stalled. Lose the stars and get to the safehouse.' };
      }
      if (this.stage === 2 && this.wantedClear && dist2(player.pos.x, player.pos.z, stagePositions['hot-pursuit'][2].x, stagePositions['hot-pursuit'][2].z) < 8) {
        this.completeMission(player);
      }
      if (this.stage === 0 && dist2(player.pos.x, player.pos.z, car.pos.x, car.pos.z) < 42) {
        this.stage = 1;
        this.setMarker({ x: car.pos.x, z: car.pos.z });
        this.currentLine = { speaker: 'NICO', text: 'There he is. Put the Talbot into the seawall.' };
      }
      if (this.marker) {
        this.marker.x = car.pos.x;
        this.marker.z = car.pos.z;
      }
    }
  }

  tick(dt) {
    if (this.currentLine) {
      this.lineTimer = (this.lineTimer || 0) + dt;
      if (this.lineTimer > 7) { this.lineTimer = 0; }
    }
    if (!this.active && this.resultTimer > 0) this.resultTimer -= dt;
  }
}

export function beginMission(runner, id, player, opts) {
  return runner.beginMission(id, player, opts);
}

export function updateMission(runner, dt, player, vehicle, police) {
  if (police) runner.wantedClear = police.wanted.stars === 0;
  runner.updateMission(dt, player, vehicle, police);
}

export function completeMission(runner, player) {
  runner.completeMission(player);
}

export function failMission(runner, reason) {
  runner.failMission(reason);
}
