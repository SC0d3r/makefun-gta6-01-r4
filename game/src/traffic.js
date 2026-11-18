// Street life: 24 lane-following traffic cars that stop for signals and each other, plus 40
// pedestrians on the sidewalks who sidestep one another, cower and flee from gunfire.

import { TRAFFIC, CITY_LAYOUT } from './config.js';
import { seededRandom, clamp, dist2, damp } from './rng.js';

export function createTraffic(scene, seed = 7) {
  const system = new TrafficSystem(scene, seed);
  fillStreets(system, TRAFFIC.cars);
  return system;
}

export function createPedestrians(scene, seed = 7) {
  const system = new PedestrianSystem(scene, seed);
  system.populate(TRAFFIC.peds);
  return system;
}

export function updateTraffic(traffic, dt, playerCar) {
  traffic.update(dt, playerCar);
}

export function updatePedestrians(peds, dt, time) {
  peds.update(dt, time);
}

export class TrafficSystem {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = seededRandom(seed + 31);
    this.cars = [];
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    scene.add(this.group);
    this.signalClock = 0;
    this.meshCache = new Map();
  }

  addCar(type, axis, lane, along, dir) {
    const mesh = trafficMesh(type, this.rng);
    mesh.position.set(axis === 'x' ? along : lane, 0.1, axis === 'x' ? lane : along);
    const car = {
      type, axis, lane, along, dir, speed: this.rng.range(7, 12), target: TRAFFIC.carSpeed,
      x: mesh.position.x, z: mesh.position.z, heading: 0, mesh, phase: this.rng.range(0, 6),
    };
    this.group.add(mesh);
    this.cars.push(car);
    this.face(car);
    return car;
  }

  face(car) {
    const dx = car.axis === 'x' ? car.dir : 0;
    const dz = car.axis === 'z' ? car.dir : 0;
    car.heading = Math.atan2(dx, dz);
    car.mesh.rotation.y = car.heading;
    car.mesh.position.set(car.x, 0.1, car.z);
  }

  update(dt, playerCar) {
    this.signalClock = (this.signalClock + dt) % 22;
    const axisGreen = this.signalClock < 9 ? 'x' : this.signalClock < 18 ? 'z' : 'x';
    for (const car of this.cars) {
      car.target = TRAFFIC.carSpeed;
      const along = car.axis === 'x' ? car.x : car.z;
      // Signal check at the next cross street ahead.
      const cross = car.axis === 'x' ? CITY_LAYOUT.streets : CITY_LAYOUT.avenues;
      let next = null;
      for (const c of cross) {
        const gap = (c - along) * car.dir;
        if (gap > -1 && gap < 11 && (next == null || gap < next.gap)) next = { c, gap };
      }
      if (next && axisGreen !== car.axis && next.gap > 0) car.target = 0;
      // Stop for the car ahead in the same lane.
      for (const other of this.cars) {
        if (other === car || other.axis !== car.axis || Math.abs(other.lane - car.lane) > 1.4) continue;
        const gap = ((car.axis === 'x' ? other.x - car.x : other.z - car.z)) * car.dir;
        if (gap > 0 && gap < 9) car.target = Math.min(car.target, Math.max(0, (gap - 3) * 1.6));
      }
      if (playerCar) {
        const gap = car.axis === 'x' ? (playerCar.pos.x - car.x) * car.dir : (playerCar.pos.z - car.z) * car.dir;
        const side = car.axis === 'x' ? Math.abs(playerCar.pos.z - car.z) : Math.abs(playerCar.pos.x - car.x);
        if (gap > 0 && gap < 10 && side < 3.2) car.target = Math.min(car.target, Math.max(0, (gap - 4) * 1.5));
      }
      car.speed = damp(car.speed, car.target, 2.4, dt);
      car.along += car.speed * car.dir * dt;
      if (car.axis === 'x') car.x = car.along; else car.z = car.along;
      // Occasionally turn at a cross street, snapping into the new lane.
      const nearCross = car.axis === 'x'
        ? CITY_LAYOUT.streets.find((s) => Math.abs(s - car.z) < 1.2)
        : CITY_LAYOUT.avenues.find((a) => Math.abs(a - car.x) < 1.2);
      car.turnCooldown = Math.max(0, (car.turnCooldown || 0) - dt);
      if (nearCross != null && car.turnCooldown === 0 && this.rng.chance(0.32)) {
        const oldAxis = car.axis;
        car.turnCooldown = 6;
        if (oldAxis === 'x') {
          car.axis = 'z'; car.lane = car.z + (this.rng.chance(0.5) ? 3.2 : -3.2);
          car.dir = this.rng.chance(0.5) ? 1 : -1;
        } else {
          car.axis = 'x'; car.lane = car.x + (this.rng.chance(0.5) ? 3.2 : -3.2);
          car.dir = this.rng.chance(0.5) ? 1 : -1;
        }
        car.along = car.axis === 'x' ? car.x : car.z;
      }
      const lim = 315;
      if (car.along > lim) { car.along = -lim; if (car.axis === 'x') car.x = car.along; else car.z = car.along; }
      if (car.along < -lim) { car.along = lim; if (car.axis === 'x') car.x = car.along; else car.z = car.along; }
      this.face(car);
      car.phase += dt * car.speed * 0.4;
    }
  }

  stageNear(x, z, n = 6) {
    for (let i = 0; i < n && i < this.cars.length; i++) {
      const car = this.cars[i];
      const s = i % 2 ? 1 : -1;
      car.x = x + s * (12 + i * 7);
      car.z = z + (i % 2 ? 3.2 : -3.2);
      car.axis = 'x'; car.lane = car.z; car.dir = i % 2 ? 1 : -1; car.along = car.x;
      car.speed = 4; this.face(car);
    }
  }
}

