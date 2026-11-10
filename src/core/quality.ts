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
  return quality;
}

export class Governor {
  scale = 1;
  private elapsed = 0;
  private frames = 0;
  private calm = 0;

  private stalled = 0;

  constructor(
    private apply: (scale: number) => void,
    private hopeless: () => void,
  ) {}

  tick(ms: number): void {
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
    this.elapsed += ms;
    this.frames++;
    if (this.elapsed < 1500) return;
    const average = this.elapsed / this.frames;
    this.elapsed = 0;
    this.frames = 0;
    if (average > 23 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale * 0.86);
      this.calm = 0;
      this.apply(this.scale);
    } else if (average < 13.5 && this.scale < 1) {
      if (++this.calm >= 3) {
        this.scale = Math.min(1, this.scale * 1.08);
        this.calm = 0;
        this.apply(this.scale);
      }
    } else {
      this.calm = 0;
    }
  }
}
