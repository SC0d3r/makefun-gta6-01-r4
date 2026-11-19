// Vehicle pass: arcade car physics frozen for the r7 entry.
// Stealable vehicles: the Vela GT coupe, Palma 4 sedan, Surf Hauler van, VPB police cruiser and
// Kestrel motorbike. Arcade drive physics with grip, handbrake slides, tyre smoke, skid marks,
// condition damage, visible red/blue police bars and a speed-pulling chase camera.

import { VEHICLE_SPECS, CAMERA } from './config.js';
import { clamp, damp, dist2 } from './rng.js';

export class Vehicle {
  constructor(type = 'coupe', opts = {}) {
    const spec = VEHICLE_SPECS[type] || VEHICLE_SPECS.coupe;
    this.type = type;
    this.spec = spec;
    this.name = spec.label;
    this.pos = new THREE.Vector3(opts.x || 0, 0.2, opts.z || 0);
    this.heading = opts.heading ?? Math.PI;
    this.speed = 0;
    this.steer = 0;
    this.velocity = new THREE.Vector3();
    this.health = spec.health;
    this.maxHealth = spec.health;
    this.driver = null;
    this.siren = !!spec.siren;
    this.lightsOn = !!spec.siren;
    this.steadyLights = false;
    this.sirenPhase = 0;
    this.skidMarks = [];
    this.smoke = [];
    this.wheelSpin = 0;
    this.collisionTimer = 0;
    this.group = new THREE.Group();
    this.group.name = `${spec.label}`;
    this.wheels = [];
    this.build(spec);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  build(spec) {
    const w = spec.width, l = spec.length, h = spec.height;
    const bodyMat = new THREE.MeshStandardMaterial({ color: spec.body, roughness: 0.42, metalness: 0.32 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.55, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x123640, roughness: 0.15, metalness: 0.75 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xc9d3d2, roughness: 0.25, metalness: 0.85 });
    const box = (bw, bh, bd, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    if (this.type === 'motorbike') {
      this.buildBike(spec, bodyMat, trim, chrome);
      return;
    }
    const low = h * 0.38;
    box(w, low, l, bodyMat, 0, 0.36 + low / 2, 0);
    box(w * 0.97, low * 0.6, l * 0.96, bodyMat, 0, 0.36 + low * 1.25, 0);
    const cab = box(w * 0.8, h * 0.46, l * (spec.style === 'van' ? 0.62 : 0.46), glass, 0, 0.6 + low * 1.2, spec.style === 'van' ? -0.35 : 0.05);
    if (spec.style === 'van') {
      box(w * 0.83, h * 0.42, l * 0.6, bodyMat, 0, 0.55 + low * 1.35, -0.3);
    } else {
      box(w * 0.76, h * 0.14, l * 0.42, bodyMat, 0, 1.0 + low, 0.02);
    }
    box(w * 0.9, 0.16, l * 0.98, trim, 0, 0.34, 0);
    box(w * 0.86, 0.16, 0.22, chrome, 0, 0.48, l / 2 - 0.02);
    box(w * 0.96, 0.2, 0.28, trim, 0, 0.4, -l / 2 + 0.06);
    // Headlights and tail lights.
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false });
    const tail = new THREE.MeshBasicMaterial({ color: 0xff2b2b, toneMapped: false });
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, 0.12, 0.06), lamp);
      hl.position.set(sx * w * 0.3, 0.7, l / 2 + 0.01);
      this.group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.26, 0.13, 0.06), tail);
      tl.position.set(sx * w * 0.28, 0.72, -l / 2 - 0.01);
      this.group.add(tl);
    }
    // Plate with the car's own name on the rear.
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), new THREE.MeshBasicMaterial({
      map: plateTexture(spec.label), transparent: true, toneMapped: false,
    }));
    plate.position.set(0, 0.55, -l / 2 - 0.08);
    plate.rotation.y = Math.PI;
    this.group.add(plate);
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(wheelGeo, trim);
      wh.position.set(sx * (w / 2 - 0.06), 0.36, sz * spec.wheelBase / 2);
      wh.castShadow = true;
      this.group.add(wh);
      this.wheels.push({ mesh: wh, front: sz > 0 });
    }
    if (this.type === 'police') {
      // High, chunky light bar: both halves stay visible when lit so a still frame reads red+blue.
      const barMatR = new THREE.MeshBasicMaterial({ color: 0xff2b3d, toneMapped: false });
      const barMatB = new THREE.MeshBasicMaterial({ color: 0x2f8bff, toneMapped: false });
      const barW = w * 0.38;
      for (const sx of [-1, 1]) {
        const post = box(0.08, 0.7, 0.08, trim, sx * w * 0.3, 1.85, 0);
        const half = new THREE.Mesh(new THREE.BoxGeometry(barW, 0.26, 0.34), sx < 0 ? barMatR : barMatB);
        half.position.set(sx * (barW / 2 + 0.01), 2.2, 0);
        this.group.add(half);
        if (sx < 0) this.lightRed = half; else this.lightBlue = half;
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), color: sx < 0 ? 0xff3344 : 0x3388ff, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
        }));
        glow.scale.set(2.1, 1.3, 1);
        glow.position.set(sx * (barW / 2 + 0.01), 2.22, 0);
        this.group.add(glow);
        if (sx < 0) this.glowRed = glow; else this.glowBlue = glow;
      }
      // Cream body with a teal VPB stripe.
      for (const sx of [-1, 1]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, l * 0.7), new THREE.MeshBasicMaterial({ color: 0x2f7f86 }));
        stripe.position.set(sx * (w / 2 + 0.01), 0.72, 0);
        this.group.add(stripe);
      }
      const crest = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.4), new THREE.MeshBasicMaterial({ map: policeCrest(), transparent: true, toneMapped: false }));
      crest.position.set(0, 0.95, l / 2 + 0.02);
      this.group.add(crest);
      this.group.userData.barLight = true;
    }
    if (spec.style === 'sleek') {
      const spoiler = box(w * 0.9, 0.08, 0.34, trim, 0, 1.12, -l / 2 + 0.35);
      box(0.08, 0.22, 0.26, trim, -w * 0.38, 1.0, -l / 2 + 0.35);
      box(0.08, 0.22, 0.26, trim, w * 0.38, 1.0, -l / 2 + 0.35);
    }
    this.wheelRadius = 0.36;
    this.halfW = w / 2;
    this.halfL = l / 2;
  }

  buildBike(spec, bodyMat, trim, chrome) {
    const w = spec.width, l = spec.length;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.28, l * 0.75), bodyMat);
    frame.position.y = 0.78;
    this.group.add(frame);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.18, 1.0), trim);
    seat.position.set(0, 0.98, -0.2);
    this.group.add(seat);
    const tank = new THREE.Mesh(new THREE.BoxGeometry(w * 0.65, 0.4, 0.9), bodyMat);
    tank.position.set(0, 1.02, 0.4);
    this.group.add(tank);
    for (const z of [-0.85, 0.9]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 14), trim);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.38, z);
      this.group.add(wheel);
      this.wheels.push({ mesh: wheel, front: z > 0 });
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.25, 0.7);
    this.group.add(bar);
    this.wheelRadius = 0.38;
    this.halfW = 0.4;
    this.halfL = 1.1;
  }

  applyControls(controls) {
    this.controls = controls;
  }

  update(dt, world) {
    drivePhysics(this, dt, this.controls || {}, world);
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.wrecked = true;
  }

  emitSkid(hold = false) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x15181b, transparent: true, opacity: 0.55, depthWrite: false });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.8), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -this.heading;
      const off = new THREE.Vector3(Math.cos(this.heading) * side * this.halfW * 0.8, 0, -Math.sin(this.heading) * side * this.halfW * 0.8);
      m.position.set(this.pos.x + off.x - Math.sin(this.heading) * 1.1, 0.08, this.pos.z + off.z - Math.cos(this.heading) * 1.1);
      this.group.parent?.add(m);
      this.skidMarks.push({ mesh: m, life: hold ? 999 : 8 });
    }
    while (this.skidMarks.length > 240) {
      const old = this.skidMarks.shift();
      old.mesh.parent?.remove(old.mesh);
    }
  }

  puffSmoke(hold = false) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTexture(), color: 0xd8d2c8, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false,
    }));
    const back = new THREE.Vector3(-Math.sin(this.heading) * 2, 0.35, -Math.cos(this.heading) * 2);
    const side = new THREE.Vector3(Math.cos(this.heading) * (Math.random() - 0.5) * 2, 0, -Math.sin(this.heading) * (Math.random() - 0.5) * 2);
    s.position.set(this.pos.x + back.x + side.x, 0.5 + Math.random() * 0.3, this.pos.z + back.z + side.z);
    s.scale.set(1 + Math.random(), 1 + Math.random(), 1);
    this.group.parent?.add(s);
    this.smoke.push({ sprite: s, life: hold ? 999 : 0.9, vy: 0.9 + Math.random() * 0.7 });
  }

  tickEffects(dt) {
    for (const sk of this.skidMarks) {
      if (!sk.life || sk.life > 900) continue;
      sk.life -= dt;
      sk.mesh.material.opacity = Math.max(0, sk.life / 8) * 0.55;
    }
    this.skidMarks = this.skidMarks.filter((sk) => {
      if (sk.life <= 0) { sk.mesh.parent?.remove(sk.mesh); return false; }
      return true;
    });
    for (const p of this.smoke) {
      if (p.life > 900) continue;
      p.life -= dt;
      p.sprite.position.y += p.vy * dt;
      p.sprite.scale.addScalar(dt * 1.8);
      p.sprite.material.opacity = Math.max(0, p.life / 0.9) * 0.45;
    }
    this.smoke = this.smoke.filter((p) => {
      if (p.life <= 0) { p.sprite.parent?.remove(p.sprite); return false; }
      return true;
    });
    this.sirenPhase += dt * 9;
    if (this.lightRed && this.lightsOn) {
      const a = this.steadyLights ? 1 : 0.55 + Math.sin(this.sirenPhase) * 0.45;
      const b = this.steadyLights ? 1 : 0.55 + Math.sin(this.sirenPhase + Math.PI) * 0.45;
      this.lightRed.material.color.setRGB(1, 0.16 * a + 0.05, 0.2 * a + 0.05);
      this.lightBlue.material.color.setRGB(0.14 * b + 0.05, 0.5 * b + 0.1, 1);
      if (this.glowRed) this.glowRed.material.opacity = 0.4 + a * 0.6;
      if (this.glowBlue) this.glowBlue.material.opacity = 0.4 + b * 0.6;
    }
  }
}

