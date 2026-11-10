const W = 160;
const H = 120;
const KEY = 'ndrs.seeds';

interface Drop {
  x: number;
  y: number;
  speed: number;
  bad: boolean;
}

export class SeedGame {
  readonly root = document.createElement('section');
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d')!;
  private caption = document.createElement('p');
  private drops: Drop[] = [];
  private x = W / 2;
  private target = W / 2;
  private score = 0;
  private lives = 3;
  private time = 0;
  private spawn = 0;
  private best = 0;
  private running = false;
  private over = false;
  private last = 0;
  private keys = new Set<string>();
  open = false;
  onToggle: (open: boolean) => void = () => {};
  labels = { title: '', hint: '', over: '', best: '' };

  constructor() {
    this.root.className = 'cabinet';
    this.canvas.width = W;
    this.canvas.height = H;
    const close = document.createElement('button');
    close.className = 'cabinet-close';
    close.textContent = '×';
    close.addEventListener('click', () => this.toggle(false));
    this.root.append(close, this.canvas, this.caption);
    try {
      this.best = Number(localStorage.getItem(KEY) ?? 0);
    } catch {}
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    const aim = (e: PointerEvent) => {
      const box = this.canvas.getBoundingClientRect();
      this.target = ((e.clientX - box.left) / box.width) * W;
      if (!this.running) this.start();
    };
    this.canvas.addEventListener('pointerdown', aim);
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons || e.pointerType === 'touch') aim(e);
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.open) return;
        e.stopPropagation();
        if (e.code === 'Escape') this.toggle(false);
        else if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (!this.running) this.start();
        } else this.keys.add(e.code);
      },
      true,
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), true);
  }

  toggle(next = !this.open): void {
    if (next === this.open) return;
    this.open = next;
    this.root.classList.toggle('on', next);
    this.onToggle(next);
    if (next) {
      this.running = false;
      this.over = false;
      this.caption.textContent = this.labels.hint;
      this.last = performance.now();
      requestAnimationFrame(() => this.frame());
    }
  }

  private start(): void {
    this.running = true;
    this.over = false;
    this.score = 0;
    this.lives = 3;
    this.time = 0;
    this.spawn = 0;
    this.drops = [];
    this.caption.textContent = this.labels.title;
  }

  private frame(): void {
    if (!this.open) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.running) this.step(dt);
    this.draw(now);
    requestAnimationFrame(() => this.frame());
  }

  private step(dt: number): void {
    this.time += dt;
    const move = (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? 1 : 0);
    if (move) this.target = this.x + move * 40;
    this.target = Math.max(8, Math.min(W - 8, this.target));
    this.x += Math.max(-110 * dt, Math.min(110 * dt, this.target - this.x));
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.22, 0.75 - this.time * 0.012);
      this.drops.push({ x: 8 + Math.random() * (W - 16), y: -4, speed: 34 + Math.random() * 20 + this.time * 1.1, bad: Math.random() < 0.22 + Math.min(0.2, this.time * 0.004) });
    }
    for (const drop of this.drops) drop.y += drop.speed * dt;
    this.drops = this.drops.filter((drop) => {
      if (drop.y > H - 22 && drop.y < H - 8 && Math.abs(drop.x - this.x) < 9) {
        if (drop.bad) this.lives--;
        else this.score++;
        return false;
      }
      if (drop.y > H) {
        return false;
      }
      return true;
    });
    if (this.lives <= 0) {
      this.running = false;
      this.over = true;
      if (this.score > this.best) {
        this.best = this.score;
        try {
          localStorage.setItem(KEY, String(this.best));
        } catch {}
      }
      this.caption.textContent = `${this.labels.over} ${this.score} · ${this.labels.best} ${this.best}`;
    }
  }

  private draw(now: number): void {
    const c = this.context;
    c.fillStyle = '#1b1838';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 24; i++) {
      c.fillStyle = i % 3 ? '#3a3470' : '#6c62b8';
      c.fillRect((i * 37) % W, (i * 53 + Math.floor(now / 90)) % (H - 20), 1, 1);
    }
    c.fillStyle = '#2f8f5b';
    c.fillRect(0, H - 8, W, 8);
    c.fillStyle = '#3fb873';
    for (let i = 0; i < W; i += 6) c.fillRect(i, H - 9, 3, 1);
    for (const drop of this.drops) {
      if (drop.bad) {
        c.fillStyle = '#e8483f';
        c.fillRect(drop.x - 2, drop.y - 2, 5, 5);
        c.fillStyle = '#3fb873';
        c.fillRect(drop.x, drop.y - 4, 1, 2);
      } else {
        c.fillStyle = '#f6dd52';
        c.fillRect(drop.x - 1, drop.y - 2, 3, 4);
        c.fillStyle = '#b89a2a';
        c.fillRect(drop.x, drop.y + 1, 1, 1);
      }
    }
    const x = Math.round(this.x);
    const y = H - 18;
    const flap = Math.floor(now / 140) % 2;
    c.fillStyle = '#8a8d98';
    c.fillRect(x - 4, y + 2, 8, 6);
    c.fillStyle = '#3a3b44';
    c.fillRect(x - 9, y + 3 - flap * 2, 5, 2);
    c.fillRect(x + 4, y + 3 - flap * 2, 5, 2);
    c.fillStyle = '#f6dd52';
    c.fillRect(x - 3, y - 3, 6, 5);
    c.fillRect(x - 1, y - 7, 1, 4);
    c.fillRect(x + 1, y - 6, 1, 3);
    c.fillStyle = '#f0692c';
    c.fillRect(x + 1, y - 1, 2, 2);
    c.fillStyle = '#111';
    c.fillRect(x - 2, y - 2, 1, 1);
    c.fillStyle = '#fff';
    c.font = '8px monospace';
    c.textBaseline = 'top';
    c.fillText(String(this.score).padStart(3, '0'), 4, 3);
    for (let i = 0; i < this.lives; i++) {
      c.fillStyle = '#f0692c';
      c.fillRect(W - 8 - i * 7, 4, 5, 5);
    }
    if (!this.running) {
      c.fillStyle = 'rgba(10,8,30,0.6)';
      c.fillRect(0, 44, W, 30);
      c.fillStyle = Math.floor(now / 400) % 2 ? '#f6dd52' : '#fff';
      c.textAlign = 'center';
      c.fillText(this.over ? 'GAME OVER' : this.labels.title.toUpperCase(), W / 2, 50);
      c.fillStyle = '#fff';
      c.fillText('PRESS START', W / 2, 61);
      c.textAlign = 'left';
    }
  }
}
