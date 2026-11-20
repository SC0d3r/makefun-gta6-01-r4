// Heat pass: district heat, reputation tiers, street rumors and heat helpers.
// Heat is a per-district pressure value from 0 to 100. Reputation is a per-district
// standing value from 0 to 1000. Police stars push heat up while the player stays in
// a district, and every event leaves a short label for the HUD and pause map to read.
// The module is deterministic: all variation comes from the seeded rng passed in.

import { seededRandom, clamp } from './rng.js';

// Event table: kind, short label, heat points and the reputation swing.
// Positive reputation rows are public wins. Negative rows are crimes the coast remembers.
const CRIME_EVENTS = [
  { kind: 'weapon-fire', label: 'Weapon fire', points: 12, rep: -6 },
  { kind: 'pedestrian-hit', label: 'Pedestrian hit', points: 22, rep: -12 },
  { kind: 'cruiser-ram', label: 'Cruiser ram', points: 18, rep: -8 },
  { kind: 'roadblock-breach', label: 'Roadblock breach', points: 28, rep: -10 },
  { kind: 'shop-alarm', label: 'Shop alarm', points: 10, rep: -4 },
  { kind: 'race-finish', label: 'Race finish', points: 8, rep: 18 },
  { kind: 'mission-complete', label: 'Mission complete', points: 5, rep: 24 },
  { kind: 'arrest', label: 'Arrest', points: 30, rep: -16 },
  { kind: 'wreck', label: 'Wreck', points: 14, rep: -6 },
  { kind: 'delivery', label: 'Delivery', points: 6, rep: 12 },
  { kind: 'stunt', label: 'Stunt', points: 9, rep: 10 },
  { kind: 'stolen-car', label: 'Stolen car', points: 11, rep: -5 },
  { kind: 'speeding', label: 'Speeding', points: 6, rep: -2 },
  { kind: 'marina-heist', label: 'Marina heist', points: 26, rep: 8 },
  { kind: 'foot-chase', label: 'Foot chase', points: 15, rep: -3 },
  { kind: 'air-unit', label: 'Air unit sighting', points: 19, rep: -7 },
];

// Reputation tiers: five rows, lowest threshold first. A tier is named in the
// per-district tier map and the full row is returned by tierOf() for displays.
const REPUTATION_TIERS = [
  { name: 'UNKNOWN', min: 0, color: '#9fb4bd' },
  { name: 'WATCHED', min: 80, color: '#39e6e0' },
  { name: 'KNOWN', min: 220, color: '#5ad48a' },
  { name: 'RESPECTED', min: 480, color: '#ffc35c' },
  { name: 'LEGEND', min: 760, color: '#e8735a' },
];

// Six district descriptors. Names match the city table so rows and labels line up.
const DISTRICT_DEFS = [
  { name: 'PALM BEACH', descriptor: 'Sand, surf and low coral blocks.' },
  { name: 'MARINA', descriptor: 'Docks, boats and cold coffee.' },
  { name: 'DOWNTOWN', descriptor: 'Teal glass and money traffic.' },
  { name: 'PALM ROW', descriptor: 'Books, diners and neon signs.' },
  { name: 'CORAL HEIGHTS', descriptor: 'Hillside villas above the bay.' },
  { name: 'HILLS', descriptor: 'Switchbacks, palms and lookout.' },
];

// Street rumors: short lines mentioned by dispatch and by the pause map.
// Every line names a district and a street so the table is useful on its own.
const RUMORS = [
  'Palm Beach: a black coupe is running Palm Boulevard with no plates.',
  'Marina: two crates went missing off Marina Avenue before dawn.',
  'Downtown: the Vela Avenue towers are watching every lane tonight.',
  'Palm Row: Palma Books paid the syndicate on Palma Row and closed early.',
  'Coral Heights: a white van keeps circling Coral Avenue after dark.',
  'Hills: the lookout on Hillside Street saw a cruiser without lights.',
  'Palm Beach: Shoreline Drive is thick with patrols until midnight.',
  'Marina: the fuel dock on Dockside Street is quiet, too quiet.',
  'Downtown: Azura Street is the safe bet if the sirens wake up.',
  'Palm Row: a courier dropped a parcel on Sunset Avenue and ran.',
  'Coral Heights: villa gates on East Avenue are open for the wrong cars.',
  'Hills: West Avenue switchbacks are slick after the evening tide.',
];

