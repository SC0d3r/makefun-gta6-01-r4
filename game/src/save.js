// Save pass: a guarded store for the full city state beside the existing Economy save.
// The store owns its own key and version, so the title screen keeps reading the original
// Economy record under SAVE_KEY. Every storage, JSON and game access is guarded: a missing
// localStorage, a corrupt record or a half-built game returns a value instead of throwing.
// r13 city-systems pass: the store is unchanged and used for autosave.

const DEFAULT_KEY = 'vela-city.store.v1';
const CASH_MAX = 1000000000000;

export function safeNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : Number(fallback);
  const low = Number.isFinite(Number(min)) ? Number(min) : -Infinity;
  const high = Number.isFinite(Number(max)) ? Number(max) : Infinity;
  const safe = Number.isFinite(base) ? base : 0;
  return Math.max(low, Math.min(high, safe));
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string').slice(0, 200);
}

function pointOf(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const z = Number(value.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { x, z, label: typeof value.label === 'string' ? value.label : '' };
}

function statsOf(value) {
  const stats = {};
  if (!value || typeof value !== 'object') return stats;
  for (const key of Object.keys(value).slice(0, 24)) {
    const number = Number(value[key]);
    if (Number.isFinite(number)) stats[key] = number;
  }
  return stats;
}

export class SaveStore {
  constructor(key = DEFAULT_KEY, version = 1) {
    this.key = String(key || DEFAULT_KEY);
    this.version = Math.trunc(safeNumber(version, 1, 1, 999));
    this.lastWrite = 0; this.lastReason = ''; this.writes = 0;
    this.fails = 0; this.loaded = false; this.accum = 0;
  }
  _storage() {
    try { return typeof localStorage === 'undefined' || !localStorage ? null : localStorage; }
    catch (e) { return null; }
  }
  read() {
    try {
      const store = this._storage();
      const raw = store ? store.getItem(this.key) : null;
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      this.loaded = true;
      return data;
    } catch (e) { return null; }
  }
  migrate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const source = safeNumber(raw.version, 0, 0, 9999);
    if (source > this.version) return null;
    const economy = raw.economy && typeof raw.economy === 'object' ? raw.economy : raw;
    const fields = ['cash', 'chapter', 'day', 'clock', 'completed', 'unlocked', 'stats'];
    if (!fields.some((field) => Object.prototype.hasOwnProperty.call(economy, field))) return null;
    return {
      version: this.version, savedAt: safeNumber(raw.savedAt, 0, 0, Number.MAX_SAFE_INTEGER),
      reason: typeof raw.reason === 'string' ? raw.reason : 'migrated',
      cash: safeNumber(economy.cash, 0, 0, CASH_MAX), chapter: safeNumber(economy.chapter, 1, 1, 99),
      chapterName: typeof economy.chapterName === 'string' ? economy.chapterName : 'Golden Hour',
      day: safeNumber(economy.day, 1, 1, 9999), clock: safeNumber(economy.clock, 1120, 0, 1439),
      completed: stringList(economy.completed), unlocked: stringList(economy.unlocked),
      stats: statsOf(economy.stats), radioIndex: safeNumber(raw.radioIndex, 0, 0, 99),
      heat: raw.heat && typeof raw.heat === 'object' ? raw.heat : null,
      discovered: stringList(raw.discovered), district: typeof raw.district === 'string' ? raw.district : '',
      waypoint: pointOf(raw.waypoint), muted: raw.muted === true,
    };
  }
  write(state, reason) {
    const label = typeof reason === 'string' && reason ? reason : 'manual';
    try {
      const store = this._storage();
      if (!store) { this.fails += 1; this.lastReason = label; return false; }
      const payload = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
      payload.version = this.version;
      payload.savedAt = Date.now();
      payload.reason = label;
      store.setItem(this.key, JSON.stringify(payload));
      this.lastWrite = payload.savedAt;
      this.lastReason = label;
      this.writes += 1;
      this.loaded = true;
      return true;
    } catch (e) {
      this.fails += 1;
      this.lastReason = label;
      return false;
    }
  }
  clear() {
    try { const store = this._storage(); if (store) store.removeItem(this.key); } catch (e) { /* silent */ }
    this.lastWrite = 0; this.lastReason = ''; this.writes = 0;
    this.fails = 0; this.loaded = false; this.accum = 0;
    return true;
  }
  snapshot(game) {
    const source = game && typeof game === 'object' ? game : {};
    const economy = source.economy && typeof source.economy === 'object' ? source.economy : {};
    const heat = source.heat || source.heatSystem || null;
    let heatState = null;
    try { if (heat && typeof heat.serialize === 'function') heatState = heat.serialize(); } catch (e) { heatState = null; }
    const map = source.map || source.mapSystem || null;
    let discovered = [];
    if (map && map.discovered && typeof map.discovered.add === 'function' && typeof map.discovered.forEach === 'function') {
      map.discovered.forEach((name) => { if (typeof name === 'string') discovered.push(name); });
    } else if (map && Array.isArray(map.discovered)) discovered = stringList(map.discovered);
    if (!discovered.length) discovered = stringList(source.discovered);
    const waypoint = pointOf(map && map.waypoint ? map.waypoint : source.waypoint);
    const radio = source.radioIndex != null ? source.radioIndex : source.radioStationIndex;
    return {
      version: this.version, cash: safeNumber(economy.cash, 0, 0, CASH_MAX),
      chapter: safeNumber(economy.chapter, 1, 1, 99),
      chapterName: typeof economy.chapterName === 'string' ? economy.chapterName : 'Golden Hour',
      day: safeNumber(economy.day, 1, 1, 9999), clock: safeNumber(economy.clock, 1120, 0, 1439),
      completed: stringList(economy.completed), unlocked: stringList(economy.unlocked),
      stats: statsOf(economy.stats), radioIndex: safeNumber(radio, 0, 0, 99), heat: heatState,
      discovered, district: typeof source.district === 'string' ? source.district : '',
      waypoint, muted: !!(source.audio && source.audio.muted),
    };
  }
  restore(game) {
    const raw = this.read();
    if (!raw) return '';
    const state = this.migrate(raw);
    if (!state) return '';
    const target = game && typeof game === 'object' ? game : {};
    const economy = target.economy && typeof target.economy === 'object' ? target.economy : null;
    let economyApplied = 0;
    if (economy) {
      if (Number.isFinite(Number(state.cash))) { economy.cash = safeNumber(state.cash, economy.cash, 0, CASH_MAX); economyApplied++; }
      if (Number.isFinite(Number(state.chapter))) { economy.chapter = safeNumber(state.chapter, economy.chapter, 1, 99); economyApplied++; }
      if (Number.isFinite(Number(state.day))) { economy.day = safeNumber(state.day, economy.day, 1, 9999); economyApplied++; }
      if (Number.isFinite(Number(state.clock))) { economy.clock = safeNumber(state.clock, economy.clock, 0, 1439); economyApplied++; }
      if (typeof state.chapterName === 'string') economy.chapterName = state.chapterName;
      if (Array.isArray(state.completed)) { economy.completed = state.completed.slice(); economyApplied++; }
      if (Array.isArray(state.unlocked)) { economy.unlocked = state.unlocked.slice(); economyApplied++; }
      if (state.stats && typeof state.stats === 'object') { economy.stats = { ...(economy.stats || {}), ...state.stats }; economyApplied++; }
    }
    let otherApplied = 0;
    if (Number.isFinite(Number(state.radioIndex)) && (target.radioIndex !== undefined || target.radio !== undefined)) {
      target.radioIndex = Math.max(0, Math.trunc(Number(state.radioIndex))); otherApplied++;
    }
    const heat = target.heat || target.heatSystem || null;
    if (heat && typeof heat.restore === 'function' && state.heat) {
      try { if (heat.restore(state.heat)) otherApplied++; } catch (e) { /* keep the store silent */ }
    }
    const map = target.map || target.mapSystem || null;
    if (map && Array.isArray(state.discovered) && state.discovered.length) {
      if (map.discovered && typeof map.discovered.add === 'function') {
        for (const name of state.discovered) map.discovered.add(name);
        otherApplied++;
      } else if (Array.isArray(map.discovered)) { map.discovered = state.discovered.slice(); otherApplied++; }
    }
    if (state.waypoint && map) {
      if (typeof map.setWaypoint === 'function') map.setWaypoint(state.waypoint, state.waypoint.label);
      else map.waypoint = { ...state.waypoint };
      otherApplied++;
    } else if (state.waypoint && target.waypoint !== undefined) { target.waypoint = { ...state.waypoint }; otherApplied++; }
    if (typeof state.district === 'string' && state.district) { target.district = state.district; otherApplied++; }
    if (typeof state.muted === 'boolean' && target.audio && typeof target.audio === 'object') {
      target.audio.muted = state.muted; otherApplied++;
    }
    if (!economyApplied && !otherApplied) return '';
    this.loaded = true;
    const bits = [];
    if (economyApplied) bits.push(`$${safeNumber(economy && economy.cash, 0, 0, CASH_MAX)}`);
    if (otherApplied) bits.push(`${otherApplied} systems`);
    return `Restored v${state.version} · ${bits.join(' · ')}`;
  }
  summary() {
    const reason = this.lastReason || 'none';
    return `v${this.version} · writes ${this.writes} · fails ${this.fails} · ${reason}`;
  }
  shouldAutosave(dt, interval = 20) {
    const step = Number(dt);
    const wait = Number(interval);
    if (!Number.isFinite(step) || step <= 0) return false;
    this.accum += step;
    const limit = Number.isFinite(wait) && wait > 0 ? wait : 20;
    if (this.accum < limit) return false;
    this.accum = 0;
    return true;
  }
}
