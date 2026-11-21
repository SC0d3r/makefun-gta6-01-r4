// Audio module: synthesizes the engine, siren and radio beds that play during the frozen entry.
// Audio pass: engine, siren and city beds frozen for the r7 entry.
// WebAudio synthesis only — no files. A V8 engine drone tied to speed, a two-tone siren,
// filtered-noise gunshots and footsteps, UI clicks, and an original three-chord sunset loop
// across Coral 88 FM, Palma Wave, Vela Soul and Night Tide. Starts on the first gesture.
// r13 city-systems pass: the audio mix is unchanged.

import { RADIO_STATIONS } from './config.js';
import { clamp } from './rng.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.master = null;
    this.engine = null;
    this.sirenNode = null;
    this.chordTimer = 0;
    this.chordIndex = 0;
    this.radioOn = true;
    this.muted = false;
    this.noise = null;
    this.radio = new RadioStations();
    this.attach();
  }

  attach() {
    const once = () => { this.start(); };
    addEventListener('pointerdown', once, { once: true });
    addEventListener('keydown', once, { once: true });
  }

  start() {
    if (this.started) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.chordTimer = 0;
      this.chordIndex = 0;
      this.started = true;
      this.startEngine();
    } catch (e) {
      this.ctx = null;
    }
  }

  makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.8);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    sub.type = 'square';
    osc.frequency.value = 62;
    sub.frequency.value = 31;
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 2;
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    sub.start();
    this.engine = { osc, sub, filter, gain };
  }

  setEngine(speed = 0, active = true) {
    if (!this.engine) return;
    const norm = clamp(Math.abs(speed) / 46, 0, 1);
    const f = 46 + norm * 130;
    const now = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(f, now, 0.08);
    this.engine.sub.frequency.setTargetAtTime(f * 0.5, now, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + norm * 900, now, 0.1);
    this.engine.gain.gain.setTargetAtTime(active ? 0.055 + norm * 0.16 : 0, now, 0.12);
  }

  playSiren(on = true) {
    if (!this.ctx) return;
    if (on && !this.sirenNode) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 760;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      this.sirenNode = { osc, gain, phase: 0 };
    }
    if (!on && this.sirenNode) {
      this.sirenNode.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      const node = this.sirenNode;
      setTimeout(() => { try { node.osc.stop(); } catch (e) {} }, 400);
      this.sirenNode = null;
    }
  }

  playGunshot(volume = 0.5) {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700 + Math.random() * 500;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.28 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.18);
  }

  playFootstep() {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
    src.stop(now + 0.09);
  }

  click() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 620;
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  update(dt, game) {
    if (!this.ctx || this.muted) return;
    const car = game.player?.inVehicle;
    this.setEngine(car ? car.speed : 0, !!car);
    const siren = game.police?.wanted?.stars > 0 && game.police.units.some((u) => !u.dead && u.vehicle.lightsOn);
    this.playSiren(!!siren);
    if (this.sirenNode) {
      this.sirenNode.phase += dt * 1.6;
      this.sirenNode.osc.frequency.setTargetAtTime(this.sirenNode.phase % 1 < 0.5 ? 730 : 960, this.ctx.currentTime, 0.05);
      this.sirenNode.gain.gain.setTargetAtTime(0.025, this.ctx.currentTime, 0.1);
    }
    if (this.radioOn) {
      this.chordTimer -= dt;
      if (this.chordTimer <= 0) {
        this.chordTimer = 2.2;
        this.playChord(this.radio.current());
      }
    }
  }

  playChord(station) {
    if (!this.ctx) return;
    const sets = {
      synthwave: [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]],
      surf: [[196, 246.94, 329.63], [220, 277.18, 329.63], [174.61, 220, 293.66]],
      soul: [[130.81, 196, 246.94], [146.83, 220, 293.66], [110, 164.81, 261.63]],
      dusk: [[164.81, 207.65, 246.94], [146.83, 185, 246.94], [130.81, 196, 246.94]],
    };
    const chords = sets[station.mood] || sets.synthwave;
    const chord = chords[this.chordIndex % chords.length];
    this.chordIndex++;
    const now = this.ctx.currentTime;
    for (const freq of chord) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.014, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 2.0);
    }
  }

  toggleRadio() { this.radio.next(); this.playChord(this.radio.current()); }
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.22;
  }
}

export class RadioStations {
  constructor() {
    this.stations = RADIO_STATIONS;
    this.index = 0;
  }

  current() { return this.stations[this.index % this.stations.length]; }
  next() { this.index = (this.index + 1) % this.stations.length; return this.current(); }
  tune(i) { this.index = i % this.stations.length; return this.current(); }
  name() { return this.current().name; }
  track() { return this.current().track; }
  list() { return this.stations.map((s) => `${s.freq} ${s.name}`); }
}

export function startEngine(audio, vehicle) {
  audio.startEngine(vehicle);
}

export function playSiren(audio, on) {
  audio.playSiren(on);
}

export function playGunshot(audio, volume) {
  audio.playGunshot(volume);
}
