// Roadblock module: assembles the cruisers, barriers, spike strip and foot officers for a blockade.
// Roadblock pass: cruisers, barriers, a spike strip and two foot officers.
// The block forms for 1.2 s, holds, fires inside 30 m, and reports a breach or a clear
// through one event string. All random timing comes from the seeded rng PoliceDispatch owns.
// r13 city-systems pass: roadblock timing is unchanged.

import { createVehicle } from './vehicle.js';
import { clamp, seededRandom } from './rng.js';

export function buildRoadblock(scene, playerPos, heading, distance = 34, rng, nextCallsign) {
  const rand = rng || seededRandom(211 + Math.round(distance || 34));
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const x = clamp(playerPos.x + fx * distance, -290, 290);
  const z = clamp(playerPos.z + fz * distance, -260, 220);

  const block = {
    x, z, heading, units: [], barriers: [], spikes: [], officers: [],
    state: 'forming', timer: 0, breached: false, done: false, cleared: false,
    prevAlong: null, rng: rand,
  };

  // Three cruisers angled across the road in a staggered line.
  for (let i = -1; i <= 1; i++) {
    const lateral = i * 6.4;
    const stagger = i === 0 ? 0 : -1.8;
    const cx = x + rx * lateral + fx * stagger;
    const cz = z + rz * lateral + fz * stagger;
    const vehicle = createVehicle(scene, 'police', cx, cz, heading + Math.PI / 2, {});
    vehicle.lightsOn = true;
    vehicle.steadyLights = true;
    vehicle.tickEffects(0);
    const unit = {
      vehicle,
      callSign: nextCallsign ? nextCallsign() : `RB-${i + 2}`,
      unitType: 'Roadblock', state: 'roadblock', health: 130,
      targetPos: new THREE.Vector3(x, 0, z),
    };
    block.units.push(unit);
  }

  // Five striped barriers, one between each pair of cruisers and one beyond each end.
  const cream = new THREE.MeshStandardMaterial({ color: 0xf4ead6, roughness: 0.72 });
  const coral = new THREE.MeshStandardMaterial({ color: 0xe8735a, roughness: 0.7 });
  for (let i = -2; i <= 2; i++) {
    const g = new THREE.Group();
    g.position.set(x + rx * i * 3.2, 0, z + rz * i * 3.2);
    g.rotation.y = heading;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.5), cream);
    rail.position.y = 1.0;
    rail.castShadow = true;
    g.add(rail);
    for (const sx of [-0.82, 0, 0.82]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.78, 0.03), coral);
      stripe.position.set(sx, 1.0, 0.27);
      g.add(stripe);
      const back = stripe.clone();
      back.position.z = -0.27;
      g.add(back);
    }
    scene.add(g);
    block.barriers.push(g);
  }

  // Spike strip: a thin base with twelve dark cones, riding with the middle barrier so the
  // existing clearResponse pass in main.js removes it together with the barrier line.
  const spikeGroup = new THREE.Group();
  const spikeBase = new THREE.Mesh(
    new THREE.BoxGeometry(18.4, 0.08, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x181c20, roughness: 0.55, metalness: 0.35 }),
  );
  spikeBase.position.y = 0.06;
  spikeGroup.add(spikeBase);
  block.spikeBase = spikeBase;
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 12; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), spikeMat);
    cone.position.set(-8.25 + i * 1.5, 0.28, 0);
    cone.castShadow = true;
    spikeGroup.add(cone);
    block.spikes.push(cone);
  }
  spikeGroup.position.set(0, 0, -1.15);
  block.barriers[2].add(spikeGroup);
  block.spikeStrip = spikeGroup;

  // Two officers behind the line, also riding with the outer barriers for clean removal.
  const officerA = buildOfficer(rand);
  const officerB = buildOfficer(rand);
  officerA.group.position.set(0, 0, 2.3);
  officerB.group.position.set(0, 0, 2.3);
  block.barriers[0].add(officerA.group);
  block.barriers[4].add(officerB.group);
  block.officers.push(officerA, officerB);

  for (const unit of block.units) unit.block = block;
  return block;
}

