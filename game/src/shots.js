// Shot pass: preset staging frozen for the r7 entry.
// Capture pass: presets and staging frozen; viewport 1280x807 with the top 720 rows kept.
// VELA CITY screenshot presets. Each one stages the live game once, then the constructor takes a
// single render: chase (golden-hour pursuit on Palm Boulevard), street (downtown sidewalk at
// golden hour), drive (coastal marina run) and mission (the last drop on the marina dock). Every
// random choice comes from the URL seed, so a preset repeats exactly.
// r13 city-systems pass: screenshot presets are unchanged.

import { createVehicle } from './vehicle.js';
import { beginMission } from './missions.js';
import { setTimeOfDay } from './render.js';
import { seededRandom } from './rng.js';

const STAGES = { chase: stageChase, street: stageStreet, drive: stageDrive, mission: stageMission };

export function runShot(game, name, seed = 7) {
  const stage = STAGES[name];
  if (!stage) return;
  game.state = 'playing';
  game.hud.showPause(false);
  stage(game, seededRandom(Number(seed) || 7));
  game.hud.notice = null;
  game.hud.noticeTime = 0;
  game.hud.drawHud(game);
}

function cameraAt(game, px, py, pz, tx, ty, tz, fov) {
  const c = game.camera;
  c.position.set(px, py, pz);
  c.lookAt(tx, ty, tz);
  c.fov = fov;
  c.updateProjectionMatrix();
  game.rig.pos.copy(c.position);
  game.rig.look.set(tx, ty, tz);
  game.rig.fov = fov;
}

function drive(game, car, x, z, heading) {
  car.pos.set(x, 0.2, z);
  car.heading = heading;
  car.speed = 26;
  car.velocity.set(0, 0, 0);
  car.group.position.copy(car.pos);
  car.group.rotation.set(0, heading, 0);
  game.player.pos.set(x, 0.34, z);
  game.player.inVehicle = car;
  car.driver = game.player;
  game.player.setVisible(false);
  game.rig.setMode('car');
  game.rig.yaw = heading;
  return car;
}

function addCruiser(game, x, z, heading, unitType = 'Interceptor', state = 'pursuit') {
  const vehicle = createVehicle(game.scene, 'police', x, z, heading, {});
  vehicle.speed = 16;
  vehicle.lightsOn = true;
  vehicle.steadyLights = true;
  vehicle.tickEffects(0);
  const unit = {
    vehicle, callSign: game.police.nextCallsign(), unitType, state,
    health: 120, fireTimer: 0, targetPos: new THREE.Vector3(x, 0, z),
  };
  game.police.units.push(unit);
  game.vehicles.push(vehicle);
  return unit;
}

function paintHero(car, color) {
  car.group.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (o.material.color.getHex() === 0xff5a4e) o.material.color.setHex(color);
  });
}

function buildCrew(scene, x, z, shirt, heading) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.86 });
  const denim = new THREE.MeshStandardMaterial({ color: 0x202a34, roughness: 0.92 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb97c55, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x181c20, roughness: 0.45, metalness: 0.4 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.34), cloth);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.26), denim);
  legs.position.y = 0.42;
  g.add(legs);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.29), skin);
  head.position.y = 1.74;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.7), steel);
  gun.position.set(0.34, 1.22, 0.34);
  g.add(gun);
  g.position.set(x, 0.6, z);
  g.rotation.y = heading;
  scene.add(g);
  return g;
}

