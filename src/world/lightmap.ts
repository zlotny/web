import { clamp01, smoothstep } from '../core/noise';
import { WORLD_SIZE, type HeightMap } from './height';
import { LIGHT_RES, MASK_RES } from './shading';

const CELL = WORLD_SIZE / LIGHT_RES;

export class LightMap {
  readonly data = new Uint8Array(LIGHT_RES * LIGHT_RES * 4);
  private shadow = new Float32Array(LIGHT_RES * LIGHT_RES);
  private occlusion = new Float32Array(LIGHT_RES * LIGHT_RES);
  private canopy = new Float32Array(LIGHT_RES * LIGHT_RES);
  private under = new Float32Array(LIGHT_RES * LIGHT_RES);

  constructor(
    private map: HeightMap,
    private sun: { x: number; y: number; z: number },
  ) {
    const heights = new Float32Array(LIGHT_RES * LIGHT_RES);
    const half = WORLD_SIZE / 2;
    for (let j = 0; j < LIGHT_RES; j++) {
      for (let i = 0; i < LIGHT_RES; i++) {
        heights[j * LIGHT_RES + i] = Math.max(map.sample(-half + (i + 0.5) * CELL, -half + (j + 0.5) * CELL), 0);
      }
    }

    const flat = Math.hypot(sun.x, sun.z);
    const dx = sun.x / flat;
    const dz = sun.z / flat;
    const rise = (sun.y / flat) * CELL;
    const steps = Math.ceil(240 / rise);
    for (let j = 0; j < LIGHT_RES; j++) {
      for (let i = 0; i < LIGHT_RES; i++) {
        const k = j * LIGHT_RES + i;
        const start = heights[k] + 0.6;
        let excess = 0;
        for (let s = 1; s <= steps; s++) {
          const x = Math.round(i + dx * s);
          const z = Math.round(j + dz * s);
          if (x < 0 || z < 0 || x >= LIGHT_RES || z >= LIGHT_RES) break;
          const over = (heights[z * LIGHT_RES + x] - (start + rise * s)) / (1 + s * 0.22);
          if (over > excess) excess = over;
        }
        this.shadow[k] = 1 - smoothstep(0, 1.6, excess);
      }
    }

    const radius = 6;
    const blurred = boxBlur(heights, radius);
    for (let k = 0; k < heights.length; k++) {
      this.occlusion[k] = clamp01(1 - (blurred[k] - heights[k]) * 0.07);
    }
    this.shadow.set(boxBlur(this.shadow, 1));
  }

  stamp(x: number, z: number, radius: number, height: number, strength: number): void {
    const flat = Math.hypot(this.sun.x, this.sun.z);
    const reach = Math.min(height * (flat / this.sun.y), 60);
    const cx = x - (this.sun.x / flat) * reach * 0.5;
    const cz = z - (this.sun.z / flat) * reach * 0.5;
    const span = radius + reach * 0.5;
    const half = WORLD_SIZE / 2;
    const i0 = Math.max(0, Math.floor((cx - span + half) / CELL));
    const i1 = Math.min(LIGHT_RES - 1, Math.ceil((cx + span + half) / CELL));
    const j0 = Math.max(0, Math.floor((cz - span + half) / CELL));
    const j1 = Math.min(LIGHT_RES - 1, Math.ceil((cz + span + half) / CELL));
    const ax = this.sun.x / flat;
    const az = this.sun.z / flat;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = -half + (i + 0.5) * CELL - cx;
        const pz = -half + (j + 0.5) * CELL - cz;
        const along = (px * ax + pz * az) / (radius + reach * 0.5);
        const across = (pz * ax - px * az) / radius;
        const d = Math.hypot(along, across);
        const k = j * LIGHT_RES + i;
        this.canopy[k] = Math.max(this.canopy[k], strength * (1 - smoothstep(0.45, 1.05, d)));
      }
    }
  }

  occlude(x: number, z: number, radius: number, strength: number): void {
    const half = WORLD_SIZE / 2;
    const i0 = Math.max(0, Math.floor((x - radius + half) / CELL));
    const i1 = Math.min(LIGHT_RES - 1, Math.ceil((x + radius + half) / CELL));
    const j0 = Math.max(0, Math.floor((z - radius + half) / CELL));
    const j1 = Math.min(LIGHT_RES - 1, Math.ceil((z + radius + half) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + (i + 0.5) * CELL - x, -half + (j + 0.5) * CELL - z) / radius;
        const k = j * LIGHT_RES + i;
        this.under[k] = Math.max(this.under[k], strength * (1 - smoothstep(0.2, 1, d)));
      }
    }
  }

  finish(): Uint8Array {
    for (let k = 0; k < this.shadow.length; k++) {
      this.data[k * 4] = Math.round(clamp01(this.shadow[k] * (1 - this.canopy[k])) * 255);
      this.data[k * 4 + 1] = Math.round(clamp01(this.occlusion[k] * (1 - this.under[k])) * 255);
      this.data[k * 4 + 2] = 0;
      this.data[k * 4 + 3] = 255;
    }
    return this.data;
  }
}