export function fillStreets(traffic, count) {
  const rng = traffic.rng;
  const types = ['sedan', 'van', 'coupe', 'sedan', 'coupe', 'van'];
  const avenues = CITY_LAYOUT.avenues;
  const streets = CITY_LAYOUT.streets;
  for (let i = 0; i < count; i++) {
    const onAvenue = rng.chance(0.55);
    if (onAvenue) {
      const lane = rng.pick(avenues) + (rng.chance(0.5) ? 3.2 : -3.2);
      const along = rng.range(-290, 180);
      traffic.addCar(rng.pick(types), 'z', lane, along, rng.chance(0.5) ? 1 : -1);
    } else {
      const lane = rng.pick(streets) + (rng.chance(0.5) ? 3.2 : -3.2);
      const along = rng.range(-300, 300);
      traffic.addCar(rng.pick(types), 'x', lane, along, rng.chance(0.5) ? 1 : -1);
    }
  }
}

class PedestrianSystem {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = seededRandom(seed + 73);
    this.peds = [];
    this.group = new THREE.Group();
    this.group.name = 'pedestrians';
    scene.add(this.group);
    this.colors = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6, 0xe8735a, 0x2f7f86, 0x8f6a43, 0xcfd8c6];
  }

  spawn() {
    const rng = this.rng;
    const onAvenue = rng.chance(0.45);
    let x, z, axis;
    if (onAvenue) {
      const a = rng.pick(CITY_LAYOUT.avenues);
      x = a + (rng.chance(0.5) ? 12.5 : -12.5);
      z = rng.range(-170, 160);
      axis = 'z';
    } else {
      const s = rng.pick(CITY_LAYOUT.streets);
      z = s + (rng.chance(0.5) ? 12.5 : -12.5);
      x = rng.range(-300, 300);
      axis = 'x';
    }
    if (z > 200) z = rng.range(206, 234);
    const color = rng.pick(this.colors);
    const g = new THREE.Group();
    const scale = rng.range(0.92, 1.08);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.74, 0.28), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    body.position.y = 1.04;
    body.castShadow = true;
    g.add(body);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.68, 0.24), new THREE.MeshStandardMaterial({ color: rng.pick([0x2a2f36, 0x4d5860, 0xd9c9a8]), roughness: 0.9 }));
    legs.position.y = 0.44;
    g.add(legs);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.27), new THREE.MeshStandardMaterial({ color: rng.pick([0xb97c55, 0x8a5a3b, 0xe0b48a]), roughness: 0.8 }));
    head.position.y = 1.57;
    g.add(head);
    g.scale.setScalar(scale);
    g.position.set(x, 0.3, z);
    this.group.add(g);
    return {
      x, z, axis, dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(0.9, 1.7),
      heading: axis === 'x' ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI),
      group: g, body, legs, head, phase: rng.range(0, 6), state: 'walk', fear: 0,
      lane: axis === 'x' ? z : x, baseSpeed: rng.range(0.9, 1.7), color,
    };
  }

  populate(n) {
    for (let i = 0; i < n; i++) this.peds.push(this.spawn());
  }

  scare(x, z, radius = 28, duration = 5, cower = false) {
    for (const p of this.peds) {
      if (dist2(p.x, p.z, x, z) < radius) {
        p.state = cower && this.rng.chance(0.35) ? 'cower' : 'flee';
        p.fear = duration;
        p.runHeading = Math.atan2(p.x - x, p.z - z);
      }
    }
  }

  stageCrowd(x, z, n = 16, side = 'both') {
    for (let i = 0; i < n && i < this.peds.length; i++) {
      const p = this.peds[i];
      const spread = (i % Math.ceil(n / 2));
      const dir = i % 2 ? 1 : -1;
      p.x = x + (i - n / 2) * 3.1 + this.rng.range(-0.7, 0.7);
      p.z = z + (side === 'both' ? dir * this.rng.range(7, 10) : 9);
      p.axis = 'x'; p.dir = dir; p.lane = p.z;
      p.state = i % 3 === 0 ? 'cower' : 'flee';
      p.fear = 20;
      p.runHeading = Math.PI + dir * this.rng.range(0.2, 1.2);
      p.group.position.set(p.x, 0.3, p.z);
      p.group.rotation.y = p.runHeading;
      p.group.visible = true;
    }
  }

  update(dt, time) {
    for (const p of this.peds) {
      if (p.fear > 0) p.fear -= dt;
      else if (p.state !== 'walk') p.state = 'walk';
      let speed = 0;
      if (p.state === 'walk') {
        speed = p.baseSpeed;
        if (p.axis === 'x') {
          p.x += speed * p.dir * dt;
          p.z += Math.sin(time * 0.6 + p.phase) * 0.12 * dt;
          p.heading = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          if (p.x > 310) p.x = -310;
          if (p.x < -310) p.x = 310;
        } else {
          p.z += speed * p.dir * dt;
          p.x += Math.sin(time * 0.5 + p.phase) * 0.1 * dt;
          p.heading = p.dir > 0 ? 0 : Math.PI;
          if (p.z > 200) { p.dir = -1; p.heading = Math.PI; }
          if (p.z < -170) { p.dir = 1; p.heading = 0; }
        }
        // Sidewalk avoidance: step around other pedestrians.
        for (const q of this.peds) {
          if (q === p) continue;
          if (dist2(p.x, p.z, q.x, q.z) < 1.25) {
            p.x += (p.x - q.x) * dt * 0.8;
            p.z += (p.z - q.z) * dt * 0.8;
          }
        }
      } else if (p.state === 'flee') {
        speed = 3.7;
        p.x += Math.sin(p.runHeading) * speed * dt;
        p.z += Math.cos(p.runHeading) * speed * dt;
        p.heading = p.runHeading;
      } else if (p.state === 'cower') {
        speed = 0;
        p.group.scale.y = damp(p.group.scale.y, 0.6, 6, dt);
      }
      if (p.state !== 'cower') p.group.scale.y = damp(p.group.scale.y, 1, 6, dt);
      if (p.z > 239) p.z = 239;
      if (p.z < -285) p.z = -285;
      p.x = clamp(p.x, -318, 318);
      p.z = clamp(p.z, -288, 300);
      p.phase += dt * (speed > 2 ? 15 : 8);
      const s = Math.sin(p.phase) * (speed > 0 ? 0.5 : 0.06);
      p.group.position.set(p.x, 0.3, p.z);
      p.group.rotation.y = damp(p.group.rotation.y, p.heading, 8, dt);
      p.legs.rotation.x = s;
      p.body.rotation.z = Math.sin(p.phase * 0.5) * 0.02;
      if (speed > 2) p.body.rotation.x = 0.15;
      else p.body.rotation.x = 0;
    }
  }
}

