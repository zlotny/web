import * as THREE from 'three/webgpu';
import { attribute, float, normalWorld, positionWorld, time, sin } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import { applyFog, brush, paint, type N } from './shading';

export type RGB = [number, number, number];

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const d = new THREE.Vector3();
const n = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();

export class Sculpt {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];
  private glows: number[] = [];
  private matrix = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private rand: () => number;
  jitter = 0.07;
  glow = 0;

  constructor(seed = 1) {
    this.rand = mulberry32(seed);
  }

  push(x: number, y: number, z: number, yaw = 0, scale = 1): this {
    this.stack.push(this.matrix.clone());
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(scale, scale, scale),
    );
    this.matrix.multiply(local);
    return this;
  }

  tilt(rx: number, rz: number): this {
    this.matrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    return this;
  }

  pop(): this {
    this.matrix.copy(this.stack.pop()!);
    return this;
  }

  private shade(color: RGB): RGB {
    const k = 1 + (this.rand() - 0.5) * 2 * this.jitter;
    return [color[0] * k, color[1] * k, color[2] * k];
  }

  private tri(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, color: RGB): void {
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    n.crossVectors(e1, e2).normalize();
    for (const p of [p0, p1, p2]) {
      this.positions.push(p.x, p.y, p.z);
      this.normals.push(n.x, n.y, n.z);
      this.colors.push(color[0], color[1], color[2]);
      this.glows.push(this.glow);
    }
  }

  quad(p0: number[], p1: number[], p2: number[], p3: number[], color: RGB): this {
    const shaded = this.shade(color);
    a.fromArray(p0).applyMatrix4(this.matrix);
    b.fromArray(p1).applyMatrix4(this.matrix);
    c.fromArray(p2).applyMatrix4(this.matrix);
    d.fromArray(p3).applyMatrix4(this.matrix);
    this.tri(a, b, c, shaded);
    this.tri(a, c, d, shaded);
    return this;
  }

  triangle(p0: number[], p1: number[], p2: number[], color: RGB): this {
    const shaded = this.shade(color);
    a.fromArray(p0).applyMatrix4(this.matrix);
    b.fromArray(p1).applyMatrix4(this.matrix);
    c.fromArray(p2).applyMatrix4(this.matrix);
    this.tri(a, b, c, shaded);
    return this;
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, taper = 1): this {
    const x = sx / 2;
    const y = sy / 2;
    const z = sz / 2;
    const tx = x * taper;
    const tz = z * taper;
    const p = [
      [cx - x, cy - y, cz - z],
      [cx + x, cy - y, cz - z],
      [cx + x, cy - y, cz + z],
      [cx - x, cy - y, cz + z],
      [cx - tx, cy + y, cz - tz],
      [cx + tx, cy + y, cz - tz],
      [cx + tx, cy + y, cz + tz],
      [cx - tx, cy + y, cz + tz],
    ];
    this.quad(p[3], p[2], p[6], p[7], color);
    this.quad(p[1], p[0], p[4], p[5], color);
    this.quad(p[2], p[1], p[5], p[6], color);
    this.quad(p[0], p[3], p[7], p[4], color);
    this.quad(p[7], p[6], p[5], p[4], color);
    this.quad(p[0], p[1], p[2], p[3], color);
    return this;
  }

  gable(cx: number, y: number, cz: number, width: number, height: number, length: number, roof: RGB, wall: RGB): this {
    const x = width / 2;
    const z = length / 2;
    this.quad([cx - x, y, cz + z], [cx, y + height, cz + z], [cx, y + height, cz - z], [cx - x, y, cz - z], roof);
    this.quad([cx + x, y, cz - z], [cx, y + height, cz - z], [cx, y + height, cz + z], [cx + x, y, cz + z], roof);
    this.triangle([cx - x, y, cz + z], [cx + x, y, cz + z], [cx, y + height, cz + z], wall);
    this.triangle([cx + x, y, cz - z], [cx - x, y, cz - z], [cx, y + height, cz - z], wall);
    this.quad([cx - x, y, cz - z], [cx + x, y, cz - z], [cx + x, y, cz + z], [cx - x, y, cz + z], wall);
    return this;
  }

  cylinder(cx: number, y: number, cz: number, bottom: number, top: number, height: number, segments: number, color: RGB, cap = true): this {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      this.quad(
        [cx + c0 * bottom, y, cz + s0 * bottom],
        [cx + c0 * top, y + height, cz + s0 * top],
        [cx + c1 * top, y + height, cz + s1 * top],
        [cx + c1 * bottom, y, cz + s1 * bottom],
        color,
      );
      if (cap && top > 0.001) {
        this.triangle([cx, y + height, cz], [cx + c1 * top, y + height, cz + s1 * top], [cx + c0 * top, y + height, cz + s0 * top], color);
      }
    }
    return this;
  }

  dome(cx: number, y: number, cz: number, radius: number, height: number, segments: number, color: RGB): this {
    const rings = 4;
    for (let r = 0; r < rings; r++) {
      const t0 = (r / rings) * (Math.PI / 2);
      const t1 = ((r + 1) / rings) * (Math.PI / 2);
      this.cylinder(cx, y + Math.sin(t0) * height, cz, Math.cos(t0) * radius, Math.cos(t1) * radius, (Math.sin(t1) - Math.sin(t0)) * height, segments, color, false);
    }
    return this;
  }

  geometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('glow', new THREE.Float32BufferAttribute(this.glows, 1));
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const shared = new Map<boolean, THREE.MeshBasicNodeMaterial>();

export function sculptMaterial(doubleSided = false): THREE.MeshBasicNodeMaterial {
  const cached = shared.get(doubleSided);
  if (cached) return cached;
  const material = new THREE.MeshBasicNodeMaterial({ side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  const color: N = attribute('color', 'vec3');
  const glow: N = attribute('glow', 'float');
  const speckle = brush(positionWorld.xz.add(positionWorld.y.mul(0.83)), 0.35);
  const weather = brush(positionWorld.xz.mul(0.31).add(positionWorld.y), 0.08);
  const albedo = color.mul(speckle.sub(0.5).mul(0.3).add(1)).mul(weather.sub(0.5).mul(0.22).add(1));
  const lit = paint(albedo, normalWorld, positionWorld, float(1), 0.82, false);
  const flicker = sin(time.mul(7.3).add(positionWorld.x)).mul(0.06).add(1);
  material.colorNode = applyFog(lit.add(color.mul(color).mul(glow).mul(flicker).mul(5)), positionWorld);
  shared.set(doubleSided, material);
  return material;
}
