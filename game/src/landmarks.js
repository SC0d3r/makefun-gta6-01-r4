// Landmarks module: handcrafted coastal set dressing for VELA CITY.
// Adds a Ferris wheel, lighthouse, cargo ship, offshore island, hillside sign,
// drive-in theatre and marina pier. Everything is built from shared primitives,
// instanced repetition and a single seeded stream so the four shot presets stay fixed.

import { seededRandom, clamp } from './rng.js';

const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
  bulb: new THREE.SphereGeometry(1, 6, 4),
  rock: new THREE.IcosahedronGeometry(1, 0),
};

const UP = new THREE.Vector3(0, 1, 0);
const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const vA = new THREE.Vector3();
const vB = new THREE.Vector3();
const vS = new THREE.Vector3();
const qTmp = new THREE.Quaternion();
const mTmp = new THREE.Matrix4();

function standard(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.04, ...extra });
}

function light(color, extra = {}) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra });
}

function canvasTexture(w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  paint(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.anisotropy = 4;
  return texture;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,244,214,1)');
    grad.addColorStop(0.28, 'rgba(255,196,112,0.55)');
    grad.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

function addBox(parent, material, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(GEO.box, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scale.set(w, h, d);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, material, radius, height, x, y, z, rx = 0, rz = 0) {
  const mesh = new THREE.Mesh(GEO.cyl, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, 0, rz);
  mesh.scale.set(radius, height, radius);
  parent.add(mesh);
  return mesh;
}

function addStrut(parent, material, ax, ay, az, bx, by, bz, radius) {
  vA.set(ax, ay, az);
  vB.set(bx, by, bz);
  const length = vB.distanceTo(vA);
  const mesh = new THREE.Mesh(GEO.cyl, material);
  mesh.position.copy(vA).add(vB).multiplyScalar(0.5);
  qTmp.setFromUnitVectors(UP, vS.copy(vB).sub(vA).normalize());
  mesh.quaternion.copy(qTmp);
  mesh.scale.set(radius, length, radius);
  parent.add(mesh);
  return mesh;
}

function instanceBoxes(parent, material, items, options = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(GEO.box, material, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x ?? 0, it.y ?? 0, it.z ?? 0);
    dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    dummy.scale.set(it.w ?? 1, it.h ?? 1, it.d ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, tint.setHex(it.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !!options.cast;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}

function instanceCylinders(parent, material, items, options = {}) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(GEO.cyl, material, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    vA.set(it.ax, it.ay, it.az);
    vB.set(it.bx, it.by, it.bz);
    const length = vB.distanceTo(vA);
    vS.copy(vB).sub(vA).normalize();
    qTmp.setFromUnitVectors(UP, vS);
    mTmp.compose(vA.add(vB).multiplyScalar(0.5), qTmp, new THREE.Vector3(it.r, length, it.r));
    mesh.setMatrixAt(i, mTmp);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = !!options.cast;
  mesh.receiveShadow = options.receive !== false;
  parent.add(mesh);
  return mesh;
}

function instanceBulbs(parent, material, points, size = 1) {
  if (!points.length) return null;
  const mesh = new THREE.InstancedMesh(GEO.bulb, material, points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    const s = (p.s ?? 1) * 0.16 * size;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

function instanceRocks(parent, material, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(GEO.rock, material, items.length);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    dummy.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, tint.setHex(it.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeMaterials() {
  return {
    sand: standard(0xd9b98a, { roughness: 0.96 }),
    sandDark: standard(0xc7a373, { roughness: 0.98 }),
    rock: standard(0x77736a, { roughness: 0.95 }),
    rockDark: standard(0x57544d, { roughness: 0.97 }),
    grass: standard(0x5d7247, { roughness: 0.95 }),
    wood: standard(0x8a6a4a, { roughness: 0.9 }),
    woodDark: standard(0x5b4330, { roughness: 0.94 }),
    plank: standard(0x967452, { roughness: 0.88 }),
    steel: standard(0x8c9aa2, { metalness: 0.55, roughness: 0.42 }),
    steelDark: standard(0x3d474e, { metalness: 0.4, roughness: 0.52 }),
    cream: standard(0xf4ead6, { roughness: 0.72 }),
    white: standard(0xf8f3e7, { roughness: 0.7 }),
    coral: standard(0xe8735a, { roughness: 0.76 }),
    coralDeep: standard(0xb74b3c, { roughness: 0.8 }),
    teal: standard(0x2f7f86, { roughness: 0.68 }),
    seaGreen: standard(0x276e77, { roughness: 0.7 }),
    gold: standard(0xd9a13a, { metalness: 0.35, roughness: 0.5 }),
    hull: standard(0x5b2d30, { metalness: 0.18, roughness: 0.62 }),
    hullBand: standard(0xd9c7a8, { roughness: 0.7 }),
    window: new THREE.MeshStandardMaterial({ color: 0x17313a, metalness: 0.35, roughness: 0.28, emissive: 0x0a1c21, emissiveIntensity: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9ed8d8, metalness: 0.25, roughness: 0.15, transparent: true, opacity: 0.34 }),
    warm: light(0xffd28e),
    warmSoft: light(0xffc06a, { transparent: true, opacity: 0.9 }),
    glows: new THREE.MeshBasicMaterial({ color: 0xffc36a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    beam: new THREE.MeshBasicMaterial({ color: 0xffdf9c, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    letter: new THREE.MeshStandardMaterial({ color: 0xffcf85, emissive: 0xff9a3c, emissiveIntensity: 1.15, roughness: 0.4, metalness: 0.2 }),
    container: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.08 }),
    carPaint: standard(0xffffff, { roughness: 0.55, metalness: 0.2 }),
    tyre: standard(0x1c2024, { roughness: 0.92 }),
    screen: new THREE.MeshBasicMaterial({ toneMapped: false }),
    glowTex: glowTexture(),
  };
}

function makeTicketTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#173f45';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffc35c';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#ffe3a6';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia';
    ctx.fillText('TICKETS', w / 2, 58);
    ctx.font = '22px Georgia';
    ctx.fillStyle = '#9fe0d6';
    ctx.fillText('VELA PIER', w / 2, 94);
  });
}

function placeGondolas(wheel) {
  const step = (Math.PI * 2) / wheel.count;
  for (let i = 0; i < wheel.count; i++) {
    const a = wheel.angle + i * step;
    const px = Math.cos(a) * wheel.radius;
    const py = Math.sin(a) * wheel.radius;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(px, py - 1.55, 0);
    dummy.scale.set(2.45, 2.0, 2.9);
    dummy.updateMatrix();
    wheel.body.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, py - 0.48, 0);
    dummy.scale.set(2.75, 0.24, 3.15);
    dummy.updateMatrix();
    wheel.roof.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, py - 1.32, 0);
    dummy.scale.set(2.5, 0.78, 2.96);
    dummy.updateMatrix();
    wheel.band.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, py - 0.24, 0);
    dummy.scale.set(0.075, 1.05, 0.075);
    dummy.updateMatrix();
    wheel.hanger.setMatrixAt(i, dummy.matrix);
  }
  wheel.body.instanceMatrix.needsUpdate = true;
  wheel.roof.instanceMatrix.needsUpdate = true;
  wheel.band.instanceMatrix.needsUpdate = true;
  wheel.hanger.instanceMatrix.needsUpdate = true;
}

function buildWheel(rng, M) {
  const group = new THREE.Group();
  group.position.set(-310, 0.12, 232);
  group.rotation.y = Math.PI / 2;
  const face = new THREE.Group();
  group.add(face);

  addBox(group, M.wood, 27, 0.5, 11, 0, 0.35, 0);
  addBox(group, M.woodDark, 27.6, 0.18, 11.6, 0, 0.1, 0);
  const piles = [];
  for (const x of [-11, -5.5, 0, 5.5, 11]) {
    for (const z of [-4.4, 4.4]) piles.push({ ax: x, ay: -1.1, az: z, bx: x, by: 0.4, bz: z, r: 0.24 });
  }
  instanceCylinders(group, M.woodDark, piles);

  const hubY = 18;
  const radius = 15.5;
  const support = [];
  for (const side of [-2.7, 2.7]) {
    support.push({ ax: -8.6, ay: 0.65, az: side, bx: 0, by: hubY, bz: side, r: 0.34 });
    support.push({ ax: 8.6, ay: 0.65, az: side, bx: 0, by: hubY, bz: side, r: 0.34 });
    support.push({ ax: -5.2, ay: 6.3, az: side, bx: 5.2, by: 6.3, bz: side, r: 0.15 });
    support.push({ ax: -3.3, ay: 12.1, az: side, bx: 3.3, by: 12.1, bz: side, r: 0.12 });
    support.push({ ax: -6.6, ay: 6.8, az: side, bx: 4.9, by: 11.4, bz: side, r: 0.09 });
    support.push({ ax: 6.6, ay: 6.8, az: side, bx: -4.9, by: 11.4, bz: side, r: 0.09 });
  }
  support.push({ ax: 0, ay: hubY - 8, az: -2.7, bx: 0, by: hubY - 8, bz: 2.7, r: 0.14 });
  support.push({ ax: -5.2, ay: 6.3, az: -2.7, bx: 5.2, by: 6.3, bz: 2.7, r: 0.08 });
  support.push({ ax: 5.2, ay: 6.3, az: -2.7, bx: -5.2, by: 6.3, bz: 2.7, r: 0.08 });
  instanceCylinders(face, M.steel, support, { cast: true });

  const feet = [];
  for (const x of [-8.6, 8.6]) for (const z of [-2.7, 2.7]) feet.push({ x, y: 0.45, z, w: 2.5, h: 0.7, d: 1.7 });
  instanceBoxes(group, M.steelDark, feet, { cast: true });
  addCylinder(face, M.steelDark, 0.75, 6.9, 0, hubY, 0, Math.PI / 2);
  addCylinder(face, M.steel, 2.4, 0.55, 0, hubY, -1.55, Math.PI / 2);
  addCylinder(face, M.steel, 2.4, 0.55, 0, hubY, 1.55, Math.PI / 2);

  const spin = new THREE.Group();
  spin.position.y = hubY;
  face.add(spin);
  const rimGeometry = new THREE.TorusGeometry(radius, 0.3, 8, 52);
  for (const z of [-1.3, 1.3]) {
    const rim = new THREE.Mesh(rimGeometry, M.steel);
    rim.position.z = z;
    rim.castShadow = true;
    spin.add(rim);
  }
  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.56, 0.16, 6, 36), M.steelDark);
  spin.add(inner);

  const spokes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const cx = Math.cos(a);
    const sy = Math.sin(a);
    for (const z of [-1.3, 1.3]) {
      spokes.push({ ax: cx * 0.9, ay: sy * 0.9, az: z, bx: cx * (radius - 0.2), by: sy * (radius - 0.2), bz: z, r: 0.075 });
    }
    const b = a + Math.PI / 16;
    spokes.push({ ax: cx * (radius - 0.2), ay: sy * (radius - 0.2), az: -1.3, bx: Math.cos(b) * (radius - 0.2), by: Math.sin(b) * (radius - 0.2), bz: 1.3, r: 0.05 });
  }
  instanceCylinders(spin, M.steelDark, spokes);

  const rimBulbs = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    for (const z of [-1.55, 1.55]) rimBulbs.push({ x: Math.cos(a) * (radius + 0.36), y: Math.sin(a) * (radius + 0.36), z, s: 1 });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rimBulbs.push({ x: Math.cos(a) * radius * 0.56, y: Math.sin(a) * radius * 0.56, z: 0, s: 0.8 });
  }
  instanceBulbs(spin, M.warm, rimBulbs);

  const body = new THREE.InstancedMesh(GEO.box, M.container, 16);
  const roof = new THREE.InstancedMesh(GEO.box, M.coral, 16);
  const band = new THREE.InstancedMesh(GEO.box, M.window, 16);
  const hanger = new THREE.InstancedMesh(GEO.cyl, M.steelDark, 16);
  for (let i = 0; i < 16; i++) {
    body.setColorAt(i, tint.setHex(i % 2 ? 0x2f7f86 : 0xe8735a));
    roof.setColorAt(i, tint.setHex(i % 3 === 0 ? 0xffc35c : 0xf4ead6));
  }
  body.instanceColor.needsUpdate = true;
  roof.instanceColor.needsUpdate = true;
  for (const mesh of [body, roof, band, hanger]) face.add(mesh);

  const wheel = { group, face, spin, body, roof, band, hanger, angle: 0.62, radius, count: 16 };
  placeGondolas(wheel);

  const booth = new THREE.Group();
  booth.position.set(-9.5, 0.6, 3.3);
  booth.rotation.y = -0.18;
  group.add(booth);
  addBox(booth, M.coral, 4.2, 3.1, 3.8, 0, 1.55, 0);
  addBox(booth, M.cream, 4.5, 0.24, 4.1, 0, 3.2, 0);
  addBox(booth, M.window, 2.3, 1.1, 0.12, 0, 2.05, 1.94);
  addBox(booth, M.cream, 2.6, 0.18, 0.34, 0, 1.4, 2.05);
  addBox(booth, M.coralDeep, 0.22, 1.1, 0.16, -1.25, 2.05, 1.96);
  addBox(booth, M.coralDeep, 0.22, 1.1, 0.16, 1.25, 2.05, 1.96);
  const boothSign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.7), light(0xffe2a4, { map: makeTicketTexture(), transparent: true }));
  boothSign.position.set(0, 3.55, 1.96);
  booth.add(boothSign);

  const fence = [];
  for (let x = -13; x <= 13; x += 2.6) {
    fence.push({ x, y: 0.95, z: -5.5, w: 0.12, h: 1.2, d: 0.12 });
    fence.push({ x, y: 0.95, z: 5.5, w: 0.12, h: 1.2, d: 0.12 });
  }
  for (const z of [-5.5, 5.5]) {
    fence.push({ x: 0, y: 1.42, z, w: 26, h: 0.1, d: 0.1 });
    fence.push({ x: 0, y: 0.82, z, w: 26, h: 0.06, d: 0.06 });
  }
  instanceBoxes(group, M.steelDark, fence);

  const lamps = [];
  for (let i = 0; i < 7; i++) {
    const x = -10 + i * 3.3;
    lamps.push({ x, y: 1.55, z: 5.5, s: 1 });
    lamps.push({ x, y: 1.55, z: -5.5, s: 1 });
  }
  instanceBulbs(group, M.warm, lamps);

  const towers = [];
  for (const side of [-7.8, 7.8]) {
    towers.push({ ax: side, ay: 0.7, az: -5.1, bx: side, by: 4.2, bz: -5.1, r: 0.07 });
    towers.push({ ax: side, ay: 4.2, az: -5.1, bx: side, by: 4.2, bz: -3.7, r: 0.06 });
  }
  instanceCylinders(group, M.steelDark, towers);

  return wheel;
}

