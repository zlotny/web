import * as THREE from 'three/webgpu';
import { mulberry32 } from '../core/noise';
import type { HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { createBeam } from './scatter';
import { Sculpt, sculptMaterial, type RGB } from './sculpt';

const GRANITE: RGB = [0.62, 0.6, 0.57];
const GRANITE_DARK: RGB = [0.46, 0.45, 0.44];
const MOSS: RGB = [0.45, 0.5, 0.3];
const TILE: RGB = [0.78, 0.42, 0.27];
const TILE_OLD: RGB = [0.66, 0.4, 0.3];
const WOOD: RGB = [0.46, 0.32, 0.22];
const WOOD_DARK: RGB = [0.27, 0.19, 0.14];
const LIME: RGB = [0.93, 0.91, 0.85];
const GLASS: RGB = [0.2, 0.26, 0.33];
const WARM: RGB = [1.0, 0.78, 0.42];

export const SITES = {
  village: { x: -170, z: 250 },
  harbor: { x: -292, z: 128 },
  lighthouse: { x: -940, z: 8 },
  chapel: { x: -62, z: 196 },
};

function horreo(seed: number): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  const length = 5.4;
  const width = 1.5;
  for (const x of [-0.52, 0.52]) {
    for (const z of [-2.1, 0, 2.1]) {
      s.box(x, 0.6, z, 0.34, 1.2, 0.34, GRANITE, 0.8);
      s.cylinder(x, 1.2, z, 0.5, 0.46, 0.13, 7, GRANITE_DARK);
    }
    s.box(x, 1.44, 0, 0.24, 0.22, length, GRANITE);
  }
  s.box(0, 1.58, 0, width, 0.1, length, GRANITE_DARK);
  s.box(0, 2.45, 0, width - 0.16, 1.66, length - 0.16, WOOD_DARK);
  const slats = 15;
  for (let i = 0; i < slats; i++) {
    const z = -length / 2 + 0.25 + (i / (slats - 1)) * (length - 0.5);
    for (const x of [-width / 2, width / 2]) s.box(x, 2.45, z, 0.07, 1.66, 0.2, WOOD);
  }
  for (const z of [-length / 2, length / 2]) {
    for (const x of [-width / 2, width / 2]) s.box(x, 2.45, z, 0.22, 1.7, 0.22, GRANITE);
    s.box(0, 2.45, z, width - 0.3, 1.66, 0.08, WOOD);
  }
  s.gable(0, 3.28, 0, width + 0.6, 0.78, length + 0.5, TILE, GRANITE);
  s.box(0, 4.3, length / 2 + 0.12, 0.09, 0.56, 0.09, GRANITE);
  s.box(0, 4.42, length / 2 + 0.12, 0.34, 0.09, 0.09, GRANITE);
  s.cylinder(0, 4.02, -length / 2 - 0.12, 0.13, 0, 0.5, 5, GRANITE);
  return s.geometry();
}

