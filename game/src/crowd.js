// Crowd module: draws the seeded sidewalk and beach walkers as instanced body parts.
// Crowd pass: authored street and beach life for the r14 entry.
// Decorative walkers only: they use seeded routes, never collide with the player or traffic,
// and render as one InstancedMesh per body part so the whole crowd stays near eight draw calls.
// The beach crowd keeps off the marina docks and the Coral Loop race line.
import { seededRandom, clamp, damp, angleLerp } from './rng.js';
import { CITY_LAYOUT } from './config.js';
const SKIN_TONES = [0xffd8b8, 0xf2c9a0, 0xe0b48a, 0xc98d63, 0xa86a43, 0x8a5132, 0x6b3e26, 0x57331f];
const HAIR_TONES = [0x231a12, 0x3b2a1d, 0x5b3a22, 0x8a6236, 0xd9b46a, 0xb8b0a6, 0x2c2c2c, 0x7a4a2a];
const HAT_COLORS = [0xe8735a, 0x2f7f86, 0xf4ead6, 0xffc35c, 0xff3d8b, 0x14555f, 0x39e6e0];
const SHIRT_COLORS = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6, 0xe8735a, 0x2f7f86, 0xcfd8c6,
  0x8b2fd6, 0xff5a4e, 0x3d8a91, 0xf0d9bd, 0x1f6f5c, 0xd94f7a, 0x4e7fd1];