function addGlowSprite(parent, M, x, y, z, size, color = 0xffd08a, opacity = 0.85) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: M.glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(size, size, 1);
  parent.add(sprite);
  return sprite;
}

function buildLighthouse(rng, M) {
  const group = new THREE.Group();
  group.position.set(-262, 0, 290);

  addCylinder(group, M.rockDark, 5.1, 1.6, 0, 0.55, 0);
  const shoreRocks = [];
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(4.6, 10.5);
    shoreRocks.push({
      x: Math.cos(a) * d, y: rng.range(0.1, 0.9), z: Math.sin(a) * d,
      sx: rng.range(1.1, 3.4), sy: rng.range(0.7, 2.1), sz: rng.range(1.1, 3.2),
      ry: rng.range(0, Math.PI), color: rng.chance(0.4) ? 0x5f5b53 : 0x77736a,
    });
  }
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    shoreRocks.push({
      x: 6 + t * 34 + rng.range(-1.8, 1.8),
      y: rng.range(0.1, 0.8),
      z: 4 - t * 17 + rng.range(-1.6, 1.6),
      sx: rng.range(1.3, 3.0), sy: rng.range(0.7, 1.8), sz: rng.range(1.2, 2.8),
      ry: rng.range(0, Math.PI), color: rng.chance(0.5) ? 0x625e56 : 0x7b776e,
    });
  }
  instanceRocks(group, M.rock, shoreRocks);

  addBox(group, M.rockDark, 34, 1.3, 5.2, 19, 0.85, -6.5, 0.43);
  const jettyPosts = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 4 + t * 32;
    const z = 3.5 - t * 16.5;
    jettyPosts.push({ ax: x, ay: 1.5, az: z - 2.2, bx: x, by: 2.4, bz: z - 2.2, r: 0.07 });
    jettyPosts.push({ ax: x, ay: 2.4, az: z - 2.2, bx: x, by: 2.4, bz: z + 2.2, r: 0.05 });
  }
  instanceCylinders(group, M.steelDark, jettyPosts);

  addCylinder(group, M.rockDark, 4.4, 2.1, 0, 1.6, 0);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 3.35, 21.6, 18), M.cream);
  tower.position.y = 13.3;
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  const bandAt = (y, height) => {
    const r = 3.35 - ((y - 2.5) / 21.6) * 1.3 + 0.045;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, height, 18), M.coral);
    band.position.y = y;
    band.castShadow = true;
    group.add(band);
  };
  bandAt(8.4, 1.0);
  bandAt(15.2, 1.0);
  bandAt(21.0, 0.8);

  addBox(group, M.woodDark, 1.25, 2.2, 0.28, 0, 3.4, 3.05);
  addBox(group, M.cream, 2.2, 0.24, 1.2, 0, 4.55, 3.6, 0, 0.12);
  addBox(group, M.window, 0.62, 0.8, 0.16, 0, 9.2, 3.05);
  addBox(group, M.window, 0.62, 0.8, 0.16, 0.6, 15.9, 2.55, 0.24);
  addBox(group, M.window, 0.6, 0.74, 0.16, -0.7, 18.4, 2.35, -0.28);

  addCylinder(group, M.steelDark, 3.3, 0.35, 0, 24.2, 0);
  addCylinder(group, M.steelDark, 2.15, 0.35, 0, 24.5, 0);
  const gallery = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const x = Math.cos(a) * 3.05;
    const z = Math.sin(a) * 3.05;
    gallery.push({ ax: x, ay: 24.4, az: z, bx: x, by: 25.55, bz: z, r: 0.055 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    gallery.push({
      ax: Math.cos(a) * 2.1, ay: 23.2, az: Math.sin(a) * 2.1,
      bx: Math.cos(a) * 3.15, by: 24.15, bz: Math.sin(a) * 3.15, r: 0.06,
    });
  }
  instanceCylinders(group, M.steelDark, gallery, { cast: true });
  const railTop = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.07, 5, 30), M.gold);
  railTop.rotation.x = Math.PI / 2;
  railTop.position.y = 25.55;
  group.add(railTop);
  const railMid = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.045, 5, 30), M.steelDark);
  railMid.rotation.x = Math.PI / 2;
  railMid.position.y = 25.0;
  group.add(railMid);

  addCylinder(group, M.glass, 1.92, 3.1, 0, 26.05, 0);
  const mullions = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    mullions.push({
      x: Math.cos(a) * 1.88, y: 26.05, z: Math.sin(a) * 1.88,
      w: 0.11, h: 3.1, d: 0.11, ry: -a,
    });
  }
  instanceBoxes(group, M.steelDark, mullions, { cast: true });
  addCylinder(group, M.steelDark, 2.15, 0.28, 0, 27.62, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.55, 2.3, 16), M.coralDeep);
  roof.position.y = 28.85;
  roof.castShadow = true;
  group.add(roof);
  addCylinder(group, M.steelDark, 0.11, 1.5, 0, 30.55, 0);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), M.gold);
  finial.position.y = 31.35;
  group.add(finial);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), M.warm);
  lamp.position.y = 26.15;
  group.add(lamp);
  addGlowSprite(group, M, 0, 26.2, 0, 9, 0xffd89a, 0.8);

  const beamPivot = new THREE.Group();
  beamPivot.position.y = 26.15;
  beamPivot.rotation.y = 0.55;
  group.add(beamPivot);
  const beamCone = new THREE.Mesh(new THREE.ConeGeometry(7.4, 42, 12, 1, true), M.beam);
  beamCone.rotation.z = -Math.PI / 2;
  beamCone.position.x = 21;
  beamPivot.add(beamCone);
  const beamCone2 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 13, 10, 1, true), M.beam);
  beamCone2.rotation.z = -Math.PI / 2;
  beamCone2.position.x = 6.5;
  beamPivot.add(beamCone2);

  const cottage = new THREE.Group();
  cottage.position.set(-13.5, 0.4, -5.5);
  cottage.rotation.y = 0.22;
  group.add(cottage);
  addBox(cottage, M.rockDark, 9.2, 0.9, 7.2, 0, 0.45, 0);
  addBox(cottage, M.cream, 8.4, 4.2, 6.2, 0, 3.0, 0);
  addBox(cottage, M.coral, 8.9, 0.34, 6.7, 0, 5.05, 0);
  addBox(cottage, M.roofRed, 9.5, 0.26, 4.0, 0, 5.9, 1.62, 0, 0.56);
  addBox(cottage, M.roofRed, 9.5, 0.26, 4.0, 0, 5.9, -1.62, 0, -0.56);
  addBox(cottage, M.coralDeep, 1.1, 2.4, 1.0, 2.7, 6.8, 0.5);
  addBox(cottage, M.woodDark, 1.25, 2.15, 0.18, 0, 1.6, 3.14);
  addBox(cottage, M.window, 1.3, 1.0, 0.16, -2.3, 2.7, 3.12);
  addBox(cottage, M.window, 1.3, 1.0, 0.16, 2.4, 2.7, 3.12);
  addBox(cottage, M.window, 0.16, 1.0, 1.2, -4.2, 2.7, 0.2);
  addBox(cottage, M.wood, 5.4, 0.18, 1.7, 0, 1.05, 4.0);
  for (const x of [-2.2, 2.2]) {
    addBox(cottage, M.woodDark, 0.16, 2.0, 0.16, x, 2.05, 4.75);
  }
  addBox(cottage, M.coral, 5.8, 0.22, 2.0, 0, 3.12, 4.1, 0, 0.1);
  addBox(cottage, M.warm, 0.3, 0.42, 0.3, 1.9, 3.3, 3.2);
  addGlowSprite(cottage, M, 1.9, 3.35, 3.35, 2.3, 0xffc36a, 0.65);

  const cottageFence = [];
  for (let i = 0; i < 12; i++) {
    const x = -5.5 + i * 1.0;
    cottageFence.push({ x, y: 1.1, z: 4.9, w: 0.12, h: 1.5, d: 0.12, ry: 0.15 });
  }
  cottageFence.push({ x: 0, y: 1.55, z: 4.9, w: 11.2, h: 0.09, d: 0.09, ry: 0.15 });
  cottageFence.push({ x: 0, y: 1.05, z: 4.9, w: 11.2, h: 0.07, d: 0.07, ry: 0.15 });
  instanceBoxes(cottage, M.woodDark, cottageFence);

  const shed = new THREE.Group();
  shed.position.set(4.6, 0.4, -8.5);
  shed.rotation.y = -0.3;
  group.add(shed);
  addBox(shed, M.wood, 4.4, 2.6, 3.4, 0, 1.5, 0);
  addBox(shed, M.coralDeep, 4.8, 0.24, 3.8, 0, 2.85, 0, 0, 0.08);
  addBox(shed, M.woodDark, 1.0, 1.9, 0.16, 0, 1.15, 1.78);
  addBox(shed, M.window, 0.9, 0.7, 0.14, 1.2, 1.7, 1.76);
  addBox(shed, M.warm, 0.22, 0.3, 0.22, -1.55, 2.1, 1.8);

  return { group, beamPivot, beamMat: M.beam };
}

