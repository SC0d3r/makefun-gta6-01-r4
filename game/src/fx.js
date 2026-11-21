import { seededRandom } from './rng.js';

// Burning wreck effects: four pooled sprite kinds, charred car bodies and firelight.
const CAPS = { smoke: 150, flame: 60, embers: 90, debris: 40 };
const POOL_KEYS = ['smoke', 'flame', 'embers', 'debris'];
const RATES = { smoke: 0.075, flame: 0.045, embers: 0.07, debris: 0.6 };
const TAU = Math.PI * 2;
const GRAVITY = 9.8;
const GROUND = 0.06;

function makeSoftTexture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  [[0, 1], [0.4, 0.7], [1, 0]].forEach(([stop, alpha]) => grad.addColorStop(stop, `rgba(255,255,255,${alpha})`));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true; return texture;
}

function makeParticle(material) {
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  sprite.frustumCulled = false;
  return { sprite, active: false, age: 0, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, phase: 0, landed: false };
}

function makePool(scene, material, cap) {
  const items = [];
  for (let i = 0; i < cap; i += 1) {
    const particle = makeParticle(material); scene.add(particle.sprite);
    items.push(particle);
  }
  return { items, cursor: 0 };
}

function takeParticle(pool) {
  const items = pool.items;
  for (let i = 0; i < items.length; i += 1) {
    const index = (pool.cursor + i) % items.length;
    if (!items[index].active) { pool.cursor = (index + 1) % items.length; return items[index]; }
  }
  return null;
}

function releaseParticle(p) { p.active = false; p.sprite.visible = false; }

function placeParticle(p) { p.sprite.position.set(p.x, p.y, p.z); p.sprite.scale.setScalar(p.size); p.sprite.visible = true; }

function emitParticle(fx, kind, emitter) {
  const particle = takeParticle(fx.pools[kind]);
  if (!particle) return;
  const rand = fx.rand;
  const angle = rand.range(0, TAU); const radius = rand.range(0.1, 0.9);
  particle.x = emitter.x + Math.cos(angle) * radius;
  particle.z = emitter.z + Math.sin(angle) * radius;
  particle.phase = rand.range(0, TAU);
  particle.landed = false; particle.age = 0; particle.active = true;
  if (kind === 'smoke') {
    particle.y = rand.range(0.7, 1.35); particle.life = rand.range(5, 8);
    particle.vx = Math.cos(angle) * rand.range(0.08, 0.4); particle.vz = Math.sin(angle) * rand.range(0.08, 0.4);
    particle.vy = rand.range(0.55, 1.1); particle.size = rand.range(0.7, 1.35); particle.grow = rand.range(0.9, 1.6);
  } else if (kind === 'flame') {
    particle.y = rand.range(0.35, 0.9); particle.life = rand.range(0.35, 0.85);
    particle.vx = Math.cos(angle) * rand.range(0.05, 0.3); particle.vz = Math.sin(angle) * rand.range(0.05, 0.3);
    particle.vy = rand.range(0.7, 1.7); particle.size = rand.range(0.35, 0.9);
  } else if (kind === 'embers') {
    const speed = rand.range(1.2, 3.8);
    particle.y = rand.range(0.5, 1.2); particle.life = rand.range(1.1, 2.4);
    particle.vx = Math.cos(angle) * speed; particle.vz = Math.sin(angle) * speed;
    particle.vy = rand.range(2.2, 5.2); particle.size = rand.range(0.06, 0.15);
  } else {
    const speed = rand.range(1.5, 4);
    particle.y = rand.range(0.5, 1); particle.life = rand.range(3.2, 5);
    particle.vx = Math.cos(angle) * speed; particle.vz = Math.sin(angle) * speed;
    particle.vy = rand.range(3, 6); particle.size = rand.range(0.1, 0.26);
  }
  placeParticle(particle);
}