const HEAT_VERSION = 1;
const HEAT_MAX = 100;
const REPUTATION_MAX = 1000;
const HEAT_DECAY = 0.45;
const STAR_HEAT = 0.3;

function districtName(district) {
  if (!district) return '';
  const raw = typeof district === 'string' ? district : district.name;
  return String(raw || '').trim().toUpperCase();
}

function tierFor(value) {
  const amount = clamp(Number(value) || 0, 0, REPUTATION_MAX);
  let row = REPUTATION_TIERS[0];
  for (const tier of REPUTATION_TIERS) if (amount >= tier.min) row = tier;
  return row;
}

function tierNamed(name) {
  const key = String(name || '').trim().toUpperCase();
  return REPUTATION_TIERS.find((row) => row.name === key) || null;
}

function descriptorFor(name) {
  const key = String(name || '').trim().toUpperCase();
  const row = DISTRICT_DEFS.find((district) => district.name === key);
  return row ? row.descriptor : 'Coast district with open streets.';
}

export class HeatSystem {
  constructor(districts = [], seed = 7) {
    const list = Array.isArray(districts) ? districts.filter((district) => districtName(district)) : [];
    this.districts = list.length ? list.slice() : DISTRICT_DEFS.slice();
    this.rng = seededRandom(Number(seed) || 7).next;
    this.heat = {}; this.reputation = {}; this.tier = {}; this.lastEvent = null;
    for (const district of this.districts) {
      const name = districtName(district);
      if (!name || this.heat[name] !== undefined) continue;
      this.heat[name] = 0; this.reputation[name] = 0; this.tier[name] = tierFor(0).name;
    }
  }

  _name(name) {
    return String(name == null ? '' : name).trim().toUpperCase();
  }

  _names() {
    const names = this.districts.map((district) => districtName(district)).filter(Boolean);
    return names.length ? names : Object.keys(this.heat);
  }

  heatOf(name) {
    const value = Number(this.heat[this._name(name)]);
    return Number.isFinite(value) ? clamp(value, 0, HEAT_MAX) : 0;
  }
  reputationOf(name) {
    const value = Number(this.reputation[this._name(name)]);
    return Number.isFinite(value) ? clamp(value, 0, REPUTATION_MAX) : 0;
  }

  tierOf(name) {
    return tierFor(this.reputationOf(name));
  }

  addCrime(district, kind, amount) {
    const name = this._name(district) || this._names()[0] || 'PALM BEACH';
    const event = CRIME_EVENTS.find((row) => row.kind === kind) || { kind: String(kind || 'incident'), label: 'Incident', points: 5, rep: -1 };
    const passed = amount !== undefined && amount !== null && Number.isFinite(Number(amount)), points = passed ? Number(amount) : event.points;
    this.heat[name] = clamp(this.heatOf(name) + points, 0, HEAT_MAX);
    this.addReputation(name, event.rep);
    this.lastEvent = { kind: event.kind, district: name, points, label: event.label };
    return this.lastEvent;
  }

  addReputation(district, amount) {
    const name = this._name(district) || this._names()[0];
    if (!name) return 0;
    if (this.heat[name] === undefined) this.heat[name] = 0; const delta = Number(amount);
    this.reputation[name] = clamp(this.reputationOf(name) + (Number.isFinite(delta) ? delta : 0), 0, REPUTATION_MAX);
    this.tier[name] = tierFor(this.reputation[name]).name;
    return this.reputation[name];
  }