function buildCargoShip(rng, M) {
  const group = new THREE.Group();
  group.position.set(-150, 0, 296);
  group.rotation.y = 0.18;

  addBox(group, M.hull, 62, 5.6, 14, -10, 1.7, 0);
  addBox(group, M.hull, 12, 5.2, 12.4, 22, 1.8, 0);
  addBox(group, M.hull, 9, 4.4, 9.6, 31, 2.0, 0);
  addBox(group, M.hull, 6, 3.4, 6.2, 37.5, 2.2, 0);
  addBox(group, M.hull, 16, 6.0, 14.2, -36, 1.9, 0);
  addBox(group, M.hullBand, 62, 0.85, 14.3, -10, 3.7, 0);
  addBox(group, M.hullBand, 12, 0.75, 12.6, 22, 3.75, 0);
  addBox(group, M.hullBand, 9, 0.6, 9.8, 31, 3.9, 0);
  addBox(group, M.steelDark, 76, 0.55, 12.8, -2, 4.55, 0);
  addBox(group, M.steelDark, 9, 0.5, 7.2, 33, 4.7, 0);

  const bridge = new THREE.Group();
  bridge.position.set(-29, 4.9, 0);
  group.add(bridge);
  addBox(bridge, M.cream, 10.5, 10.5, 12.4, 0, 5.25, 0);
  addBox(bridge, M.white, 11.2, 0.4, 13.0, 0, 10.7, 0);
  addBox(bridge, M.hull, 8.4, 2.2, 11.6, 0.6, 11.9, 0);
  addBox(bridge, M.steelDark, 4.2, 1.0, 9.0, 2.4, 13.2, 0);
  addBox(bridge, M.window, 0.24, 1.5, 10.0, 5.3, 8.1, 0);
  for (const z of [-4.4, -2.2, 0, 2.2, 4.4]) {
    addBox(bridge, M.warm, 0.16, 0.42, 0.9, 5.42, 8.6, z);
    addBox(bridge, M.warm, 0.16, 0.5, 0.8, 5.42, 6.0, z * 0.86);
  }
  addBox(bridge, M.window, 0.2, 1.2, 1.0, 5.34, 3.4, 0);
  addGlowSprite(bridge, M, 5.7, 8.4, 0, 7.5, 0xffd08a, 0.55);

  addCylinder(bridge, M.hull, 2.3, 4.6, -0.6, 14.0, 0);
  addCylinder(bridge, M.cream, 2.34, 0.5, -0.6, 15.4, 0);
  addCylinder(bridge, M.steelDark, 2.5, 0.5, -0.6, 16.5, 0);
  addBox(bridge, M.steelDark, 4.6, 0.55, 0.4, -0.6, 16.8, 0);
  addCylinder(bridge, M.steelDark, 0.09, 3.0, 2.5, 12.5, 0);

  const colors = [0xc4553f, 0x2f7f86, 0xd9a13a, 0x4a6d8c, 0x8f5b9c, 0x6f8f4a, 0xb8794a];
  const boxes = [];
  const stackX = [-14, -1.5, 11, 23.5];
  for (let s = 0; s < stackX.length; s++) {
    for (let layer = 0; layer < 3; layer++) {
      for (let row = -1; row <= 1; row++) {
        boxes.push({
          x: stackX[s] + rng.range(-0.15, 0.15), y: 6.7 + layer * 2.7, z: row * 2.85,
          w: 11.8, h: 2.55, d: 2.66, color: colors[(s * 3 + layer + row + 9) % colors.length],
        });
      }
    }
  }
  const containers = instanceBoxes(group, M.container, boxes);

  const cranes = [];
  for (const cx of [-18, 5]) {
    cranes.push({ ax: cx, ay: 4.8, az: -4.4, bx: cx, by: 16.5, bz: -3.4, r: 0.34 });
    cranes.push({ ax: cx, ay: 4.8, az: 4.4, bx: cx, by: 16.5, bz: 3.4, r: 0.34 });
    cranes.push({ ax: cx, ay: 10.5, az: -4.0, bx: cx, by: 10.5, bz: 4.0, r: 0.16 });
    cranes.push({ ax: cx, ay: 16.5, az: 0, bx: cx + 13, by: 21.5, bz: 0, r: 0.24 });
    cranes.push({ ax: cx, ay: 16.5, az: 0, bx: cx - 5, by: 19.5, bz: 0, r: 0.18 });
    cranes.push({ ax: cx + 13, ay: 21.5, az: 0, bx: cx + 13, by: 2.0, bz: 0, r: 0.035 });
  }
  instanceCylinders(group, M.steel, cranes, { cast: true });

  const rails = [];
  for (let x = -38; x <= 34; x += 4) {
    rails.push({ x, y: 5.6, z: -6.2, w: 0.12, h: 1.2, d: 0.12 });
    rails.push({ x, y: 5.6, z: 6.2, w: 0.12, h: 1.2, d: 0.12 });
  }
  rails.push({ x: -2, y: 6.2, z: -6.2, w: 72, h: 0.09, d: 0.09 });
  rails.push({ x: -2, y: 6.2, z: 6.2, w: 72, h: 0.09, d: 0.09 });
  rails.push({ x: -2, y: 5.7, z: -6.2, w: 72, h: 0.06, d: 0.06 });
  rails.push({ x: -2, y: 5.7, z: 6.2, w: 72, h: 0.06, d: 0.06 });
  instanceBoxes(group, M.steelDark, rails);

  const deckLights = [];
  for (let i = 0; i < 12; i++) {
    deckLights.push({ x: -36 + i * 6, y: 7.4, z: i % 2 ? 5.9 : -5.9, s: 1 });
  }
  for (let i = 0; i < 4; i++) deckLights.push({ x: -29, y: 17.4 + i * 0.9, z: 0, s: 1.1 });
  instanceBulbs(group, M.warm, deckLights);

  const navRed = light(0xff4433);
  const navGreen = light(0x58ff8c);
  const navWhite = light(0xfff2cf);
  addBox(group, navRed, 0.34, 0.34, 0.34, 38.5, 5.1, -3.2);
  addBox(group, navGreen, 0.34, 0.34, 0.34, 38.5, 5.1, 3.2);
  addBox(group, navWhite, 0.28, 0.28, 0.28, -29, 17.1, 0);
  addBox(group, navWhite, 0.24, 0.24, 0.24, -29, 18.4, 0);

  const chain = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    chain.push({
      ax: 39 + t * 7.5, ay: 4.6 - t * 6.4, az: -2 + t * 1.2,
      bx: 39 + (t + 0.08) * 7.5, by: 4.6 - (t + 0.08) * 6.4, bz: -2 + (t + 0.08) * 1.2,
      r: 0.09,
    });
  }
  instanceCylinders(group, M.steelDark, chain);
  addBox(group, M.steelDark, 0.8, 1.6, 0.5, 47.6, -2.6, -0.8, 0.3);

  return { group, containers };
}

