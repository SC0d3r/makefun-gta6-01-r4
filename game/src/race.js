// Race pass: checkpoint race state frozen for the r7 entry.
// A real dusk street race: Coral Loop, two laps, three named rivals — Dario Sarno, Nia Vale and
// Teo Marchetti — fixed checkpoints, live position, rubber-band rival pace, a race HUD line and a
// minimap route. Start at the marked line with R, or from ?shot=race; free roam is restored after.

import { RACE, CITY_LAYOUT } from './config.js';
import { seededRandom, dist2, clamp, damp } from './rng.js';
import { createVehicle, enterVehicle } from './vehicle.js';

export class RaceSystem {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks;
    this.rng = seededRandom(89);
    this.active = false;
    this.finished = false;
    this.route = RACE.route;
    this.checkpoints = [...RACE.route, { x: CITY_LAYOUT.raceStart.x, z: CITY_LAYOUT.raceStart.z }];
    this.laps = RACE.laps;
    this.lap = 1;
    this.checkpoint = 0;
    this.position = 1;
    this.fieldSize = 4;
    this.rivals = [];
    this.playerCar = null;
    this.savedTime = 'golden';
    this.startClock = 0;
    this.resultText = '';
    this.resultTimer = 0;
    this.best = null;
    this.line = '';
    this.standings = [];
  }

  startRace(player, vehicle) {
    if (this.active) return false;
    this.finished = false;
    this.active = true;
    this.lap = 1;
    this.checkpoint = 0;
    this.position = 2;
    this.startClock = 0;
    this.resultText = '';
    let car = vehicle;
    if (!car) {
      car = createVehicle(this.scene, 'coupe', CITY_LAYOUT.raceStart.x, CITY_LAYOUT.raceStart.z, 0, {});
      car.spec = { ...car.spec, body: 0xffc35c };
      car.name = 'Vela GT · Coral Loop';
      this.scene.add(car.group);
      this.hooks.onSpawnCar?.(car);
    }
    player.inVehicle = car;
    car.driver = player;
    player.setVisible(false);
    car.pos.set(CITY_LAYOUT.raceStart.x, 0.2, CITY_LAYOUT.raceStart.z);
    car.heading = 0;
    car.speed = 0;
    car.velocity.set(0, 0, 0);
    car.group.position.copy(car.pos);
    car.group.rotation.y = 0;
    this.playerCar = car;
    this.spawnRivals();
    this.savedTime = this.hooks.getTime ? this.hooks.getTime() : 'golden';
    this.hooks.setDusk?.(true);
    this.hooks.onStart?.(this);
    return true;
  }

  spawnRivals() {
    this.clearRivals();
    const offsets = [{ x: -4, z: -8 }, { x: 4, z: -12 }, { x: 0, z: -18 }];
    for (let i = 0; i < RACE.rivals; i++) {
      const v = createVehicle(this.scene, i === 1 ? 'sedan' : 'coupe', CITY_LAYOUT.raceStart.x + offsets[i].x, CITY_LAYOUT.raceStart.z + offsets[i].z, 0, {});
      v.spec = { ...v.spec, body: RACE.colors[i] };
      v.name = RACE.names[i];
      v.health = 200;
      this.scene.add(v.group);
      this.rivals.push({
        name: RACE.names[i], vehicle: v, progress: -0.2 - i * 0.12, speed: 22 + i * 0.7,
        target: 26 + i, finished: false, color: RACE.colors[i],
      });
    }
  }

  clearRivals() {
    for (const r of this.rivals) if (r.vehicle.group.parent) r.vehicle.group.parent.remove(r.vehicle.group);
    this.rivals = [];
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    this.clearRivals();
    this.hooks.setDusk?.(false);
    this.playerCar = null;
    this.hooks.onFinish?.(this, false);
  }

  updateRace(dt, player, playerCar) {
    if (!this.active) return;
    this.startClock += dt;
    const car = playerCar || this.playerCar;
    if (car) this.playerCar = car;
    if (!car) return;
    // Player checkpoint and lap progress.
    const cp = this.checkpoints[this.checkpoint];
    const d = dist2(car.pos.x, car.pos.z, cp.x, cp.z);
    if (d < RACE.checkpointRadius) {
      this.checkpoint++;
      if (this.checkpoint >= this.checkpoints.length) {
        this.checkpoint = 0;
        this.lap++;
        if (this.lap > this.laps) { this.finishRace(player, car); return; }
      }
    }
    // Rival pace with a gentle rubber band around the player.
    this.updateRivals(dt, car);
    this.computeStandings(car);
    const next = this.checkpoints[this.checkpoint];
    this.nextDistance = dist2(car.pos.x, car.pos.z, next.x, next.z);
    this.line = `${this.positionLabel()} OF ${this.fieldSize} · LAP ${Math.min(this.lap, this.laps)}/${this.laps} · NEXT ${Math.round(this.nextDistance)} m`;
    if (this.resultTimer > 0) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.abort();
    }
  }

  playerProgress(car) {
    const prev = this.checkpoints[Math.max(0, this.checkpoint - 1)];
    const next = this.checkpoints[this.checkpoint];
    const total = Math.max(1, dist2(prev.x, prev.z, next.x, next.z));
    const left = dist2(car.pos.x, car.pos.z, next.x, next.z);
    return (this.lap - 1) * this.checkpoints.length + this.checkpoint - left / total;
  }

  updateRivals(dt, playerCar) {
    const playerProg = this.playerProgress(playerCar);
    for (const r of this.rivals) {
      const gap = playerProg - r.progress;
      const rubber = clamp(1 + gap * 0.012, 0.88, 1.16);
      const target = (r.target + Math.sin(performance.now() * 0.0003 + r.progress) * 1.6) * rubber;
      r.speed = damp(r.speed, target, 1.4, dt);
      r.progress += (r.speed / 78) * dt;
      const total = this.checkpoints.length;
      if (r.progress >= total * this.laps) { r.finished = true; r.progress = total * this.laps - 0.01; }
      const idx = Math.floor(r.progress) % total;
      const frac = r.progress - Math.floor(r.progress);
      const a = this.checkpoints[idx];
      const b = this.checkpoints[(idx + 1) % total];
      const x = a.x + (b.x - a.x) * frac;
      const z = a.z + (b.z - a.z) * frac;
      const heading = Math.atan2(b.x - a.x, b.z - a.z);
      const v = r.vehicle;
      v.pos.set(x, 0.2, z);
      v.heading = heading;
      v.group.position.set(x, 0.2, z);
      v.group.rotation.y = heading;
      v.speed = r.speed;
      v.group.rotation.z = Math.sin(performance.now() * 0.003 + idx) * 0.03;
    }
  }

  computeStandings(car) {
    const mine = this.playerProgress(car);
    const list = [{ name: 'RICO VELA', progress: mine, you: true }];
    for (const r of this.rivals) list.push({ name: r.name.toUpperCase(), progress: r.progress, finished: r.finished });
    list.sort((a, b) => b.progress - a.progress);
    this.standings = list;
    this.position = list.findIndex((e) => e.you) + 1;
  }

  finishRace(player, car) {
    this.active = false;
    this.finished = true;
    const place = this.position;
    const reward = [6000, 3400, 1800, 900][Math.min(place - 1, 3)];
    this.resultText = `${this.positionLabel()} PLACE · CORAL LOOP · $${reward.toLocaleString('en-US')}`;
    this.hooks.onFinish?.(this, true, reward);
    this.hooks.addCash?.(reward, 'Coral Loop race');
    this.resultTimer = 7;
    this.laps = RACE.laps;
    this.clearRivals();
    this.hooks.setDusk?.(false);
    this.playerCar = null;
  }

  positionLabel() {
    return ['1ST', '2ND', '3RD', '4TH'][Math.min(this.position - 1, 3)];
  }
}

export function startRace(race, player, vehicle) {
  return race.startRace(player, vehicle);
}

export function updateRace(race, dt, player, vehicle) {
  race.updateRace(dt, player, vehicle);
}

export function racePosition(race) {
  return { position: race.position, fieldSize: race.fieldSize, lap: race.lap, laps: race.laps, next: race.nextDistance ?? 0 };
}

export function drawRaceHud(ctx, race, w, h) {
  if (!race.active && !race.finished) return;
  const cx = w / 2;
  const y = h - 104;
  const label = race.line || `${race.positionLabel()} OF 4 · LAP ${race.lap}/2`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 21px "Arial Black", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(16,24,32,0.76)';
  const tw = Math.max(430, ctx.measureText(label).width + 70);
  ctx.fillRect(cx - tw / 2, y - 30, tw, 44);
  ctx.fillStyle = '#39e6e0';
  ctx.fillRect(cx - tw / 2, y - 30, tw, 3);
  ctx.fillStyle = '#f4ead6';
  ctx.fillText(label, cx, y + 1);
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillStyle = '#ffc35c';
  ctx.fillText('CORAL LOOP  ·  DARIO SARNO · NIA VALE · TEO MARCHETTI', cx, y - 44);
  ctx.restore();
}
