// Map pass: district zones, street names, waypoints and canvas drawing helpers.
// Everything here is presentation data plus pure draw functions, so the HUD, the pause map
// and the minimap can share one projection without changing the city generator.

import { clamp, seededRandom } from './rng.js';

// Zone table: the six city districts with a soft radius, a descriptor, a main street and a colour.
const ZONES = [
  { name: 'PALM BEACH', x: 60, z: 216, radius: 96, descriptor: 'Sand, surf and low coral blocks.', street: 'Palm Boulevard', color: '#ff3d8b' },
  { name: 'MARINA', x: -145, z: 254, radius: 82, descriptor: 'Docks, boats and cold coffee.', street: 'Marina Avenue', color: '#39e6e0' },
  { name: 'DOWNTOWN', x: 80, z: -40, radius: 112, descriptor: 'Teal glass and money traffic.', street: 'Vela Avenue', color: '#ffc35c' },
  { name: 'PALM ROW', x: 0, z: 90, radius: 90, descriptor: 'Books, diners and neon signs.', street: 'Palma Row', color: '#5ad48a' },
  { name: 'CORAL HEIGHTS', x: 210, z: 60, radius: 104, descriptor: 'Hillside villas above the bay.', street: 'Coral Avenue', color: '#e8735a' },
  { name: 'HILLS', x: -180, z: -232, radius: 108, descriptor: 'Switchbacks, palms and lookout.', street: 'Hillside Street', color: '#9ad0c2' },
];

// Road names keyed to the generated strips: axis x runs east-west, axis z runs north-south.
const ROAD_NAMES = [
  { name: 'Palm Boulevard', axis: 'x', coord: 196 },
  { name: 'Shoreline Drive', axis: 'x', coord: 160 },
  { name: 'Palma Row', axis: 'x', coord: 80 },
  { name: 'Azura Street', axis: 'x', coord: 0 },
  { name: 'Dockside Street', axis: 'x', coord: -80 },
  { name: 'Hillside Street', axis: 'x', coord: -160 },
  { name: 'West Avenue', axis: 'z', coord: -240 },
  { name: 'Marina Avenue', axis: 'z', coord: -160 },
  { name: 'Coral Avenue', axis: 'z', coord: -80 },
  { name: 'Vela Avenue', axis: 'z', coord: 0 },
  { name: 'Sunset Avenue', axis: 'z', coord: 80 },
  { name: 'Palma Avenue', axis: 'z', coord: 160 },
  { name: 'East Avenue', axis: 'z', coord: 240 },
];

// Legend rows: labels stay short so the panel fits beside a minimap at 768 px.
const LEGEND = [
  { label: 'District', color: '#ffc35c' },
  { label: 'Street', color: '#9fb4bd' },
  { label: 'Waypoint', color: '#39e6e0' },
  { label: 'Police', color: '#ff3d5a' },
  { label: 'Safehouse', color: '#5ad48a' },
  { label: 'Mission', color: '#ffc35c' },
  { label: 'Race', color: '#39e6e0' },
  { label: 'Heat', color: '#e8735a' },
];

const DEFAULT_STREET = 'Palm Boulevard';
const DEFAULT_WAYPOINT = 'WAYPOINT';

function zoneFor(name) {
  const key = String(name || '').toUpperCase();
  return ZONES.find((zone) => zone.name === key) || null;
}

