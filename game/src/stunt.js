// Stunt pass: named moves, combo scoring and rank progress for VELA CITY.
// This module only computes score, callouts and HUD-ready rows. The main loop and HUD are wired
// by a later pass, so nothing here touches the DOM, the scene or any existing module export.

import { seededRandom, clamp } from './rng.js';

// Stunt table: one row for every move the scoring pass can award.
// Points are base values before the combo multiplier, so a clean run grows quickly.
const STUNT_TABLE = [
  { id: 'air-time', name: 'air time', points: 220 },
  { id: 'big-air', name: 'big air', points: 700 },
  { id: 'clean-landing', name: 'clean landing', points: 300 },
  { id: 'hard-landing', name: 'hard landing', points: 120 },
  { id: 'near-miss', name: 'near miss', points: 450 },
  { id: 'drift', name: 'drift', points: 160 },
  { id: '180', name: '180', points: 500 },
  { id: '360', name: '360', points: 1100 },
  { id: 'two-wheel', name: 'two wheel', points: 650 },
  { id: 'police-jump', name: 'police jump', points: 900 },
  { id: 'ramp-chain', name: 'ramp chain', points: 1300 },
];

// Rank table: five named steps from a first spill to a coast legend.
const RANKS = [
  { name: 'ROOKIE', threshold: 0 },
  { name: 'WHEELMAN', threshold: 1500 },
  { name: 'SHOWBOAT', threshold: 4000 },
  { name: 'COAST LEGEND', threshold: 9000 },
  { name: 'VELA ICON', threshold: 18000 },
];

// Callout table: short lines the HUD can show beside an awarded move.
// The list stays plain text and free of em dashes so it reads cleanly at 768 px.
const CALLOUTS = [
  'THE COAST SAW THAT',
  'SEND IT',
  'CLEAN WORK, RICO',
  'THAT IS HOW IT IS DONE',
  'PALM BEACH APPLAUSE',
  'KEEP THE WHEELS DOWN',
  'SIDEWALK LEGEND',
  'MARISOL WILL HEAR ABOUT THIS',
  'NO SIRENS, ALL STYLE',
  'GOLDEN HOUR GOLD',
  'BOULEVARD BUSINESS',
  'THAT ONE COUNTED',
  'SHAKE IT OFF',
  'ONE MORE FOR THE COAST',
  'THE CITY IS WATCHING',
];

// Near misses use a four metre shell at traffic speed. The combo window and history limit
// keep the HUD rows short, while the landing checks below decide a clean award or a bail.
// A drift pulse needs real slip and speed, so parking-lot turns never farm points.
// Hard landings keep a small award until the speed and air time cross the bail line.
const NEAR_MISS_RADIUS = 4;
const NEAR_MISS_SPEED = 5;
const COMBO_WINDOW = 6;
const HISTORY_LIMIT = 12;

