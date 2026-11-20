// Radio pass: four coast stations, their dispatch desks and a signal model.
// The dial sits beside the existing RADIO_STATIONS table and only adds presentation data,
// so every station keeps the name, freq, track, color and mood fields the HUD already reads.
// r13 city-systems pass: the dial is unchanged and driven by main.js.

import { seededRandom, clamp } from './rng.js';

// Station table: one row per RADIO_STATIONS entry, matched by name or by index.
// Each desk adds the on-air identity the dial speaks: call sign, band, bed and tempo.
// Dispatch tables below hold six to eight short lines each, all free of em dashes.
const STATION_TABLE = [
  {
    name: 'Coral 88 FM',
    callSign: 'KCRL',
    band: 'FM',
    bed: 'Sunset Static',
    bpm: 112,
  },

  {
    name: 'Palma Wave',
    callSign: 'KPWV',
    band: 'FM',
    bed: 'Golden Tide',
    bpm: 104,
  },

  {
    name: 'Vela Soul',
    callSign: 'KVLS',
    band: 'FM',
    bed: 'Marisol Nights',
    bpm: 92,
  },

  {
    name: 'Night Tide',
    callSign: 'KNTD',
    band: 'FM',
    bed: 'Neon Buoy',
    bpm: 118,
  },

];

// Dispatch tables: placeholders are filled by dispatchLine(ctx).
// Tokens: {district}, {road}, {stars}, {weather} and {traffic}.
const DISPATCH_TABLES = [
  [
    '{district} traffic is heavy on {road}. Keep the coast lane open.',
    'Light weather front over {district}. Roads are slick on {road}.',
    'Wanted level {stars} in {district}. All units watch the {road} exits.',
    'Palm Beach cruise traffic is stacking near the pier. Use the boulevard.',
    'Wind and spray across {road}. Reduce speed through the marina bend.',
    'Dispatch desk, quiet night. Hold the dial on Coral 88.',
    'Coral Heights reports broken lights on {road}. Traffic is single lane.',
    'Wanted level {stars} rolling through Palma Row. Keep the radio clear.',
  ],

  [
    'Surf traffic on {road} is slowing near {district}. Watch the crosswalk.',
    'Clear skies over {district}. A clean run down {road} tonight.',
    '{district} units, wanted level {stars}. Roadblock forming on {road}.',
    'Marina traffic is heavy at the fuel dock. Keep the lane clear for patrol.',
    'High tide and wet sand on {road}. Easy on the brakes.',
    'Palma Wave desk. Traffic is light from Palm Row to the beach.',
    'Wanted level {stars} near Coral Heights. Units are moving north.',
    'Hills roads are foggy at the lookout. Use low beams on {road}.',
  ],

  [
    'Downtown traffic is crawling on {road}. Take the side streets.',
    'Warm weather over {district}. Open the windows and keep the bass low.',
    'Wanted level {stars} in {district}. Dispatch, send the nearest cruiser.',
    'Palm Row diners are spilling onto {road}. Watch for pedestrians.',
    'Rain moving in from the marina. {road} is shiny and slick.',
    'Vela Soul desk. The boulevard is clear from the towers to the sand.',
    'Hills traffic is one lane on {road}. A delivery van is stalled.',
    'Wanted level {stars} near the marina docks. Hold the {road} bridge.',
  ],

  [
    'Night traffic on {road} is running fast through {district}.',
    'Fog on the hills and wet roads below. Slow down on {road}.',
    'Wanted level {stars}. Every unit in {district} is rolling.',
    'Coral Heights traffic is backed up at the {road} light.',
    'Sea wind and salt spray on {road}. Keep both hands on the wheel.',
    'Night Tide desk. The marina is quiet and the boulevard is open.',
    'Wanted level {stars} on {road}. Set a rolling block south of downtown.',
    'Palm Beach traffic is heavy near the safehouse. Use the beach lane.',
  ],

];

// Every table entry is plain text, so the HUD can show it without parsing.
// The dial rotates one entry every 12 to 18 seconds through the seeded rng.
const FALLBACK_DISPATCH = 'Dispatch desk. Keep the coast clear and the dial warm.';

export function bandOf(freq) {
  const n = Number(freq);
  if (!Number.isFinite(n)) return 'FM';
  if (n >= 162 && n <= 163) return 'WB';
  if (n >= 87 && n <= 108) return 'FM';
  return 'AM';
}

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, 1);
}

export class RadioDial {
  constructor(stations = [], seed = 7) {
    this.stations = Array.isArray(stations) ? stations : [];
    this.index = 0;
    this._seedRng = seededRandom(Number(seed) || 1);
    this.rng = this._seedRng.next;
    this.signal = 0.9;
    this.static = 0.08;
    this.tunedAt = 0;
    this.dispatchIndex = 0;
    this.dispatchTimer = this._dispatchDelay();
    this._desk = STATION_TABLE[0];
    this._dispatch = FALLBACK_DISPATCH;
    this.current = null;
    this._buildCurrent();
  }

  _dispatchDelay() {
    return 12 + this.rng() * 6;
  }

  _deskFor(station, index) {
    const name = station && station.name;
    for (const desk of STATION_TABLE) {
      if (name && desk.name === name) return desk;
    }
    return STATION_TABLE[index % STATION_TABLE.length] || STATION_TABLE[0];
  }