export function createFx(scene, seed) {
  const rand = seededRandom(seed);
  const texture = makeSoftTexture();
  const spriteMaterial = (color, opacity, additive) => new THREE.SpriteMaterial({
    map: texture, color, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const materials = {
    smoke: spriteMaterial(0x2b2826, 0.42, false),
    flame: spriteMaterial(0xff8a2e, 0.92, true),
    embers: spriteMaterial(0xffb44a, 1, true),
    debris: spriteMaterial(0x1a1512, 0.95, false),
  };
  const bodyMaterials = {
    char: new THREE.MeshStandardMaterial({ color: 0x17161a, roughness: 0.95, metalness: 0.15 }),
    burnt: new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 1, metalness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2f3a3d, roughness: 0.35, metalness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 1, metalness: 0 }),
  };
  return {
    scene, rand, texture, materials, bodyMaterials, emitters: [], groups: [], time: 0,
    pools: {
      smoke: makePool(scene, materials.smoke, CAPS.smoke),
      flame: makePool(scene, materials.flame, CAPS.flame),
      embers: makePool(scene, materials.embers, CAPS.embers),
      debris: makePool(scene, materials.debris, CAPS.debris),
    },
  };
}

export function spawnWreck(fx, x, z, heading) {
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.rotation.y = heading;
  const addBox = (w, h, d, px, py, pz, material, roll) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py, pz); mesh.rotation.z = roll || 0;
    mesh.castShadow = false; mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };
  addBox(4.2, 0.7, 1.9, 0, 0.62, 0, fx.bodyMaterials.char);
  addBox(1.5, 0.34, 1.72, 1.28, 1.02, 0, fx.bodyMaterials.burnt, -0.09);
  addBox(1.1, 0.42, 1.78, -1.52, 0.98, 0, fx.bodyMaterials.burnt, 0.04);
  addBox(1.72, 0.26, 1.58, -0.22, 1.42, 0, fx.bodyMaterials.char, 0.2);
  addBox(1.5, 0.06, 0.08, -0.2, 1.3, 0.79, fx.bodyMaterials.glass);
  addBox(1.5, 0.06, 0.08, -0.2, 1.3, -0.79, fx.bodyMaterials.glass);
  addBox(0.06, 0.07, 1.45, 0.52, 1.3, 0, fx.bodyMaterials.glass);
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  for (let i = 0; i < 4; i += 1) {
    const wheel = new THREE.Mesh(wheelGeometry, fx.bodyMaterials.rubber);
    wheel.position.set(i < 2 ? 1.32 : -1.32, 0.38, i % 2 ? -0.96 : 0.96);
    wheel.rotation.x = Math.PI / 2; wheel.castShadow = false; wheel.receiveShadow = false;
    group.add(wheel);
  }
  const light = new THREE.PointLight(0xff7a2b, 2.4, 14, 2);
  light.position.set(0, 1.85, 0); light.castShadow = false;
  group.add(light);
  const emitter = {
    x, z, heading, light, group, phase: fx.rand.range(0, TAU), baseIntensity: 2.4,
    smokeAcc: 0, flameAcc: 0, emberAcc: 0, debrisAcc: 0,
  };
  fx.emitters.push(emitter); fx.groups.push(group); fx.scene.add(group);
  return { group, light, emitter };
}

function spawnBurst(fx, emitter, kind, acc, rate, step) {
  emitter[acc] += step;
  while (emitter[acc] >= rate) {
    emitter[acc] -= rate;
    emitParticle(fx, kind, emitter);
  }
}