function house(seed: number, floors: number, width: number, depth: number, gallery: boolean): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  const rand = mulberry32(seed * 31);
  const wallHeight = floors * 2.7 + 0.4;
  const stone: RGB = rand() > 0.5 ? GRANITE : [0.68, 0.64, 0.58];
  s.box(0, wallHeight / 2 - 0.3, 0, width, wallHeight + 0.6, depth, stone);
  s.box(0, 0.05, 0, width + 0.25, 0.7, depth + 0.25, GRANITE_DARK);
  s.gable(0, wallHeight, 0, width + 0.9, width * 0.3, depth + 0.8, rand() > 0.4 ? TILE : TILE_OLD, stone);
  s.box(width * 0.24, wallHeight + width * 0.24, -depth * 0.22, 0.75, 1.5, 0.75, GRANITE_DARK);
  s.box(width * 0.24, wallHeight + width * 0.24 + 0.8, -depth * 0.22, 0.95, 0.14, 0.95, GRANITE);

  s.box(width / 2 + 0.03, 1.0, depth * 0.12, 0.14, 2.0, 1.1, WOOD_DARK);
  s.box(width / 2 + 0.05, 2.1, depth * 0.12, 0.2, 0.24, 1.5, GRANITE);
  for (let floor = 0; floor < floors; floor++) {
    const y = 1.5 + floor * 2.7;
    const lit = rand() > 0.55;
    for (const z of [-depth * 0.28, depth * 0.36]) {
      if (floor === 0 && z > 0) continue;
      if (gallery && floor === floors - 1) continue;
      s.box(width / 2 + 0.02, y, z, 0.12, 1.1, 0.84, LIME);
      s.glow = lit ? 1 : 0;
      s.box(width / 2 + 0.06, y, z, 0.1, 0.9, 0.64, lit ? WARM : GLASS);
      s.glow = 0;
    }
    for (const z of [-depth * 0.2, depth * 0.25]) {
      s.box(-width / 2 - 0.02, y, z, 0.12, 0.9, 0.7, LIME);
      s.box(-width / 2 - 0.06, y, z, 0.1, 0.72, 0.5, GLASS);
    }
  }
  if (gallery) {
    const y = (floors - 1) * 2.7 + 1.55;
    s.box(width / 2 + 0.55, y - 1.05, 0, 1.1, 0.16, depth * 0.86, GRANITE);
    s.box(width / 2 + 0.6, y, 0, 0.95, 1.9, depth * 0.84, LIME);
    const panes = 6;
    for (let i = 0; i < panes; i++) {
      const z = -depth * 0.36 + (i / (panes - 1)) * depth * 0.72;
      s.glow = i % 3 === 1 ? 1 : 0;
      s.box(width / 2 + 1.09, y + 0.1, z, 0.04, 1.3, (depth * 0.72) / panes - 0.14, s.glow ? WARM : GLASS);
      s.glow = 0;
    }
    s.box(width / 2 + 0.6, y + 1.02, 0, 1.15, 0.14, depth * 0.9, TILE_OLD);
  }
  s.box(-width / 2 - 0.5, 0.25, depth * 0.3, 1.0, 0.5, 1.6, GRANITE_DARK);
  return s.geometry();
}

function wallSegment(seed: number): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  s.jitter = 0.16;
  const rand = mulberry32(seed);
  let x = -2;
  while (x < 2) {
    const w = 0.5 + rand() * 0.6;
    const h = 0.62 + rand() * 0.45;
    const color: RGB = rand() > 0.82 ? MOSS : rand() > 0.5 ? GRANITE : GRANITE_DARK;
    s.push(x + w / 2, h / 2 - 0.15, (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.3)
      .box(0, 0, 0, w + 0.06, h + 0.3, 0.42 + rand() * 0.14, color, 0.82)
      .pop();
    x += w;
  }
  return s.geometry();
}

export function cruceiro(): THREE.BufferGeometry {
  const s = new Sculpt(77);
  s.box(0, 0.15, 0, 2.4, 0.3, 2.4, GRANITE_DARK);
  s.box(0, 0.45, 0, 1.8, 0.3, 1.8, GRANITE);
  s.box(0, 0.75, 0, 1.2, 0.3, 1.2, GRANITE_DARK);
  s.box(0, 1.15, 0, 0.6, 0.5, 0.6, GRANITE, 0.75);
  s.cylinder(0, 1.4, 0, 0.17, 0.13, 3.3, 8, GRANITE);
  s.cylinder(0, 4.7, 0, 0.14, 0.3, 0.3, 8, GRANITE_DARK);
  s.box(0, 5.5, 0, 0.16, 1.0, 0.16, GRANITE);
  s.box(0, 5.62, 0, 0.72, 0.16, 0.16, GRANITE);
  return s.geometry();
}

function chapel(): THREE.BufferGeometry {
  const s = new Sculpt(404);
  s.box(0, 2.0, 0, 5.4, 4.6, 9, GRANITE);
  s.gable(0, 4.3, 0, 6.2, 1.9, 9.6, TILE_OLD, GRANITE);
  s.box(0, 3.6, 4.6, 5.8, 7.6, 0.7, [0.66, 0.63, 0.6]);
  s.box(0, 8.0, 4.6, 2.6, 1.6, 0.7, GRANITE);
  s.box(-0.85, 8.1, 4.6, 0.5, 1.2, 0.74, GRANITE_DARK);
  s.box(0.85, 8.1, 4.6, 0.5, 1.2, 0.74, GRANITE_DARK);
  s.gable(0, 8.8, 4.6, 3.0, 0.9, 0.9, GRANITE_DARK, GRANITE);
  s.box(0, 10.1, 4.6, 0.14, 0.9, 0.14, GRANITE_DARK);
  s.box(0, 10.25, 4.6, 0.6, 0.14, 0.14, GRANITE_DARK);
  s.cylinder(0, 7.5, 4.6, 0.26, 0.2, 0.5, 6, [0.5, 0.42, 0.2]);
  s.box(0, 1.25, 5.0, 1.5, 2.5, 0.16, WOOD_DARK);
  s.box(0, 2.7, 5.0, 1.9, 0.3, 0.2, GRANITE_DARK);
  s.glow = 1;
  s.cylinder(0, 4.6, 4.98, 0.5, 0.5, 0.06, 10, WARM);
  s.glow = 0;
  for (const z of [-2.4, 1.2]) {
    for (const x of [-2.72, 2.72]) s.box(x, 2.6, z, 0.1, 1.4, 0.6, GLASS);
  }
  return s.geometry();
}