  _dispatchTableFor(index) {
    return DISPATCH_TABLES[index % DISPATCH_TABLES.length] || DISPATCH_TABLES[0];
  }

  _buildCurrent() {
    const base = this.stations[this.index] || {};
    const desk = this._deskFor(base, this.index);
    const table = this._dispatchTableFor(this.index);
    this._desk = desk;
    if (this.dispatchIndex >= table.length) this.dispatchIndex = 0;
    this._dispatch = table[this.dispatchIndex] || FALLBACK_DISPATCH;
    this.current = {
      ...base,
      callSign: desk.callSign,
      band: desk.band || bandOf(base.freq),
      bed: desk.bed || base.track || 'Coast Bed',
      bpm: desk.bpm || 100,
      dispatch: this._dispatch,
      dispatchTable: table.slice(),
    };
    return this.current;
  }

  tune(step) {
    const count = this.stations.length || STATION_TABLE.length;
    const move = Number.isFinite(Number(step)) ? Math.trunc(Number(step)) : 1;
    this.index = ((this.index + move) % count + count) % count;
    this.signal = 0.9;
    this.static = 0.08;
    this.dispatchIndex = 0;
    this.dispatchTimer = this._dispatchDelay();
    return this._buildCurrent();
  }

  setStation(index) {
    const count = this.stations.length || STATION_TABLE.length;
    const n = Number(index);
    this.index = (((Number.isFinite(n) ? Math.trunc(n) : 0) % count) + count) % count;
    this.signal = 0.9;
    this.static = 0.08;
    this.dispatchIndex = 0;
    this.dispatchTimer = this._dispatchDelay();
    return this._buildCurrent();
  }

  update(dt, ctx = {}) {
    ctx = ctx || {};
    const step = Math.max(0, Number(dt) || 0);
    this.tunedAt += step;
    const vehicle = ctx.player && ctx.player.inVehicle;
    const speed = Math.abs(Number(ctx.speed != null ? ctx.speed : vehicle ? vehicle.speed : 0)) || 0;
    const speedDip = clamp01(speed / 55) * 0.32;
    const underground = ctx.underground || ctx.tunnel || ctx.inTunnel || ctx.subway ? 0.36 : 0;
    const wave = Math.sin(this.tunedAt * 0.55 + this.index * 1.7) * 0.1;
    const slow = Math.sin(this.tunedAt * 0.17 + this.index) * 0.05;
    this.signal = clamp01(0.82 + wave + slow - speedDip - underground);
    this.static = clamp01(1.05 - this.signal * 1.18);
    this.dispatchTimer -= step;
    if (this.dispatchTimer <= 0) {
      this.dispatchTimer = this._dispatchDelay();
      const table = this._dispatchTableFor(this.index);
      const span = Math.max(1, table.length - 1);
      this.dispatchIndex = (this.dispatchIndex + 1 + Math.floor(this.rng() * span)) % table.length;
      this.current.dispatch = table[this.dispatchIndex] || FALLBACK_DISPATCH;
    }
    return this.current;
  }

  stationLine() {
    const cur = this.current || {};
    const bed = cur.bed || cur.track || 'Coast Bed';
    return `${cur.callSign || 'VELA'} · ${cur.freq || '88.1'} ${cur.band || 'FM'} · ${String(bed).toUpperCase()}`;
  }

  nowPlaying() {
    const cur = this.current || {};
    const track = cur.track || cur.bed || 'Coast Bed';
    return `${cur.callSign || 'VELA'} · ${track} · ${cur.bpm || 100} BPM`;
  }

  dispatchLine(ctx = {}) {
    ctx = ctx || {};
    const raw = (this.current && this.current.dispatch) || this._dispatch || FALLBACK_DISPATCH;
    const district = ctx.district || (ctx.game && ctx.game.district) || 'VELA CITY';
    const wanted = ctx.wanted || (ctx.game && ctx.game.police && ctx.game.police.wanted);
    const stars = Number(ctx.stars != null ? ctx.stars : wanted ? wanted.stars : 0) || 0;
    const road = ctx.road || ctx.street || 'Palm Boulevard';
    const weather = ctx.weather || 'clear skies';
    const traffic = ctx.traffic || 'steady traffic';
    const line = String(raw)
      .replace(/\{district\}/g, String(district))
      .replace(/\{road\}/g, String(road))
      .replace(/\{stars\}/g, String(Math.max(0, Math.round(stars))))
      .replace(/\{weather\}/g, String(weather))
      .replace(/\{traffic\}/g, String(traffic));
    return line.trim() || FALLBACK_DISPATCH;
  }

  emergencyLine(stars, district) {
    const level = Number(stars) || 0;
    if (level < 3) return '';
    const where = district || 'VELA CITY';
    return `POLICE BAND · ${where} · CODE 3 · ${Math.min(5, Math.round(level))} STARS`;
  }

  signalBars() {
    return Math.max(0, Math.min(4, Math.round(this.signal * 4)));
  }

  dialLabel() {
    const cur = this.current || {};
    return `${cur.freq || '88.1'} ${cur.band || bandOf(cur.freq)}`;
  }
}
