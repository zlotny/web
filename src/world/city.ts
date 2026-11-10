import * as THREE from 'three/webgpu';
import { attribute, float, floor, fract, mix, normalWorld, positionGeometry, positionWorld, sin, smoothstep, step, time, uv, vec2, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import type { HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { Sculpt, type RGB } from './sculpt';
import { applyFog, noise, paint, type N } from './shading';
import { createSigns, type Sign } from './signs';
import { CITY } from './zones';

const DARK: RGB = [0.11, 0.12, 0.17];
const STEEL: RGB = [0.2, 0.22, 0.3];
const SLATE: RGB = [0.15, 0.17, 0.25];
const CYAN: RGB = [0.2, 0.95, 1.0];
const MAGENTA: RGB = [1.0, 0.22, 0.75];
const AMBER: RGB = [1.0, 0.72, 0.2];
const VIOLET: RGB = [0.62, 0.36, 1.0];
const LIME: RGB = [0.55, 1.0, 0.4];
const NEONS = [CYAN, MAGENTA, AMBER, VIOLET];

export type TowerId = 'fullstack' | 'backend' | 'infra' | 'agents';

export interface Tower {
  id: TowerId;
  x: number;
  z: number;
  height: number;
}

let sharedMaterial: THREE.MeshBasicNodeMaterial | null = null;

export function cityMaterial(): THREE.MeshBasicNodeMaterial {
  if (sharedMaterial) return sharedMaterial;
  const material = new THREE.MeshBasicNodeMaterial();
  const color: N = attribute('color', 'vec3');
  const kind: N = attribute('glow', 'float');
  const normal: N = normalWorld;
  const wall = step(normal.y.abs(), 0.5).mul(step(kind, 0.5));
  const across: N = positionWorld.x.mul(normal.z.abs()).add(positionWorld.z.mul(normal.x.abs()));
  const grid: N = vec2(across.div(2.6), positionWorld.y.div(3.4));
  const cell: N = floor(grid);
  const inside: N = fract(grid);
  const pane = step(0.16, inside.x).mul(step(inside.x, 0.84)).mul(step(0.26, inside.y)).mul(step(inside.y, 0.82));
  const roll = noise(cell.mul(0.0371).add(vec2(0.13, 0.57)));
  const floorRoll = noise(vec2(cell.y.mul(0.0931), 0.71)).r;
  const lit = step(0.5, roll.r.add(sin(time.mul(0.25).add(roll.g.mul(40))).mul(0.04)).add(floorRoll.sub(0.5).mul(0.5)));
  const tint = mix(mix(vec3(...CYAN), vec3(...AMBER), step(0.55, roll.b)), vec3(...MAGENTA), step(0.72, roll.a));
  const facade = color.mul(pane.mul(wall).mul(0.5).oneMinus());
  const base = paint(facade, normal, positionWorld, float(1), 0.8, false);
  const windows = tint.mul(pane).mul(wall).mul(lit).mul(1.5);
  const pulse = sin(time.mul(3.1).add(positionWorld.y.mul(0.2))).mul(0.12).add(1);
  const neon = color.mul(color).mul(smoothstep(0.5, 1, kind)).mul(pulse).mul(5);
  material.colorNode = applyFog(base.add(windows).add(neon), positionWorld);
  sharedMaterial = material;
  return material;
}

const WORDS = ['PYTHON', 'RUST', 'TYPESCRIPT', 'SWIFT', 'KOTLIN', 'C#', 'LINUX', 'DOCKER', 'API', 'SQL', 'GIT', 'HPC', 'WEB', 'AGENTS', 'TOOLS', 'NDRS', 'ZLOTNY', 'HOMELAB', 'SIMULATION', 'DATA', 'NETWORKS', 'AUTOMATION', 'CLI', '24/7', 'LELO', 'GALICIA', 'OPEN SOURCE', 'SYSADMIN', 'UNIX', 'SSH', 'CI/CD', 'DEPLOY'];

interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  gx: number;
  gz: number;
}

function vehicles(lanes: { ox: number; oz: number; dx: number; dz: number; length: number; height: number; air: boolean }[], seed: number): THREE.Mesh {
  const rand = mulberry32(seed);
  const lane: number[] = [];
  const run: number[] = [];
  const tint: number[] = [];
  for (const l of lanes) {
    const count = Math.max(1, Math.round(l.length / (l.air ? 130 : 46)));
    for (let i = 0; i < count; i++) {
      lane.push(l.ox, l.oz, l.dx, l.dz);
      run.push(l.length, (l.air ? 20 : 9) + rand() * 9, rand(), l.height + (l.air ? rand() * 6 : 0));
      const c = NEONS[Math.floor(rand() * NEONS.length)];
      tint.push(c[0], c[1], c[2], l.air ? 2.2 : 1);
    }
  }
  const geometry = new THREE.BoxGeometry(1.7, 0.7, 4.2);
  geometry.setAttribute('lane', new THREE.InstancedBufferAttribute(new Float32Array(lane), 4));
  geometry.setAttribute('run', new THREE.InstancedBufferAttribute(new Float32Array(run), 4));
  geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(new Float32Array(tint), 4));
  const material = new THREE.MeshBasicNodeMaterial();
  const a: N = attribute('lane', 'vec4');
  const b: N = attribute('run', 'vec4');
  const local: N = positionGeometry;
  const t = fract(time.mul(b.y).div(b.x).add(b.z));
  const paintJob: N = attribute('tint', 'vec4');
  const size = smoothstep(0, 0.03, t).mul(smoothstep(1, 0.97, t)).mul(paintJob.w);
  const along = t.mul(b.x).add(local.z.mul(size));
  const side = local.x.mul(size);
  material.positionNode = vec3(a.x.add(a.z.mul(along)).add(a.w.mul(side)), b.w.add(local.y.mul(size)), a.y.add(a.w.mul(along)).sub(a.z.mul(side)));
  const nose = smoothstep(0.2, 1.9, local.z);
  const tail = smoothstep(-0.6, -2, local.z);
  const roof = smoothstep(0.1, 0.34, local.y);
  const shell = paintJob.rgb.mul(paintJob.rgb).mul(roof.mul(0.5).add(0.25)).add(vec3(1, 0.95, 0.8).mul(nose).mul(1.6)).add(vec3(1, 0.1, 0.15).mul(tail).mul(2));
  material.colorNode = applyFog(shell, positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = lane.length / 4;
  mesh.frustumCulled = false;
  return mesh;
}

function pulseMaterial(color: RGB, rate: number): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const at: N = uv();
  const packet = smoothstep(0.75, 1, fract(at.y.mul(5).sub(time.mul(rate))));
  material.colorNode = vec3(...color).mul(packet.mul(3).add(0.5));
  material.opacityNode = packet.mul(0.7).add(0.3);
  return material;
}

function barsMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const at: N = uv();
  const column = floor(at.x.mul(14));
  const where: N = positionWorld.x.add(positionWorld.z).mul(0.013);
  const level = noise(vec2(column.mul(0.071).add(where), time.mul(0.06))).r.mul(0.9).add(0.08);
  const bar = step(at.y, level).mul(step(0.12, fract(at.x.mul(14)))).mul(step(0.1, fract(at.y.mul(18))));
  const tone = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.2, 0.75), at.y);
  material.colorNode = tone.mul(bar).mul(2).add(vec3(0.02, 0.03, 0.08));
  material.opacityNode = bar.mul(0.85).add(0.12);
  return material;
}

export class City {
  readonly group = new THREE.Group();
  readonly towers: Tower[] = [];
  readonly ground: number;
  private spinners: { object: THREE.Object3D; rate: number }[] = [];

  constructor(private map: HeightMap) {
    this.ground = map.flatten(CITY.x, CITY.z, CITY.radius * 0.86, CITY.radius * 0.5);
    const ids: TowerId[] = ['fullstack', 'backend', 'infra', 'agents'];
    const corners = [
      [88, 88],
      [-88, 88],
      [-88, -88],
      [88, -88],
    ];
    ids.forEach((id, i) => {
      this.towers.push({ id, x: CITY.x + corners[i][0], z: CITY.z + corners[i][1], height: [128, 112, 150, 120][i] });
    });
  }