function buildIsland(rng, M) {
  const group = new THREE.Group();
  group.position.set(-244, 0, 292);

  addCylinder(group, M.sandDark, 25.5, 0.8, 0, 0.05, 0);
  addCylinder(group, M.sand, 23.2, 0.9, 0, 0.35, 0);

  const rocks = [];
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(22.5, 28.5);
    rocks.push({
      x: Math.cos(a) * d, y: rng.range(-0.1, 0.7), z: Math.sin(a) * d,
      sx: rng.range(1.2, 3.2), sy: rng.range(0.6, 1.9), sz: rng.range(1.2, 3.0),
      ry: rng.range(0, Math.PI), color: rng.chance(0.5) ? 0x6d6960 : 0x827d72,
    });
  }
  instanceRocks(group, M.rock, rocks);

  const palms = [
    [-13, 3, 0.2], [-6, -9, 1.1], [3, 7, 2.2], [10, -4, 3.1], [14, 8, 4.0], [-2, 14, 5.2],
  ];
  for (let p = 0; p < palms.length; p++) {
    const [px, pz, tilt] = palms[p];
    const h = rng.range(8.5, 11.5);
    const lean = rng.range(0.05, 0.16);
    const tipX = px + Math.sin(tilt) * lean * h;
    const tipZ = pz + Math.cos(tilt) * lean * h;
    addCylinder(group, M.wood, 0.34, h, px, h * 0.5 + 0.4, pz, lean * Math.cos(tilt), lean * Math.sin(tilt));
    addCylinder(group, M.woodDark, 0.52, 0.7, px, 0.85, pz);

    const crownY = h + 0.4;
    const frondBoxes = [];
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + rng.range(-0.16, 0.16);
      const length = rng.range(3.4, 5.2);
      frondBoxes.push({
        x: tipX + Math.cos(a) * length * 0.5,
        y: crownY + 0.32 - length * 0.17,
        z: tipZ + Math.sin(a) * length * 0.5,
        w: length, h: 0.16, d: 0.9, ry: -a, rz: -0.32,
      });
    }
    const crown = new THREE.Group();
    crown.position.set(tipX, crownY, tipZ);
    group.add(crown);
    instanceBoxes(crown, M.grass, frondBoxes.map((b) => ({
      x: b.x - tipX, y: b.y - crownY, z: b.z - tipZ,
      w: b.w, h: b.h, d: b.d, ry: b.ry, rz: b.rz,
    })), { cast: true });
    const nuts = [];
    for (let n = 0; n < 4; n++) {
      const a = (n / 4) * Math.PI * 2;
      nuts.push({ x: tipX + Math.cos(a) * 0.42, y: crownY - 0.25, z: tipZ + Math.sin(a) * 0.42, s: 0.9 });
    }
    instanceBulbs(group, M.woodDark, nuts);
  }

  const shack = new THREE.Group();
  shack.position.set(-3, 0.7, -1);
  shack.rotation.y = 0.42;
  group.add(shack);
  addBox(shack, M.woodDark, 6.6, 0.5, 5.2, 0, 0.25, 0);
  addBox(shack, M.wood, 6.0, 3.1, 4.6, 0, 1.85, 0);
  addBox(shack, M.coralDeep, 6.7, 0.26, 5.2, 0, 3.55, 0, 0, 0.06);
  addBox(shack, M.steelDark, 1.2, 2.1, 0.14, -1.4, 1.4, 2.36);
  addBox(shack, M.window, 1.5, 1.0, 0.14, 1.2, 2.0, 2.36);
  addBox(shack, M.warm, 1.1, 0.68, 0.08, 1.2, 2.0, 2.3);
  addBox(shack, M.wood, 2.6, 0.16, 1.4, 1.5, 1.1, 3.0);
  addBox(shack, M.woodDark, 0.14, 1.5, 0.14, 0.5, 1.55, 3.4);
  addBox(shack, M.woodDark, 0.14, 1.5, 0.14, 2.5, 1.55, 3.4);
  addGlowSprite(shack, M, 1.3, 2.05, 2.7, 2.6, 0xffbf6f, 0.6);

  const canoe = new THREE.Group();
  canoe.position.set(9.5, 0.75, 10.5);
  canoe.rotation.y = -0.7;
  group.add(canoe);
  addBox(canoe, M.coral, 5.2, 0.55, 1.15, 0, 0.3, 0);
  addBox(canoe, M.coralDeep, 1.8, 0.5, 0.9, 3.1, 0.32, 0, 0, 0, 0.42);
  addBox(canoe, M.coralDeep, 1.8, 0.5, 0.9, -3.1, 0.32, 0, 0, 0, -0.42);
  addBox(canoe, M.wood, 4.6, 0.14, 0.9, 0, 0.6, 0);
  addBox(canoe, M.woodDark, 0.28, 0.14, 1.35, 0.9, 0.72, 0);
  addBox(canoe, M.woodDark, 0.28, 0.14, 1.35, -0.9, 0.72, 0);
  addCylinder(canoe, M.plank, 0.06, 3.4, 0.2, 0.95, 1.4, 0, Math.PI / 2);

  const birds = [];
  for (let i = 0; i < 9; i++) {
    birds.push({
      x: rng.range(-24, 26), y: rng.range(34, 48), z: rng.range(-22, 22),
      w: rng.range(0.9, 1.5), h: 0.08, d: 0.24,
      ry: rng.range(0, Math.PI), rz: rng.chance(0.5) ? 0.28 : -0.28,
    });
  }
  instanceBoxes(group, M.steelDark, birds);

  return { group };
}