function trafficMesh(type, rng) {
  const g = new THREE.Group();
  const palette = {
    sedan: [0xf2f0e8, 0xd9b98a, 0x8f9aa3, 0xe8735a, 0x2f7f86],
    van: [0x4ea6a2, 0xf4ead6, 0xe8b59f, 0x39bdbd],
    coupe: [0xff5a4e, 0xffc35c, 0x2f7f86, 0xf2f0e8, 0x8b2fd6],
  };
  const color = rng.pick(palette[type] || palette.sedan);
  const W = type === 'van' ? 2.15 : type === 'coupe' ? 1.9 : 2.0;
  const L = type === 'van' ? 5.2 : type === 'coupe' ? 4.4 : 4.7;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.7, L), bodyMat);
  body.position.y = 0.65; body.castShadow = true;
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, type === 'van' ? 0.85 : 0.5, L * 0.48), new THREE.MeshStandardMaterial({ color: 0x1c3b44, roughness: 0.2, metalness: 0.6 }));
  cab.position.set(0, type === 'van' ? 1.35 : 1.15, type === 'van' ? -0.25 : 0.1);
  g.add(cab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10), dark);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(sx * W * 0.46, 0.34, sz * L * 0.31);
    g.add(wh);
  }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }));
  lamp.position.set(0, 0.78, L / 2 + 0.01);
  g.add(lamp);
  g.scale.setScalar(1);
  return g;
}
