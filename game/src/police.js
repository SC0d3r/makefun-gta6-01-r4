// Police pass: wanted levels and pursuit frozen for the r7 entry.
// Wanted level 1–5, patrol and response units: PALM-1, VELA-4, SURF-7 and friends spawn
// off-screen, pursue and ram, deploy foot officers with pistols at two stars, throw a
// ROADBLOCK at four and put Air 1's SPOTLIGHT on the road. Thirty seconds out of sight decays it.

import { POLICE } from './config.js';
import { createVehicle, drivePhysics } from './vehicle.js';
import { seededRandom, clamp, dist2, damp } from './rng.js';
import { createAirUnit, updateAirUnit, retireAirUnit, airStatus } from './helicopter.js';
import { buildRoadblock, updateRoadblock, clearRoadblock } from './roadblock.js';

export class WantedSystem {
  constructor() {
    this.stars = 0;
    this.maxStars = POLICE.maxStars;
    this.inSight = false;
    this.evading = false;
    this.sightTimer = 0;
    this.searchRadius = 0;
    this.lastKnown = new THREE.Vector3();
    this.crimes = [];
  }

  setWantedLevel(n) {
    this.stars = clamp(Math.round(n), 0, this.maxStars);
    this.sightTimer = 0;
    this.evading = false;
    if (this.stars === 0) this.inSight = false;
  }

  addCrime(label, stars = 1) {
    this.setWantedLevel(Math.max(this.stars, Math.min(this.maxStars, stars)));
    this.crimes.push(label);
    if (this.crimes.length > 8) this.crimes.shift();
  }

  updateWanted(dt, playerPos, dispatch) {
    if (this.stars === 0) { this.inSight = false; this.evading = false; return; }
    const seen = dispatch ? dispatch.anyUnitSees(playerPos) : false;
    this.inSight = seen;
    if (seen) {
      this.sightTimer = 0;
      this.evading = false;
      this.lastKnown.set(playerPos.x, 0, playerPos.z);
    } else {
      this.sightTimer += dt;
      this.evading = true;
      if (this.sightTimer > POLICE.decay) {
        this.sightTimer = POLICE.decay - 6;
        this.stars = Math.max(0, this.stars - 1);
        if (this.stars === 0) { this.evading = false; this.sightTimer = 0; }
      }
    }
    this.searchRadius = this.evading ? 32 : POLICE.sightRange * 0.6;
  }

  starLabel() {
    if (this.stars === 0) return 'CLEAR';
    return this.evading ? 'EVADING' : 'IN SIGHT';
  }
}

export class PoliceDispatch {
  constructor(scene, world, seed = 7) {
    this.scene = scene;
    this.world = world;
    this.rng = seededRandom(seed + 17);
    this.units = [];
    this.footCops = [];
    this.helicopters = [];
    this.blockades = [];
    this.wanted = new WantedSystem();
    this.callsignIndex = 0;
    this.spawnTimer = 0;
    this.tracers = [];
    this.events = [];
    this.timeLike = 0;
  }

  emitEvent(text) {
    this.timeLike = performance.now() / 1000;
    this.events.push({ text, at: this.timeLike || 0 });
    if (this.events.length > 12) this.events.shift();
  }

  anyUnitSees(pos) {
    for (const u of this.units) {
      if (dist2(u.vehicle.pos.x, u.vehicle.pos.z, pos.x, pos.z) < POLICE.sightRange) return true;
    }
    for (const h of this.helicopters) if (dist2(h.group.position.x, h.group.position.z, pos.x, pos.z) < 120) return true;
    return false;
  }

  nextCallsign() {
    const s = POLICE.callSigns[this.callsignIndex % POLICE.callSigns.length];
    this.callsignIndex++;
    return s;
  }

