// Facades module: paints the shared building skins and rooftop detail with canvas textures.
// Facade pass: authored building skin and rooftop depth for VELA CITY.
// Every texture below is painted from code on an in-memory canvas: no external images, no
// network requests, no libraries. The eight facade materials are shared by the whole city so
// the extra cost stays at a handful of draw calls; per-building window scale is handled by
// scaling the body geometry UVs instead of cloning a material. All detail placement is driven
// by an explicit seeded rng supplied by the caller.

import { seededRandom, clamp } from './rng.js';

const TEX_W = 1280;
const TEX_H = 720;
const TILE_W = 13.6; // four window columns per texture repeat
const TILE_H = 10.8; // three storeys per texture repeat

const NEON_COLORS = {
  coral: 0xff6b52,
  turquoise: 0x39e6e0,
  gold: 0xffc35c,
};

const FACADE_STYLES = [
  { key: 'stucco', rough: 0.92, metal: 0.02, top: '#f6ead6', base: '#e9d5b8', bottom: '#cdb391',
    trim: '#fbf1de', frame: '#334a4e', sill: '#f7ecd8', glass: '#29434a', glassLit: '#ffd28c',
    lit: 0.2, brick: false, pilasters: false, wide: 0.5 },
  { key: 'deco', rough: 0.82, metal: 0.04, top: '#f28e74', base: '#e8735a', bottom: '#c85643',
    trim: '#ffe7c2', frame: '#3a2a25', sill: '#ffd9af', glass: '#332d33', glassLit: '#ffcf8f',
    lit: 0.24, brick: false, pilasters: true, wide: 0.55 },
  { key: 'hotel', rough: 0.86, metal: 0.03, top: '#f8f0dc', base: '#f1e2c2', bottom: '#d9c39c',
    trim: '#fff9e9', frame: '#3d5149', sill: '#fff5df', glass: '#314b4a', glassLit: '#ffd79b',
    lit: 0.28, brick: false, pilasters: true, wide: 0.52 },
  { key: 'office', rough: 0.42, metal: 0.38, top: '#4a9aa0', base: '#2f7f86', bottom: '#1d5b63',
    trim: '#d7eeee', frame: '#14303a', sill: '#9ec9c9', glass: '#1a4650', glassLit: '#ffd79b',
    lit: 0.2, brick: false, pilasters: false, wide: 0.8 },
  { key: 'brick', rough: 0.96, metal: 0.02, top: '#a36143', base: '#8f5138', bottom: '#6c3a29',
    trim: '#e8d2ad', frame: '#2e2a27', sill: '#e3cba5', glass: '#2b3638', glassLit: '#ffcb87',
    lit: 0.18, brick: true, pilasters: false, wide: 0.46 },
  { key: 'glass', rough: 0.2, metal: 0.62, top: '#d9eceb', base: '#b9d8d8', bottom: '#84aeb2',
    trim: '#eef8f6', frame: '#3d666e', sill: '#c3dcdc', glass: '#5f949b', glassLit: '#ffe0ab',
    lit: 0.16, brick: false, pilasters: false, wide: 0.92 },
  { key: 'lit', rough: 0.8, metal: 0.03, top: '#e7b98f', base: '#d9a276', bottom: '#b87b53',
    trim: '#f7dfb7', frame: '#3c302b', sill: '#efd4ab', glass: '#4a3730', glassLit: '#ffc97c',
    lit: 0.62, brick: false, pilasters: false, wide: 0.5 },
  { key: 'grimy', rough: 0.95, metal: 0.02, top: '#b8ac95', base: '#978d7a', bottom: '#6c6557',
    trim: '#c9c0ad', frame: '#2a2e2d', sill: '#bdb29b', glass: '#303c3c', glassLit: '#d9a96a',
    lit: 0.14, brick: false, pilasters: false, wide: 0.46 },
];

// Map the existing body colours onto the authored styles without consuming the city rng.
const COLOR_STYLE = new Map([
  [0x2f7f86, 'office'], [0x337d88, 'office'], [0x2a6f78, 'office'],
  [0x3d8a91, 'office'], [0x245f6b, 'glass'],
  [0xf4ead6, 'hotel'], [0xe8735a, 'deco'], [0xd9b98a, 'stucco'],
  [0xf0d9bd, 'hotel'], [0xe8b59f, 'deco'], [0xcfd8c6, 'stucco'],
  [0xf0e3cf, 'hotel'], [0xc98d70, 'stucco'], [0x39bdbd, 'office'],
]);

