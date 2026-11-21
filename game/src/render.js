// Render module: sets up the renderer, golden-hour sky, fog, shadows and chase camera.
// Render pass: sky, fog and camera rig frozen for the r7 entry.
// Exposure pass: golden-hour exposure and fog frozen from the frame fix.
// Renderer, sky, sun, fog, shadows, tone mapping and the third-person camera rig with wall
// avoidance. One directional golden-hour sun from the south-west, teal hemisphere fill and a
// gradient sky dome whose horizon matches the exponential fog. A dusk preset serves the race.
// r13 city-systems pass: rendering is unchanged.

import { PALETTE, CAMERA } from './config.js';
import { clamp, damp, angleLerp } from './rng.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.84;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x1a3f4c, 1);
  return renderer;
}

export function createSky(scene) {
  const uniforms = {
    top: { value: new THREE.Color('#123f55') },
    horizon: { value: new THREE.Color('#ffbe78') },
    sunColor: { value: new THREE.Color('#ffce8a') },
    sunDir: { value: new THREE.Vector3(-0.72, 0.21, 0.66).normalize() },
    dusk: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor;
      uniform vec3 sunDir; uniform float dusk;
      void main(){
        float h = clamp(vDir.y * 1.15 + 0.06, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.62));
        float d = max(dot(normalize(vDir), sunDir), 0.0);
        col += sunColor * pow(d, 900.0) * (2.0 - dusk * 0.8);
        col += sunColor * pow(d, 22.0) * (1.25 - dusk * 0.45);
        col += sunColor * pow(d, 3.0) * (0.30 - dusk * 0.08);
        col = mix(col, col * vec3(1.0, 0.72, 0.86) + vec3(0.05, 0.0, 0.08), dusk * 0.55);
        float band = smoothstep(0.0, 0.10, vDir.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  dome.name = 'sky-dome';
  scene.add(dome);
  scene.fog = new THREE.FogExp2(0xd89a64, 0.00135);
  return dome;
}

export function setupShadows(scene) {
  const hemi = new THREE.HemisphereLight(0xffe6c2, 0x2c5c68, 0.82);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb575, 2.2);
  sun.position.set(-92, 27, 84);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -65;
  sun.shadow.camera.right = 65;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0014;
  sun.shadow.normalBias = 0.045;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x8fe0e6, 0.5);
  rim.position.set(70, 34, -90);
  scene.add(rim);
  return { sun, hemi, rim };
}

export class CameraRig {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.yaw = Math.PI;
    this.pitch = 6;
    this.mode = 'onfoot';
    this.arm = CAMERA.onFoot.arm;
    this.pos = new THREE.Vector3(24, 4, 220);
    this.look = new THREE.Vector3(24, 1.7, 214);
    this.fov = CAMERA.onFoot.fov;
    this.shake = 0;
    this.override = null;
    this.ray = new THREE.Raycaster();
    this.blockers = [];
    this._tmp = new THREE.Vector3();
  }

  setBlockers(list) {
    this.blockers = list || [];
  }

  setMode(mode) {
    this.mode = mode;
    this.arm = mode === 'car' ? CAMERA.car.arm : CAMERA.onFoot.arm;
    this.fov = mode === 'car' ? CAMERA.car.fov : CAMERA.onFoot.fov;
    this.pitch = mode === 'car' ? 7 : 6;
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch = clamp(this.pitch - dy * 0.0022, CAMERA.onFoot.minPitch, CAMERA.onFoot.maxPitch);
  }

  blocked(from, to) {
    const dir = this._tmp.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.001) return false;
    dir.divideScalar(len);
    for (const b of this.blockers) {
      const hit = this.ray.ray.intersectBox(
        new THREE.Box3(new THREE.Vector3(b.minX, 0, b.minZ), new THREE.Vector3(b.maxX, b.height || 20, b.maxZ)),
        new THREE.Vector3(),
      );
      if (hit && hit.distanceTo(from) < len - 0.4) return true;
    }
    return false;
  }

  updateCamera(target, dt, speed = 0) {
    if (!target) return;
    const car = this.mode === 'car';
    const arm = car ? CAMERA.car.arm + Math.min(speed / 46, 1) * 2.6 : this.arm;
    const height = car ? CAMERA.car.height : CAMERA.onFoot.height;
    const wantFov = (car ? CAMERA.car.fov : CAMERA.onFoot.fov) + (car ? Math.min(speed * 0.16, 8) : 0);
    const yaw = this.yaw;
    const pitch = this.pitch * Math.PI / 180;
    const ahead = car ? CAMERA.car.look : CAMERA.onFoot.look;
    const tx = target.x + Math.sin(yaw) * ahead;
    const tz = target.z + Math.cos(yaw) * ahead;
    const lookY = target.y + (car ? 1.0 : CAMERA.onFoot.eye);
    const dist = arm * Math.cos(pitch);
    let px = target.x - Math.sin(yaw) * dist;
    let pz = target.z - Math.cos(yaw) * dist;
    let py = target.y + height + Math.sin(pitch) * arm;
    const from = new THREE.Vector3(px, py, pz);
    const to = new THREE.Vector3(target.x, target.y + height, target.z);
    if (this.blocked(from, to)) {
      px = target.x - Math.sin(yaw) * 1.9;
      pz = target.z - Math.cos(yaw) * 1.9;
      py = target.y + height + 0.9;
    }
    this.pos.x = damp(this.pos.x, px, 9, dt);
    this.pos.y = damp(this.pos.y, py, 8, dt);
    this.pos.z = damp(this.pos.z, pz, 9, dt);
    this.look.x = damp(this.look.x, tx, 12, dt);
    this.look.y = damp(this.look.y, lookY, 10, dt);
    this.look.z = damp(this.look.z, tz, 12, dt);
    this.camera.position.copy(this.pos);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.camera.position.y += this.shake * 0.4;
    }
    this.camera.lookAt(this.look);
    this.fov = damp(this.fov, wantFov, 4, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  followRoad(target, dt, speed) {
    this.updateCamera(target, dt, speed);
  }
}

export function updateCamera(rig, target, dt, speed) {
  rig.updateCamera(target, dt, speed);
}

export function setTimeOfDay(scene, sky, lights, mode = 'golden') {
  const dusk = mode === 'dusk';
  sky.material.uniforms.dusk.value = dusk ? 1 : 0;
  sky.material.uniforms.top.value.set(dusk ? '#161f3d' : '#123f55');
  sky.material.uniforms.horizon.value.set(dusk ? '#ff6f61' : '#ffbe78');
  sky.material.uniforms.sunDir.value.set(dusk ? -0.58 : -0.72, dusk ? 0.055 : 0.21, dusk ? 0.8 : 0.66).normalize();
  scene.fog.color.set(dusk ? '#7a4b63' : '#d89a64');
  scene.fog.density = dusk ? 0.0030 : 0.00135;
  lights.sun.color.set(dusk ? 0xff9a62 : 0xffb575);
  lights.sun.intensity = dusk ? 1.15 : 2.2;
  lights.sun.position.set(dusk ? -120 : -92, dusk ? 9 : 27, dusk ? 110 : 84);
  lights.hemi.color.set(dusk ? 0x6f7ac9 : 0xffe6c2);
  lights.hemi.groundColor.set(dusk ? 0x171c33 : 0x2c5c68);
  lights.hemi.intensity = dusk ? 0.55 : 0.82;
  lights.rim.intensity = dusk ? 0.85 : 0.5;
  lights.rim.color.set(dusk ? 0xff4f9a : 0x8fe0e6);
}
