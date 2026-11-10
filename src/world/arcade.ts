import * as THREE from 'three/webgpu';
import { attribute, float, floor, normalWorld, positionWorld, sin, step, time, vec2 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import type { HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { Sculpt, type RGB } from './sculpt';
import { applyFog, noise, paint, type N } from './shading';
import { createSigns, type Sign } from './signs';
import { ARCADE } from './zones';

const BLACK: RGB = [0.1, 0.1, 0.13];
const GREY: RGB = [0.62, 0.62, 0.66];
const CREAM: RGB = [0.88, 0.85, 0.76];
const RED: RGB = [0.86, 0.18, 0.2];
const BLUE: RGB = [0.16, 0.36, 0.86];
const YELLOW: RGB = [0.98, 0.82, 0.18];
const GREEN: RGB = [0.2, 0.72, 0.38];
const PINK: RGB = [1.0, 0.4, 0.72];
const PURPLE: RGB = [0.5, 0.3, 0.85];
const TEAL: RGB = [0.2, 0.8, 0.78];
const WOOD: RGB = [0.5, 0.36, 0.24];
const BRIGHT = [RED, BLUE, YELLOW, GREEN, PINK, PURPLE, TEAL];

export type ArcadeId = 'consoles' | 'lan' | 'jam' | 'podcast';

export interface Stand {
  id: ArcadeId;
  x: number;
  z: number;
  height: number;
}

function cabinet(s: Sculpt, body: RGB, trim: RGB, screen: RGB): void {
  s.box(0, 5, 0, 9, 10, 8, body);
  s.box(0, 14.5, -1.2, 9, 9, 5.6, body);
  s.box(0, 20, -0.4, 9.6, 2.6, 7.6, trim);
  s.box(0, 10.4, 2.6, 8.4, 0.8, 3.6, BLACK);
  s.glow = 2;
  s.box(0, 14.6, 1.72, 6.8, 5.4, 0.3, screen);
  s.glow = 1;
  s.box(0, 20, 3.5, 8, 1.7, 0.3, trim);
  s.glow = 0;
  s.cylinder(-2, 10.8, 2.8, 0.22, 0.22, 1.3, 6, GREY);
  s.box(-2, 12.4, 2.8, 0.9, 0.9, 0.9, RED);
  for (const [x, color] of [
    [0.6, YELLOW],
    [1.9, BLUE],
    [3.2, GREEN],
  ] as [number, RGB][]) {
    s.cylinder(x, 10.8, 2.9, 0.48, 0.48, 0.3, 8, color);
  }
  for (const x of [-4.56, 4.56]) {
    s.glow = 0.6;
    s.box(x, 9, 0, 0.14, 13, 1.2, trim);
    s.glow = 0;
  }
  s.box(0, 3.4, 4.05, 3, 1.6, 0.2, BLACK);
  s.box(0, 3.4, 4.18, 0.5, 1.0, 0.1, YELLOW);
}

function pixelTree(s: Sculpt, leaf: RGB): void {
  s.box(0, 2, 0, 1.6, 4, 1.6, WOOD);
  for (const [x, y, z, size] of [
    [0, 6, 0, 5],
    [0, 9.4, 0, 3.4],
    [2.2, 5.2, 1.4, 2.6],
    [-2, 5.6, -1.6, 2.4],
  ]) {
    s.box(x, y, z, size, size, size, leaf);
  }
}

const SKIN: RGB[] = [
  [0.93, 0.76, 0.62],
  [0.8, 0.6, 0.46],
  [0.62, 0.44, 0.33],
];

let shared: THREE.MeshBasicNodeMaterial | null = null;

export function arcadeMaterial(): THREE.MeshBasicNodeMaterial {
  if (shared) return shared;
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const color: N = attribute('color', 'vec3');
  const glow: N = attribute('glow', 'float');
  const normal: N = normalWorld;
  const screen = step(1.5, glow);
  const across: N = positionWorld.x.mul(normal.z.abs()).add(positionWorld.z.mul(normal.x.abs()));
  const cell: N = floor(vec2(across, positionWorld.y).div(0.62));
  const frame = floor(time.mul(5));
  const roll = noise(cell.mul(0.0371).add(vec2(frame.mul(0.0173), frame.mul(0.0311))));
  const sprite = step(0.56, roll.r);
  const scan = sin(positionWorld.y.mul(9)).mul(0.08).add(0.92);
  const picture = color.mul(color).mul(sprite.mul(0.9).add(0.25)).mul(scan).mul(1.25);
  const lamp = glow.min(1).mul(screen.oneMinus());
  const flicker = sin(time.mul(7.3).add(positionWorld.x)).mul(0.06).add(1);
  const lit = paint(color, normal, positionWorld, float(1), 0.82, false);
  material.colorNode = applyFog(lit.mul(screen.oneMinus()).add(color.mul(color).mul(lamp).mul(flicker).mul(5)).add(picture.mul(screen)), positionWorld);
  shared = material;
  return material;
}

function figure(s: Sculpt, shirt: RGB, skin: RGB, seated: boolean): void {
  const hip = seated ? 0.55 : 0.95;
  if (seated) {
    s.box(-0.14, hip, 0.22, 0.2, 0.2, 0.5, [0.2, 0.24, 0.4]);
    s.box(0.14, hip, 0.22, 0.2, 0.2, 0.5, [0.2, 0.24, 0.4]);
    s.box(-0.14, hip - 0.28, 0.44, 0.18, 0.5, 0.18, [0.2, 0.24, 0.4]);
    s.box(0.14, hip - 0.28, 0.44, 0.18, 0.5, 0.18, [0.2, 0.24, 0.4]);
  } else {
    s.box(-0.14, hip / 2, 0, 0.2, hip, 0.22, [0.2, 0.24, 0.4]);
    s.box(0.14, hip / 2, 0, 0.2, hip, 0.22, [0.2, 0.24, 0.4]);
  }
  s.box(0, hip + 0.36, 0, 0.52, 0.72, 0.3, shirt);
  s.box(-0.33, hip + 0.4, 0.14, 0.14, 0.2, 0.5, shirt);
  s.box(0.33, hip + 0.4, 0.14, 0.14, 0.2, 0.5, shirt);
  s.box(0, hip + 0.94, 0, 0.36, 0.36, 0.36, skin);
  s.box(0, hip + 1.16, -0.02, 0.4, 0.12, 0.4, [0.16, 0.12, 0.1]);
}

function handheld(s: Sculpt, shell: RGB): void {
  s.box(0, 13, 0, 16, 26, 3, shell);
  s.box(0, 18.6, 1.56, 12.6, 10.6, 0.2, [0.25, 0.27, 0.33]);
  s.glow = 2;
  s.box(0, 18.6, 1.7, 10, 8.4, 0.16, [0.55, 0.8, 0.35]);
  s.glow = 0;
  s.box(-4.2, 8, 1.7, 4.4, 1.5, 0.5, BLACK);
  s.box(-4.2, 8, 1.7, 1.5, 4.4, 0.5, BLACK);
  s.push(0, 0, 0).tilt(Math.PI / 2, 0);
  s.cylinder(3, 1.5, -7.2, 1.1, 1.1, 0.5, 10, [0.72, 0.12, 0.3]);
  s.cylinder(5.6, 1.5, -8.6, 1.1, 1.1, 0.5, 10, [0.72, 0.12, 0.3]);
  s.pop();
  for (const x of [-1.6, 1.4]) s.box(x, 3.8, 1.6, 2, 0.6, 0.3, [0.4, 0.4, 0.45]);
  for (let i = 0; i < 5; i++) s.box(5.2 + i * 0.5 - i * 0.2, 2.2 + i * 0.5, 1.56, 0.24, 2.4, 0.14, [0.3, 0.3, 0.34]);
}

function gamepad(s: Sculpt): void {
  s.box(0, 1.6, 0, 20, 2.6, 8.4, [0.82, 0.82, 0.86]);
  s.box(-8.4, 1.2, 3.6, 4.4, 2.2, 6, [0.82, 0.82, 0.86]);
  s.box(8.4, 1.2, 3.6, 4.4, 2.2, 6, [0.82, 0.82, 0.86]);
  s.box(-6, 3.1, -0.4, 4.2, 0.5, 1.4, BLACK);
  s.box(-6, 3.1, -0.4, 1.4, 0.5, 4.2, BLACK);
  const buttons: [number, number, RGB][] = [
    [6, -2, YELLOW],
    [7.8, -0.4, RED],
    [4.2, -0.4, BLUE],
    [6, 1.2, GREEN],
  ];
  for (const [x, z, color] of buttons) s.cylinder(x, 2.9, z, 0.8, 0.8, 0.5, 10, color);
  for (const x of [-2.6, 2.6]) {
    s.cylinder(x, 2.9, 2, 1.2, 1.2, 0.4, 10, BLACK);
    s.cylinder(x, 3.3, 2, 0.5, 0.5, 0.9, 8, [0.3, 0.3, 0.33]);
    s.cylinder(x, 4.2, 2, 1, 1, 0.4, 10, [0.3, 0.3, 0.33]);
  }
  s.box(-1, 3, -1.6, 1.4, 0.3, 0.6, GREY);
  s.box(1, 3, -1.6, 1.4, 0.3, 0.6, GREY);
  for (let i = 0; i < 9; i++) s.box(Math.sin(i * 0.7) * 2.4, 0.3, -5 - i * 2.2, 0.6, 0.6, 2.4, BLACK);
}

function cartridge(s: Sculpt, shell: RGB, label: RGB): void {
  s.box(0, 4, 0, 6.2, 8, 1.6, shell);
  s.box(0, 4.6, 0.84, 4.8, 4.6, 0.1, label);
  s.box(0, 6.4, 0.9, 4.8, 0.9, 0.1, CREAM);
  for (let i = 0; i < 4; i++) s.box(0, 0.6 + i * 0.36, 0.84, 5.4, 0.16, 0.1, BLACK);
}

function pixelCloud(s: Sculpt): void {
  const white: RGB = [0.98, 0.98, 1];
  for (const [x, y, w, h] of [
    [0, 0, 22, 4],
    [-3, 4, 12, 4],
    [5, 4, 6, 4],
    [-2, 8, 6, 3],
    [0, -3.4, 16, 2.8],
  ]) {
    s.box(x, y, 0, w, h, 5, white);
  }
}

export class Arcade {
  readonly group = new THREE.Group();
  readonly stands: Stand[] = [];
  readonly ground: number;
  private clouds = new THREE.Group();
  private emblem = new THREE.Group();

  constructor(private map: HeightMap) {
    this.ground = map.flatten(ARCADE.x, ARCADE.z, ARCADE.radius * 0.84, ARCADE.radius * 0.5);
    const place = (id: ArcadeId, dx: number, dz: number, height: number) => this.stands.push({ id, x: ARCADE.x + dx, z: ARCADE.z + dz, height });
    place('jam', -70, -55, 22);
    place('consoles', 75, -50, 20);
    place('lan', 60, 80, 12);
    place('podcast', -85, 70, 16);
  }

  blocked(x: number, z: number): boolean {
    return Math.hypot(x - ARCADE.x, z - ARCADE.z) < ARCADE.radius * 1.06;
  }

  update(dt: number, now: number): void {
    this.clouds.rotation.y += dt * 0.012;
    this.emblem.rotation.y += dt * 0.8;
    this.emblem.position.y = this.ground + 13 + Math.round(Math.sin(now * 0.002) * 4) * 0.4;
  }

  build(light: LightMap, mask: MaskMap, obstacles: Obstacles): void {
    const rand = mulberry32(1985);
    const s = new Sculpt(1985);
    s.jitter = 0.04;
    const y = this.ground;
    const signs: Sign[] = [];
    const at = (id: ArcadeId) => this.stands.find((stand) => stand.id === id)!;
    const label = (text: string, ox: number, oz: number, yaw: number, lx: number, ly: number, lz: number, height: number, color: RGB, turn = 0) => {
      signs.push({
        text,
        x: ox + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
        y: y + ly,
        z: oz - Math.sin(yaw) * lx + Math.cos(yaw) * lz,
        yaw: yaw + turn,
        height,
        color,
      });
    };

    const jam = at('jam');
    const row: [number, RGB, RGB, RGB][] = [
      [-13, PURPLE, PINK, TEAL],
      [0, [0.14, 0.2, 0.42], YELLOW, [0.4, 0.9, 0.5]],
      [13, RED, YELLOW, [0.5, 0.75, 1.0]],
    ];
    row.forEach(([offset, body, trim, screen], i) => {
      const yaw = 0.5 + offset * 0.02;
      const cx = jam.x + offset;
      const cz = jam.z - Math.abs(offset) * 0.25;
      s.push(cx, y, cz, yaw);
      cabinet(s, body, trim, screen);
      s.pop();
      label(['PLAYER 1', 'GAME JAM', 'HIGH SCORE'][i], cx, cz, yaw, 0, 20, 3.75, 1.5, [1, 1, 1]);
      obstacles.add(cx, cz, 6, y - 1, y + 22);
    });
    label('INSERT COIN', jam.x, jam.z, 0.5, 0, 25.5, 2, 2.4, YELLOW);
    for (let i = 0; i < 4; i++) {
      s.push(jam.x - 10 + i * 6.5, y, jam.z + 13 + (i % 2) * 2, 0.5 + Math.PI + (rand() - 0.5) * 0.5);
      figure(s, BRIGHT[i], SKIN[i % 3], false);
      s.pop();
    }
    light.stamp(jam.x, jam.z, 16, 20, 0.5);

    const shelf = at('consoles');
    const shelfYaw = -0.5;
    s.push(shelf.x, y, shelf.z, shelfYaw);
    s.box(0, 9, -3, 30, 18, 3.4, WOOD);
    for (let level = 0; level < 4; level++) {
      s.box(0, 1.2 + level * 4.4, -0.4, 30, 0.5, 5.4, [0.42, 0.3, 0.2]);
      let x = -13.6;
      while (x < 13) {
        const w = 1.6 + rand() * 3.2;
        const h = 0.8 + rand() * 2.2;
        const tone = rand();
        const color: RGB = tone < 0.3 ? GREY : tone < 0.5 ? BLACK : tone < 0.62 ? CREAM : BRIGHT[Math.floor(rand() * BRIGHT.length)];
        const depth = 2.6 + rand() * 1.4;
        s.box(x + w / 2, 1.45 + level * 4.4 + h / 2, -0.2, w, h, depth, color);
        if (rand() < 0.5) s.box(x + w / 2, 1.45 + level * 4.4 + h + 0.12, -0.2, w * 0.5, 0.24, depth * 0.5, tone < 0.5 ? RED : BLACK);
        if (rand() < 0.35) {
          s.glow = 1;
          s.box(x + w * 0.2, 1.45 + level * 4.4 + h * 0.5, -0.2 + depth / 2 + 0.03, 0.2, 0.2, 0.06, GREEN);
          s.glow = 0;
        }
        x += w + 0.5 + rand() * 0.9;
      }
    }
    s.box(-7, 5.4, 9, 13, 10.4, 10, [0.3, 0.29, 0.3]);
    s.box(-7, 0.6, 9, 9, 1.2, 8, BLACK);
    s.glow = 2;
    s.box(-7, 6.2, 14.06, 10.6, 6.6, 0.2, [0.6, 0.75, 1.0]);
    s.glow = 0;
    s.box(-7, 6.2, 14.02, 11.6, 7.6, 0.16, BLACK);
    s.cylinder(-9, 10.6, 9, 0.12, 0.08, 5, 4, GREY);
    s.cylinder(-5, 10.6, 9, 0.12, 0.08, 5, 4, GREY);
    s.box(7, 0.9, 12, 8, 1.8, 6, GREY);
    s.box(7, 1.95, 12, 3.2, 0.3, 2.2, BLACK);
    s.glow = 1;
    s.box(4, 1.2, 15.02, 0.4, 0.3, 0.1, RED);
    s.glow = 0;
    s.push(13, 0, 24, 0.4);
    gamepad(s);
    s.pop();
    const carts: [RGB, RGB][] = [
      [GREY, RED],
      [[0.75, 0.6, 0.2], GREEN],
      [GREY, BLUE],
      [BLACK, YELLOW],
      [GREY, PURPLE],
      [[0.2, 0.3, 0.6], PINK],
    ];
    carts.forEach(([shell, tag], i) => {
      s.push(-22 - i * 0.6, 0, -6 + i * 4.4, 1.2 + (rand() - 0.5) * 0.3).tilt(-0.12 - rand() * 0.1, 0);
      cartridge(s, shell, tag);
      s.pop();
    });
    s.pop();
    const local = (lx: number, lz: number): [number, number] => [shelf.x + Math.cos(shelfYaw) * lx + Math.sin(shelfYaw) * lz, shelf.z - Math.sin(shelfYaw) * lx + Math.cos(shelfYaw) * lz];
    const [hx, hz] = local(-30, 26);
    s.push(hx, y, hz, shelfYaw + 0.7).tilt(-0.2, 0);
    handheld(s, [0.78, 0.78, 0.74]);
    s.pop();
    obstacles.add(hx, hz, 8, y - 1, y + 26);
    label('CONSOLES', shelf.x, shelf.z, shelfYaw, 0, 20.5, -1, 2.6, TEAL);
    label('SAVE POINT', hx, hz, shelfYaw + 0.7, 0, 30, 0, 1.8, YELLOW);
    label('MY SISTER DOES, ACTUALLY', shelf.x, shelf.z, shelfYaw, 9, 1.2, 21.5, 0.7, CREAM);
    light.stamp(shelf.x, shelf.z, 16, 16, 0.5);
    obstacles.add(shelf.x - 8, shelf.z + 2, 8, y - 1, y + 19);
    obstacles.add(shelf.x + 8, shelf.z - 6, 8, y - 1, y + 19);

    const lan = at('lan');
    const lanYaw = 0.35;
    s.push(lan.x, y, lan.z, lanYaw);
    for (const [px, pz] of [
      [-17, -12],
      [17, -12],
      [-17, 12],
      [17, 12],
      [0, -12],
      [0, 12],
    ]) {
      s.cylinder(px, 0, pz, 0.4, 0.4, 8, 6, GREY);
    }
    s.gable(0, 8, 0, 38, 4.6, 28, [0.9, 0.3, 0.3], CREAM);
    for (const rowZ of [-8, -2.7, 2.7, 8]) {
      s.box(0, 1.5, rowZ, 28, 0.24, 2.2, WOOD);
      for (const legX of [-13, 0, 13]) s.box(legX, 0.75, rowZ, 0.3, 1.5, 1.8, [0.3, 0.3, 0.33]);
      for (let seat = -12; seat <= 12; seat += 3) {
        s.box(seat, 2.5, rowZ, 1.9, 1.3, 0.14, BLACK);
        s.box(seat, 1.75, rowZ, 0.4, 0.3, 0.4, BLACK);
        s.glow = 2;
        s.box(seat, 2.5, rowZ + 0.09, 1.7, 1.1, 0.06, BRIGHT[Math.floor(rand() * BRIGHT.length)]);
        s.glow = 0;
        s.box(seat + 1.25, 2.25, rowZ - 0.2, 0.7, 1.3, 1.5, rand() < 0.5 ? BLACK : GREY);
        s.glow = 1;
        s.box(seat + 1.25, 2.6, rowZ + 0.56, 0.3, 0.1, 0.04, rand() < 0.5 ? BLUE : GREEN);
        s.glow = 0;
        s.box(seat - 0.3, 1.68, rowZ + 0.7, 1.2, 0.08, 0.4, [0.2, 0.2, 0.22]);
        if (rand() < 0.6) s.cylinder(seat + 0.7, 1.62, rowZ + 0.8, 0.12, 0.12, 0.4, 6, BRIGHT[Math.floor(rand() * BRIGHT.length)]);
        s.box(seat, 0.12, rowZ - 1.4, 0.14, 0.14, 2.2, rand() < 0.5 ? BLUE : YELLOW);
        if (rand() < 0.8) {
          s.push(seat, 0, rowZ + 1.5, Math.PI);
          figure(s, BRIGHT[Math.floor(rand() * BRIGHT.length)], SKIN[Math.floor(rand() * 3)], true);
          s.pop();
          s.box(seat, 0.45, rowZ + 1.62, 0.7, 0.9, 0.7, [0.25, 0.25, 0.3]);
        }
      }
    }
    s.box(-16.4, 2.4, 0, 1.6, 4.8, 3, BLACK);
    s.glow = 1;
    for (let i = 0; i < 12; i++) s.box(-15.56, 0.7 + (i % 6) * 0.7, -1 + (i % 3) + Math.floor(i / 6) * 0.3, 0.1, 0.22, 0.22, i % 2 ? GREEN : YELLOW);
    s.glow = 0;
    s.box(0, 0.12, -11, 32, 0.16, 0.3, BLUE);
    s.box(-16, 0.12, 0, 0.3, 0.16, 22, BLUE);
    s.box(0, 5.4, -12.6, 14, 6.4, 0.3, [0.2, 0.2, 0.24]);
    s.glow = 2;
    s.box(0, 5.4, -12.4, 13, 5.6, 0.1, [0.5, 0.9, 0.7]);
    s.glow = 0;
    s.pop();
    label('TECHNIUM LAN PARTY', lan.x, lan.z, lanYaw, 0, 10.4, 14.2, 2, YELLOW);
    label('TECHNIUM LAN PARTY', lan.x, lan.z, lanYaw, 0, 10.4, -14.2, 2, YELLOW, Math.PI);
    light.stamp(lan.x, lan.z, 20, 10, 0.55);
    obstacles.add(lan.x, lan.z, 17, y + 6, y + 13.5);

    const booth = at('podcast');
    const boothYaw = -0.8;
    s.push(booth.x, y, booth.z, boothYaw);
    s.box(0, 3, -3, 9, 6, 6, [0.24, 0.3, 0.42]);
    s.box(0, 6.3, -3, 10, 0.6, 7, BLACK);
    s.box(0, 3.4, 0.06, 5.4, 2.6, 0.12, [0.2, 0.26, 0.33]);
    s.glow = 1;
    s.box(0, 7.6, -0.2, 5.4, 1.5, 0.4, [0.5, 0.05, 0.08]);
    s.glow = 0;
    s.cylinder(3, 6.6, -4.5, 0.3, 0.1, 15, 5, GREY);
    s.glow = 1;
    s.box(3, 21.8, -4.5, 0.7, 0.7, 0.7, RED);
    s.glow = 0;
    for (const ring of [12, 15, 18]) s.cylinder(3, 6.6 + ring - 6, -4.5, 1.6 - (ring - 12) * 0.15, 1.6 - (ring - 12) * 0.15, 0.16, 8, GREY, false);
    s.box(0, 1.3, 4, 7, 0.24, 2.6, WOOD);
    for (const legX of [-3, 3]) s.box(legX, 0.65, 4, 0.3, 1.3, 2.2, BLACK);
    const hosts: [number, RGB][] = [
      [-2.3, YELLOW],
      [0, TEAL],
      [2.3, PINK],
    ];
    hosts.forEach(([mx, color], i) => {
      s.cylinder(mx, 1.42, 4, 0.08, 0.08, 1.2, 5, GREY);
      s.box(mx, 2.75, 4, 0.36, 0.6, 0.36, BLACK);
      s.box(mx, 0.45, 6.1, 0.9, 0.9, 0.9, [0.25, 0.25, 0.3]);
      s.push(mx, 0.35, 5.9, Math.PI);
      figure(s, color, SKIN[i], true);
      s.box(0, 1.66, 0, 0.46, 0.1, 0.1, BLACK);
      s.box(-0.22, 1.5, 0, 0.1, 0.24, 0.2, BLACK);
      s.box(0.22, 1.5, 0, 0.1, 0.24, 0.2, BLACK);
      s.pop();
    });
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        s.box(-13 + c * 7.4, 3 + r * 5.8, -6, 7, 5.5, 5, [0.3, 0.29, 0.3]);
        s.glow = 2;
        s.box(-13 + c * 7.4, 3 + r * 5.8, -3.44, 5.8, 4.3, 0.1, BRIGHT[(c * 2 + r * 3) % BRIGHT.length]);
        s.glow = 0;
      }
    }
    s.push(12, 0, 6, -0.5).tilt(-0.3, 0);
    s.box(0, 5, 0, 10, 10, 0.8, BLACK);
    s.box(0, 8.4, 0.42, 5.4, 2.8, 0.1, GREY);
    s.box(0, 3, 0.42, 7.6, 4.6, 0.1, CREAM);
    s.box(-3.6, 9.2, 0.42, 0.8, 1, 0.1, BLACK);
    s.pop();
    s.push(21, 0, 0, -0.9).tilt(-0.25, 0);
    s.box(0, 3.8, 0, 12, 7.6, 1, [0.25, 0.25, 0.28]);
    s.box(0, 4.6, 0.52, 9, 3.2, 0.1, CREAM);
    s.box(-2.2, 4.6, 0.6, 1.8, 1.8, 0.1, BLACK);
    s.box(2.2, 4.6, 0.6, 1.8, 1.8, 0.1, BLACK);
    s.box(0, 1.2, 0.52, 8, 1.2, 0.1, [0.35, 0.35, 0.4]);
    s.pop();
    s.pop();
    label('ON AIR', booth.x, booth.z, boothYaw, 0, 7.6, 0.06, 1.1, [1, 0.3, 0.3]);
    label('TÍTULO EN BETA', booth.x, booth.z, boothYaw, 0, 9.6, -0.2, 1.6, YELLOW);
    light.stamp(booth.x, booth.z, 10, 9, 0.5);
    obstacles.add(booth.x, booth.z, 7, y - 1, y + 12);

    const cross = new Sculpt(7);
    cross.jitter = 0;
    cross.glow = 0.7;
    cross.box(0, 0, 0, 3.4, 3.4, 3.4, YELLOW);
    cross.box(0, 0, 0, 5.2, 1.2, 1.2, [1, 1, 1]);
    cross.box(0, 0, 0, 1.2, 5.2, 1.2, [1, 1, 1]);
    cross.box(0, 0, 0, 1.2, 1.2, 5.2, [1, 1, 1]);
    const material = arcadeMaterial();
    const star = new THREE.Mesh(cross.geometry(), material);
    star.frustumCulled = false;
    this.emblem.add(star);
    this.emblem.position.set(ARCADE.x, y + 13, ARCADE.z);
    s.box(ARCADE.x, y + 0.3, ARCADE.z, 30, 0.6, 10, [0.16, 0.16, 0.2]);
    s.box(ARCADE.x, y + 0.3, ARCADE.z, 10, 0.6, 30, [0.16, 0.16, 0.2]);
    s.glow = 1;
    s.box(ARCADE.x, y + 0.66, ARCADE.z, 5, 0.12, 5, PINK);
    for (const [dx, dz] of [
      [11, 0],
      [-11, 0],
      [0, 11],
      [0, -11],
    ]) {
      s.box(ARCADE.x + dx, y + 0.66, ARCADE.z + dz, 2.4, 0.12, 2.4, TEAL);
    }
    s.glow = 0;
    label('PRESS START', ARCADE.x, ARCADE.z, 0.6, 0, 20, 0, 2.2, PINK);
    label('PRESS START', ARCADE.x, ARCADE.z, 0.6 + Math.PI / 2, 0, 20, 0, 2.2, PINK);

    for (const stand of this.stands) {
      const dx = stand.x - ARCADE.x;
      const dz = stand.z - ARCADE.z;
      const far = Math.hypot(dx, dz);
      for (let step2 = 18; step2 < far - 16; step2 += 3.2) {
        const px = Math.round((ARCADE.x + (dx / far) * step2) / 3) * 3;
        const pz = Math.round((ARCADE.z + (dz / far) * step2) / 3) * 3;
        s.box(px, y + 0.08, pz, 2.7, 0.16, 2.7, Math.round(step2 / 3.2) % 2 ? CREAM : [0.98, 0.8, 0.5]);
      }
    }

    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.3;
      const r = ARCADE.radius * 0.76;
      const cx = ARCADE.x + Math.cos(angle) * r;
      const cz = ARCADE.z + Math.sin(angle) * r;
      if (this.stands.some((stand) => Math.hypot(cx - stand.x, cz - stand.z) < 40)) continue;
      for (let level = 0; level < 4; level++) {
        const size = 26 - level * 6;
        s.box(cx, y + level * 3 + 1.5, cz, size, 3, size, level % 2 ? [0.3, 0.72, 0.36] : [0.24, 0.62, 0.32]);
      }
      for (let f = 0; f < 5; f++) s.box(cx + (rand() - 0.5) * 7, y + 12.3, cz + (rand() - 0.5) * 7, 0.8, 0.6, 0.8, BRIGHT[Math.floor(rand() * BRIGHT.length)]);
      light.stamp(cx, cz, 13, 10, 0.45);
      obstacles.add(cx, cz, 11, y - 1, y + 12.5);
    }

    const pondX = ARCADE.x - 20;
    const pondZ = ARCADE.z + 95;
    s.glow = 0.35;
    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -2; iz <= 2; iz++) {
        if (Math.abs(ix) === 3 && Math.abs(iz) === 2) continue;
        s.box(pondX + ix * 3, y + 0.1, pondZ + iz * 3, 2.9, 0.2, 2.9, (ix + iz) % 2 ? [0.2, 0.5, 0.95] : [0.3, 0.62, 1.0]);
      }
    }
    s.glow = 0;
    s.box(pondX + 3, y + 0.3, pondZ, 2, 0.2, 2, GREEN);
    s.box(pondX - 6, y + 0.3, pondZ + 3, 2, 0.2, 2, GREEN);
    s.box(pondX + 3, y + 0.5, pondZ, 0.8, 0.3, 0.8, PINK);

    for (let i = 0; i < 30; i++) {
      const angle = rand() * Math.PI * 2;
      const r = ARCADE.radius * (0.26 + rand() * 0.56);
      const x = ARCADE.x + Math.cos(angle) * r;
      const z = ARCADE.z + Math.sin(angle) * r;
      const size = 0.7 + rand() * 0.8;
      const leaf = [GREEN, TEAL, PINK, [0.45, 0.85, 0.3] as RGB][Math.floor(rand() * 4)];
      if (this.stands.some((stand) => Math.hypot(x - stand.x, z - stand.z) < 38) || Math.hypot(x - pondX, z - pondZ) < 16) continue;
      s.push(x, y, z, Math.floor(rand() * 4) * (Math.PI / 2), size);
      pixelTree(s, leaf);
      s.pop();
      light.stamp(x, z, 4 * size, 9 * size, 0.5);
      obstacles.add(x, z, 2.6 * size, y - 1, y + 11 * size);
    }
    for (let i = 0; i < 40; i++) {
      const angle = rand() * Math.PI * 2;
      const r = ARCADE.radius * (0.2 + rand() * 0.66);
      const bx = Math.round((ARCADE.x + Math.cos(angle) * r) / 3) * 3;
      const bz = Math.round((ARCADE.z + Math.sin(angle) * r) / 3) * 3;
      s.box(bx, y + 0.7, bz, 2.4, 1.4, 2.4, [0.3, 0.75, 0.35]);
      s.box(bx + 0.6, y + 1.6, bz - 0.4, 0.5, 0.5, 0.5, BRIGHT[Math.floor(rand() * BRIGHT.length)]);
    }
    for (let i = 0; i < 18; i++) {
      const angle = rand() * Math.PI * 2;
      const r = ARCADE.radius * (0.2 + rand() * 0.6);
      s.glow = 0.5;
      s.box(ARCADE.x + Math.cos(angle) * r, y + 16 + rand() * 18, ARCADE.z + Math.sin(angle) * r, 2.4, 2.4, 2.4, BRIGHT[Math.floor(rand() * BRIGHT.length)]);
      s.glow = 0;
    }

    const sky = new Sculpt(77);
    sky.jitter = 0;
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + rand();
      const r = ARCADE.radius * (0.3 + rand() * 0.9);
      sky.push(Math.cos(angle) * r, 62 + rand() * 34, Math.sin(angle) * r, rand() * 3, 0.8 + rand() * 0.8);
      pixelCloud(sky);
      sky.pop();
    }
    const cloudMesh = new THREE.Mesh(sky.geometry(), material);
    cloudMesh.frustumCulled = false;
    this.clouds.add(cloudMesh);
    this.clouds.position.set(ARCADE.x, y, ARCADE.z);

    for (let gz = -ARCADE.radius; gz <= ARCADE.radius; gz += 13) {
      for (let gx = -ARCADE.radius; gx <= ARCADE.radius; gx += 13) {
        if (Math.hypot(gx, gz) < ARCADE.radius * 0.84) mask.bare(ARCADE.x + gx, ARCADE.z + gz, 15, 1);
      }
    }
    const mesh = new THREE.Mesh(s.geometry(), material);
    mesh.frustumCulled = false;
    this.group.add(mesh, this.clouds, this.emblem, createSigns(signs, 5));
    this.group.name = 'arcade';
  }
}