function hash01(x, z, h) {
  let n = (Math.floor(x * 11) * 374761393 + Math.floor(z * 17) * 668265263 + Math.floor(h * 13) * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

function paintMottle(ctx, rng) {
  for (let i = 0; i < 420; i++) {
    ctx.beginPath();
    ctx.ellipse(rng.range(0, TEX_W), rng.range(0, TEX_H), rng.range(6, 62), rng.range(3, 28), rng.range(0, 3.1), 0, Math.PI * 2);
    ctx.fillStyle = rng.chance(0.52) ? `rgba(255,247,226,${rng.range(0.015, 0.07)})` : `rgba(62,45,34,${rng.range(0.012, 0.05)})`;
    ctx.fill();
  }
}

function paintBrick(ctx, rng) {
  ctx.fillStyle = 'rgba(58,30,20,0.2)';
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let row = 0; row < TEX_H / 20; row++) {
    const y = row * 20;
    for (let x = (row % 2 ? -34 : 0) - 68; x < TEX_W; x += 68) {
      const shade = rng.range(0.06, 0.2);
      ctx.fillStyle = rng.chance(0.5) ? `rgba(230,150,110,${shade})` : `rgba(38,20,15,${shade})`;
      ctx.fillRect(x + 2, y + 2, 64, 16);
    }
    ctx.fillStyle = 'rgba(210,190,165,0.18)';
    ctx.fillRect(0, y, TEX_W, 1.5);
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(28,18,14,${rng.range(0.02, 0.09)})`;
    ctx.fillRect(rng.range(0, TEX_W), rng.range(0, TEX_H), rng.range(2, 12), rng.range(2, 8));
  }
}

function paintPilasters(ctx, spec, rng) {
  for (let column = 0; column <= 4; column++) {
    const x = column * (TEX_W / 4) - 15;
    const g = ctx.createLinearGradient(x, 0, x + 30, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.12)'); g.addColorStop(0.4, spec.trim);
    g.addColorStop(0.7, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 46, 26, TEX_H - 46);
  }
  ctx.strokeStyle = 'rgba(60,42,30,0.18)';
  ctx.lineWidth = 2;
  for (let column = 0; column < 4; column++) {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      ctx.arc(column * 320 + 160, 106 + band * 240, 34, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rng.range(0.015, 0.05)})`;
    ctx.fillRect(rng.range(0, TEX_W), rng.range(60, TEX_H), rng.range(1, 5), rng.range(20, 160));
  }
}

function paintWindow(ctx, spec, rng, x, y, w, h, lit) {
  const frame = 7;
  ctx.fillStyle = spec.frame;
  ctx.fillRect(x - frame, y - frame, w + frame * 2, h + frame * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x - frame, y - frame, w + frame * 2, 2);

  const glass = ctx.createLinearGradient(x, y, x + w, y + h);
  if (lit) {
    glass.addColorStop(0, spec.glassLit);
    glass.addColorStop(0.55, '#f7b76b');
    glass.addColorStop(1, '#a9623f');
  } else {
    glass.addColorStop(0, spec.glass);
    glass.addColorStop(0.6, 'rgba(120,150,152,0.72)');
    glass.addColorStop(1, spec.glass);
  }
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, w, h);

  if (lit) {
    const room = ctx.createRadialGradient(x + w * 0.42, y + h * 0.35, 4, x + w * 0.42, y + h * 0.35, w * 0.8);
    room.addColorStop(0, 'rgba(255,244,206,0.95)');
    room.addColorStop(0.55, 'rgba(255,200,126,0.42)');
    room.addColorStop(1, 'rgba(120,60,40,0)');
    ctx.fillStyle = room;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(84,48,36,0.55)';
    ctx.fillRect(x + w * 0.16, y + h * 0.66, w * 0.26, h * 0.19);
    ctx.fillRect(x + w * 0.62, y + h * 0.6, w * 0.16, h * 0.25);
    ctx.fillStyle = 'rgba(40,26,20,0.5)';
    ctx.fillRect(x + w * 0.5, y, 2, h);
    ctx.fillRect(x, y + h * 0.5, w, 2);
  } else {
    ctx.fillStyle = 'rgba(255,250,230,0.1)';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.8);
    ctx.lineTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.72, y);
    ctx.lineTo(x + w * 0.08, y + h);
    ctx.closePath();
    ctx.fill();
    if (rng.chance(0.45)) {
      const blind = Math.floor(rng.range(30, h * 0.65));
      for (let by = y; by < y + blind; by += 8) {
        ctx.fillStyle = by % 16 ? 'rgba(28,38,40,0.35)' : 'rgba(210,205,186,0.24)';
        ctx.fillRect(x, by, w, 4);
      }
    }
  }

  // Sash cross and sill.
  ctx.fillStyle = 'rgba(28,32,32,0.55)';
  ctx.fillRect(x + w * 0.49, y, 2, h);
  ctx.fillRect(x, y + h * 0.46, w, 2);
  ctx.fillStyle = spec.sill;
  ctx.fillRect(x - 13, y + h + frame, w + 26, 9);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fillRect(x - 13, y + h + frame + 9, w + 26, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillRect(x - 13, y + h + frame, w + 26, 2);

  // Drip stains under the sill, a strong read at street distance.
  ctx.fillStyle = 'rgba(30,24,20,0.13)';
  ctx.fillRect(x + w * 0.12, y + h + frame + 12, 3, 46);
  ctx.fillRect(x + w * 0.74, y + h + frame + 12, 5, 30);
}

