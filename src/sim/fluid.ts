export interface FluidConfig {
  length: number;
  width: number;
  height: number;
  spacing: number;
  depth: number;
  fillFrom: number;
  fillTo: number;
  slopeStart: number;
  slope: number;
  pistonRest: number;
  pistonStroke: number;
  pistonPeriod: number;
}

export const TANK: FluidConfig = {
  length: 14,
  width: 4.4,
  height: 4.5,
  spacing: 0.235,
  depth: 1.3,
  fillFrom: 1.5,
  fillTo: 10.5,
  slopeStart: 9.6,
  slope: 0.36,
  pistonRest: 0.5,
  pistonStroke: 0.95,
  pistonPeriod: 3.4,
};

const GRAVITY = -9.81;
const STIFFNESS = 110;
const NEAR_STIFFNESS = 260;
const REST_DENSITY = 2.75;
const VISCOSITY = 0.5;

export class Fluid {
  readonly count: number;
  readonly out: Float32Array;
  readonly h: number;
  time = 0;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private cell: Int32Array;
  private order: Int32Array;
  private cellStart: Int32Array;
  private nx: number;
  private ny: number;
  private nz: number;
  private neighbor = new Int32Array(256);
  private weight = new Float32Array(256);
  private seed = 1;
  readonly config: FluidConfig;

  constructor(config: FluidConfig) {
    this.config = config;
    const s = config.spacing;
    this.h = s * 2;
    const points: number[] = [];
    for (let x = config.fillFrom; x < config.fillTo; x += s) {
      for (let y = s * 0.5; y < config.depth; y += s) {
        if (y < (x - config.slopeStart) * config.slope) continue;
        for (let z = s * 0.5; z < config.width; z += s) points.push(x, y, z);
      }
    }
    const n = (this.count = points.length / 3);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.cell = new Int32Array(n);
    this.order = new Int32Array(n);
    this.out = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.x[i] = points[i * 3] + this.random() * 0.01;
      this.y[i] = points[i * 3 + 1];
      this.z[i] = points[i * 3 + 2] + this.random() * 0.01;
    }
    this.nx = Math.ceil(config.length / this.h) + 1;
    this.ny = Math.ceil(config.height / this.h) + 1;
    this.nz = Math.ceil(config.width / this.h) + 1;
    this.cellStart = new Int32Array(this.nx * this.ny * this.nz + 1);
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  piston(time: number): number {
    const c = this.config;
    const ramp = Math.min(1, time / 2);
    return c.pistonRest + c.pistonStroke * ramp * (0.5 - 0.5 * Math.cos((time / c.pistonPeriod) * Math.PI * 2));
  }

  private sort(): void {
    const { x, y, z, cell, order, cellStart, nx, ny, nz, h, count } = this;
    cellStart.fill(0);
    for (let i = 0; i < count; i++) {
      const cx = Math.min(nx - 1, Math.max(0, (x[i] / h) | 0));
      const cy = Math.min(ny - 1, Math.max(0, (y[i] / h) | 0));
      const cz = Math.min(nz - 1, Math.max(0, (z[i] / h) | 0));
      const c = (cy * nz + cz) * nx + cx;
      cell[i] = c;
      cellStart[c + 1]++;
    }
    for (let c = 0; c < cellStart.length - 1; c++) cellStart[c + 1] += cellStart[c];
    const cursor = cellStart.slice(0, cellStart.length - 1);
    for (let i = 0; i < count; i++) order[cursor[cell[i]]++] = i;
  }

