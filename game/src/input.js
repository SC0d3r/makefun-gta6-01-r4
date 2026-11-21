// Input module: maps keyboard, mouse and pointer-lock events into held and edge-triggered actions.
// Input pass: keyboard and mouse bindings frozen for the r7 entry.
// Keyboard, mouse and pointer-lock input. Held keys answer isPressed(); edge presses answer
// wasPressed() exactly once so interactions, weapon swaps and menu toggles never double-fire.
// r13 city-systems pass: key bindings are unchanged.

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, left: false, right: false };
    this.leftPressed = false;
    this.rightPressed = false;
    this.locked = false;
    this.enabled = true;
    this._onKeys = [];
    this.bind();
  }

  bind() {
    addEventListener('keydown', (e) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.down.has('ShiftLeft') || this.down.has('ShiftRight')) this.pressed.add('Shift');
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });
    addEventListener('blur', () => this.down.clear());
    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.rightPressed = true; }
      this.requestLock();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isPressed(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  axis(neg, pos) {
    return (this.isPressed(pos) ? 1 : 0) - (this.isPressed(neg) ? 1 : 0);
  }

  takeMouse() {
    const out = { dx: this.mouse.dx, dy: this.mouse.dy, left: this.leftPressed, right: this.rightPressed };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.leftPressed = false;
    this.rightPressed = false;
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}

export function pointerLock(dom) {
  return {
    request: () => dom.requestPointerLock && dom.requestPointerLock(),
    release: () => document.pointerLockElement && document.exitPointerLock(),
    get active() { return document.pointerLockElement === dom; },
  };
}