  decay(dt) {
    const step = Math.max(0, Number(dt) || 0);
    for (const name of this._names()) {
      this.heat[name] = clamp(this.heatOf(name) - step * HEAT_DECAY, 0, HEAT_MAX); this.tier[name] = tierFor(this.reputationOf(name)).name;
    }
    return this.hottest();
  }

  update(dt, ctx = {}) {
    this.decay(dt);
    const context = ctx && typeof ctx === 'object' ? ctx : {};
    const game = context.game && typeof context.game === 'object' ? context.game : {};
    const police = context.police || game.police || null, wanted = police && police.wanted ? police.wanted : police;
    const stars = clamp(Math.round(Number(wanted && wanted.stars) || 0), 0, 5);
    const player = context.player || game.player || null;
    const district = context.district || (player && player.district) || game.district || this._names()[0]; const name = this._name(district);
    if (stars > 0 && name) {
      if (this.heat[name] === undefined) this.heat[name] = 0;
      this.heat[name] = clamp(this.heatOf(name) + stars * STAR_HEAT * Math.max(0, Number(dt) || 0), 0, HEAT_MAX);
      this.tier[name] = tierFor(this.reputationOf(name)).name;
    }
    return this.hottest();
  }

  hottest() {
    const list = this.rows();
    return list.length ? list[0] : { name: '', heat: 0, reputation: 0, tier: tierFor(0).name, descriptor: '' };
  }

  rows() {
    return this._names().map((name) => ({
      name, heat: this.heatOf(name),
      reputation: this.reputationOf(name),
      tier: this.tierOf(name).name, tierRow: this.tierOf(name),
      descriptor: descriptorFor(name),
    })).sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name));
  }

  labelFor(name) {
    const key = this._name(name) || 'VELA CITY';
    return `${key}\n${descriptorFor(key)}`;
  }

  rumor() {
    return RUMORS[Math.floor(this.rng() * RUMORS.length)];
  }

  serialize() {
    const heat = {}, reputation = {}, tier = {};
    for (const name of this._names()) {
      heat[name] = this.heatOf(name);
      reputation[name] = this.reputationOf(name);
      tier[name] = this.tierOf(name).name;
    }
    return { version: HEAT_VERSION, heat, reputation, tier };
  }

  restore(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (data.version != null && Number(data.version) !== HEAT_VERSION) return false;
    let applied = false;
    if (data.heat && typeof data.heat === 'object') {
      for (const name of this._names()) {
        const value = Number(data.heat[name]);
        if (!Number.isFinite(value) || value < 0 || value > HEAT_MAX) continue;
        this.heat[name] = value; applied = true;
      }
    }
    if (data.reputation && typeof data.reputation === 'object') {
      for (const name of this._names()) {
        const value = Number(data.reputation[name]);
        if (!Number.isFinite(value) || value < 0 || value > REPUTATION_MAX) continue;
        this.reputation[name] = value; this.tier[name] = tierFor(value).name; applied = true;
      }
    }
    if (data.tier && typeof data.tier === 'object') {
      for (const name of this._names()) {
        const row = tierNamed(data.tier[name]);
        if (!row) continue;
        this.tier[name] = row.name; applied = true;
      }
    }
    return applied;
  }
}

export function heatBand(value) {
  const amount = clamp(Number(value) || 0, 0, 100);
  if (amount < 25) return 'calm';
  if (amount < 50) return 'warm';
  if (amount < 75) return 'hot';
  return 'critical';
}

export function heatColor(value) {
  const amount = clamp(Number(value) || 0, 0, 100) / 100;
  const from = amount <= 0.5 ? [57, 230, 224] : [255, 195, 92];
  const to = amount <= 0.5 ? [255, 195, 92] : [232, 115, 90];
  const mix = amount <= 0.5 ? amount * 2 : (amount - 0.5) * 2;
  const channel = (index) => Math.round(from[index] + (to[index] - from[index]) * mix);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}