export function createVehicle(scene, type, x, z, heading = 0, opts = {}) {
  const v = new Vehicle(type, { x, z, heading, ...opts });
  if (scene) scene.add(v.group);
  return v;
}

export function drivePhysics(v, dt, controls, world) {
  const spec = v.spec;
  const throttle = controls.throttle || 0;
  const brake = controls.brake ? 1 : 0;
  const steerInput = controls.steer || 0;
  const handbrake = !!controls.handbrake;
  if (v.wrecked) v.speed = damp(v.speed, 0, 3, dt);
  const maxSpeed = spec.top;
  if (throttle > 0) v.speed += spec.accel * throttle * dt;
  if (throttle < 0) v.speed += spec.accel * throttle * 0.7 * dt;
  if (brake) v.speed = Math.sign(v.speed) * Math.max(0, Math.abs(v.speed) - spec.brake * dt);
  if (handbrake) v.speed = Math.sign(v.speed) * Math.max(0, Math.abs(v.speed) - spec.brake * 0.55 * dt);
  const drag = 0.55 + Math.abs(v.speed) * 0.022;
  v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), drag * dt);
  v.speed = clamp(v.speed, -maxSpeed * 0.35, maxSpeed);
  v.steer = damp(v.steer, steerInput, 10, dt);
  const gripFactor = 1 - (handbrake ? 0.55 : 0.08);
  const speedFactor = clamp(Math.abs(v.speed) / 5, 0, 1);
  const turn = v.steer * spec.turn * speedFactor * (v.speed < 0 ? -1 : 1) * gripFactor;
  v.heading += turn * dt * 1.35;
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const rx = Math.cos(v.heading), rz = -Math.sin(v.heading);
  let vf = v.velocity.x * fx + v.velocity.z * fz;
  let vl = v.velocity.x * rx + v.velocity.z * rz;
  vf = damp(vf, v.speed, handbrake ? 3.2 : 8.5, dt);
  vl *= Math.exp(-(handbrake ? 1.3 : spec.grip) * dt);
  v.velocity.x = fx * vf + rx * vl;
  v.velocity.z = fz * vf + rz * vl;
  v.pos.x += v.velocity.x * dt;
  v.pos.z += v.velocity.z * dt;
  v.pos.y = 0.2;
  if (world && world.colliders) {
    const r = v.halfW * 0.9;
    for (const c of world.colliders) {
      if (v.pos.x > c.minX - r && v.pos.x < c.maxX + r && v.pos.z > c.minZ - r && v.pos.z < c.maxZ + r) {
        const dl = Math.abs(v.pos.x - (c.minX - r));
        const dr = Math.abs(c.maxX + r - v.pos.x);
        const dn = Math.abs(v.pos.z - (c.minZ - r));
        const df = Math.abs(c.maxZ + r - v.pos.z);
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) v.pos.x = c.minX - r;
        else if (m === dr) v.pos.x = c.maxX + r;
        else if (m === dn) v.pos.z = c.minZ - r;
        else v.pos.z = c.maxZ + r;
        if (Math.abs(v.speed) > 8) v.damage(Math.abs(v.speed) * 0.5);
        v.speed *= -0.22;
        v.velocity.multiplyScalar(0.2);
        if (v.collisionTimer <= 0) {
          v.collisionTimer = 0.4;
          if (world.onCrash) world.onCrash(v);
        }
        break;
      }
    }
  }
  if (v.pos.z > 236) { v.pos.z = 236; v.speed *= 0.2; v.velocity.z *= -0.2; }
  const b = world?.bounds;
  if (b) {
    if (v.pos.x < b.minX || v.pos.x > b.maxX) { v.pos.x = clamp(v.pos.x, b.minX, b.maxX); v.speed *= 0.3; }
    if (v.pos.z < b.minZ) { v.pos.z = b.minZ; v.speed *= 0.3; }
  }
  v.collisionTimer = Math.max(0, v.collisionTimer - dt);
  v.wheelSpin += v.speed * dt * 2.2;
  for (const whe of v.wheels) {
    whe.mesh.rotation.x = v.wheelSpin;
    if (whe.front) whe.mesh.rotation.y = v.steer * 0.42;
  }
  const slip = Math.abs(vl);
  v.slip = slip;
  if (handbrake && Math.abs(v.speed) > 6) {
    v.skidTimer = (v.skidTimer || 0) + dt;
    if (v.skidTimer > 0.05) { v.skidTimer = 0; v.emitSkid(); v.puffSmoke(); }
  }
  v.group.position.copy(v.pos);
  v.group.rotation.y = v.heading;
  v.group.rotation.z = damp(v.group.rotation.z, -v.steer * clamp(v.speed / 30, 0, 1) * 0.09, 8, dt);
  v.group.rotation.x = damp(v.group.rotation.x, throttle < 0 ? 0.02 : -throttle * 0.018, 6, dt);
  if (v.health < v.maxHealth * 0.35 && Math.random() < dt * 5) v.puffSmoke();
  v.health = Math.max(0, v.health);
  v.tickEffects(dt);
  if (v.lightRed && v.lightsOn) v.tickEffects(0);
}

