// HUD pass: panel layout frozen for the r7 entry.
// HUD pass: panel layout frozen for the entry frames; no gameplay logic changed.
// The HUD: canvas panels for health, armour, wanted stars, minimap, police response, mission
// card, weapon, cash, radio, speedometer, dialogue and race line, sized to stay readable at
// 768 px, plus DOM title, pause and death menus and the full city map.

import { PALETTE, DISTRICTS, RADIO_STATIONS, CITY_LAYOUT, MISSION_DEFS } from './config.js';
import { clamp, dist2 } from './rng.js';
import { heatBand, heatColor } from './heat.js';
import { drawWaypoint } from './map.js';

const PHONE_TABS = ['MESSAGES', 'CONTACTS', 'JOBS', 'SETTINGS'];

export class HUD {
  constructor(root) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud-canvas';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.dpr = 1;
    this.notice = null;
    this.noticeTime = 0;
    this.saveToast = null;
    this.lastSaveWrite = 0;
    this.visible = true;
    this.menuHandlers = {};
    this.buildMenus();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  buildMenus() {
    const mk = (tag, cls, parent, text, id) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      if (text) el.textContent = text;
      if (id) el.id = id;
      (parent || this.root).appendChild(el);
      return el;
    };
    const title = mk('div', 'overlay title', this.root);
    title.id = 'title-menu';
    mk('div', 'menu-kicker', title, 'MARISOL SYNDICATE PRESENTS');
    mk('div', 'menu-save', title, '', 'continue-line');
    const titleButtons = mk('div', 'menu-buttons', title);
    this.btnContinue = mk('button', 'menu-btn primary', titleButtons, 'CONTINUE', 'btn-continue');
    this.btnNew = mk('button', 'menu-btn', titleButtons, 'NEW GAME', 'btn-new');
    mk('div', 'menu-hint', title, 'WASD move · mouse look · F steal a car · LMB fire · E start a job · R street race · ESC city map');

    const pause = mk('div', 'overlay pause', this.root);
    pause.id = 'pause-menu';
    mk('div', 'pause-title', pause, 'PAUSED · VELA CITY');
    const pb = mk('div', 'menu-buttons', pause);
    this.btnResume = mk('button', 'menu-btn primary', pb, 'RESUME', 'btn-resume');
    this.btnRestart = mk('button', 'menu-btn', pb, 'RESTART', 'btn-restart');
    mk('div', 'pause-hint', pause, 'City map · story · activities');

    const dead = mk('div', 'overlay dead', this.root);
    dead.id = 'dead-menu';
    mk('div', 'dead-title', dead, 'WASTED');
    mk('div', 'dead-sub', dead, 'Rico Vela is out of the run. The syndicate sends a car.', 'dead-sub');
    this.btnRespawn = mk('button', 'menu-btn primary', dead, 'RESPAWN', 'btn-respawn');