const TROUSER_COLORS = [0x2a2f36, 0x4d5860, 0x7b8b94, 0xd9c9a8, 0x3c4854, 0x8a6a4a, 0x2f4d5c, 0xb8aaa0];
const BEACH_BOTTOMS = [0xff3d8b, 0x39e6e0, 0xffc35c, 0x14555f, 0xe8735a, 0xf4ead6, 0x2f7f86];
const SHOE_COLORS = [0xf4ead6, 0x22262b, 0x8f6a43, 0xe8735a, 0x39bdbd, 0xd9c9a8];
const BAG_COLORS = [0xd9b98a, 0x22262b, 0xff3d8b, 0x2f7f86, 0xf4ead6, 0xffc35c];
const TOWEL_COLORS = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6, 0xe8735a, 0x2f7f86];
const ARCHETYPES = {
  commuter: { speed: [1.15, 1.55], swing: 0.52, lean: 0.025, sway: 0.05, bob: 0.026, cycle: 4.4 },
  jogger: { speed: [2.7, 3.5], swing: 0.92, lean: 0.22, sway: 0.02, bob: 0.075, cycle: 7.6 },
  shopper: { speed: [0.8, 1.2], swing: 0.4, lean: 0.03, sway: 0.12, bob: 0.018, cycle: 3.7 },
  tourist: { speed: [0.9, 1.4], swing: 0.48, lean: 0.02, sway: 0.06, bob: 0.022, cycle: 4.0 },
  beachgoer: { speed: [0.65, 1.1], swing: 0.38, lean: 0.02, sway: 0.09, bob: 0.016, cycle: 3.6 },
};
const QUEUE_ARCH = ['shopper', 'commuter', 'tourist', 'shopper', 'commuter'];
// Preallocated temporaries: the per-frame pass creates no objects.
const _m4 = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _v7 = new THREE.Vector3();
const _euler = new THREE.Euler();
const _qRoot = new THREE.Quaternion(), _qTorso = new THREE.Quaternion(), _qPart = new THREE.Quaternion();
const _qArmL = new THREE.Quaternion(), _qArmR = new THREE.Quaternion();
const _qLegL = new THREE.Quaternion(), _qLegR = new THREE.Quaternion();
const _sample = { x: 0, z: 0, heading: 0 };
const _color = new THREE.Color();
export function createCrowd(scene, seed = 7) {
  const base = Number(seed) || 7;
  const rng = seededRandom(base + 613);
  const crowd = {
    scene, seed: base, rng, group: new THREE.Group(),
    walkers: [], parts: {}, extras: null, towels: [],
    accessoryCount: 0, towelStart: 0, time: 0, ready: false,
  };
  crowd.group.name = 'crowd';
  scene.add(crowd.group);
  buildRoutes(crowd);
  populateCrowd(crowd);
  buildCrowdMeshes(crowd);
  updateCrowd(crowd, 0, 0);
  crowd.ready = true;
  return crowd;
}
function makeLoop(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    segs.push({
      ax: a.x, az: a.z, bx: b.x, bz: b.z, dx, dz, len,
      start: total, heading: Math.atan2(dx, dz),
    });
    total += len;
  }
  return { points, segs, total };
}
function routeSample(loop, s, out) {
  let d = s % loop.total;
  if (d < 0) d += loop.total;
  for (let i = 0; i < loop.segs.length; i++) {
    const seg = loop.segs[i];
    if (d <= seg.start + seg.len) {
      const t = clamp((d - seg.start) / seg.len, 0, 1);
      out.x = seg.ax + seg.dx * t;
      out.z = seg.az + seg.dz * t;
      out.heading = seg.heading;
      return out;
    }
  }
  const last = loop.segs[loop.segs.length - 1];
  out.x = last.bx;
  out.z = last.bz;
  out.heading = last.heading;
  return out;
}
function loopSideS(loop, side, t) {
  const seg = loop.segs[side % loop.segs.length];
  return seg.start + seg.len * clamp(t, 0.04, 0.96);
}
function buildRoutes(crowd) {
  const L = CITY_LAYOUT;
  const xs = [-320, ...L.avenues, 320];
  const zs = [-280, ...L.streets, 160, L.boulevardZ];
  const inset = 10.2;
  const loops = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const z0 = zs[j];
      const z1 = zs[j + 1];
      if (x1 - x0 < 40 || z1 - z0 < 28) continue;
      const loop = makeLoop([
        { x: x0 + inset, z: z0 + inset },
        { x: x1 - inset, z: z0 + inset },
        { x: x1 - inset, z: z1 - inset },
        { x: x0 + inset, z: z1 - inset },
      ]);
      loop.block = { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
      loops.push(loop);
    }
  }
  crowd.loops = loops;
  crowd.boulevardLoops = loops.filter((l) => l.block.z0 === 160 && l.block.z1 === L.boulevardZ);
  crowd.streetLoop = loops.find((l) => l.block.x0 === 0 && l.block.z0 === -80) || loops[0];
  crowd.promenade = makeLoop([
    { x: -318, z: 209.2 }, { x: 318, z: 209.2 },
    { x: 318, z: 211.0 }, { x: -318, z: 211.0 },
  ]);
  crowd.waterline = makeLoop([
    { x: -44, z: 235.3 }, { x: 312, z: 235.3 },
    { x: 312, z: 236.1 }, { x: -44, z: 236.1 },
  ]);
  crowd.marinaLoop = makeLoop([
    { x: -176, z: 234.2 }, { x: -44, z: 234.2 },
    { x: -44, z: 235.6 }, { x: -176, z: 235.6 },
  ]);
}
function addWalker(crowd, opts) {
  const rng = crowd.rng;
  const archetype = opts.archetype || 'commuter';
  const arch = ARCHETYPES[archetype] || ARCHETYPES.commuter;
  const index = crowd.walkers.length;
  const hS = rng.range(0.92, 1.08) * (archetype === 'jogger' ? 1.01 : 1);
  const bS = rng.range(0.88, 1.14);
  const wear = rng.chance(archetype === 'beachgoer' ? 0.46 : 0.31) ? 'hat' : 'hair';
  const accessory = opts.accessory !== undefined
    ? opts.accessory
    : archetype === 'shopper' ? 'bag' : archetype === 'tourist' ? 'camera' : null;
  const speed = opts.speed != null ? opts.speed : rng.range(arch.speed[0], arch.speed[1]);
  const homeX = opts.homeX != null ? opts.homeX : 0;
  const homeZ = opts.homeZ != null ? opts.homeZ : 0;
  const w = {
    index, archetype, state: opts.state || 'route',
    route: opts.route || null, s: opts.s || 0, dir: opts.dir || 1,
    lateral: opts.lateral || 0, speed,
    homeX, homeZ,
    baseHeading: opts.baseHeading != null ? opts.baseHeading : 0,
    x: homeX, z: homeZ,
    heading: opts.baseHeading != null ? opts.baseHeading : 0,
    routeHeading: opts.baseHeading != null ? opts.baseHeading : 0,
    baseY: opts.baseY != null ? opts.baseY : 0.3,
    phase: rng.range(0, Math.PI * 2),
    cycle: arch.cycle * rng.range(0.92, 1.08),
    swing: arch.swing * rng.range(0.88, 1.12),
    lean: arch.lean * rng.range(0.85, 1.15),
    sway: arch.sway * rng.range(0.8, 1.2),
    bobAmp: arch.bob * rng.range(0.8, 1.2),
    hS, bS,
    skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_TONES),
    hatColor: rng.pick(HAT_COLORS), wear,
    shirt: rng.pick(SHIRT_COLORS),
    trouser: rng.pick(archetype === 'beachgoer' ? BEACH_BOTTOMS : TROUSER_COLORS),
    shoe: rng.pick(SHOE_COLORS),
    bagColor: rng.pick(BAG_COLORS),
    accessory, accessoryIndex: -1,
    shoeBase: index * 2,
    startle: 0, startlePush: 0, startleX: 0, startleZ: 0, startleYaw: 0,
  };
  crowd.walkers.push(w);
  return w;
}
function addRouteGroup(crowd, loop, size, archetype, side, t, dir) {
  if (!loop) return;
  const arch = ARCHETYPES[archetype] || ARCHETYPES.commuter;
  const speed = crowd.rng.range(arch.speed[0], arch.speed[1]);
  const s0 = loopSideS(loop, side, t);
  const step = 0.86;
  const baseY = loop.block ? 0.3 : 0.12;
  for (let i = 0; i < size; i++) {
    const off = i - (size - 1) / 2;
    addWalker(crowd, {
      archetype, state: 'route', route: loop,
      s: s0 + off * step * (dir < 0 ? -1 : 1),
      dir, lateral: off * 0.18, speed, baseY,
    });
  }
}
function addIdleGroup(crowd, x, z, size, archetype, axis) {
  const step = 0.58;
  for (let i = 0; i < size; i++) {
    const off = i - (size - 1) / 2;
    const px = axis === 'x' ? x + off * step : x + (i % 2 ? 0.1 : -0.1);
    const pz = axis === 'z' ? z + off * step : z + (i % 2 ? 0.1 : -0.1);
    const heading = Math.atan2(x - px, z - pz);
    addWalker(crowd, {
      archetype, state: 'idle', homeX: px, homeZ: pz,
      baseHeading: heading, baseY: 0.3,
    });
  }
}
function addQueue(crowd) {
  for (let i = 0; i < QUEUE_ARCH.length; i++) {
    addWalker(crowd, {
      archetype: QUEUE_ARCH[i], state: 'queue',
      homeX: -69.4 + i * 0.52, homeZ: 186.15 + (i % 2) * 0.12,
      baseHeading: Math.PI, baseY: 0.3,
      accessory: i === 0 || i === 3 ? 'bag' : null,
    });
  }
}
function addSunbathers(crowd) {
  const spots = [
    [34, 220], [70, 226], [112, 219], [158, 228],
    [204, 222], [248, 225], [-18, 223], [-34, 215],
  ];
  for (const spot of spots) {
    const x = spot[0] + crowd.rng.range(-1.5, 1.5);
    const z = spot[1] + crowd.rng.range(-1.2, 1.2);
    const heading = crowd.rng.range(0, Math.PI * 2);
    addWalker(crowd, {
      archetype: 'beachgoer', state: 'sunbathe',
      homeX: x, homeZ: z, baseHeading: heading, baseY: 0.2,
      accessory: null,
    });
    crowd.towels.push({
      x: x - Math.sin(heading) * 0.95,
      z: z - Math.cos(heading) * 0.95,
      heading, color: crowd.rng.pick(TOWEL_COLORS),
    });
  }
}
function addPlayGroup(crowd) {
  const places = [[0, 0], [0.72, 0.18], [-0.52, 0.62], [0.24, -0.7]];
  for (const place of places) {
    addWalker(crowd, {
      archetype: 'beachgoer', state: 'play',
      homeX: -18 + place[0], homeZ: 221 + place[1],
      baseHeading: Math.atan2(-place[0], -place[1]), baseY: 0.12,
      accessory: null,
    });
  }
}
function populateCrowd(crowd) {
  const blvd = crowd.boulevardLoops;
  const blvdSpecs = [
    [2, 3, 'commuter', 2, 0.55, 1],
    [2, 2, 'tourist', 2, 0.2, 1],
    [3, 3, 'shopper', 2, 0.35, 1],
    [3, 3, 'commuter', 2, 0.8, 1],
    [4, 2, 'shopper', 2, 0.2, 1],
    [1, 2, 'jogger', 2, 0.5, 1],
    [5, 3, 'tourist', 2, 0.3, 1],
    [6, 2, 'commuter', 2, 0.6, 1],
    [0, 2, 'shopper', 2, 0.4, 1],
    [7, 2, 'tourist', 2, 0.5, 1],
  ];
  for (const spec of blvdSpecs) addRouteGroup(crowd, blvd[spec[0]] || blvd[0], spec[1], spec[2], spec[3], spec[4], spec[5]);
  const promSizes = [2, 3, 2, 2, 3, 2, 2, 3];
  const promT = [0.27, 0.3, 0.34, 0.4, 0.46, 0.52, 0.6, 0.68];
  const promArch = ['beachgoer', 'tourist', 'beachgoer', 'commuter', 'beachgoer', 'tourist', 'beachgoer', 'shopper'];
  for (let i = 0; i < promSizes.length; i++) {
    addRouteGroup(crowd, crowd.promenade, promSizes[i], promArch[i], 0, promT[i], i % 2 ? 1 : -1);
  }
  const street = crowd.streetLoop;
  const streetSizes = [2, 3, 2, 3, 2];
  const streetT = [0.25, 0.38, 0.52, 0.68, 0.82];
  const streetArch = ['commuter', 'tourist', 'shopper', 'commuter', 'jogger'];
  for (let i = 0; i < streetSizes.length; i++) {
    addRouteGroup(crowd, street, streetSizes[i], streetArch[i], 3, streetT[i], i % 2 ? 1 : -1);
  }
  const northLoop = crowd.loops.find((l) => l.block.x0 === 0 && l.block.z0 === -160);
  const westLoop = crowd.loops.find((l) => l.block.x0 === -80 && l.block.z0 === -80);
  const southLoop = crowd.loops.find((l) => l.block.x0 === 0 && l.block.z0 === 0);
  addRouteGroup(crowd, northLoop, 3, 'commuter', 3, 0.75, 1);
  addRouteGroup(crowd, westLoop, 2, 'shopper', 3, 0.45, -1);
  addRouteGroup(crowd, southLoop, 2, 'tourist', 3, 0.1, 1);
  const randomSizes = [3, 2, 2, 3, 2, 2, 3, 2];
  const randomArch = ['commuter', 'shopper', 'tourist', 'jogger', 'commuter', 'tourist', 'shopper', 'commuter'];
  for (let i = 0; i < randomSizes.length; i++) {
    const loop = crowd.loops[crowd.rng.int(0, crowd.loops.length - 1)];
    addRouteGroup(crowd, loop, randomSizes[i], randomArch[i], crowd.rng.int(0, 3), crowd.rng.range(0.15, 0.85), crowd.rng.sign());
  }
  const solos = ['jogger', 'tourist', 'shopper', 'commuter', 'jogger', 'tourist', 'shopper', 'commuter'];
  for (let i = 0; i < solos.length; i++) {
    const loop = crowd.loops[crowd.rng.int(0, crowd.loops.length - 1)];
    addRouteGroup(crowd, loop, 1, solos[i], crowd.rng.int(0, 3), crowd.rng.range(0.12, 0.88), crowd.rng.sign());
  }
  addIdleGroup(crowd, 10.35, -64, 3, 'commuter', 'z');
  addIdleGroup(crowd, -10.35, -42, 2, 'tourist', 'z');
  addIdleGroup(crowd, -38, 186.05, 3, 'shopper', 'x');
  addIdleGroup(crowd, 70, 186.05, 2, 'commuter', 'x');
  addQueue(crowd);
  addSunbathers(crowd);
  addPlayGroup(crowd);
  const waterT = [0.03, 0.08, 0.14];
  for (let i = 0; i < waterT.length; i++) {
    addRouteGroup(crowd, crowd.waterline, 2, 'beachgoer', 0, waterT[i], i % 2 ? -1 : 1);
  }
  addRouteGroup(crowd, crowd.marinaLoop, 2, 'tourist', 0, 0.2, 1);
  addRouteGroup(crowd, crowd.marinaLoop, 2, 'commuter', 0, 0.55, -1);
}
function boxUp() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}
function boxDown() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0);
  return g;
}
function mergeHeadGeometry() {
  const boxes = [
    { w: 0.1, h: 0.14, d: 0.1, x: 0, y: 0.07, z: 0 },
    { w: 0.24, h: 0.3, d: 0.23, x: 0, y: 0.3, z: 0 },
  ];
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let offset = 0;
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y, b.z);
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const uv = g.attributes.uv.array;
    for (let i = 0; i < pos.length; i++) { positions.push(pos[i]); normals.push(nor[i]); uvs.push(uv[i]); }
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
    offset += pos.length / 3;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}