export function enterVehicle(player, vehicle) {
  if (!vehicle || vehicle.driver) return false;
  if (dist2(player.pos.x, player.pos.z, vehicle.pos.x, vehicle.pos.z) > 3.2) return false;
  player.inVehicle = vehicle;
  player.setVisible(false);
  vehicle.driver = player;
  vehicle.controls = { throttle: 0, brake: false, steer: 0, handbrake: false };
  return true;
}

export function exitVehicle(vehicle, player, world) {
  if (!vehicle || !vehicle.driver) return false;
  const side = new THREE.Vector3(Math.cos(vehicle.heading) * 1.9, 0, -Math.sin(vehicle.heading) * 1.9);
  player.pos.set(vehicle.pos.x + side.x, 0.35, vehicle.pos.z + side.z);
  player.inVehicle = null;
  player.hp = player.health;
  vehicle.driver = null;
  vehicle.speed = 0;
  vehicle.controls = null;
  player.setVisible(true);
  if (player.pos.z > 236 && world?.colliders) player.pos.z = 236;
  return true;
}

export function chaseCamera(vehicle, camera, dt = 0.016, opts = {}) {
  const arm = opts.arm ?? CAMERA.car.arm;
  const height = opts.height ?? CAMERA.car.height;
  const lateral = opts.lateral ?? 0;
  const ahead = opts.ahead ?? CAMERA.car.look;
  const fov = opts.fov ?? CAMERA.car.fov;
  const h = vehicle.heading;
  const back = new THREE.Vector3(-Math.sin(h) * arm, 0, -Math.cos(h) * arm);
  const side = new THREE.Vector3(Math.cos(h) * lateral, 0, -Math.sin(h) * lateral);
  camera.position.set(vehicle.pos.x + back.x + side.x, vehicle.pos.y + height, vehicle.pos.z + back.z + side.z);
  camera.lookAt(vehicle.pos.x + Math.sin(h) * ahead + side.x * 0.3, 0.6 + (opts.targetHeight ?? 0), vehicle.pos.z + Math.cos(h) * ahead + side.z * 0.3);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  return camera;
}

function plateTexture(name) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4ead6';
  ctx.fillRect(0, 0, 128, 40);
  ctx.strokeStyle = '#1d3f4a'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 124, 36);
  ctx.fillStyle = '#1d3f4a';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 11).toUpperCase(), 64, 21);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function policeCrest() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 80;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#14555f';
  ctx.beginPath();
  ctx.moveTo(10, 8); ctx.lineTo(118, 8); ctx.lineTo(108, 60); ctx.lineTo(64, 76); ctx.lineTo(20, 60); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffc35c'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#f4ead6'; ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('VPB', 64, 46);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let smokeTex = null;
function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.55, 'rgba(230,225,215,0.4)');
  g.addColorStop(1, 'rgba(220,215,205,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  smokeTex = new THREE.CanvasTexture(c);
  return smokeTex;
}
