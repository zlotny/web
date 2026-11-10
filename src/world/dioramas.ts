import * as THREE from 'three/webgpu';
import type { HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { arcadeMaterial } from './arcade';
import { Sculpt, type RGB } from './sculpt';
import { createSigns, type Sign } from './signs';

const GRANITE: RGB = [0.62, 0.6, 0.57];
const GRANITE_DARK: RGB = [0.46, 0.45, 0.44];
const WOOD: RGB = [0.5, 0.36, 0.24];
const WOOD_DARK: RGB = [0.3, 0.21, 0.15];
const BLACK: RGB = [0.08, 0.08, 0.1];
const STEEL: RGB = [0.55, 0.57, 0.62];
const RED: RGB = [0.82, 0.08, 0.07];
const GOLD: RGB = [0.86, 0.68, 0.2];
const CREAM: RGB = [0.92, 0.88, 0.78];
const TILE: RGB = [0.78, 0.42, 0.27];
const CYAN: RGB = [0.3, 0.9, 1.0];
const AMBER: RGB = [1.0, 0.75, 0.25];

export type DioramaId = 'digimon' | 'marionette' | 'glint' | 'garage' | 'studio';

export interface Diorama {
  id: DioramaId;
  x: number;
  z: number;
  height: number;
  radius: number;
}

function bike(s: Sculpt, fork: RGB, naked: boolean): void {
  for (const z of [-1.05, 1.05]) {
    s.push(0, 0.62, z).tilt(0, Math.PI / 2);
    s.cylinder(0, -0.11, 0, 0.62, 0.62, 0.22, 14, BLACK);
    s.cylinder(0, -0.13, 0, 0.36, 0.36, 0.26, 10, STEEL);
    s.pop();
  }
  s.box(0, 0.78, 0.1, 0.34, 0.5, 1.0, [0.2, 0.2, 0.22]);
  s.box(0, 1.16, 0.3, 0.44, 0.34, 0.86, RED);
  s.box(0, 1.2, -0.52, 0.3, 0.14, 0.7, BLACK);
  s.box(0, 1.28, -1.0, 0.24, 0.2, 0.44, RED);
  s.push(0, 0.62, 1.05).tilt(-0.42, 0);
  s.box(0.2, 0.48, 0, 0.07, 1.0, 0.09, fork);
  s.box(-0.2, 0.48, 0, 0.07, 1.0, 0.09, fork);
  s.pop();
  s.box(0, 1.5, 0.74, 0.82, 0.06, 0.08, BLACK);
  if (naked) {
    s.box(0, 1.22, 0.86, 0.3, 0.26, 0.18, BLACK);
    s.box(0.34, 1.02, 0.62, 0.06, 0.2, 0.5, RED);
    s.box(-0.34, 1.02, 0.62, 0.06, 0.2, 0.5, RED);
  } else {
    s.box(0, 1.08, 0.94, 0.5, 0.74, 0.62, RED);
    s.box(0, 1.52, 1.02, 0.34, 0.24, 0.1, [0.25, 0.3, 0.38]);
    s.box(0, 0.74, 0.4, 0.46, 0.5, 0.9, RED);
  }
  s.glow = 1;
  s.box(0, 1.2, 1.27, 0.2, 0.1, 0.04, [1, 0.95, 0.8]);
  s.box(0, 1.3, -1.23, 0.14, 0.06, 0.04, [1, 0.1, 0.1]);
  s.glow = 0;
  s.box(0.24, 0.62, -0.5, 0.1, 0.12, 1.0, STEEL);
  s.box(-0.3, 0.3, 0, 0.06, 0.6, 0.06, STEEL);
}

function guitar(s: Sculpt, kind: 'v' | 'burst' | 'classic'): void {
  const neck: RGB = kind === 'classic' ? [0.4, 0.26, 0.16] : [0.25, 0.17, 0.12];
  if (kind === 'v') {
    s.push(0, 0.5, 0).tilt(0, 0.5);
    s.box(0.22, 0.1, 0, 0.26, 0.9, 0.09, BLACK);
    s.pop();
    s.push(0, 0.5, 0).tilt(0, -0.5);
    s.box(-0.22, 0.1, 0, 0.26, 0.9, 0.09, BLACK);
    s.pop();
    s.box(0, 0.86, 0, 0.3, 0.3, 0.09, BLACK);
  } else {
    const body: RGB = kind === 'burst' ? [0.78, 0.4, 0.1] : [0.85, 0.62, 0.32];
    s.push(0, 0.42, 0).tilt(Math.PI / 2, 0);
    s.cylinder(0, -0.06, 0, 0.42, 0.42, 0.12, 12, body);
    s.cylinder(0, -0.06, -0.4, 0.32, 0.32, 0.12, 12, body);
    if (kind === 'burst') s.cylinder(0, 0.062, -0.1, 0.5, 0.5, 0.004, 12, [0.2, 0.1, 0.05], false);
    if (kind === 'classic') s.cylinder(0, 0.062, -0.12, 0.11, 0.11, 0.01, 10, BLACK);
    s.pop();
  }
  s.box(0, 1.5, 0.02, 0.09, 1.3, 0.05, neck);
  s.box(0, 2.22, 0.02, 0.16, 0.26, 0.05, kind === 'classic' ? neck : BLACK);
  s.glow = 0.4;
  s.box(0, 1.3, 0.055, 0.05, 1.7, 0.01, STEEL);
  s.glow = 0;
}

function car(s: Sculpt): void {
  const paintJob: RGB = [0.33, 0.35, 0.38];
  const dark: RGB = [0.07, 0.07, 0.09];
  s.box(0, 0.62, 0, 1.9, 0.62, 4.7, paintJob);
  s.box(0, 0.98, 1.5, 1.84, 0.2, 1.7, paintJob);
  s.box(0, 1.0, -1.85, 1.84, 0.22, 1.0, paintJob);
  s.box(0, 1.32, -0.35, 1.62, 0.56, 2.2, [0.1, 0.12, 0.15], 0.82);
  s.box(0, 1.62, -0.4, 1.36, 0.06, 1.5, paintJob);
  s.box(0, 0.62, 2.36, 1.3, 0.44, 0.06, dark);
  s.box(0, 0.36, 2.36, 1.8, 0.2, 0.08, dark);
  s.box(0, 0.34, -2.36, 1.8, 0.24, 0.08, dark);
  for (const x of [-0.5, 0.5]) s.cylinder(x, 0.3, -2.44, 0.09, 0.09, 0.06, 8, STEEL);
  s.glow = 1;
  for (const x of [-0.72, 0.72]) {
    s.box(x, 0.86, 2.37, 0.4, 0.12, 0.04, [0.95, 0.97, 1.0]);
    s.box(x, 0.9, -2.37, 0.44, 0.1, 0.04, [1, 0.12, 0.1]);
  }
  s.glow = 0;
  for (const x of [-0.96, 0.96]) {
    for (const z of [1.5, -1.45]) {
      s.push(x, 0.36, z).tilt(0, Math.PI / 2);
      s.cylinder(0, -0.12, 0, 0.36, 0.36, 0.24, 14, dark);
      s.cylinder(0, -0.14, 0, 0.22, 0.22, 0.28, 10, STEEL);
      s.pop();
    }
    s.box(x * 1.04, 1.12, 0.62, 0.16, 0.1, 0.2, paintJob);
  }
}

export class Dioramas {
  readonly group = new THREE.Group();
  readonly list: Diorama[] = [];
  summit: { x: number; z: number } | null = null;
  private spinners: { object: THREE.Object3D; rate: number; bob: number; base: number }[] = [];

  constructor(
    private map: HeightMap,
    free: (x: number, z: number) => boolean,
  ) {
    const wanted: [DioramaId, number, number, number, number][] = [
      ['digimon', -520, 430, 12, 16],
      ['marionette', -430, -40, 13, 15],
      ['glint', -700, 210, 14, 17],
      ['garage', -90, 345, 9, 17],
      ['studio', 30, 300, 9, 14],
    ];
    for (const [id, x, z, height, radius] of wanted) {
      const spot = map.findLand(x, z, 5, 70, 170, (px, pz) => free(px, pz) && !this.blocked(px, pz, 2.4));
      map.flatten(spot.x, spot.z, radius, 9);
      this.list.push({ id, x: spot.x, z: spot.z, height, radius });
    }
  }

  blocked(x: number, z: number, scale = 1): boolean {
    return this.list.some((d) => Math.hypot(x - d.x, z - d.z) < (d.radius + 10) * scale);
  }

  update(dt: number, now: number): void {
    for (const spinner of this.spinners) {
      spinner.object.rotation.y += spinner.rate * dt;
      spinner.object.position.y = spinner.base + Math.sin(now * 0.001 + spinner.base) * spinner.bob;
    }
  }

  build(light: LightMap, mask: MaskMap, obstacles: Obstacles): void {
    const s = new Sculpt(404);
    s.jitter = 0.05;
    const signs: Sign[] = [];
    const material = arcadeMaterial();
    const at = (id: DioramaId) => this.list.find((d) => d.id === id)!;
    const ground = (d: Diorama) => this.map.sample(d.x, d.z);
    const label = (d: Diorama, yaw: number, text: string, lx: number, ly: number, lz: number, height: number, color: RGB, turn = 0) => {
      signs.push({ text, x: d.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, y: ground(d) + ly, z: d.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz, yaw: yaw + turn, height, color });
    };
    const plinth = (d: Diorama, r: number) => {
      s.cylinder(d.x, ground(d) - 1.2, d.z, r + 1.2, r + 0.6, 1.5, 18, GRANITE_DARK);
      s.cylinder(d.x, ground(d) + 0.3, d.z, r, r - 0.3, 0.4, 18, GRANITE);
    };

    const digi = at('digimon');
    const dy = ground(digi) + 0.7;
    const dyaw = 0.9;
    plinth(digi, 11);
    s.push(digi.x, dy, digi.z, dyaw);
    s.box(0, 3.4, 0, 12.4, 5.6, 1.5, BLACK);
    s.box(0, 3.4, 0.2, 13.4, 3.6, 1.3, [0.14, 0.14, 0.17]);
    s.glow = 2;
    s.box(0, 3.5, 0.82, 7, 4, 0.1, [0.45, 0.8, 1.0]);
    s.glow = 0;
    s.box(-4.9, 3.6, 0.9, 1.5, 0.5, 0.2, STEEL);
    s.box(-4.9, 3.6, 0.9, 0.5, 1.5, 0.2, STEEL);
    for (const [bx, by] of [
      [4.9, 4.2],
      [4.3, 3.6],
      [5.5, 3.6],
      [4.9, 3.0],
    ]) {
      s.push(bx, by, 0.9).tilt(Math.PI / 2, 0);
      s.cylinder(0, 0, 0, 0.26, 0.26, 0.16, 8, STEEL);
      s.pop();
    }
    s.box(0, 0.4, 0, 3, 0.8, 2.4, GRANITE_DARK);
    for (const side of [-1, 1]) {
      s.push(side * 9.4, 0, 3.4).tilt(Math.PI / 2 - 0.25, 0);
      s.cylinder(0, 0, -2.6, 2.3, 2.3, 0.24, 20, side < 0 ? [0.75, 0.78, 0.85] : [0.95, 0.85, 0.5]);
      s.cylinder(0, 0.25, -2.6, 0.5, 0.5, 0.04, 10, BLACK);
      s.pop();
    }
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      s.glow = 1;
      s.box(-7 + t * 14, 0.5 + Math.sin(t * Math.PI) * 1.8, 4.2, 0.7, 0.7, 0.7, t < 0.5 ? [0.75, 0.8, 0.95] : AMBER);
      s.glow = 0;
    }
    s.pop();
    label(digi, dyaw, 'ぼうけん', -4.6, 9, 0.6, 1.7, [0.8, 0.85, 1.0]);
    label(digi, dyaw, '→', 0, 9, 0.6, 1.7, [1, 1, 1]);
    label(digi, dyaw, 'AVENTURA', 5.2, 9, 0.6, 1.7, AMBER);
    label(digi, dyaw, 'デジタル', -4.6, 11.2, 0.6, 1.7, [0.8, 0.85, 1.0]);
    label(digi, dyaw, '→', 0, 11.2, 0.6, 1.7, [1, 1, 1]);
    label(digi, dyaw, 'DIGITAL', 5.2, 11.2, 0.6, 1.7, AMBER);
    label(digi, dyaw, 'ISO', -9.4, 5.6, 3.6, 1.2, [0.8, 0.85, 1.0]);
    label(digi, dyaw, 'ES', 9.4, 5.6, 3.6, 1.2, AMBER);
    light.stamp(digi.x, digi.z, 8, 7, 0.5);
    obstacles.add(digi.x, digi.z, 7, dy - 2, dy + 7);

    const puppet = at('marionette');
    const py = ground(puppet) + 0.7;
    const pyaw = -0.4;
    plinth(puppet, 10);
    s.push(puppet.x, py, puppet.z, pyaw);
    for (const x of [-5, 5]) s.box(x, 5.5, -1, 0.7, 11, 0.7, WOOD_DARK);
    s.box(0, 11.2, -1, 11.6, 0.8, 1.2, WOOD);
    s.box(0, 0.5, -1, 11, 1, 5, WOOD);
    s.box(0, 6, -3.2, 10.4, 10, 0.3, [0.45, 0.12, 0.16]);
    for (const x of [-4.4, 4.4]) s.box(x, 6, -0.4, 1.6, 10, 0.4, [0.62, 0.14, 0.2]);
    s.push(0, 10.2, -0.6).tilt(0, 0.12);
    s.box(0, 0, 0, 4.4, 0.24, 0.5, WOOD_DARK);
    s.box(0, 0, 0, 0.5, 0.24, 3, WOOD_DARK);
    s.pop();
    s.box(0, 5.3, -0.6, 2.5, 4.8, 0.36, BLACK);
    s.glow = 2;
    s.box(0, 5.4, -0.4, 2.1, 3.9, 0.06, [0.55, 0.95, 0.75]);
    s.glow = 0;
    s.box(0, 3.1, -0.4, 0.5, 0.14, 0.06, STEEL);
    for (const [ax, ay, len] of [
      [-1.9, 5.6, 1.3],
      [1.9, 5.6, 1.3],
    ]) {
      s.box(ax, ay, -0.6, 0.34, len, 0.34, [0.86, 0.7, 0.5]);
      s.box(ax, ay - 0.9, -0.6, 0.46, 0.46, 0.46, CREAM);
    }
    for (const lx of [-0.6, 0.6]) {
      s.box(lx, 2.2, -0.6, 0.36, 1.5, 0.36, [0.86, 0.7, 0.5]);
      s.box(lx, 1.3, -0.4, 0.5, 0.36, 0.8, WOOD_DARK);
    }
    s.glow = 0.5;
    for (const [sx, sy] of [
      [-1.9, 6.3],
      [1.9, 6.3],
      [-0.9, 7.7],
      [0.9, 7.7],
    ]) {
      s.box(sx, (sy + 10.2) / 2, -0.6, 0.04, 10.2 - sy, 0.04, CREAM);
    }
    s.glow = 1;
    for (let i = 0; i < 9; i++) {
      const h = 0.5 + Math.abs(Math.sin(i * 1.3)) * 2.2;
      s.box(-6 + i * 0.5 - 3, 3 + h / 2, 3.4, 0.3, h, 0.3, i % 2 ? CYAN : [0.5, 1, 0.7]);
    }
    s.glow = 0;
    s.push(-10.6, 0, 3.4);
    s.box(0, 1.2, 0, 0.5, 2.4, 0.5, STEEL);
    s.cylinder(0, 2.4, 0, 0.6, 0.6, 1.2, 10, BLACK);
    s.pop();
    s.pop();
    label(puppet, pyaw, 'HEY MARIONETTE', 0, 13.2, -0.4, 1.5, [0.5, 1.0, 0.75]);
    label(puppet, pyaw, '"CALL MUM"', -6.4, 6.6, 3.5, 1.0, CYAN);
    light.stamp(puppet.x, puppet.z, 7, 11, 0.5);
    obstacles.add(puppet.x, puppet.z, 6.5, py - 2, py + 12);

    const glint = at('glint');
    const gy = ground(glint) + 0.7;
    plinth(glint, 12);
    const frames: [number, number, number, number, number, boolean][] = [
      [-6.5, 4.4, -3, 5.4, 0.5, false],
      [-2.6, 6.2, -5.4, 6, 0.2, false],
      [0.4, 5, 0.6, 7.4, -0.05, true],
      [5.6, 4.2, -3.2, 5, -0.4, false],
      [3.2, 7.4, -6.4, 4.6, -0.2, false],
      [-5, 8, -7, 4.2, 0.3, false],
    ];
    frames.forEach(([fx, fy, fz, w, yaw, active], i) => {
      const h = w * 0.66;
      s.push(glint.x + fx, gy + fy, glint.z + fz, yaw + 0.5);
      s.box(0, 0, 0, w, h, 0.2, active ? [0.95, 0.96, 1.0] : [0.36, 0.38, 0.46]);
      s.box(0, h / 2 - 0.3, 0.12, w, 0.6, 0.06, active ? [0.86, 0.88, 0.94] : [0.26, 0.28, 0.34]);
      for (const [k, dot] of [
        [0, [0.95, 0.35, 0.3]],
        [1, [0.98, 0.75, 0.2]],
        [2, [0.3, 0.8, 0.35]],
      ] as [number, RGB][]) {
        s.box(-w / 2 + 0.5 + k * 0.5, h / 2 - 0.3, 0.17, 0.26, 0.26, 0.04, active ? dot : [0.45, 0.46, 0.5]);
      }
      for (let row = 0; row < 4; row++) s.box(-w * 0.12 + (row % 2) * 0.4, h / 2 - 1.3 - row * 0.7, 0.12, w * (0.6 - (row % 3) * 0.12), 0.24, 0.04, active ? [0.4, 0.45, 0.6] : [0.28, 0.3, 0.36]);
      if (active) {
        s.glow = 1;
        s.box(0, h / 2 + 0.24, 0, w + 0.9, 0.24, 0.3, AMBER);
        s.box(0, -h / 2 - 0.24, 0, w + 0.9, 0.24, 0.3, AMBER);
        s.box(-w / 2 - 0.33, 0, 0, 0.24, h + 0.5, 0.3, AMBER);
        s.box(w / 2 + 0.33, 0, 0, 0.24, h + 0.5, 0.3, AMBER);
        s.glow = 0;
      }
      s.pop();
      s.box(glint.x + fx, gy + (fy - w * 0.33) / 2, glint.z + fz, 0.2, fy - w * 0.33, 0.2, STEEL);
      void i;
    });
    s.push(glint.x + 6, gy, glint.z + 6, 0.5);
    s.box(-1.9, 0.7, 0, 3, 1.4, 1.4, [0.9, 0.9, 0.93]);
    s.box(1.9, 0.7, 0, 3, 1.4, 1.4, [0.9, 0.9, 0.93]);
    s.pop();
    label(glint, 0.5, 'CMD', 4.1, 0.75, 6.72, 0.7, CREAM);
    label(glint, 0.5, 'TAB', 7.9, 0.75, 6.72, 0.7, CREAM);
    label(glint, 0.5, 'GLINT', -1.5, 13.4, -3, 1.6, AMBER);
    light.stamp(glint.x, glint.z, 9, 9, 0.45);
    obstacles.add(glint.x, glint.z - 3, 8, gy - 2, gy + 11);

    const garage = at('garage');
    const yy = ground(garage);
    const yaw = 2.4;
    s.push(garage.x, yy, garage.z, yaw);
    s.box(0, 2.2, -5, 14, 4.4, 0.7, GRANITE);
    s.box(-6.7, 2.2, -1.2, 0.7, 4.4, 8, GRANITE);
    s.box(6.7, 2.2, -1.2, 0.7, 4.4, 8, GRANITE_DARK);
    s.gable(0, 4.4, -1.2, 15, 2.6, 9.4, TILE, GRANITE);
    s.box(0, 0.06, -1, 13, 0.12, 7.6, [0.4, 0.4, 0.42]);
    s.box(0, 2.6, -4.55, 6.4, 2.6, 0.12, WOOD);
    for (let i = 0; i < 7; i++) s.box(-2.7 + i * 0.9, 2.2 + (i % 3) * 0.5, -4.46, 0.14, 0.9 + (i % 2) * 0.4, 0.06, STEEL);
    s.box(5.9, 1.7, -4.3, 1.1, 3.4, 0.8, BLACK);
    s.glow = 1;
    for (let i = 0; i < 10; i++) s.box(5.5 + (i % 3) * 0.4, 0.6 + Math.floor(i / 3) * 0.8, -3.88, 0.12, 0.12, 0.04, i % 2 ? [0.3, 1, 0.5] : AMBER);
    s.glow = 0;
    s.box(-5, 0.5, -3.8, 2.2, 1, 1.2, RED);
    s.box(-5, 1.05, -3.8, 2.3, 0.1, 1.3, STEEL);
    s.push(-4.4, 0, -0.9, 0.5);
    bike(s, STEEL, false);
    s.pop();
    s.push(-1.4, 0, -1.1, -0.35);
    bike(s, GOLD, true);
    s.pop();
    s.box(-0.6, 0.25, 1.9, 1.3, 0.5, 0.5, RED);
    s.push(3.9, 0.12, -0.7, 0.12);
    car(s);
    s.pop();
    s.pop();
    light.stamp(garage.x, garage.z, 9, 6, 0.55);
    obstacles.add(garage.x + Math.sin(yaw) * -1.2, garage.z + Math.cos(yaw) * -1.2, 7.5, yy - 1, yy + 7.2);
    mask.bare(garage.x, garage.z, 15, 0.9);

    const studio = at('studio');
    const sy = ground(studio);
    const syaw = 3.4;
    s.push(studio.x, sy, studio.z, syaw);
    s.box(0, 0.3, 0, 12, 0.6, 9, WOOD);
    s.box(0, 3, -4.3, 12, 5.4, 0.5, [0.2, 0.17, 0.22]);
    for (const x of [-5.8, 5.8]) s.box(x, 3, -2.2, 0.5, 5.4, 4.6, [0.24, 0.2, 0.26]);
    s.box(0, 5.9, -1.6, 13, 0.4, 6.4, BLACK);
    for (const x of [-3.2, 3.2]) {
      s.box(x, 1.7, -3.2, 2.2, 2.2, 1.1, BLACK);
      s.box(x, 3.9, -3.2, 2.2, 2.2, 1.1, BLACK);
      s.box(x, 5.2, -3.2, 2, 0.5, 0.9, [0.16, 0.16, 0.18]);
      s.glow = 1;
      s.box(x - 0.7, 5.2, -2.73, 0.1, 0.1, 0.04, [1, 0.2, 0.1]);
      s.glow = 0;
      for (const [cx, cy] of [
        [-0.5, 1.2],
        [0.5, 1.2],
        [-0.5, 2.2],
        [0.5, 2.2],
        [-0.5, 3.4],
        [0.5, 3.4],
        [-0.5, 4.4],
        [0.5, 4.4],
      ]) {
        s.push(x + cx, cy, -2.64).tilt(Math.PI / 2, 0);
        s.cylinder(0, 0, 0, 0.38, 0.38, 0.04, 10, [0.3, 0.3, 0.33]);
        s.cylinder(0, 0.03, 0, 0.14, 0.14, 0.04, 8, [0.12, 0.12, 0.14]);
        s.pop();
      }
    }
    const kinds: ('v' | 'burst' | 'classic')[] = ['v', 'burst', 'classic'];
    kinds.forEach((kind, i) => {
      s.push(-1.5 + i * 1.5, 0.75, -2.2 + (i % 2) * 0.4, -0.2 + i * 0.2).tilt(-0.14, 0);
      guitar(s, kind);
      s.pop();
      s.box(-1.5 + i * 1.5, 0.75, -2.5, 0.5, 0.3, 0.5, STEEL);
    });
    s.push(0, 0.6, 1.2);
    s.cylinder(0, 0, 0, 0.9, 0.9, 0.9, 14, [0.5, 0.1, 0.12]);
    s.cylinder(-1.4, 0.3, 0.3, 0.5, 0.5, 0.6, 12, [0.5, 0.1, 0.12]);
    s.cylinder(1.4, 0.3, 0.3, 0.6, 0.6, 0.7, 12, [0.5, 0.1, 0.12]);
    s.cylinder(-1.9, 0, -0.6, 0.04, 0.04, 1.8, 5, STEEL);
    s.cylinder(-1.9, 1.8, -0.6, 0.6, 0.6, 0.04, 12, GOLD);
    s.cylinder(1.9, 0, -0.6, 0.04, 0.04, 2, 5, STEEL);
    s.cylinder(1.9, 2, -0.6, 0.7, 0.7, 0.04, 12, GOLD);
    s.box(0, 0.5, -1, 0.7, 0.5, 0.7, BLACK);
    s.pop();
    s.box(0, 0.68, 3.2, 3.4, 0.16, 1, BLACK);
    s.glow = 1;
    [[1, 0.2, 0.2], [0.2, 0.9, 0.4], [0.3, 0.6, 1], [1, 0.8, 0.2], [0.8, 0.3, 1]].forEach((c, i) => s.box(-1.3 + i * 0.65, 0.8, 3.2, 0.4, 0.14, 0.6, c as RGB));
    for (let i = 0; i < 7; i++) s.box(-4.6 + i * 1.5, 6.3, 1.5, 0.3, 0.3, 0.3, i % 2 ? [1, 0.3, 0.2] : [1, 0.75, 0.25]);
    s.glow = 0;
    s.box(-4.4, 3.4, -4.02, 1.8, 2.4, 0.06, [0.75, 0.15, 0.12]);
    s.box(4.4, 3.4, -4.02, 1.8, 2.4, 0.06, [0.86, 0.72, 0.2]);
    s.box(0, 3.9, -4.02, 2.2, 1.6, 0.06, [0.15, 0.3, 0.5]);
    s.pop();
    label(studio, syaw, 'LOUD', 0, 7.2, 1.7, 1.4, [1, 0.3, 0.2]);
    label(studio, syaw, '♪ ♫ ♪', 0, 9.4, 0, 1.3, AMBER);
    light.stamp(studio.x, studio.z, 8, 6, 0.55);
    obstacles.add(studio.x + Math.sin(syaw) * -2.2, studio.z + Math.cos(syaw) * -2.2, 6.5, sy - 1, sy + 6.6);
    mask.bare(studio.x, studio.z, 12, 0.9);

    if (this.summit) {
      const { x, z } = this.summit;
      const by = this.map.sample(x, z);
      const yaw = Math.atan2(-x - 400, -z - 300);
      const jacket: RGB = [0.07, 0.07, 0.08];
      const hoodie: RGB = [0.09, 0.09, 0.11];
      const trousers: RGB = [0.1, 0.1, 0.12];
      const skin: RGB = [0.84, 0.66, 0.56];
      const sit = (px: number, top: RGB, hair: RGB, lean: number, build: number, extras: () => void) => {
        s.push(px, 0.62, 0.02).tilt(0, lean);
        s.box(-0.13 * build, 0.08, 0.26, 0.22 * build, 0.2, 0.56, trousers);
        s.box(0.13 * build, 0.08, 0.26, 0.22 * build, 0.2, 0.56, trousers);
        s.box(-0.13 * build, -0.2, 0.5, 0.2 * build, 0.5, 0.2, trousers);
        s.box(0.13 * build, -0.2, 0.5, 0.2 * build, 0.5, 0.2, trousers);
        s.box(0, 0.5, 0, 0.56 * build, 0.74, 0.34 * build, top);
        s.box(0, 1.05, 0.02, 0.34, 0.36, 0.34, skin);
        s.box(0, 1.2, -0.03, 0.38, 0.16, 0.38, hair);
        s.box(0, 1.08, -0.17, 0.38, 0.3, 0.08, hair);
        extras();
        s.pop();
      };
      s.push(x, by, z, yaw);
      s.cylinder(0, -0.3, 0, 4.2, 3.6, 0.36, 14, GRANITE);
      for (const lx of [-1.05, 1.05]) {
        s.box(lx, 0.3, 0, 0.14, 0.6, 0.6, GRANITE_DARK);
        s.box(lx, 0.85, -0.3, 0.12, 0.7, 0.12, GRANITE_DARK);
      }
      for (let i = 0; i < 3; i++) s.box(0, 0.6, -0.18 + i * 0.2, 2.5, 0.07, 0.17, WOOD);
      for (let i = 0; i < 2; i++) s.box(0, 0.92 + i * 0.24, -0.34, 2.5, 0.17, 0.07, WOOD);
      sit(-0.34, hoodie, [0.1, 0.08, 0.07], -0.09, 1.12, () => {
        s.box(0, 0.93, 0.13, 0.3, 0.16, 0.14, [0.1, 0.08, 0.07]);
        s.box(0, 0.86, -0.02, 0.5, 0.14, 0.4, hoodie);
        s.box(-0.06, 0.55, 0.18, 0.03, 0.6, 0.02, [0.92, 0.92, 0.9]);
        s.box(0.07, 0.72, 0.18, 0.02, 0.26, 0.02, [0.92, 0.92, 0.9]);
        s.box(-0.33, 0.5, 0.06, 0.16, 0.6, 0.22, hoodie);
        s.box(0.42, 0.72, -0.12, 0.6, 0.16, 0.18, hoodie);
        for (const fx of [-0.14, 0.14]) s.box(fx, -0.48, 0.58, 0.22, 0.12, 0.36, [0.12, 0.12, 0.14]);
      });
      sit(0.36, jacket, [0.2, 0.1, 0.085], 0.13, 0.98, () => {
        s.box(0, 0.82, -0.2, 0.42, 0.62, 0.1, [0.2, 0.1, 0.085]);
        s.box(0.19, 0.95, -0.06, 0.08, 0.4, 0.3, [0.2, 0.1, 0.085]);
        s.box(0, 0.84, 0.0, 0.46, 0.1, 0.36, jacket);
        s.box(0.32, 0.5, 0.06, 0.15, 0.6, 0.22, jacket);
        s.box(-0.3, 0.42, 0.14, 0.15, 0.5, 0.24, jacket);
        for (const fx of [-0.13, 0.13]) s.box(fx, -0.48, 0.58, 0.2, 0.12, 0.34, [0.96, 0.96, 0.95]);
      });
      const white: RGB = [0.93, 0.92, 0.88];
      const patch: RGB = [0.08, 0.08, 0.09];
      s.push(2.5, 0, 1.0, -0.25);
      s.box(0, 0.42, -0.2, 0.78, 0.62, 1.5, white);
      s.box(0, 0.6, -0.5, 0.82, 0.34, 0.7, patch);
      s.box(0, 0.5, -1.0, 0.7, 0.5, 0.3, white);
      s.box(0.3, 0.2, -1.5, 0.16, 0.16, 0.8, white);
      for (const side of [-1, 1]) {
        s.box(side * 0.28, 0.12, 0.95, 0.22, 0.22, 1.0, white);
        s.box(side * 0.28, 0.1, 1.5, 0.26, 0.2, 0.22, white);
        s.box(side * 0.44, 0.16, -0.6, 0.24, 0.3, 0.6, white);
      }
      s.box(0, 0.86, 0.55, 0.5, 0.5, 0.5, white);
      s.box(0, 1.2, 0.86, 0.62, 0.56, 0.56, patch);
      s.box(0, 1.22, 0.9, 0.16, 0.6, 0.6, white);
      s.box(0, 1.06, 1.28, 0.36, 0.3, 0.4, white);
      s.box(0, 1.1, 1.5, 0.2, 0.16, 0.08, patch);
      for (const side of [-1, 1]) {
        s.box(side * 0.36, 1.2, 0.74, 0.12, 0.4, 0.3, patch);
        s.box(side * 0.2, 1.3, 1.145, 0.07, 0.06, 0.02, [0.3, 0.2, 0.1]);
      }
      s.pop();
      s.cylinder(-2.7, 0, 0.7, 0.07, 0.06, 1.5, 6, WOOD_DARK);
      s.box(-2.7, 1.5, 0.7, 1.1, 0.09, 0.09, WOOD);
      s.push(1.75, 0, -0.5, 0.4);
      s.box(0, 0.3, 0, 0.5, 0.6, 0.3, jacket);
      s.box(0, 0.36, 0.17, 0.34, 0.3, 0.06, [0.14, 0.14, 0.16]);
      s.pop();
      s.pop();
      obstacles.add(x, z, 1.5, by - 1, by + 1.4);
      mask.bare(x, z, 6, 0.7);
    }

    for (const d of this.list) if (d.id !== 'garage' && d.id !== 'studio') mask.bare(d.x, d.z, d.radius + 2, 0.8);
    const mesh = new THREE.Mesh(s.geometry(), material);
    mesh.frustumCulled = false;
    this.group.add(mesh, createSigns(signs));
    this.group.name = 'dioramas';
  }
}
