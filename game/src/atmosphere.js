// Atmosphere module: paints the golden-hour sky, clouds, haze and neon glow over the frozen city render.
// Atmosphere pass: authored golden-hour depth for the entry frames.
// One sky dome, layered cloud banks, a warm sun glow, horizon haze, shoreline shimmer,
// pavement light pools, soft lamp cones and low neon bleed. Everything is drawn with
// canvas textures and additive quads on top of render.js; exposure, fog, lights, tone
// mapping, shadows, the camera and the city are left exactly as they are.
// Only cloud drift and the shimmer scroll are animated, both from game time.

import { seededRandom } from './rng.js';

const SUN_DIR = new THREE.Vector3(-0.72, 0.21, 0.66).normalize();

const SKY = {
  zenith: '#062231',
  high: '#0a3044',
  aqua: '#145366',
  low: '#2a7783',
  horizon: '#ffbe76',
  haze: '#ff9d58',
  under: '#12313d',
};

const CREAM = '#fff1d4';
const CORAL = '#ffc6a2';

// x, y, z, width, depth, tint. Pools sit just above the pavement, road or dock deck.
const POOL_SPOTS = [
  [-200, 0.34, 207.2, 8, 5, 0xffc778], [-120, 0.34, 207.2, 8, 5, 0xffc778],
  [-40, 0.34, 207.2, 8, 5, 0xffc778], [40, 0.34, 207.2, 8, 5, 0xffc778],
  [-120, 0.34, 185, 7.5, 4.6, 0xffc778], [-40, 0.34, 185, 7.5, 4.6, 0xffc778],
  [40, 0.34, 185, 7.5, 4.6, 0xffc778], [120, 0.34, 185, 7.5, 4.6, 0xffc778],
  [-66, 0.12, 190, 5.2, 3.2, 0xffbf7a], [-24, 0.12, 190, 4.8, 3, 0xffcf96],
  [16, 0.12, 190, 5, 3.2, 0xffd7a0], [10.5, 0.34, -40, 6.4, 4, 0xffd39a],
  [10.5, 0.34, 8, 6, 3.8, 0xffd39a], [10.5, 0.34, -72, 6.2, 3.8, 0xffd39a],
  [10.5, 0.34, -120, 6.4, 4, 0xffd39a], [90.5, 0.34, -40, 6, 3.8, 0xffd39a],
  [-68, 0.16, 235.5, 6.4, 4, 0xffc886], [-100, 0.16, 235.5, 7, 4.4, 0xffd39a],
  [-132, 0.16, 235.5, 6.4, 4, 0xffc886], [-164, 0.16, 235.5, 6, 3.8, 0xffc886],
  [-60, 0.16, 219, 7, 4.4, 0xffbe78], [-150, 0.68, 264, 8, 4.6, 0xffcf90],
  [-110, 0.68, 264, 9, 5, 0xffd9a0], [-70, 0.68, 264, 8, 4.6, 0xffcf90],
  [-140, 0.68, 256, 6, 3.8, 0xffc884], [-80, 0.68, 256, 6, 3.8, 0xffc884],
];

// x, base y, z, radius, height, tint. Lamp cones plus two low storefront spills.
const CONE_SPOTS = [
  [-200, 0.34, 207.2, 2.4, 5.2, 0xffd9a0], [-120, 0.34, 207.2, 2.4, 5.2, 0xffd9a0],
  [-40, 0.34, 207.2, 2.4, 5.2, 0xffd9a0], [40, 0.34, 207.2, 2.4, 5.2, 0xffd9a0],
  [-120, 0.34, 185, 2.3, 5.2, 0xffd9a0], [-40, 0.34, 185, 2.3, 5.2, 0xffd9a0],
  [40, 0.34, 185, 2.3, 5.2, 0xffd9a0], [120, 0.34, 185, 2.3, 5.2, 0xffd9a0],
  [10.5, 0.34, -40, 2.2, 5.2, 0xffd9a0], [10.5, 0.34, 8, 2.2, 5.2, 0xffd9a0],
  [10.5, 0.34, -72, 2.2, 5.2, 0xffd9a0], [10.5, 0.34, -120, 2.2, 5.2, 0xffd9a0],
  [-100, 0.16, 235.5, 3.4, 3.8, 0xffc27c], [-68, 0.16, 235.5, 3.1, 3.5, 0xffb870],
];

