// City pass: districts, blocks and props frozen for the r7 entry.
// VELA CITY generator: a golden-hour coastal grid of coral low-rises, teal glass towers, a palm
// boulevard, sand beach, marina docks and boats, hillside villas and painted canvas signs.
// Everything is built from instanced boxes and canvas textures — no external assets.
// r13 city-systems pass: the city generator is unchanged.

import { PALETTE, CITY_LAYOUT } from './config.js';
import { seededRandom, clamp } from './rng.js';

export function generateCity(scene, seed = 7) {
  const rng = seededRandom(seed);
  cityColliders.length = 0;
  minimapRoads.length = 0;
  citySigns.length = 0;
  marinaDocks.length = 0;
  marinaCrates.length = 0;
  const root = new THREE.Group();
  root.name = 'vela-city';
  scene.add(root);
  const water = buildGround(root, rng);
  buildRoads(root, rng);
  buildBuildings(root, rng);
  buildBeach(root, rng);
  const boats = buildMarina(root, rng);
  buildHills(root, rng);
  const signs = buildCitySigns(root);
  addStreetLights(root, rng);
  addPalms(root, rng);
  addProps(root, rng);
  return {
    root, colliders: cityColliders, roads: minimapRoads, signs, crates: marinaCrates,
    docks: marinaDocks, water, boats, landmark: { x: 40, z: -40 },
  };
}

export const minimapRoads = [];
export const cityColliders = [];
export const citySigns = [];
export const marinaDocks = [];
export const marinaCrates = [];

export function buildRoads(root, rng) {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.94, metalness: 0.04 });
  const markMat = new THREE.MeshBasicMaterial({ color: 0xf2e6c8 });
  const L = CITY_LAYOUT;
  const roadGeo = new THREE.PlaneGeometry(1, 1);
  const addStrip = (x, z, w, d) => {
    const m = new THREE.Mesh(roadGeo, roadMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    root.add(m);
    minimapRoads.push({ x, z, w, h: d });
  };
  for (const x of L.avenues) addStrip(x, -45, L.roadHalf * 2, 482);
  for (const z of L.streets) addStrip(0, z, 660, L.roadHalf * 2);
  addStrip(0, L.boulevardZ, 660, L.roadHalf * 2 * 2);
  addStrip(0, 200, 660, 20);

  // Lane dashes and edge lines read as one-point perspective in the chase frame.
  const dashGeo = new THREE.BoxGeometry(3.1, 0.02, 0.18);
  const dashes = [];
  for (const x of L.avenues) for (let z = -285; z < 188; z += 10) dashes.push([x, z, Math.PI / 2]);
  for (const z of L.streets) for (let x = -325; x < 325; x += 10) dashes.push([x, z, 0]);
  for (let x = -325; x < 325; x += 10) dashes.push([x, L.boulevardZ, 0]);
  const dm = new THREE.InstancedMesh(dashGeo, markMat, dashes.length);
  const mtx = new THREE.Matrix4();
  dashes.forEach((d, i) => {
    mtx.makeRotationY(d[2]);
    mtx.setPosition(d[0], 0.06, d[1]);
    dm.setMatrixAt(i, mtx);
  });
  dm.instanceMatrix.needsUpdate = true;
  root.add(dm);

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xcbbd9f });
  const edgeGeo = new THREE.BoxGeometry(1, 0.02, 0.14);
  const edges = [];
  for (const x of L.avenues) {
    edges.push([x - 8.1, 0, 0, 482]); edges.push([x + 8.1, 0, 0, 482]);
  }
  for (const z of L.streets) {
    edges.push([0, z - 8.1, 1, 660]); edges.push([0, z + 8.1, 1, 660]);
  }
  edges.push([0, L.boulevardZ - 17.2, 1, 660]); edges.push([0, L.boulevardZ + 17.2, 1, 660]);
  const em = new THREE.InstancedMesh(edgeGeo, edgeMat, edges.length);
  edges.forEach((e, i) => {
    mtx.makeRotationY(e[2] ? Math.PI / 2 : 0);
    mtx.scale(new THREE.Vector3(1, 1, e[3]));
    mtx.setPosition(e[0], 0.07, e[1]);
    em.setMatrixAt(i, mtx);
  });
  em.instanceMatrix.needsUpdate = true;
  root.add(em);

  // Crosswalks at downtown intersections.
  const cwMat = new THREE.MeshBasicMaterial({ color: 0xe8dfc9 });
  const cwGeo = new THREE.BoxGeometry(0.7, 0.02, 3.0);
  const cw = [];
  for (const x of [-160, -80, 0, 80, 160]) for (const z of [-80, 0, 80]) {
    for (let i = -4; i <= 4; i++) cw.push([x + i * 1.4, z - 12.4, 0]);
    for (let i = -4; i <= 4; i++) cw.push([x + i * 1.4, z + 12.4, 0]);
  }
  const cwm = new THREE.InstancedMesh(cwGeo, cwMat, cw.length);
  cw.forEach((p, i) => {
    mtx.identity(); mtx.setPosition(p[0], 0.055, p[1]);
    cwm.setMatrixAt(i, mtx);
  });
  cwm.instanceMatrix.needsUpdate = true;
  root.add(cwm);
}