function buildHillsideSign(M) {
  const group = new THREE.Group();
  group.position.set(-20, 30, -238);
  group.rotation.y = 0.03;

  const glyphs = {
    V: [[-3, 10, 0, 0], [3, 10, 0, 0]],
    E: [[-2.4, 10, -2.4, 0], [-2.4, 10, 2.4, 10], [-2.4, 5, 1.9, 5], [-2.4, 0, 2.4, 0]],
    L: [[-2.4, 10, -2.4, 0], [-2.4, 0, 2.4, 0]],
    A: [[-3, 0, 0, 10], [3, 0, 0, 10], [-1.55, 4.2, 1.55, 4.2]],
    C: [[2.1, 10, -1.2, 10], [-2.4, 9.4, -2.4, 0.6], [-1.2, 0, 2.1, 0]],
    I: [[0, 0, 0, 10], [-2, 10, 2, 10], [-2, 0, 2, 0]],
    T: [[-3, 10, 3, 10], [0, 10, 0, 0]],
    Y: [[-2.6, 10, 0, 5.2], [2.6, 10, 0, 5.2], [0, 5.2, 0, 0]],
  };
  const word = 'VELACITY';
  const spacing = 11.4;
  const startX = -((word.length - 1) * spacing) / 2;
  const letterScale = 1.32;

  for (let i = 0; i < word.length; i++) {
    const letterGroup = new THREE.Group();
    letterGroup.position.set(startX + i * spacing, 1.15, 0.25);
    letterGroup.scale.setScalar(letterScale);
    group.add(letterGroup);
    for (const [x1, y1, x2, y2] of glyphs[word[i]]) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      addBox(letterGroup, M.letter, len + 0.85, 0.92, 0.72,
        (x1 + x2) / 2, (y1 + y2) / 2, 0, 0, 0, Math.atan2(dy, dx));
    }
    addGlowSprite(group, M, startX + i * spacing, 7.4, 1.2, 12.5, 0xffb45e, 0.34);
    addStrut(group, M.steelDark,
      startX + i * spacing, 1.25, -1.1,
      startX + i * spacing, 8.2, -1.35, 0.075);
  }

  addBox(group, M.steelDark, 91, 0.32, 2.5, 0, 0.55, -1.5);
  addBox(group, M.steel, 92, 0.1, 0.14, 0, 1.75, -2.7);
  const catwalk = [];
  for (let x = -45; x <= 45; x += 3) {
    catwalk.push({ x, y: 1.15, z: -2.7, w: 0.1, h: 1.2, d: 0.1 });
  }
  instanceBoxes(group, M.steelDark, catwalk);

  addStrut(group, M.steelDark, -31, 0.6, -1.8, -35, -15, -6.5, 0.85);
  addStrut(group, M.steelDark, 31, 0.6, -1.8, 35, -15, -6.5, 0.85);
  addStrut(group, M.steelDark, -35, -15, -6.5, -26, -15, -5.0, 0.55);
  addStrut(group, M.steelDark, 35, -15, -6.5, 26, -15, -5.0, 0.55);
  addBox(group, M.steelDark, 3.2, 0.5, 3.2, -35, -15.2, -6.5);
  addBox(group, M.steelDark, 3.2, 0.5, 3.2, 35, -15.2, -6.5);

  const signGlow = new THREE.PointLight(0xffb45e, 0.85, 120, 2);
  signGlow.position.set(0, 8, 5);
  group.add(signGlow);

  return { group };
}

