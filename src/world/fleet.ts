import * as THREE from 'three/webgpu';
import { float, positionWorld, smoothstep, time, uv } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import { ISLETS, type HeightMap } from './height';
import type { Obstacles } from './obstacles';
import { Sculpt, sculptMaterial, type RGB } from './sculpt';
import { noise, type N } from './shading';
import { cruceiro } from './village';

const WHITE: RGB = [0.93, 0.91, 0.86];
const GLASS: RGB = [0.18, 0.25, 0.33];
const KEEL: RGB = [0.5, 0.13, 0.1];
const WOOD: RGB = [0.46, 0.32, 0.22];
const WOOD_DARK: RGB = [0.27, 0.19, 0.14];
const RUST: RGB = [0.46, 0.24, 0.15];
const RUST_DARK: RGB = [0.28, 0.16, 0.12];

type Row = [number, number, number];

function hull(s: Sculpt, rows: Row[], color: RGB, keel: RGB, deck: RGB, draft: number): void {
  for (let i = 0; i < rows.length - 1; i++) {
    const [z0, w0, t0] = rows[i];
    const [z1, w1, t1] = rows[i + 1];
    const m0 = w0 * 0.82;
    const m1 = w1 * 0.82;
    const b0 = w0 * 0.5;
    const b1 = w1 * 0.5;
    const line = 0.32;
    s.quad([-w0, t0, z0], [-m0, line, z0], [-m1, line, z1], [-w1, t1, z1], color);
    s.quad([w1, t1, z1], [m1, line, z1], [m0, line, z0], [w0, t0, z0], color);
    s.quad([-m0, line, z0], [-b0, -draft, z0], [-b1, -draft, z1], [-m1, line, z1], keel);
    s.quad([m1, line, z1], [b1, -draft, z1], [b0, -draft, z0], [m0, line, z0], keel);
    s.quad([-w0 * 0.92, t0 - 0.3, z0], [-w1 * 0.92, t1 - 0.3, z1], [w1 * 0.92, t1 - 0.3, z1], [w0 * 0.92, t0 - 0.3, z0], deck);
  }
  const [z, w, t] = rows[0];
  s.quad([w, t, z], [w * 0.5, -draft, z], [-w * 0.5, -draft, z], [-w, t, z], color);
}

function trawler(seed: number, color: RGB, trim: RGB): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  hull(
    s,
    [
      [-5.2, 1.5, 1.45],
      [-3.4, 1.9, 1.3],
      [0, 2.05, 1.25],
      [3, 1.7, 1.5],
      [4.9, 0.8, 1.95],
      [5.8, 0.06, 2.2],
    ],
    color,
    KEEL,
    WOOD,
    0.6,
  );
  s.box(0, 2.15, -1.9, 2.5, 1.9, 2.8, WHITE);
  s.box(0, 3.2, -1.9, 2.9, 0.18, 3.2, trim);
  for (const x of [-0.7, 0.7]) s.box(x, 2.45, -0.48, 0.8, 0.6, 0.06, GLASS);
  for (const x of [-1.26, 1.26]) s.box(x, 2.45, -1.9, 0.06, 0.6, 1.6, GLASS);
  s.cylinder(0, 3.2, -2.4, 0.07, 0.05, 2.6, 5, WOOD_DARK);
  s.box(0, 5.3, -2.4, 0.9, 0.06, 0.06, WOOD_DARK);
  s.cylinder(0, 1.1, 1.6, 0.1, 0.07, 4.6, 6, WOOD_DARK);
  s.push(0, 3.0, 1.6).tilt(-0.9, 0);
  s.cylinder(0, 0, 0, 0.06, 0.05, 3.6, 5, WOOD_DARK);
  s.pop();
  s.triangle([0, 5.6, 1.66], [0, 5.1, 1.66], [0, 5.35, 0.9], [0.8, 0.14, 0.12]);
  s.triangle([0, 5.6, 1.66], [0, 5.35, 0.9], [0, 5.1, 1.66], [0.8, 0.14, 0.12]);
  s.box(0, 1.5, -4.3, 2.2, 0.75, 1.2, [0.14, 0.42, 0.34]);
  s.cylinder(0, 1.0, 3.6, 0.5, 0.5, 0.5, 8, RUST_DARK);
  for (const [x, z] of [
    [-1.75, 1.2],
    [-1.8, 0.2],
    [1.75, 0.9],
    [1.8, -0.4],
    [-1.55, -3.6],
  ]) {
    s.box(x, 1.5, z, 0.34, 0.42, 0.34, [0.96, 0.46, 0.1]);
  }
  s.glow = 1;
  s.box(0, 3.42, -1.0, 0.16, 0.16, 0.16, [1, 0.85, 0.5]);
  s.glow = 0;
  return s.geometry();
}

