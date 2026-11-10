import { Simplex, clamp01, lerp, smoothstep } from '../core/noise';

export const WORLD_SIZE = 3600;
export const MAP_RES = 1024;
export const SEA_LEVEL = 0;

const simplex = new Simplex(20261110);

export function rawHeight(x: number, z: number): number {
  const warpX = simplex.fbm(x * 0.00055 + 3.1, z * 0.00055 - 7.7, 3) * 260;
  const warpZ = simplex.fbm(x * 0.00055 - 11.4, z * 0.00055 + 5.2, 3) * 260;
  const wx = x + warpX;
  const wz = z + warpZ;
  const dist = Math.hypot(wx, wz * 1.12);
  const land = smoothstep(1380, 760, dist);

  const hills = simplex.fbm(x * 0.0017, z * 0.0017, 5);
  const rolling = simplex.fbm(x * 0.006 + 40, z * 0.006 - 13, 3);
  const ridge = simplex.ridged(wx * 0.00085 + 9, wz * 0.00085 + 2, 4);
  const inland = smoothstep(1050, 250, dist);

  let h = 7 + hills * 30 + rolling * 5 + Math.pow(ridge, 2.2) * 210 * inland * inland;

  const valley = Math.abs(simplex.fbm(x * 0.00062 - 21, z * 0.00062 + 33, 3));
  const ria = 1 - smoothstep(0.0, 0.085, valley);
  const riaReach = smoothstep(430, 980, dist);
  h -= ria * 52 * riaReach;
  const stream = 1 - smoothstep(0.0, 0.03, valley);
  h -= stream * 5 * (1 - riaReach);

  const cliff = smoothstep(0.02, 0.4, simplex.fbm(x * 0.0011 + 77, z * 0.0011 - 5, 3));
  h += cliff * 34 * smoothstep(-3, 9, h) * smoothstep(520, 1100, dist);

  const shelf = lerp(-46, h, Math.pow(land, 0.75));
  const beach = smoothstep(-6, 5, shelf);
  const soft = lerp(shelf * 0.9, shelf, beach) + (1 - land) * simplex.fbm(x * 0.004, z * 0.004, 2) * 3;

  const strand = beachWeight(x, z);
  const coast = strand >= 1 ? soft : hardShore(x, z, wx, wz, dist, land, h, soft);
  if (strand <= 0) return coast;
  const run = (land - 0.6) * 21;
  const dune = smoothstep(2.4, 4.6, run) * (1 - smoothstep(6.5, 10, run)) * (0.55 + 0.45 * simplex.noise(x * 0.019 + 4, z * 0.019 - 6)) * 5;
  const sand = lerp(run + dune + simplex.noise(x * 0.05, z * 0.05) * 0.12, Math.max(h, run), smoothstep(0.78, 0.95, land));
  return lerp(coast, lerp(sand, Math.min(soft, sand), smoothstep(0.36, 0.2, land)), strand);
}

export const BEACH = { ax: 120, az: -1010, bx: 800, bz: -760, reach: 340 };

export function beachWeight(x: number, z: number): number {
  const dx = BEACH.bx - BEACH.ax;
  const dz = BEACH.bz - BEACH.az;
  const t = clamp01(((x - BEACH.ax) * dx + (z - BEACH.az) * dz) / (dx * dx + dz * dz));
  return smoothstep(BEACH.reach, BEACH.reach * 0.62, Math.hypot(x - BEACH.ax - dx * t, z - BEACH.az - dz * t));
}