function heatCss(value) {
  const t = clamp(Number(value) || 0, 0, 100) / 100;
  const a = t <= 0.5 ? [57, 230, 224] : [255, 195, 92];
  const b = t <= 0.5 ? [255, 195, 92] : [232, 115, 90];
  const f = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  const c = (i) => Math.round(a[i] + (b[i] - a[i]) * f);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

function projector(project) {
  if (typeof project === 'function') return { X: (x) => project(x), Z: (z) => project(z), scale: 1 };
  const p = project || {};
  const scale = Number.isFinite(Number(p.scale)) ? Number(p.scale) : 1;
  const fallbackX = (x) => (Number(p.ox) || 0) + (Number(x) || 0) * scale;
  const fallbackZ = (z) => (Number(p.oy) || 0) + (Number(z) || 0) * scale;
  return { X: typeof p.X === 'function' ? p.X : fallbackX, Z: typeof p.Z === 'function' ? p.Z : fallbackZ, scale };
}

export class MapSystem {
  constructor(city, districts, seed = 7) {
    this.city = city || { roads: [], docks: [], colliders: [] };
    this.districts = Array.isArray(districts) ? districts : [];
    this.seed = seed;
    this.rng = seededRandom(Number(seed) || 7);
    this.discovered = new Set();
    this.waypoint = null;
    this.waypointLabel = '';
    this.lastDistrict = this.districts.length ? this.districts[0].name || '' : '';
  }

  districtAt(x, z) {
    const list = this.districts.length ? this.districts : ZONES;
    const px = Number(x) || 0;
    const pz = Number(z) || 0;
    let best = null;
    let bestScore = Infinity;
    for (const district of list) {
      if (!district) continue;
      const zone = zoneFor(district.name);
      const dx = px - (Number.isFinite(district.x) ? district.x : zone ? zone.x : 0);
      const dz = pz - (Number.isFinite(district.z) ? district.z : zone ? zone.z : 0);
      const score = Math.hypot(dx, dz) / Math.max(30, zone ? zone.radius : 70);
      if (score < bestScore) { bestScore = score; best = district; }
    }
    return best || list[0] || ZONES[0];
  }

  zoneOf(x, z) {
    const district = this.districtAt(x, z);
    return zoneFor(district && district.name) || { name: (district && district.name) || 'VELA CITY', x: (district && district.x) || 0, z: (district && district.z) || 0, radius: 70, descriptor: 'Coast district.', street: DEFAULT_STREET, color: '#ffc35c' };
  }

  streetAt(x, z) {
    const roads = this.city && Array.isArray(this.city.roads) ? this.city.roads : [];
    if (!roads.length) return DEFAULT_STREET;
    const px = Number(x) || 0;
    const pz = Number(z) || 0;
    let best = null;
    let distance = Infinity;
    for (const road of roads) {
      if (!road) continue;
      const vertical = Number(road.h) > Number(road.w);
      const d = vertical ? Math.abs(px - (Number(road.x) || 0)) : Math.abs(pz - (Number(road.z) || 0));
      if (d < distance) { distance = d; best = road; }
    }
    if (!best) return DEFAULT_STREET;
    const vertical = Number(best.h) > Number(best.w);
    const coord = vertical ? Number(best.x) || 0 : Number(best.z) || 0;
    let name = '';
    let nameDistance = Infinity;
    for (const row of ROAD_NAMES) {
      if (row.axis !== (vertical ? 'z' : 'x')) continue;
      const d = Math.abs(row.coord - coord);
      if (d < nameDistance) { nameDistance = d; name = row.name; }
    }
    return name || DEFAULT_STREET;
  }

  discover(name) {
    if (!name || this.discovered.has(name)) return false;
    this.discovered.add(name);
    return true;
  }

  setWaypoint(point, label) {
    if (!point) { this.clearWaypoint(); return; }
    const text = label || point.label || DEFAULT_WAYPOINT;
    this.waypoint = { x: Number.isFinite(point.x) ? point.x : 0, z: Number.isFinite(point.z) ? point.z : 0, label: text };
    this.waypointLabel = text;
  }

  clearWaypoint() {
    this.waypoint = null;
    this.waypointLabel = '';
  }

  update(dt, ctx = {}) {
    ctx = ctx || {}; const player = ctx.player || ctx;
    const vehicle = player && player.inVehicle;
    const pos = vehicle ? vehicle.pos : player && player.pos ? player.pos : player;
    const x = Number.isFinite(pos && pos.x) ? pos.x : Number(ctx.x) || 0;
    const z = Number.isFinite(pos && pos.z) ? pos.z : Number(ctx.z) || 0;
    const district = this.districtAt(x, z);
    const zone = zoneFor(district && district.name) || { name: (district && district.name) || 'VELA CITY', x: (district && district.x) || 0, z: (district && district.z) || 0, radius: 70, descriptor: 'Coast district.', street: DEFAULT_STREET, color: '#ffc35c' };
    this.lastDistrict = (district && district.name) || zone.name;
    this.discover(this.lastDistrict);
    if (this.waypoint && Math.hypot(x - this.waypoint.x, z - this.waypoint.z) <= 12) this.clearWaypoint();
    return zone;
  }

  legend() {
    return LEGEND.map((row) => ({ ...row }));
  }

  heatColor(value) {
    return heatCss(value);
  }

  project(mapX, mapY, mapW, mapH) {
    const scale = Math.min((Number(mapW) || 0) / 660, (Number(mapH) || 0) / 560);
    const ox = (Number(mapX) || 0) + (Number(mapW) || 0) / 2;
    const oy = (Number(mapY) || 0) + (Number(mapH) || 0) / 2 + 20;
    return { scale, X: (x) => ox + (Number(x) || 0) * scale, Z: (z) => oy + ((Number(z) || 0) + 20) * scale };
  }
}

export function drawDistrictOverlay(ctx, map, districts, project, heatOf) {
  if (!ctx) return;
  const p = projector(project);
  const list = Array.isArray(districts) && districts.length ? districts : ZONES;
  ctx.save(); ctx.textAlign = 'center';
  for (const district of list) {
    if (!district) continue;
    const zone = zoneFor(district.name);
    const name = String(district.name || (zone && zone.name) || 'VELA CITY').toUpperCase();
    const X = p.X(Number.isFinite(district.x) ? district.x : zone ? zone.x : 0), Z = p.Z(Number.isFinite(district.z) ? district.z : zone ? zone.z : 0);
    const radius = Math.max(12, (zone ? zone.radius : 70) * p.scale), color = (zone && zone.color) || '#ffc35c';
    const heat = typeof heatOf === 'function' ? heatOf(name) : null, ring = typeof heat === 'string' ? heat : Number.isFinite(Number(heat)) ? heatCss(heat) : color;
    ctx.globalAlpha = 0.13; ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(X, Z, radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.7; ctx.strokeStyle = ring; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X, Z, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.92; ctx.fillStyle = '#f4ead6'; ctx.font = '900 15px "Arial Black", system-ui, sans-serif';
    ctx.fillText(name, X, Z);
    ctx.globalAlpha = 0.65; ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText((zone && zone.descriptor) || 'Coast district', X, Z + 16);
  }
  ctx.restore();
}

export function drawStreetLabels(ctx, roads, project, labelOf) {
  if (!ctx) return;
  const list = Array.isArray(roads) ? roads : [];
  const p = projector(project);
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 12px system-ui, sans-serif'; ctx.fillStyle = 'rgba(244,234,214,0.82)';
  list.forEach((road, index) => {
    if (!road) return;
    const vertical = Number(road.h) > Number(road.w);
    const custom = typeof labelOf === 'function' ? labelOf(road, index) : '';
    const name = custom || (ROAD_NAMES[index % ROAD_NAMES.length] || {}).name || DEFAULT_STREET;
    const along = ((index % 3) - 1) * 140;
    const x = vertical ? Number(road.x) || 0 : (Number(road.x) || 0) + along, z = vertical ? (Number(road.z) || 0) + along : Number(road.z) || 0;
    ctx.save(); ctx.translate(p.X(x), p.Z(z)); if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.fillText(name, 0, 0); ctx.restore();
  });
  ctx.restore();
}

export function drawWaypoint(ctx, project, point, label, time) {
  if (!ctx || !point) return;
  const p = projector(project), r = 7 * (1 + Math.sin((Number(time) || 0) * 4) * 0.16);
  const X = p.X(Number(point.x) || 0); const Z = p.Z(Number(point.z) || 0);
  ctx.save(); ctx.translate(X, Z);
  ctx.fillStyle = '#39e6e0'; ctx.strokeStyle = '#102027'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 0.5; ctx.strokeStyle = '#39e6e0'; ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1; ctx.fillStyle = '#f4ead6'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(String(label || DEFAULT_WAYPOINT), 0, -r * 2.4);
  ctx.restore();
}

export function drawLegend(ctx, x, y, rows) {
  if (!ctx) return;
  const list = Array.isArray(rows) ? rows : [];
  const left = Number(x) || 0; const top = Number(y) || 0; const height = 38 + Math.max(1, list.length) * 22;
  ctx.save(); ctx.fillStyle = 'rgba(8,20,26,0.88)'; ctx.fillRect(left, top, 164, height);
  ctx.strokeStyle = 'rgba(57,230,224,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(left, top, 164, height);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffc35c'; ctx.font = '900 14px "Arial Black", system-ui, sans-serif';
  ctx.fillText('MAP KEY', left + 12, top + 22);
  list.forEach((row, index) => {
    const color = row && row.color ? row.color : '#39e6e0';
    const label = row && row.label ? row.label : String(row || '');
    const lineY = top + 42 + index * 22;
    ctx.fillStyle = color; ctx.fillRect(left + 12, lineY - 9, 10, 10);
    ctx.fillStyle = 'rgba(244,234,214,0.9)'; ctx.font = '600 13px system-ui, sans-serif'; ctx.fillText(label, left + 30, lineY);
  });
  ctx.restore();
}

export function drawCompass(ctx, cx, cy, r, yaw) {
  if (!ctx) return;
  const radius = Math.max(12, Number(r) || 24); const centerX = Number(cx) || 0; const centerY = Number(cy) || 0;
  ctx.save(); ctx.translate(centerX, centerY);
  ctx.strokeStyle = 'rgba(244,234,214,0.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(244,234,214,0.25)'; ctx.beginPath();
  ctx.moveTo(-radius, 0); ctx.lineTo(radius, 0); ctx.moveTo(0, -radius); ctx.lineTo(0, radius); ctx.stroke();
  ctx.rotate(Number(yaw) || 0); ctx.fillStyle = '#e8735a'; ctx.beginPath();
  ctx.moveTo(0, -radius * 0.72); ctx.lineTo(radius * 0.22, 0); ctx.lineTo(-radius * 0.22, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4ead6';
  ctx.font = '900 12px "Arial Black", system-ui, sans-serif';
  ctx.fillText('N', centerX, centerY - radius - 9); ctx.fillText('E', centerX + radius + 9, centerY);
  ctx.fillText('S', centerX, centerY + radius + 9); ctx.fillText('W', centerX - radius - 9, centerY);
  ctx.restore();
}

export function drawDistrictLabel(ctx, x, y, name, descriptor) {
  if (!ctx) return;
  const left = Number(x) || 0; const top = Number(y) || 0;
  ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(8,20,26,0.78)';
  ctx.fillRect(left - 8, top - 20, 220, 44); ctx.strokeStyle = 'rgba(57,230,224,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(left - 8, top - 20, 220, 44);
  ctx.fillStyle = '#f4ead6'; ctx.font = '900 16px "Arial Black", system-ui, sans-serif'; ctx.fillText(String(name || 'VELA CITY'), left, top - 2);
  ctx.fillStyle = 'rgba(244,234,214,0.7)'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(String(descriptor || 'COAST DISTRICT'), left, top + 15);
  ctx.restore();
}