function sidewalkBlock(root, x0, x1, z0, z1) {
  const mat = matFor(0xb7a692);
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(x1 - x0, 0.3, z1 - z0);
  m.position.set((x0 + x1) / 2, 0.15, (z0 + z1) / 2);
  m.receiveShadow = true;
  root.add(m);
}

export function buildBuildings(root, rng) {
  const L = CITY_LAYOUT;
  const xs = [-320, ...L.avenues, 320];
  const zs = [-280, ...L.streets, 160, 196];
  const win = { dark: [], lit: [], pink: [] };
  const awnings = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const x0 = xs[i] + 11, x1 = xs[i + 1] - 11;
      const z0 = zs[j] + 11, z1 = zs[j + 1] - 11;
      if (x1 - x0 < 18 || z1 - z0 < 10) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cz > 160) {
        // The thin boulevard block is a continuous row of two-storey shops.
        shopRow(root, x0, x1, z0, z1, rng, win, awnings);
        continue;
      }
      if (cz > 150) continue;
      if (cz > 70 && cz < 160 && x0 < -30 && x1 > -90) {
        parkBlock(root, cx, cz, rng);
        continue;
      }
      const downtown = Math.abs(cx - L.downtown.x) < 150 && cz < 70 && cz > -150;
      const cols = x1 - x0 > 45 ? 2 : 1;
      const rows = z1 - z0 > 44 ? 2 : 1;
      for (let a = 0; a < cols; a++) {
        for (let b = 0; b < rows; b++) {
          const w = (x1 - x0) / cols - 5;
          const d = (z1 - z0) / rows - 5;
          if (w < 9 || d < 9) continue;
          const px = x0 + (a + 0.5) * ((x1 - x0) / cols);
          const pz = z0 + (b + 0.5) * ((z1 - z0) / rows);
          const tall = downtown && rng.chance(0.62);
          const h = tall ? rng.range(38, 96) : rng.range(7, 20);
          addBuilding(root, px, pz, w, d, h, rng, win, awnings, tall);
        }
      }
    }
  }
  makeWindowInstances(root, win);
  makeAwnings(root, awnings);
}

