/**
 * District dossier and incident log for the paused city page.
 * It watches discoveries, heat bands, stunts, missions, radio moves,
 * police attention and day changes, then draws the full-screen file.
 * r17 wiring pass: the HUD opens this page on Tab and shows its ticker while playing.
 */
import { DISTRICTS, PALETTE } from './config.js';
import { heatBand, heatColor } from './heat.js';
import { clamp } from './rng.js';
function formatClock(value) {
  const minutes = Number.isFinite(value) ? Math.floor(value) : 0;
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0');
}
function keepParts(parts) {
  return parts.filter((part) => part !== undefined && part !== null && String(part).trim() !== '');
}
function fitText(ctx, text, maxWidth) {
  const raw = String(text === undefined || text === null ? '' : text);
  if (maxWidth <= 0 || ctx.measureText(raw).width <= maxWidth) return raw;
  let cut = raw;
  while (cut.length > 0 && ctx.measureText(cut + '...').width > maxWidth) cut = cut.slice(0, -1);
  return cut.length > 0 ? cut + '...' : '';
}
function readDiscovered(game) {
  const source = game && game.map ? game.map.discovered : null;
  if (!source) return [];
  if (Array.isArray(source)) return source.filter((name) => typeof name === 'string');
  if (typeof source.forEach === 'function') {
    const names = [];
    source.forEach((name) => { if (typeof name === 'string') names.push(name); });
    return names;
  }
  return [];
}
function readHeat(game, name) {
  if (!game || !game.heat || typeof game.heat.heatOf !== 'function') return 0;
  const value = game.heat.heatOf(name);
  return Number.isFinite(value) ? clamp(value, 0, 100) : 0;
}
function readTierName(game, name) {
  if (!game || !game.heat || typeof game.heat.tierOf !== 'function') return 'UNKNOWN';
  const tier = game.heat.tierOf(name);
  return tier && typeof tier.name === 'string' && tier.name ? tier.name : 'UNKNOWN';
}
function readReputation(game, name) {
  if (!game || !game.heat || typeof game.heat.reputationOf !== 'function') return 0;
  const value = game.heat.reputationOf(name);
  return Number.isFinite(value) ? clamp(value, 0, 1000) : 0;
}
function readStuntScore(game) {
  const value = game && game.stunts ? game.stunts.score : 0;
  return Number.isFinite(value) ? value : 0;
}
function readCompleted(game) {
  const completed = game && game.economy ? game.economy.completed : null;
  return Array.isArray(completed) ? completed : [];
}
function snapshotOf(game) {
  const bands = {};
  for (const district of DISTRICTS) bands[district.name] = heatBand(readHeat(game, district.name));
  return {
    discovered: readDiscovered(game),
    bands,
    stuntStep: Math.floor(readStuntScore(game) / 250),
    missions: readCompleted(game).length,
    radioIndex: game && game.radioDial && Number.isFinite(game.radioDial.index) ? game.radioDial.index : -1,
    wanted: game && game.police && game.police.wanted && Number.isFinite(game.police.wanted.stars) ? game.police.wanted.stars : 0,
    day: game && game.economy && Number.isFinite(game.economy.day) ? game.economy.day : 0,
  };
}
export class DistrictDossier {
  constructor(seed = 7) {
    this.seed = seed;
    this.clock = 18 * 60 + 40;
    this.incidents = [];
    this.scanTimer = 0;
    this.last = { discovered: [], bands: {}, stuntStep: 0, missions: 0, radioIndex: -1, wanted: 0, day: 0 };
    this.pending = { primed: false };
  }
  record(kind, district, detail) {
    const newest = this.incidents[0];
    if (newest && newest.kind === kind && newest.district === district && this.clock - newest.at <= 5) return;
    this.incidents.unshift({ at: this.clock, kind, district, detail });
    if (this.incidents.length > 12) this.incidents.length = 12;
  }
  clockText() {
    return formatClock(this.clock);
  }
  poll(dt, game) {
    const source = game && typeof game === 'object' ? game : {};
    const economy = source.economy && typeof source.economy === 'object' ? source.economy : null;
    const step = Number.isFinite(dt) ? dt : 0;
    if (economy && Number.isFinite(economy.clock)) this.clock = economy.clock;
    else this.clock += step;
    this.scanTimer += step;
    if (this.scanTimer < 0.5) return;
    this.scanTimer = 0;
    const next = snapshotOf(source);
    if (!this.pending.primed) {
      this.last = next;
      this.pending.primed = true;
      return;
    }
    for (const name of next.discovered) {
      if (!this.last.discovered.includes(name)) this.record('DISCOVERY', name, 'District mapped');
    }
    for (const district of DISTRICTS) {
      const name = district.name;
      const band = next.bands[name];
      const previous = this.last.bands ? this.last.bands[name] : undefined;
      if (previous !== undefined && previous !== band) this.record('HEAT', name, 'BAND ' + band.toUpperCase());
    }
    if (next.stuntStep > this.last.stuntStep) {
      this.record('STUNT', source.district, 'Score ' + readStuntScore(source));
    }
    if (next.missions > this.last.missions) {
      const completed = readCompleted(source);
      this.record('MISSION', source.district, String(completed[completed.length - 1]));
    }
    const radio = source.radioDial;
    const radioIndex = radio && Number.isFinite(radio.index) ? radio.index : undefined;
    if (radioIndex !== undefined && radioIndex !== this.last.radioIndex) {
      const station = radio.stations && radio.stations[radioIndex];
      const detail = station && typeof station.name === 'string' && station.name.trim() ? station.name : 'Dial ' + radioIndex;
      this.record('RADIO', source.district, detail);
    }
    const wanted = source.police && source.police.wanted ? source.police.wanted.stars : undefined;
    if (Number.isFinite(wanted) && wanted !== this.last.wanted) this.record('WANTED', source.district, wanted + ' stars');
    if (next.day > this.last.day) this.record('DAY', source.district, 'Day ' + next.day);
    this.last = next;
  }
  // Score formula: Math.round((discovered ? 120 : 0) + heat * 2 + reputation / 10).
  rows(game) {
    const source = game && typeof game === 'object' ? game : {};
    const map = source.map;
    const discoveredSet = map && map.discovered && typeof map.discovered.has === 'function' ? map.discovered : null;
    return DISTRICTS.map((district) => {
      const name = district.name;
      const discovered = discoveredSet ? discoveredSet.has(name) : false;
      const heat = readHeat(source, name);
      const reputation = readReputation(source, name);
      const score = Math.round((discovered ? 120 : 0) + heat * 2 + reputation / 10);
      return { name, discovered, heat, band: heatBand(heat), tier: readTierName(source, name), reputation, missions: 0, score, current: source.district === name };
    });
  }
  rankings(game) {
    return this.rows(game).sort((a, b) => b.score - a.score).map((row, index) => ({ ...row, rank: index + 1 }));
  }
  summary(game) {
    const rows = this.rows(game);
    let hottest = null;
    let top = null;
    for (const row of rows) {
      if (!hottest || row.heat > hottest.heat) hottest = row;
      if (!top || row.reputation > top.reputation) top = row;
    }
    return {
      discovered: rows.filter((row) => row.discovered).length,
      total: rows.length,
      hottest: hottest ? hottest.name : 'NONE',
      hottestHeat: hottest ? hottest.heat : 0,
      hottestBand: hottest ? hottest.band : 'calm',
      cases: rows.length,
      incidents: this.incidents.length,
      topTier: top ? top.tier : 'UNKNOWN',
    };
  }
  latest() {
    return this.incidents.length > 0 ? this.incidents[0] : null;
  }
  logLines(limit = 8) {
    return this.incidents.slice(0, limit).map((incident) => {
      const at = Number.isFinite(incident.at) ? formatClock(incident.at) : '';
      return keepParts([at, incident.kind, incident.district, incident.detail]).join(' ').trim();
    });
  }
  tickerLine() {
    const incident = this.latest();
    if (!incident) return '';
    return keepParts([incident.kind, incident.district, incident.detail]).join(' ').trim().slice(0, 64);
  }
}
export function drawDistrictFile(ctx, game, width, height) {
  const safeGame = game && typeof game === 'object' ? game : {};
  const dossier = safeGame.dossier && typeof safeGame.dossier.rows === 'function' ? safeGame.dossier : new DistrictDossier();
  const rows = dossier.rows(safeGame);
  const summary = dossier.summary(safeGame);
  const lines = dossier.logLines(8);
  const sx = width / 1280;
  const sy = height / 720;
  const scale = Math.min(sx, sy);
  const X = (value) => value * sx;
  const Y = (value) => value * sy;
  const F = (size) => Math.max(8, Math.round(size * scale));
  const narrow = width < 1100;
  const gridX = 40;
  const gridY = narrow ? 108 : 120;
  const gap = narrow ? 18 : 24;
  const cardW = 300;
  const cardH = 150;
  const gridBottom = gridY + cardH * 3 + gap * 2;
  const bottomTop = narrow ? 686 : 632;
  const summaryY = bottomTop + (narrow ? 14 : 26);
  const cyanY = bottomTop + (narrow ? 29 : 48);
  const day = safeGame.economy && Number.isFinite(safeGame.economy.day) ? safeGame.economy.day : 1;
  const clockText = typeof dossier.clockText === 'function' ? dossier.clockText() : '18:40';
  ctx.save();
  try {
    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#0b2028');
    background.addColorStop(1, '#07121a');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.coral;
    ctx.font = '700 ' + F(12) + 'px system-ui, sans-serif';
    ctx.fillText('PAUSED · DISTRICT FILE', X(40), Y(42));
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 ' + F(46) + 'px "Arial Black", Arial, sans-serif';
    ctx.fillText('VELA CITY', X(40), Y(88));
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '600 ' + F(15) + 'px system-ui, sans-serif';
    ctx.fillText('SIX DISTRICTS · ONE SYNDICATE', X(40), Y(110));
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '600 ' + F(14) + 'px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('TAB CITY MAP  ·  ESC RESUME', X(1240), Y(48));
    ctx.textAlign = 'left';
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const col = index % 2;
      const line = Math.floor(index / 2);
      const cx = gridX + col * (cardW + gap);
      const cy = gridY + line * (cardH + gap);
      ctx.fillStyle = 'rgba(8,20,26,0.92)';
      ctx.fillRect(X(cx), Y(cy), X(cardW), Y(cardH));
      ctx.strokeStyle = row.current ? 'rgba(57,230,224,0.82)' : 'rgba(57,230,224,0.25)';
      ctx.lineWidth = row.current ? Math.max(1, 2 * scale) : Math.max(1, scale);
      ctx.strokeRect(X(cx), Y(cy), X(cardW), Y(cardH));
      ctx.fillStyle = PALETTE.coral;
      ctx.fillRect(X(cx), Y(cy), Math.max(2, X(4)), Y(cardH));
      ctx.fillStyle = PALETTE.cream;
      ctx.font = '900 ' + F(18) + 'px "Arial Black", Arial, sans-serif';
      ctx.fillText(fitText(ctx, row.name, X(cardW - 36)), X(cx + 18), Y(cy + 34));
      ctx.fillStyle = 'rgba(244,234,214,0.78)';
      ctx.font = '600 ' + F(12) + 'px system-ui, sans-serif';
      ctx.fillText(fitText(ctx, 'TIER ' + row.tier + ' · REP ' + row.reputation, X(cardW - 36)), X(cx + 18), Y(cy + 56));
      ctx.fillStyle = row.discovered ? PALETTE.neonCyan : 'rgba(244,234,214,0.38)';
      ctx.font = '700 ' + F(11) + 'px system-ui, sans-serif';
      ctx.fillText(row.discovered ? 'DISCOVERED' : 'UNMAPPED', X(cx + 18), Y(cy + 77));
      const filled = clamp(Math.round(row.heat / 10), 0, 10);
      for (let cell = 0; cell < 10; cell += 1) {
        const bx = cx + 18 + cell * 21;
        ctx.fillStyle = cell < filled ? heatColor(row.heat) : 'rgba(244,234,214,0.18)';
        ctx.fillRect(X(bx), Y(cy + 88), X(18), Y(8));
      }
      ctx.fillStyle = PALETTE.cream;
      ctx.font = '600 ' + F(12) + 'px system-ui, sans-serif';
      ctx.fillText('HEAT ' + Math.round(row.heat) + ' ' + row.band.toUpperCase(), X(cx + 18), Y(cy + 116));
      ctx.fillStyle = row.discovered ? 'rgba(244,234,214,0.82)' : 'rgba(244,234,214,0.38)';
      ctx.font = '600 ' + F(12) + 'px system-ui, sans-serif';
      ctx.fillText(row.discovered ? 'MISSIONS ' + row.missions : 'NO FILE YET', X(cx + 18), Y(cy + 138));
      if (row.current) {
        const tagX = cx + cardW - 108;
        const tagY = cy + 12;
        ctx.fillStyle = PALETTE.coral;
        ctx.fillRect(X(tagX), Y(tagY), X(96), Y(18));
        ctx.fillStyle = '#07121a';
        ctx.font = '800 ' + F(9) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('YOU ARE HERE', X(tagX + 48), Y(tagY + 12));
        ctx.textAlign = 'left';
      }
    }
    if (!narrow) {
      const px = 940;
      const py = 120;
      const pw = 300;
      const ph = 500;
      ctx.fillStyle = 'rgba(6,16,22,0.82)';
      ctx.fillRect(X(px), Y(py), X(pw), Y(ph));
      ctx.strokeStyle = 'rgba(57,230,224,0.20)';
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(X(px), Y(py), X(pw), Y(ph));
      ctx.fillStyle = PALETTE.coral;
      ctx.font = '900 ' + F(18) + 'px "Arial Black", Arial, sans-serif';
      ctx.fillText('INCIDENT LOG', X(px + 18), Y(py + 30));
      if (lines.length === 0) {
        ctx.fillStyle = 'rgba(244,234,214,0.38)';
        ctx.font = '600 ' + F(13) + 'px system-ui, sans-serif';
        ctx.fillText('NO INCIDENTS YET', X(px + 18), Y(py + 62));
      } else {
        ctx.fillStyle = PALETTE.cream;
        ctx.font = '400 ' + F(14) + 'px system-ui, sans-serif';
        for (let index = 0; index < lines.length; index += 1) {
          ctx.fillText(fitText(ctx, lines[index], X(pw - 36)), X(px + 18), Y(py + 62 + index * 22));
        }
      }
    } else {
      const px = 40;
      const py = gridBottom + 8;
      const pw = 1200;
      const ph = bottomTop - py - 4;
      ctx.fillStyle = 'rgba(6,16,22,0.82)';
      ctx.fillRect(X(px), Y(py), X(pw), Y(ph));
      ctx.strokeStyle = 'rgba(57,230,224,0.20)';
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(X(px), Y(py), X(pw), Y(ph));
      ctx.fillStyle = PALETTE.coral;
      ctx.font = '900 ' + F(16) + 'px "Arial Black", Arial, sans-serif';
      ctx.fillText('INCIDENT LOG', X(px + 18), Y(py + 18));
      if (lines.length === 0) {
        ctx.fillStyle = 'rgba(244,234,214,0.38)';
        ctx.font = '600 ' + F(12) + 'px system-ui, sans-serif';
        ctx.fillText('NO INCIDENTS YET', X(px + 18), Y(py + 36));
      } else {
        ctx.fillStyle = PALETTE.cream;
        ctx.font = '400 ' + F(12) + 'px system-ui, sans-serif';
        for (let index = 0; index < lines.length; index += 1) {
          const column = index < 4 ? 0 : 1;
          const rowIndex = index % 4;
          const lx = px + 18 + column * 590;
          ctx.fillText(fitText(ctx, lines[index], X(560)), X(lx), Y(py + 36 + rowIndex * 12));
        }
      }
    }
    ctx.strokeStyle = 'rgba(57,230,224,0.20)';
    ctx.lineWidth = Math.max(1, scale);
    ctx.beginPath();
    ctx.moveTo(X(40), Y(bottomTop));
    ctx.lineTo(X(1240), Y(bottomTop));
    ctx.stroke();
    const summaryText = 'DISTRICTS ' + summary.discovered + '/' + summary.total +
      ' · HOTTEST ' + summary.hottest + ' ' + Math.round(summary.hottestHeat) + ' ' + summary.hottestBand.toUpperCase() +
      ' · CASES ' + summary.cases + ' · INCIDENTS ' + summary.incidents + ' · TOP TIER ' + summary.topTier;
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '500 ' + F(15) + 'px system-ui, sans-serif';
    ctx.fillText(fitText(ctx, summaryText, X(860)), X(40), Y(summaryY));
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '600 ' + F(13) + 'px system-ui, sans-serif';
    ctx.fillText('TAB CITY MAP  ·  ESC RESUME', X(40), Y(cyanY));
    ctx.fillStyle = 'rgba(244,234,214,0.38)';
    ctx.font = '500 ' + F(12) + 'px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('DISTRICT FILE · DAY ' + day + ' ' + clockText, X(1240), Y(summaryY));
    ctx.textAlign = 'left';
  } finally {
    ctx.restore();
  }
}
export function districtTickerLine(game) {
  return game && game.dossier ? game.dossier.tickerLine() : '';
}
