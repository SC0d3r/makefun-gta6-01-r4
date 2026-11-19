// Main pass: boot, loop and system wiring frozen for the r7 entry.
// VELA CITY boot and simulation. One canvas, one loop, a state machine (title, playing, paused,
// dead) and the wiring of city, player, vehicles, traffic, pedestrians, police, missions, race,
// economy, HUD, audio, renderer and input. Every screenshot preset enters through runShot().

import { generateCity, updateCity, isOnDock } from './city.js';
import { PlayerController, updatePlayer } from './player.js';
import { createVehicle, enterVehicle, exitVehicle, Vehicle } from './vehicle.js';
import { createTraffic, createPedestrians, updateTraffic, updatePedestrians } from './traffic.js';
import { WantedSystem, PoliceDispatch, setWantedLevel, updateWanted } from './police.js';
import { MissionRunner, beginMission, updateMission } from './missions.js';
import { RaceSystem, startRace, updateRace } from './race.js';
import { Economy, saveGame } from './progression.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { createRenderer, createSky, setupShadows, CameraRig, updateCamera, setTimeOfDay } from './render.js';
import { Input } from './input.js';
import { PALETTE, CITY_LAYOUT, CAMERA, PLAYER, POLICE, DISTRICTS, RADIO_STATIONS } from './config.js';
import { seededRandom, clamp, dist2, damp, angleLerp } from './rng.js';
import { runShot } from './shots.js';

export class Game {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.params = params;
    this.seed = Number(params.get('seed')) || 7;
    this.shotName = params.get('shot');
    this.frozen = false;
    this.state = 'title';
    this.time = 0;
    this.clockAccum = 0;
    this.saveAccum = 0;
    this.lastStars = 0;
    this.reinforceTimer = 0;
    this.shotCrimeTimer = 0;
    this.hitRunTimer = 0;
    this.lastShotCrime = 0;
    this.radioIndex = 0;
    this.radio = RADIO_STATIONS[0];
    this.district = 'PALM BEACH';
    this.fps = 60;
    this.frames = 0;
    this.fpsTime = 0;
    this.sunOffset = new THREE.Vector3(-92, 27, 84);
    this.lighting = 'golden';

    this.canvas = document.getElementById('game');
    this.renderer = createRenderer(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.onFoot.fov, innerWidth / innerHeight, 0.1, 1400);
    this.sky = createSky(this.scene);
    this.lights = setupShadows(this.scene);
    this.city = generateCity(this.scene, this.seed);
    this.rig = new CameraRig(this.camera, this.scene);
    this.rig.setBlockers(this.city.colliders);
    this.rig.setMode('onfoot');
    this.rig.pos.set(28, 4.2, 224);
    this.rig.look.set(20, 1.2, 205);
    this.player = new PlayerController(this.scene);
    this.player.pos.set(24, 0.34, 218);
    this.player.group.position.copy(this.player.pos);
    this.traffic = createTraffic(this.scene, this.seed);
    this.peds = createPedestrians(this.scene, this.seed);
    this.economy = new Economy();
    this.world = { colliders: this.city.colliders, bounds: CITY_LAYOUT.bounds, onCrash: (v) => this.onVehicleCrash(v) };
    this.police = new PoliceDispatch(this.scene, this.world, this.seed);
    this.vehicles = [];
    this.spawnParkedVehicles();
    this.hud = new HUD(document.getElementById('hud'));
    this.audio = new AudioEngine();
    this.missions = new MissionRunner(this.scene, this.economy, {
      setWanted: (n, player) => this.applyWanted(n, player),
      alarm: (player, n) => this.applyWanted(Math.max(n, this.police.wanted.stars), player),
      onBegin: (def) => { this.hud.notify(`${def.title} · ${def.chapter}`, 4); this.clearBeacon(); },
      onComplete: (def, reward) => { this.hud.notify(`${def.title} complete · +$${reward.toLocaleString('en-US')}`, 6); this.economy.stats.missions = this.economy.completed.length; },
      onFail: (def, reason) => this.hud.notify(`${def.title} failed · R to retry`, 6),
      bounds: CITY_LAYOUT.bounds,
    });
    this.race = new RaceSystem(this.scene, {
      setDusk: (on) => this.setLighting(on ? 'dusk' : 'golden'),
      getTime: () => this.lighting,
      addCash: (amount, source) => { this.economy.addCash(amount, source); this.economy.stats.races = (this.economy.stats.races || 0) + 1; this.economy.saveGame(); },
      onSpawnCar: (car) => this.vehicles.push(car),
      onStart: () => { this.hud.notify('CORAL LOOP · 2 LAPS · 3 RIVALS · R TO ABORT', 5); this.police.reset?.(); },
      onFinish: (race, ok, reward) => { this.hud.notify(ok ? `${race.resultText}` : 'Race ended', 6); },
    });
    this.input = new Input(this.canvas);
    this.bindUi();
    this.bindInteractions();
    this.jobBeacon = null;
    this.refreshBeacon();
    this.last = performance.now();
    this.started = false;

