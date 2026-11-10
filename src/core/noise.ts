export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

export class Simplex {
  private perm = new Uint8Array(512);

  constructor(seed: number) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise(x: number, y: number): number {
    const perm = this.perm;
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let a = 0.5 - x0 * x0 - y0 * y0;
    if (a > 0) {
      const g = (perm[ii + perm[jj]] & 7) * 2;
      a *= a;
      n += a * a * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    a = 0.5 - x1 * x1 - y1 * y1;
    if (a > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2;
      a *= a;
      n += a * a * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    a = 0.5 - x2 * x2 - y2 * y2;
    if (a > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2;
      a *= a;
      n += a * a * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * n;
  }

  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x, y);
      norm += amp;
      amp *= gain;
      x = x * lacunarity + 17.3;
      y = y * lacunarity - 9.1;
    }
    return sum / norm;
  }

  ridged(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise(x, y));
      n *= n * weight;
      weight = Math.min(1, Math.max(0, n * 1.6));
      sum += amp * n;
      norm += amp;
      amp *= 0.5;
      x = x * 2.03 + 31.7;
      y = y * 2.03 + 11.9;
    }
    return sum / norm;
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function tileableNoiseData(size: number, seed: number): Uint8Array<ArrayBuffer> {
  const rand = mulberry32(seed);
  const data = new Uint8Array(size * size * 4);
  const channels = [4, 8, 16, 0];
  for (let c = 0; c < 3; c++) {
    const octaves = 5;
    const layer = new Float32Array(size * size);
    let amp = 1;
    let norm = 0;
    let cells = channels[c];
    for (let o = 0; o < octaves && cells <= size; o++) {
      const grid = new Float32Array(cells * cells);
      for (let i = 0; i < grid.length; i++) grid[i] = rand();
      for (let y = 0; y < size; y++) {
        const fy = (y / size) * cells;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        const ya = (y0 % cells) * cells;
        const yb = ((y0 + 1) % cells) * cells;
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const xa = x0 % cells;
          const xb = (x0 + 1) % cells;
          const top = grid[ya + xa] + (grid[ya + xb] - grid[ya + xa]) * sx;
          const bottom = grid[yb + xa] + (grid[yb + xb] - grid[yb + xa]) * sx;
          layer[y * size + x] += amp * (top + (bottom - top) * sy);
        }
      }
      norm += amp;
      amp *= 0.5;
      cells *= 2;
    }
    for (let i = 0; i < layer.length; i++) data[i * 4 + c] = Math.round(clamp01(layer[i] / norm) * 255);
  }
  const points = 48;
  const px = new Float32Array(points);
  const py = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    px[i] = rand();
    py[i] = rand();
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let best = 1;
      for (let i = 0; i < points; i++) {
        let dx = Math.abs(u - px[i]);
        let dy = Math.abs(v - py[i]);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      data[(y * size + x) * 4 + 3] = Math.round(clamp01(Math.sqrt(best) * 5.5) * 255);
    }
  }
  return data;
}