  spawnResponse(playerPos, heading, count = 1, kind = 'cruiser') {
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const back = heading + Math.PI + this.rng.range(-0.5, 0.5);
      const dist = 55 + this.rng.range(0, 18);
      const x = clamp(playerPos.x + Math.sin(back) * dist + Math.cos(back) * i * 4, -300, 300);
      const z = clamp(playerPos.z + Math.cos(back) * dist - Math.sin(back) * i * 4, -270, 230);
      const vehicle = createVehicle(this.scene, 'police', x, z, back, {});
      vehicle.lightsOn = true;
      vehicle.steadyLights = true;
      const unit = {
        vehicle, callSign: this.nextCallsign(), unitType: kind === 'interceptor' ? 'Interceptor' : 'Cruiser',
        state: 'pursuit', health: 100, fireTimer: 0, targetPos: new THREE.Vector3(x, 0, z),
      };
      this.units.push(unit);
      this.scene.add(vehicle.group);
      spawned.push(unit);
    }
    return spawned;
  }

  dispatchResponse(stars, playerPos, heading) {
    this.wanted.setWantedLevel(stars);
    const wantUnits = clamp(stars, 1, 5);
    const alive = this.units.filter((u) => !u.dead && u.state !== 'roadblock').length;
    if (alive < wantUnits) this.spawnResponse(playerPos, heading, wantUnits - alive, stars >= 4 ? 'interceptor' : 'cruiser');
    if (stars >= 2 && this.footCops.length < stars) this.spawnFootCop(playerPos, stars);
    if (stars >= 3 && this.helicopters.length === 0) this.spawnHelicopter(playerPos);
    if (stars >= 5 && this.helicopters.length === 1) this.spawnHelicopter(playerPos);
    if (stars >= 4 && this.blockades.length === 0) this.roadblock(playerPos, heading);
  }

  spawnFootCop(playerPos, stars = 2) {
    const a = this.rng.range(0, Math.PI * 2);
    const x = playerPos.x + Math.cos(a) * 26;
    const z = playerPos.z + Math.sin(a) * 26;
    const g = new THREE.Group();
    const uniform = new THREE.MeshStandardMaterial({ color: 0x1d3b52, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.8, 0.32), uniform);
    body.position.y = 1.05; body.castShadow = true;
    g.add(body);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.26), new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.9 }));
    legs.position.y = 0.42;
    g.add(legs);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.29), new THREE.MeshStandardMaterial({ color: 0xb97c55 }));
    head.position.y = 1.6;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.32), new THREE.MeshStandardMaterial({ color: 0x101820 }));
    cap.position.y = 1.79;
    g.add(cap);
    g.position.set(x, 0.3, z);
    this.scene.add(g);
    this.footCops.push({
      group: g, pos: new THREE.Vector3(x, 0, z), health: 42, callSign: this.nextCallsign(),
      unitType: 'K-9 Unit', fireTimer: this.rng.range(0, 1), state: 'pursuit', heading: 0,
      body, legs, head, stars,
    });
  }

  spawnHelicopter(playerPos) {
    if (this.helicopters.length >= 2) return null;
    const index = this.helicopters.some((h) => h.index === 0) ? 1 : 0;
    const unit = createAirUnit(this.scene, playerPos, index, this.rng);
    this.helicopters.push(unit);
    this.emitEvent(`${unit.callSign} inbound`);
    return unit;
  }

  roadblock(playerPos, heading, distance = 34) {
    const block = buildRoadblock(this.scene, playerPos, heading, distance, this.rng, () => this.nextCallsign());
    for (const unit of block.units) this.units.push(unit);
    this.blockades.push(block);
    this.emitEvent('ROADBLOCK: 3 cruisers, spike strip');
    return block;
  }

  updateWanted(dt, player, wantedState) {
    this.wanted.updateWanted(dt, player.pos, this);
    this.updateUnits(dt, player);
    this.updateCops(dt, player);
    this.updateHelicopters(dt, player);
    this.updateRoadblocks(dt, player);
    for (const t of this.tracers) {
      t.life -= dt;
      t.mesh.material.opacity = clamp(t.life * 10, 0, 0.9);
    }
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); return false; }
      return true;
    });
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.dead) { this.scene.remove(u.vehicle.group); this.units.splice(i, 1); }
    }
    for (let i = this.footCops.length - 1; i >= 0; i--) {
      if (this.footCops[i].health <= 0) { this.scene.remove(this.footCops[i].group); this.footCops.splice(i, 1); }
    }
  }

  updateUnits(dt, player) {
    const targetCar = player.inVehicle;
    for (const u of this.units) {
      if (u.state === 'roadblock') { u.vehicle.steadyLights = true; u.vehicle.tickEffects(dt); continue; }
      if (u.dead) continue;
      const v = u.vehicle;
      const tx = player.pos.x, tz = player.pos.z;
      const d = dist2(v.pos.x, v.pos.z, tx, tz);
      const desired = Math.atan2(tx - v.pos.x, tz - v.pos.z);
      let diff = ((desired - v.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      u.state = d < 10 ? 'ramming' : 'pursuit';
      if (this.wanted.evading) u.state = 'searching';
      const steer = clamp(diff * 2.1, -1, 1);
      const throttle = this.wanted.evading ? 0.5 : d > 14 ? 1 : 0.5;
      v.controls = { throttle, brake: d < 6 && !this.wanted.evading, steer, handbrake: false };
      v.lightsOn = true;
      v.update(dt, { colliders: this.world.colliders, bounds: this.world.bounds, onCrash: () => { v.damage(3); } });
      if (targetCar && d < 5.5 && Math.abs(v.speed) > 8) {
        targetCar.damage(dt * 22);
        v.damage(dt * 12);
        player.shake = 0.2;
      }
      if (!targetCar && d < 4) {
        u.state = 'ramming';
      }
      u.targetPos.set(tx, 0, tz);
    }
  }

  updateCops(dt, player) {
    for (const cop of this.footCops) {
      const d = dist2(cop.pos.x, cop.pos.z, player.pos.x, player.pos.z);
      const desired = Math.atan2(player.pos.x - cop.pos.x, player.pos.z - cop.pos.z);
      cop.heading = damp(cop.heading, desired, 6, dt);
      cop.group.rotation.y = cop.heading;
      if (d > 6) {
        const sp = 2.1 * dt;
        cop.pos.x += Math.sin(cop.heading) * sp;
        cop.pos.z += Math.cos(cop.heading) * sp;
        cop.legs.rotation.x = Math.sin(performance.now() * 0.008) * 0.5;
      } else cop.legs.rotation.x = 0;
      cop.group.position.set(cop.pos.x, 0.3, cop.pos.z);
      cop.fireTimer -= dt;
      if (d < 28 && cop.fireTimer <= 0 && !player.dead) {
        cop.fireTimer = 1.1 + Math.random() * 0.7;
        const from = new THREE.Vector3(cop.pos.x, 1.4, cop.pos.z);
        const to = new THREE.Vector3(player.pos.x + (Math.random() - 0.5) * 1.2, player.pos.y + 1.1, player.pos.z + (Math.random() - 0.5) * 1.2);
        this.addTracer(from, to, 0xffd38a);
        if (Math.random() < 0.62) player.takeDamage(7 + Math.random() * 9);
      }
    }
  }

  updateHelicopters(dt, player) {
    for (const h of this.helicopters) {
      if (this.wanted.stars < 3 && h.retireStars === undefined) h.retireStars = this.wanted.stars;
      const event = updateAirUnit(h, dt, player, this.wanted, this.world);
      if (event) this.emitEvent(event);
    }
    for (let i = this.helicopters.length - 1; i >= 0; i--) {
      const h = this.helicopters[i];
      if (this.wanted.stars < 3 || h.gone) {
        retireAirUnit(this.scene, h);
        this.helicopters.splice(i, 1);
      }
    }
  }

  updateRoadblocks(dt, player) {
    for (const block of this.blockades) {
      const event = updateRoadblock(block, dt, player, this.wanted, this);
      if (event) this.emitEvent(event);
    }
    for (let i = this.blockades.length - 1; i >= 0; i--) {
      const block = this.blockades[i];
      if (!block.done) continue;
      for (const unit of block.units) {
        const idx = this.units.indexOf(unit);
        if (idx >= 0) this.units.splice(idx, 1);
      }
      clearRoadblock(this.scene, block);
      this.blockades.splice(i, 1);
    }
  }

  addTracer(from, to, color) {
    const len = from.distanceTo(to);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.12 });
  }

  damageAt(pos, radius = 3, amount = 45) {
    for (const u of this.units) {
      if (u.dead) continue;
      if (dist2(u.vehicle.pos.x, u.vehicle.pos.z, pos.x, pos.z) < radius + 1.5) {
        u.vehicle.damage(amount);
        if (u.vehicle.health <= 0) { u.dead = true; this.wanted.addCrime('wrecked cruiser', 2); }
      }
    }
    for (const cop of this.footCops) {
      if (dist2(cop.pos.x, cop.pos.z, pos.x, pos.z) < radius) {
        cop.health -= amount;
        this.scene.add(cop.group);
      }
    }
  }

  responseRows(playerPos) {
    const rows = [];
    for (const u of this.units) {
      if (u.dead) continue;
      const d = dist2(u.vehicle.pos.x, u.vehicle.pos.z, playerPos.x, playerPos.z);
      rows.push({
        callSign: u.callSign, unitType: u.unitType, distance: d,
        verb: u.state === 'roadblock' ? (u.block?.breached ? 'BREACHED' : 'ROADBLOCK') : u.state === 'ramming' ? 'RAMMING' : this.wanted.evading ? 'SEARCHING' : 'PURSUIT',
      });
    }
    for (const cop of this.footCops) {
      rows.push({ callSign: cop.callSign, unitType: cop.unitType, distance: dist2(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z), verb: this.wanted.evading ? 'SEARCHING' : 'PURSUIT' });
    }
    for (const h of this.helicopters) {
      const status = airStatus(h, this.wanted);
      const verb = status.startsWith(h.callSign) ? status.slice(h.callSign.length).trim() : status;
      rows.push({ callSign: h.callSign, unitType: h.unitType, distance: dist2(h.group.position.x, h.group.position.z, playerPos.x, playerPos.z), verb: verb || 'SPOTLIGHT' });
    }
    rows.sort((a, b) => a.distance - b.distance);
    return rows.slice(0, 5);
  }
}

export function setWantedLevel(dispatch, n, playerPos, heading) {
  dispatch.wanted.setWantedLevel(n);
  if (n > 0) dispatch.dispatchResponse(n, playerPos, heading);
}

export function updateWanted(dispatch, dt, player, wantedState) {
  dispatch.updateWanted(dt, player, wantedState);
}

export function spawnResponse(dispatch, playerPos, heading, count, kind) {
  return dispatch.spawnResponse(playerPos, heading, count, kind);
}

export function roadblock(dispatch, playerPos, heading, distance) {
  return dispatch.roadblock(playerPos, heading, distance);
}

