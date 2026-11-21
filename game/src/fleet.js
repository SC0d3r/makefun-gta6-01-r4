// Fleet module: builds the decorative parked cars, road paint and street furniture from primitives.
// Fleet pass: authored road paint, street furniture and the decorative parked fleet.
// Everything here is built from local boxes, cylinders and flat quads. No external assets,
// no imported three (index.html loads the r147 UMD build) and no Math.random: every choice
// comes from a seeded stream derived from the city seed.
//
// The parked cars are scenery only. They have no colliders and no entry in the gameplay
// vehicle list, so stealing, missions and police systems never see them.
import { CITY_LAYOUT } from './config.js';
import { seededRandom } from './rng.js';
const BOX = new THREE.BoxGeometry(1, 1, 1);
const WHEEL_GEO = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
WHEEL_GEO.rotateZ(Math.PI / 2);
const POLE_GEO = new THREE.CylinderGeometry(0.1, 0.14, 1, 8);
const LAMP_GEO = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10);
LAMP_GEO.rotateX(Math.PI / 2);
const MARK_GEO = new THREE.PlaneGeometry(1, 1);
MARK_GEO.rotateX(-Math.PI / 2);
const std = (color, roughness = 0.8, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const basic = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const M = {
  proto: std(0x8c9696, 0.5, 0.3), trim: std(0x22272b, 0.62, 0.25), dark: std(0x171c20, 0.7, 0.2),
  glass: std(0x12333d, 0.16, 0.72), chrome: std(0xcfd8d4, 0.24, 0.86), tyre: std(0x14171a, 0.95, 0.02),
  hubProto: std(0xaeb8b7, 0.35, 0.72), lamp: basic(0xfff2cf), tail: basic(0xff3838), plate: basic(0xe8dfc9),
  red: basic(0xff2b2b), blue: basic(0x2f8bff), amber: basic(0xffc35c), green: basic(0x3ce08c),
  offRed: std(0x3a1717, 0.7, 0.1), offAmber: std(0x3a2c14, 0.7, 0.1), offGreen: std(0x14301f, 0.7, 0.1),
  concrete: std(0xb7a692, 0.9, 0.02), soil: std(0x4a3a2a, 1, 0), leaf: std(0x3f6b3a, 0.95, 0),
  leafDark: std(0x2f5530, 0.95, 0), wood: std(0x8a6a4a, 0.88, 0.02), steel: std(0x3a3f42, 0.55, 0.55),
  white: std(0xf4ead6, 0.75, 0.04), teal: std(0x2f7f86, 0.6, 0.18), coral: std(0xe8735a, 0.7, 0.05),
  gold: std(0xffc35c, 0.6, 0.1),
  shelterGlass: new THREE.MeshStandardMaterial({ color: 0x9fd8de, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  canvas: new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.9, side: THREE.DoubleSide }),
  awning: new THREE.MeshStandardMaterial({ color: 0xe8735a, roughness: 0.85, side: THREE.DoubleSide }),
  paint: new THREE.MeshBasicMaterial({ color: 0xf2e6c8, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
};
M.wheelProto = [M.tyre, M.hubProto, M.hubProto];
const BODY_COLORS = [0xf4ead6, 0xe8735a, 0x2f7f86, 0xffc35c, 0xf0d9bd, 0xb7c4c7, 0x8b2fd6, 0x1fa8c9, 0xd94f4f, 0x3f6b3a, 0x39434a, 0xf2f0e8];
const WHEEL_SIDES = [0x14171a, 0x1d2326, 0x2a201b, 0x33383c];
const HUBS = [0xaeb8b7, 0xcfd8d4, 0xffc35c, 0x8c9696, 0x2f7f86];
const UMBRELLA_COLORS = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6, 0xe8735a];
const TOWEL_COLORS = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6, 0x2f7f86, 0xe8735a];
const CAR_KINDS = ['sedan', 'coupe', 'convertible', 'van', 'pickup', 'taxi'];
const CAR_SPECS = {
  sedan: { length: 4.72, width: 1.9, tall: 0.56, cab: 0.5, cabZ: -0.1, cabL: 2.25, wheel: 2.9 },
  coupe: { length: 4.36, width: 1.86, tall: 0.5, cab: 0.44, cabZ: -0.28, cabL: 1.95, wheel: 2.62 },
  convertible: { length: 4.42, width: 1.86, tall: 0.48, cab: 0, cabZ: -0.2, cabL: 2.05, wheel: 2.64 },
  van: { length: 5.42, width: 2.06, tall: 0.72, cab: 1.04, cabZ: -0.35, cabL: 3.5, wheel: 3.28 },
  pickup: { length: 5.12, width: 1.98, tall: 0.58, cab: 0.62, cabZ: 0.55, cabL: 1.9, wheel: 3.08 },
  taxi: { length: 4.72, width: 1.9, tall: 0.56, cab: 0.5, cabZ: -0.1, cabL: 2.25, wheel: 2.9 },
  police: { length: 4.92, width: 2.0, tall: 0.58, cab: 0.5, cabZ: -0.1, cabL: 2.3, wheel: 3.0 },
};
export function buildFleet(scene, seed = 7) {
  const base = Number(seed) || 7;
  const rng = seededRandom(((base * 92821 + 4177) >>> 0) || 1);
  const root = new THREE.Group();
  root.name = 'vela-fleet';
  scene.add(root);
  const fleet = { root, cars: [], signals: [], windowMat: null };
  buildRoadPaint(root);
  buildTrafficLights(root, fleet);
  buildStreetFurniture(root, rng, fleet);
  buildBeachFurniture(root, rng);
  buildParkedFleet(root, rng, fleet);
  return fleet;
}
export function updateFleet(fleet, t) {
  if (!fleet) return;
  const signals = fleet.signals;
  for (let i = 0; i < signals.length; i++) {
    const sig = signals[i];
    const p = (t * 0.105 + sig.phase) % 1;
    const state = p < 0.52 ? 0 : p < 0.62 ? 1 : 2;
    if (state === sig.state) continue;
    sig.state = state;
    for (let l = 0; l < 3; l++) {
      sig.lamps[l].material = l === state ? sig.on[l] : sig.off[l];
    }
  }
  if (fleet.windowMat) {
    fleet.windowMat.emissiveIntensity = 1.15 + Math.sin(t * 2.1) * 0.22;
  }
}
// ---------- car prototypes ----------
const prototypeCache = new Map();
const paintMats = new Map();
const wheelMats = new Map();
function paintMaterial(color) {
  if (!paintMats.has(color)) paintMats.set(color, std(color, 0.42, 0.3));
  return paintMats.get(color);
}
function wheelMaterials(side, hub) {
  const key = `${side}:${hub}`;
  if (!wheelMats.has(key)) {
    wheelMats.set(key, [std(side, 0.9, 0.02), std(hub, 0.32, 0.72), std(hub, 0.32, 0.72)]);
  }
  return wheelMats.get(key);
}
function getPrototype(kind) {
  if (!prototypeCache.has(kind)) prototypeCache.set(kind, buildCarPrototype(kind));
  return prototypeCache.get(kind);
}
function buildCarPrototype(kind) {
  const s = CAR_SPECS[kind];
  const g = new THREE.Group();
  const w = s.width;
  const l = s.length;
  const base = 0.46;
  const bodyTop = base + s.tall;
  const box = (bw, bh, bd, x, y, z, mat, tag, cast = true) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(bw, bh, bd);
    m.position.set(x, y, z);
    if (tag) m.userData[tag] = true;
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // Lower tub, shoulder line, bonnet and boot.
  box(w, s.tall, l * 0.96, 0, base + s.tall / 2, 0, M.proto, 'paint');
  box(w * 0.92, s.tall * 0.34, l * 0.9, 0, bodyTop - 0.02, 0, M.proto, 'paint');
  if (kind !== 'van') {
    box(w * 0.9, 0.15, l * 0.24, 0, bodyTop + 0.02, l * 0.34, M.proto, 'paint');
    box(w * 0.9, 0.15, l * 0.2, 0, bodyTop + 0.02, -l * 0.37, M.proto, 'paint');
  }
  // Bumpers, grille, lamps and number plate.
  box(w * 0.99, 0.2, 0.24, 0, 0.63, l / 2 - 0.02, M.trim);
  box(w * 0.99, 0.2, 0.24, 0, 0.63, -l / 2 + 0.02, M.trim);
  box(w * 0.46, 0.16, 0.05, 0, 0.84, l / 2 + 0.025, M.dark, null, false);
  for (const sx of [-1, 1]) {
    box(0.32, 0.13, 0.06, sx * w * 0.31, 0.91, l / 2 + 0.02, M.lamp, null, false);
    box(0.3, 0.12, 0.06, sx * w * 0.3, 0.91, -l / 2 - 0.02, M.tail, null, false);
  }
  box(0.5, 0.16, 0.04, 0, 0.66, -l / 2 - 0.04, M.plate, null, false);
  // Four wheels; the cylinder caps are the hubs, so each wheel stays one low-poly mesh.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(WHEEL_GEO, M.wheelProto);
      wh.position.set(sx * (w / 2 - 0.02), 0.36, sz * s.wheel / 2);
      wh.userData.wheel = true;
      wh.castShadow = true;
      g.add(wh);
    }
  }
  if (kind === 'convertible') buildConvertible(g, s, w, l, bodyTop, box);
  else if (kind === 'van') buildVan(g, s, w, l, bodyTop, box);
  else if (kind === 'pickup') buildPickup(g, s, w, l, bodyTop, box);
  else buildCab(g, s, w, l, bodyTop, box, kind);
  if (kind === 'taxi') buildTaxi(g, s, w, l, bodyTop, box);
  if (kind === 'police') buildPolice(g, s, w, l, bodyTop, box);
  if (kind === 'coupe') buildSpoiler(g, s, l, bodyTop, box);
  if (kind === 'van' || kind === 'pickup') buildRoofRack(g, s, w, l, bodyTop, box);
  return g;
}
function buildCab(g, s, w, l, bodyTop, box, kind) {
  const cabH = s.cab;
  const cabY = bodyTop + cabH / 2;
  box(w * 0.8, cabH, s.cabL, 0, cabY, s.cabZ, M.glass, null, false);
  box(w * 0.74, 0.11, s.cabL * 0.74, 0, bodyTop + cabH + 0.03, s.cabZ - 0.03, M.proto, 'paint');
  // Pillars make the greenhouse legible against the body colour.
  const roofY = bodyTop + cabH + 0.03;
  for (const sx of [-1, 1]) {
    box(0.07, cabH * 0.9, 0.09, sx * w * 0.39, cabY, s.cabZ + s.cabL * 0.44, M.trim, null, false);
    box(0.07, cabH * 0.9, 0.09, sx * w * 0.39, cabY, s.cabZ - s.cabL * 0.44, M.trim, null, false);
  }
  box(w * 0.72, 0.07, 0.08, 0, roofY + 0.03, s.cabZ, M.trim, null, false);
  // Wing mirrors at the front door line.
  for (const sx of [-1, 1]) {
    box(0.24, 0.1, 0.16, sx * (w / 2 + 0.1), bodyTop + 0.34, s.cabZ + s.cabL * 0.44, M.trim, null, false);
  }
  if (kind === 'coupe') {
    // Long fastback deck behind the shorter cabin.
    box(w * 0.88, 0.12, l * 0.3, 0, bodyTop + 0.12, -l * 0.26, M.proto, 'paint');
  }
}
function buildConvertible(g, s, w, l, bodyTop, box) {
  box(w * 0.74, 0.46, 0.06, 0, bodyTop + 0.25, s.cabZ + s.cabL * 0.5, M.glass, null, false);
  box(w * 0.8, 0.08, 0.09, 0, bodyTop + 0.5, s.cabZ + s.cabL * 0.5, M.chrome, null, false);
  box(w * 0.74, 0.12, s.cabL * 0.8, 0, bodyTop + 0.05, s.cabZ - 0.1, M.proto, 'paint');
  for (const sx of [-1, 1]) {
    box(0.5, 0.34, 0.56, sx * w * 0.2, bodyTop + 0.2, s.cabZ - 0.2, M.trim, null, false);
    box(0.5, 0.12, 0.34, sx * w * 0.2, bodyTop + 0.4, s.cabZ - 0.36, M.proto, 'paint');
    box(0.24, 0.1, 0.16, sx * (w / 2 + 0.1), bodyTop + 0.3, s.cabZ + s.cabL * 0.4, M.trim, null, false);
  }
}
function buildVan(g, s, w, l, bodyTop, box) {
  box(w * 0.95, s.cab, l * 0.78, 0, bodyTop + s.cab / 2, -l * 0.08, M.proto, 'paint');
  box(w * 0.78, 0.52, 0.07, 0, bodyTop + 0.52, l / 2 - 0.26, M.glass, null, false);
  for (const sx of [-1, 1]) {
    box(0.04, 0.42, l * 0.24, sx * w * 0.476, bodyTop + 0.56, l * 0.17, M.glass, null, false);
    box(0.24, 0.1, 0.16, sx * (w / 2 + 0.1), bodyTop + 0.32, l * 0.3, M.trim, null, false);
    box(0.06, 0.06, l * 0.6, sx * w * 0.36, bodyTop + s.cab - 0.02, -l * 0.08, M.trim, null, false);
  }
  box(w * 0.7, 0.26, 0.06, 0, bodyTop + 0.12, -l / 2 + 0.02, M.dark, null, false);
}
function buildPickup(g, s, w, l, bodyTop, box) {
  box(w * 0.8, s.cab, 1.86, 0, bodyTop + s.cab / 2, s.cabZ, M.glass, null, false);
  box(w * 0.76, 0.1, 1.5, 0, bodyTop + s.cab + 0.03, s.cabZ, M.proto, 'paint');
  for (const sx of [-1, 1]) box(0.24, 0.1, 0.16, sx * (w / 2 + 0.1), bodyTop + 0.32, s.cabZ + 0.7, M.trim, null, false);
  box(w * 0.88, 0.12, l * 0.42, 0, bodyTop + 0.04, -l * 0.27, M.dark, null, false);
  for (const sx of [-1, 1]) box(0.12, 0.42, l * 0.42, sx * w * 0.44, bodyTop + 0.24, -l * 0.27, M.proto, 'paint');
  box(w * 0.88, 0.42, 0.12, 0, bodyTop + 0.24, -l * 0.48, M.proto, 'paint');
}
function buildTaxi(g, s, w, l, bodyTop, box) {
  const sign = box(0.62, 0.26, 0.24, 0, bodyTop + s.cab + 0.2, s.cabZ - 0.1, M.lamp);
  sign.userData.acc = 'taxi';
  box(w * 0.86, 0.1, 0.08, 0, 0.85, l / 2 + 0.02, M.dark, null, false);
  for (const sx of [-1, 1]) {
    box(0.05, 0.16, 0.5, sx * (w / 2 + 0.008), 0.84, 0.15, M.white, null, false);
    box(0.05, 0.16, 0.5, sx * (w / 2 + 0.01), 0.84, -0.45, M.dark, null, false);
  }
}
function buildPolice(g, s, w, l, bodyTop, box) {
  for (const sx of [-1, 1]) {
    box(0.04, 0.26, 1.1, sx * (w / 2 + 0.012), 0.84, -0.1, M.dark, null, false);
    box(0.06, 0.62, 0.06, sx * w * 0.32, bodyTop + s.cab + 0.22, s.cabZ, M.trim, null, false);
  }
  const red = box(0.4, 0.18, 0.24, -0.22, bodyTop + s.cab + 0.4, s.cabZ, M.red);
  const blue = box(0.4, 0.18, 0.24, 0.22, bodyTop + s.cab + 0.4, s.cabZ, M.blue);
  red.userData.acc = 'police';
  blue.userData.acc = 'police';
  box(w * 0.86, 0.14, 0.16, 0, 0.58, l / 2 + 0.14, M.dark, null, false);
  box(0.1, 0.5, 0.1, -w * 0.25, 0.84, l / 2 + 0.14, M.dark, null, false);
  box(0.1, 0.5, 0.1, w * 0.25, 0.84, l / 2 + 0.14, M.dark, null, false);
}
function buildSpoiler(g, s, l, bodyTop, box) {
  for (const sx of [-1, 1]) {
    const post = box(0.07, 0.22, 0.12, sx * (s.width * 0.3), bodyTop + 0.12, -l / 2 + 0.4, M.trim);
    post.userData.acc = 'spoiler';
  }
  const wing = box(s.width * 0.82, 0.08, 0.34, 0, bodyTop + 0.26, -l / 2 + 0.34, M.dark);
  wing.userData.acc = 'spoiler';
}
function buildRoofRack(g, s, w, l, bodyTop, box) {
  const y = bodyTop + s.cab + 0.12;
  for (const sx of [-1, 1]) {
    const rail = box(0.06, 0.07, l * 0.5, sx * w * 0.34, y, -l * 0.06, M.steel);
    rail.userData.acc = 'rack';
  }
  for (const dz of [-l * 0.16, l * 0.06]) {
    const bar = box(w * 0.74, 0.06, 0.06, 0, y + 0.05, dz, M.steel);
    bar.userData.acc = 'rack';
  }
  const board = box(0.62, 0.08, 2.7, -w * 0.1, y + 0.16, -l * 0.05, M.teal);
  board.userData.acc = 'surf';
}
// ---------- parked fleet ----------
const half = Math.PI / 2;
const curb = (xs, z, h) => xs.map((x) => ({ x, z, h }));
const CURB_SPOTS = [
  ...curb([-148, -132, -118, -70, -58, 58, 78, 120, 178, 210], 188.5, half),
  ...curb([-146, -110, -62, 66, 122, 184], 203.6, -half),
  ...[[6.65, -22, 0], [6.65, -30, 0], [6.65, -50, 0], [-6.65, -26, Math.PI], [-6.65, -52, Math.PI],
    [28, -73.4, -half], [50, -73.4, -half], [24, -86.6, half]].map(([x, z, h]) => ({ x, z, h })),
  ...curb([-178, -152, -132, -92, -72], 217.2, half),
  { x: -56, z: 217.2, h: half, police: true },
];
function buildParkedFleet(root, rng, fleet) {
  const kinds = rng.shuffle(CAR_KINDS.slice());
  while (kinds.length < CURB_SPOTS.length) kinds.push(rng.pick(CAR_KINDS));
  let pick = 0;
  for (let i = 0; i < CURB_SPOTS.length; i++) {
    const spot = CURB_SPOTS[i];
    const kind = spot.police ? 'police' : kinds[pick++];
    const proto = getPrototype(kind);
    const car = proto.clone(true);
    const colour = kind === 'taxi' ? 0xf0b429 : kind === 'police' ? 0xf2f0e8 : rng.pick(BODY_COLORS);
    const side = rng.pick(WHEEL_SIDES);
    const hub = rng.pick(HUBS);
    const variant = {};
    if (kind === 'coupe') variant.spoiler = rng.chance(0.58);
    if (kind === 'van' || kind === 'pickup') variant.rack = rng.chance(0.7);
    if (kind === 'van') variant.surf = rng.chance(0.42);
    variant.taxi = kind === 'taxi'; variant.police = kind === 'police';
    car.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.paint) o.material = paintMaterial(colour);
      else if (o.userData.wheel) o.material = wheelMaterials(side, hub);
      else if (o.userData.acc && !variant[o.userData.acc]) o.visible = false;
    });
    car.position.set(spot.x + rng.range(-0.06, 0.06), 0.025, spot.z + rng.range(-0.08, 0.08));
    car.rotation.y = spot.h + rng.range(-0.018, 0.018);
    root.add(car);
    fleet.cars.push({ kind, x: spot.x, z: spot.z, group: car });
  }
}
// ---------- road paint ----------
function buildRoadPaint(root) {
  const marks = [];
  const add = (x, z, w, d, rot = 0) => marks.push({ x, z, w, d, rot });
  const nearX = (x) => [-240, -160, -80, 0, 80, 160, 240].some((a) => Math.abs(a - x) < 12);
  const nearZ = (z) => [-160, -80, 0, 80, 160, 196].some((a) => Math.abs(a - z) < 12);
  // Boulevard lane dividers, kept off the crossings.
  for (let x = -312; x <= 312; x += 9) {
    if (nearX(x)) continue;
    add(x, 187.2, 3.2, 0.14);
    add(x, 204.8, 3.2, 0.14);
  }
  // Downtown avenue and cross-street lane dividers.
  for (let z = -276; z <= 172; z += 9) {
    if (nearZ(z)) continue;
    add(-4.5, z, 0.14, 3.2);
    add(4.5, z, 0.14, 3.2);
  }
  for (let x = -312; x <= 312; x += 9) {
    if (nearX(x)) continue;
    add(x, -84.4, 3.2, 0.14);
    add(x, -75.6, 3.2, 0.14);
    add(x, -4.5, 3.2, 0.14);
    add(x, 4.5, 3.2, 0.14);
  }
  // Zebra bands at the four entry frames.
  for (let i = 0; i < 10; i++) add(-80, 179.5 + i * 3.7, 3.2, 0.55);
  for (let i = 0; i < 10; i++) add(-44, 179.5 + i * 3.7, 3.2, 0.55);
  for (let i = 0; i < 10; i++) add(-8.1 + i * 1.8, -40, 0.55, 3.2);
  for (let i = 0; i < 3; i++) add(-110, 215.4 + i * 1.35, 4.4, 0.55);
  // Stop lines on the approach lanes.
  add(-91, 192, 0.5, 8); add(-69, 200.2, 0.5, 8);
  add(4.5, 12, 8, 0.5); add(-4.5, -12, 8, 0.5);
  add(-100, 192, 0.5, 8); add(4.5, -66, 8, 0.5);
  const mesh = new THREE.InstancedMesh(MARK_GEO, M.paint, marks.length);
  const mtx = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  marks.forEach((m, i) => {
    pos.set(m.x, 0.089, m.z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.rot);
    scl.set(m.w, 1, m.d);
    mtx.compose(pos, quat, scl);
    mesh.setMatrixAt(i, mtx);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  // A few painted direction arrows, one shared flat shape.
  const shape = new THREE.Shape();
  shape.moveTo(0, -2.1); shape.lineTo(-0.8, -0.6); shape.lineTo(-0.28, -0.6);
  shape.lineTo(-0.28, 1.7); shape.lineTo(0.28, 1.7); shape.lineTo(0.28, -0.6);
  shape.lineTo(0.8, -0.6); shape.closePath();
  const arrowGeo = new THREE.ShapeGeometry(shape);
  arrowGeo.rotateX(-Math.PI / 2);
  const arrows = [
    [-108, 190.5, Math.PI / 2], [-96, 201.5, -Math.PI / 2],
    [-4.4, -30, Math.PI], [4.4, -34, 0], [-128, 217, Math.PI / 2],
  ];
  for (const [x, z, rot] of arrows) {
    const arrow = new THREE.Mesh(arrowGeo, M.paint);
    arrow.position.set(x, 0.094, z);
    arrow.rotation.y = rot;
    root.add(arrow);
  }
}
// ---------- traffic lights ----------
const SIGNAL_SPOTS = [
  { x: -160, z: 196, boulevard: true }, { x: -80, z: 196, boulevard: true },
  { x: 0, z: 196, boulevard: true }, { x: 0, z: 0, boulevard: false },
  { x: 0, z: -80, boulevard: false }, { x: 80, z: 0, boulevard: false },
];
function buildTrafficLights(root, fleet) {
  SIGNAL_SPOTS.forEach((spot, i) => {
    const poleX = spot.x + (spot.boulevard ? -10.6 : 10.6);
    const poleZ = spot.boulevard ? 214.4 : spot.z - 13.6;
    const pole = new THREE.Mesh(POLE_GEO, M.steel);
    pole.scale.y = 6.4;
    pole.position.set(poleX, 3.2, poleZ);
    pole.castShadow = true;
    root.add(pole);
    const arm = new THREE.Mesh(BOX, M.steel);
    if (spot.boulevard) arm.scale.set(0.14, 0.14, 11.2);
    else arm.scale.set(8.4, 0.14, 0.14);
    arm.position.set(spot.boulevard ? poleX : spot.x + 6.4, 6.25, spot.boulevard ? 208.8 : poleZ);
    root.add(arm);
    const head = signalHead(i);
    const headX = spot.boulevard ? poleX : spot.x + 2.2;
    const headZ = spot.boulevard ? 203.2 : poleZ;
    head.group.position.set(headX, 5.55, headZ);
    head.group.rotation.y = spot.boulevard ? -Math.PI / 2 : 0;
    root.add(head.group);
    const ped = new THREE.Group();
    const pedShell = new THREE.Mesh(BOX, M.dark);
    pedShell.scale.set(0.34, 0.54, 0.2);
    ped.add(pedShell);
    const pedLight = new THREE.Mesh(BOX, M.amber);
    pedLight.scale.set(0.2, 0.2, 0.04);
    pedLight.position.set(0, 0.08, 0.12);
    ped.add(pedLight);
    ped.position.set(poleX, 2.7, spot.boulevard ? poleZ - 0.16 : poleZ + 0.16);
    ped.rotation.y = spot.boulevard ? -Math.PI / 2 : 0;
    root.add(ped);
    fleet.signals.push(head.signal);
  });
}
function signalHead(index) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(BOX, M.dark);
  shell.scale.set(0.72, 1.8, 0.26); group.add(shell);
  const on = [M.red, M.amber, M.green];
  const off = [M.offRed, M.offAmber, M.offGreen];
  const lamps = [];
  const initial = index % 3;
  for (let i = 0; i < 3; i++) {
    const lamp = new THREE.Mesh(LAMP_GEO, i === initial ? on[i] : off[i]);
    lamp.position.set(0, 0.52 - i * 0.52, 0.15); group.add(lamp); lamps.push(lamp);
  }
  const signal = { lamps, on, off, phase: (index * 0.19) % 1, state: initial };
  return { group, lamps, signal };
}
// ---------- street furniture ----------
function addBox(group, w, h, d, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  group.add(m);
  return m;
}
const groundAt = (z) => (z > 204 ? 0.12 : 0.32);
function buildStreetFurniture(root, rng, fleet) {
  for (const [x, z, rot] of [[44, 207.4, 0], [-10, -52, -Math.PI / 2]]) {
    const g = new THREE.Group();
    addBox(g, 3.2, 0.18, 1.8, 0, 2.75, 0, M.teal);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.1, 2.7, 0.1, sx * 1.5, 1.35, sz * 0.78, M.steel);
    addBox(g, 3.0, 1.45, 0.06, 0, 1.75, 0.8, M.shelterGlass, false);
    addBox(g, 0.06, 1.45, 1.5, -1.5, 1.75, 0, M.shelterGlass, false);
    addBox(g, 2.2, 0.12, 0.55, 0, 0.56, 0.42, M.wood);
    addBox(g, 2.2, 0.5, 0.08, 0, 0.82, 0.7, M.wood);
    addBox(g, 1.6, 0.38, 0.06, 0, 2.25, -0.78, M.gold, false);
    g.position.set(x, groundAt(z), z); g.rotation.y = rot; root.add(g);
  }
  for (const [x, z, rot] of [[49.5, 207, Math.PI], [-10.2, -44, Math.PI / 2], [-86, 218.4, 0], [16, 216.8, 0]]) {
    const g = new THREE.Group();
    addBox(g, 2.4, 0.14, 0.62, 0, 0.52, 0, M.wood);
    addBox(g, 2.4, 0.5, 0.1, 0, 0.82, -0.28, M.wood);
    for (const sx of [-1, 1]) addBox(g, 0.12, 0.5, 0.5, sx * 0.92, 0.3, 0, M.steel);
    g.position.set(x, groundAt(z), z); g.rotation.y = rot; root.add(g);
  }
  const binGeo = new THREE.CylinderGeometry(0.26, 0.22, 0.9, 8);
  const lidGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.08, 8);
  for (const [x, z] of [[47.6, 208], [-18.5, 207.8], [-120.8, 207.8], [10.2, -28], [-10.4, -64], [-88.5, 218.8]]) {
    const y = groundAt(z);
    const bin = new THREE.Mesh(binGeo, M.steel);
    bin.position.set(x, y + 0.47, z); bin.castShadow = true; root.add(bin);
    const lid = new THREE.Mesh(lidGeo, M.dark);
    lid.position.set(x, y + 0.94, z); root.add(lid);
  }
  const hydGeo = new THREE.CylinderGeometry(0.15, 0.2, 0.62, 7);
  const capGeo = new THREE.SphereGeometry(0.17, 8, 5);
  for (const [x, z] of [[8.6, -48], [-8.6, 20], [60, 206.4], [-106, 207.6]]) {
    const y = groundAt(z);
    const hyd = new THREE.Mesh(hydGeo, M.coral);
    hyd.position.set(x, y + 0.33, z); hyd.castShadow = true; root.add(hyd);
    const cap = new THREE.Mesh(capGeo, M.coral);
    cap.position.set(x, y + 0.7, z); root.add(cap);
    addBox(root, 0.5, 0.13, 0.13, x, y + 0.42, z, M.coral, false);
  }
  const shrubGeo = new THREE.SphereGeometry(0.55, 6, 4);
  for (let i = 0; i < 7; i++) {
    const x = -268 + i * 80;
    const z = 207.4;
    const y = groundAt(z);
    addBox(root, 3.2, 0.62, 0.85, x, y + 0.31, z, M.concrete);
    addBox(root, 2.9, 0.12, 0.62, x, y + 0.65, z, M.soil, false);
    for (const dx of [-0.85, 0, 0.85]) {
      const shrub = new THREE.Mesh(shrubGeo, i % 2 ? M.leaf : M.leafDark);
      shrub.position.set(x + dx, y + 1.05, z); shrub.scale.set(0.8, 0.75, 0.8);
      shrub.castShadow = true; root.add(shrub);
    }
  }
  for (const [x, z, colour] of [[36, 208.8, M.teal], [-10.7, -34, M.coral]]) {
    const g = new THREE.Group();
    addBox(g, 0.56, 0.86, 0.5, 0, 0.45, 0, colour);
    addBox(g, 0.42, 0.34, 0.04, 0, 0.62, 0.27, M.paint, false);
    addBox(g, 0.08, 0.12, 0.08, 0, 0.06, 0.18, M.steel);
    addBox(g, 0.08, 0.12, 0.08, 0, 0.06, -0.18, M.steel);
    g.position.set(x, groundAt(z), z); root.add(g);
  }
  buildFoodTruck(root, fleet);
}
function buildFoodTruck(root, fleet) {
  const g = new THREE.Group();
  addBox(g, 2.3, 2.0, 5.2, 0, 1.72, -0.25, M.coral);
  addBox(g, 2.2, 1.45, 1.55, 0, 1.25, 3.0, M.teal);
  addBox(g, 2.0, 0.5, 0.06, 0, 1.72, 3.8, M.glass, false);
  addBox(g, 2.4, 0.22, 6.5, 0, 0.72, 0.1, M.dark);
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a1e, emissive: 0xffc35c, emissiveIntensity: 1.15, roughness: 0.35,
  });
  addBox(g, 0.07, 0.82, 2.55, -1.17, 1.95, -0.2, windowMat, false);
  addBox(g, 0.28, 0.1, 2.8, -1.3, 1.45, -0.2, M.chrome, false);
  const awning = addBox(g, 1.6, 0.08, 4.2, -1.9, 2.72, -0.2, M.awning, false);
  awning.rotation.z = -0.18;
  for (const dz of [-1.6, 0, 1.6]) addBox(g, 0.06, 0.06, 0.06, -2.55, 2.5, dz, M.lamp, false);
  addBox(g, 0.7, 0.9, 0.08, -1.34, 1.95, 2.2, M.white, false);
  addBox(g, 0.8, 0.3, 0.8, 0.3, 2.86, 0.8, M.steel, false);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wh = new THREE.Mesh(WHEEL_GEO, M.wheelProto);
    wh.position.set(sx * 0.95, 0.36, sz * 1.9);
    wh.castShadow = true;
    g.add(wh);
  }
  g.position.set(-60, 0.12, 208.3);
  g.rotation.y = -Math.PI / 2;
  root.add(g);
  fleet.windowMat = windowMat;
}
// ---------- beach and marina furniture ----------
function buildBeachFurniture(root, rng) {
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.3, 6);
  const canopyGeo = new THREE.ConeGeometry(1.75, 0.62, 8, 1, true);
  const umbrellas = [[-42, 224], [-28, 231], [-10, 220], [4, 229], [22, 223], [38, 232], [96, 224], [118, 230]];
  for (const [x, z] of umbrellas) {
    const pole = new THREE.Mesh(poleGeo, M.white);
    pole.position.set(x, 1.27, z);
    root.add(pole);
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({
      color: rng.pick(UMBRELLA_COLORS), roughness: 0.9, side: THREE.DoubleSide,
    }));
    canopy.position.set(x, 2.45, z);
    canopy.rotation.y = rng.range(0, Math.PI);
    canopy.castShadow = true;
    root.add(canopy);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), M.chrome);
    finial.position.set(x, 2.82, z);
    root.add(finial);
  }
  const towelSpots = [[-38, 225.5], [-24, 229], [6, 226], [26, 228], [92, 227], [114, 232]];
  towelSpots.forEach(([x, z], i) => {
    const towel = new THREE.Mesh(BOX, std(TOWEL_COLORS[i % TOWEL_COLORS.length], 0.95, 0));
    towel.scale.set(1.8, 0.04, 1.0);
    towel.position.set(x, 0.16, z);
    towel.rotation.y = rng.range(-0.5, 0.5);
    root.add(towel);
  });
  for (const [x, z, rot] of [[64, 218, 0.3], [146, 220, -0.2], [-2, 233, 0.6], [198, 220, 0.1]]) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(g, 0.1, 2.1, 0.1, sx * 0.72, 1.05, sz * 0.62, M.white);
    addBox(g, 1.8, 0.14, 1.6, 0, 2.16, 0, M.white);
    addBox(g, 1.5, 0.12, 0.7, 0, 2.5, -0.36, M.white);
    addBox(g, 1.5, 0.7, 0.1, 0, 2.85, -0.66, M.white);
    for (const sx of [-1, 1]) addBox(g, 0.07, 1.7, 0.07, sx * 0.8, 1.0, 1.1, M.steel);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.5, 8), M.canvas);
    canopy.position.set(0, 3.6, 0);
    g.add(canopy);
    g.position.set(x, 0.12, z);
    g.rotation.y = rot;
    root.add(g);
  }
}
