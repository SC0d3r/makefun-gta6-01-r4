// Wanted level 1–5, patrol and response units: PALM-1, VELA-4, SURF-7 and friends spawn
// off-screen, pursue and ram, deploy foot officers with pistols at two stars, throw a
// ROADBLOCK at four and put Air 1's SPOTLIGHT on the road. Thirty seconds out of sight decays it.

import { POLICE } from './config.js';
import { createVehicle, drivePhysics } from './vehicle.js';
import { seededRandom, clamp, dist2, damp } from './rng.js';

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
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 5.2), new THREE.MeshStandardMaterial({ color: 0x14555f, roughness: 0.5, metalness: 0.3 }));
    hull.position.y = 0;
    g.add(hull);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 1.3), new THREE.MeshStandardMaterial({ color: 0x8fd8de, metalness: 0.7, roughness: 0.15 }));
    glass.position.set(0, 0.35, 2.1);
    g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 4.4), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.6 }));
    tail.position.set(0, 0.25, -4.2);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: 0x23272b }));
    rotor.position.y = 1.05;
    g.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x23272b }));
    tailRotor.position.set(0, 0.3, -6.3);
    g.add(tailRotor);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamSprite(), color: 0xffe0a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    light.scale.set(1.4, 1.4, 1);
    light.position.y = -0.9;
    g.add(light);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6.5, 28, 14, 1, true), beamMat);
    this.scene.add(beam);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(7.5, 20), new THREE.MeshBasicMaterial({ color: 0xffe7b0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    spot.rotation.x = -Math.PI / 2;
    this.scene.add(spot);
    g.position.set(playerPos.x + 55, 30, playerPos.z - 20);
    this.scene.add(g);
    this.helicopters.push({ group: g, rotor, tailRotor, beam, spot, callSign: 'AIR-1', unitType: 'Air 1', state: 'spotlight', target: new THREE.Vector3(), orbit: 0 });
  }

  roadblock(playerPos, heading, distance = 34) {
    const baseX = clamp(playerPos.x + Math.sin(heading) * distance, -290, 290);
    const baseZ = clamp(playerPos.z + Math.cos(heading) * distance, -260, 220);
    const right = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const block = { x: baseX, z: baseZ, heading, units: [], barriers: [] };
    for (let i = -1; i <= 1; i++) {
      const v = createVehicle(this.scene, 'police', baseX + right.x * i * 6.4, baseZ + right.z * i * 6.4, heading + Math.PI / 2, {});
      v.lightsOn = true;
      v.steadyLights = true;
      const unit = { vehicle: v, callSign: this.nextCallsign(), unitType: 'Roadblock', state: 'roadblock', health: 130, targetPos: new THREE.Vector3(baseX, 0, baseZ) };
      this.units.push(unit);
      block.units.push(unit);
      this.scene.add(v.group);
    }
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf4ead6 : 0xe8735a, roughness: 0.7 }));
      bar.position.set(baseX + right.x * i * 3.2, 1.0, baseZ + right.z * i * 3.2);
      bar.rotation.y = heading + Math.PI / 2;
      this.scene.add(bar);
      block.barriers.push(bar);
    }
    this.blockades.push(block);
    return block;
  }

  updateWanted(dt, player, wantedState) {
    this.wanted.updateWanted(dt, player.pos, this);
    this.updateUnits(dt, player);
    this.updateCops(dt, player);
    this.updateHelicopters(dt, player);
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
      h.orbit += dt * 0.2;
      const tx = player.pos.x + Math.sin(h.orbit) * 48;
      const tz = player.pos.z - 30 + Math.cos(h.orbit) * 18;
      h.group.position.x = damp(h.group.position.x, tx, 0.8, dt);
      h.group.position.z = damp(h.group.position.z, tz, 0.8, dt);
      h.group.position.y = damp(h.group.position.y, 30, 1, dt);
      h.rotor.rotation.y += dt * 30;
      h.tailRotor.rotation.x += dt * 40;
      h.group.lookAt(player.pos.x, 0.5, player.pos.z);
      h.group.rotation.z = 0;
      const spotTarget = new THREE.Vector3(player.pos.x + 8, 0.2, player.pos.z + 8);
      h.spot.position.set(spotTarget.x, 0.16, spotTarget.z);
      const mid = new THREE.Vector3().copy(h.group.position).lerp(spotTarget, 0.5);
      h.beam.position.copy(mid);
      const dir = new THREE.Vector3().subVectors(spotTarget, h.group.position).normalize();
      h.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
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
        verb: u.state === 'roadblock' ? 'ROADBLOCK' : u.state === 'ramming' ? 'RAMMING' : this.wanted.evading ? 'SEARCHING' : 'PURSUIT',
      });
    }
    for (const cop of this.footCops) {
      rows.push({ callSign: cop.callSign, unitType: cop.unitType, distance: dist2(cop.pos.x, cop.pos.z, playerPos.x, playerPos.z), verb: this.wanted.evading ? 'SEARCHING' : 'PURSUIT' });
    }
    for (const h of this.helicopters) {
      rows.push({ callSign: h.callSign, unitType: h.unitType, distance: dist2(h.group.position.x, h.group.position.z, playerPos.x, playerPos.z), verb: 'SPOTLIGHT' });
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

let beamTex = null;
function beamSprite() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,236,180,0.5)');
  g.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}