function buildDriveIn(rng, M) {
  const group = new THREE.Group();
  group.position.set(74, 0, 252);

  const screenTex = canvasTexture(512, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2a2340');
    grad.addColorStop(0.38, '#7b3f63');
    grad.addColorStop(0.62, '#e0705a');
    grad.addColorStop(0.78, '#ffb45e');
    grad.addColorStop(1, '#ffd79a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.62, h * 0.62, 4, w * 0.62, h * 0.62, 62);
    sun.addColorStop(0, 'rgba(255,248,214,1)');
    sun.addColorStop(0.55, 'rgba(255,204,120,0.9)');
    sun.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.62, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(46,32,52,0.75)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, h * 0.74 + i * 9, w, 3 + i);
    ctx.fillStyle = '#2a1f2c';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.66);
    ctx.quadraticCurveTo(w * 0.06, h * 0.5, w * 0.1, h * 0.7);
    ctx.lineTo(w * 0.16, h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w, h);
    ctx.lineTo(w, h * 0.6);
    ctx.quadraticCurveTo(w * 0.92, h * 0.46, w * 0.88, h * 0.68);
    ctx.lineTo(w * 0.84, h);
    ctx.fill();
  });
  M.screen.map = screenTex;
  M.screen.needsUpdate = true;

  addBox(group, M.steelDark, 1.6, 17.5, 1.6, -12, 8.75, -5.4);
  addBox(group, M.steelDark, 1.6, 17.5, 1.6, 12, 8.75, -5.4);
  addBox(group, M.steel, 33.5, 0.6, 1.2, 0, 17.4, -5.4);
  addBox(group, M.steel, 33.5, 0.6, 1.2, 0, 9.9, -5.4);
  addBox(group, M.steelDark, 34.8, 0.45, 0.9, 0, 25.9, -5.4);
  addBox(group, M.steelDark, 1.2, 17.5, 0.5, 0, 17.2, -4.6);
  addStrut(group, M.steel, -12, 9.6, -5.2, 0, 24.8, -5.2, 0.1);
  addStrut(group, M.steel, 12, 9.6, -5.2, 0, 24.8, -5.2, 0.1);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 15.4), M.screen);
  screen.position.set(0, 17.6, -5.9);
  screen.rotation.y = Math.PI;
  group.add(screen);
  const screenBack = addBox(group, M.steelDark, 33.2, 16.4, 0.35, 0, 17.6, -5.1);
  screenBack.castShadow = false;

  const hut = new THREE.Group();
  hut.position.set(-19, 0, 7.5);
  hut.rotation.y = -0.16;
  group.add(hut);
  addBox(hut, M.woodDark, 7.4, 0.5, 5.6, 0, 0.25, 0);
  addBox(hut, M.cream, 6.8, 4.0, 5.0, 0, 2.25, 0);
  addBox(hut, M.coral, 7.3, 0.3, 5.5, 0, 4.35, 0);
  addBox(hut, M.window, 2.0, 1.1, 0.14, 0.6, 2.7, -2.56);
  addBox(hut, M.warm, 0.7, 0.5, 0.08, -1.9, 2.6, -2.6);
  addBox(hut, M.steelDark, 1.1, 2.0, 0.14, 1.9, 1.2, -2.56);
  addBox(hut, M.steel, 0.5, 0.4, 0.7, 0.6, 3.5, -2.9);
  addGlowSprite(hut, M, 0.6, 3.6, -3.4, 4.5, 0xffc98a, 0.5);

  const fence = [];
  for (let x = -34; x <= 34; x += 3.4) {
    fence.push({ x, y: 1.05, z: -18, w: 0.13, h: 2.1, d: 0.13 });
  }
  fence.push({ x: 0, y: 1.75, z: -18, w: 68, h: 0.12, d: 0.12 });
  fence.push({ x: 0, y: 0.85, z: -18, w: 68, h: 0.08, d: 0.08 });
  for (const side of [-34, 34]) {
    for (let z = -18; z <= 24; z += 3.4) {
      fence.push({ x: side, y: 1.05, z, w: 0.13, h: 2.1, d: 0.13 });
    }
    fence.push({ x: side, y: 1.75, z: 3, w: 0.12, h: 0.12, d: 42 });
  }
  instanceBoxes(group, M.steelDark, fence);

  const carColors = [0x6b2f35, 0x2f4f63, 0xd9c7a8, 0x3c5b46, 0x8a6a4a, 0x4a3f5c];
  const carBodies = [];
  const carTops = [];
  const wheels = [];
  for (let i = 0; i < 6; i++) {
    const cx = -24 + i * 9.4 + rng.range(-0.4, 0.4);
    const cz = i % 2 === 0 ? -11.5 : -15.5;
    const color = carColors[i % carColors.length];
    carBodies.push({ x: cx, y: 0.95, z: cz, w: 4.5, h: 0.9, d: 2.0, color });
    carTops.push({ x: cx - 0.25, y: 1.75, z: cz, w: 2.4, h: 0.8, d: 1.8, color: 0x27313a });
    for (const wx of [-1.5, 1.5]) {
      for (const wz of [-0.95, 0.95]) {
        wheels.push({ ax: cx + wx, ay: 0.34, az: cz + wz, bx: cx + wx, by: 0.34, bz: cz + wz + 0.24, r: 0.34 });
      }
    }
  }
  instanceBoxes(group, M.carPaint, carBodies);
  instanceBoxes(group, M.window, carTops);
  instanceCylinders(group, M.tyre, wheels);

  const marqueeTex = canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#1d343a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffc35c';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#ffe3a6';
    ctx.textAlign = 'center';
    ctx.font = 'bold 58px Georgia';
    ctx.fillText('VELA DRIVE-IN', w / 2, 78);
    ctx.fillStyle = '#9fe0d6';
    ctx.font = '26px Georgia';
    ctx.fillText('TONIGHT · DOUBLE FEATURE', w / 2, 122);
  });
  const marquee = new THREE.Group();
  marquee.position.set(27, 0, -16.5);
  marquee.rotation.y = -0.12;
  group.add(marquee);
  addBox(marquee, M.steelDark, 0.28, 7.0, 0.28, -3.2, 3.5, 0);
  addBox(marquee, M.steelDark, 0.28, 7.0, 0.28, 3.2, 3.5, 0);
  addBox(marquee, M.steelDark, 7.4, 0.24, 0.5, 0, 7.0, 0);
  const marqueeBoard = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 3.1),
    light(0xffffff, { map: marqueeTex, transparent: true }));
  marqueeBoard.position.set(0, 5.3, -0.16);
  marqueeBoard.rotation.y = Math.PI;
  marquee.add(marqueeBoard);
  addBox(marquee, M.steelDark, 9.8, 3.5, 0.22, 0, 5.3, 0);
  const bulbs = [];
  for (let i = 0; i < 14; i++) {
    bulbs.push({ x: -4.6 + i * 0.71, y: 6.95, z: -0.2, s: 0.8 });
    bulbs.push({ x: -4.6 + i * 0.71, y: 3.65, z: -0.2, s: 0.8 });
  }
  instanceBulbs(marquee, M.warm, bulbs);

  return { group };
}