function lighthouse(): THREE.BufferGeometry {
  const s = new Sculpt(909);
  s.box(0, 1.6, -5.5, 9, 4.2, 6, LIME);
  s.gable(0, 3.7, -5.5, 9.8, 1.7, 6.8, TILE, LIME);
  s.box(4.52, 1.1, -5.2, 0.12, 2.1, 1.1, [0.2, 0.36, 0.3]);
  for (const x of [-2.6, 0, 2.6]) {
    s.box(x, 2.0, -2.46, 0.9, 1.1, 0.1, GLASS);
  }
  s.cylinder(0, -0.5, 0, 3.4, 3.0, 1.5, 12, GRANITE_DARK);
  s.cylinder(0, 1.0, 0, 2.5, 1.9, 17, 14, LIME, false);
  s.cylinder(0, 6.4, 0, 2.34, 2.2, 1.6, 14, [0.72, 0.18, 0.14], false);
  s.cylinder(0, 12.4, 0, 2.06, 1.98, 1.5, 14, [0.72, 0.18, 0.14], false);
  s.cylinder(0, 18, 0, 2.7, 2.7, 0.3, 14, GRANITE_DARK);
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2;
    s.box(Math.cos(angle) * 2.6, 18.8, Math.sin(angle) * 2.6, 0.07, 1.0, 0.07, WOOD_DARK);
  }
  s.cylinder(0, 19.25, 0, 2.62, 2.62, 0.07, 14, WOOD_DARK, false);
  s.glow = 1;
  s.cylinder(0, 18.3, 0, 1.4, 1.4, 2.4, 10, WARM, false);
  s.glow = 0;
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    s.box(Math.cos(angle) * 1.42, 19.5, Math.sin(angle) * 1.42, 0.09, 2.4, 0.09, WOOD_DARK);
  }
  s.cylinder(0, 20.7, 0, 1.7, 1.6, 0.25, 10, [0.2, 0.4, 0.36]);
  s.dome(0, 20.95, 0, 1.6, 1.3, 10, [0.24, 0.46, 0.4]);
  s.cylinder(0, 22.2, 0, 0.08, 0.02, 1.2, 5, GRANITE_DARK);
  const geometry = s.geometry();
  geometry.scale(1.45, 1.45, 1.45);
  geometry.computeBoundingSphere();
  return geometry;
}

function boat(seed: number, hull: RGB): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  const rows: [number, number][] = [
    [-2.4, 0.1],
    [-1.6, 0.75],
    [0, 1.0],
    [1.5, 0.85],
    [2.3, 0.55],
  ];
  for (let i = 0; i < rows.length - 1; i++) {
    const [z0, w0] = rows[i];
    const [z1, w1] = rows[i + 1];
    s.quad([-w0, 0.55, z0], [-w0 * 0.5, -0.25, z0], [-w1 * 0.5, -0.25, z1], [-w1, 0.55, z1], hull);
    s.quad([w1, 0.55, z1], [w1 * 0.5, -0.25, z1], [w0 * 0.5, -0.25, z0], [w0, 0.55, z0], hull);
    s.quad([-w0 * 0.5, -0.25, z0], [w0 * 0.5, -0.25, z0], [w1 * 0.5, -0.25, z1], [-w1 * 0.5, -0.25, z1], WOOD_DARK);
    s.quad([-w0 * 0.8, 0.12, z0], [-w1 * 0.8, 0.12, z1], [w1 * 0.8, 0.12, z1], [w0 * 0.8, 0.12, z0], WOOD);
  }
  s.quad([-0.55, 0.55, 2.3], [-0.28, -0.25, 2.3], [0.28, -0.25, 2.3], [0.55, 0.55, 2.3], hull);
  s.box(0, 0.42, 0.2, 1.7, 0.08, 0.3, WOOD);
  s.box(0, 0.42, -1.1, 1.3, 0.08, 0.3, WOOD);
  s.cylinder(0, 0.1, -0.5, 0.06, 0.04, 3.4, 5, WOOD_DARK);
  s.triangle([0, 3.3, -0.44], [0, 0.9, -0.44], [0, 1.0, 1.7], LIME);
  s.triangle([0, 3.3, -0.44], [0, 1.0, 1.7], [0, 0.9, -0.44], LIME);
  return s.geometry();
}

