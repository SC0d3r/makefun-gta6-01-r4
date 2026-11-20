// Player pass: on-foot movement and combat frozen for the r7 entry.
// Rico Vela on foot: a box-built courier with a walk cycle, sprint, jump, sea and building
// collision, armour, weapon slots, muzzle flashes and frozen-in-air tracer rounds.
// r13 city-systems pass: on-foot movement is unchanged.

import { PLAYER, WEAPONS } from './config.js';
import { clamp, damp, dist2 } from './rng.js';
import { isOnDock, dockTop } from './city.js';

export class PlayerController {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'rico-vela';
    this.pos = new THREE.Vector3(PLAYER.respawn.x, 0.32, PLAYER.respawn.z);
    this.vel = new THREE.Vector3();
    this.heading = Math.PI;
    this.pitch = 0;
    this.health = PLAYER.maxHealth;
    this.armour = 65;
    this.weapon = 'smg';
    this.ammo = { pistol: 48, smg: 150 };
    this.fireCooldown = 0;
    this.phase = 0;
    this.grounded = true;
    this.inVehicle = null;
    this.dead = false;
    this.flashTimer = 0;
    this.tracers = [];
    this.wantedScare = 0;
    this.buildModel();
    scene.add(this.group);
  }

  buildModel() {
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe8735a, roughness: 0.85 });
    const jacket = new THREE.MeshStandardMaterial({ color: 0x1c4d55, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xb97c55, roughness: 0.75 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x241a17, roughness: 0.9 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.8 });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    this.torso = box(0.6, 0.72, 0.32, jacket, 0, 1.16, 0);
    this.chest = box(0.52, 0.42, 0.34, shirt, 0, 1.26, 0.02);
    this.head = box(0.34, 0.36, 0.33, skin, 0, 1.74, 0);
    this.hairMesh = box(0.36, 0.14, 0.35, hair, 0, 1.93, 0);
    this.armL = box(0.16, 0.66, 0.18, shirt, -0.39, 1.16, 0);
    this.armR = box(0.16, 0.66, 0.18, shirt, 0.39, 1.16, 0);
    this.legL = box(0.2, 0.8, 0.24, pants, -0.16, 0.42, 0);
    this.legR = box(0.2, 0.8, 0.24, pants, 0.16, 0.42, 0);
    this.shoeL = box(0.22, 0.14, 0.34, shoe, -0.16, 0.07, 0.05);
    this.shoeR = box(0.22, 0.14, 0.34, shoe, 0.16, 0.07, 0.05);
    this.gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.5, metalness: 0.5 }));
    barrel.position.z = 0.3;
    this.gun.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.14), new THREE.MeshStandardMaterial({ color: 0x2d343b, roughness: 0.7 }));
    mag.position.set(0, -0.17, 0.1);
    this.gun.add(mag);
    this.gun.position.set(0.42, 1.28, 0.42);
    this.group.add(this.gun);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: muzzleTexture(), color: 0xffd27a, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false,
    }));
    this.flash.scale.set(1.5, 1.5, 1);
    this.flash.position.set(0, 0, 0.65);
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  aimAt(x, y, z) {
    this.heading = Math.atan2(x - this.pos.x, z - this.pos.z);
    const flat = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.pitch = Math.atan2(y - (this.pos.y + 1.35), flat);
  }

  muzzleWorld(out = new THREE.Vector3()) {
    out.set(
      this.pos.x + Math.sin(this.heading) * 0.75 + Math.cos(this.heading) * 0.36,
      this.pos.y + 1.32 + Math.sin(this.pitch) * 0.35,
      this.pos.z + Math.cos(this.heading) * 0.75 - Math.sin(this.heading) * 0.36,
    );
    return out;
  }

  fire(target, opts = {}) {
    if (this.dead || this.fireCooldown > 0 || this.inVehicle) return null;
    const spec = WEAPONS[this.weapon];
    if (spec.ammo >= 0 && this.ammo[this.weapon] <= 0) return null;
    if (this.ammo[this.weapon] != null) this.ammo[this.weapon] = Math.max(0, this.ammo[this.weapon] - 1);
    this.fireCooldown = spec.rate;
    this.flashTimer = opts.hold ? 99 : 0.07;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI;
    const from = this.muzzleWorld();
    const dir = new THREE.Vector3().subVectors(target, from).normalize();
    const to = from.clone().addScaledVector(dir, spec.range * (opts.range || 0.5));
    this.addTracer(from, to, opts);
    return { from, to, spec };
  }

  addTracer(from, to, opts = {}) {
    const len = from.distanceTo(to);
    const geo = new THREE.BoxGeometry(0.045, 0.045, len);
    const mat = new THREE.MeshBasicMaterial({ color: opts.color || 0xffe9a8, transparent: true, opacity: 0.95, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: opts.hold ? 999 : 0.11, hold: !!opts.hold });
    return mesh;
  }

  takeDamage(amount) {
    if (this.dead) return;
    const armourPart = Math.min(this.armour, amount * 0.62);
    this.armour -= armourPart;
    this.health -= amount - armourPart;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
  }

  revive(x = PLAYER.respawn.x, z = PLAYER.respawn.z) {
    this.health = PLAYER.maxHealth;
    this.armour = 40;
    this.dead = false;
    this.pos.set(x, 0.32, z);
    this.vel.set(0, 0, 0);
    this.group.visible = true;
  }

  setVisible(v) { this.group.visible = v; }

  update(dt, input, cameraYaw, city, hooks = {}) {
    if (this.inVehicle) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    if (this.dead) { this.animateWalk(0, dt); return; }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    const forward = (input.isPressed('KeyW', 'ArrowUp') ? 1 : 0) - (input.isPressed('KeyS', 'ArrowDown') ? 1 : 0);
    const strafe = (input.isPressed('KeyD', 'ArrowRight') ? 1 : 0) - (input.isPressed('KeyA', 'ArrowLeft') ? 1 : 0);
    const sprint = input.isPressed('ShiftLeft', 'ShiftRight');
    const speed = sprint ? PLAYER.sprint : PLAYER.walk;
    const yaw = cameraYaw;
    let mx = Math.sin(yaw) * forward - Math.cos(yaw) * strafe;
    let mz = Math.cos(yaw) * forward + Math.sin(yaw) * strafe;
    const mag = Math.hypot(mx, mz);
    if (mag > 0.001) {
      mx /= mag; mz /= mag;
      this.heading = damp(this.heading, Math.atan2(mx, mz), 14, dt);
    }
    const accel = this.grounded ? 14 : 3;
    this.vel.x = damp(this.vel.x, mx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * speed, accel, dt);
    if (input.wasPressed('Space') && this.grounded) {
      this.vel.y = PLAYER.jump;
      this.grounded = false;
    }
    this.vel.y -= 15 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.resolveWorld(city);
    const top = this.pos.z > 238 ? dockTop(this.pos.x, this.pos.z) + 0.32 : 0.34;
    if (this.pos.y <= top) {
      this.pos.y = top;
      this.vel.y = 0;
      this.grounded = true;
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.animateWalk(moving, dt, sprint);
    this.group.rotation.z = 0;
    this.gun.rotation.x = -this.pitch * 0.8;
    for (const tr of this.tracers) {
      tr.life -= dt;
      if (!tr.hold) tr.mesh.material.opacity = clamp(tr.life * 12, 0, 0.95);
    }
    this.tracers = this.tracers.filter((tr) => {
      if (tr.life <= 0) { this.scene.remove(tr.mesh); tr.mesh.geometry.dispose(); tr.mesh.material.dispose(); return false; }
      return true;
    });
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      this.flash.visible = this.flashTimer > 0 || this.flashTimer > 90;
    } else this.flash.visible = false;
  }

  resolveWorld(city) {
    const r = PLAYER.radius;
    const cols = city.colliders || [];
    for (const c of cols) {
      if (this.pos.y > (c.height || 2) + 0.2) continue;
      if (this.pos.x > c.minX - r && this.pos.x < c.maxX + r && this.pos.z > c.minZ - r && this.pos.z < c.maxZ + r) {
        const dl = Math.abs(this.pos.x - (c.minX - r));
        const dr = Math.abs(c.maxX + r - this.pos.x);
        const dn = Math.abs(this.pos.z - (c.minZ - r));
        const df = Math.abs(c.maxZ + r - this.pos.z);
        const m = Math.min(dl, dr, dn, df);
        if (m === dl) this.pos.x = c.minX - r;
        else if (m === dr) this.pos.x = c.maxX + r;
        else if (m === dn) this.pos.z = c.minZ - r;
        else this.pos.z = c.maxZ + r;
      }
    }
    if (this.pos.z > 236 && !isOnDock(this.pos.x, this.pos.z)) this.pos.z = 236;
    this.pos.x = clamp(this.pos.x, -318, 318);
    this.pos.z = clamp(this.pos.z, -288, 298);
  }

  animateWalk(speed, dt, sprint = false) {
    if (speed > 0.25) this.phase += dt * (sprint ? 13 : 8.5);
    const swing = Math.min(speed / 4, 1.4);
    const s = Math.sin(this.phase) * 0.55 * swing;
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.8;
    this.armR.rotation.x = s * 0.8 - 0.5;
    this.shoeL.position.z = 0.05 + Math.sin(this.phase) * 0.16 * swing;
    this.shoeR.position.z = 0.05 - Math.sin(this.phase) * 0.16 * swing;
    this.torso.rotation.z = Math.sin(this.phase * 0.5) * 0.03 * swing;
    this.head.rotation.y = Math.sin(this.phase * 0.3) * 0.08;
  }
}

export function updatePlayer(player, dt, input, cameraYaw, city, hooks) {
  player.update(dt, input, cameraYaw, city, hooks);
}

export function animateWalk(player, speed, dt, sprint) {
  player.animateWalk(speed, dt, sprint);
}

let muzzleTex = null;
function muzzleTexture() {
  if (muzzleTex) return muzzleTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.3, 'rgba(255,214,110,0.95)');
  g.addColorStop(0.65, 'rgba(255,120,40,0.45)');
  g.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  muzzleTex = new THREE.CanvasTexture(c);
  muzzleTex.encoding = THREE.sRGBEncoding;
  return muzzleTex;
}

export function damagePlayer(player, amount) { player.takeDamage(amount); }
export function playerNear(player, x, z, r = 3) { return dist2(player.pos.x, player.pos.z, x, z) < r; }