function paintWindows(ctx, spec, rng) {
  const cellW = TEX_W / 4;
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 4; column++) {
      const wide = spec.wide;
      const w = Math.round(92 + wide * 112);
      const h = Math.round(120 + (1 - wide) * 22);
      const x = Math.round(column * cellW + (cellW - w) / 2);
      const y = Math.round(48 + row * 240 + (188 - h) / 2);
      const lit = rng.chance(spec.lit);
      paintWindow(ctx, spec, rng, x, y, w, h, lit);
    }
  }
}

function paintCornice(ctx, spec) {
  const shade = ctx.createLinearGradient(0, 0, 0, 52);
  shade.addColorStop(0, 'rgba(255,250,235,0.9)');
  shade.addColorStop(0.45, spec.trim);
  shade.addColorStop(0.75, 'rgba(80,56,40,0.35)');
  shade.addColorStop(1, 'rgba(30,22,18,0.72)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, TEX_W, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(0, 3, TEX_W, 2);
  ctx.fillStyle = 'rgba(55,38,28,0.38)';
  for (let x = 10; x < TEX_W; x += 34) ctx.fillRect(x, 30, 14, 15);
  ctx.fillStyle = 'rgba(255,246,224,0.4)';
  for (let x = 10; x < TEX_W; x += 34) ctx.fillRect(x, 30, 14, 2);
  ctx.fillStyle = 'rgba(16,12,10,0.55)';
  ctx.fillRect(0, 52, TEX_W, 4);
}

function paintGrime(ctx, rng, strength) {
  for (let i = 0; i < 42; i++) {
    const x = rng.range(0, TEX_W);
    const w = rng.range(2, 15);
    const len = rng.range(TEX_H * 0.18, TEX_H * 0.72);
    const g = ctx.createLinearGradient(0, 52, 0, 52 + len);
    g.addColorStop(0, `rgba(34,29,24,${0.06 * strength})`);
    g.addColorStop(0.45, `rgba(34,29,24,${0.12 * strength})`);
    g.addColorStop(1, 'rgba(34,29,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 52, w, len);
  }
  const base = ctx.createLinearGradient(0, TEX_H - 150, 0, TEX_H);
  base.addColorStop(0, 'rgba(26,22,18,0)');
  base.addColorStop(1, `rgba(26,22,18,${0.24 * strength})`);
  ctx.fillStyle = base;
  ctx.fillRect(0, TEX_H - 150, TEX_W, 150);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(46,48,38,${rng.range(0.02, 0.08) * strength})`;
    ctx.beginPath();
    ctx.ellipse(rng.range(0, TEX_W), rng.range(100, TEX_H), rng.range(8, 46), rng.range(4, 22), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintFacade(spec, index) {
  const rng = seededRandom(4100 + index * 977);
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');

  const wall = ctx.createLinearGradient(0, 0, 0, TEX_H);
  wall.addColorStop(0, spec.top);
  wall.addColorStop(0.5, spec.base);
  wall.addColorStop(1, spec.bottom);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  paintMottle(ctx, rng);
  if (spec.brick) paintBrick(ctx, rng);
  if (spec.pilasters) paintPilasters(ctx, spec, rng);
  if (spec.key === 'glass') {
    ctx.fillStyle = 'rgba(238,250,248,0.14)';
    for (let y = 52; y < TEX_H; y += 240) ctx.fillRect(0, y + 206, TEX_W, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 34; x < TEX_W; x += 320) ctx.fillRect(x, 52, 5, TEX_H);
  }
  paintWindows(ctx, spec, rng);
  paintCornice(ctx, spec);
  paintGrime(ctx, rng, spec.key === 'grimy' ? 2.4 : spec.key === 'lit' ? 0.7 : 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.18, 'rgba(255,255,255,0.52)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.needsUpdate = true;
  return tex;
}

export function createFacadeSet() {
  const materials = {};
  for (let i = 0; i < FACADE_STYLES.length; i++) {
    const spec = FACADE_STYLES[i];
    const material = new THREE.MeshStandardMaterial({
      map: paintFacade(spec, i), color: 0xffffff, roughness: spec.rough, metalness: spec.metal,
    });
    material.name = `facade-${spec.key}`;
    materials[spec.key] = material;
  }
  const glow = makeGlowTexture();
  return {
    materials,
    glow,
    boxProto: new THREE.BoxGeometry(1, 1, 1),
    bodyCache: new Map(),
    bins: createBins(),
  };
}

export function facadeStyleFor(color, h, x, z) {
  const base = COLOR_STYLE.get(color) || (h > 30 ? 'glass' : 'stucco');
  const roll = hash01(x, z, h);
  if (roll < 0.08) return 'grimy';
  if (roll > 0.9) return 'lit';
  if (h < 24 && roll > 0.62 && roll < 0.74) return 'brick';
  return base;
}

export function facadeMaterial(set, style) {
  return set.materials[style] || set.materials.stucco;
}

// A body geometry is the shared unit cube with UVs counted in real metres, so one shared
// material keeps windows about 3.4 m wide and 3.6 m tall whatever the building size.
export function facadeGeometry(set, w, h, d) {
  const key = `${Math.round(w * 4)}_${Math.round(h * 4)}_${Math.round(d * 4)}`;
  const cached = set.bodyCache.get(key);
  if (cached) return cached;
  const geo = set.boxProto.clone();
  const uv = geo.attributes.uv;
  const uDims = [d, d, w, w, w, w];
  const vDims = [h, h, d, d, h, h];
  for (let face = 0; face < 6; face++) {
    const uReps = Math.max(1, Math.round(uDims[face] / TILE_W));
    const vReps = Math.max(1, Math.round(vDims[face] / TILE_H));
    for (let v = face * 4; v < face * 4 + 4; v++) {
      uv.setXY(v, uv.getX(v) * uReps, uv.getY(v) * vReps);
    }
  }
  uv.needsUpdate = true;
  geo.name = `facade-body-${key}`;
  set.bodyCache.set(key, geo);
  return geo;
}

// The decoration bins are filled while the city is generated and turned into a small set of
// InstancedMeshes once, in flushFacadeDetails.
function createBins() {
  const keys = ['slab', 'metal', 'glass', 'parapet', 'tank', 'tankRoof', 'ac', 'vent', 'antenna',
    'awning', 'neonCoral', 'neonTurquoise', 'neonGold', 'glowCoral', 'glowTurquoise', 'glowGold'];
  const bins = {};
  for (const key of keys) bins[key] = [];
  return bins;
}

export function decorateBuilding(set, spec) {
  const { x, z, w, d, h, style, rng, tall } = spec;
  const base = 0.28;
  const top = base + h;
  const isHouse = !tall && (style === 'stucco' || style === 'deco' || style === 'hotel' || style === 'brick' || style === 'lit' || style === 'grimy');
  const fronts = spec.shopRow
    ? [{ nx: 0, nz: 1 }]
    : [{ nx: 0, nz: 1 }, { nx: -1, nz: 0 }];

  for (let i = 0; i < fronts.length; i++) {
    storefront(set, spec, fronts[i], base);
  }

  if (isHouse && rng.chance(0.78)) balconies(set, spec, rng, base, fronts);
  if (style === 'brick' && rng.chance(0.85)) fireEscape(set, spec, rng, base);
  if (rng.chance(tall ? 0.9 : 0.7)) parapet(set, spec, rng, spec.roofTop || top);
  if (rng.chance(tall ? 0.6 : 0.72)) roofClutter(set, spec, rng, spec.roofTop || top);
}

function pushBox(bin, x, y, z, sx, sy, sz, ry, rx) {
  bin.push({ x, y, z, sx, sy, sz, ry: ry || 0, rx: rx || 0 });
}

function faceFrame(spec, face) {
  const { x, z, w, d } = spec;
  if (face.nx) {
    return { px: x + face.nx * (w / 2), pz: z, ry: face.nx > 0 ? Math.PI / 2 : -Math.PI / 2,
      span: d, nx: face.nx, nz: 0 };
  }
  return { px: x, pz: z + face.nz * (d / 2), ry: face.nz > 0 ? 0 : Math.PI,
    span: w, nx: 0, nz: face.nz };
}

function wallPoint(frame, u, out) {
  return { x: frame.px + (frame.nx ? frame.nx * out : u), z: frame.pz + (frame.nz ? frame.nz * out : u) };
}

// ---------- ground floor ----------
function storefront(set, spec, face, base) {
  const { rng, h } = spec;
  if (h < 5.2) return;
  const frame = faceFrame(spec, face);
  const span = frame.span;
  if (span < 4) return;
  const bays = clamp(Math.floor(span / 3.6), 1, 6);
  const bayW = span / bays;
  const glassH = Math.min(2.2, h * 0.28);
  const glassY = base + 0.5 + glassH / 2;
  const pick = rng.pick(['coral', 'turquoise', 'gold']);
  const neonColor = NEON_COLORS[pick];

  for (let i = 0; i < bays; i++) {
    const u = -span / 2 + (i + 0.5) * bayW;
    const paneW = bayW - 0.42;
    const p = wallPoint(frame, u, 0.11);
    pushBox(set.bins.glass, p.x, glassY, p.z, paneW, glassH, 0.09, frame.ry);
    const back = wallPoint(frame, u, 0.05);
    const mullion = wallPoint(frame, u, 0.2);
    pushBox(set.bins.metal, mullion.x, glassY, mullion.z, 0.09, glassH, 0.08, frame.ry);
    pushBox(set.bins.metal, back.x, base + 0.5 + glassH, back.z, paneW + 0.34, 0.16, 0.15, frame.ry);
    pushBox(set.bins.metal, back.x, base + 0.42, back.z, paneW + 0.34, 0.15, 0.17, frame.ry);

    // Every other bay gets a full door frame and a darker door pane.
    if (i % 2 === 0) {
      const door = wallPoint(frame, u + bayW * 0.27, 0.13);
      pushBox(set.bins.glass, door.x, base + 1.08, door.z, 0.86, 1.5, 0.1, frame.ry);
      pushBox(set.bins.metal, wallPoint(frame, u + bayW * 0.27, 0.21).x, base + 1.92,
        wallPoint(frame, u + bayW * 0.27, 0.21).z, 1.05, 0.12, 0.12, frame.ry);
      for (const side of [-0.47, 0.47]) {
        const j = wallPoint(frame, u + bayW * 0.27 + side, 0.21);
        pushBox(set.bins.metal, j.x, base + 1.12, j.z, 0.11, 1.44, 0.12, frame.ry);
      }
    }

    // Small fabric awning over each shop window; larger shared awnings stay where they were.
    if (i % 2 === 1) {
      const a = wallPoint(frame, u, 0.62);
      pushBox(set.bins.awning, a.x, base + glassH + 0.78, a.z, paneW - 0.1, 0.1, 0.92, frame.ry);
      const edge = wallPoint(frame, u, 1.05);
      pushBox(set.bins.awning, edge.x, base + glassH + 0.68, edge.z, paneW - 0.1, 0.2, 0.06, frame.ry);
    }
  }

  // A single neon box per street face, centered above the glazing and backed by a glow quad.
  const signW = Math.min(span * 0.62, 5.2);
  const signY = base + glassH + 1.28;
  if (signY < base + h - 0.6) {
    const sign = wallPoint(frame, 0, 0.16);
    pushBox(set.bins[pick === 'coral' ? 'neonCoral' : pick === 'turquoise' ? 'neonTurquoise' : 'neonGold'],
      sign.x, signY, sign.z, signW, 0.66, 0.2, frame.ry);
    pushBox(set.bins.metal, sign.x, signY + 0.44, sign.z, signW + 0.3, 0.09, 0.13, frame.ry);
    const halo = wallPoint(frame, 0, 0.03);
    const bin = pick === 'coral' ? set.bins.glowCoral : pick === 'turquoise' ? set.bins.glowTurquoise : set.bins.glowGold;
    bin.push({ x: halo.x, y: signY, z: halo.z, sx: signW + 3.2, sy: 2.5, sz: 1, ry: frame.ry, color: neonColor });
  }
}

// ---------- balconies ----------
function balconies(set, spec, rng, base, fronts) {
  const { x, z, w, d, h } = spec;
  const floors = Math.max(1, Math.floor((h - 4) / 3.6));
  const count = Math.min(3, rng.int(1, floors));
  for (let i = 0; i < count; i++) {
    const face = fronts[rng.int(0, fronts.length - 1)];
    const frame = faceFrame(spec, face);
    if (frame.span < 3.2) continue;
    const floor = Math.min(floors - 1, rng.int(1, Math.max(1, floors - 1)));
    const y = base + 2.8 + floor * 3.6;
    if (y > base + h - 1.4) continue;
    const bw = Math.min(frame.span - 1.6, rng.range(2.5, 4.4));
    if (bw < 2) continue;
    const u = rng.range(-frame.span / 2 + bw / 2 + 0.5, frame.span / 2 - bw / 2 - 0.5);

    const slab = wallPoint(frame, u, 0.52);
    pushBox(set.bins.slab, slab.x, y + 0.06, slab.z, bw, 0.16, 1.04, frame.ry);

    // Outer top rail.
    const rail = wallPoint(frame, u, 1.0);
    pushBox(set.bins.metal, rail.x, y + 1.02, rail.z, bw, 0.07, 0.07, frame.ry);
    const mid = wallPoint(frame, u, 1.0);
    pushBox(set.bins.metal, mid.x, y + 0.58, mid.z, bw, 0.05, 0.05, frame.ry);

    const bars = Math.max(4, Math.floor(bw / 0.26));
    for (let b = 0; b <= bars; b++) {
      const bu = u - bw / 2 + (b / bars) * bw;
      const p = wallPoint(frame, bu, 1.0);
      pushBox(set.bins.metal, p.x, y + 0.54, p.z, 0.055, 0.94, 0.055, frame.ry);
    }
    // Side rails wrap the slab so the balcony reads in profile.
    for (const side of [-1, 1]) {
      const su = u + side * bw / 2;
      const p = wallPoint(frame, su, 0.72);
      pushBox(set.bins.metal, p.x, y + 1.0, p.z, 0.06, 0.06, 1.0, frame.ry);
      pushBox(set.bins.metal, p.x, y + 0.58, p.z, 0.05, 0.05, 1.0, frame.ry);
    }

    // A couple of pots and a chair silhouette make the balconies feel lived in.
    if (rng.chance(0.65)) {
      const p = wallPoint(frame, u + rng.range(-bw * 0.3, bw * 0.3), 0.72);
      pushBox(set.bins.slab, p.x, y + 0.34, p.z, 0.32, 0.42, 0.32, frame.ry);
      pushBox(set.bins.vent, p.x, y + 0.62, p.z, 0.42, 0.42, 0.42, 0);
    }
    if (rng.chance(0.45)) {
      const c = wallPoint(frame, u - bw * 0.26, 0.7);
      pushBox(set.bins.metal, c.x, y + 0.45, c.z, 0.46, 0.62, 0.46, frame.ry);
    }
  }
}

// ---------- fire escapes ----------
function fireEscape(set, spec, rng, base) {
  const { x, z, w, d, h } = spec;
  const faces = [{ nx: 1, nz: 0 }, { nx: 0, nz: -1 }];
  const face = faces[rng.int(0, 1)];
  const frame = faceFrame(spec, face);
  if (frame.span < 3.4) return;
  const floors = Math.max(2, Math.floor((h - 4) / 3.6));
  const levels = Math.min(5, floors);
  const u = rng.range(-frame.span / 2 + 2, frame.span / 2 - 2);
  const pw = Math.min(3.0, frame.span - 1.2);

  for (let i = 0; i < levels; i++) {
    const y = base + 2.5 + i * 3.6;
    if (y > base + h - 1.2) break;
    const p = wallPoint(frame, u, 0.62);
    pushBox(set.bins.metal, p.x, y, p.z, pw, 0.09, 1.15, frame.ry);
    const rail = wallPoint(frame, u, 1.16);
    pushBox(set.bins.metal, rail.x, y + 0.94, rail.z, pw, 0.06, 0.06, frame.ry);
    const barCount = Math.floor(pw / 0.28);
    for (let b = 0; b <= barCount; b++) {
      const bu = u - pw / 2 + (b / barCount) * pw;
      const bp = wallPoint(frame, bu, 1.16);
      pushBox(set.bins.metal, bp.x, y + 0.5, bp.z, 0.05, 0.9, 0.05, frame.ry);
    }
    for (const side of [-1, 1]) {
      const sp = wallPoint(frame, u + side * pw / 2, 0.62);
      pushBox(set.bins.metal, sp.x, y + 0.94, sp.z, 0.05, 0.06, 1.15, frame.ry);
    }
    // Zig-zag ladder between levels.
    if (i < levels - 1) {
      const ladderY = base + 3.95 + i * 3.6;
      if (ladderY < base + h - 1.6) {
        const l1 = wallPoint(frame, u - 0.55, 0.72);
        const l2 = wallPoint(frame, u + 0.55, 0.72);
        for (const p2 of [l1, l2]) pushBox(set.bins.metal, p2.x, ladderY, p2.z, 0.055, 3.1, 0.055, frame.ry);
        for (let rung = 0; rung < 7; rung++) {
          const ry = base + 2.7 + i * 3.6 + rung * 0.42;
          const r = wallPoint(frame, u, 0.72);
          pushBox(set.bins.metal, r.x, ry, r.z, 1.1, 0.045, 0.045, frame.ry);
        }
      }
    }
  }
}

// ---------- roof ----------
function parapet(set, spec, rng, roofTop) {
  const { x, z, w, d } = spec;
  const t = 0.26;
  const ph = rng.range(0.45, 0.76);
  const hw = w * 0.515;
  const hd = d * 0.515;
  const y = roofTop + ph / 2;
  pushBox(set.bins.parapet, x, y, z + hd - t / 2, w * 1.03, ph, t, 0);
  pushBox(set.bins.parapet, x, y, z - hd + t / 2, w * 1.03, ph, t, 0);
  pushBox(set.bins.parapet, x + hw - t / 2, y, z, t, ph, d * 1.03, 0);
  pushBox(set.bins.parapet, x - hw + t / 2, y, z, t, ph, d * 1.03, 0);
}

function roofClutter(set, spec, rng, top) {
  const { x, z, w, d, h } = spec;
  const rx = () => x + rng.range(-w / 2 + 1.6, w / 2 - 1.6);
  const rz = () => z + rng.range(-d / 2 + 1.6, d / 2 - 1.6);

  if (h < 30 && rng.chance(0.42)) {
    const tx = rx();
    const tz = rz();
    const tr = rng.range(0.95, 1.55);
    const th = rng.range(2.1, 3.4);
    pushBox(set.bins.tank, tx, top + 0.2 + th / 2, tz, tr, th, tr, 0);
    pushBox(set.bins.tankRoof, tx, top + 0.25 + th, tz, tr * 1.12, rng.range(0.55, 0.9), tr * 1.12, 0);
    for (const ox of [-tr * 0.62, tr * 0.62]) {
      for (const oz of [-tr * 0.62, tr * 0.62]) {
        pushBox(set.bins.metal, tx + ox, top + 0.18 + th * 0.34, tz + oz, 0.12, th * 0.7, 0.12, 0);
      }
    }
  }

  const acCount = rng.int(1, 3);
  for (let i = 0; i < acCount; i++) {
    const ax = rx();
    const az = rz();
    const aw = rng.range(1.1, 1.9);
    const ah = rng.range(0.65, 1.05);
    pushBox(set.bins.ac, ax, top + 0.08 + ah / 2, az, aw, ah, rng.range(0.9, 1.4), rng.chance(0.5) ? Math.PI / 2 : 0);
    pushBox(set.bins.vent, ax, top + 0.12 + ah, az, 0.34, 0.12, 0.34, 0);
  }

  if (rng.chance(0.55)) {
    const vx = rx();
    const vz = rz();
    pushBox(set.bins.vent, vx, top + 0.55, vz, 0.4, 0.9, 0.4, 0);
    pushBox(set.bins.metal, vx, top + 1.02, vz, 0.52, 0.08, 0.52, 0);
  }

  if (rng.chance(0.5)) {
    const ax = rx();
    const az = rz();
    const ah = rng.range(2.4, 6.5);
    pushBox(set.bins.antenna, ax, top + ah / 2, az, 0.055, ah, 0.055, 0);
    pushBox(set.bins.metal, ax, top + ah * 0.72, az, 1.3, 0.05, 0.05, 0);
    pushBox(set.bins.metal, ax, top + ah * 0.86, az, 0.9, 0.045, 0.045, 0);
  }
}

// ---------- flush ----------
function buildBinMesh(root, bin, geometry, material, name, colored, noShadow) {
  if (!bin.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, bin.length);
  mesh.name = name;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  for (let i = 0; i < bin.length; i++) {
    const it = bin[i];
    p.set(it.x, it.y, it.z);
    e.set(it.rx || 0, it.ry || 0, 0, 'YXZ');
    q.setFromEuler(e);
    s.set(it.sx, it.sy, it.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (colored && it.color !== undefined) mesh.setColorAt(i, new THREE.Color(it.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !noShadow;
  mesh.receiveShadow = !noShadow;
  root.add(mesh);
}

export function flushFacadeDetails(root, set) {
  const bins = set.bins;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const cone = new THREE.ConeGeometry(0.5, 1, 12);
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x252a2c, roughness: 0.62, metalness: 0.55 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa89d8c, roughness: 0.95, metalness: 0.02 });
  const storeGlass = new THREE.MeshStandardMaterial({ color: 0x2c4a50, roughness: 0.18, metalness: 0.55 });
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0xb3a692, roughness: 0.92, metalness: 0.02 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b6041, roughness: 0.95, metalness: 0.02 });
  const acMat = new THREE.MeshStandardMaterial({ color: 0x8b9290, roughness: 0.72, metalness: 0.28 });
  const ventMat = new THREE.MeshStandardMaterial({ color: 0x56605f, roughness: 0.7, metalness: 0.32 });
  const awningMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02 });
  const neonMats = {};
  const glowMats = {};
  for (const key of Object.keys(NEON_COLORS)) {
    neonMats[key] = new THREE.MeshStandardMaterial({
      color: 0x241b16,
      emissive: NEON_COLORS[key],
      emissiveIntensity: 1.35,
      roughness: 0.45,
      metalness: 0.15,
      toneMapped: false,
    });
    glowMats[key] = new THREE.MeshBasicMaterial({
      map: set.glow,
      color: NEON_COLORS[key],
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }

  buildBinMesh(root, bins.slab, box, concrete, 'facade-balcony-slabs');
  buildBinMesh(root, bins.metal, box, darkMetal, 'facade-metalwork');
  buildBinMesh(root, bins.glass, box, storeGlass, 'facade-storefront-glass');
  buildBinMesh(root, bins.parapet, box, parapetMat, 'facade-parapets');
  buildBinMesh(root, bins.tank, cylinder, wood, 'facade-water-tanks');
  buildBinMesh(root, bins.tankRoof, cone, wood, 'facade-water-tank-roofs');
  buildBinMesh(root, bins.ac, box, acMat, 'facade-ac-units');
  buildBinMesh(root, bins.vent, cylinder, ventMat, 'facade-vents');
  buildBinMesh(root, bins.antenna, cylinder, darkMetal, 'facade-antennas');
  buildBinMesh(root, bins.awning, box, awningMat, 'facade-small-awnings', true);
  buildBinMesh(root, bins.neonCoral, box, neonMats.coral, 'facade-neon-coral', false, true);
  buildBinMesh(root, bins.neonTurquoise, box, neonMats.turquoise, 'facade-neon-turquoise', false, true);
  buildBinMesh(root, bins.neonGold, box, neonMats.gold, 'facade-neon-gold', false, true);
  buildBinMesh(root, bins.glowCoral, plane, glowMats.coral, 'facade-glow-coral', false, true);
  buildBinMesh(root, bins.glowTurquoise, plane, glowMats.turquoise, 'facade-glow-turquoise', false, true);
  buildBinMesh(root, bins.glowGold, plane, glowMats.gold, 'facade-glow-gold', false, true);

  // The bins are one-shot: keep them empty so a second generateCity cannot duplicate details.
  for (const key of Object.keys(bins)) bins[key].length = 0;
}
