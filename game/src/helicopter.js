// Air support pass: the r7 air unit, its orbit, searchlight and event callouts.
// AIR-1 and AIR-2 share one model builder and one flight model. Every random choice comes
// from the seeded rng handed in by PoliceDispatch, so a replay stages the same air picture.
// r13 city-systems pass: air support is unchanged.

import { clamp, damp, dist2, angleLerp, seededRandom } from './rng.js';

const UP = new THREE.Vector3(0, 1, 0);

// Shared air tuning. Stars tighten the orbit, pull the altitude down and speed the orbit up.
const AIR = {
  minRadius: 52,
  maxRadius: 64,
  minAltitude: 28,
  maxAltitude: 34,
  orbitSpeed: 0.17,
  orbitSpeedPerStar: 0.032,
  follow: 1.15,
  followPerStar: 0.16,
  yawDamp: 3.2,
  bankDamp: 4.2,
  rotorSpin: 34,
  tailSpin: 48,
  strobePeriod: 0.55,
  beamLength: 30,
  spotMin: 0.18,
  spotMax: 0.34,
  oppositeAltitude: 12,
};

// Short HUD labels, one per flight state. The call sign is prefixed by airStatus().
const STATUS = {
  arriving: 'INBOUND',
  spotlight: 'SPOTLIGHT',
  sweeping: 'SWEEPING',
  returning: 'RTB',
  orbit: 'ORBIT',
};