function partMesh(geometry, count) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });
  const mesh = new THREE.InstancedMesh(geometry, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
function buildCrowdMeshes(crowd) {
  const n = crowd.walkers.length;
  for (const w of crowd.walkers) {
    w.shoeBase = w.index * 2;
    w.accessoryIndex = -1;
    if (w.accessory) w.accessoryIndex = n * 2 + crowd.accessoryCount++;
  }
  crowd.towelStart = n * 2 + crowd.accessoryCount;
  const extraCount = crowd.towelStart + crowd.towels.length;
  const parts = {
    head: partMesh(mergeHeadGeometry(), n),
    headwear: partMesh(new THREE.BoxGeometry(1, 1, 1), n),
    torso: partMesh(boxUp(), n),
    armL: partMesh(boxDown(), n),
    armR: partMesh(boxDown(), n),
    legL: partMesh(boxDown(), n),
    legR: partMesh(boxDown(), n),
    extras: partMesh(new THREE.BoxGeometry(1, 1, 1), extraCount),
  };
  crowd.parts = parts;
  crowd.extras = parts.extras;
  for (const key in parts) crowd.group.add(parts[key]);
  setCrowdColors(crowd);
  setTowels(crowd);
}
function setCrowdColors(crowd) {
  const p = crowd.parts;
  for (const w of crowd.walkers) {
    _color.setHex(w.skin);
    p.head.setColorAt(w.index, _color);
    p.armL.setColorAt(w.index, _color);
    p.armR.setColorAt(w.index, _color);
    _color.setHex(w.wear === 'hat' ? w.hatColor : w.hair);
    p.headwear.setColorAt(w.index, _color);
    _color.setHex(w.shirt);
    p.torso.setColorAt(w.index, _color);
    _color.setHex(w.trouser);
    p.legL.setColorAt(w.index, _color);
    p.legR.setColorAt(w.index, _color);
    _color.setHex(w.shoe);
    p.extras.setColorAt(w.shoeBase, _color);
    p.extras.setColorAt(w.shoeBase + 1, _color);
    if (w.accessoryIndex >= 0) {
      _color.setHex(w.accessory === 'bag' ? w.bagColor : 0x1a1c22);
      p.extras.setColorAt(w.accessoryIndex, _color);
    }
  }
  for (const part of Object.values(p)) {
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
  }
}
function setTowels(crowd) {
  const p = crowd.parts;
  for (let i = 0; i < crowd.towels.length; i++) {
    const towel = crowd.towels[i];
    _euler.set(0, towel.heading, 0, 'YXZ');
    _qPart.setFromEuler(_euler);
    _v1.set(towel.x, 0.145, towel.z);
    _scale.set(0.95, 0.035, 2.0);
    _m4.compose(_v1, _qPart, _scale);
    p.extras.setMatrixAt(crowd.towelStart + i, _m4);
    _color.setHex(towel.color);
    p.extras.setColorAt(crowd.towelStart + i, _color);
  }
  p.extras.instanceMatrix.needsUpdate = true;
  if (p.extras.instanceColor) p.extras.instanceColor.needsUpdate = true;
}
export function updateCrowd(crowd, dt, time) {
  if (!crowd || !crowd.parts || !crowd.parts.head) return;
  crowd.time = typeof time === 'number' ? time : crowd.time + dt;
  const t = crowd.time;
  for (let i = 0; i < crowd.walkers.length; i++) updateWalker(crowd, crowd.walkers[i], dt, t);
  const p = crowd.parts;
  p.head.instanceMatrix.needsUpdate = true;
  p.headwear.instanceMatrix.needsUpdate = true;
  p.torso.instanceMatrix.needsUpdate = true;
  p.armL.instanceMatrix.needsUpdate = true;
  p.armR.instanceMatrix.needsUpdate = true;
  p.legL.instanceMatrix.needsUpdate = true;
  p.legR.instanceMatrix.needsUpdate = true;
  p.extras.instanceMatrix.needsUpdate = true;
}
function updateWalker(crowd, w, dt, time) {
  const p = crowd.parts;
  const hS = w.hS;
  const bS = w.bS;
  const hip = 0.88 * hS;
  const legLen = 0.76 * hS;
  const torsoH = 0.54 * hS;
  const armLen = 0.56 * hS;
  const shoulderX = 0.24 * bS;
  const thighX = 0.105 * bS;
  if (w.startle > 0) w.startle = Math.max(0, w.startle - dt);
  w.phase += w.cycle * dt;
  let px = w.homeX;
  let pz = w.homeZ;
  let targetHeading = w.baseHeading;
  if (w.state === 'route' && w.route) {
    w.s += w.speed * w.dir * dt;
    routeSample(w.route, w.s, _sample);
    const nx = Math.cos(_sample.heading);
    const nz = -Math.sin(_sample.heading);
    px = _sample.x + nx * w.lateral;
    pz = _sample.z + nz * w.lateral;
    targetHeading = w.dir > 0 ? _sample.heading : _sample.heading + Math.PI;
    w.routeHeading = targetHeading;
  }
  if (w.startle > 0) {
    w.startlePush = damp(w.startlePush, 0.8, 9, dt);
    targetHeading = w.startleYaw;
  } else {
    w.startlePush = damp(w.startlePush, 0, 4, dt);
  }
  if (dt <= 0) w.heading = targetHeading;
  else w.heading = angleLerp(w.heading, targetHeading, 1 - Math.exp(-8 * dt));
  px += w.startleX * w.startlePush;
  pz += w.startleZ * w.startlePush;
  w.x = px;
  w.z = pz;
  const lying = w.state === 'sunbathe';
  let bob = 0;
  if (!lying) {
    if (w.state === 'route') bob = Math.abs(Math.sin(w.phase)) * w.bobAmp;
    else bob = Math.sin(time * 1.4 + w.phase) * 0.006;
  }
  const rootPos = _v1.set(px, w.baseY + bob, pz);
  const pitch = lying ? -Math.PI / 2 : 0;
  const roll = lying ? 0 : Math.sin(w.phase) * w.sway * 0.35;
  _qRoot.setFromEuler(_euler.set(pitch, w.heading, roll, 'YXZ'));
  const idle = w.state === 'idle' || w.state === 'queue';
  let torsoYaw = 0;
  let lean = 0.015;
  if (!lying) {
    if (w.state === 'play') {
      torsoYaw = Math.sin(time * 1.8 + w.phase) * 0.35;
      lean = 0.04;
    } else if (idle) {
      torsoYaw = Math.sin(time * 1.2 + w.phase * 0.6) * (w.state === 'queue' ? 0.1 : 0.22);
      lean = 0.015;
    } else {
      torsoYaw = Math.sin(time * 1.4 + w.phase * 0.35) * w.sway;
      lean = w.lean;
    }
  }
  const torsoRoll = lying ? 0 : Math.sin(w.phase) * w.sway * 0.25;
  _qTorso.setFromEuler(_euler.set(lean, torsoYaw, torsoRoll, 'YXZ'));
  _qTorso.premultiply(_qRoot);
  const torsoOrigin = _v2.set(0, hip, 0).applyQuaternion(_qRoot).add(rootPos);
  _m4.compose(torsoOrigin, _qTorso, _scale.set(0.42 * bS, torsoH, 0.24 * bS));
  p.torso.setMatrixAt(w.index, _m4);
  const top = _v3.set(0, torsoH, 0).applyQuaternion(_qTorso).add(torsoOrigin);
  let headYaw = Math.sin(w.phase * 0.5) * 0.04;
  if (idle) headYaw = Math.sin(time * 0.9 + w.phase * 1.1) * (w.state === 'queue' ? 0.12 : 0.2);
  if (w.startle > 0) headYaw = Math.sin(time * 21 + w.phase) * 0.16;
  _qPart.setFromEuler(_euler.set(0, headYaw, 0, 'YXZ'));
  _qPart.premultiply(_qTorso);
  _m4.compose(top, _qPart, _scale.set(bS, hS, bS));
  p.head.setMatrixAt(w.index, _m4);
  const wearY = w.wear === 'hat' ? 0.41 * hS : 0.39 * hS;
  _v4.set(0, wearY, 0).applyQuaternion(_qPart).add(top);
  if (w.wear === 'hat') _scale.set(0.32 * bS, 0.055 * hS, 0.32 * bS);
  else _scale.set(0.25 * bS, 0.12 * hS, 0.24 * bS);
  _m4.compose(_v4, _qPart, _scale);
  p.headwear.setMatrixAt(w.index, _m4);
  const legSwingL = w.state === 'route' ? Math.sin(w.phase) * w.swing : 0;
  const legSwingR = -legSwingL;
  _qLegL.setFromEuler(_euler.set(legSwingL, 0, 0, 'XYZ'));
  _qLegL.premultiply(_qRoot);
  _qLegR.setFromEuler(_euler.set(legSwingR, 0, 0, 'XYZ'));
  _qLegR.premultiply(_qRoot);
  const legPivotL = _v4.set(-thighX, hip, 0).applyQuaternion(_qRoot).add(rootPos);
  _m4.compose(legPivotL, _qLegL, _scale.set(0.15 * bS, legLen, 0.17 * bS));
  p.legL.setMatrixAt(w.index, _m4);
  const legPivotR = _v5.set(thighX, hip, 0).applyQuaternion(_qRoot).add(rootPos);
  _m4.compose(legPivotR, _qLegR, _scale.set(0.15 * bS, legLen, 0.17 * bS));
  p.legR.setMatrixAt(w.index, _m4);
  const shoeL = _v6.set(0, -(legLen + 0.06 * hS), 0).applyQuaternion(_qLegL).add(legPivotL);
  _m4.compose(shoeL, _qLegL, _scale.set(0.17 * bS, 0.12 * hS, 0.31 * bS));
  p.extras.setMatrixAt(w.shoeBase, _m4);
  const shoeR = _v7.set(0, -(legLen + 0.06 * hS), 0).applyQuaternion(_qLegR).add(legPivotR);
  _m4.compose(shoeR, _qLegR, _scale.set(0.17 * bS, 0.12 * hS, 0.31 * bS));
  p.extras.setMatrixAt(w.shoeBase + 1, _m4);
  let armSwingL = 0;
  let armSwingR = 0;
  if (w.state === 'route') {
    armSwingL = -legSwingL * 0.82;
    armSwingR = -legSwingR * 0.82;
  } else if (idle) {
    armSwingL = Math.sin(time * 1.1 + w.phase) * 0.025;
    armSwingR = -Math.sin(time * 1.1 + w.phase) * 0.025;
  }
  let raiseL = 0;
  let raiseR = 0;
  if (lying) { raiseL = -1.15; raiseR = 1.15; }
  if (w.state === 'play') {
    raiseL = -0.35 - Math.max(0, Math.sin(time * 2.4 + w.phase)) * 0.55;
    raiseR = 0.35 + Math.max(0, Math.sin(time * 2.4 + w.phase + 1.7)) * 0.5;
  }
  if (w.startle > 0) {
    raiseL = -2.25 + Math.sin(time * 19 + w.phase) * 0.08;
    raiseR = 2.25 - Math.sin(time * 19 + w.phase) * 0.08;
  }
  const shoulderY = torsoH * 0.94;
  const shoulderL = _v4.set(-shoulderX, shoulderY, 0).applyQuaternion(_qTorso).add(torsoOrigin);
  _qArmL.setFromEuler(_euler.set(armSwingL, 0, raiseL, 'XYZ'));
  _qArmL.premultiply(_qTorso);
  _m4.compose(shoulderL, _qArmL, _scale.set(0.1 * bS, armLen, 0.11 * bS));
  p.armL.setMatrixAt(w.index, _m4);
  const shoulderR = _v5.set(shoulderX, shoulderY, 0).applyQuaternion(_qTorso).add(torsoOrigin);
  _qArmR.setFromEuler(_euler.set(armSwingR, 0, raiseR, 'XYZ'));
  _qArmR.premultiply(_qTorso);
  _m4.compose(shoulderR, _qArmR, _scale.set(0.1 * bS, armLen, 0.11 * bS));
  p.armR.setMatrixAt(w.index, _m4);
  if (w.accessoryIndex >= 0) {
    if (w.accessory === 'bag') {
      const hand = _v6.set(0, -armLen - 0.1 * hS, 0).applyQuaternion(_qArmR).add(shoulderR);
      _m4.compose(hand, _qArmR, _scale.set(0.2 * bS, 0.28 * hS, 0.12 * bS));
    } else {
      const chest = _v6.set(0, torsoH * 0.78, 0.18 * bS).applyQuaternion(_qTorso).add(torsoOrigin);
      _m4.compose(chest, _qTorso, _scale.set(0.18 * bS, 0.12 * hS, 0.1 * bS));
    }
    p.extras.setMatrixAt(w.accessoryIndex, _m4);
  }
}
export function startleCrowd(crowd, x, z, radius) {
  if (!crowd || !crowd.walkers) return 0;
  const r2 = radius * radius;
  let count = 0;
  for (let i = 0; i < crowd.walkers.length; i++) {
    const w = crowd.walkers[i];
    const dx = w.x - x;
    const dz = w.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r2) continue;
    const len = Math.sqrt(d2) || 1;
    w.startleX = dx / len;
    w.startleZ = dz / len;
    w.startleYaw = Math.atan2(w.startleX, w.startleZ);
    w.startle = 2.0;
    w.startlePush = Math.max(w.startlePush, 0.08);
    count++;
  }
  return count;
}
