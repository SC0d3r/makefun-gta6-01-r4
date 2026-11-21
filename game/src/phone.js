// Phone module: keeps contacts, message threads, side jobs and handset settings as pure data.
// Phone pass: contacts, message threads, side jobs and settings for VELA CITY.
// The module only holds data and pure presentation helpers. A later wiring pass calls toggle()
// and lines() from the HUD, so nothing here touches the DOM, the scene or another module export.
// r13 city-systems pass: phone data is unchanged and opened from main.js.

import { seededRandom, clamp } from './rng.js';

// The carrier name and the four tabs stay short enough for a narrow phone card.
// Messages and jobs reuse the same cast and districts as the story and race systems.
// The phone never loads the scene, so its rows can be unit-tested on their own.
const CARRIER = 'VELA WIRELESS';
const TABS = ['MESSAGES', 'CONTACTS', 'JOBS', 'SETTINGS'];

// Contacts table: every person Rico can call from the in-game phone.
// Roles and districts echo the city cast already used by missions, race and police.
const CONTACTS = [
  { name: 'Marisol', role: 'Syndicate boss', district: 'PALM BEACH' },
  { name: 'Nico', role: 'Fixer', district: 'MARINA' },
  { name: 'Dario Sarno', role: 'Race rival', district: 'CORAL HEIGHTS' },
  { name: 'Nia Vale', role: 'Courier', district: 'PALM ROW' },
  { name: 'Teo Marchetti', role: 'Mechanic', district: 'DOWNTOWN' },
  { name: 'Lena Ortiz', role: 'Dispatch', district: 'DOWNTOWN' },
  { name: 'Sgt. Rook', role: 'VPB desk', district: 'PALM BEACH' },
  { name: 'Marta Vela', role: 'Family', district: 'HILLS' },
  { name: 'Surf Shack', role: 'Beach contact', district: 'MARINA' },
];

// Message thread table: at least a dozen lines across the contact list.
// New phone traffic picks one of these lines and appends it with the current clock time.
// The table is intentionally plain text, with dots and commas instead of dashes.
// Unread counts rise when a new line arrives and fall when the thread is opened.
const THREAD_TABLE = [
  { contact: 'Marisol', messages: [
    { from: 'them', text: 'The ledger is still out there. Keep the coast quiet.' },
    { from: 'you', text: 'I am on it. No sirens tonight.' },
    { from: 'them', text: 'Good. The marina job pays double if you stay clean.' },
    { from: 'them', text: 'Call me when the parcel is dry.' },
  ] },
  { contact: 'Nico', messages: [
    { from: 'them', text: 'Talbot is moving again. Watch the boulevard exits.' },
    { from: 'you', text: 'Give me the plate and I will find him.' },
    { from: 'them', text: 'Black Talbot. Tinted glass. Do not lose him.' },
  ] },
  { contact: 'Dario Sarno', messages: [
    { from: 'them', text: 'Coral Loop is mine this week. Bring a faster car.' },
    { from: 'you', text: 'Bring a clean lap and we will see.' },
    { from: 'them', text: 'The heights crew will be watching.' },
  ] },
  { contact: 'Nia Vale', messages: [
    { from: 'them', text: 'Parcel is at Palma Books. The clerk knows your face.' },
    { from: 'you', text: 'Tell the clerk to keep the receipt dry.' },
    { from: 'them', text: 'Receipt is in the brown envelope.' },
  ] },
  { contact: 'Teo Marchetti', messages: [
    { from: 'them', text: 'Your coupe is running hot. Bring it by the garage.' },
    { from: 'you', text: 'After the next drop. Keep the bay open.' },
  ] },
  { contact: 'Lena Ortiz', messages: [
    { from: 'them', text: 'Dispatch is quiet. Too quiet for a Friday.' },
    { from: 'you', text: 'Quiet is good. Keep the channel open.' },
  ] },
  { contact: 'Sgt. Rook', messages: [
    { from: 'them', text: 'VPB desk. Stay off Palm Boulevard after dark.' },
    { from: 'you', text: 'No promises, Sergeant.' },
  ] },
  { contact: 'Marta Vela', messages: [
    { from: 'them', text: 'Dinner at the safehouse on Sunday. Do not bring trouble.' },
    { from: 'you', text: 'I will bring the good bread instead.' },
  ] },
];

