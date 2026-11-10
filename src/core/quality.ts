export interface Quality {
  name: 'high' | 'medium' | 'low';
  dpr: number;
  paint: number;
  grassNear: { side: number; spacing: number };
  grassFar: { side: number; spacing: number };
  trees: number;
  scatter: number;
  fluid: number;
  terrain: number;
  surf: number;
  boats: number;
  bloom: boolean;
  motes: number;
  life: number;
  lod: number;
}

const TIERS: Record<Quality['name'], Quality> = {
  high: {
    name: 'high',
    dpr: 1.5,
    paint: 3,
    grassNear: { side: 330, spacing: 0.3 },
    grassFar: { side: 400, spacing: 0.95 },
    trees: 1,
    scatter: 1,
    fluid: 0.235,
    terrain: 1,
    surf: 900,
    boats: 10,
    bloom: true,
    motes: 900,
    life: 1,
    lod: 1.5,
  },
  medium: {
    name: 'medium',
    dpr: 1.5,
    paint: 2,
    grassNear: { side: 230, spacing: 0.34 },
    grassFar: { side: 300, spacing: 1.1 },
    trees: 0.7,
    scatter: 0.8,
    fluid: 0.26,
    terrain: 1,
    surf: 500,
    boats: 8,
    bloom: true,
    motes: 500,
    life: 0.7,
    lod: 1.15,
  },
  low: {
    name: 'low',
    dpr: 1.5,
    paint: 1,
    grassNear: { side: 150, spacing: 0.42 },
    grassFar: { side: 220, spacing: 1.3 },
    trees: 0.45,
    scatter: 0.5,
    fluid: 0.3,
    terrain: 3,
    surf: 260,
    boats: 5,
    bloom: false,
    motes: 220,
    life: 0.45,
    lod: 0.8,
  },
};

export function pickQuality(params: URLSearchParams, webgpu: boolean): Quality {
  const forced = params.get('q');
  let tier: Quality;
  if (forced && forced in TIERS) {
    tier = TIERS[forced as Quality['name']];
  } else {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    const small = Math.min(screen.width, screen.height) < 500;
    if (coarse) tier = small || cores <= 6 || memory <= 4 ? TIERS.low : TIERS.medium;
    else tier = !webgpu || cores <= 4 ? TIERS.medium : TIERS.high;
  }
  const quality = { ...tier };
  if (params.has('paint')) quality.paint = Number(params.get('paint'));
  if (params.has('dpr')) quality.dpr = Number(params.get('dpr'));
  if (params.has('lod')) quality.lod = Number(params.get('lod'));
  return quality;
}

export interface Step {
  scale: number;
  lod: number;
  grass: number;
}

const LADDER: Step[] = [
  { scale: 0.55, lod: 0.4, grass: 0.55 },
  { scale: 0.64, lod: 0.45, grass: 0.65 },
  { scale: 0.74, lod: 0.5, grass: 0.75 },
  { scale: 0.86, lod: 0.6, grass: 0.85 },
  { scale: 0.86, lod: 0.75, grass: 1 },
  { scale: 1, lod: 0.85, grass: 1 },
  { scale: 1, lod: 1, grass: 1 },
  { scale: 1.17, lod: 1.25, grass: 1 },
  { scale: 1.34, lod: 1.5, grass: 1 },
];
const HOME = 6;

export class Governor {
  index = HOME;
  private top: number;
  private frames: number[] = [];
  private elapsed = 0;
  private calm = 0;
  private stalled = 0;
  private raised = -Infinity;
  private hold = 0;
  private backoff = 6000;
  private clock = 0;
  private vsync = 16.7;

  constructor(
    private apply: (step: Step) => void,
    private hopeless: () => void,
    ultra: boolean,
  ) {
    this.top = ultra ? LADDER.length - 1 : HOME;
  }

  get step(): Step {
    return LADDER[this.index];
  }

  get scale(): number {
    return this.step.scale;
  }

  pin(index: number): void {
    this.index = Math.max(0, Math.min(LADDER.length - 1, index));
    this.top = -1;
    this.apply(this.step);
  }

  tick(ms: number): void {
    this.clock += ms;
    if (this.top < 0) return;
    if (ms > 110) {
      this.stalled += Math.min(ms, 1000);
      if (this.stalled > 8000) {
        this.stalled = -Infinity;
        this.hopeless();
      }
    } else {
      this.stalled = Math.max(0, this.stalled - ms * 2);
    }
    if (ms > 250) return;
    this.frames.push(ms);
    this.elapsed += ms;
    if (this.elapsed < 1000) return;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const average = this.elapsed / this.frames.length;
    this.vsync = Math.min(this.vsync, Math.max(4, sorted[Math.floor(sorted.length * 0.1)]));
    const refresh = this.vsync;
    this.frames = [];
    this.elapsed = 0;
    if (average > Math.max(refresh * 1.25, 19) && this.index > 0) {
      this.calm = 0;
      if (this.clock - this.raised < 3500) {
        this.hold = this.clock + this.backoff;
        this.backoff = Math.min(120000, this.backoff * 2);
      }
      this.index = Math.max(0, this.index - (average > 34 ? 2 : 1));
      this.apply(this.step);
    } else if (average < refresh * 1.1 + 0.4 && this.index < this.top && this.clock > this.hold) {
      if (++this.calm >= 3) {
        this.calm = 0;
        this.index++;
        this.raised = this.clock;
        this.apply(this.step);
      }
    } else {
      this.calm = 0;
    }
  }
}