// Soft coloured pools under the brightest painted signs on the boulevard and downtown.
const NEON_SPOTS = [
  [-66, 0.12, 191, 10, 5, 0xff3d8b], [-24, 0.12, 191, 9, 4.6, 0x39e6e0],
  [16, 0.12, 191, 9, 4.6, 0xffc35c], [30, 0.12, 84, 10, 5, 0x39e6e0],
  [48, 0.12, 84, 10, 5, 0xffc35c], [-28, 0.12, 84, 10, 5, 0xff6a4e],
  [85, 0.12, 108, 8, 4.4, 0xff3d8b], [42, 0.12, 0, 13, 6, 0x39e6e0],
  [-8, 0.12, -32, 9, 4.6, 0x39e6e0], [30, 0.12, -56, 9, 4.6, 0xff3d8b],
  [12, 0.12, -88, 9, 4.6, 0xffc35c],
];

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function textureOf(c, repeatX = false, repeatY = false) {
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  tex.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function sunCanvasPosition(w, h) {
  const u = ((Math.PI - Math.atan2(SUN_DIR.z, SUN_DIR.x)) / (Math.PI * 2) + 1) % 1;
  const v = Math.acos(Math.max(-1, Math.min(1, SUN_DIR.y))) / Math.PI;
  return { x: u * w, y: v * h };
}

// The dome texture is an equirect canvas: teal zenith, aqua middle, a wide gold horizon
// and a baked disc plus halo where the sun sits toward the west.
function makeSkyTexture(seed) {
  const rng = seededRandom(seed);
  const w = 1024;
  const h = 512;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.54);
  sky.addColorStop(0, SKY.zenith);
  sky.addColorStop(0.42, SKY.high);
  sky.addColorStop(0.70, SKY.aqua);
  sky.addColorStop(0.845, SKY.low);
  // Keep the visible low sky (the camera's top edge is only about 10 degrees up) warm,
  // then hold teal above it so the frame keeps a warm-to-cool split.
  sky.addColorStop(0.875, '#c8845c');
  sky.addColorStop(0.905, '#ffb173');
  sky.addColorStop(1, SKY.horizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.55);

  const under = ctx.createLinearGradient(0, h * 0.5, 0, h);
  under.addColorStop(0, SKY.horizon);
  under.addColorStop(0.16, SKY.haze);
  under.addColorStop(0.42, SKY.under);
  under.addColorStop(1, '#08151c');
  ctx.fillStyle = under;
  ctx.fillRect(0, h * 0.5, w, h * 0.5);

  const sun = sunCanvasPosition(w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const horizonBand = ctx.createLinearGradient(0, h * 0.47, 0, h * 0.56);
  horizonBand.addColorStop(0, 'rgba(255,176,104,0)');
  horizonBand.addColorStop(0.55, 'rgba(255,178,102,0.30)');
  horizonBand.addColorStop(1, 'rgba(255,210,148,0)');
  ctx.fillStyle = horizonBand;
  ctx.fillRect(0, h * 0.47, w, h * 0.09);

  for (const dx of [-w, 0, w]) {
    const sx = sun.x + dx;
    const halo = ctx.createRadialGradient(sx, sun.y, 2, sx, sun.y, 168);
    halo.addColorStop(0, 'rgba(255,244,212,0.62)');
    halo.addColorStop(0.18, 'rgba(255,224,168,0.34)');
    halo.addColorStop(0.52, 'rgba(255,196,124,0.13)');
    halo.addColorStop(1, 'rgba(255,178,102,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sun.y, 168, 0, Math.PI * 2);
    ctx.fill();

    const disc = ctx.createRadialGradient(sx, sun.y, 0, sx, sun.y, 19);
    disc.addColorStop(0, 'rgba(255,252,236,1)');
    disc.addColorStop(0.58, 'rgba(255,232,182,0.96)');
    disc.addColorStop(1, 'rgba(255,210,150,0)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(sx, sun.y, 19, 0, Math.PI * 2);
    ctx.fill();

    // A few faint high wisps keep the upper gradient from reading as a flat print.
    ctx.strokeStyle = 'rgba(255,232,198,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = h * (0.14 + rng.next() * 0.2);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 6, w * 0.65, y + 7, w, y - 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  return textureOf(c, true);
}

function makeGlowTexture() {
  const s = 160;
  const c = canvasOf(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,252,238,1)');
  g.addColorStop(0.12, 'rgba(255,240,204,0.95)');
  g.addColorStop(0.34, 'rgba(255,214,154,0.45)');
  g.addColorStop(0.68, 'rgba(255,188,116,0.12)');
  g.addColorStop(1, 'rgba(255,172,92,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return textureOf(c);
}

function makePoolTexture() {
  const s = 128;
  const c = canvasOf(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.4, 'rgba(255,246,226,0.42)');
  g.addColorStop(0.76, 'rgba(255,238,204,0.1)');
  g.addColorStop(1, 'rgba(255,236,196,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return textureOf(c);
}

function makeStripTexture() {
  const w = 512;
  const h = 32;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(255,200,130,0)');
  across.addColorStop(0.2, 'rgba(255,212,150,0.45)');
  across.addColorStop(0.52, 'rgba(255,238,196,0.92)');
  across.addColorStop(0.78, 'rgba(255,212,150,0.45)');
  across.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const down = ctx.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0, 'rgba(0,0,0,0)');
  down.addColorStop(0.5, 'rgba(0,0,0,1)');
  down.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = down;
  ctx.fillRect(0, 0, w, h);
  return textureOf(c);
}

function makeConeTexture() {
  const w = 64;
  const h = 256;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,240,206,0.62)');
  g.addColorStop(0.42, 'rgba(255,220,166,0.2)');
  g.addColorStop(1, 'rgba(255,204,146,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return textureOf(c);
}

// Soft overlapping blobs on a transparent strip. Warm cream and pale coral banks are
// baked separately so the layers read at different heights without any live painting.
function makeCloudTexture(seed, coral) {
  const rng = seededRandom(seed);
  const w = 512;
  const h = 256;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  const tones = coral ? [CORAL, '#ffd8bd', '#ffb998'] : [CREAM, '#ffe8c6', '#f6dab4'];
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 62; i++) {
    const x = rng.range(34, w - 34);
    const y = rng.range(h * 0.2, h * 0.8);
    const r = rng.range(18, 66);
    const tone = rng.pick(tones);
    const a = rng.range(0.11, 0.28);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(tone, a));
    g.addColorStop(0.55, rgba(tone, a * 0.42));
    g.addColorStop(1, rgba(tone, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.9, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return textureOf(c);
}

// Broken horizontal glints: gold in the sun corridor, pale turquoise toward the edges.
function makeShimmerTexture(seed) {
  const rng = seededRandom(seed);
  const w = 512;
  const h = 1024;
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  const wash = ctx.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, 'rgba(255,194,124,0)');
  wash.addColorStop(0.28, 'rgba(255,206,140,0.1)');
  wash.addColorStop(0.62, 'rgba(128,226,216,0.07)');
  wash.addColorStop(1, 'rgba(255,194,124,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 540; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const len = rng.range(7, 56);
    const thick = rng.range(1, 2.8);
    const gold = Math.exp(-Math.pow((x / w - 0.44) / 0.27, 2));
    const rgb = gold > 0.56 ? '255,226,164' : gold > 0.24 ? '220,238,208' : '150,234,226';
    const alpha = (0.035 + rng.next() * 0.19) * (0.42 + gold);
    ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
    ctx.fillRect(x, y, len, thick);
  }
  return textureOf(c, true, true);
}

export function createAtmosphere(scene, seed = 7) {
  const atmosphere = {
    clouds: [],
    shimmer: null,
    sun: null,
    strips: null,
    pools: null,
    cones: null,
    neon: null,
  };
  const group = new THREE.Group();
  group.name = 'atmosphere';
  scene.add(group);
  atmosphere.group = group;

  // render.js keeps its plain gradient dome; hide that one at runtime and draw the
  // authored dome in its place, without touching the render module or its tuning.
  const oldSky = scene.getObjectByName('sky-dome');
  if (oldSky) oldSky.visible = false;

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(880, 48, 24),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(seed * 17 + 5),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  dome.name = 'atmosphere-sky';
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  group.add(dome);
  atmosphere.dome = dome;

  const glowTex = makeGlowTexture();
  const sunPos = SUN_DIR.clone().multiplyScalar(690);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffd49c,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  halo.position.copy(sunPos);
  halo.scale.set(276, 276, 1);
  halo.renderOrder = 3;
  group.add(halo);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xfff2d2,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  }));
  core.position.copy(sunPos);
  core.scale.set(64, 64, 1);
  core.renderOrder = 4;
  group.add(core);
  atmosphere.sun = { halo, core };

  const stripTex = makeStripTexture();
  const stripMat = (color, opacity) => new THREE.MeshBasicMaterial({
    map: stripTex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  const seaStrip = new THREE.Mesh(new THREE.PlaneGeometry(1500, 34), stripMat(0xffc98a, 0.5));
  seaStrip.position.set(-40, 13, 548);
  seaStrip.renderOrder = 2;
  group.add(seaStrip);
  const hillStrip = new THREE.Mesh(new THREE.PlaneGeometry(1500, 28), stripMat(0xffb97a, 0.34));
  hillStrip.position.set(0, 26, -356);
  hillStrip.rotation.y = Math.PI;
  hillStrip.renderOrder = 2;
  group.add(hillStrip);
  atmosphere.strips = { seaStrip, hillStrip };

  // Four cloud banks: three warm layers high over the city, one low band over the sea.
  const cloudSpecs = [
    { x: -40, y: 96, z: 30, w: 780, d: 290, coral: false, opacity: 0.56, ampX: 46, ampZ: 14, speed: 0.011, phase: 0.4, tilt: 0.05 },
    { x: 90, y: 124, z: -60, w: 940, d: 340, coral: true, opacity: 0.44, ampX: 64, ampZ: 20, speed: 0.008, phase: 2.1, tilt: 0.035 },
    { x: -150, y: 148, z: 110, w: 860, d: 300, coral: false, opacity: 0.4, ampX: 54, ampZ: 18, speed: 0.006, phase: 4.3, tilt: 0.04 },
    { x: 430, y: 82, z: 180, w: 620, d: 120, coral: false, opacity: 0.82, ampX: 0, ampZ: 26, speed: 0.01, phase: 1.9, tilt: 0.02, rotY: -Math.PI / 2 },
    { x: -250, y: 66, z: 430, w: 620, d: 100, coral: true, opacity: 0.78, ampX: 60, ampZ: 0, speed: 0.012, phase: 3.3, tilt: 0.01, rotY: Math.PI },
  ];
  for (let i = 0; i < cloudSpecs.length; i++) {
    const spec = cloudSpecs[i];
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w, spec.d),
      new THREE.MeshBasicMaterial({
        map: makeCloudTexture(seed * 23 + i * 97 + 11, spec.coral),
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    );
    if (spec.rotY === undefined) mesh.rotation.x = -Math.PI / 2 + spec.tilt;
    else mesh.rotation.set(spec.tilt, spec.rotY, 0);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.renderOrder = 1;
    group.add(mesh);
    atmosphere.clouds.push({
      mesh,
      baseX: spec.x,
      baseZ: spec.z,
      ampX: spec.ampX,
      ampZ: spec.ampZ,
      speed: spec.speed,
      phase: spec.phase,
    });
  }

  const shimmerTex = makeShimmerTexture(seed * 41 + 23);
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(620, 240),
    new THREE.MeshBasicMaterial({
      map: shimmerTex,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    }),
  );
  shimmer.rotation.x = -Math.PI / 2;
  shimmer.position.set(-95, 0.09, 352);
  shimmer.renderOrder = 3;
  group.add(shimmer);
  atmosphere.shimmer = shimmer;

  // One instanced plane batch for every pavement pool; one instanced cone batch for the air.
  const poolTex = makePoolTexture();
  const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const up = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();

  const pools = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
    POOL_SPOTS.length,
  );
  for (let i = 0; i < POOL_SPOTS.length; i++) {
    const p = POOL_SPOTS[i];
    pos.set(p[0], p[1], p[2]);
    scale.set(p[3], p[4], 1);
    matrix.compose(pos, flat, scale);
    pools.setMatrixAt(i, matrix);
    pools.setColorAt(i, tint.setHex(p[5]));
  }
  pools.instanceMatrix.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  pools.renderOrder = 4;
  group.add(pools);
  atmosphere.pools = pools;

  const cones = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({
      map: makeConeTexture(),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    }),
    CONE_SPOTS.length,
  );
  for (let i = 0; i < CONE_SPOTS.length; i++) {
    const p = CONE_SPOTS[i];
    pos.set(p[0], p[1] + p[4] * 0.5, p[2]);
    scale.set(p[3], p[4], p[3]);
    matrix.compose(pos, up, scale);
    cones.setMatrixAt(i, matrix);
    cones.setColorAt(i, tint.setHex(p[5]));
  }
  cones.instanceMatrix.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  cones.renderOrder = 5;
  group.add(cones);
  atmosphere.cones = cones;

  const neon = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: poolTex,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
    NEON_SPOTS.length,
  );
  for (let i = 0; i < NEON_SPOTS.length; i++) {
    const p = NEON_SPOTS[i];
    pos.set(p[0], p[1], p[2]);
    scale.set(p[3], p[4], 1);
    matrix.compose(pos, flat, scale);
    neon.setMatrixAt(i, matrix);
    neon.setColorAt(i, tint.setHex(p[5]));
  }
  neon.instanceMatrix.needsUpdate = true;
  if (neon.instanceColor) neon.instanceColor.needsUpdate = true;
  neon.renderOrder = 6;
  group.add(neon);
  atmosphere.neon = neon;

  return atmosphere;
}

export function updateAtmosphere(atmosphere, time = 0) {
  if (!atmosphere) return;
  const t = Number.isFinite(time) ? time : 0;
  for (let i = 0; i < atmosphere.clouds.length; i++) {
    const cloud = atmosphere.clouds[i];
    cloud.mesh.position.x = cloud.baseX + Math.sin(t * cloud.speed + cloud.phase) * cloud.ampX;
    cloud.mesh.position.z = cloud.baseZ + Math.cos(t * cloud.speed * 0.63 + cloud.phase) * cloud.ampZ;
  }
  const shimmerTex = atmosphere.shimmer && atmosphere.shimmer.material.map;
  if (shimmerTex) {
    shimmerTex.offset.x = Math.sin(t * 0.05) * 0.025;
    shimmerTex.offset.y = (t * 0.035) % 1;
  }
}
