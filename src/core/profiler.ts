import type * as THREE from 'three/webgpu';

type Pool = { timestamps?: Map<string, number> };

export interface Sample {
  frames: number;
  frame: number;
  frameP95: number;
  cpu: Record<string, number>;
  gpu: number;
  gpuP95: number;
  passes: number[];
  calls: number;
  triangles: number;
}

const mean = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const p95 = (list: number[]) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
};
const round = (value: number) => Math.round(value * 100) / 100;

export class Profiler {
  private marks = new Map<string, number>();
  private cpu = new Map<string, number[]>();
  private frames: number[] = [];
  private gpu: number[] = [];
  private passes: number[][] = [];
  private last = 0;
  private pending = false;

  constructor(
    private renderer: THREE.WebGPURenderer,
    private scene: THREE.Scene,
  ) {}

  get timing(): boolean {
    return (this.renderer.backend as { trackTimestamp?: boolean }).trackTimestamp === true;
  }

  begin(label: string): void {
    this.marks.set(label, performance.now());
  }

  end(label: string): void {
    const start = this.marks.get(label);
    if (start === undefined) return;
    let list = this.cpu.get(label);
    if (!list) this.cpu.set(label, (list = []));
    list.push(performance.now() - start);
  }

  frame(): void {
    const now = performance.now();
    if (this.last) this.frames.push(now - this.last);
    this.last = now;
    if (!this.timing || this.pending) return;
    this.pending = true;
    this.renderer
      .resolveTimestampsAsync('render')
      .then((ms) => {
        this.pending = false;
        if (typeof ms !== 'number' || !(ms > 0)) return;
        this.gpu.push(ms);
        const pool = (this.renderer.backend as { timestampQueryPool?: Record<string, Pool> }).timestampQueryPool?.render;
        if (pool?.timestamps) {
          const keys = [...pool.timestamps.keys()];
          const lastFrame = keys.length ? keys[keys.length - 1].split(':f')[1] : '';
          this.passes.push(keys.filter((k) => k.endsWith(`:f${lastFrame}`)).map((k) => pool.timestamps!.get(k)!));
        }
      })
      .catch(() => {
        this.pending = false;
      });
  }

  reset(): void {
    this.cpu.clear();
    this.frames = [];
    this.gpu = [];
    this.passes = [];
    this.last = 0;
  }

  read(): Sample {
    const cpu: Record<string, number> = {};
    for (const [label, list] of this.cpu) cpu[label] = round(mean(list));
    const width = Math.max(0, ...this.passes.map((p) => p.length));
    const passes: number[] = [];
    for (let i = 0; i < width; i++) passes.push(round(mean(this.passes.filter((p) => p.length === width).map((p) => p[i]))));
    return {
      frames: this.frames.length,
      frame: round(mean(this.frames)),
      frameP95: round(p95(this.frames)),
      cpu,
      gpu: round(mean(this.gpu)),
      gpuP95: round(p95(this.gpu)),
      passes,
      calls: this.renderer.info.render.drawCalls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  async sample(ms = 1500, settle = 300): Promise<Sample> {
    await new Promise((resolve) => setTimeout(resolve, settle));
    this.reset();
    await new Promise((resolve) => setTimeout(resolve, ms));
    return this.read();
  }

  parts(): { name: string; object: THREE.Object3D }[] {
    const seen = new Map<string, number>();
    return this.scene.children.map((object) => {
      const base = object.name || object.type;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { name: n > 1 ? `${base}#${n}` : base, object };
    });
  }

  async ablate(ms = 1200, filter?: string[]): Promise<{ base: Sample; parts: { name: string; frame: number; gpu: number; cpu: number; calls: number; triangles: number }[] }> {
    const base = await this.sample(ms);
    const total = (s: Sample) => Object.values(s.cpu).reduce((a, b) => a + b, 0);
    const parts: { name: string; frame: number; gpu: number; cpu: number; calls: number; triangles: number }[] = [];
    for (const { name, object } of this.parts()) {
      if (filter && !filter.includes(name)) continue;
      if (!object.visible) continue;
      object.visible = false;
      const without = await this.sample(ms);
      object.visible = true;
      parts.push({
        name,
        frame: round(base.frame - without.frame),
        gpu: round(base.gpu - without.gpu),
        cpu: round(total(base) - total(without)),
        calls: base.calls - without.calls,
        triangles: base.triangles - without.triangles,
      });
    }
    parts.sort((a, b) => b.frame - a.frame);
    return { base, parts };
  }
}