function boxBlur(source: Float32Array, radius: number): Float32Array {
  const n = LIGHT_RES;
  const temp = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  const window = radius * 2 + 1;
  for (let j = 0; j < n; j++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += source[j * n + Math.min(n - 1, Math.max(0, i))];
    for (let i = 0; i < n; i++) {
      temp[j * n + i] = sum / window;
      sum += source[j * n + Math.min(n - 1, i + radius + 1)] - source[j * n + Math.max(0, i - radius)];
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -radius; j <= radius; j++) sum += temp[Math.min(n - 1, Math.max(0, j)) * n + i];
    for (let j = 0; j < n; j++) {
      out[j * n + i] = sum / window;
      sum += temp[Math.min(n - 1, j + radius + 1) * n + i] - temp[Math.max(0, j - radius) * n + i];
    }
  }
  return out;
}

const MASK_CELL = WORLD_SIZE / MASK_RES;

export class MaskMap {
  readonly data = new Uint8Array(MASK_RES * MASK_RES * 4);

  private splat(x: number, z: number, radius: number, channel: number, inner: number, strength: number): void {
    const half = WORLD_SIZE / 2;
    const i0 = Math.max(0, Math.floor((x - radius + half) / MASK_CELL));
    const i1 = Math.min(MASK_RES - 1, Math.ceil((x + radius + half) / MASK_CELL));
    const j0 = Math.max(0, Math.floor((z - radius + half) / MASK_CELL));
    const j1 = Math.min(MASK_RES - 1, Math.ceil((z + radius + half) / MASK_CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + (i + 0.5) * MASK_CELL - x, -half + (j + 0.5) * MASK_CELL - z) / radius;
        const value = Math.round(255 * strength * (1 - smoothstep(inner, 1, d)));
        const k = (j * MASK_RES + i) * 4 + channel;
        if (value > this.data[k]) this.data[k] = value;
      }
    }
  }

  bare(x: number, z: number, radius: number, strength = 1): void {
    this.splat(x, z, radius, 0, 0.45, strength);
  }

  cover(x: number, z: number, radius: number): void {
    this.splat(x, z, radius, 1, 0.3, 1);
  }

  field(cx: number, cz: number, width: number, depth: number, yaw: number, crop: number): void {
    const half = WORLD_SIZE / 2;
    const reach = Math.hypot(width, depth) / 2;
    const i0 = Math.max(0, Math.floor((cx - reach + half) / MASK_CELL));
    const i1 = Math.min(MASK_RES - 1, Math.ceil((cx + reach + half) / MASK_CELL));
    const j0 = Math.max(0, Math.floor((cz - reach + half) / MASK_CELL));
    const j1 = Math.min(MASK_RES - 1, Math.ceil((cz + reach + half) / MASK_CELL));
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = -half + (i + 0.5) * MASK_CELL - cx;
        const dz = -half + (j + 0.5) * MASK_CELL - cz;
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;
        if (Math.abs(lx) < width / 2 - 1 && Math.abs(lz) < depth / 2 - 1) this.data[(j * MASK_RES + i) * 4 + 2] = crop;
      }
    }
  }

  path(points: [number, number][], width: number): void {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / (MASK_CELL * 0.7));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        this.splat(ax + (bx - ax) * t, az + (bz - az) * t, width, 0, 0.35, 1);
      }
    }
  }
}