function stageChase(game, rng) {
  setTimeOfDay(game.scene, game.sky, game.lights, 'golden');
  game.lighting = 'golden';
  game.district = 'PALM BEACH';
  game.economy.cash = 18420;
  game.economy.day = 2;
  game.economy.clock = 18 * 60 + 52;
  const h = Math.PI / 2;
  const car = drive(game, game.heroCar, -90, 196, h);
  car.speed = 31;
  paintHero(car, 0xff3d6e);
  game.player.weapon = 'smg';
  game.player.ammo.smg = 150;
  game.player.health = 96;
  game.player.armour = 65;
  const def = beginMission(game.missions, 'courier-run', game.player, {
    stage: 0,
    line: { speaker: 'MARISOL', text: 'Lose the heat, Rico. The parcel still goes to Palma Books tonight.' },
  });
  game.missions.active = {
    ...def,
    objective: 'Lose the police',
    stages: ['Lose the police before the marina', 'Deliver to Palma Books on Palm Row', 'Drop the receipt at Sunset Diner'],
  };
  game.missions.timer = 214;
  game.police.wanted.setWantedLevel(4);
  game.lastStars = 4;
  addCruiser(game, -81.4, 196, h, 'Interceptor');
  addCruiser(game, -87.0, 191.4, h, 'Cruiser');
  addCruiser(game, -87.0, 200.6, h, 'Cruiser');
  game.police.roadblock({ x: car.pos.x, z: car.pos.z }, h, 34);
  game.police.spawnHelicopter(car.pos);
  const heli = game.police.helicopters[0];
  const hx = car.pos.x + Math.sin(h) * 60;
  const hz = car.pos.z + Math.cos(h) * 60;
  heli.group.position.set(hx, 31, hz);
  heli.group.lookAt(car.pos.x, 0.5, car.pos.z);
  heli.group.rotation.z = 0;
  const spot = new THREE.Vector3(hx + Math.sin(h) * 24, 0.18, hz + Math.cos(h) * 24);
  heli.spot.position.copy(spot);
  heli.beam.position.copy(heli.group.position).lerp(spot, 0.5);
  const beamDir = spot.clone().sub(heli.group.position).normalize();
  heli.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir.clone().negate());
  for (let i = 0; i < 20; i++) {
    const p = game.peds.peds[i];
    const side = i % 2 ? 1 : -1;
    p.x = car.pos.x + 8 + (i >> 1) * 4.7 + rng.range(-0.8, 0.8);
    p.z = car.pos.z + side * (16.8 + rng.range(0, 1.8));
    p.state = i % 3 === 0 ? 'cower' : 'walk';
    p.fear = 0;
    p.group.position.set(p.x, 0.3, p.z);
    p.group.rotation.y = Math.PI + side * 0.2;
    p.group.visible = true;
  }
  const back = 8.5;
  const lat = 1.7;
  const cx = car.pos.x - Math.sin(h) * back + Math.cos(h) * lat;
  const cz = car.pos.z - Math.cos(h) * back - Math.sin(h) * lat;
  cameraAt(game, cx, 4.8, cz, car.pos.x + Math.sin(h) * 18.5, 0.66, car.pos.z + Math.cos(h) * 18.5, 40);
}

function stageStreet(game) {
  setTimeOfDay(game.scene, game.sky, game.lights, 'golden');
  game.lighting = 'golden';
  game.district = 'DOWNTOWN';
  game.economy.cash = 1860;
  game.economy.day = 1;
  game.economy.clock = 18 * 60 + 46;
  const p = game.player;
  p.inVehicle = null;
  p.dead = false;
  p.health = 100;
  p.armour = 45;
  p.weapon = 'smg';
  p.ammo.smg = 128;
  p.pos.set(10.3, 0.34, -19);
  p.heading = Math.PI;
  p.group.position.copy(p.pos);
  p.group.rotation.y = Math.PI;
  p.setVisible(true);
  game.rig.setMode('onfoot');
  beginMission(game.missions, 'courier-run', p, {
    stage: 0,
    line: { speaker: 'MARISOL', text: 'Palma Books is two blocks up. Keep the parcel out of sight, Rico.' },
  });
  game.missions.timer = 268;
  const walkers = [
    { x: 10.6, z: -26, heading: Math.PI * 0.96 },
    { x: 9.4, z: -31, heading: Math.PI * 1.04 },
    { x: 11.2, z: -37, heading: Math.PI * 0.9 },
    { x: 10.0, z: -47, heading: Math.PI },
    { x: -10.2, z: -28, heading: 0.1 },
    { x: -9.6, z: -40, heading: -0.1 },
    { x: -10.4, z: -52, heading: 0 },
  ];
  game.peds.peds.slice(0, 7).forEach((ped, i) => {
    const w = walkers[i];
    ped.x = w.x;
    ped.z = w.z;
    ped.state = 'walk';
    ped.fear = 0;
    ped.axis = 'x';
    ped.lane = ped.z;
    ped.group.position.set(ped.x, 0.3, ped.z);
    ped.group.rotation.y = w.heading;
    ped.group.visible = true;
  });
  const parked = [
    { x: 4.6, z: -54, heading: 0 },
    { x: -4.6, z: -30, heading: Math.PI },
  ];
  game.traffic.cars.slice(0, 2).forEach((c, i) => {
    const spot = parked[i];
    c.x = spot.x;
    c.z = spot.z;
    c.heading = spot.heading;
    c.speed = 0;
    c.mesh.visible = true;
    c.mesh.position.set(c.x, 0.1, c.z);
    c.mesh.rotation.y = c.heading;
  });
  cameraAt(game, 12.6, 2.3, -8.8, 9.9, 1.45, -38, 47);
}