    if (this.shotName) {
      this.hud.showTitle(this.economy, false);
      this.hud.showPause(false);
      this.hud.showDead(false);
      this.state = 'playing';
      runShot(this, this.shotName, this.seed);
      this.frozen = true;
      this.renderOnce();
    } else {
      setState(this, 'title');
      this.readyToLoop = true;
    }
  }

  spawnParkedVehicles() {
    const add = (type, x, z, heading) => {
      const v = createVehicle(this.scene, type, x, z, heading, {});
      v.parked = true;
      v.stolen = false;
      this.vehicles.push(v);
      return v;
    };
    this.heroCar = add('coupe', 32, 210, Math.PI);
    add('sedan', -34, 191, Math.PI / 2);
    add('van', -72, 209, Math.PI / 2);
    add('motorbike', 56, 190, -Math.PI / 2);
    add('coupe', 22, 44, Math.PI);
    add('sedan', 160, 191, -Math.PI / 2);
    add('van', -240, 60, 0);
  }

  bindUi() {
    this.hud.bindMenus({
      continue: () => { this.audio.click(); this.startPlaying(false); },
      newGame: () => { this.audio.click(); this.economy.newGame(); this.economy.loaded = false; this.startPlaying(true); },
      resume: () => { this.audio.click(); setState(this, 'playing'); this.hud.showPause(false); },
      restart: () => { this.audio.click(); this.restartRun(); },
      respawn: () => { this.audio.click(); this.respawn(); },
    });
    addEventListener('resize', () => this.onResize());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
      if (this.state === 'title' && (e.code === 'Enter' || e.code === 'KeyC')) this.startPlaying(false);
      if (this.state === 'title' && e.code === 'KeyN') this.startPlaying(true);
    });
    this.canvas.addEventListener('mousedown', () => { if (this.state === 'playing') this.input.requestLock(); });
  }

  bindInteractions() {}

  startPlaying(fresh) {
    if (fresh) this.resetRun();
    this.hud.showTitle(this.economy, false);
    this.hud.showPause(false);
    this.hud.showDead(false);
    setState(this, 'playing');
    this.input.requestLock();
    this.refreshBeacon();
    this.last = performance.now();
    if (!this.started) {
      this.started = true;
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  resetRun() {
    this.player.revive(24, 218);
    this.rig.yaw = Math.PI;
    this.rig.pitch = 6;
    this.rig.setMode('onfoot');
    this.applyWanted(0, this.player);
    this.clearResponse();
    this.missions.active = null;
    this.missions.state = 'idle';
    this.missions.currentLine = null;
    if (this.race.active) this.race.abort();
    this.race.finished = false;
    this.setLighting('golden');
    this.player.armour = 65;
    this.player.weapon = 'smg';
    this.player.ammo = { pistol: 48, smg: 150 };
    this.refreshBeacon();
  }

  restartRun() {
    this.resetRun();
    this.hud.showPause(false);
    setState(this, 'playing');
    this.input.requestLock();
    this.hud.notify('Run restarted · $1,240 · Day 1, 18:40', 4);
  }

  respawn() {
    this.player.revive(24, 218);
    this.economy.cash = Math.max(0, this.economy.cash - 500);
    this.economy.saveGame();
    this.applyWanted(0, this.player);
    this.clearResponse();
    this.player.health = 100;
    this.player.armour = 45;
    this.setLighting('golden');
    this.hud.showDead(false);
    setState(this, 'playing');
    this.rig.setMode('onfoot');
    this.rig.yaw = Math.PI;
    this.input.requestLock();
    this.hud.notify('Patched up at the Palm Beach safehouse · -$500', 4);
  }

  pause() {
    setState(this, 'paused');
    this.hud.showPause(true);
    this.input.releaseLock();
    this.economy.saveGame();
  }

  resume() {
    setState(this, 'playing');
    this.hud.showPause(false);
    this.input.requestLock();
  }

  loop(now) {
    if (this.frozen) return;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) { this.fps = Math.round(this.frames / this.fpsTime); this.frames = 0; this.fpsTime = 0; }
    this.step(dt);
    this.renderOnce();
    requestAnimationFrame((t) => this.loop(t));
  }

  step(dt) {
    if (this.state === 'title') {
      this.titleCamera(dt);
      updateCity(this.city, this.time, dt);
      updateTraffic(this.traffic, dt, null);
      updatePedestrians(this.peds, dt, this.time);
      this.hud.tick(dt);
      this.hud.drawHud(this);
      this.input.endFrame();
      return;
    }
    if (this.state === 'paused') {
      this.hud.tick(dt);
      this.hud.drawHud(this);
      this.input.endFrame();
      return;
    }
    if (this.state === 'dead') {
      this.updateWorldIdle(dt);
      this.hud.drawHud(this);
      this.hud.tick(dt);
      this.input.endFrame();
      return;
    }
    this.updatePlaying(dt);
    this.hud.tick(dt);
    this.hud.drawHud(this);
    this.input.endFrame();
  }

  updatePlaying(dt) {
    this.audio.start();
    const mouse = this.input.takeMouse();
    const car = this.player.inVehicle;
    if (car) {
      const controls = {
        throttle: (this.input.isPressed('KeyW', 'ArrowUp') ? 1 : 0) - (this.input.isPressed('KeyS', 'ArrowDown') ? 1 : 0),
        brake: this.input.isPressed('Space') ? false : this.input.isPressed('KeyS', 'ArrowDown'),
        steer: this.input.axis('KeyA', 'KeyD'),
        handbrake: this.input.isPressed('Space'),
      };
      car.controls = controls;
      car.update(dt, this.world);
      if (Math.abs(car.speed) > 0.2 && mouse.dx) this.rig.yaw -= mouse.dx * 0.0026;
      if (!mouse.dx) this.rig.yaw = angleLerp(this.rig.yaw, car.heading, 1 - Math.exp(-4.2 * dt));
      this.rig.mode = 'car';
      this.rig.pitch = damp(this.rig.pitch, 7, 4, dt);
      updateCamera(this.rig, car.pos, dt, Math.abs(car.speed));
      this.checkPedestrianHits(car);
      this.checkPoliceRam(car);
    } else {
      updatePlayer(this.player, dt, this.input, this.rig.yaw, this.city);
      this.rig.mode = 'onfoot';
      updateCamera(this.rig, this.player.pos, dt, 0);
      if (mouse.dx || mouse.dy) this.rig.orbit(mouse.dx, mouse.dy);
      if (this.input.wasPressed('KeyF')) this.tryEnterVehicle();
    }
    if (mouse.left) this.fireWeapon();
    if (this.input.wasPressed('KeyF') && car) this.leaveVehicle();
    if (this.input.wasPressed('KeyE')) this.interact();
    if (this.input.wasPressed('KeyR')) this.raceKey();
    if (this.input.wasPressed('KeyQ')) { this.radioIndex = (this.radioIndex + 1) % RADIO_STATIONS.length; this.radio = RADIO_STATIONS[this.radioIndex]; this.audio.radio.tune(this.radioIndex); this.hud.notify(`${this.radio.name} · ${this.radio.track}`, 2.5); }
    if (this.input.wasPressed('KeyH')) { this.audio.toggleMute(); this.hud.notify(this.audio.muted ? 'Audio muted' : 'Audio on', 2); }

    updateCity(this.city, this.time, dt);
    updateTraffic(this.traffic, dt, car);
    updatePedestrians(this.peds, dt, this.time);
    updateWanted(this.police, dt, this.player, this.police.wanted);
    updateMission(this.missions, dt, this.player, car, this.police);
    if (this.race.active) updateRace(this.race, dt, this.player, car);
    if (this.race.finished) {
      this.race.resultTimer = (this.race.resultTimer || 0) - dt;
      if (this.race.resultTimer <= 0) { this.race.finished = false; this.race.line = ''; }
    }
    this.managePolice(dt);
    this.manageBeacon();
    this.manageClock(dt);
    this.audio.update(dt, this);
    this.district = this.districtAt(this.player.inVehicle ? this.player.inVehicle.pos : this.player.pos);
    this.followSun();
    if (this.player.dead) this.die();
    if (this.player.inVehicle && this.player.inVehicle.health <= 0) {
      this.hud.notify('Vehicle wrecked · find another', 4);
      this.leaveVehicle();
    }
  }

  updateWorldIdle(dt) {
    updateCity(this.city, this.time, dt);
    updateTraffic(this.traffic, dt, null);
    updatePedestrians(this.peds, dt, this.time);
    updateWanted(this.police, dt, this.player, this.police.wanted);
  }

  tryEnterVehicle() {
    let best = null;
    for (const v of this.vehicles) {
      if (v.driver) continue;
      const d = dist2(this.player.pos.x, this.player.pos.z, v.pos.x, v.pos.z);
      if (d < 3.2 && (!best || d < best.d)) best = { v, d };
    }
    for (const u of this.police.units) {
      if (u.dead) continue;
      const d = dist2(this.player.pos.x, this.player.pos.z, u.vehicle.pos.x, u.vehicle.pos.z);
      if (d < 3.2 && (!best || d < best.d)) best = { v: u.vehicle, d };
    }
    if (!best) { this.hud.notify('No car within three metres', 2); return; }
    if (enterVehicle(this.player, best.v)) {
      this.rig.setMode('car');
      this.rig.yaw = best.v.heading;
      this.audio.startEngine();
      this.audio.click();
      if (!best.v.stolen && best.v.parked) {
        best.v.stolen = true;
        const seen = this.peds.peds.some((p) => dist2(p.x, p.z, best.v.pos.x, best.v.pos.z) < 22) || this.police.units.some((u) => dist2(u.vehicle.pos.x, u.vehicle.pos.z, best.v.pos.x, best.v.pos.z) < 60);
        if (seen) this.applyWanted(Math.max(1, this.police.wanted.stars + 1), this.player);
        this.hud.notify(`Stolen · ${best.v.name}`, 3);
      } else this.hud.notify(`Driving · ${best.v.name}`, 2);
    }
  }

  leaveVehicle() {
    const v = this.player.inVehicle;
    if (!v) return;
    exitVehicle(v, this.player, this.world);
    this.rig.setMode('onfoot');
    this.rig.yaw = v.heading;
    this.audio.click();
  }

  interact() {
    if (this.missions.active) return;
    const near = this.missions.nearestAvailable(this.player);
    if (near && near.d < 6.5) {
      beginMission(this.missions, near.mission.id, this.player);
      this.clearBeacon();
      this.audio.click();
      return;
    }
    if (this.race.active) { this.race.abort(); this.hud.notify('Race aborted', 3); return; }
    this.hud.notify('Find a gold job beacon or press R at the Coral Loop line', 3);
  }

  raceKey() {
    if (this.missions.active) { this.hud.notify('Finish the story job first', 3); return; }
    if (this.race.active) { this.race.abort(); return; }
    if (this.race.startRace(this.player, this.player.inVehicle)) {
      this.audio.click();
      this.rig.setMode('car');
      if (this.player.inVehicle) this.rig.yaw = this.player.inVehicle.heading;
      this.hud.notify('GO! Coral Loop · 2 laps', 3);
    }
  }

  fireWeapon() {
    if (this.player.dead || this.player.inVehicle) return;
    if (this.player.fireCooldown > 0) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const target = this.camera.position.clone().addScaledVector(dir, 55);
    target.y = this.player.pos.y + 1.2;
    const shot = this.player.fire(target);
    if (!shot) return;
    this.audio.playGunshot(0.6);
    this.peds.scare(this.player.pos.x, this.player.pos.z, 34, 6);
    this.police.damageAt(shot.to, 2.5, 50);
    this.lastShotCrime += 1;
    if (this.police.wanted.stars < 5 && this.time - this.lastShotCrime > 1.4) {
      this.lastShotCrime = this.time;
      this.applyWanted(Math.max(1, this.police.wanted.stars + 1), this.player);
    }
  }

  applyWanted(stars, player) {
    const p = player || this.player;
    const heading = p.inVehicle ? p.inVehicle.heading : p.heading;
    this.police.wanted.setWantedLevel(stars);
    if (stars > 0) this.police.dispatchResponse(stars, p.pos, heading);
    this.lastStars = stars;
    if (stars > 0) this.audio.playSiren(true);
    else this.audio.playSiren(false);
  }

  managePolice(dt) {
    const wanted = this.police.wanted;
    if (wanted.stars > this.lastStars) {
      this.applyWanted(wanted.stars, this.player);
    }
    this.lastStars = wanted.stars;
    this.reinforceTimer -= dt;
    if (wanted.stars > 0 && this.reinforceTimer <= 0) {
      this.reinforceTimer = 7;
      this.police.dispatchResponse(wanted.stars, this.player.pos, this.player.inVehicle ? this.player.inVehicle.heading : this.player.heading);
    }
    if (wanted.stars === 0 && this.police.units.length) {
      this.clearResponse();
    }
    if (this.player.dead) return;
    if (this.police.footCops.length && wanted.stars >= 2) {
      // police.js applies the damage; keep the HUD response list fresh.
    }
  }

  clearResponse() {
    for (const u of this.police.units) if (u.vehicle.group.parent) u.vehicle.group.parent.remove(u.vehicle.group);
    this.police.units = [];
    for (const c of this.police.footCops) if (c.group.parent) c.group.parent.remove(c.group);
    this.police.footCops = [];
    for (const h of this.police.helicopters) {
      if (h.group.parent) h.group.parent.remove(h.group);
      if (h.beam.parent) h.beam.parent.remove(h.beam);
      if (h.spot.parent) h.spot.parent.remove(h.spot);
    }
    this.police.helicopters = [];
    for (const b of this.police.blockades) {
      for (const u of b.units) if (u.vehicle.group.parent) u.vehicle.group.parent.remove(u.vehicle.group);
      for (const bar of b.barriers) if (bar.parent) bar.parent.remove(bar);
    }
    this.police.blockades = [];
    this.audio.playSiren(false);
  }

  checkPedestrianHits(car) {
    if (Math.abs(car.speed) < 4) return;
    for (const p of this.peds.peds) {
      if (dist2(car.pos.x, car.pos.z, p.x, p.z) < 2.6) {
        this.peds.scare(car.pos.x, car.pos.z, 26, 8);
        if (this.hitRunTimer <= 0) {
          this.hitRunTimer = 2.5;
          this.applyWanted(Math.min(5, Math.max(2, this.police.wanted.stars + 2)), this.player);
        }
        p.state = 'flee';
        p.fear = 8;
      }
    }
    this.hitRunTimer = Math.max(0, this.hitRunTimer - 0.016);
  }

  checkPoliceRam(car) {
    if (this.lastRam && this.time - this.lastRam < 3) return;
    for (const u of this.police.units) {
      if (dist2(car.pos.x, car.pos.z, u.vehicle.pos.x, u.vehicle.pos.z) < 4.2) {
        this.lastRam = this.time;
        if (this.police.wanted.stars < 4) this.applyWanted(Math.min(5, this.police.wanted.stars + 1), this.player);
        this.rig.shake = 0.28;
        return;
      }
    }
  }

  die() {
    if (this.state !== 'playing') return;
    setState(this, 'dead');
    this.hud.showDead(true, this.economy);
    this.player.dead = true;
    this.input.releaseLock();
    this.audio.playSiren(false);
    this.economy.stats.wrecks = (this.economy.stats.wrecks || 0) + 1;
  }

  districtAt(pos) {
    let best = DISTRICTS[0], bd = Infinity;
    for (const d of DISTRICTS) {
      const dd = dist2(pos.x, pos.z, d.x, d.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best.name;
  }

  manageClock(dt) {
    this.clockAccum += dt;
    if (this.clockAccum > 0.5) {
      this.economy.advanceClock(0.18 * this.clockAccum * 60);
      this.clockAccum = 0;
    }
    this.saveAccum += dt;
    if (this.saveAccum > 20) {
      this.saveAccum = 0;
      this.economy.saveGame({ district: this.district });
    }
  }

  refreshBeacon() {
    this.clearBeacon();
    if (!this.economy) return;
    const near = this.missions.nearestAvailable(this.player);
    if (!near) return;
    const pos = near.pos;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 30), new THREE.MeshBasicMaterial({ color: 0xffc35c, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 18, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc35c, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    beam.position.y = 9;
    g.add(beam);
    g.position.set(pos.x, 0, pos.z);
    this.scene.add(g);
    this.jobBeacon = { group: g, ring, beam, mission: near.mission, pos };
  }

  clearBeacon() {
    if (this.jobBeacon) {
      this.scene.remove(this.jobBeacon.group);
      this.jobBeacon = null;
    }
  }

  manageBeacon() {
    if (!this.jobBeacon) {
      if (!this.missions.active) this.refreshBeacon();
      return;
    }
    if (this.missions.active) { this.clearBeacon(); return; }
    this.jobBeacon.ring.rotation.z += 0.01;
    this.jobBeacon.group.position.y = Math.sin(this.time * 1.5) * 0.05;
    const d = dist2(this.player.pos.x, this.player.pos.z, this.jobBeacon.pos.x, this.jobBeacon.pos.z);
    if (d < 6.5) this.hud.notice = this.hud.notice || `E · START ${this.jobBeacon.mission.title.toUpperCase()}`;
  }

  setLighting(mode) {
    this.lighting = mode;
    setTimeOfDay(this.scene, this.sky, this.lights, mode);
    this.sunOffset.set(mode === 'dusk' ? -120 : -92, mode === 'dusk' ? 9 : 27, mode === 'dusk' ? 110 : 84);
    this.followSun();
  }

  followSun() {
    const p = this.player.inVehicle ? this.player.inVehicle.pos : this.player.pos;
    this.lights.sun.target.position.set(p.x, 0, p.z);
    this.lights.sun.position.set(p.x + this.sunOffset.x, this.sunOffset.y, p.z + this.sunOffset.z);
    this.lights.sun.target.updateMatrixWorld();
  }

  titleCamera(dt) {
    const t = this.time * 0.04;
    const cx = Math.sin(t) * 110;
    const cz = 130 + Math.cos(t) * 60;
    this.camera.position.set(cx, 34 + Math.sin(t * 1.3) * 5, cz);
    this.camera.lookAt(Math.sin(t + 0.6) * 20, 8, 80);
    if (this.camera.fov !== 58) { this.camera.fov = 58; this.camera.updateProjectionMatrix(); }
    this.followSun();
  }

  onResize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  onVehicleCrash(v) {
    if (this.police.wanted.stars > 0) return;
    if (this.police.units.some((u) => dist2(u.vehicle.pos.x, u.vehicle.pos.z, v.pos.x, v.pos.z) < 8)) {
      this.applyWanted(Math.min(5, this.police.wanted.stars + 2), this.player);
    }
  }

  renderOnce() {
    this.renderer.render(this.scene, this.camera);
  }
}

export function createGame() {
  return new Game();
}

export function gameLoop(game, now) {
  const dt = Math.min((now - game.last) / 1000, 0.05);
  game.last = now;
  game.time += dt;
  game.step(dt);
  game.renderOnce();
  if (!game.frozen) requestAnimationFrame((t) => gameLoop(game, t));
}

export function setState(game, state) {
  game.state = state;
  if (state === 'title') {
    game.hud.showTitle(game.economy, true);
    game.hud.showPause(false);
    game.hud.showDead(false);
  } else if (state === 'playing') {
    game.hud.showTitle(game.economy, false);
    game.hud.showPause(false);
    game.hud.showDead(false);
  } else if (state === 'paused') {
    game.hud.showPause(true);
  } else if (state === 'dead') {
    game.hud.showPause(false);
  }
}

const boot = () => {
  const game = createGame();
  window.__VELA__ = game;
  if (!game.shotName) {
    game.started = true;
    game.last = performance.now();
    requestAnimationFrame((t) => gameLoop(game, t));
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
