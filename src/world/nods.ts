import * as THREE from 'three/webgpu';
import { arcadeMaterial } from './arcade';
import { BEACH, ISLETS, type HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { Sculpt, type RGB } from './sculpt';
import { createSigns, type Sign } from './signs';
import { CITY } from './zones';

const STONE: RGB = [0.6, 0.58, 0.55];
const STONE_DARK: RGB = [0.42, 0.41, 0.4];
const MOSS: RGB = [0.36, 0.48, 0.26];
const WOOD: RGB = [0.5, 0.36, 0.24];
const WOOD_DARK: RGB = [0.3, 0.21, 0.15];
const IRON: RGB = [0.6, 0.62, 0.66];
const RED: RGB = [0.72, 0.1, 0.08];
const GOLD: RGB = [0.95, 0.75, 0.2];
const SAND: RGB = [0.9, 0.82, 0.62];
const WHITE: RGB = [0.95, 0.95, 0.92];
const BLACK: RGB = [0.08, 0.08, 0.1];

export interface Nod {
  x: number;
  y: number;
  z: number;
  name: string;
}

export class Nods {
  readonly group = new THREE.Group();
  readonly list: Nod[] = [];
  private spots: { key: string; x: number; z: number }[] = [];

  constructor(
    private map: HeightMap,
    free: (x: number, z: number) => boolean,
    wreck: { x: number; z: number } | null,
  ) {
    const land = (key: string, x: number, z: number, low: number, high: number, flat = true) => {
      const spot = map.findLand(x, z, low, high, 200, (px, pz) => free(px, pz) && !this.spots.some((s) => Math.hypot(s.x - px, s.z - pz) < 40));
      if (flat) map.flatten(spot.x, spot.z, 7, 6);
      this.spots.push({ key, x: spot.x, z: spot.z });
    };
    const mid = { x: (BEACH.ax + BEACH.bx) / 2, z: (BEACH.az + BEACH.bz) / 2 };
    const out = Math.hypot(mid.x, mid.z);
    const shore = (t: number, back: number) => ({ x: BEACH.ax + (BEACH.bx - BEACH.ax) * t - (mid.x / out) * back, z: BEACH.az + (BEACH.bz - BEACH.az) * t - (mid.z / out) * back });
    land('sword', -610, -60, 8, 60);
    land('hut', -480, -230, 8, 70);
    land('grass', -330, 60, 6, 50);
    land('camp', -150, -330, 60, 150);
    land('ember', -330, -180, 70, 150);
    land('stones', -1080, -230, 16, 60);
    land('crystal', -120, 232, 5, 40);
    const booth = shore(0.3, -18);
    land('booth', booth.x, booth.z, 1, 6, false);
    const crabs = shore(0.62, -16);
    land('crabs', crabs.x, crabs.z, 1, 6, false);
    const blocks = shore(0.82, 10);
    land('blocks', blocks.x, blocks.z, 3, 14, false);
    this.spots.push({ key: 'islet', x: ISLETS[3][0], z: ISLETS[3][1] });
    if (wreck) this.spots.push({ key: 'verbs', x: wreck.x + 14, z: wreck.z + 10 });
    this.spots.push({ key: 'doors', x: CITY.x - 22, z: CITY.z + 66 });
  }

  blocked(x: number, z: number): boolean {
    return this.spots.some((s) => s.key !== 'doors' && s.key !== 'verbs' && Math.hypot(x - s.x, z - s.z) < 16);
  }

  build(light: LightMap, mask: MaskMap, obstacles: Obstacles, cityGround: number): void {
    const s = new Sculpt(808);
    s.jitter = 0.06;
    const signs: Sign[] = [];
    const at = (key: string) => this.spots.find((spot) => spot.key === key);
    const ground = (x: number, z: number) => Math.max(this.map.sample(x, z), 0);
    const sign = (text: string, x: number, y: number, z: number, yaw: number, height: number, color: RGB) => {
      signs.push({ text, x, y: y + 1.5, z, yaw, height: height * 2, color });
      signs.push({ text, x, y: y + 1.5, z, yaw: yaw + Math.PI, height: height * 2, color });
    };
    const add = (key: string, name: string, lift: number, build: (x: number, y: number, z: number) => void) => {
      const spot = at(key);
      if (!spot) return;
      const y = key === 'doors' ? cityGround : ground(spot.x, spot.z);
      build(spot.x, y, spot.z);
      this.list.push({ x: spot.x, y: y + lift, z: spot.z, name });
    };

    add('sword', 'The sword in the glade', 2, (x, y, z) => {
      s.cylinder(x, y - 0.3, z, 3.2, 2.8, 0.5, 10, STONE_DARK);
      s.box(x, y + 0.5, z, 1.6, 0.7, 1.6, STONE, 0.8);
      s.box(x, y + 0.86, z, 1.2, 0.1, 1.2, MOSS);
      s.box(x, y + 1.55, z, 0.2, 1.5, 0.06, IRON);
      s.box(x, y + 2.34, z, 0.7, 0.1, 0.12, [0.35, 0.3, 0.28]);
      s.box(x, y + 2.62, z, 0.1, 0.46, 0.1, WOOD_DARK);
      s.glow = 0.6;
      s.cylinder(x, y + 0.9, z, 0.3, 1.2, 12, 10, [0.5, 0.47, 0.3], false);
      s.glow = 0;
      for (const [dx, dz] of [
        [2.2, 0.8],
        [-1.9, 1.4],
        [0.6, -2.3],
      ]) {
        s.cylinder(x + dx, y + 0.2, z + dz, 0.1, 0.08, 0.4, 5, WHITE);
        s.cylinder(x + dx, y + 0.6, z + dz, 0.36, 0.02, 0.3, 7, RED);
      }
      sign('TOO HEAVY FOR A BIRD', x, y + 4.2, z, 0.6, 0.6, [1, 0.95, 0.7]);
      mask.cover(x, z, 26);
      obstacles.add(x, z, 1, y, y + 3);
    });

    add('hut', 'Night one shelter', 3, (x, y, z) => {
      const cubes: RGB[] = [
        [0.45, 0.32, 0.2],
        [0.72, 0.58, 0.36],
        [0.5, 0.5, 0.52],
      ];
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = 0; iy < 3; iy++) {
          for (let iz = -1; iz <= 1; iz++) {
            if (ix === 0 && iz === 0) continue;
            if (ix === 0 && iz === 1 && iy < 2) continue;
            s.box(x + ix * 2, y + 1 + iy * 2, z + iz * 2, 2, 2, 2, cubes[(ix + iy * 2 + iz + 6) % 3]);
          }
        }
      }
      s.box(x, y + 7, z, 6, 2, 6, cubes[0]);
      s.box(x + 4.4, y + 1, z + 1, 2, 2, 2, [0.6, 0.45, 0.28]);
      s.box(x + 4.4, y + 2.02, z + 1, 1.6, 0.04, 1.6, WOOD_DARK);
      s.box(x - 4, y + 1, z + 3, 0.2, 2, 0.2, WOOD);
      s.glow = 1;
      s.box(x - 4, y + 2.2, z + 3, 0.4, 0.4, 0.4, [1, 0.75, 0.3]);
      s.glow = 0;
      s.box(x + 2, y - 0.9, z + 6, 2, 2, 2, BLACK);
      sign('NEVER DIG STRAIGHT DOWN', x + 2, y + 2.4, z + 6, 0.2, 0.5, [1, 0.9, 0.6]);
      light.stamp(x, z, 5, 8, 0.5);
      obstacles.add(x, z, 4.4, y - 1, y + 8.2);
    });

    add('grass', 'Something in the tall grass', 2, (x, y, z) => {
      for (let i = 0; i < 46; i++) {
        const a = i * 2.4;
        const r = 1 + (i % 7) * 0.8;
        s.cylinder(x + Math.cos(a) * r, y - 0.1, z + Math.sin(a) * r, 0.34, 0.02, 1.6 + (i % 3) * 0.5, 4, i % 2 ? [0.16, 0.42, 0.2] : [0.22, 0.52, 0.24]);
      }
      s.box(x + 0.8, y + 0.5, z - 0.4, 0.7, 0.6, 1, [0.75, 0.7, 0.62]);
      s.box(x + 0.8, y + 1, z - 0.9, 0.16, 0.6, 0.16, [0.75, 0.7, 0.62]);
      s.box(x + 1.05, y + 1, z - 0.9, 0.16, 0.6, 0.16, [0.75, 0.7, 0.62]);
      sign('!', x + 0.8, y + 3.6, z - 0.6, 0.4, 1.3, [1, 0.25, 0.2]);
      sign('SOMETHING WILD APPEARED', x, y + 5, z, 0.4, 0.5, WHITE);
    });

    add('camp', 'The red banner camp', 4, (x, y, z) => {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        if (i === 3 || i === 4) continue;
        s.cylinder(x + Math.cos(a) * 8, y - 0.5, z + Math.sin(a) * 8, 0.4, 0.05, 4 + (i % 3) * 0.6, 5, WOOD_DARK);
      }
      s.cylinder(x - 2, y, z - 1.5, 3.4, 0.3, 4.4, 9, [0.56, 0.42, 0.3]);
      s.cylinder(x + 3.4, y, z + 2, 1.3, 1.3, 1.4, 10, WOOD);
      s.cylinder(x + 3.4, y + 1.4, z + 2, 1.36, 1.36, 0.12, 10, [0.86, 0.78, 0.6]);
      for (const [dx, dz] of [
        [-6, 3],
        [5.6, -4],
        [0.5, -6.6],
      ]) {
        s.cylinder(x + dx, y, z + dz, 0.14, 0.1, 7, 5, WOOD_DARK);
        s.box(x + dx + 0.9, y + 5.4, z + dz, 1.7, 2.6, 0.08, RED);
        s.triangle([x + dx + 0.05, y + 4.1, z + dz], [x + dx + 1.75, y + 4.1, z + dz], [x + dx + 0.9, y + 3.2, z + dz], RED);
        s.triangle([x + dx + 1.75, y + 4.1, z + dz], [x + dx + 0.05, y + 4.1, z + dz], [x + dx + 0.9, y + 3.2, z + dz], RED);
      }
      for (let k = 0; k < 6; k++) s.box(x + 1 + Math.cos(k) * 0.6, y + 0.15, z + 4.6 + Math.sin(k) * 0.6, 0.3, 0.3, 1.2, WOOD_DARK);
      s.glow = 1;
      s.cylinder(x + 1, y + 0.2, z + 4.6, 0.5, 0.05, 1.3, 6, [1, 0.5, 0.15]);
      s.glow = 0;
      sign('RED SIDE. ALWAYS.', x, y + 8.4, z, 0.9, 0.7, [1, 0.3, 0.25]);
      light.stamp(x, z, 8, 5, 0.45);
      obstacles.add(x - 2, z - 1.5, 3, y, y + 4.4);
    });

    add('ember', 'The kindled ember', 2, (x, y, z) => {
      for (let i = 0; i < 9; i++) s.box(x + Math.cos(i * 0.7) * 1.3, y + 0.15, z + Math.sin(i * 0.7) * 1.3, 0.5, 0.4, 0.5, STONE_DARK);
      s.cylinder(x, y, z, 1, 0.8, 0.2, 9, [0.25, 0.24, 0.24]);
      s.push(x, y, z).tilt(0.3, 0.2);
      s.cylinder(0, 0, 0, 0.05, 0.05, 2.6, 5, WOOD_DARK);
      s.cylinder(0, 2.6, 0, 0.12, 0.01, 0.5, 4, IRON);
      s.pop();
      s.glow = 1;
      s.cylinder(x, y + 0.2, z, 0.5, 0.05, 0.9, 6, [1, 0.45, 0.12]);
      s.glow = 0;
      sign('FEATHER KINDLED', x, y + 4, z, 0.3, 0.7, [1, 0.6, 0.25]);
      sign('TRY WINGS', x + 3, y + 0.7, z + 2, 1.2, 0.34, [1, 0.6, 0.25]);
    });

    add('stones', 'The four elements', 5, (x, y, z) => {
      const tones: RGB[] = [
        [0.95, 0.75, 0.2],
        [0.25, 0.6, 1.0],
        [1.0, 0.3, 0.15],
        [0.7, 0.45, 1.0],
      ];
      tones.forEach((tone, i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const px = x + Math.cos(a) * 5;
        const pz = z + Math.sin(a) * 5;
        s.box(px, y + 2.6, pz, 1.4, 5.6, 1, STONE, 0.7);
        s.glow = 1;
        s.push(px, y + 6.2, pz, i);
        s.cylinder(0, 0, 0, 0.02, 0.5, 0.7, 5, tone, false);
        s.cylinder(0, 0.7, 0, 0.5, 0.02, 0.7, 5, tone, false);
        s.pop();
        s.box(px - Math.cos(a) * 0.52, y + 2.4, pz - Math.sin(a) * 0.52, 0.2, 2.2, 0.2, tone);
        s.glow = 0;
        obstacles.add(px, pz, 0.9, y, y + 5.6);
      });
      s.cylinder(x, y - 0.2, z, 2.4, 2.2, 0.4, 12, STONE_DARK);
      s.glow = 0.7;
      s.cylinder(x, y + 0.2, z, 1.2, 1.2, 0.06, 12, WHITE, false);
      s.glow = 0;
      sign('EARTH · WATER · FIRE · WIND', x, y + 9, z, 1.1, 0.6, GOLD);
      mask.bare(x, z, 9, 0.6);
    });

    add('crystal', 'The save crystal', 3, (x, y, z) => {
      s.cylinder(x, y - 0.2, z, 1.5, 1.2, 0.8, 8, STONE);
      s.glow = 1;
      s.cylinder(x, y + 1.3, z, 0.02, 0.7, 1.1, 6, [0.4, 0.85, 1.0], false);
      s.cylinder(x, y + 2.4, z, 0.7, 0.02, 1.4, 6, [0.55, 0.9, 1.0], false);
      s.glow = 0;
      sign('PROGRESS SAVED', x, y + 5, z, 0.5, 0.5, [0.6, 0.92, 1.0]);
      obstacles.add(x, z, 1, y, y + 3.8);
    });

    add('booth', 'The shore booth', 3, (x, y, z) => {
      s.push(x, y - 0.3, z, 0.5).tilt(0.06, -0.05);
      s.box(0, 1.5, 0, 1.3, 3, 1.3, RED);
      s.box(0, 1.7, 0.66, 1, 2.2, 0.04, [0.6, 0.8, 0.9]);
      s.box(0.66, 1.7, 0, 0.04, 2.2, 1, [0.6, 0.8, 0.9]);
      s.box(0, 3.1, 0, 1.5, 0.24, 1.5, [0.55, 0.08, 0.06]);
      s.pop();
      s.push(x + 2.6, y - 0.2, z + 0.6, 0.2).tilt(-0.05, 0.04);
      s.box(0, 1.3, 0, 1.3, 2.6, 1, [0.28, 0.4, 0.5]);
      s.glow = 1;
      s.box(0, 1.6, 0.52, 1, 1.5, 0.04, [0.75, 0.95, 1.0]);
      s.glow = 0;
      s.box(0, 0.4, 0.52, 0.8, 0.3, 0.06, BLACK);
      s.pop();
      s.glow = 1;
      s.cylinder(x + 2.9, y + 0.05, z + 1.9, 0.12, 0.12, 0.3, 7, [0.4, 1, 0.7]);
      s.glow = 0;
      sign('RING RING', x, y + 4.4, z, 0.5, 0.5, WHITE);
      obstacles.add(x, z, 1, y, y + 3.2);
    });

    add('crabs', 'The crab encounter', 3, (x, y, z) => {
      for (let i = -1; i <= 1; i++) {
        const cx = x + i * 2.4;
        s.box(cx, y + 0.4, z, 1.2, 0.5, 0.9, [0.9, 0.35, 0.2]);
        for (const side of [-1, 1]) {
          s.box(cx + side * 0.8, y + 0.6, z + 0.3, 0.4, 0.3, 0.4, [0.95, 0.45, 0.25]);
          s.box(cx + side * 0.3, y + 0.86, z + 0.3, 0.1, 0.4, 0.1, [0.9, 0.35, 0.2]);
          s.box(cx + side * 0.3, y + 1.1, z + 0.3, 0.16, 0.16, 0.16, BLACK);
          for (const leg of [-0.2, 0.2]) s.box(cx + side * 0.7, y + 0.15, z + leg - 0.1, 0.4, 0.1, 0.1, [0.8, 0.3, 0.18]);
        }
      }
      s.box(x, y + 0.03, z + 2.4, 9, 0.04, 0.2, WHITE);
      sign('PECK   SING   ITEM   FLEE', x, y + 3.4, z + 1, 0, 0.55, WHITE);
      sign('3 CRABS DRAW NEAR', x, y + 4.4, z + 1, 0, 0.45, [1, 0.9, 0.5]);
    });

    add('blocks', 'The bump blocks', 9, (x, y, z) => {
      for (let i = -2; i <= 2; i++) {
        s.box(x + i * 2.1, y + 8, z, 2, 2, 2, i % 2 ? [0.8, 0.45, 0.2] : GOLD);
        if (i % 2 === 0) {
          s.box(x + i * 2.1, y + 8, z + 1.02, 0.5, 0.8, 0.04, [0.5, 0.32, 0.1]);
          s.glow = 1;
          s.cylinder(x + i * 2.1, y + 10.6, z, 0.5, 0.5, 0.16, 10, GOLD);
          s.glow = 0;
        }
      }
      s.cylinder(x + 12, y, z, 0.16, 0.12, 12, 6, WHITE);
      s.cylinder(x + 12, y + 12, z, 0.4, 0.4, 0.4, 8, GOLD);
      s.triangle([x + 12, y + 11.4, z], [x + 12, y + 9.6, z], [x + 14.2, y + 10.5, z], [0.2, 0.7, 0.35]);
      s.triangle([x + 12, y + 9.6, z], [x + 12, y + 11.4, z], [x + 14.2, y + 10.5, z], [0.2, 0.7, 0.35]);
      s.box(x + 12, y + 0.4, z, 1.6, 0.8, 1.6, STONE);
      obstacles.add(x, z, 5.4, y + 7, y + 9);
    });

    add('islet', 'One sky, one sea', 6, (x, y, z) => {
      const top = this.map.sample(x, z);
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const t = i / segs;
        s.push(x + t * t * 6, top + t * 5, z, 0).tilt(0, -0.25 - t * 0.9);
        s.cylinder(0, 0, 0, 0.42 - t * 0.14, 0.4 - t * 0.14, 1.5, 6, [0.5, 0.4, 0.3]);
        s.pop();
      }
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        s.push(x + 6.4, top + 5.6, z, a).tilt(0, -1.1);
        s.cylinder(0, 0, 0, 0.5, 0.02, 3.6, 3, [0.25, 0.55, 0.25]);
        s.pop();
      }
      s.glow = 0.8;
      for (const [dx, dy] of [
        [6, 5],
        [6.7, 5.2],
      ]) {
        s.cylinder(x + dx, top + dy, z + 0.3, 0.02, 0.26, 0.3, 5, GOLD, false);
        s.cylinder(x + dx, top + dy + 0.3, z + 0.3, 0.26, 0.02, 0.3, 5, GOLD, false);
      }
      s.glow = 0;
      for (let i = 0; i < 5; i++) s.cylinder(x - 4 + i * 0.5, top + 0.2, z + 3, 0.24, 0.24, 3.4, 6, WOOD);
      s.cylinder(x - 3, top + 0.4, z + 4.6, 0.08, 0.06, 3.6, 5, WOOD_DARK);
      s.triangle([x - 3, top + 3.9, z + 4.6], [x - 3, top + 1.2, z + 4.6], [x - 0.6, top + 1.4, z + 4.6], SAND);
      s.triangle([x - 3, top + 1.2, z + 4.6], [x - 3, top + 3.9, z + 4.6], [x - 0.6, top + 1.4, z + 4.6], SAND);
      sign('ONE SKY, ONE SEA', x, top + 9.4, z, 0.8, 0.6, [1, 0.9, 0.6]);
    });

    add('verbs', 'The verb board', 8, (x, y, z) => {
      s.cylinder(x, -3, z, 0.2, 0.2, 9, 5, WOOD_DARK);
      s.box(x, 6.4, z, 7.4, 3, 0.2, WOOD);
      sign('LOOK AT   PICK UP   USE   PECK', x, 7, z, 0.6, 0.5, [1, 0.95, 0.75]);
      sign('USE BIRD WITH SHIPWRECK?', x, 6, z, 0.6, 0.44, [0.8, 1, 0.8]);
    });

    add('doors', 'Thinking with feathers', 30, (x, y, z) => {
      s.glow = 1;
      const ring = (px: number, pz: number, yaw: number, tone: RGB) => {
        s.push(px, y + 26, pz, yaw).tilt(Math.PI / 2, 0);
        s.cylinder(0, 0, 0, 5, 5, 0.3, 20, tone, false);
        s.cylinder(0, 0.1, 0, 4.4, 4.4, 0.1, 20, [tone[0] * 0.25, tone[1] * 0.25, tone[2] * 0.25]);
        s.pop();
      };
      ring(x, z, 0, [0.2, 0.6, 1.0]);
      ring(x, z - 132, 0, [1.0, 0.55, 0.1]);
      s.glow = 0;
      sign('THINKING WITH FEATHERS', x, y + 37, z, 0, 0.9, [0.4, 0.75, 1.0]);
    });

    const mesh = new THREE.Mesh(s.geometry(), arcadeMaterial());
    mesh.frustumCulled = false;
    this.group.add(mesh, createSigns(signs));
    this.group.name = 'nods';
  }
}