  blocked(x: number, z: number): boolean {
    return Math.hypot(x - CITY.x, z - CITY.z) < CITY.radius * 1.06;
  }

  update(dt: number): void {
    for (const spinner of this.spinners) spinner.object.rotation.y += spinner.rate * dt;
  }

  build(light: LightMap, mask: MaskMap, obstacles: Obstacles): void {
    const rand = mulberry32(2077);
    const s = new Sculpt(2077);
    s.jitter = 0.05;
    const y = this.ground;
    const signs: Sign[] = [];
    const material = cityMaterial();
    const plain = (build: () => void) => {
      s.glow = 0.6;
      build();
      s.glow = 0;
    };
    const neon = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB) => {
      s.glow = 1;
      s.box(cx, cy, cz, sx, sy, sz, color);
      s.glow = 0;
    };
    const crown = (cx: number, top: number, cz: number, w: number, d: number, color: RGB) => {
      neon(cx, top + 0.25, cz - d / 2, w + 0.5, 0.5, 0.5, color);
      neon(cx, top + 0.25, cz + d / 2, w + 0.5, 0.5, 0.5, color);
      neon(cx - w / 2, top + 0.25, cz, 0.5, 0.5, d + 0.5, color);
      neon(cx + w / 2, top + 0.25, cz, 0.5, 0.5, d + 0.5, color);
    };
    const label = (text: string, cx: number, cy: number, cz: number, face: number, height: number, color: RGB, vertical = false) => {
      signs.push({ text, x: cx, y: cy, z: cz, yaw: face * (Math.PI / 2), height, color, vertical });
    };