function addBuilding(root, x, z, w, d, h, rng, win, awnings, tall) {
  const palette = tall
    ? [0x2f7f86, 0x337d88, 0x2a6f78, 0x3d8a91, 0x245f6b]
    : [0xf4ead6, 0xe8735a, 0xd9b98a, 0xf0d9bd, 0xe8b59f, 0xcfd8c6, 0xf0e3cf];
  const color = rng.pick(palette);
  const body = new THREE.Mesh(unitBox, matFor(color));
  body.scale.set(w, h, d);
  body.position.set(x, h / 2 + 0.28, z);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);
  cityColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h, kind: 'building' });
  const roof = new THREE.Mesh(unitBox, matFor(tall ? 0x1d4b55 : 0xb98f72));
  roof.scale.set(w * 1.03, 1.2, d * 1.03);
  roof.position.set(x, h + 0.85, z);
  root.add(roof);
  if (tall) {
    const cap = new THREE.Mesh(unitBox, matFor(0x46a2a4));
    cap.scale.set(w * 0.55, rng.range(3, 8), d * 0.55);
    cap.position.set(x, h + 3.4, z);
    root.add(cap);
  }
  const gap = 1.4;
  const cols = Math.max(2, Math.floor(w / 3.4));
  const rows = Math.max(2, Math.floor((h - 3) / 3.6));
  const faces = [
    { nx: 0, nz: 1, half: d / 2, off: w },
    { nx: 0, nz: -1, half: d / 2, off: w },
    { nx: 1, nz: 0, half: w / 2, off: d },
    { nx: -1, nz: 0, half: w / 2, off: d },
  ];
  for (const f of faces) {
    const n = Math.max(2, Math.floor(f.off / 3.4));
    for (let c = 0; c < n; c++) {
      for (let r = 0; r < rows; r++) {
        if (r < 1 && rng.chance(0.3)) continue;
        const u = (c + 0.5) / n - 0.5;
        const y = 2.4 + r * 3.6;
        if (y > h - 1) break;
        const bucket = rng.chance(tall ? 0.28 : 0.18) ? win.lit : win.dark;
        const px = x + (f.nx ? f.nx * (w / 2 + 0.06) : u * w);
        const pz = z + (f.nz ? f.nz * (d / 2 + 0.06) : u * d);
        bucket.push({ x: px, y, z: pz, rot: f.nx ? Math.PI / 2 : 0, w: tall ? 1.5 : 1.15, h: tall ? 2.3 : 1.5 });
      }
    }
  }
  if (h < 22) {
    for (const f of faces) {
      if (f.nz === 1) awnings.push({ x, z: z + d / 2 + 0.55, rot: 0, w: w * 0.8, color: rng.pick([0xe8735a, 0x2f7f86, 0xffc35c]) });
      if (f.nx === -1) awnings.push({ x: x - w / 2 - 0.55, z, rot: Math.PI / 2, w: d * 0.75, color: rng.pick([0xe8735a, 0x2f7f86, 0xffc35c]) });
    }
  }
}

function shopRow(root, x0, x1, z0, z1, rng, win, awnings) {
  const width = x1 - x0;
  const n = Math.max(2, Math.round(width / 26));
  const w = width / n;
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * w;
    const d = z1 - z0 - 2;
    const z = (z0 + z1) / 2;
    const h = rng.range(7, 13);
    const color = rng.pick([0xf4ead6, 0xe8735a, 0xf0d9bd, 0xd9b98a, 0xe8b59f]);
    const body = new THREE.Mesh(unitBox, matFor(color));
    body.scale.set(w - 1.6, h, d);
    body.position.set(x, h / 2 + 0.28, z);
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);
    cityColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h, kind: 'shop' });
    const roof = new THREE.Mesh(unitBox, matFor(0xc98d70));
    roof.scale.set(w - 1.1, 0.8, d + 1);
    roof.position.set(x, h + 0.6, z);
    root.add(roof);
    for (let c = 0; c < Math.floor(w / 4); c++) {
      win.dark.push({ x: x - w / 2 + 2 + c * 4, y: h - 2.1, z: z + d / 2 + 0.05, rot: 0, w: 1.6, h: 1.35 });
    }
    awnings.push({ x, z: z + d / 2 + 0.6, rot: 0, w: w - 2.4, color: rng.pick([0xe8735a, 0x2f7f86, 0xffc35c, 0xff3d8b]) });
    if (h > 9) {
      const sign = new THREE.Mesh(unitBox, matFor(0x2f7f86));
      sign.scale.set(w * 0.5, 2.2, 0.2);
      sign.position.set(x, h - 2.2, z + d / 2 + 0.15);
      root.add(sign);
    }
  }
}

function parkBlock(root, cx, cz, rng) {
  const grass = new THREE.Mesh(unitBox, matFor(0x5b7a44));
  grass.scale.set(58, 0.34, 62);
  grass.position.set(cx, 0.2, cz);
  grass.receiveShadow = true;
  root.add(grass);
  const path = new THREE.Mesh(unitBox, matFor(0xc8b99c));
  path.scale.set(58, 0.36, 4);
  path.position.set(cx, 0.21, cz);
  root.add(path);
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, 0.9, 18), matFor(0x9fbfc0));
  fountain.position.set(cx, 0.6, cz);
  root.add(fountain);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.1, 0.3, 18), new THREE.MeshPhongMaterial({ color: 0x3aa2b5, shininess: 110 }));
  water.position.set(cx, 0.95, cz);
  root.add(water);
}