function dorna(seed: number, color: RGB, sail: RGB): THREE.BufferGeometry {
  const s = new Sculpt(seed);
  hull(
    s,
    [
      [-2.9, 0.75, 0.95],
      [-1.6, 1.05, 0.8],
      [0.3, 1.15, 0.78],
      [2.1, 0.85, 0.95],
      [3.1, 0.05, 1.3],
    ],
    color,
    WOOD_DARK,
    WOOD,
    0.35,
  );
  s.box(0, 0.62, -0.9, 1.9, 0.08, 0.3, WOOD);
  s.box(0, 0.62, 0.9, 1.8, 0.08, 0.3, WOOD);
  s.cylinder(0, 0.3, 0.9, 0.07, 0.05, 4.4, 5, WOOD_DARK);
  const top: number[] = [0, 4.5, 1.5];
  const peak: number[] = [0, 3.4, -1.9];
  const tack: number[] = [0, 1.0, 1.7];
  const clew: number[] = [0, 0.95, -2.3];
  s.quad(top, tack, clew, peak, sail);
  s.quad(top, peak, clew, tack, sail);
  s.box(0.25, 0.95, -1.6, 0.4, 0.75, 0.35, [0.2, 0.25, 0.4]);
  s.box(0.25, 1.48, -1.6, 0.26, 0.28, 0.26, [0.85, 0.66, 0.52]);
  return s.geometry();
}

function wreck(): THREE.BufferGeometry {
  const s = new Sculpt(404);
  s.jitter = 0.16;
  hull(
    s,
    [
      [-13, 3.2, 4.6],
      [-8, 3.6, 4.2],
      [0, 3.7, 4.0],
      [5, 3.5, 4.3],
    ],
    RUST,
    RUST_DARK,
    RUST_DARK,
    3,
  );
  s.box(0, 6.2, -9.5, 5.2, 4.2, 4.4, [0.62, 0.56, 0.48]);
  s.box(0, 8.6, -9.5, 5.8, 0.5, 5, RUST);
  s.cylinder(0, 8.8, -11, 0.9, 0.8, 3.4, 8, RUST_DARK);
  s.cylinder(0, 4, -2, 0.22, 0.14, 8, 6, RUST_DARK);
  s.push(0, -0.6, 9, 0.5).tilt(0.28, -0.5);
  hull(
    s,
    [
      [-4, 3.5, 4.3],
      [1, 3.1, 4.5],
      [5, 1.6, 5.2],
      [7.5, 0.1, 5.8],
    ],
    RUST,
    RUST_DARK,
    RUST_DARK,
    3,
  );
  s.pop();
  return s.geometry();
}

function wakeMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const tex: N = uv();
  const along: N = tex.y.oneMinus();
  const side = tex.x.sub(0.5).abs().mul(2);
  const spread = along.mul(0.75).add(0.22);
  const churn = noise(positionWorld.xz.mul(0.16).add(time.mul(0.05))).a;
  const core = smoothstep(spread, spread.mul(0.4), side);
  const edge = smoothstep(0.34, 0.6, churn.add(core.mul(0.35)));
  material.colorNode = float(1).mul(0.92);
  material.opacityNode = core.mul(edge).mul(along.oneMinus().pow(1.4)).mul(smoothstep(0, 0.05, along)).mul(0.7);
  return material;
}

interface Boat {
  mesh: THREE.Object3D;
  curve: THREE.CatmullRomCurve3;
  length: number;
  u: number;
  speed: number;
  phase: number;
  sway: number;
}

const point = new THREE.Vector3();
const tangent = new THREE.Vector3();

export class Fleet {
  readonly group = new THREE.Group();
  private boats: Boat[] = [];