export class StuntSystem {
  constructor(seed = 7) {
    this.rng = seededRandom(Number(seed) || 1);
    this.score = 0; this.combo = 0; this.comboTimer = 0; this.bestCombo = 0;
    this.airTime = 0; this.lastAir = 0; this.totalAir = 0;
    this.nearMisses = 0; this.lands = 0; this.bails = 0;
    this.rank = this.rankFor(0); this.lastMove = 'ready'; this.lastCallout = '';
    this.history = []; this._airborne = false; this._spinAwarded = 0;
    this._nearFlags = new Set(); this._driftTimer = 0; this._elapsed = 0;
  }
  _vehicle(ctx) { return ctx ? (ctx.vehicle || (ctx.player && ctx.player.inVehicle) || null) : null; }
  _isAirborne(vehicle, ctx) {
    if (vehicle.airborne || ctx.airborne || vehicle.grounded === false) return true;
    const y = Number(vehicle.pos?.y ?? vehicle.y ?? 0);
    return y > Number(ctx.groundY ?? 0.35) + 0.45;
  }
  _points(id) { const row = STUNT_TABLE.find((stunt) => stunt.id === id); return row ? row.points : 0; }
  _callout() { return this.rng.pick(CALLOUTS); }
  update(dt, ctx = {}) {
    ctx = ctx || {};
    const step = Math.max(0, Number(dt) || 0);
    this._elapsed += step;
    this.comboTimer = Math.max(0, this.comboTimer - step);
    if (this.comboTimer === 0 && this.combo > 0) this.combo = 0;
    const vehicle = this._vehicle(ctx);
    let callout = '';
    if (vehicle) {
      const airborne = this._isAirborne(vehicle, ctx);
      if (airborne) {
        this.airTime += step;
        this.lastAir = this.airTime;
      } else if (this._airborne) {
        const landed = this.airTime;
        this.airTime = 0; this._airborne = false; this._spinAwarded = 0;
        if (landed >= 0.4) {
          const speed = Math.abs(Number(vehicle.speed) || 0);
          callout = this.landing(landed, landed > 2.4 || speed > 34 || !!vehicle.wrecked, { ...ctx, vehicle });
        } else { this.lastAir = landed; this.totalAir += landed; }
      }
      this._airborne = airborne;
    } else { this.airTime = 0; this._airborne = false; }
    if (!callout) callout = this.nearMiss({ ...ctx, vehicle });
    if (!callout) callout = this._detectDrift(vehicle, step, ctx);
    this.rank = this.rankFor(this.score);
    return callout || '';
  }
  _detectDrift(vehicle, dt, ctx) {
    if (!vehicle) return '';
    this._driftTimer = Math.max(0, this._driftTimer - dt);
    const speed = Math.abs(Number(vehicle.speed) || 0), slip = Math.abs(Number(vehicle.slip) || 0);
    if (speed <= 18 || slip <= 4 || this._driftTimer > 0) return '';
    this._driftTimer = 4;
    const total = this.add(this._points('drift'), 'drift', ctx);
    this.lastMove = 'drift';
    this.lastCallout = `${this._callout()} +${formatScore(total)}`;
    return this.lastCallout;
  }
  landing(airTime, hard = false, ctx = {}) {
    ctx = ctx || {};
    this._spinAwarded = 0;
    const seconds = Math.max(0, Number(airTime) || 0);
    this.airTime = 0; this.lastAir = seconds; this.totalAir += seconds;
    if (seconds < 0.4) return '';
    this.lands += 1;
    if (hard && (seconds > 3.2 || (ctx.vehicle && ctx.vehicle.wrecked))) {
      this.bails += 1;
      return this.bail('hard landing');
    }
    const move = seconds >= 2.2 ? 'big air' : 'air time';
    const base = airPoints(seconds) + (seconds >= 2.2 ? this._points('big-air') : 0);
    let total = this.add(base, move, ctx);
    total += this.add(this._points(hard ? 'hard-landing' : 'clean-landing'), hard ? 'hard landing' : 'clean landing', ctx);
    this.lastMove = move;
    this.lastCallout = `${this._callout()} +${formatScore(total)}`;
    return this.lastCallout;
  }
  nearMiss(ctx = {}) {
    ctx = ctx || {};
    const vehicle = this._vehicle(ctx);
    const traffic = ctx.traffic;
    if (!vehicle || !traffic) return '';
    const cars = Array.isArray(traffic.cars) ? traffic.cars : Array.isArray(traffic) ? traffic : [];
    if (!cars.length) return '';
    const speed = Math.abs(Number(vehicle.speed) || 0);
    if (speed < NEAR_MISS_SPEED) return '';
    const vx = Number(vehicle.pos?.x ?? vehicle.x ?? 0), vz = Number(vehicle.pos?.z ?? vehicle.z ?? 0);
    for (const car of cars) {
      if (!car) continue;
      const cx = Number(car.x ?? car.pos?.x ?? NaN), cz = Number(car.z ?? car.pos?.z ?? NaN);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
      const distance = Math.hypot(vx - cx, vz - cz);
      if (distance > NEAR_MISS_RADIUS + 4) this._nearFlags.delete(car);
      if (distance > NEAR_MISS_RADIUS || this._nearFlags.has(car)) continue;
      this._nearFlags.add(car);
      this.nearMisses += 1;
      const total = this.add(this._points('near-miss'), 'near miss', ctx);
      this.lastMove = 'near miss';
      this.lastCallout = `${this._callout()} +${formatScore(total)}`;
      return this.lastCallout;
    }
    return '';
  }
  spin(degrees, ctx = {}) {
    const value = Math.abs(Number(degrees) || 0);
    if (value < 160) return '';
    if (this._spinAwarded > 0) return '';
    const step = value >= 330 ? 360 : 180;
    this._spinAwarded = step;
    const move = step === 360 ? '360' : '180';
    const total = this.add(this._points(move), move, ctx);
    this.lastMove = move;
    this.lastCallout = `${move} SPIN +${formatScore(total)}`;
    return this.lastCallout;
  }
  bail(reason = 'bail') {
    this.bails += 1;
    this.combo = 0; this.comboTimer = 0; this._spinAwarded = 0;
    const label = String(reason || 'bail').toUpperCase();
    this.history.push({ name: `bail: ${label}`, points: 0, combo: 0, at: this._elapsed });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.lastMove = 'bail';
    this.lastCallout = `${this._callout()} ${label} +0`;
    return this.lastCallout;
  }
  add(points, move = 'move', ctx = {}) {
    const base = Math.max(0, Math.round(Number(points) || 0));
    const multiplier = this.comboMultiplier();
    const total = Math.round(base * multiplier);
    this.score += total;
    const row = STUNT_TABLE.find((stunt) => stunt.name === move);
    const name = row ? row.name : String(move || 'move');
    this.history.push({ name, points: total, combo: this.combo, at: this._elapsed + (Number(ctx && ctx.dt) || 0) });
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.lastMove = name;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = COMBO_WINDOW;
    this.rank = this.rankFor(this.score);
    return total;
  }
  comboMultiplier() { return clamp(1 + Math.floor(this.combo / 2), 1, 5); }
  rankFor(score) {
    const value = Number(score) || 0;
    let row = RANKS[0];
    for (const rank of RANKS) if (value >= rank.threshold) row = rank;
    return row;
  }
  _nextRank() { for (const rank of RANKS) if (this.score < rank.threshold) return rank; return null; }
  summary() {
    const combo = this.comboMultiplier();
    const next = this._nextRank();
    const line1 = `STUNTS · ${formatScore(this.score)} · COMBO x${combo}`;
    const line2 = next
      ? `${this.rank.name} · BEST x${this.bestCombo} · ${formatScore(next.threshold - this.score)} TO ${next.name}`
      : `${this.rank.name} · BEST x${this.bestCombo} · MAX RANK`;
    return `${line1}\n${line2}`;
  }
  rows() { return this.history.slice(-4).map((entry) => ({ name: entry.name, points: entry.points })); }
  serialize() {
    return {
      score: this.score, combo: this.combo, bestCombo: this.bestCombo,
      lastAir: this.lastAir, totalAir: this.totalAir,
      nearMisses: this.nearMisses, lands: this.lands, bails: this.bails,
      history: this.history.slice(-HISTORY_LIMIT).map((entry) => ({ ...entry })),
    };
  }
  restore(data) {
    try {
      if (!data || typeof data !== 'object') return false;
      const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
      this.score = Math.max(0, Math.round(number(data.score, 0)));
      this.combo = Math.max(0, Math.round(number(data.combo, 0)));
      this.bestCombo = Math.max(this.combo, Math.round(number(data.bestCombo, 0)));
      this.lastAir = Math.max(0, number(data.lastAir, 0));
      this.totalAir = Math.max(0, number(data.totalAir, 0));
      this.nearMisses = Math.max(0, Math.round(number(data.nearMisses, 0)));
      this.lands = Math.max(0, Math.round(number(data.lands, 0)));
      this.bails = Math.max(0, Math.round(number(data.bails, 0)));
      if (Array.isArray(data.history)) {
        this.history = data.history.slice(-HISTORY_LIMIT).map((entry) => ({
          name: String((entry && entry.name) || 'move'),
          points: Math.max(0, Math.round(Number(entry && entry.points) || 0)),
          combo: Math.max(0, Math.round(Number(entry && entry.combo) || 0)),
          at: Number(entry && entry.at) || 0,
        }));
      }
      this.rank = this.rankFor(this.score);
      this.lastMove = this.history.length ? this.history[this.history.length - 1].name : 'ready';
      this.lastCallout = '';
      return true;
    } catch (error) { return false; }
  }
}

export function airPoints(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 0.4) return 0;
  const base = Math.round(value * 220);
  const bonus = value >= 2 ? Math.round((value - 2) * 140) : 0;
  return base + bonus;
}

export function formatScore(value) {
  const amount = Math.round(Number(value) || 0);
  return amount.toLocaleString('en-US');
}