  private gather(i: number): number {
    const { x, y, z, order, cellStart, nx, ny, nz, h, neighbor, weight } = this;
    const xi = x[i];
    const yi = y[i];
    const zi = z[i];
    const cx = Math.min(nx - 1, Math.max(0, (xi / h) | 0));
    const cy = Math.min(ny - 1, Math.max(0, (yi / h) | 0));
    const cz = Math.min(nz - 1, Math.max(0, (zi / h) | 0));
    const h2 = h * h;
    let found = 0;
    for (let oy = cy > 0 ? cy - 1 : 0; oy <= cy + 1 && oy < ny; oy++) {
      for (let oz = cz > 0 ? cz - 1 : 0; oz <= cz + 1 && oz < nz; oz++) {
        const row = (oy * nz + oz) * nx;
        const from = cellStart[row + (cx > 0 ? cx - 1 : 0)];
        const to = cellStart[row + Math.min(nx - 1, cx + 1) + 1];
        for (let k = from; k < to; k++) {
          const j = order[k];
          if (j === i) continue;
          const dx = x[j] - xi;
          const dy = y[j] - yi;
          const dz = z[j] - zi;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < h2 && found < 256) {
            neighbor[found] = j;
            weight[found] = 1 - Math.sqrt(d2) / h;
            found++;
          }
        }
      }
    }
    return found;
  }

  step(dt: number): void {
    const { x, y, z, px, py, pz, vx, vy, vz, count, h, neighbor, weight, config } = this;
    this.time += dt;
    this.sort();

    for (let i = 0; i < count; i++) {
      const found = this.gather(i);
      for (let n = 0; n < found; n++) {
        const j = neighbor[n];
        if (j < i) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dz = z[j] - z[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const u = ((vx[i] - vx[j]) * dx + (vy[i] - vy[j]) * dy + (vz[i] - vz[j]) * dz) / d;
        if (u <= 0) continue;
        const impulse = (dt * weight[n] * VISCOSITY * u * 0.5) / d;
        vx[i] -= impulse * dx;
        vy[i] -= impulse * dy;
        vz[i] -= impulse * dz;
        vx[j] += impulse * dx;
        vy[j] += impulse * dy;
        vz[j] += impulse * dz;
      }
    }

    for (let i = 0; i < count; i++) {
      vy[i] += GRAVITY * dt;
      px[i] = x[i];
      py[i] = y[i];
      pz[i] = z[i];
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      z[i] += vz[i] * dt;
    }

    this.sort();
    const dt2 = dt * dt;
    for (let i = 0; i < count; i++) {
      const found = this.gather(i);
      let density = 0;
      let near = 0;
      for (let n = 0; n < found; n++) {
        const w = weight[n];
        density += w * w;
        near += w * w * w;
      }
      const pressure = STIFFNESS * (density - REST_DENSITY);
      const nearPressure = NEAR_STIFFNESS * near;
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (let n = 0; n < found; n++) {
        const j = neighbor[n];
        const w = weight[n];
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dz = z[j] - z[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const push = (dt2 * (pressure * w + nearPressure * w * w) * 0.5) / d;
        x[j] += push * dx;
        y[j] += push * dy;
        z[j] += push * dz;
        mx -= push * dx;
        my -= push * dy;
        mz -= push * dz;
      }
      x[i] += mx;
      y[i] += my;
      z[i] += mz;
    }

    const wall = this.piston(this.time);
    const margin = h * 0.25;
    const out = this.out;
    for (let i = 0; i < count; i++) {
      if (x[i] < wall + margin) x[i] = wall + margin + this.random() * 0.004;
      if (x[i] > config.length - margin) x[i] = config.length - margin - this.random() * 0.004;
      if (z[i] < margin) z[i] = margin + this.random() * 0.004;
      if (z[i] > config.width - margin) z[i] = config.width - margin - this.random() * 0.004;
      const floor = Math.max(0, (x[i] - config.slopeStart) * config.slope) + margin;
      if (y[i] < floor) {
        const lift = floor - y[i];
        y[i] = floor + this.random() * 0.004;
        if (x[i] > config.slopeStart) x[i] -= lift * config.slope * 0.6;
      }
      if (y[i] > config.height) y[i] = config.height;

      vx[i] = (x[i] - px[i]) / dt;
      vy[i] = (y[i] - py[i]) / dt;
      vz[i] = (z[i] - pz[i]) / dt;
      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i] + vz[i] * vz[i]);
      if (speed > 14) {
        const k = 14 / speed;
        vx[i] *= k;
        vy[i] *= k;
        vz[i] *= k;
      }
      const o = i * 4;
      out[o] = x[i];
      out[o + 1] = y[i];
      out[o + 2] = z[i];
      out[o + 3] = Math.min(speed, 14);
    }
  }
}