function advancePool(fx, kind, dt) {
  const items = fx.pools[kind].items;
  for (let i = 0; i < items.length; i += 1) {
    const particle = items[i];
    if (!particle.active) continue;
    particle.age += dt;
    if (particle.age >= particle.life) { releaseParticle(particle); continue; }
    const t = particle.age / particle.life;
    if (kind === 'smoke') {
      particle.x += (particle.vx + Math.sin(particle.age * 1.3 + particle.phase) * 0.22) * dt;
      particle.z += (particle.vz + Math.cos(particle.age * 1.1 + particle.phase) * 0.2) * dt;
      particle.y += particle.vy * dt; particle.vy += 0.08 * dt;
      const fade = t > 0.68 ? 1 - (t - 0.68) / 0.32 : 1;
      particle.sprite.scale.setScalar(Math.max(0.001, (particle.size + particle.grow * t * 2.6) * fade));
    } else if (kind === 'flame') {
      const drag = 1 - Math.min(0.9, dt * 2.6);
      particle.vx *= drag; particle.vz *= drag; particle.vy *= 1 - Math.min(0.9, dt * 1.4);
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.z += particle.vz * dt;
      const flicker = 0.72 + 0.28 * Math.sin(particle.age * 26 + particle.phase)
        + 0.12 * Math.sin(particle.age * 61 + particle.phase * 2);
      particle.sprite.scale.setScalar(Math.max(0.001, particle.size * flicker * (1 - t * 0.55)));
    } else if (kind === 'embers') {
      if (particle.y < GROUND) { releaseParticle(particle); continue; }
      particle.vy -= GRAVITY * 0.55 * dt;
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.z += particle.vz * dt;
      const fade = t > 0.5 ? 1 - (t - 0.5) / 0.5 : 1;
      particle.sprite.scale.setScalar(Math.max(0.001, particle.size * fade));
    } else {
      if (!particle.landed) {
        particle.vy -= GRAVITY * dt;
        particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.z += particle.vz * dt;
        if (particle.y <= GROUND) {
          particle.y = GROUND; particle.landed = true;
          particle.vx = 0; particle.vy = 0; particle.vz = 0;
        }
      }
      const fade = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      particle.sprite.scale.setScalar(Math.max(0.001, particle.size * fade));
    }
    particle.sprite.position.set(particle.x, particle.y, particle.z);
  }
}

export function updateFx(fx, dt) {
  const step = Math.min(dt, 0.05);
  fx.time += step;
  for (let i = 0; i < fx.emitters.length; i += 1) {
    const emitter = fx.emitters[i];
    spawnBurst(fx, emitter, 'smoke', 'smokeAcc', RATES.smoke, step);
    spawnBurst(fx, emitter, 'flame', 'flameAcc', RATES.flame, step);
    spawnBurst(fx, emitter, 'embers', 'emberAcc', RATES.embers, step);
    spawnBurst(fx, emitter, 'debris', 'debrisAcc', RATES.debris, step);
    const flicker = 0.72 + 0.16 * Math.sin(fx.time * 13.7 + emitter.phase) + 0.12 * fx.rand.next();
    emitter.light.intensity = emitter.baseIntensity * flicker;
    emitter.light.position.x = Math.sin(fx.time * 9.3 + emitter.phase) * 0.12; emitter.light.position.z = Math.cos(fx.time * 8.1 + emitter.phase) * 0.12;
  }
  fx.materials.flame.color.setHSL(0.055 + 0.02 * Math.sin(fx.time * 7.3), 1, 0.52 + 0.06 * Math.sin(fx.time * 11.1));
  for (let k = 0; k < POOL_KEYS.length; k += 1) advancePool(fx, POOL_KEYS[k], step);
}

export function disposeFx(fx) {
  if (!fx) return;
  for (const group of fx.groups) {
    fx.scene.remove(group);
    group.traverse((child) => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
  }
  for (const key of POOL_KEYS) {
    const pool = fx.pools[key];
    for (const particle of pool.items) {
      particle.active = false; fx.scene.remove(particle.sprite);
    }
    pool.items.length = 0;
  }
  for (const key of Object.keys(fx.materials)) fx.materials[key].dispose();
  for (const key of Object.keys(fx.bodyMaterials)) fx.bodyMaterials[key].dispose();
  fx.texture.dispose();
  fx.emitters.length = 0; fx.groups.length = 0;
}