    const spacing = 44;
    const blocks: Block[] = [];
    for (let gz = -6; gz <= 6; gz++) {
      for (let gx = -6; gx <= 6; gx++) {
        const cx = CITY.x + gx * spacing + (rand() - 0.5) * 5;
        const cz = CITY.z + gz * spacing + (rand() - 0.5) * 5;
        const away = Math.hypot(cx - CITY.x, cz - CITY.z);
        const pick = rand();
        const w = 17 + rand() * 11;
        const d = 17 + rand() * 11;
        const tone = rand();
        const accent = NEONS[Math.floor(rand() * NEONS.length)];
        const extra = [rand(), rand(), rand(), rand(), rand(), rand()];
        if (away > CITY.radius * 0.82 || away < 34 || pick < 0.1) continue;
        if (this.towers.some((t) => Math.hypot(cx - t.x, cz - t.z) < 30)) continue;
        const h = 14 + Math.pow(1 - away / CITY.radius, 1.4) * 70 * (0.45 + pick * 0.75);
        const body: RGB = tone < 0.4 ? DARK : tone < 0.75 ? SLATE : STEEL;
        blocks.push({ x: cx, z: cz, w, d, h, gx, gz });
        let top = y + h;
        const round = extra[0] < 0.22 && h > 26;
        if (round) {
          s.cylinder(cx, y - 1, cz, Math.min(w, d) / 2, Math.min(w, d) / 2, h + 1, 14, body);
          s.glow = 1;
          s.cylinder(cx, top, cz, Math.min(w, d) / 2 + 0.3, Math.min(w, d) / 2 + 0.3, 0.5, 14, accent, false);
          s.cylinder(cx, y + 3.2, cz, Math.min(w, d) / 2 + 0.15, Math.min(w, d) / 2 + 0.15, 0.3, 14, accent, false);
          s.glow = 0;
        } else {
          s.box(cx, y + h / 2 - 1, cz, w, h + 2, d, body);
          crown(cx, top, cz, w, d, accent);
        }
        if (!round) neon(cx, y + 3.4, cz, w + 0.3, 0.3, d + 0.3, accent);
        if (h > 34) {
          const tier = h * (0.2 + extra[1] * 0.2);
          s.box(cx, top + tier / 2, cz, w * 0.62, tier, d * 0.62, body);
          crown(cx, top + tier, cz, w * 0.62, d * 0.62, accent);
          top += tier;
          plain(() => s.cylinder(cx + w * 0.16, top, cz, 0.25, 0.1, 9 + extra[2] * 12, 5, STEEL));
          neon(cx + w * 0.16, top + 9 + extra[2] * 12, cz, 0.6, 0.6, 0.6, [1, 0.2, 0.2]);
        } else if (extra[1] < 0.4) {
          plain(() => {
            s.box(cx - w * 0.2, top + 1, cz + d * 0.15, 3.4, 2, 2.6, STEEL);
            s.box(cx + w * 0.22, top + 0.8, cz - d * 0.2, 2.2, 1.6, 2.2, [0.3, 0.32, 0.4]);
            s.cylinder(cx + w * 0.2, top, cz + d * 0.22, 1.5, 1.5, 3, 8, [0.26, 0.28, 0.36]);
          });
        } else if (extra[1] < 0.6) {
          s.glow = 1;
          s.cylinder(cx, top + 0.1, cz, 5, 5, 0.2, 16, accent, false);
          s.glow = 0;
          neon(cx - 1.2, top + 0.3, cz, 0.6, 0.2, 3.6, [1, 1, 1]);
          neon(cx + 1.2, top + 0.3, cz, 0.6, 0.2, 3.6, [1, 1, 1]);
          neon(cx, top + 0.3, cz, 2.4, 0.2, 0.6, [1, 1, 1]);
        }
        if (extra[3] < 0.35) {
          for (const [ex, ez] of [
            [1, 1],
            [-1, -1],
          ]) {
            neon(cx + ex * (w / 2 + 0.12), y + h / 2, cz + ez * (d / 2 + 0.12), 0.3, h - 6, 0.3, accent);
          }
        }
        if (extra[4] < 0.62 && !round) {
          const word = WORDS[Math.floor(extra[5] * WORDS.length)];
          const face = Math.floor(extra[2] * 4);
          const out = (face % 2 === 1 ? w : d) / 2 + 0.5;
          const fx = face === 1 ? 1 : face === 3 ? -1 : 0;
          const fz = face === 0 ? 1 : face === 2 ? -1 : 0;
          const tall = h > 36 && word.length > 3;
          const size = tall ? 4.4 : Math.min(4.6, ((face % 2 === 1 ? d : w) * 0.96) / (word.length * 0.62 + 0.4));
          label(word, cx + fx * out, y + (tall ? h * 0.55 : 8 + extra[1] * Math.max(0, h - 16)), cz + fz * out, face, size, NEONS[Math.floor(extra[3] * NEONS.length)], tall);
        }
        light.stamp(cx, cz, Math.max(w, d) * 0.6, Math.min(h, 60), 0.5);
        obstacles.add(cx, cz, Math.max(w, d) * 0.6, y - 2, top + 2);
      }
    }

    for (const block of blocks) {
      const mate = blocks.find((other) => other.gz === block.gz && other.gx === block.gx + 1);
      if (!mate || Math.min(block.h, mate.h) < 30 || rand() > 0.42) continue;
      const x0 = block.x + block.w / 2;
      const x1 = mate.x - mate.w / 2;
      const high = y + 16 + rand() * (Math.min(block.h, mate.h) - 26);
      const mid = (block.z + mate.z) / 2;
      plain(() => s.box((x0 + x1) / 2, high, mid, x1 - x0 + 0.6, 3, 4, STEEL));
      neon((x0 + x1) / 2, high - 1.6, mid, x1 - x0, 0.25, 4.3, CYAN);
      neon((x0 + x1) / 2, high + 0.2, mid + 2.05, x1 - x0, 1.1, 0.1, [0.9, 0.95, 1.0]);
      neon((x0 + x1) / 2, high + 0.2, mid - 2.05, x1 - x0, 1.1, 0.1, [0.9, 0.95, 1.0]);
    }

