export interface Controls {
  steerX: number;
  steerY: number;
  flap: boolean;
  brake: boolean;
  interact: boolean;
}

const STICK_RADIUS = 64;

export class Input {
  readonly state: Controls = { steerX: 0, steerY: 0, flap: false, brake: false, interact: false };
  readonly stick = { active: false, originX: 0, originY: 0, x: 0, y: 0 };
  invertY = false;
  private active = true;
  touch = window.matchMedia('(pointer: coarse)').matches;
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private lookId: number | null = null;
  readonly look = { dx: 0, dy: 0, held: false };
  private buttons = { flap: false, brake: false, interact: false };
  private interactLatch = false;
  onFirstInput: (() => void) | null = null;

  get enabled(): boolean {
    return this.active;
  }

  set enabled(value: boolean) {
    this.active = value;
    this.keys.clear();
    this.interactLatch = false;
    this.buttons.flap = this.buttons.brake = false;
  }

  constructor(private surface: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || !this.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      const control = e.target instanceof HTMLElement && e.target.closest('button, a, input, textarea, select') !== null;
      if (control && (e.code === 'Enter' || e.code === 'Space')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' || e.code === 'Enter') this.interactLatch = true;
      const flying = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
      if (flying) e.preventDefault();
      if (flying || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.first();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    surface.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.touch = true;
      if (e.button === 2) {
        if (this.lookId === null) {
          this.lookId = e.pointerId;
          this.look.held = true;
          surface.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      surface.setPointerCapture(e.pointerId);
      this.stick.active = true;
      this.stick.originX = e.clientX;
      this.stick.originY = e.clientY;
      this.stick.x = this.stick.y = 0;
      this.first();
    });
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.lookId && this.look.held) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        return;
      }
      if (e.pointerId !== this.pointerId) return;
      let dx = (e.clientX - this.stick.originX) / STICK_RADIUS;
      let dy = (e.clientY - this.stick.originY) / STICK_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
        this.stick.originX = e.clientX - dx * STICK_RADIUS;
        this.stick.originY = e.clientY - dy * STICK_RADIUS;
      }
      this.stick.x = dx;
      this.stick.y = dy;
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.lookId) {
        this.lookId = null;
        this.look.held = false;
        return;
      }
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.stick.active = false;
      this.stick.x = this.stick.y = 0;
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private first(): void {
    this.onFirstInput?.();
    this.onFirstInput = null;
  }

  bindButton(element: HTMLElement, name: 'flap' | 'brake' | 'interact'): void {
    const set = (down: boolean) => (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.buttons[name] = down;
      if (down && name === 'interact') this.interactLatch = true;
      if (down) this.first();
    };
    element.addEventListener('pointerdown', set(true));
    element.addEventListener('pointerup', set(false));
    element.addEventListener('pointercancel', set(false));
    element.addEventListener('pointerleave', set(false));
  }

  update(): Controls {
    if (!this.active) {
      const idle = this.state;
      idle.steerX = idle.steerY = 0;
      idle.flap = idle.brake = idle.interact = false;
      this.interactLatch = false;
      return idle;
    }
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y -= 1;
    let flap = k.has('Space') || this.buttons.flap;
    let brake = k.has('ShiftLeft') || k.has('ShiftRight') || this.buttons.brake;

    if (this.stick.active) {
      x += this.stick.x;
      y -= this.stick.y;
    }

    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.14 ? 0 : v);
      x += dead(pad.axes[0] ?? 0);
      y -= dead(pad.axes[1] ?? 0);
      flap ||= !!pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.3;
      brake ||= !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.3;
      if (pad.buttons[2]?.pressed || pad.buttons[3]?.pressed) this.interactLatch = true;
      if (x !== 0 || y !== 0 || flap) this.first();
    }

    const s = this.state;
    s.steerX = Math.max(-1, Math.min(1, x));
    s.steerY = Math.max(-1, Math.min(1, this.invertY ? -y : y));
    s.flap = flap;
    s.brake = brake;
    s.interact = this.interactLatch;
    this.interactLatch = false;
    return s;
  }
}