function pier(): THREE.BufferGeometry {
  const s = new Sculpt(55);
  for (let i = 0; i < 9; i++) {
    s.box(0, 0.9, i * 2.2, 2.6, 0.16, 2.1, i % 2 ? WOOD : [0.5, 0.36, 0.25]);
    for (const x of [-1.2, 1.2]) s.cylinder(x, -2.5, i * 2.2, 0.16, 0.14, 3.8, 6, WOOD_DARK);
  }
  return s.geometry();
}

interface Placement {
  x: number;
  z: number;
  yaw: number;
  kind: number;
}

export class Village {
  readonly group = new THREE.Group();
  readonly paths: [number, number][][] = [];
  readonly beacon = new THREE.Group();
  readonly houses: Placement[] = [];
  private granaries: Placement[] = [];
  private walls: { x: number; z: number; yaw: number }[] = [];
  private clearings: { x: number; z: number; r: number }[] = [];
  private fields: { x: number; z: number; w: number; d: number; yaw: number; crop: number }[] = [];

  constructor(private map: HeightMap) {
    const rand = mulberry32(2026);
    const { village, harbor, chapel: chapelSite, lighthouse: lighthouseSite } = SITES;

    const street: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      street.push([
        harbor.x + (chapelSite.x - harbor.x) * t + Math.sin(t * Math.PI) * -30 + Math.sin(t * 9) * 8,
        harbor.z + (chapelSite.z - harbor.z) * t + Math.sin(t * Math.PI) * 95 + Math.cos(t * 7) * 6,
      ]);
    }
    this.paths.push(street);
    this.paths.push([
      [village.x, village.z + 8],
      [village.x - 40, village.z + 60],
      [village.x - 60, village.z + 130],
      [village.x - 30, village.z + 200],
    ]);
    this.paths.push([
      [chapelSite.x, chapelSite.z],
      [chapelSite.x + 22, chapelSite.z + 134],
      [chapelSite.x + 62, chapelSite.z + 254],
      [chapelSite.x + 182, chapelSite.z + 324],
      [chapelSite.x + 362, chapelSite.z + 314],
    ]);

    for (let i = 3; i < street.length - 2; i++) {
      const [x, z] = street[i];
      const [nx, nz] = street[i + 1];
      const dir = Math.atan2(nx - x, nz - z);
      for (const side of [-1, 1]) {
        if (rand() < 0.22) continue;
        const off = 9.5 + rand() * 5;
        const hx = x + Math.cos(dir) * off * side + (rand() - 0.5) * 4;
        const hz = z - Math.sin(dir) * off * side + (rand() - 0.5) * 4;
        const yaw = dir + (side > 0 ? Math.PI : 0) + (rand() - 0.5) * 0.3;
        this.houses.push({ x: hx, z: hz, yaw, kind: Math.floor(rand() * 4) });
        if (rand() < 0.62) {
          const gx = hx + Math.cos(dir) * (9 + rand() * 4) * side + (rand() - 0.5) * 6;
          const gz = hz - Math.sin(dir) * (9 + rand() * 4) * side + (rand() - 0.5) * 6;
          this.granaries.push({ x: gx, z: gz, yaw: dir + (rand() - 0.5) * 0.8, kind: Math.floor(rand() * 2) });
        }
      }
    }

    for (const h of this.houses) {
      map.flatten(h.x, h.z, 6.5, 7);
      this.clearings.push({ x: h.x, z: h.z, r: 14 });
    }
    for (const g of this.granaries) {
      map.flatten(g.x, g.z, 3.2, 4);
      this.clearings.push({ x: g.x, z: g.z, r: 8 });
    }
    map.flatten(chapelSite.x, chapelSite.z, 9, 12, map.sample(chapelSite.x, chapelSite.z) + 1.5);
    this.clearings.push({ x: chapelSite.x, z: chapelSite.z, r: 26 });
    map.flatten(lighthouseSite.x, lighthouseSite.z, 13, 16, Math.max(map.sample(lighthouseSite.x, lighthouseSite.z), 9));
    this.clearings.push({ x: lighthouseSite.x, z: lighthouseSite.z, r: 40 });
    this.clearings.push({ x: harbor.x, z: harbor.z, r: 24 });