function hardShore(x: number, z: number, wx: number, wz: number, dist: number, land: number, h: number, soft: number): number {
  const facing = (-wz * 0.78 - wx * 0.62) / (dist + 1);
  const exposure = smoothstep(-0.12, 0.3, facing + simplex.noise(x * 0.0012 + 50, z * 0.0012 + 50) * 0.18);
  if (exposure <= 0.001) return soft;
  const jag = simplex.ridged(x * 0.0046 + 5, z * 0.0046 - 9, 3);
  const notch = simplex.noise(x * 0.017 - 3, z * 0.017 + 8);
  const edge = land + (jag - 0.45) * 0.2 + notch * 0.025;
  const wall = smoothstep(0.588, 0.612, edge);
  const rim = 1 - smoothstep(0.68, 0.9, edge);
  const plateau = 24 + simplex.fbm(x * 0.0031 + 12, z * 0.0031 - 40, 2) * 13 + jag * 9;
  const top = lerp(h, Math.max(h, plateau), rim) + notch * 1.6;
  const floor = -9 - smoothstep(0.6, 0.3, edge) * 34 + notch * 2;
  let hard = lerp(floor, top, wall);
  const reef = smoothstep(0.4, 0.5, edge) * (1 - smoothstep(0.56, 0.6, edge));
  const stack = smoothstep(0.5, 0.74, simplex.noise(x * 0.0125 + 31, z * 0.0125 - 17));
  hard = Math.max(hard, floor + stack * reef * (26 + jag * 30));
  for (const [ix, iz, radius, height] of ISLETS) {
    const d = Math.hypot(x - ix, z - iz) / (radius * (0.8 + jag * 0.5));
    if (d < 1.6) hard = Math.max(hard, -12 + (height + 12) * smoothstep(1.25, 0.35, d) + notch * 2);
  }
  return lerp(soft, hard, exposure);
}

export const ISLETS: [number, number, number, number][] = [
  [-620, -1235, 120, 46],
  [-830, -1150, 70, 30],
  [-455, -1290, 55, 24],
  [-720, -1090, 34, 17],
];

export class HeightMap {
  readonly data = new Float32Array(MAP_RES * MAP_RES);
  readonly texel = WORLD_SIZE / (MAP_RES - 1);
  min = Infinity;
  max = -Infinity;

  constructor() {
    const half = WORLD_SIZE / 2;
    for (let j = 0; j < MAP_RES; j++) {
      const z = -half + j * this.texel;
      for (let i = 0; i < MAP_RES; i++) {
        const h = rawHeight(-half + i * this.texel, z);
        this.data[j * MAP_RES + i] = h;
      }
    }
    this.relax(7, 70, 150);
    for (const h of this.data) {
      if (h < this.min) this.min = h;
      if (h > this.max) this.max = h;
    }
  }

  coarsen(step: number): void {
    const d = this.data;
    const next = new Float32Array(d.length);
    const last = MAP_RES - 1;
    for (let j = 0; j < MAP_RES; j++) {
      const j0 = Math.min(Math.floor(j / step) * step, last - step);
      const tz = (j - j0) / step;
      for (let i = 0; i < MAP_RES; i++) {
        if (i % step === 0 && j % step === 0) continue;
        const i0 = Math.min(Math.floor(i / step) * step, last - step);
        const tx = (i - i0) / step;
        const a = d[j0 * MAP_RES + i0] + (d[j0 * MAP_RES + i0 + step] - d[j0 * MAP_RES + i0]) * tx;
        const b = d[(j0 + step) * MAP_RES + i0] + (d[(j0 + step) * MAP_RES + i0 + step] - d[(j0 + step) * MAP_RES + i0]) * tx;
        next[j * MAP_RES + i] = a + (b - a) * tz;
      }
    }
    for (let k = 0; k < d.length; k++) if (!((k % MAP_RES) % step === 0 && Math.floor(k / MAP_RES) % step === 0)) d[k] = next[k];
  }