// Side job table: short jobs that fit the phone flow, each with its own payout and timer.
const SIDE_JOBS = [
  { name: 'Marina crate run', contact: 'Nico', district: 'MARINA', reward: 1800, timer: 120 },
  { name: 'Palma photo drop', contact: 'Nia Vale', district: 'PALM ROW', reward: 950, timer: 90 },
  { name: 'Boulevard tow', contact: 'Teo Marchetti', district: 'PALM BEACH', reward: 1200, timer: 150 },
  { name: 'Downtown tail', contact: 'Lena Ortiz', district: 'DOWNTOWN', reward: 2100, timer: 180 },
  { name: 'Hills lookout', contact: 'Marta Vela', district: 'HILLS', reward: 1600, timer: 140 },
  { name: 'Dock fuel pickup', contact: 'Surf Shack', district: 'MARINA', reward: 1350, timer: 100 },
  { name: 'Coral Heights delivery', contact: 'Dario Sarno', district: 'CORAL HEIGHTS', reward: 2400, timer: 200 },
];

// Settings table: the short rows the settings tab can show at 768 px.
const SETTINGS = [
  { label: 'Ring tone', value: 'Coral chime' },
  { label: 'Vibration', value: 'On' },
  { label: 'Notifications', value: 'Messages' },
  { label: 'Map pins', value: 'Jobs only' },
  { label: 'Brightness', value: 'Auto' },
  { label: 'Battery saver', value: 'Off' },
];