    const inside = (f: { x: number; z: number; w: number; d: number; yaw: number }, px: number, pz: number, margin: number) => {
      const dx = px - f.x;
      const dz = pz - f.z;
      const lx = dx * Math.cos(f.yaw) - dz * Math.sin(f.yaw);
      const lz = dx * Math.sin(f.yaw) + dz * Math.cos(f.yaw);
      return Math.abs(lx) < f.w / 2 + margin && Math.abs(lz) < f.d / 2 + margin;
    };
    const outline = (f: { x: number; z: number; w: number; d: number; yaw: number }): [number, number][] => {
      const points: [number, number][] = [];
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          const lx = (a / 4) * f.w;
          const lz = (b / 4) * f.d;
          points.push([f.x + Math.cos(f.yaw) * lx + Math.sin(f.yaw) * lz, f.z - Math.sin(f.yaw) * lx + Math.cos(f.yaw) * lz]);
        }
      }
      return points;
    };
    for (let attempt = 0; attempt < 140 && this.fields.length < 24; attempt++) {
      const angle = rand() * Math.PI * 2;
      const distance = 55 + rand() * 170;
      const cx = village.x + 60 + Math.cos(angle) * distance;
      const cz = village.z - 10 + Math.sin(angle) * distance * 0.8;
      const ground = map.sample(cx, cz);
      const w = 20 + rand() * 26;
      const d = 16 + rand() * 22;
      const yaw = rand() * Math.PI;
      if (ground < 5 || ground > 60 || map.slope(cx, cz) > 0.12) continue;
      const candidate = { x: cx, z: cz, w, d, yaw };
      const points = outline(candidate);
      if (points.some(([px, pz]) => this.blocked(px, pz, 1.25) || map.sample(px, pz) < 3)) continue;
      if (this.fields.some((f) => points.some(([px, pz]) => inside(f, px, pz, 3.5)) || outline(f).some(([px, pz]) => inside(candidate, px, pz, 3.5)))) continue;
      this.fields.push({ ...candidate, crop: [85, 170, 255][Math.floor(rand() * 3)] });
      const corners: [number, number][] = [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
      ];
      for (let e = 0; e < 4; e++) {
        if (rand() < 0.14) continue;
        const [ax, az] = corners[e];
        const [bx, bz] = corners[(e + 1) % 4];
        const len = Math.hypot(bx - ax, bz - az);
        const count = Math.floor(len / 3.9);
        for (let i = 0; i < count; i++) {
          if (rand() < 0.06) continue;
          const t = (i + 0.5) / count;
          const lx = ax + (bx - ax) * t;
          const lz = az + (bz - az) * t;
          const wx = cx + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
          const wz = cz - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
          if (this.blocked(wx, wz, 0.4)) continue;
          this.walls.push({ x: wx, z: wz, yaw: yaw + Math.atan2(-(bz - az), bx - ax) });
        }
      }
    }
  }

  blocked(x: number, z: number, scale = 1): boolean {
    for (const c of this.clearings) {
      if (Math.hypot(x - c.x, z - c.z) < c.r * scale) return true;
    }
    for (const path of this.paths) {
      for (let i = 0; i < path.length - 1; i++) {
        if (distanceToSegment(x, z, path[i], path[i + 1]) < 5 * scale) return true;
      }
    }
    return false;
  }

  build(light: LightMap, mask: MaskMap, obstacles: Obstacles): void {
    const map = this.map;
    const material = sculptMaterial();
    const dummy = new THREE.Object3D();

    const instanced = (geometry: THREE.BufferGeometry, items: { x: number; z: number; yaw: number; y?: number; rx?: number }[]) => {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach((item, i) => {
        dummy.position.set(item.x, item.y ?? map.sample(item.x, item.z), item.z);
        dummy.rotation.set(item.rx ?? 0, item.yaw, 0, 'YXZ');
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    };

    const variants = [house(1, 1, 6.2, 8.4, false), house(2, 2, 6.6, 8, true), house(3, 2, 5.8, 9.4, false), house(4, 1, 5.4, 7, false)];
    variants.forEach((geometry, kind) => instanced(geometry, this.houses.filter((h) => h.kind === kind)));
    [horreo(11), horreo(12)].forEach((geometry, kind) => instanced(geometry, this.granaries.filter((g) => g.kind === kind)));
    for (const h of this.houses) {
      light.stamp(h.x, h.z, 5.5, 7, 0.6);
      light.occlude(h.x, h.z, 9, 0.35);
    }
    for (const g of this.granaries) light.stamp(g.x, g.z, 3, 4.5, 0.5);
    for (const h of this.houses) {
      const ground = map.sample(h.x, h.z);
      obstacles.add(h.x, h.z, 5, ground - 2, ground + 7.5);
    }
    for (const g of this.granaries) {
      const ground = map.sample(g.x, g.z);
      for (const along of [-1.6, 1.6]) obstacles.add(g.x + Math.sin(g.yaw) * along, g.z + Math.cos(g.yaw) * along, 1.5, ground - 1, ground + 4.6);
    }
    for (const h of this.houses) mask.bare(h.x, h.z, 10, 0.8);
    for (const g of this.granaries) mask.bare(g.x, g.z, 5, 0.7);

    [wallSegment(21), wallSegment(22), wallSegment(23)].forEach((geometry, kind) =>
      instanced(
        geometry,
        this.walls
          .filter((_, i) => i % 3 === kind)
          .map((w) => {
            const dx = Math.cos(w.yaw) * 2;
            const dz = -Math.sin(w.yaw) * 2;
            const rise = map.sample(w.x + dx, w.z + dz) - map.sample(w.x - dx, w.z - dz);
            return { ...w, rx: 0, y: map.sample(w.x, w.z) + Math.abs(rise) * -0.2 };
          }),
      ),
    );

    const { chapel: chapelSite, lighthouse: lighthouseSite, harbor } = SITES;
    instanced(chapel(), [{ x: chapelSite.x, z: chapelSite.z, yaw: -2.2 }]);
    light.stamp(chapelSite.x, chapelSite.z, 6, 10, 0.6);
    const chapelGround = map.sample(chapelSite.x, chapelSite.z);
    obstacles.add(chapelSite.x, chapelSite.z, 6, chapelGround - 2, chapelGround + 11);
    instanced(cruceiro(), [{ x: chapelSite.x - 13, z: chapelSite.z + 12, yaw: 0.4 }]);
    instanced(lighthouse(), [{ x: lighthouseSite.x, z: lighthouseSite.z, yaw: 1.2 }]);
    light.stamp(lighthouseSite.x, lighthouseSite.z, 5, 30, 0.55);
    const lampGround = map.sample(lighthouseSite.x, lighthouseSite.z);
    obstacles.add(lighthouseSite.x, lighthouseSite.z, 4.6, lampGround - 2, lampGround + 34);

    const shoreYaw = Math.atan2(-harbor.x - 300, 60 - harbor.z);
    let px = harbor.x;
    let pz = harbor.z;
    for (let i = 0; i < 40 && map.sample(px, pz) > 0.6; i++) {
      px += Math.sin(shoreYaw) * 1.5;
      pz += Math.cos(shoreYaw) * 1.5;
    }
    instanced(pier(), [{ x: px - Math.sin(shoreYaw) * 3, z: pz - Math.cos(shoreYaw) * 3, yaw: shoreYaw, y: 0 }]);
    const hulls: RGB[] = [
      [0.2, 0.42, 0.6],
      [0.76, 0.24, 0.2],
      [0.93, 0.9, 0.82],
      [0.2, 0.5, 0.38],
    ];
    const rand = mulberry32(8);
    hulls.forEach((hull, i) => {
      const along = 9 + i * 6 + rand() * 3;
      const side = (i % 2 ? 1 : -1) * (4 + rand() * 5);
      instanced(boat(60 + i, hull), [
        {
          x: px + Math.sin(shoreYaw) * along + Math.cos(shoreYaw) * side,
          z: pz + Math.cos(shoreYaw) * along - Math.sin(shoreYaw) * side,
          yaw: shoreYaw + (rand() - 0.5) * 1.6,
          y: 0.08,
        },
      ]);
    });
    this.paths[0].unshift([px, pz]);
    for (const f of this.fields) mask.field(f.x, f.z, f.w, f.d, f.yaw, f.crop);
    for (const path of this.paths) mask.path(path, 4.2);
    mask.bare(chapelSite.x, chapelSite.z, 15, 0.9);
    mask.bare(lighthouseSite.x, lighthouseSite.z, 18, 0.8);

    const lamp = lighthouseSite;
    this.beacon.position.set(lamp.x, map.sample(lamp.x, lamp.z) + 19.5 * 1.45, lamp.z);
    this.beacon.add(createBeam());
    this.group.add(this.beacon);
    this.group.name = 'village';
  }
}

export function distanceToSegment(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