function makeWindowInstances(root, win) {
  const specs = [
    [win.dark, 0x9fd8de, 0.22],
    [win.lit, 0xffd9a0, 0],
    [win.pink, 0xff4f9a, 0],
  ];
  for (const [list, color, metal] of specs) {
    if (!list.length) continue;
    const geo = new THREE.BoxGeometry(1, 1, 0.07);
    const mat = new THREE.MeshBasicMaterial({ color });
    if (metal) { mat.color.offsetHSL(0, 0, 0); }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((wd, i) => {
      m.makeRotationY(wd.rot);
      m.scale(new THREE.Vector3(wd.w, wd.h, 1));
      m.setPosition(wd.x, wd.y, wd.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }
}

function makeAwnings(root, list) {
  if (!list.length) return;
  const geo = new THREE.BoxGeometry(1, 0.35, 2.1);
  for (const color of [0xe8735a, 0x2f7f86, 0xffc35c, 0xff3d8b]) {
    const sub = list.filter((a) => a.color === color);
    if (!sub.length) continue;
    const mesh = new THREE.InstancedMesh(geo, matFor(color), sub.length);
    const m = new THREE.Matrix4();
    sub.forEach((a, i) => {
      m.makeRotationY(a.rot);
      m.scale(new THREE.Vector3(a.w, 1, 1));
      m.setPosition(a.x, 3.5, a.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  }
}

function buildGround(root, rng) {
  const seaMat = new THREE.MeshPhongMaterial({ color: 0x1a7f9c, shininess: 130, specular: 0xbfe9ef });
  seaMat.map = waveTexture();
  seaMat.map.repeat.set(26, 26);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 800, 1, 1), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.02, 500);
  sea.receiveShadow = false;
  root.add(sea);
  const cityFloor = new THREE.Mesh(new THREE.PlaneGeometry(660, 470), matFor(0x7f786c));
  cityFloor.rotation.x = -Math.PI / 2;
  cityFloor.position.set(0, 0.0, -48);
  cityFloor.receiveShadow = true;
  root.add(cityFloor);
  // Sun path on the water: a long additive ribbon toward the south-west sun.
  const glowTex = canvasTex(128, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,214,150,0)');
    g.addColorStop(0.45, 'rgba(255,220,168,0.45)');
    g.addColorStop(0.75, 'rgba(255,236,190,0.28)');
    g.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,240,205,${0.05 + Math.random() * 0.16})`;
      ctx.fillRect(6 + Math.random() * 116, Math.random() * 256, 10 + Math.random() * 38, 1.4);
    }
  });
  const path = new THREE.Mesh(new THREE.PlaneGeometry(95, 330), new THREE.MeshBasicMaterial({
    map: glowTex, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(-150, 0.05, 340);
  root.add(path);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff2cd, toneMapped: false }));
  sun.position.set(-480, 108, 520);
  root.add(sun);
  return sea;
}

function waveTexture() {
  const tex = canvasTex(256, 256, (ctx) => {
    ctx.fillStyle = '#1a7f9c';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 150; i++) {
      const y = Math.random() * 256;
      ctx.strokeStyle = `rgba(196,240,235,${0.06 + Math.random() * 0.2})`;
      ctx.lineWidth = 1 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, y);
      ctx.bezierCurveTo(70, y + 4, 170, y - 4, 256, y + 2);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildBeach(root, rng) {
  const L = CITY_LAYOUT;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(680, L.beachZ[1] - L.beachZ[0] + 4), matFor(0xd9b98a));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.1, (L.beachZ[0] + L.beachZ[1]) / 2);
  sand.receiveShadow = true;
  root.add(sand);
  const wall = new THREE.Mesh(unitBox, matFor(0xc7b394));
  wall.scale.set(660, 1.2, 1.4);
  wall.position.set(0, 0.6, L.beachZ[0] + 0.4);
  wall.castShadow = true;
  root.add(wall);
  const towelColors = [0xff3d8b, 0x39e6e0, 0xffc35c, 0xf4ead6];
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-310, 310);
    const z = rng.range(210, 234);
    const towel = new THREE.Mesh(unitBox, matFor(rng.pick(towelColors)));
    towel.scale.set(1.7, 0.03, 1);
    towel.position.set(x, 0.14, z);
    towel.rotation.y = rng.range(0, 1);
    root.add(towel);
  }
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-280, 280);
    const z = rng.range(214, 232);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5), matFor(0xe8dfc9));
    pole.position.set(x, 1.2, z);
    root.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.55, 8), matFor(i % 2 ? 0xe8735a : 0x39bdbd));
    canopy.position.set(x, 2.35, z);
    root.add(canopy);
  }
  const tower = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.6, 3.4), new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.8, transparent: true, opacity: 0.85 }));
  legs.position.y = 2.3;
  tower.add(legs);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.8, 4), matFor(0xe8735a));
  roof.position.y = 5.4;
  roof.rotation.y = Math.PI / 4;
  tower.add(roof);
  tower.position.set(150, 0.2, 228);
  root.add(tower);
  const surf = new THREE.Mesh(unitBox, matFor(0xffc35c));
  surf.scale.set(0.5, 2.4, 0.06);
  surf.position.set(143, 0.4, 224);
  surf.rotation.z = 0.25;
  root.add(surf);
}

export function buildMarina(root, rng) {
  const L = CITY_LAYOUT;
  const shopXs = [-164, -132, -100, -68];
  const names = ['VELA PAWN', 'HOTEL AZURA', 'MARINA CHANDLERY', 'CORAL 88 FM'];
  shopXs.forEach((x, i) => {
    const w = 27, d = 13, h = i === 1 ? 15 : 9 + i;
    const b = new THREE.Mesh(unitBox, matFor(i === 1 ? 0xf4ead6 : i === 2 ? 0xe8735a : 0xf0d9bd));
    b.scale.set(w, h, d);
    b.position.set(x, h / 2 + 0.25, 226);
    b.castShadow = true;
    b.receiveShadow = true;
    root.add(b);
    cityColliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: 226 - d / 2, maxZ: 226 + d / 2, height: h, kind: 'marina-shop' });
    const roof = new THREE.Mesh(unitBox, matFor(0xc98d70));
    roof.scale.set(w + 1, 0.9, d + 1);
    roof.position.set(x, h + 0.6, 226);
    root.add(roof);
    const awning = new THREE.Mesh(unitBox, matFor(i % 2 ? 0x2f7f86 : 0xff3d8b));
    awning.scale.set(w - 3, 0.4, 2.4);
    awning.position.set(x, 3.4, 233.2);
    root.add(awning);
  });
  // Wooden docks stepping into the sea.
  const plankMat = matFor(0x8a6a4a);
  const boats = [];
  const docks = [
    { x: -110, z: 264, w: 130, d: 7 },
    { x: -165, z: 254, w: 4, d: 34 },
    { x: -140, z: 256, w: 4, d: 38 },
    { x: -110, z: 258, w: 4, d: 44 },
    { x: -80, z: 256, w: 4, d: 40 },
    { x: -52, z: 252, w: 4, d: 30 },
  ];
  for (const dk of docks) {
    const deck = new THREE.Mesh(unitBox, plankMat);
    deck.scale.set(dk.w, 0.5, dk.d);
    deck.position.set(dk.x, 0.35, dk.z);
    deck.receiveShadow = true;
    root.add(deck);
    marinaDocks.push({ minX: dk.x - dk.w / 2, maxX: dk.x + dk.w / 2, minZ: dk.z - dk.d / 2, maxZ: dk.z + dk.d / 2, top: 0.6 });
    for (let i = 0; i < Math.max(2, Math.floor(dk.w / 7)); i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.1, 6), matFor(0x5f4632));
      post.position.set(dk.x - dk.w / 2 + 1 + i * 7, 0.3, dk.z - dk.d / 2 - 0.2);
      root.add(post);
    }
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(unitBox, matFor(i === 1 ? 0x39e6e0 : 0xc98d60));
    c.scale.set(1.7, 1.2, 1.7);
    c.position.set(-118 + i * 23, 1.2, 254 + (i % 2) * 8);
    c.castShadow = true;
    root.add(c);
    marinaCrates.push({ x: c.position.x, z: c.position.z, y: 1.2 });
    const band = new THREE.Mesh(unitBox, matFor(0x39434a));
    band.scale.set(1.8, 0.15, 1.8);
    band.position.set(c.position.x, 1.45, c.position.z);
    root.add(band);
  }
  // Boats: hull, cabin, mast; bobbing is animated sparingly by updateCity.
  for (let i = 0; i < 7; i++) {
    const x = -170 + i * 19 + rng.range(-2, 2);
    const z = 246 + (i % 2) * 17;
    const boat = boatMesh(rng);
    boat.position.set(x, 0.4, z);
    boat.rotation.y = rng.range(-0.4, 0.4) + (i % 2 ? Math.PI : 0);
    root.add(boat);
    boats.push(boat);
    marinaDocks.push({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 3.4, maxZ: z + 3.4, top: 1.0 });
  }
  return boats;
}

function boatMesh(rng) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(unitBox, matFor(rng.pick([0xf4ead6, 0x2f7f86, 0xe8735a, 0x39e6e0])));
  hull.scale.set(2.6, 1.1, 6.4);
  hull.position.y = 0.65;
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 4), hull.material);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.75, 3.6);
  g.add(bow);
  const cabin = new THREE.Mesh(unitBox, matFor(0xf4ead6));
  cabin.scale.set(1.7, 1.0, 2.2);
  cabin.position.set(0, 1.65, -0.4);
  g.add(cabin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 5, 5), matFor(0xd8cfb6));
  mast.position.set(0, 4, -0.4);
  g.add(mast);
  return g;
}

function buildHills(root, rng) {
  const hillMat = matFor(0x6d7d4e);
  for (let i = 0; i < 9; i++) {
    const x = -300 + i * 75;
    const h = 20 + rng.range(0, 26);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(58, 18, 10), hillMat);
    hill.scale.set(1.1, h / 58, 0.8);
    hill.position.set(x, -2, -246 - rng.range(0, 20));
    hill.receiveShadow = true;
    root.add(hill);
  }
  for (let i = 0; i < 7; i++) {
    const x = -280 + i * 85;
    const z = -214 - (i % 2) * 12;
    const villa = new THREE.Group();
    const body = new THREE.Mesh(unitBox, matFor(rng.pick([0xf4ead6, 0xe8735a, 0xf0d9bd])));
    body.scale.set(15, 6, 11);
    body.position.y = 8;
    body.castShadow = true;
    villa.add(body);
    const pool = new THREE.Mesh(unitBox, new THREE.MeshPhongMaterial({ color: 0x39cfd8, shininess: 90 }));
    pool.scale.set(7, 0.3, 4);
    pool.position.set(-6, 8.3, 7);
    villa.add(pool);
    villa.position.set(x, 0, z);
    root.add(villa);
    cityColliders.push({ minX: x - 8, maxX: x + 8, minZ: z - 6, maxZ: z + 6, height: 11, kind: 'villa' });
  }
}

function addPalms(root, rng) {
  const trunks = [];
  const fronds = [];
  const spots = [];
  for (const x of [-300, -220, -140, -60, 20, 100, 180, 260, 310]) {
    spots.push([x, 205], [x + 8, 235]);
  }
  for (const x of [-280, -200, -120, -40, 40, 120, 200, 280]) {
    for (let z = -120; z <= 160; z += 40) if (rng.chance(0.65)) spots.push([x + rng.range(-4, 4) + 26, z + rng.range(-8, 8)]);
  }
  for (const [x, z] of spots) {
    const h = rng.range(6, 11);
    trunks.push({ x, z, h, lean: rng.range(-0.16, 0.16) });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng.range(0, 0.4);
      fronds.push({ x, z, h, a, len: rng.range(2.4, 3.6), droop: rng.range(0.1, 0.4) });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.19, 0.3, 1, 6);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, matFor(0x8f6a43), trunks.length);
  const m = new THREE.Matrix4();
  trunks.forEach((t, i) => {
    m.makeRotationZ(t.lean);
    m.scale(new THREE.Vector3(1, t.h, 1));
    m.setPosition(t.x + Math.sin(t.lean) * t.h * 0.3, t.h / 2, t.z);
    trunkMesh.setMatrixAt(i, m);
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  root.add(trunkMesh);
  const frondGeo = new THREE.ConeGeometry(0.55, 3.4, 4);
  const frondMesh = new THREE.InstancedMesh(frondGeo, matFor(0x3f6b3a), fronds.length);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1.1, 1, 1);
  fronds.forEach((f, i) => {
    pos.set(f.x + Math.cos(f.a) * 1.3, f.h - 0.15, f.z + Math.sin(f.a) * 1.3);
    e.set(0, -f.a, -1.05 - f.droop, 'YXZ');
    q.setFromEuler(e);
    m.compose(pos, q, scl);
    frondMesh.setMatrixAt(i, m);
  });
  frondMesh.instanceMatrix.needsUpdate = true;
  root.add(frondMesh);
}

function addStreetLights(root, rng) {
  const poles = [];
  const lamps = [];
  for (const x of [-280, -200, -120, -40, 40, 120, 200, 280]) {
    lamps.push([x, 207.2, 0], [x, 185, 0]);
    for (const z of [-120, -40, 40, 120]) lamps.push([x + 10.5, z, 1]);
  }
  for (const x of [-240, -160, -80, 0, 80, 160, 240]) {
    for (const z of [-160, -80, 0, 80, 160]) {
      lamps.push([x + 10.5, z + 8, 1]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 5.4, 5);
  const poleMesh = new THREE.InstancedMesh(poleGeo, matFor(0x3a3f42), lamps.length);
  const lampGeo = new THREE.SphereGeometry(0.34, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe0a1, toneMapped: false });
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lamps.length);
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    const y = 5.4;
    m.identity(); m.setPosition(l[0], 2.7, l[1]);
    poleMesh.setMatrixAt(i, m);
    m.identity(); m.setPosition(l[0], 5.5, l[1]);
    lampMesh.setMatrixAt(i, m);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  lampMesh.instanceMatrix.needsUpdate = true;
  root.add(poleMesh);
  root.add(lampMesh);
}

function addProps(root, rng) {
  // Bus stop, benches, hydrants, bins and the odd parked scooter.
  const benchMat = matFor(0x8f6a43);
  for (let i = 0; i < 10; i++) {
    const x = -280 + i * 62;
    const bench = new THREE.Mesh(unitBox, benchMat);
    bench.scale.set(2.4, 0.16, 0.6);
    bench.position.set(x, 0.65, 206.5);
    root.add(bench);
    const back = new THREE.Mesh(unitBox, benchMat);
    back.scale.set(2.4, 0.5, 0.1);
    back.position.set(x, 0.95, 206.8);
    root.add(back);
  }
  const hydrantMat = matFor(0xe8735a);
  for (let i = 0; i < 8; i++) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.7, 6), hydrantMat);
    h.position.set(-260 + i * 70, 0.5, 187.5);
    root.add(h);
  }
}

function buildCitySigns(root) {
  const specs = [
    { name: 'Vela Motors', text: 'VELA MOTORS', sub: 'COUPE · SEDAN · 24H', x: 16, y: 6.1, z: 184.3, w: 9.6, h: 2.5, bg: '#e8735a', fg: '#fff4de', face: 0 },
    { name: 'Marisol Cafe', text: 'MARISOL CAFE', sub: 'CUBAN COFFEE · OPEN LATE', x: -24, y: 5.9, z: 184.3, w: 9.2, h: 2.5, bg: '#14555f', fg: '#ffd9a0', face: 0 },
    { name: 'Coral 88 FM', text: 'CORAL 88 FM', sub: 'THE COAST SOUNDS LIKE THIS', x: -66, y: 6.4, z: 184.3, w: 10, h: 2.7, bg: '#ff3d8b', fg: '#101820', face: 0 },
    { name: 'Hotel Azura', text: 'HOTEL AZURA', sub: 'MARINA VIEW · ROOMS', x: -132, y: 10.2, z: 232.8, w: 12, h: 3.2, bg: '#f4ead6', fg: '#14555f', face: 0 },
    { name: 'Marina Chandlery', text: 'MARINA CHANDLERY', sub: 'ROPE · FUEL · ICE', x: -100, y: 7.1, z: 232.8, w: 11, h: 2.8, bg: '#2f7f86', fg: '#fff4de', face: 0 },
    { name: 'Vela Pawn', text: 'VELA PAWN', sub: 'WE BUY GOLD', x: -164, y: 6.4, z: 232.8, w: 9, h: 2.6, bg: '#ffc35c', fg: '#101820', face: 0 },
    { name: 'Surf Shack', text: 'SURF SHACK', sub: 'BOARDS · WAX · SUNSET', x: 140, y: 4.6, z: 231.6, w: 9, h: 2.6, bg: '#39e6e0', fg: '#101820', face: Math.PI },
    { name: 'Solstice Cola', text: 'SOLSTICE COLA', sub: 'TASTE THE GOLDEN HOUR', x: 196, y: 5.2, z: 231.6, w: 10.5, h: 2.8, bg: '#ff5a4e', fg: '#fff4de', face: Math.PI },
    { name: 'Palma Books', text: 'PALMA BOOKS', sub: 'NEW · USED · RARE', x: 30, y: 6.4, z: 92.5, w: 9, h: 2.6, bg: '#2f7f86', fg: '#f4ead6', face: 0 },
    { name: 'Palma Gym', text: 'PALMA GYM', sub: 'LIFT AT SIX', x: 91.6, y: 7.4, z: 108, w: 8.4, h: 2.6, bg: '#ff3d8b', fg: '#101820', face: -Math.PI / 2 },
    { name: 'Vela Bank', text: 'VELA BANK', sub: 'TRUST THE TIDE', x: 48, y: 7.2, z: 92.5, w: 10, h: 2.9, bg: '#14555f', fg: '#ffc35c', face: 0 },
    { name: 'Sunset Diner', text: 'SUNSET DINER', sub: 'PIE · COFFEE · 24H', x: -28, y: 6.2, z: 92.5, w: 9.6, h: 2.6, bg: '#e8735a', fg: '#fff4de', face: 0 },
    { name: 'Visit Palm Beach', billboard: true, text: 'VISIT PALM BEACH', sub: 'GOLDEN HOUR EVERY HOUR', x: -58, y: 9.5, z: 229.5, w: 17, h: 8, bg: '#39e6e0', fg: '#101820', face: Math.PI },
    { name: 'Coral 88 Radio Advert', billboard: true, text: 'CORAL 88', sub: 'ALL HITS · NO STATIC · 88.1', x: -210, y: 8.6, z: 230.5, w: 15, h: 7, bg: '#ff3d8b', fg: '#fff4de', face: Math.PI },
    { name: 'Vela City Rooftop', billboard: true, text: 'VELA CITY', sub: 'THE COAST IS YOURS', x: 42, y: 78, z: -2, w: 24, h: 10, bg: '#14555f', fg: '#39e6e0', face: 0, rooftop: true },
  ];
  for (const s of specs) {
    const mat = signMaterial(s);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    plane.position.set(s.x, s.y, s.z);
    plane.rotation.y = s.face;
    root.add(plane);
    if (s.billboard) {
      const frame = new THREE.Mesh(unitBox, matFor(0x2d3338));
      frame.scale.set(s.w + 0.8, s.h + 0.8, 0.35);
      frame.position.set(s.x, s.y, s.z + (s.face === 0 ? -0.25 : 0.25));
      root.add(frame);
      if (!s.rooftop) {
        for (const dx of [-s.w / 3, s.w / 3]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, s.y - s.h / 2, 6), matFor(0x3a3f42));
          pole.position.set(s.x + dx, (s.y - s.h / 2) / 2, s.z + 0.1);
          root.add(pole);
        }
      }
    }
    citySigns.push({ name: s.name, x: s.x, z: s.z, w: s.w, h: s.h });
  }
  return citySigns;
}

function signMaterial(s) {
  const H = s.billboard ? 124 : 64;
  const W = s.billboard ? 248 : 240;
  const tex = canvasTex(W, H, (ctx) => {
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(16,24,32,0.55)';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = s.billboard ? 34 : 31;
    ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
    while (ctx.measureText(s.text).width > W - 20 && size > 11) {
      size -= 1;
      ctx.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
    }
    ctx.fillText(s.text, W / 2, s.billboard ? H * 0.42 : H * 0.38);
    ctx.fillStyle = s.billboard ? s.fg : 'rgba(255,255,255,0.82)';
    ctx.font = `700 ${s.billboard ? 15 : 12}px system-ui, sans-serif`;
    ctx.fillText(s.sub, W / 2, H * 0.74);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(10, H - 4, W - 20, 1);
  });
  tex.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.FrontSide });
}

export function updateCity(city, t, dt) {
  if (city.water && city.water.material.map) {
    city.water.material.map.offset.x = (t * 0.005) % 1;
    city.water.material.map.offset.y = (t * 0.0022) % 1;
  }
  for (let i = 0; i < city.boats.length; i++) {
    const b = city.boats[i];
    b.position.y = 0.4 + Math.sin(t * 0.9 + i) * 0.08;
    b.rotation.z = Math.sin(t * 0.6 + i) * 0.02;
  }
}

// ---------- shared helpers ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function matFor(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.06 }));
  return matCache.get(color);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}
export function isOnDock(x, z) {
  return marinaDocks.some((d) => x > d.minX && x < d.maxX && z > d.minZ && z < d.maxZ);
}
export function dockTop(x, z) {
  const d = marinaDocks.find((dd) => x > dd.minX && x < dd.maxX && z > dd.minZ && z < dd.maxZ);
  return d ? d.top : 0;
}