export class Phone {
  constructor(contacts = [], seed = 7) {
    this.rng = seededRandom(Number(seed) || 1);
    this.clock = 18 * 60 + 40; this.battery = 82; this.signal = 4;
    this.open = false; this.tab = 0; this.selected = 0; this.lastMessage = '';
    this._activeJob = -1; this._signalTarget = this.signal; this._signalTimer = 5;
    const list = Array.isArray(contacts) && contacts.length ? contacts : CONTACTS;
    this.contacts = list.map((row, index) => {
      const source = typeof row === 'string' ? { name: row } : row || {};
      const known = CONTACTS.find((contact) => contact.name === source.name) || {};
      return {
        name: String(source.name || `Contact ${index + 1}`),
        role: String(source.role || known.role || 'Contact'),
        district: String(source.district || known.district || 'VELA CITY'),
      };
    });
    this.threads = THREAD_TABLE.map((thread) => ({
      contact: thread.contact,
      messages: thread.messages.map((message, index) => ({
        from: message.from, text: message.text, at: this.clock - (thread.messages.length - index) * 8,
      })),
    }));
    this.jobs = SIDE_JOBS.map((job) => ({ ...job, active: false, done: false }));
    this.settings = SETTINGS.map((row) => ({ ...row }));
    this.unread = this.threads.map(() => 0); this._read = this.threads.map(() => false);
    this._messageTimer = this._messageDelay();
  }
  _messageDelay() { return 20 + this.rng.range(0, 15); }
  _threadPool(thread) {
    const row = THREAD_TABLE.find((item) => item.contact === thread.contact);
    return row ? row.messages.map((message) => message.text) : ['The coast is quiet. For now.'];
  }
  _tabCount() { return [this.threads.length, this.contacts.length, this.jobs.length, this.settings.length][this.tab] || 0; }
  toggle() {
    this.open = !this.open;
    if (this.open) { this.unread = this.unread.map(() => 0); this._read = this._read.map(() => true); this.selected = 0; }
    return this.open;
  }
  nextTab(step = 1) {
    const move = Number.isFinite(Number(step)) ? Math.trunc(Number(step)) : 1;
    this.tab = ((this.tab + move) % TABS.length + TABS.length) % TABS.length;
    this.selected = 0; return TABS[this.tab];
  }
  select(index) {
    const value = Number(index);
    if (!Number.isFinite(value)) return this.tab;
    this.tab = Math.max(0, Math.min(TABS.length - 1, Math.trunc(value)));
    this.selected = 0;
    return TABS[this.tab];
  }
  update(dt, ctx = {}) {
    ctx = ctx || {};
    const step = Math.max(0, Number(dt) || 0);
    this.clock = (this.clock + step * 0.4) % 1440;
    this.battery = Math.max(0, this.battery - step * 0.02);
    this._signalTimer -= step;
    if (this._signalTimer <= 0) {
      this._signalTimer = 4 + this.rng.range(0, 4); this._signalTarget = 2 + this.rng.range(0, 3);
    }
    this.signal = clamp(this.signal + (this._signalTarget - this.signal) * Math.min(1, step * 0.6), 0, 5);
    this._messageTimer -= step;
    if (this._messageTimer <= 0) {
      this._messageTimer = this._messageDelay();
      const index = this.rng.int(0, this.threads.length - 1);
      const thread = this.threads[index]; const pool = this._threadPool(thread);
      const text = pool[this.rng.int(0, pool.length - 1)] || 'New message on the Vela wire.';
      thread.messages.push({ from: 'them', text, at: this.clock });
      if (thread.messages.length > 10) thread.messages.shift();
      this.unread[index] += 1; this.lastMessage = `${thread.contact}: ${text}`;
      if (typeof ctx.notify === 'function') ctx.notify(this.lastMessage, 2.5);
    }
    return this.header();
  }
  markRead(threadIndex) {
    const value = Number(threadIndex);
    if (!Number.isFinite(value)) return false;
    const index = Math.trunc(value);
    if (index < 0 || index >= this.threads.length) return false;
    this.unread[index] = 0; this._read[index] = true; return true;
  }
  acceptJob(index) {
    const value = Number(index);
    if (!Number.isFinite(value)) return null;
    const row = Math.trunc(value);
    if (row < 0 || row >= this.jobs.length || this.jobs[row].done) return null;
    for (const job of this.jobs) job.active = false;
    this.jobs[row].active = true; this._activeJob = row; this.selected = row;
    return this.jobs[row];
  }
  activeJob() {
    const job = this.jobs[this._activeJob];
    if (job && job.active) return job;
    return this.jobs.find((row) => row.active) || null;
  }
  completeJob(ctx = {}) {
    const job = this.activeJob();
    if (!job) return null;
    const economy = ctx && ctx.economy;
    if (economy && typeof economy.addCash === 'function') economy.addCash(job.reward, `phone: ${job.name}`);
    else if (economy && Number.isFinite(Number(economy.cash))) economy.cash = Number(economy.cash) + job.reward;
    job.active = false; job.done = true; this._activeJob = -1;
    return job;
  }
  lines() {
    const out = [];
    const limit = Math.min(8, this._tabCount());
    for (let i = 0; i < limit; i++) {
      if (this.tab === 0) {
        const thread = this.threads[i];
        out.push({ left: String(thread.contact), right: this.unread[i] > 0 ? `${this.unread[i]} NEW` : 'READ' });
      } else if (this.tab === 1) {
        const contact = this.contacts[i];
        out.push({ left: String(contact.name), right: String(contact.district || contact.role || 'VELA CITY') });
      } else if (this.tab === 2) {
        const job = this.jobs[i];
        out.push({ left: String(job.name), right: job.done ? 'DONE' : job.active ? 'ACTIVE' : `$${job.reward.toLocaleString('en-US')}` });
      } else {
        const row = this.settings[i];
        out.push({ left: String(row.label), right: String(row.value) });
      }
    }
    return out;
  }
  header() {
    const bars = Math.max(0, Math.min(5, Math.round(this.signal)));
    return `${CARRIER} · ${formatClock(this.clock)}\nSIGNAL ${bars}/5 · BATTERY ${Math.round(this.battery)}%`;
  }
  serialize() {
    return { activeJob: this._activeJob, read: this._read.slice(), unread: this.unread.slice(),
      open: this.open, tab: this.tab, battery: this.battery, clock: this.clock };
  }
  restore(data) {
    try {
      if (!data || typeof data !== 'object') return false;
      const value = data.activeJob == null ? -1 : Number(data.activeJob);
      for (const job of this.jobs) job.active = false;
      this._activeJob = -1;
      if (Number.isFinite(value) && value >= 0 && value < this.jobs.length) {
        const index = Math.trunc(value); this.jobs[index].active = true; this._activeJob = index;
      }
      if (Array.isArray(data.read)) this._read = this.threads.map((_, index) => !!data.read[index]);
      if (Array.isArray(data.unread)) this.unread = this.threads.map((_, index) => Math.max(0, Math.round(Number(data.unread[index]) || 0)));
      if (Number.isFinite(Number(data.battery))) this.battery = clamp(Number(data.battery), 0, 100);
      if (Number.isFinite(Number(data.clock))) this.clock = ((Number(data.clock) % 1440) + 1440) % 1440;
      if (typeof data.open === 'boolean') this.open = data.open;
      if (Number.isFinite(Number(data.tab))) this.tab = Math.max(0, Math.min(TABS.length - 1, Math.trunc(Number(data.tab))));
      return true;
    } catch (error) { return false; }
  }
}

export function formatClock(minutes) {
  const value = Number(minutes);
  const total = Number.isFinite(value) ? ((Math.floor(value) % 1440) + 1440) % 1440 : 0;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function batteryColor(level) {
  let value = Number(level);
  if (!Number.isFinite(value)) value = 0;
  if (value > 1) value /= 100;
  value = clamp(value, 0, 1);
  if (value <= 0.2) return '#ff5a4e';
  if (value <= 0.45) return '#ffc35c';
  return '#5ad48a';
}