function buildOfficer(rand) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x18222c, roughness: 0.88 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x24313c, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb97c55, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x181c20, roughness: 0.42, metalness: 0.5 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.72, 0.26), cloth);
  legs.position.y = 0.42;
  group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.82, 0.34), vest);
  torso.position.y = 1.16;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), skin);
  head.position.y = 1.66;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.32), cloth);
  cap.position.y = 1.86;
  group.add(cap);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.36), steel);
  belt.position.y = 0.82;
  group.add(belt);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), steel);
  badge.position.set(-0.16, 1.34, 0.18);
  group.add(badge);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.16), cloth);
    arm.position.set(sx * 0.34, 1.1, 0.02);
    group.add(arm);
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.2), vest);
    shoulder.position.set(sx * 0.34, 1.42, 0.02);
    group.add(shoulder);
  }
  const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), steel);
  pistol.position.set(0.34, 1.18, 0.32);
  group.add(pistol);

  group.rotation.y = Math.PI;
  return {
    group,
    pos: new THREE.Vector3(),
    fireTimer: rand.range(0, 1.2),
    heading: Math.PI,
  };
}

export function updateRoadblock(block, dt, player, wanted, dispatch) {
  if (!block || block.done) return null;
  let event = null;
  block.timer += dt;
  if (block.state === 'forming' && block.timer >= 1.2) block.state = 'holding';

  const dx = player.pos.x - block.x;
  const dz = player.pos.z - block.z;
  const along = dx * Math.sin(block.heading) + dz * Math.cos(block.heading);
  const lateral = dx * Math.cos(block.heading) - dz * Math.sin(block.heading);
  const car = player.inVehicle;
  const speed = car ? Math.abs(car.speed || 0) : Math.hypot(player.vel?.x || 0, player.vel?.z || 0);

  // A fast crossing of the barrier line, within the carriageway, is a breach.
  if (!block.breached && block.prevAlong !== null && block.prevAlong < 0 && along >= 0
    && Math.abs(lateral) < 9 && speed > 6) {
    block.breached = true;
    block.state = 'breached';
    if (car) car.damage(14);
    dispatch?.wanted?.addCrime?.('roadblock breach');
    event = 'ROADBLOCK BREACHED';
  }
  block.prevAlong = along;

  const stars = wanted?.stars ?? 0;
  const distance = Math.hypot(dx, dz);
  if (!block.cleared && (block.timer >= 25 || (stars < 3 && distance > 90))) {
    block.cleared = true;
    block.done = true;
    block.state = 'cleared';
    return event || 'ROADBLOCK CLEARED';
  }

  // Officers hold their fire when the player is dead or the block has been cleared.
  if (!player.dead && dispatch && block.state !== 'cleared') {
    for (const officer of block.officers) {
      officer.group.getWorldPosition(officer.pos);
      const d = Math.hypot(officer.pos.x - player.pos.x, officer.pos.z - player.pos.z);
      const desired = Math.atan2(player.pos.x - officer.pos.x, player.pos.z - officer.pos.z);
      officer.heading = desired;
      officer.group.rotation.y = desired - block.heading;
      officer.fireTimer -= dt;
      if (d < 30 && officer.fireTimer <= 0) {
        officer.fireTimer = block.rng.range(1.1, 1.8);
        const from = new THREE.Vector3(officer.pos.x, 1.4, officer.pos.z);
        const to = new THREE.Vector3(
          player.pos.x + block.rng.range(-0.6, 0.6),
          player.pos.y + 1.1,
          player.pos.z + block.rng.range(-0.6, 0.6),
        );
        dispatch.addTracer(from, to, 0xffd38a);
        if (block.rng.chance(0.55)) player.takeDamage(6 + block.rng.range(0, 8));
      }
    }
  }
  return event;
}

export function clearRoadblock(scene, block) {
  if (!block) return;
  const seen = new Set();
  const remove = (obj) => {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    else scene?.remove(obj);
    disposeTree(obj, seen);
  };
  for (const unit of block.units) remove(unit.vehicle?.group);
  for (const barrier of block.barriers) remove(barrier);
  for (const spike of block.spikes) remove(spike);
  for (const officer of block.officers) remove(officer.group);
  block.units.length = 0;
  block.barriers.length = 0;
  block.spikes.length = 0;
  block.officers.length = 0;
  block.cleared = true;
  block.done = true;
}

function disposeTree(root, seen) {
  if (!root || seen.has(root)) return;
  seen.add(root);
  root.traverse?.((obj) => {
    if (seen.has(obj)) return;
    seen.add(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.dispose();
    }
  });
  if (root.geometry) root.geometry.dispose();
  if (root.material) {
    const mats = Array.isArray(root.material) ? root.material : [root.material];
    for (const mat of mats) mat.dispose();
  }
}
