// Progression pass: unlocks and stats frozen for the r7 entry.
// Cash, chapter, clock and unlocks, with a real localStorage save so the title screen can offer
// Continue with a line like "Ch. 2 Paper Moon - $31,420 - Day 3, 18:40" beside New Game.
// r13 city-systems pass: economy saves are unchanged.

import { SAVE_KEY, MISSION_DEFS } from './config.js';

export class Economy {
  constructor() {
    this.cash = 1240;
    this.chapter = 1;
    this.chapterName = 'Golden Hour';
    this.day = 1;
    this.clock = 18 * 60 + 40;
    this.completed = [];
    this.unlocked = ['courier-run'];
    this.stats = { missions: 0, races: 0, deliveries: 0, stars: 0, distance: 0, wrecks: 0 };
    this.ledger = [];
    this.loaded = false;
    this.loadSave();
  }

  addCash(amount, source = 'cash') {
    this.cash = Math.max(0, Math.round(this.cash + amount));
    this.ledger.push({ amount, source, at: Date.now() });
    if (this.ledger.length > 20) this.ledger.shift();
    this.saveGame();
  }

  spend(amount) {
    if (this.cash < amount) return false;
    this.cash -= amount;
    this.saveGame();
    return true;
  }

  updateChapterFromMissions() {
    let n = 1;
    let name = 'Golden Hour';
    for (let i = 0; i < MISSION_DEFS.length; i++) {
      if (this.completed.includes(MISSION_DEFS[i].id)) { n = Math.min(i + 2, MISSION_DEFS.length); name = MISSION_DEFS[Math.min(i + 1, MISSION_DEFS.length - 1)].chapter.replace(/^CH\. \d+ /, '').replace(/\b\w/g, (c) => c + c.toLowerCase().slice(1)); }
    }
    if (this.completed.length === 0) { n = 1; name = 'Golden Hour'; }
    if (this.completed.length === MISSION_DEFS.length) { n = 3; name = 'Neon Tide'; }
    this.chapter = n;
    this.chapterName = name;
  }

  isUnlocked(id) {
    return this.unlocked.includes(id);
  }

  unlockMission(id) {
    if (!this.unlocked.includes(id)) this.unlocked.push(id);
    this.updateChapterFromMissions();
  }

  completeMission(id) {
    if (!this.completed.includes(id)) this.completed.push(id);
    this.stats.missions = this.completed.length;
    this.updateChapterFromMissions();
  }

  isComplete(id) {
    return this.completed.includes(id);
  }

  advanceClock(minutes) {
    this.clock += minutes;
    while (this.clock >= 24 * 60) { this.clock -= 24 * 60; this.day++; }
  }

  clockText() {
    const h = Math.floor(this.clock / 60) % 24;
    const m = Math.floor(this.clock % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  chapterLabel() {
    return `CH. ${this.chapter} ${this.chapterName.toUpperCase()}`;
  }

  continueLine() {
    return `Ch. ${this.chapter} ${this.chapterName} - $${this.cash.toLocaleString('en-US')} - Day ${this.day}, ${this.clockText()}`;
  }

  saveGame(extra = {}) {
    try {
      const data = {
        version: 1, cash: this.cash, chapter: this.chapter, chapterName: this.chapterName,
        day: this.day, clock: this.clock, completed: this.completed, unlocked: this.unlocked,
        stats: this.stats, savedAt: Date.now(), ...extra,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.loaded = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return false;
      this.cash = Number(data.cash) || 1240;
      this.chapter = Number(data.chapter) || 1;
      this.chapterName = data.chapterName || 'Golden Hour';
      this.day = Number(data.day) || 1;
      this.clock = Number(data.clock) || 1120;
      this.completed = Array.isArray(data.completed) ? data.completed : [];
      this.unlocked = Array.isArray(data.unlocked) && data.unlocked.length ? data.unlocked : ['courier-run'];
      this.stats = { ...this.stats, ...(data.stats || {}) };
      this.loaded = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  newGame() {
    this.cash = 1240;
    this.chapter = 1;
    this.chapterName = 'Golden Hour';
    this.day = 1;
    this.clock = 18 * 60 + 40;
    this.completed = [];
    this.unlocked = ['courier-run'];
    this.stats = { missions: 0, races: 0, deliveries: 0, stars: 0, distance: 0, wrecks: 0 };
    this.ledger = [];
    this.saveGame();
  }
}

export function saveGame(economy, extra) {
  return economy.saveGame(extra);
}

export function loadGame(economy) {
  return economy.loadSave();
}

export function unlockMission(economy, id) {
  economy.unlockMission(id);
}

export function loadSave(economy) {
  return economy.loadSave();
}

export function addCash(economy, amount, source) {
  economy.addCash(amount, source);
}
