// Config pass: tuning and presets frozen for the r7 entry.
// VELA CITY — every tuning number, colour, story job and radio station in one place.
// The city is a fictional Mediterranean-American coast at late golden hour: coral low-rises,
// teal glass downtown, a beach boulevard, a marina and palm hills. Units are metres.
// r13 city-systems pass: tuning tables are unchanged.

export const PALETTE = {
  coral: '#e8735a',
  coralDeep: '#b74b3c',
  sand: '#d9b98a',
  cream: '#f4ead6',
  tealGlass: '#2f7f86',
  tealDeep: '#14555f',
  palm: '#3f6b3a',
  asphalt: '#3b4148',
  sidewalk: '#b9a894',
  neonPink: '#ff3d8b',
  neonCyan: '#39e6e0',
  sea: '#1a7f9c',
  seaDeep: '#0d4f68',
  skyWarm: '#ffd7a8',
  shadow: '#2c5c68',
  ink: '#101820',
  gold: '#ffc35c',
};

export const CITY_LAYOUT = {
  halfX: 330,
  halfZ: 300,
  seaZ: 238,
  beachZ: [204, 238],
  boulevardZ: 196,
  roadHalf: 9,
  block: 80,
  avenues: [-240, -160, -80, 0, 80, 160, 240],
  streets: [-160, -80, 0, 80, 160],
  downtown: { x: 40, z: -40, width: 220, depth: 200 },
  marina: { x: -150, z: 220, width: 210, depth: 90 },
  hillsZ: -195,
  spawn: { x: 24, z: 214, heading: Math.PI },
  raceStart: { x: 6, z: 120, heading: Math.PI },
  bounds: { minX: -322, maxX: 322, minZ: -292, maxZ: 300 },
};

export const PLAYER = {
  walk: 4,
  sprint: 7,
  jump: 5.2,
  height: 1.8,
  eye: 1.7,
  radius: 0.42,
  maxHealth: 100,
  maxArmour: 100,
  respawn: { x: 24, z: 214 },
};

export const VEHICLE_SPECS = {
  coupe: {
    label: 'Vela GT', mass: 1.1, top: 46, accel: 15, turn: 2.3, grip: 7.6,
    brake: 26, health: 100, wheelBase: 2.7, width: 1.95, length: 4.5, height: 1.28,
    body: 0xff5a4e, seats: 2, style: 'sleek',
  },
  sedan: {
    label: 'Palma 4', mass: 1.35, top: 39, accel: 11.5, turn: 2.0, grip: 7.2,
    brake: 24, health: 115, wheelBase: 2.9, width: 2.0, length: 4.8, height: 1.45,
    body: 0xf2f0e8, seats: 4, style: 'boxy',
  },
  van: {
    label: 'Surf Hauler', mass: 1.9, top: 32, accel: 8.5, turn: 1.65, grip: 6.6,
    brake: 20, health: 150, wheelBase: 3.3, width: 2.2, length: 5.5, height: 2.05,
    body: 0x4ea6a2, seats: 2, style: 'van',
  },
  police: {
    label: 'VPB Cruiser', mass: 1.45, top: 48, accel: 14.5, turn: 2.15, grip: 7.9,
    brake: 26, health: 135, wheelBase: 3.0, width: 2.05, length: 4.9, height: 1.5,
    body: 0xf2f0e8, seats: 2, style: 'police', siren: true,
  },
  motorbike: {
    label: 'Kestrel 600', mass: 0.55, top: 52, accel: 18, turn: 2.8, grip: 7.0,
    brake: 22, health: 70, wheelBase: 1.5, width: 0.7, length: 2.2, height: 1.1,
    body: 0x2ad0c8, seats: 1, style: 'bike',
  },
};

export const CAMERA = {
  onFoot: { arm: 4.5, height: 1.7, fov: 60, look: 1.5, minPitch: -25, maxPitch: 60 },
  car: { arm: 7, fov: 68, look: 8, height: 2.2 },
  cover: { arm: 7.4, height: 5.0, lateral: 1.7, fov: 31, targetAhead: 19, targetHeight: 0.66 },
};

export const TRAFFIC = { cars: 24, peds: 40, lane: 3.2, carSpeed: 11, pedSpeed: 1.35 };

export const WEAPONS = {
  fists: { label: 'FISTS', ammo: -1, damage: 8, rate: 0.4, range: 2.2 },
  pistol: { label: 'MARISOL .9', ammo: 48, damage: 24, rate: 0.32, range: 55 },
  smg: { label: 'SURF SMG', ammo: 150, damage: 14, rate: 0.085, range: 70 },
};