function stageDrive(game) {
  setTimeOfDay(game.scene, game.sky, game.lights, 'golden');
  game.lighting = 'golden';
  game.district = 'MARINA';
  game.economy.cash = 3140;
  game.economy.day = 2;
  game.economy.clock = 19 * 60 + 4;
  const car = drive(game, game.heroCar, -18, 200.2, -Math.PI / 2);
  car.speed = 31;
  paintHero(car, 0xff3d6e);
  game.player.health = 93;
  game.player.armour = 38;
  game.player.ammo.smg = 118;
  game.police.wanted.setWantedLevel(0);
  beginMission(game.missions, 'courier-run', game.player, {
    stage: 1,
    line: { speaker: 'NICO', text: 'Marina gate is open. Do not stop for the patrol boat, Rico.' },
  });
  game.missions.timer = 186;
  cameraAt(game, 6, 5.2, 202, -105, 1.0, 226, 54);
}

function stageMission(game) {
  setTimeOfDay(game.scene, game.sky, game.lights, 'golden');
  game.lighting = 'golden';
  game.district = 'MARINA';
  game.economy.cash = 4820;
  game.economy.day = 3;
  game.economy.clock = 20 * 60 + 6;
  const p = game.player;
  p.inVehicle = null;
  p.dead = false;
  p.health = 74;
  p.armour = 28;
  p.weapon = 'smg';
  p.ammo.smg = 96;
  p.pos.set(-108, 0.94, 262.4);
  p.heading = Math.PI * 0.98;
  p.group.position.copy(p.pos);
  p.group.rotation.y = p.heading;
  p.setVisible(true);
  game.rig.setMode('onfoot');
  const def = beginMission(game.missions, 'courier-run', p, { stage: 2 });
  game.missions.active = {
    ...def,
    objective: 'Drop the receipt on the marina dock',
    stages: ['Collect the parcel at Hotel Azura', 'Deliver to Palma Books on Palm Row', 'Drop the receipt on the marina dock'],
  };
  game.missions.setMarker({ x: -105.4, z: 261 });
  if (game.missions.markerGroup) game.missions.markerGroup.position.y = 0.55;
  if (game.city?.boats?.length) {
    game.city.boats[3].position.set(-100, 0.4, 250);
    game.city.boats[3].rotation.y = 0.35;
  }
  game.missions.currentLine = { speaker: 'MARISOL', text: 'Drop it and walk, Rico. The VCPD are already on the marina road.' };
  game.missions.timer = 47;
  game.police.wanted.setWantedLevel(3);
  game.lastStars = 3;
  addCruiser(game, -94, 266, -Math.PI / 2, 'Interceptor', 'pursuit');
  addCruiser(game, -138, 264, Math.PI / 2, 'Cruiser', 'pursuit');
  addCruiser(game, -118, 238, 0, 'Cruiser', 'roadblock');
  cameraAt(game, -86, 5.0, 275, -115, 1.1, 258, 50);
}