export function createAirUnit(scene, playerPos, index = 0, rng) {
  const rand = rng || seededRandom(101 + index * 37);
  const phase = rand.range(0, Math.PI * 2);
  const group = new THREE.Group();
  group.name = index === 0 ? 'AIR-1' : 'AIR-2';

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14555f, roughness: 0.48, metalness: 0.32 });
  const creamMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.6, metalness: 0.12 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fd8de, roughness: 0.14, metalness: 0.72 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.55, metalness: 0.35 });
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x3b4148, roughness: 0.7, metalness: 0.3 });

  const addBox = (w, h, d, mat, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const addCyl = (rt, rb, h, seg, mat, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Fuselage, canopy, tail boom and fin.
  addBox(2.4, 1.25, 5.2, bodyMat, 0, 0, 0.3);
  addBox(1.85, 0.78, 1.5, glassMat, 0, 0.58, 1.85);
  addBox(1.7, 0.36, 1.9, bodyMat, 0, -0.12, 2.1);
  addBox(0.52, 0.4, 4.5, creamMat, 0, 0.24, -4.25);
  addBox(0.18, 1.35, 0.72, creamMat, 0, 0.92, -6.25);
  addBox(0.14, 0.6, 1.05, creamMat, 0, 0.58, -6.5);
  addBox(1.9, 0.07, 0.52, creamMat, 0, 0.58, -5.55);
  for (const sx of [-1, 1]) addBox(0.1, 0.42, 0.34, creamMat, sx * 0.86, 0.58, -5.55);

  // Nose cone, door seams, mast fairing and a small belly camera.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.05, 8), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.02, 3.05);
  nose.castShadow = true;
  group.add(nose);
  for (const sx of [-1, 1]) {
    addBox(0.04, 0.62, 1.5, creamMat, sx * 1.21, 0.02, 0.05);
    addBox(0.04, 0.16, 1.1, darkMat, sx * 1.22, 0.58, -0.55);
  }
  addCyl(0.18, 0.26, 0.3, 8, darkMat, 0, 0.72, 0.12);
  addBox(0.34, 0.22, 0.42, darkMat, 0, -0.72, 2.1);
  const lens = addCyl(0.1, 0.1, 0.08, 8, glassMat, 0, -0.82, 2.28);
  lens.rotation.x = Math.PI / 2;

  // Tail registration stripes and a thin antenna above the boom.
  addBox(0.2, 0.12, 1.2, bodyMat, 0, 0.46, -4.15);
  addBox(0.16, 0.1, 0.7, creamMat, 0, 0.52, -5.05);
  addCyl(0.015, 0.015, 0.7, 5, darkMat, 0.24, 0.6, -5.35);

  // Skids and their struts.
  const skidL = addCyl(0.07, 0.07, 3.5, 8, skidMat, -1.02, -0.92, 0.15);
  skidL.rotation.x = Math.PI / 2;
  const skidR = addCyl(0.07, 0.07, 3.5, 8, skidMat, 1.02, -0.92, 0.15);
  skidR.rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) {
    addBox(0.08, 0.42, 0.08, skidMat, sx * 1.02, -0.68, 0.9);
    addBox(0.08, 0.42, 0.08, skidMat, sx * 1.02, -0.68, -0.9);
  }

  // Main rotor: hub plus four blades on a spinning group.
  addCyl(0.22, 0.22, 0.38, 10, darkMat, 0, 0.82, 0.1);
  const rotor = new THREE.Group();
  rotor.position.set(0, 1.02, 0.1);
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.07, 0.3), darkMat);
    blade.rotation.y = i * Math.PI / 2;
    blade.castShadow = true;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.42), darkMat);
    grip.position.x = 0.58;
    blade.add(grip);
    rotor.add(blade);
  }
  group.add(rotor);

  // Tail rotor on a vertical spinning group.
  addCyl(0.1, 0.1, 0.26, 8, darkMat, 0.42, 0.58, -6.3);
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.48, 0.58, -6.3);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.3, 0.16), darkMat);
    blade.rotation.x = i * Math.PI / 2;
    tailRotor.add(blade);
  }
  group.add(tailRotor);

  // Belly strobes: one red, one blue, alternating on the 0.55 s clock.
  const red = new THREE.Sprite(new THREE.SpriteMaterial({
    map: strobeTexture(), color: 0xff3344, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  red.scale.set(0.85, 0.85, 1);
  red.position.set(-0.58, -0.56, 0.3);
  group.add(red);
  const blue = new THREE.Sprite(new THREE.SpriteMaterial({
    map: strobeTexture(), color: 0x3d8bff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  blue.scale.set(0.85, 0.85, 1);
  blue.position.set(0.58, -0.56, 0.3);
  group.add(blue);

  // Searchlight cone and the ground pool live in the scene, not in the hull group.
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(6.4, 30, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe7b0, transparent: true, opacity: 0.13,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }),
  );
  scene.add(beam);
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(7.6, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffe7b0, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  spot.rotation.x = -Math.PI / 2;
  scene.add(spot);

  const callSign = index === 0 ? 'AIR-1' : 'AIR-2';
  const radius = 58 + (index === 1 ? 3 : 0);
  group.position.set(
    playerPos.x + Math.sin(phase) * radius,
    30 + (index === 1 ? 12 : 0),
    playerPos.z + Math.cos(phase) * radius,
  );
  group.rotation.y = Math.atan2(playerPos.x - group.position.x, playerPos.z - group.position.z);
  scene.add(group);

  const unit = {
    group, rotor, tailRotor, beam, spot, callSign,
    unitType: index === 0 ? 'Air 1' : 'Air 2',
    state: 'arriving', orbit: phase, target: new THREE.Vector3(),
    index, phase, rand,
    time: 0, bank: 0, strobeClock: 0,
    settled: false, locked: false, sweeping: false, returnSent: false,
    spotOpacity: 0.22, lastX: group.position.x, lastZ: group.position.z,
  };
  unit.extras = { beam, spot, strobeRed: red, strobeBlue: blue };
  return unit;
}

export function updateAirUnit(unit, dt, player, wanted, world) {
  if (!unit || !unit.group) return null;
  unit.time += dt;
  const stars = wanted?.stars || 0;
  const inSight = !!wanted?.inSight;

  // A unit told to go home emits its callout once, before the frame's other transitions.
  if (unit.retireStars !== undefined && unit.retireStars < 3 && !unit.returnSent) {
    unit.returnSent = true;
    unit.state = 'returning';
    return `${unit.callSign}: returning to base`;
  }

  const dir = unit.index === 1 ? -1 : 1;
  const radius = clamp(AIR.maxRadius - stars * 2.2, AIR.minRadius, AIR.maxRadius)
    + (unit.index === 1 ? 2 : 0);
  const baseAlt = clamp(AIR.maxAltitude - stars * 1.1, AIR.minAltitude, AIR.maxAltitude);
  // AIR-2 mirrors AIR-1's orbit and rides twelve metres higher so the pair never overlaps.
  const altitude = baseAlt + (unit.index === 1 ? AIR.oppositeAltitude : 0);
  unit.orbit += dt * (AIR.orbitSpeed + stars * AIR.orbitSpeedPerStar) * dir;

  const px = player.pos.x;
  const pz = player.pos.z;
  const desiredX = px + Math.sin(unit.orbit) * radius;
  const desiredZ = pz + Math.cos(unit.orbit) * radius;
  const desiredY = altitude + Math.sin(unit.time * 0.55 + unit.phase) * 1.6;
  const follow = AIR.follow + stars * AIR.followPerStar;
  unit.group.position.x = damp(unit.group.position.x, desiredX, follow, dt);
  unit.group.position.y = damp(unit.group.position.y, desiredY, 1.1, dt);
  unit.group.position.z = damp(unit.group.position.z, desiredZ, follow, dt);

  // Yaw to face the player, then bank against the turn and pitch slightly nose-down.
  const desiredYaw = Math.atan2(px - unit.group.position.x, pz - unit.group.position.z);
  const previousYaw = unit.group.rotation.y;
  unit.group.rotation.y = angleLerp(previousYaw, desiredYaw, 1 - Math.exp(-AIR.yawDamp * dt));
  const turn = ((unit.group.rotation.y - previousYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const bankTarget = clamp(-turn / Math.max(dt, 0.001) * 0.16, -0.42, 0.42);
  unit.bank = damp(unit.bank, bankTarget, AIR.bankDamp, dt);
  unit.group.rotation.z = unit.bank;

  const moveX = unit.group.position.x - unit.lastX;
  const moveZ = unit.group.position.z - unit.lastZ;
  const groundSpeed = Math.hypot(moveX, moveZ) / Math.max(dt, 0.001);
  const pitchTarget = -0.035 - clamp(groundSpeed * 0.008, 0, 0.09);
  unit.group.rotation.x = damp(unit.group.rotation.x, pitchTarget, 3.4, dt);
  unit.lastX = unit.group.position.x;
  unit.lastZ = unit.group.position.z;

  // Rotors and strobes.
  unit.rotor.rotation.y += dt * AIR.rotorSpin;
  unit.tailRotor.rotation.x += dt * AIR.tailSpin;
  unit.strobeClock += dt;
  const strobeOn = Math.floor(unit.strobeClock / AIR.strobePeriod) % 2 === 0;
  if (unit.extras?.strobeRed) unit.extras.strobeRed.visible = strobeOn;
  if (unit.extras?.strobeBlue) unit.extras.strobeBlue.visible = !strobeOn;

  // Searchlight target: ahead of the player when seen, figure-eight over the last known point.
  if (inSight) {
    let vx = 0;
    let vz = 0;
    if (player.inVehicle) {
      const car = player.inVehicle;
      vx = car.velocity?.x || Math.sin(car.heading) * (car.speed || 0);
      vz = car.velocity?.z || Math.cos(car.heading) * (car.speed || 0);
    } else if (player.vel) {
      vx = player.vel.x || 0;
      vz = player.vel.z || 0;
    }
    const moving = Math.hypot(vx, vz);
    const ahead = 4 + clamp(moving * 0.08, 0, 4);
    if (moving > 0.4) {
      unit.target.set(px + vx / moving * ahead, 0.2, pz + vz / moving * ahead);
    } else {
      const h = player.heading || 0;
      unit.target.set(px + Math.sin(h) * ahead, 0.2, pz + Math.cos(h) * ahead);
    }
  } else {
    const last = wanted?.lastKnown || player.pos;
    const t = unit.time + unit.phase;
    unit.target.set(
      last.x + Math.sin(t * 0.85) * 15,
      0.2,
      last.z + Math.sin(t * 1.7) * 8,
    );
  }

  const beamDir = new THREE.Vector3().subVectors(unit.target, unit.group.position);
  const beamLen = beamDir.length() || 1;
  beamDir.multiplyScalar(1 / beamLen);
  unit.beam.position.copy(unit.group.position).lerp(unit.target, 0.5);
  unit.beam.quaternion.setFromUnitVectors(UP, beamDir.clone().negate());
  unit.beam.scale.y = clamp(beamLen / AIR.beamLength, 0.8, 2.2);
  unit.beam.material.opacity = damp(unit.beam.material.opacity, inSight ? 0.15 : 0.11, 2.4, dt);

  unit.spot.position.set(unit.target.x, 0.16, unit.target.z);
  const spotTarget = inSight ? 0.3 : 0.22;
  unit.spotOpacity = damp(unit.spotOpacity, spotTarget + Math.sin(unit.time * 2.1) * 0.02, 2.6, dt);
  unit.spot.material.opacity = clamp(unit.spotOpacity, AIR.spotMin, AIR.spotMax);

  // State transitions emit one event, never one per frame.
  let event = null;
  const orbitDistance = dist2(unit.group.position.x, unit.group.position.z, desiredX, desiredZ);
  if (!unit.settled) {
    if (orbitDistance < 14) {
      unit.settled = true;
      unit.state = inSight ? 'spotlight' : 'sweeping';
      event = `${unit.callSign} overhead`;
    }
  } else if (inSight && !unit.locked) {
    unit.locked = true;
    unit.sweeping = false;
    unit.state = 'spotlight';
    event = `${unit.callSign}: suspect in the beam`;
  } else if (!inSight && unit.locked) {
    unit.locked = false;
    unit.sweeping = true;
    unit.state = 'sweeping';
    event = `${unit.callSign}: suspect out of sight, sweeping`;
  } else if (!inSight) {
    unit.sweeping = true;
    unit.state = 'sweeping';
  } else {
    unit.state = 'spotlight';
  }
  return event;
}

export function retireAirUnit(scene, unit) {
  if (!unit) return;
  const seen = new Set();
  const remove = (obj) => {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    else scene?.remove(obj);
  };
  remove(unit.group);
  remove(unit.beam);
  remove(unit.spot);
  remove(unit.extras?.strobeRed);
  remove(unit.extras?.strobeBlue);
  disposeTree(unit.group, seen);
  disposeTree(unit.beam, seen);
  disposeTree(unit.spot, seen);
  disposeTree(unit.extras?.strobeRed, seen);
  disposeTree(unit.extras?.strobeBlue, seen);
  unit.retired = true;
}

export function airStatus(unit, wanted) {
  if (!unit) return '';
  const stars = wanted?.stars ?? 0;
  if (stars < 3 || unit.state === 'returning' || unit.retireStars !== undefined) {
    return `${unit.callSign} ${STATUS.returning}`;
  }
  if (unit.state === 'spotlight' || unit.locked) return `${unit.callSign} ${STATUS.spotlight}`;
  if (unit.state === 'sweeping') return `${unit.callSign} ${STATUS.sweeping}`;
  if (unit.state === 'arriving') return `${unit.callSign} ${STATUS.arriving}`;
  return `${unit.callSign} ${STATUS.orbit}`;
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

let strobeTex = null;
function strobeTexture() {
  if (strobeTex) return strobeTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  strobeTex = new THREE.CanvasTexture(c);
  return strobeTex;
}