    const span = CITY.radius * 0.84;
    for (let n = -6; n <= 5; n++) {
      const offset = (n + 0.5) * spacing;
      const half = Math.sqrt(Math.max(0, span * span - offset * offset));
      for (let along = -half + 8; along < half; along += 22) {
        for (const flip of [0, 1]) {
          const px = CITY.x + (flip ? along : offset + 6.2);
          const pz = CITY.z + (flip ? offset + 6.2 : along);
          if (Math.hypot(px - CITY.x, pz - CITY.z) < 30) continue;
          plain(() => s.cylinder(px, y, pz, 0.16, 0.12, 6.4, 5, STEEL));
          neon(px, y + 6.6, pz, 0.9, 0.3, 0.9, (Math.round(along / 22) + n) % 2 ? CYAN : AMBER);
        }
      }
    }

    for (const tower of this.towers) {
      const { x, z, height: h } = tower;
      if (tower.id === 'fullstack') {
        const tiers: [number, RGB, RGB, string][] = [
          [30, DARK, CYAN, 'DATA'],
          [24, SLATE, MAGENTA, 'API'],
          [18, STEEL, AMBER, 'UI'],
        ];
        let base = y;
        tiers.forEach(([size, body, accent, word], i) => {
          const tall = h / 3 - 2;
          s.box(x, base + tall / 2, z, size, tall, size, body);
          crown(x, base + tall, z, size, size, accent);
          neon(x, base + tall + 1.2, z, size * 0.8, 1.6, size * 0.8, accent);
          for (const face of [0, 1, 2, 3]) {
            const fx = face === 1 ? 1 : face === 3 ? -1 : 0;
            const fz = face === 0 ? 1 : face === 2 ? -1 : 0;
            label(word, x + fx * (size / 2 + 0.5), base + tall * 0.72, z + fz * (size / 2 + 0.5), face, 5.2, accent);
          }
          base += tall + 2.4;
          if (i === 2) plain(() => s.cylinder(x, base, z, 0.5, 0.15, 22, 6, STEEL));
        });
        label('FULL-STACK', x, y + h + 30, z, 0, 7, CYAN);
        label('FULL-STACK', x, y + h + 30, z, 1, 7, CYAN);
      } else if (tower.id === 'backend') {
        s.box(x, y + h / 2, z, 26, h, 20, DARK);
        for (let k = 0; k < 14; k++) {
          const high = y + 8 + k * ((h - 14) / 14);
          neon(x, high, z + 10.2, 22, 0.5, 0.3, k % 3 === 0 ? AMBER : LIME);
          neon(x, high, z - 10.2, 22, 0.5, 0.3, k % 3 === 0 ? AMBER : LIME);
          for (let led = -5; led <= 5; led++) {
            if (rand() < 0.5) neon(x + 13.1, high + 2.4, z + led * 1.6, 0.14, 0.5, 0.5, rand() < 0.2 ? [1, 0.3, 0.2] : LIME);
            if (rand() < 0.5) neon(x - 13.1, high + 2.4, z + led * 1.6, 0.14, 0.5, 0.5, rand() < 0.2 ? AMBER : LIME);
          }
        }
        for (const side of [-1, 1]) {
          plain(() => s.cylinder(x + side * 15, y, z, 2.2, 2.2, h * 0.86, 10, STEEL));
          neon(x + side * 15, y + h * 0.86 + 0.6, z, 5, 1.2, 5, CYAN);
          for (let k = 1; k < 6; k++) plain(() => s.box(x + side * 13.6, y + (h * 0.86 * k) / 6, z, 1.2, 0.8, 1.2, STEEL));
        }
        crown(x, y + h, z, 26, 20, LIME);
        label('BACKEND', x, y + h - 9, z + 10.6, 0, 5.4, LIME);
        label('BACKEND', x, y + h - 9, z - 10.6, 2, 5.4, LIME);
      } else if (tower.id === 'infra') {
        plain(() => s.cylinder(x, y, z, 7, 4.5, h * 0.72, 10, SLATE));
        for (let k = 0; k < 4; k++) {
          const high = y + h * (0.16 + k * 0.17);
          plain(() => s.cylinder(x, high, z, 11 - k * 1.3, 11 - k * 1.3, 1.6, 12, STEEL));
          s.glow = 1;
          s.cylinder(x, high + 1.6, z, 11.3 - k * 1.3, 11.3 - k * 1.3, 0.5, 12, k % 2 ? CYAN : VIOLET, false);
          s.glow = 0;
        }
        plain(() => s.cylinder(x, y + h * 0.72, z, 4.5, 0.4, h * 0.28, 8, STEEL));
        for (const [turn, lift] of [
          [0.7, 0.6],
          [3.6, 0.46],
        ]) {
          s.push(x + Math.cos(turn) * 8, y + h * lift, z + Math.sin(turn) * 8, -turn).tilt(0, -0.9);
          plain(() => s.dome(0, 0, 0, 6, 2.6, 10, [0.75, 0.78, 0.85]));
          s.pop();
        }
        neon(x, y + h + 1, z, 1.6, 2.4, 1.6, MAGENTA);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.78;
          plain(() => s.cylinder(x + Math.cos(a) * 16, y, z + Math.sin(a) * 16, 0.7, 0.4, h * 0.3, 5, STEEL));
          neon(x + Math.cos(a) * 16, y + h * 0.3 + 0.6, z + Math.sin(a) * 16, 1.4, 1.2, 1.4, AMBER);
        }
        label('INFRA', x, y + h * 0.84, z + 3, 0, 5, VIOLET, true);
        label('INFRA', x + 3, y + h * 0.84, z, 1, 5, VIOLET, true);
      } else {
        s.box(x, y + h * 0.36, z, 20, h * 0.72, 20, SLATE, 0.72);
        crown(x, y + h * 0.72, z, 14.4, 14.4, VIOLET);
        s.glow = 1;
        s.push(x, y + h * 0.86, z);
        s.dome(0, 0, 0, 6.5, 6.5, 12, VIOLET);
        s.pop();
        s.glow = 0;
        plain(() => s.cylinder(x, y + h * 0.72, z, 3, 5, h * 0.14, 10, STEEL));
        const ring = new Sculpt(88);
        ring.jitter = 0;
        ring.glow = 1;
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * Math.PI * 2;
          const r = 14 + (k % 3) * 3.5;
          ring.box(Math.cos(a) * r, (k % 3) * 5 - 5, Math.sin(a) * r, 2.4, 2.4, 2.4, k % 2 ? CYAN : MAGENTA);
        }
        const orbit = new THREE.Mesh(ring.geometry(), material);
        orbit.position.set(x, y + h * 0.84, z);
        orbit.frustumCulled = false;
        this.group.add(orbit);
        this.spinners.push({ object: orbit, rate: 0.5 });
        label('AGENTS', x, y + h * 0.5, z + 9.4, 0, 4.6, VIOLET);
        label('AGENTS', x, y + h * 0.5, z - 9.4, 2, 4.6, VIOLET);
      }
      light.stamp(x, z, 16, 60, 0.55);
      obstacles.add(x, z, 17, y - 2, y + h + 4);
    }

    const infra = this.towers.find((t) => t.id === 'infra')!;
    const cable = pulseMaterial(CYAN, 0.6);
    for (const tower of this.towers) {
      if (tower === infra) continue;
      const from = new THREE.Vector3(infra.x, y + infra.height * 0.74, infra.z);
      const to = new THREE.Vector3(tower.x, y + tower.height * 0.92, tower.z);
      const tube = new THREE.CylinderGeometry(0.35, 0.35, from.distanceTo(to), 5, 1, true);
      const link = new THREE.Mesh(tube, cable);
      link.position.lerpVectors(from, to, 0.5);
      link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      link.frustumCulled = false;
      link.renderOrder = 21;
      this.group.add(link);
    }

    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      neon(CITY.x + Math.cos(a) * 26, y + 0.5, CITY.z + Math.sin(a) * 26, 2.2, 1, 2.2, k % 2 ? CYAN : MAGENTA);
    }
    plain(() => s.cylinder(CITY.x, y, CITY.z, 9, 7, 2, 12, STEEL));
    s.glow = 1;
    s.cylinder(CITY.x, y + 2, CITY.z, 1.2, 0.2, 9, 6, CYAN, false);
    s.glow = 0;
    const hologram = new THREE.Group();
    hologram.position.set(CITY.x, y + 24, CITY.z);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(11, 1), new THREE.MeshBasicNodeMaterial({ wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    (wire.material as THREE.MeshBasicNodeMaterial).colorNode = vec3(0.25, 0.9, 1.0).mul(sin(time.mul(1.3)).mul(0.25).add(1));
    wire.frustumCulled = false;
    const sigil = createSigns(
      [
        { text: '~ λ', x: 0, y: 0, z: 0, yaw: 0, height: 9, color: [1.0, 0.85, 0.3] },
        { text: '~ λ', x: 0, y: 0, z: 0, yaw: Math.PI / 2, height: 9, color: [1.0, 0.85, 0.3] },
      ],
      0,
      false,
    );
    hologram.add(wire, sigil);
    this.group.add(hologram);
    this.spinners.push({ object: hologram, rate: 0.35 });

    const bars = barsMaterial();
    const big = blocks.filter((block) => block.h > 44).slice(0, 12);
    big.forEach((block, i) => {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(block.d * 0.7, 12), bars);
      const side = i % 2 ? 1 : -1;
      panel.position.set(block.x + side * (block.w / 2 + 0.45), y + block.h * 0.42, block.z);
      panel.rotation.y = side * (Math.PI / 2);
      panel.frustumCulled = false;
      panel.renderOrder = 21;
      this.group.add(panel);
    });

    const beamGeometry = new THREE.CylinderGeometry(0.5, 13, 210, 16, 1, true);
    beamGeometry.translate(0, 105, 0);
    const beamMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const reach: N = uv().y;
    beamMaterial.colorNode = vec3(0.5, 0.85, 1.0);
    beamMaterial.opacityNode = smoothstep(1, 0.9, reach).mul(float(1).sub(reach.oneMinus()).pow(1.4).oneMinus()).mul(0.13);
    blocks
      .filter((block) => block.h > 52)
      .slice(0, 4)
      .forEach((block, i) => {
        const pivot = new THREE.Group();
        pivot.position.set(block.x, y + block.h * 1.3, block.z);
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.rotation.z = 0.5 + i * 0.12;
        beam.frustumCulled = false;
        beam.renderOrder = 20;
        pivot.add(beam);
        this.group.add(pivot);
        this.spinners.push({ object: pivot, rate: (i % 2 ? -1 : 1) * (0.25 + i * 0.07) });
      });

    const lanes: { ox: number; oz: number; dx: number; dz: number; length: number; height: number; air: boolean }[] = [];
    for (let n = -6; n <= 5; n++) {
      const offset = (n + 0.5) * spacing;
      const half = Math.sqrt(Math.max(0, span * span - offset * offset));
      if (half < 30) continue;
      for (const way of [1, -1]) {
        lanes.push({ ox: CITY.x + offset + way * 2.3, oz: CITY.z - way * half, dx: 0, dz: way, length: half * 2, height: y + 0.6, air: false });
        lanes.push({ ox: CITY.x - way * half, oz: CITY.z + offset - way * 2.3, dx: way, dz: 0, length: half * 2, height: y + 0.6, air: false });
      }
    }
    for (const offset of [-154, -22, 22, 154]) {
      const half = Math.sqrt(span * span - offset * offset) + 60;
      const way = offset > 0 ? 1 : -1;
      const high = y + 58 + Math.abs(offset) * 0.2;
      lanes.push({ ox: CITY.x + offset, oz: CITY.z - way * half, dx: 0, dz: way, length: half * 2, height: high, air: true });
      lanes.push({ ox: CITY.x + way * half, oz: CITY.z + offset, dx: -way, dz: 0, length: half * 2, height: high + 16, air: true });
    }
    this.group.add(vehicles(lanes, 5150));

    for (let gz = -CITY.radius; gz <= CITY.radius; gz += 13) {
      for (let gx = -CITY.radius; gx <= CITY.radius; gx += 13) {
        if (Math.hypot(gx, gz) < CITY.radius * 0.84) mask.bare(CITY.x + gx, CITY.z + gz, 15, 1);
      }
    }
    const mesh = new THREE.Mesh(s.geometry(), material);
    mesh.frustumCulled = false;
    const text = createSigns(signs);
    this.group.add(mesh, text);
    this.group.name = 'city';
  }
}