  constructor(map: HeightMap, obstacles: Obstacles, count: number) {
    this.group.name = 'fleet';
    const rand = mulberry32(1492);
    const steps = 96;
    const shore: number[] = [];
    for (let k = 0; k < steps; k++) {
      const angle = (k / steps) * Math.PI * 2;
      let r = 1690;
      while (r > 300 && map.sample(Math.cos(angle) * r, Math.sin(angle) * r) < -6) r -= 8;
      shore.push(r);
    }
    const smooth = shore.map((_, k) => {
      let reach = 0;
      let sum = 0;
      for (let o = -3; o <= 3; o++) {
        const r = shore[(k + o + steps) % steps];
        reach = Math.max(reach, r);
        sum += r;
      }
      return reach * 0.6 + (sum / 7) * 0.4;
    });
    const route = (offset: number) =>
      new THREE.CatmullRomCurve3(
        smooth.map((r, k) => {
          const angle = (k / steps) * Math.PI * 2;
          const reach = Math.min(r + offset, 1700);
          return new THREE.Vector3(Math.cos(angle) * reach, 0, Math.sin(angle) * reach);
        }),
        true,
      );

    const material = sculptMaterial(true);
    const wake = wakeMaterial();
    const hulls: [RGB, RGB][] = [
      [[0.74, 0.16, 0.13], [0.2, 0.3, 0.5]],
      [[0.14, 0.36, 0.6], [0.93, 0.78, 0.2]],
      [[0.12, 0.45, 0.33], [0.85, 0.2, 0.15]],
      [[0.92, 0.9, 0.84], [0.1, 0.35, 0.55]],
      [[0.93, 0.72, 0.16], [0.12, 0.12, 0.14]],
    ];
    const sails: RGB[] = [
      [0.62, 0.25, 0.18],
      [0.86, 0.78, 0.58],
      [0.7, 0.46, 0.2],
    ];
    for (let i = 0; i < count; i++) {
      const big = i % 5 < 3;
      const [color, trim] = hulls[i % hulls.length];
      const geometry = big ? trawler(200 + i, color, trim) : dorna(300 + i, color, sails[i % sails.length]);
      const boat = new THREE.Group();
      boat.add(new THREE.Mesh(geometry, material));
      const trail = new THREE.PlaneGeometry(big ? 9 : 4.5, big ? 34 : 15);
      trail.rotateX(-Math.PI / 2);
      trail.translate(0, 0.1, -(big ? 20 : 9.5));
      const foam = new THREE.Mesh(trail, wake);
      foam.renderOrder = 11;
      boat.add(foam);
      const curve = route(big ? 130 + rand() * 170 : 45 + rand() * 60);
      this.boats.push({
        mesh: boat,
        curve,
        length: curve.getLength(),
        u: rand(),
        speed: (big ? 4.2 + rand() * 2.4 : 1.8 + rand() * 1.2) * (i % 2 ? -1 : 1),
        phase: rand() * 10,
        sway: big ? 0.05 : 0.11,
      });
      this.group.add(boat);
    }
    this.update(0, 0);

    let best: { x: number; z: number; score: number } | null = null;
    const [ix, iz] = ISLETS[0];
    for (let z = iz - 260; z < iz + 260; z += 7) {
      for (let x = ix - 260; x < ix + 260; x += 7) {
        const h = map.sample(x, z);
        if (h > -1 || h < -7) continue;
        let open = true;
        for (let a = 0; a < 8; a++) {
          if (map.sample(x + Math.cos(a * 0.785) * 13, z + Math.sin(a * 0.785) * 13) > -0.3) open = false;
        }
        if (!open) continue;
        const score = Math.hypot(x - (ix - 95), z - (iz + 130));
        if (!best || score < best.score) best = { x, z, score };
      }
    }
    if (best) {
      const hulk = new THREE.Mesh(wreck(), material);
      hulk.position.set(best.x, Math.max(map.sample(best.x, best.z), -4.5) + 1.2, best.z);
      hulk.name = 'wreck';
      hulk.scale.setScalar(1.6);
      hulk.rotation.set(0.1, 2.2, 0.38, 'YXZ');
      this.group.add(hulk);
      obstacles.add(best.x, best.z, 9, -3, 9);
    }

    const cross = cruceiro();
    for (const [ax, az] of [
      [-1010, 75],
      [-640, -900],
      [-960, -520],
      [-250, -1010],
    ]) {
      let spot: { x: number; z: number; score: number } | null = null;
      for (let z = az - 140; z <= az + 140; z += 9) {
        for (let x = ax - 140; x <= ax + 140; x += 9) {
          const h = map.sample(x, z);
          if (h < 16 || h > 70 || map.slope(x, z) > 0.1) continue;
          let sea = false;
          for (let a = 0; a < 8; a++) {
            if (map.sample(x + Math.cos(a * 0.785) * 34, z + Math.sin(a * 0.785) * 34) < -1) sea = true;
          }
          if (!sea) continue;
          const score = Math.hypot(x - ax, z - az);
          if (!spot || score < spot.score) spot = { x, z, score };
        }
      }
      if (!spot) continue;
      const mesh = new THREE.Mesh(cross, material);
      mesh.position.set(spot.x, map.sample(spot.x, spot.z) - 0.1, spot.z);
      mesh.rotation.y = rand() * 3;
      this.group.add(mesh);
      obstacles.add(spot.x, spot.z, 1.2, mesh.position.y, mesh.position.y + 6.2);
    }
  }

  update(dt: number, now: number): void {
    for (const boat of this.boats) {
      boat.u = (boat.u + (boat.speed * dt) / boat.length + 1) % 1;
      boat.curve.getPointAt(boat.u, point);
      boat.curve.getTangentAt(boat.u, tangent);
      const direction = boat.speed < 0 ? -1 : 1;
      const t = now * 0.001 + boat.phase;
      boat.mesh.position.set(point.x, Math.sin(t * 1.1) * 0.14, point.z);
      boat.mesh.rotation.set(Math.sin(t * 0.9) * boat.sway * 0.6, Math.atan2(tangent.x * direction, tangent.z * direction), Math.sin(t * 1.3 + 1) * boat.sway, 'YXZ');
    }
  }
}