  private relax(passes: number, from: number, full: number): void {
    const next = new Float32Array(this.data.length);
    for (let pass = 0; pass < passes; pass++) {
      next.set(this.data);
      for (let j = 2; j < MAP_RES - 2; j++) {
        for (let i = 2; i < MAP_RES - 2; i++) {
          const k = j * MAP_RES + i;
          const h = this.data[k];
          if (h < from) continue;
          const d = this.data;
          const near = d[k - 1] + d[k + 1] + d[k - MAP_RES] + d[k + MAP_RES];
          const far = d[k - 2] + d[k + 2] + d[k - 2 * MAP_RES] + d[k + 2 * MAP_RES];
          const mean = (h * 2 + near * 1.5 + far) / 12;
          next[k] = lerp(h, mean, smoothstep(from, full, h) * 0.9);
        }
      }
      this.data.set(next);
    }
  }

  flatten(cx: number, cz: number, radius: number, falloff: number, target?: number): number {
    const level = target ?? this.sample(cx, cz);
    const half = WORLD_SIZE / 2;
    const reach = radius + falloff;
    const i0 = Math.max(0, Math.floor((cx - reach + half) / this.texel));
    const i1 = Math.min(MAP_RES - 1, Math.ceil((cx + reach + half) / this.texel));
    const j0 = Math.max(0, Math.floor((cz - reach + half) / this.texel));
    const j1 = Math.min(MAP_RES - 1, Math.ceil((cz + reach + half) / this.texel));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + i * this.texel - cx, -half + j * this.texel - cz);
        const w = 1 - smoothstep(radius, reach, d);
        const k = j * MAP_RES + i;
        this.data[k] = lerp(this.data[k], level, w);
      }
    }
    return level;
  }

  sample(x: number, z: number): number {
    const fx = clamp01((x + WORLD_SIZE / 2) / WORLD_SIZE) * (MAP_RES - 1);
    const fz = clamp01((z + WORLD_SIZE / 2) / WORLD_SIZE) * (MAP_RES - 1);
    const i = Math.min(MAP_RES - 2, Math.floor(fx));
    const j = Math.min(MAP_RES - 2, Math.floor(fz));
    const tx = fx - i;
    const tz = fz - j;
    const k = j * MAP_RES + i;
    const d = this.data;
    const a = d[k] + (d[k + 1] - d[k]) * tx;
    const b = d[k + MAP_RES] + (d[k + MAP_RES + 1] - d[k + MAP_RES]) * tx;
    return a + (b - a) * tz;
  }

  normal(x: number, z: number, out: { x: number; y: number; z: number }): void {
    const e = this.texel;
    const dx = this.sample(x - e, z) - this.sample(x + e, z);
    const dz = this.sample(x, z - e) - this.sample(x, z + e);
    const len = Math.hypot(dx, 2 * e, dz);
    out.x = dx / len;
    out.y = (2 * e) / len;
    out.z = dz / len;
  }

  findLand(
    x: number,
    z: number,
    minHeight: number,
    maxHeight: number,
    reach: number,
    free: (x: number, z: number) => boolean = () => true,
  ): { x: number; z: number } {
    let best = { x, z };
    let score = Infinity;
    for (let radius = 0; radius <= reach; radius += 6) {
      const steps = Math.max(1, Math.round((radius * Math.PI * 2) / 8));
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;
        let low = Infinity;
        let high = -Infinity;
        let clear = true;
        for (const [ox, oz] of [[0, 0], [11, 0], [-11, 0], [0, 11], [0, -11], [8, 8], [-8, 8], [8, -8], [-8, -8]]) {
          if (!free(px + ox, pz + oz)) clear = false;
          const h = this.sample(px + ox, pz + oz);
          low = Math.min(low, h);
          high = Math.max(high, h);
        }
        if (!clear || low < minHeight || high > maxHeight) continue;
        const cost = radius * 0.05 + (high - low);
        if (cost < score) {
          score = cost;
          best = { x: px, z: pz };
        }
      }
    }
    return best;
  }

  slope(x: number, z: number): number {
    const n = { x: 0, y: 0, z: 0 };
    this.normal(x, z, n);
    return 1 - n.y;
  }
}