    this.menus = { title, pause, dead };
    this.btnContinue.addEventListener('click', () => this.menuHandlers.continue?.());
    this.btnNew.addEventListener('click', () => this.menuHandlers.newGame?.());
    this.btnResume.addEventListener('click', () => this.menuHandlers.resume?.());
    this.btnRestart.addEventListener('click', () => this.menuHandlers.restart?.());
    this.btnRespawn.addEventListener('click', () => this.menuHandlers.respawn?.());
  }

  bindMenus(handlers) {
    this.menuHandlers = { ...this.menuHandlers, ...handlers };
  }

  showTitle(economy, show) {
    this.menus.title.classList.toggle('show', show);
    if (show && economy) {
      const line = document.getElementById('continue-line');
      if (line) line.textContent = economy.loaded ? `Continue · ${economy.continueLine()}` : 'No saved run yet · new game starts at golden hour';
      this.btnContinue.style.display = economy.loaded ? 'inline-block' : 'none';
    }
  }

  showPause(show) {
    this.menus.pause.classList.toggle('show', show);
  }

  showDead(show, economy) {
    this.menus.dead.classList.toggle('show', show);
    if (show && economy) {
      const sub = document.getElementById('dead-sub');
      sub.textContent = `Medical bill · $500 · Cash left $${Math.max(0, economy.cash - 500).toLocaleString('en-US')}`;
    }
  }

  notify(text, seconds = 3) {
    this.notice = text;
    this.noticeTime = seconds;
  }

  tick(dt) {
    if (this.noticeTime > 0) {
      this.noticeTime -= dt;
      if (this.noticeTime <= 0) this.notice = null;
    }
    if (this.saveToast) {
      this.saveToast.time -= dt;
      if (this.saveToast.time <= 0) this.saveToast = null;
    }
  }

  drawHud(game) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (game.state === 'title') { this.drawTitle(ctx, game); return; }
    if (game.state === 'paused') { this.drawCityMap(ctx, game); return; }
    const w = this.w, h = this.h;
    const stacked = w < 1000 && !!game.missions?.card();
    const heatY = stacked ? 234 : 134;
    const stuntY = stacked ? 298 : 198;
    const radioY = stacked ? 362 : 262;
    this.watchSave(game);
    this.drawHealthArmour(ctx, game);
    this.drawDistrictHeader(ctx, game, w);
    this.drawHeatMeter(ctx, game, 24, heatY);
    this.drawStunts(ctx, game, 24, stuntY);
    this.drawRadio(ctx, game, 24, radioY);
    this.drawWantedStars(ctx, game, w - 120, 58);
    this.drawMinimap(ctx, game, w - 120, 178, 80);
    this.drawResponseList(ctx, game, w - 24, 302);
    this.drawMissionBanner(ctx, game, w / 2, 18);
    this.drawWeapon(ctx, game, 24, h - 132);
    this.drawDialogue(ctx, game, w / 2, h - 222);
    this.drawRaceHud(ctx, game);
    if (game.player?.inVehicle) this.drawSpeedometer(ctx, game, w - 24, h - 72);
    this.drawCash(ctx, game, w - 24, h - 24);
    this.drawControls(ctx, game, 24, h - 24);
    if (this.notice) {
      ctx.save();
      ctx.font = '700 21px system-ui, sans-serif';
      const tw = ctx.measureText(this.notice).width;
      ctx.fillStyle = 'rgba(10,18,24,0.82)';
      ctx.fillRect(w / 2 - tw / 2 - 20, 192, tw + 40, 40);
      ctx.fillStyle = PALETTE.gold;
      ctx.textAlign = 'center';
      ctx.fillText(this.notice, w / 2, 219);
      ctx.restore();
    }
    this.drawSaveToast(ctx, 24, radioY + (game.police?.wanted?.stars ? 82 : 56));
    if (game.phone?.open) this.drawPhone(ctx, game, w, h);
    this.vignette(ctx);
  }

  drawTitle(ctx, game) {
    const w = this.w, h = this.h;
    const g = ctx.createLinearGradient(0, 0, w * 0.8, h);
    g.addColorStop(0, 'rgba(8,16,22,0.88)');
    g.addColorStop(0.45, 'rgba(8,16,22,0.55)');
    g.addColorStop(1, 'rgba(8,16,22,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'left';
    const x = Math.max(56, w * 0.075);
    const y = h * 0.46;
    ctx.fillStyle = PALETTE.coral;
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.fillText('MARISOL SYNDICATE PRESENTS', x + 4, y - 132);
    ctx.font = '900 96px "Arial Black", Impact, system-ui, sans-serif';
    ctx.fillStyle = '#0d1b22';
    ctx.fillText('VELA CITY', x + 5, y + 5);
    ctx.fillStyle = PALETTE.cream;
    ctx.fillText('VELA CITY', x, y);
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.fillRect(x, y + 24, 220, 4);
    ctx.font = '700 25px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('ONE LAST RUN ACROSS THE COAST', x, y + 66);
    ctx.font = '500 19px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244,234,214,0.8)';
    ctx.fillText('Rico Vela owes the Marisol syndicate. Drive, steal, race and survive the golden hour.', x, y + 104);
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244,234,214,0.65)';
    ctx.fillText('Chase · On foot · Story jobs · Coral Loop street race · Five wanted stars', x, y + 140);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(244,234,214,0.55)';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText('v1.0 · an original open-world crime game', w - 40, h - 28);
  }

  drawHealthArmour(ctx, game) {
    const p = game.player;
    if (!p) return;
    const x = 24, y = 30;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,18,24,0.68)';
    this.panel(ctx, x - 8, y - 12, 248, 104, PALETTE.coral);
    // Portrait chip.
    ctx.fillStyle = PALETTE.coral;
    ctx.beginPath();
    ctx.arc(x + 22, y + 22, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#102027';
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RV', x + 22, y + 29);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 19px "Arial Black", system-ui, sans-serif';
    ctx.fillText('RICO VELA', x + 54, y + 14);
    ctx.fillStyle = 'rgba(244,234,214,0.75)';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('HEALTH', x + 54, y + 40);
    this.bar(ctx, x + 54, y + 46, 174, 10, p.health / 100, p.health < 30 ? '#ff4f4f' : PALETTE.cream);
    ctx.fillStyle = 'rgba(244,234,214,0.75)';
    ctx.fillText('ARMOUR', x + 54, y + 72);
    this.bar(ctx, x + 54, y + 78, 174, 8, p.armour / 100, PALETTE.neonCyan);
    ctx.restore();
  }

  drawWantedStars(ctx, game, cx, y) {
    const wanted = game.police?.wanted;
    const stars = wanted ? wanted.stars : 0;
    const label = wanted ? wanted.starLabel() : 'CLEAR';
    const size = 21;
    const spacing = 26;
    const start = cx - (spacing * 4) / 2 - 2;
    ctx.save();
    for (let i = 0; i < 5; i++) {
      this.star(ctx, start + i * spacing, y, size / 2, i < stars, i < stars ? PALETTE.gold : 'rgba(244,234,214,0.22)');
    }
    ctx.font = '900 19px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = stars ? (wanted?.evading ? PALETTE.neonCyan : PALETTE.coral) : 'rgba(244,234,214,0.55)';
    ctx.fillText(label, cx, y + 34);
    ctx.restore();
  }

  drawMinimap(ctx, game, cx, cy, r) {
    const city = game.city;
    const player = game.player;
    if (!city || !player) return;
    const px = player.inVehicle ? player.inVehicle.pos.x : player.pos.x;
    const pz = player.inVehicle ? player.inVehicle.pos.z : player.pos.z;
    const heading = player.inVehicle ? player.inVehicle.heading : player.heading;
    const scale = r / 168;
    const sx = (x) => cx + (x - px) * scale;
    const sz = (z) => cy + (z - pz) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#c7b394';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Sea and beach bands.
    const seaY = sz(CITY_LAYOUT.seaZ);
    ctx.fillStyle = '#1a7f9c';
    ctx.fillRect(cx - r, seaY, r * 2, r * 2);
    ctx.fillStyle = 'rgba(120,220,220,0.28)';
    for (let i = 0; i < 8; i++) ctx.fillRect(cx - r, seaY + i * 6 + 3, r * 2, 1);
    ctx.fillStyle = '#d9b98a';
    ctx.fillRect(cx - r, sz(CITY_LAYOUT.beachZ[0]), r * 2, (CITY_LAYOUT.beachZ[1] - CITY_LAYOUT.beachZ[0]) * scale);
    // Roads.
    ctx.fillStyle = '#4a545c';
    for (const road of city.roads) {
      ctx.fillRect(sx(road.x - road.w / 2), sz(road.z - road.h / 2), road.w * scale, road.h * scale);
    }
    // Marina docks.
    ctx.strokeStyle = '#8a6a4a';
    ctx.lineWidth = 2;
    for (const d of city.docks) {
      ctx.strokeRect(sx(d.minX), sz(d.minZ), (d.maxX - d.minX) * scale, (d.maxZ - d.minZ) * scale);
    }
    // Search zone.
    const wanted = game.police?.wanted;
    if (wanted && wanted.stars > 0 && wanted.evading) {
      ctx.strokeStyle = 'rgba(57,230,224,0.85)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 34 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Race route and next checkpoint.
    if (game.race?.active) {
      ctx.strokeStyle = PALETTE.neonCyan;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      game.race.checkpoints.forEach((p, i) => {
        const X = sx(p.x), Z = sz(p.z);
        if (i === 0) ctx.moveTo(X, Z); else ctx.lineTo(X, Z);
      });
      ctx.stroke();
      const next = game.race.checkpoints[game.race.checkpoint];
      if (next) {
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(sx(next.x), sz(next.z), 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Mission marker and route.
    const marker = game.missions?.marker;
    if (marker) {
      ctx.strokeStyle = 'rgba(255,195,92,0.55)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx(marker.x), sz(marker.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PALETTE.gold;
      this.diamond(ctx, sx(marker.x), sz(marker.z), 5.5);
    }
    if (game.map?.waypoint) drawWaypoint(ctx, { X: sx, Z: sz, scale }, game.map.waypoint, game.map.waypointLabel, game.time);
    // Police blips.
    if (game.police) {
      for (const u of game.police.units) {
        if (u.dead) continue;
        ctx.fillStyle = Math.sin(performance.now() * 0.01 + u.vehicle.pos.x) > 0 ? '#ff3d5a' : '#3d8bff';
        ctx.beginPath();
        ctx.arc(sx(u.vehicle.pos.x), sz(u.vehicle.pos.z), 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const h of game.police.helicopters) {
        ctx.fillStyle = '#ffd9a0';
        ctx.fillRect(sx(h.group.position.x) - 2.5, sz(h.group.position.z) - 2.5, 5, 5);
      }
    }
    // Safehouse dot.
    ctx.fillStyle = '#5ad48a';
    ctx.beginPath();
    ctx.arc(sx(24) - 10, sz(214) - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Player arrow.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = PALETTE.cream;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Ring, north mark and district label.
    ctx.strokeStyle = 'rgba(16,24,32,0.9)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = PALETTE.cream;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 16px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - r + 17);
    ctx.font = '900 22px "Arial Black", system-ui, sans-serif';
    ctx.fillStyle = '#102027';
    ctx.fillText(game.district || 'PALM BEACH', cx, cy + r + 26);
  }

  drawResponseList(ctx, game, right, y) {
    const police = game.police;
    if (!police) return;
    const rows = police.responseRows(game.player.pos);
    const wanted = police.wanted;
    if (!rows.length && !wanted.stars) return;
    const width = 306;
    const x = right - width;
    const height = 48 + Math.max(1, rows.length) * 27;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.7)';
    this.panel(ctx, x, y, width, height, PALETTE.neonCyan);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.fillText('POLICE RESPONSE', x + 14, y + 27);
    ctx.fillStyle = 'rgba(244,234,214,0.55)';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(wanted.evading ? 'EVADING' : 'IN SIGHT', x + width - 14, y + 27);
    let ry = y + 53;
    if (!rows.length) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(244,234,214,0.7)';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.fillText('No units in the search zone', x + 14, ry + 4);
    }
    for (const row of rows.slice(0, 4)) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.cream;
      ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
      ctx.fillText(row.callSign, x + 14, ry);
      const signW = ctx.measureText(row.callSign).width;
      ctx.font = '900 15px "Arial Black", system-ui, sans-serif';
      const verbW = ctx.measureText(row.verb).width;
      const distRight = x + width - 14 - verbW - 12;
      {
        ctx.font = '700 15px system-ui, sans-serif';
        const distText = `${Math.round(row.distance)} m`;
        const distW = ctx.measureText(distText).width;
        const typeX = x + 14 + signW + 9;
        ctx.fillStyle = 'rgba(244,234,214,0.75)';
        ctx.font = '600 15px system-ui, sans-serif';
        if (typeX + ctx.measureText(row.unitType).width <= distRight - distW - 8) {
          ctx.fillText(row.unitType, typeX, ry);
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = PALETTE.gold;
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.fillText(distText, distRight, ry);
        ctx.fillStyle = row.verb === 'ROADBLOCK' ? PALETTE.coral : row.verb === 'RAMMING' ? '#ff8a5a' : PALETTE.neonCyan;
        ctx.font = '900 15px "Arial Black", system-ui, sans-serif';
        ctx.fillText(row.verb, x + width - 14, ry);
      }
      ry += 27;
    }
    ctx.restore();
  }

  drawMissionBanner(ctx, game, cx, y) {
    const card = game.missions?.card();
    if (!card) return;
    const width = 580;
    const x = cx - width / 2;
    const h = 204;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.78)';
    this.panel(ctx, x, y, width, h, PALETTE.gold);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 20px "Arial Black", system-ui, sans-serif';
    ctx.fillText(card.chapter, x + 20, y + 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = card.timer < 20 ? '#ff6b5a' : PALETTE.cream;
    ctx.font = '900 22px "Arial Black", system-ui, sans-serif';
    ctx.fillText(this.timeText(card.timer), x + width - 20, y + 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 27px "Arial Black", Impact, system-ui, sans-serif';
    ctx.fillText(card.title.toUpperCase(), x + 20, y + 61);
    ctx.fillStyle = 'rgba(244,234,214,0.95)';
    ctx.font = '600 22px system-ui, sans-serif';
    this.wrapText(ctx, card.objective, x + 20, y + 90, width - 40, 25, 2);
    const stageText = card.state === 'failed' ? (card.result?.text || 'Mission failed') : card.stageText;
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '900 21px "Arial Black", system-ui, sans-serif';
    this.wrapText(ctx, `STAGE ${card.stage}/${card.total} · ${stageText}`, x + 20, y + 142, width - 40, 23, 2);
    this.bar(ctx, x + 20, y + 176, width - 40, 7, card.stage / card.total, PALETTE.gold);
    ctx.fillStyle = 'rgba(244,234,214,0.55)';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`MARISOL SYNDICATE · ${card.state.toUpperCase()}`, x + 20, y + 197);
    if (card.result) {
      ctx.textAlign = 'right';
      ctx.fillStyle = card.result.ok ? PALETTE.gold : PALETTE.coral;
      ctx.font = '900 19px "Arial Black", system-ui, sans-serif';
      ctx.fillText(card.result.ok ? `+ $${card.result.reward.toLocaleString('en-US')}` : 'FAILED · R TO RETRY', x + width - 20, y + 197);
    }
    ctx.restore();
  }

  drawWeapon(ctx, game, x, y) {
    const p = game.player;
    if (!p) return;
    const raw = game.player.weapon?.toUpperCase() || 'SURF SMG';
    const w = raw === 'SMG' ? 'SURF SMG' : raw;
    const ammo = game.player.ammo?.[game.player.weapon];
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.68)';
    this.panel(ctx, x - 6, y - 28, 252, 62, PALETTE.coral);
    ctx.fillStyle = PALETTE.coral;
    ctx.fillRect(x + 2, y - 8, 48, 26);
    ctx.fillStyle = '#102027';
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SMG', x + 26, y + 11);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 21px "Arial Black", system-ui, sans-serif';
    ctx.fillText(w, x + 60, y + 10);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 24px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(ammo != null ? String(ammo) : '∞', x + 234, y + 12);
    ctx.fillStyle = 'rgba(244,234,214,0.6)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('AMMO', x + 234, y + 27);
    ctx.restore();
  }

  drawDialogue(ctx, game, cx, y) {
    const line = game.missions?.currentLine || game.dialogue;
    if (!line) return;
    const width = 600;
    const x = cx - width / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,20,0.82)';
    this.panel(ctx, x, y, width, 86, PALETTE.neonCyan);
    ctx.fillStyle = PALETTE.coral;
    ctx.font = '900 22px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(line.speaker, x + 18, y + 25);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '600 20px system-ui, sans-serif';
    this.wrapText(ctx, line.text, x + 18, y + 49, width - 36, 23, 2);
    ctx.restore();
  }

  drawRaceHud(ctx, game) {
    const race = game.race;
    if (!race || (!race.active && !race.finished)) return;
    const w = this.w, h = this.h;
    const cx = w / 2;
    const label = race.line || `${race.positionLabel()} OF 4 · LAP ${race.lap}/2`;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '900 21px "Arial Black", system-ui, sans-serif';
    const tw = Math.max(470, ctx.measureText(label).width + 70);
    const y = h - 105;
    ctx.fillStyle = 'rgba(10,18,24,0.82)';
    this.panel(ctx, cx - tw / 2, y - 34, tw, 50, PALETTE.neonCyan);
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '900 17px "Arial Black", system-ui, sans-serif';
    ctx.fillText('CORAL LOOP · DARIO SARNO · NIA VALE · TEO MARCHETTI', cx, y - 42);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 22px "Arial Black", system-ui, sans-serif';
    ctx.fillText(label, cx, y - 2);
    ctx.fillStyle = 'rgba(244,234,214,0.65)';
    ctx.font = '600 16px system-ui, sans-serif';
    if (race.finished) ctx.fillText(race.resultText, cx, y + 28);
    else ctx.fillText(`RIVAL ${race.position === 1 ? 'DARIO SARNO' : race.position === 2 ? 'NIA VALE' : 'TEO MARCHETTI'} AHEAD · STAY ON THE ROUTE`, cx, y + 28);
    ctx.restore();
  }

  drawSpeedometer(ctx, game, right, bottom) {
    const v = game.player.inVehicle;
    if (!v) return;
    const w = 320;
    const x = right - w;
    const y = bottom - 176;
    const mph = Math.round(Math.abs(v.speed) * 2.23694);
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.72)';
    this.panel(ctx, x, y, w, 148, PALETTE.gold);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 48px "Arial Black", Impact, system-ui, sans-serif';
    ctx.fillText(String(mph), right - 58, y + 62);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.fillText('MPH', right - 14, y + 60);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 21px "Arial Black", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(v.name.toUpperCase(), x + 16, y + 26);
    ctx.fillStyle = 'rgba(244,234,214,0.72)';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('CONDITION', x + 16, y + 48);
    this.bar(ctx, x + 16, y + 55, 150, 7, v.health / v.maxHealth, v.health < 35 ? '#ff5a4e' : PALETTE.neonCyan);
    ctx.fillStyle = 'rgba(244,234,214,0.8)';
    ctx.font = '600 17px system-ui, sans-serif';
    const station = game.radio || RADIO_STATIONS[0];
    ctx.fillText(`${station.name} · ${station.track}`, x + 16, y + 95);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 16px "Arial Black", system-ui, sans-serif';
    ctx.fillText('RADIO', x + 16, y + 116);
    ctx.fillStyle = 'rgba(244,234,214,0.6)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(v.type === 'police' ? 'STOLEN VPB CRUISER' : 'PERSONAL VEHICLE', x + 16, y + 136);
    ctx.restore();
  }

  drawCash(ctx, game, right, bottom) {
    const eco = game.economy;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(10,18,24,0.6)';
    ctx.fillRect(right - 240, bottom - 58, 240, 66);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 26px "Arial Black", system-ui, sans-serif';
    ctx.fillText(`$${eco.cash.toLocaleString('en-US')}`, right, bottom);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillText(`${game.district || 'PALM BEACH'} · ${eco.clockText()}`, right, bottom - 30);
    ctx.restore();
  }

  drawControls(ctx, game, x, bottom) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(10,18,24,0.55)';
    ctx.fillRect(x - 6, bottom - 30, 670, 42);
    ctx.fillStyle = 'rgba(244,234,214,0.85)';
    ctx.font = '600 17px system-ui, sans-serif';
    const inCar = !!game.player.inVehicle;
    ctx.fillText(inCar ? 'WASD DRIVE · SPACE HANDBRAKE · F EXIT · LMB FIRE · R RACE · ESC MAP' : 'WASD MOVE · SHIFT SPRINT · F STEAL · E JOB · LMB FIRE · R RACE · ESC MAP', x, bottom - 4);
    ctx.restore();
  }

  watchSave(game) {
    const save = game.save;
    if (!save || !save.lastWrite) return;
    if (save.lastWrite === this.lastSaveWrite) return;
    this.lastSaveWrite = save.lastWrite;
    this.saveToast = { text: `SAVED · ${String(save.lastReason || 'auto').toUpperCase()}`, time: 3 };
  }

  drawDistrictHeader(ctx, game, w) {
    const name = String(game.district || 'VELA CITY').toUpperCase();
    let descriptor = '';
    if (game.heat && typeof game.heat.labelFor === 'function') {
      const rows = String(game.heat.labelFor(name)).split('\n');
      descriptor = rows[1] || '';
    }
    const tail = descriptor ? ` · ${descriptor}` : '';
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px "Arial Black", system-ui, sans-serif';
    const nameW = ctx.measureText(name).width;
    ctx.font = '600 13px system-ui, sans-serif';
    const tailW = ctx.measureText(tail).width;
    const left = w / 2 - (nameW + tailW) / 2;
    ctx.fillStyle = 'rgba(8,20,26,0.8)';
    ctx.fillRect(left - 12, 0, nameW + tailW + 24, 18);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 13px "Arial Black", system-ui, sans-serif';
    ctx.fillText(name, left, 10);
    ctx.fillStyle = 'rgba(244,234,214,0.82)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(tail, left + nameW, 10);
    ctx.restore();
  }

  drawHeatMeter(ctx, game, x, y) {
    const heat = game.heat;
    if (!heat) return;
    const value = heat.heatOf(game.district);
    const tier = heat.tierOf(game.district);
    const band = heatBand(value);
    const color = heatColor(value);
    const width = 248;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.68)';
    this.panel(ctx, x - 8, y - 12, width, 58, color);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 16px "Arial Black", system-ui, sans-serif';
    ctx.fillText('DISTRICT HEAT', x, y + 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = '900 15px "Arial Black", system-ui, sans-serif';
    ctx.fillText(`${Math.round(value)} · ${String(band).toUpperCase()}`, x + width - 24, y + 6);
    this.bar(ctx, x, y + 14, width - 32, 8, value / 100, color);
    ctx.textAlign = 'left';
    ctx.fillStyle = tier.color || 'rgba(244,234,214,0.72)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${tier.name} · REP ${Math.round(heat.reputationOf(game.district))}`, x, y + 38);
    ctx.restore();
  }

  drawStunts(ctx, game, x, y) {
    const stunts = game.stunts;
    if (!stunts) return;
    const width = 248;
    const combo = typeof stunts.comboMultiplier === 'function' ? stunts.comboMultiplier() : 1;
    const score = Number(stunts.score) || 0;
    const rank = stunts.rank && stunts.rank.name ? stunts.rank.name : 'ROOKIE';
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.68)';
    this.panel(ctx, x - 8, y - 12, width, 64, PALETTE.neonCyan);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 16px "Arial Black", system-ui, sans-serif';
    ctx.fillText('STUNTS', x, y + 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.fillText(score.toLocaleString('en-US'), x + width - 24, y + 6);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,234,214,0.75)';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`${rank} · COMBO x${combo} · BEST x${stunts.bestCombo || 0}`, x, y + 28);
    const fresh = game.stuntCallout && game.time - game.stuntCallout.at < 3.5;
    ctx.fillStyle = fresh ? PALETTE.neonCyan : 'rgba(244,234,214,0.45)';
    ctx.font = '700 13px system-ui, sans-serif';
    const last = stunts.lastMove && stunts.lastMove !== 'ready' ? String(stunts.lastMove).toUpperCase() : 'NO MOVES YET';
    ctx.fillText(fresh ? game.stuntCallout.text : `LAST · ${last}`, x, y + 46);
    ctx.restore();
  }

  drawRadio(ctx, game, x, y) {
    const dial = game.radioDial;
    if (!dial) return;
    const width = 248;
    const stars = game.police?.wanted?.stars || 0;
    const height = stars > 0 ? 70 : 44;
    ctx.save();
    ctx.fillStyle = 'rgba(10,18,24,0.68)';
    this.panel(ctx, x - 8, y - 12, width, height, PALETTE.gold);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 13px "Arial Black", system-ui, sans-serif';
    ctx.fillText('RADIO', x, y + 4);
    const bars = dial.signalBars ? dial.signalBars() : 0;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < bars ? PALETTE.neonCyan : 'rgba(244,234,214,0.22)';
      ctx.fillRect(x + width - 50 + i * 8, y - 2 - i * 3, 5, 6 + i * 3);
    }
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(dial.stationLine(), x, y + 22);
    if (stars > 0) {
      ctx.fillStyle = 'rgba(244,234,214,0.7)';
      ctx.font = '600 12px system-ui, sans-serif';
      this.wrapText(ctx, dial.dispatchLine({ district: game.district, wanted: game.police?.wanted }), x, y + 40, width - 32, 14, 2);
    }
    ctx.restore();
  }

  drawPhone(ctx, game, w, h) {
    const phone = game.phone;
    if (!phone || !phone.open) return;
    const lines = phone.lines();
    const width = 360;
    const height = 108 + Math.max(1, lines.length) * 24;
    const x = 40;
    const y = Math.max(120, Math.min(h - height - 40, 150));
    ctx.save();
    ctx.fillStyle = 'rgba(8,14,20,0.94)';
    this.panel(ctx, x, y, width, height, PALETTE.neonCyan);
    const header = String(phone.header()).split('\n');
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '900 16px "Arial Black", system-ui, sans-serif';
    ctx.fillText(header[0] || 'VELA WIRELESS', x + 16, y + 24);
    ctx.fillStyle = 'rgba(244,234,214,0.7)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(header[1] || '', x + 16, y + 42);
    let tx = x + 16;
    ctx.font = '900 12px "Arial Black", system-ui, sans-serif';
    for (let i = 0; i < PHONE_TABS.length; i++) {
      const label = PHONE_TABS[i];
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = i === phone.tab ? PALETTE.gold : 'rgba(244,234,214,0.45)';
      ctx.fillText(label, tx, y + 66);
      tx += tw + 14;
    }
    let ly = y + 92;
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i];
      const selected = i === phone.selected;
      if (selected) { ctx.fillStyle = 'rgba(57,230,224,0.16)'; ctx.fillRect(x + 10, ly - 14, width - 20, 22); }
      ctx.textAlign = 'left';
      ctx.fillStyle = selected ? PALETTE.cream : 'rgba(244,234,214,0.8)';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(String(row.left), x + 16, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = selected ? PALETTE.gold : 'rgba(244,234,214,0.55)';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(String(row.right), x + width - 16, ly);
      ly += 24;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(244,234,214,0.5)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('P CLOSE · TAB NEXT · ENTER ACCEPT · G COMPLETE', x + 16, y + height - 12);
    ctx.restore();
  }

  drawSaveToast(ctx, x, y) {
    if (!this.saveToast) return;
    const text = this.saveToast.text;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font = '700 13px system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(10,18,24,0.8)';
    this.panel(ctx, x - 8, y - 12, tw + 32, 30, PALETTE.gold);
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(text, x + 4, y + 8);
    ctx.restore();
  }

  drawCityMap(ctx, game) {
    const w = this.w, h = this.h;
    const eco = game.economy;
    const mapX = 36, mapY = 104, mapW = w - 420, mapH = h - 168;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b2028');
    g.addColorStop(1, '#07121a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.coral;
    ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
    ctx.fillText('MARISOL SYNDICATE · CITY MAP', mapX, 42);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '900 44px "Arial Black", Impact, system-ui, sans-serif';
    ctx.fillText('VELA CITY', mapX, 86);
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('PAUSED · CLICK RESUME TO RETURN', w - 36, 80);
    ctx.restore();
    // Map is scaled to fit the city's 660 x 560 footprint.
    const scale = Math.min(mapW / 660, mapH / 560);
    const ox = mapX + mapW / 2;
    const oy = mapY + mapH / 2 + 20;
    const X = (x) => ox + x * scale;
    const Z = (z) => oy + (z + 20) * scale;
    ctx.save();
    ctx.fillStyle = '#102c35';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.strokeStyle = 'rgba(57,230,224,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mapX, mapY, mapW, mapH);
    // Sea, beach, city floor.
    ctx.fillStyle = '#145c73';
    ctx.fillRect(X(-330), Z(238), 660 * scale, 270 * scale);
    ctx.fillStyle = 'rgba(57,230,224,0.16)';
    for (let i = 0; i < 16; i++) ctx.fillRect(X(-330), Z(248 + i * 15), 660 * scale, 1.5);
    ctx.fillStyle = '#d9b98a';
    ctx.fillRect(X(-330), Z(204), 660 * scale, 34 * scale);
    ctx.fillStyle = '#182f36';
    ctx.fillRect(X(-330), Z(-280), 660 * scale, 484 * scale);
    // Buildings as blocks.
    ctx.fillStyle = '#24434a';
    for (const c of game.city.colliders) {
      ctx.fillRect(X(c.minX), Z(c.minZ), (c.maxX - c.minX) * scale, (c.maxZ - c.minZ) * scale);
    }
    // Roads.
    for (const road of game.city.roads) {
      ctx.fillStyle = '#59636b';
      ctx.fillRect(X(road.x - road.w / 2), Z(road.z - road.h / 2), road.w * scale, road.h * scale);
    }
    // Marina.
    ctx.strokeStyle = '#a37a52';
    ctx.lineWidth = 3;
    for (const d of game.city.docks) ctx.strokeRect(X(d.minX), Z(d.minZ), (d.maxX - d.minX) * scale, (d.maxZ - d.minZ) * scale);
    // Race route.
    ctx.strokeStyle = PALETTE.neonCyan;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    (game.race?.checkpoints || []).forEach((p, i) => { if (i === 0) ctx.moveTo(X(p.x), Z(p.z)); else ctx.lineTo(X(p.x), Z(p.z)); });
    ctx.stroke();
    ctx.setLineDash([]);
    // Districts.
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      ctx.fillStyle = 'rgba(244,234,214,0.85)';
      ctx.font = '900 22px "Arial Black", system-ui, sans-serif';
      ctx.fillText(d.name, X(d.x), Z(d.z));
    }
    // Story mission markers.
    for (const m of MISSION_DEFS) {
      const p = m.marker;
      const done = eco.isComplete(m.id);
      ctx.fillStyle = done ? '#5ad48a' : eco.isUnlocked(m.id) ? PALETTE.gold : 'rgba(244,234,214,0.3)';
      this.diamond(ctx, X(p.x), Z(p.z), 8);
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = done ? '#5ad48a' : 'rgba(244,234,214,0.8)';
      ctx.fillText(done ? 'DONE' : m.title.toUpperCase(), X(p.x), Z(p.z) + 24);
    }
    // Activities.
    ctx.fillStyle = PALETTE.neonCyan;
    this.diamond(ctx, X(CITY_LAYOUT.raceStart.x), Z(CITY_LAYOUT.raceStart.z), 7);
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('CORAL LOOP RACE', X(CITY_LAYOUT.raceStart.x), Z(CITY_LAYOUT.raceStart.z) - 14);
    ctx.fillStyle = PALETTE.coral;
    this.diamond(ctx, X(-145), Z(258), 7);
    ctx.fillText('MARINA DOCKS', X(-145), Z(258) - 14);
    // Safehouses.
    const houses = [{ x: 24, z: 214, name: 'PALM BEACH SAFEHOUSE' }, { x: -240, z: 150, name: 'WEST END GARAGE' }, { x: 176, z: -72, name: 'DOWNTOWN LOFT' }];
    for (const sh of houses) {
      ctx.fillStyle = '#5ad48a';
      ctx.fillRect(X(sh.x) - 6, Z(sh.z) - 5, 12, 10);
      ctx.beginPath(); ctx.moveTo(X(sh.x) - 9, Z(sh.z) - 5); ctx.lineTo(X(sh.x), Z(sh.z) - 13); ctx.lineTo(X(sh.x) + 9, Z(sh.z) - 5); ctx.fill();
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(244,234,214,0.75)';
      ctx.fillText(sh.name, X(sh.x), Z(sh.z) + 20);
    }
    // Player.
    ctx.fillStyle = PALETTE.cream;
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 2;
    const p = game.player;
    const px = p.inVehicle ? p.inVehicle.pos.x : p.pos.x;
    const pz = p.inVehicle ? p.inVehicle.pos.z : p.pos.z;
    ctx.beginPath();
    ctx.arc(X(px), Z(pz), 7, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // Right panel.
    const px0 = w - 360;
    ctx.save();
    ctx.fillStyle = 'rgba(8,20,26,0.9)';
    ctx.fillRect(px0, 104, 324, h - 168);
    ctx.strokeStyle = 'rgba(57,230,224,0.25)';
    ctx.strokeRect(px0, 104, 324, h - 168);
    ctx.textAlign = 'left';
    let y = 140;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 20px "Arial Black", system-ui, sans-serif';
    ctx.fillText('STORY', px0 + 22, y);
    y += 30;
    for (const m of MISSION_DEFS) {
      const done = eco.isComplete(m.id);
      const unlocked = eco.isUnlocked(m.id);
      ctx.fillStyle = done ? '#5ad48a' : unlocked ? PALETTE.cream : 'rgba(244,234,214,0.35)';
      ctx.font = '900 18px "Arial Black", system-ui, sans-serif';
      ctx.fillText(`${done ? '✓' : unlocked ? '◆' : '·'} ${m.title}`, px0 + 22, y);
      ctx.fillStyle = 'rgba(244,234,214,0.55)';
      ctx.font = '500 15px system-ui, sans-serif';
      ctx.fillText(`${m.chapter} · $${m.reward.toLocaleString('en-US')}`, px0 + 34, y + 21);
      y += 54;
    }
    y += 8;
    ctx.fillStyle = PALETTE.neonCyan;
    ctx.font = '900 20px "Arial Black", system-ui, sans-serif';
    ctx.fillText('ACTIVITIES', px0 + 22, y);
    y += 28;
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('Coral Loop · 2 laps · 3 rivals', px0 + 22, y);
    ctx.fillStyle = 'rgba(244,234,214,0.6)';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText(`Best place ${racePlaceLabel(eco)} · $6,000 purse`, px0 + 22, y + 20);
    y += 58;
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '700 17px system-ui, sans-serif';
    ctx.fillText('Marina crates · Hot Pursuit', px0 + 22, y);
    ctx.fillStyle = 'rgba(244,234,214,0.6)';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('Story jobs unlock as you play', px0 + 22, y + 20);
    y += 52;
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 20px "Arial Black", system-ui, sans-serif';
    ctx.fillText('STATS', px0 + 22, y);
    y += 28;
    ctx.fillStyle = 'rgba(244,234,214,0.85)';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillText(`Missions ${eco.completed.length}/${MISSION_DEFS.length}`, px0 + 22, y);
    ctx.fillText(`Races entered ${eco.stats.races || 0} · Wrecks ${eco.stats.wrecks || 0}`, px0 + 22, y + 22);
    ctx.fillText(`Cash $${eco.cash.toLocaleString('en-US')} · Day ${eco.day}, ${eco.clockText()}`, px0 + 22, y + 44);
    ctx.restore();
    // Progress line across the bottom.
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.cream;
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillText(`${eco.continueLine()}  ·  Missions ${eco.completed.length}/${MISSION_DEFS.length}  ·  ${game.district || 'PALM BEACH'}`, mapX, h - 26);
    ctx.restore();
  }

  timeText(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
    const words = String(text).split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines++;
        line = word;
        if (lines >= maxLines) { line = ''; break; }
      } else line = test;
    }
    if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  }

  panel(ctx, x, y, w, h, accent) {
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, w, 3);
    ctx.fillRect(x, y, 3, h);
  }

  bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  }

  star(ctx, cx, cy, r, filled, color) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.46;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = filled ? '#102027' : 'rgba(16,24,32,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  diamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#102027';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  vignette(ctx) {
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.35, this.w / 2, this.h / 2, this.h * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(4,10,14,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

function racePlaceLabel(eco) {
  return eco.stats.bestPlace ? `${eco.stats.bestPlace}` : '2nd';
}

export function drawHud(game, hud) {
  hud.drawHud(game);
}

export function drawMinimap(ctx, game, cx, cy, r, hud) {
  (hud || game.hud).drawMinimap(ctx, game, cx, cy, r);
}

export function drawWantedStars(ctx, game, cx, y, hud) {
  (hud || game.hud).drawWantedStars(ctx, game, cx, y);
}

export function drawMissionBanner(ctx, game, cx, y, hud) {
  (hud || game.hud).drawMissionBanner(ctx, game, cx, y);
}

export function drawSpeedometer(ctx, game, right, bottom, hud) {
  (hud || game.hud).drawSpeedometer(ctx, game, right, bottom);
}

export function drawWeapon(ctx, game, x, y, hud) {
  (hud || game.hud).drawWeapon(ctx, game, x, y);
}

export function drawCityMap(ctx, game, hud) {
  (hud || game.hud).drawCityMap(ctx, game);
}

export function drawTitle(ctx, game, hud) {
  (hud || game.hud).drawTitle(ctx, game);
}

export function drawRaceHud(ctx, game, hud) {
  (hud || game.hud).drawRaceHud(ctx, game);
}