export function createLandmarks(scene, seed) {
  const rng = seededRandom(seed ^ 0x5eed);
  const M = makeMaterials();
  const root = new THREE.Group();
  root.name = 'landmarks';

  const wheel = buildWheel(rng, M);
  const lighthouse = buildLighthouse(rng, M);
  const ship = buildCargoShip(rng, M);
  const island = buildIsland(rng, M);
  const sign = buildHillsideSign(M);
  const driveIn = buildDriveIn(rng, M);

  root.add(wheel.group);
  root.add(lighthouse.group);
  root.add(ship.group);
  root.add(island.group);
  root.add(sign.group);
  root.add(driveIn.group);
  scene.add(root);

  return { root, wheel, lighthouse, ship, island, sign, driveIn, time: 0 };
}

export function updateLandmarks(landmarks, dt, time) {
  if (!landmarks) return;

  const wheel = landmarks.wheel;
  wheel.angle += dt * 0.07;
  placeGondolas(wheel);
  wheel.spin.rotation.z = -wheel.angle;

  const lighthouse = landmarks.lighthouse;
  lighthouse.beamPivot.rotation.y += dt * 0.35;
  lighthouse.beamMat.opacity = 0.13 + Math.sin(time * 1.7) * 0.05;

  const ship = landmarks.ship.group;
  ship.position.y = Math.sin(time * 0.35) * 0.16;
  ship.rotation.z = Math.sin(time * 0.22) * 0.012;

  landmarks.time = time;
}