export const MISSION_DEFS = [
  {
    id: 'courier-run', chapter: 'CH. 1 GOLDEN HOUR', title: 'Courier Run', giver: 'Marisol',
    summary: 'Three drops before the sun goes down. Rico Vela carries the syndicate parcel across Vela City.',
    objective: 'Deliver the parcel to Palma Books on Palm Row',
    stages: ['Collect the parcel at Hotel Azura', 'Deliver to Palma Books on Palm Row', 'Drop the receipt at Sunset Diner'],
    reward: 4200, timeLimit: 300, unlock: 'hot-pursuit', marker: { x: 34, z: 22 },
    dialogue: [
      { speaker: 'MARISOL', text: 'Rico Vela. One last run and your debt to the Marisol syndicate is paper.' },
      { speaker: 'RICO', text: 'Three stops. No sirens. Easy money, Marisol.' },
    ],
  },
  {
    id: 'hot-pursuit', chapter: 'CH. 2 PAPER MOON', title: 'Hot Pursuit', giver: 'Nico',
    summary: 'A courier turned informant. Run his black Talbot off the boulevard before he reaches the marina.',
    objective: 'Ram the fleeing Talbot until it stalls',
    stages: ['Chase the Talbot down Palm Boulevard', 'Ram it off the road', 'Lose the police and return to the safehouse'],
    reward: 7600, timeLimit: 210, unlock: 'marina-heist', marker: { x: -60, z: 196 },
    dialogue: [
      { speaker: 'NICO', text: 'Talbot is running for the marina with the ledger. Put him in the wall, Rico.' },
      { speaker: 'MARISOL', text: 'And Rico? The police are already listening. Keep it quiet.' },
    ],
  },
  {
    id: 'marina-heist', chapter: 'CH. 3 NEON TIDE', title: 'Marina Heist', giver: 'Nico',
    summary: 'Three crates of Marisol contraband on the marina docks. Ninety seconds before the patrol boats wake up.',
    objective: 'Collect three crates on the marina docks',
    stages: ['Collect crate one at the chandlery', 'Collect crate two by the fuel dock', 'Collect crate three and escape'],
    reward: 12400, timeLimit: 90, unlock: 'race', marker: { x: -40, z: 250 },
    dialogue: [
      { speaker: 'NICO', text: 'Three crates, ninety seconds, and every cop on the coast awake. Move, Rico.' },
      { speaker: 'MARISOL', text: 'Bring the crates and I burn your ledger. That is the last favour.' },
    ],
  },
];

export const RADIO_STATIONS = [
  { name: 'Coral 88 FM', freq: '88.1', track: 'Sunset Static', color: '#ff3d8b', mood: 'synthwave' },
  { name: 'Palma Wave', freq: '94.7', track: 'Golden Tide', color: '#39e6e0', mood: 'surf' },
  { name: 'Vela Soul', freq: '101.3', track: 'Marisol Nights', color: '#ffc35c', mood: 'soul' },
  { name: 'Night Tide', freq: '107.9', track: 'Neon Buoy', color: '#ff5a4e', mood: 'dusk' },
];

export const DISTRICTS = [
  { name: 'PALM BEACH', x: 60, z: 216 },
  { name: 'MARINA', x: -145, z: 254 },
  { name: 'DOWNTOWN', x: 80, z: -40 },
  { name: 'PALM ROW', x: 0, z: 90 },
  { name: 'CORAL HEIGHTS', x: 210, z: 60 },
  { name: 'HILLS', x: -180, z: -232 },
];

export const RACE = {
  laps: 2, rivals: 3, checkpointRadius: 13,
  names: ['Dario Sarno', 'Nia Vale', 'Teo Marchetti'],
  colors: [0x8b2fd6, 0x1fa8c9, 0xd9a13a],
  route: [
    { x: 0, z: 160 }, { x: 0, z: 96 }, { x: 0, z: 16 }, { x: 0, z: -72 },
    { x: -72, z: -160 }, { x: -160, z: -160 }, { x: -240, z: -96 },
    { x: -240, z: 0 }, { x: -160, z: 80 }, { x: -80, z: 120 },
    { x: 0, z: 120 },
  ],
};

export const POLICE = {
  maxStars: 5, decay: 30, sightRange: 78, copRange: 2.4,
  callSigns: ['PALM-1', 'VELA-4', 'SURF-7', 'MARINA-2', 'CORAL-9', 'HILLS-3'],
  unitTypes: ['Cruiser', 'Interceptor', 'K-9 Unit', 'Air 1', 'Roadblock'],
};

export const SAVE_KEY = 'vela-city.save.v1';
export const TITLE = 'VELA CITY';
export const TAGLINE = 'One last run across the coast.';
