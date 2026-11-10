import * as THREE from 'three/webgpu';
import type { HeightMap } from './height';
import { Sculpt, sculptMaterial, type RGB } from './sculpt';

export class Coca {
  readonly group = new THREE.Group();
  private target = new THREE.Vector2();
  private yaw = 0;
  private clock = 0;
  private seed = 20261110;

  constructor(private map: HeightMap) {
    const s = new Sculpt(733);
    s.jitter = 0.02;
    const red: RGB = [0.82, 0.12, 0.1];
    const dark: RGB = [0.5, 0.07, 0.07];
    const gold: RGB = [0.98, 0.8, 0.2];
    const cream: RGB = [0.96, 0.92, 0.8];
    s.box(0, 0.5, 0, 2.4, 1.0, 6.4, red, 0.7);
    s.box(0, 0.95, 0, 2.6, 0.2, 6.6, gold);
    s.box(0, 0.6, 3.6, 1.5, 0.9, 1.4, red, 0.6);
    s.box(0, 0.6, -3.5, 1.7, 1.0, 1.2, dark, 0.7);
    s.box(0, 0.75, -0.3, 1.9, 0.14, 3.6, [0.6, 0.42, 0.26]);
    s.box(0, 1.2, -4.0, 0.14, 1.3, 0.5, dark);
    s.push(0, 0.9, 4.0).tilt(0.5, 0);
    s.box(0, 0.9, 0, 0.8, 1.9, 0.8, red, 0.85);
    s.pop();
    s.push(0, 2.5, 4.8).tilt(-0.25, 0);
    s.box(0, 0.5, 0, 0.72, 1.1, 0.72, red);
    s.pop();
    s.box(0, 3.5, 5.0, 1.1, 0.9, 1.7, red);
    s.box(0, 3.3, 6.0, 0.8, 0.44, 0.7, dark);
    s.box(0, 3.0, 5.7, 0.9, 0.14, 1.0, cream);
    s.box(-0.57, 3.7, 5.3, 0.06, 0.26, 0.3, gold);
    s.box(0.57, 3.7, 5.3, 0.06, 0.26, 0.3, gold);
    for (const side of [-1, 1]) {
      s.push(side * 0.36, 3.95, 4.5).tilt(-0.5, side * -0.35);
      s.box(0, 0.5, 0, 0.2, 1.1, 0.2, gold, 0.4);
      s.pop();
    }
    for (let k = 0; k < 4; k++) s.triangle([0, 3.9 - k * 0.55, 4.25 - k * 0.12], [0, 3.3 - k * 0.55, 4.45 - k * 0.12], [0, 3.7 - k * 0.55, 3.7 - k * 0.12], gold);
    s.cylinder(0, 0.9, -0.4, 0.13, 0.1, 7.2, 6, [0.42, 0.3, 0.2]);
    s.box(0, 7.3, -0.4, 3.8, 0.12, 0.12, [0.42, 0.3, 0.2]);
    s.push(0, 4.6, -0.2).tilt(0.06, 0);
    s.box(0, 0, 0, 3.6, 5.0, 0.08, cream);
    s.box(0, 0.3, 0.06, 1.3, 1.3, 0.04, red);
    s.box(0, 0.3, 0.09, 0.6, 0.6, 0.04, gold);
    s.pop();
    s.triangle([0, 8.6, -0.4], [0, 8.1, -0.4], [0, 8.35, -1.5], red);
    const mesh = new THREE.Mesh(s.geometry(), sculptMaterial(true));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.group.name = 'coca';
    this.pick();
    this.group.position.set(this.target.x, 0, this.target.y);
    this.pick();
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private pick(): void {
    for (let guard = 0; guard < 200; guard++) {
      const angle = this.random() * Math.PI * 2;
      const far = 1250 + this.random() * 420;
      const x = Math.cos(angle) * far;
      const z = Math.sin(angle) * far;
      if (this.map.sample(x, z) > -16) continue;
      if (guard < 150 && Math.hypot(x - this.group.position.x, z - this.group.position.z) > 900) continue;
      this.target.set(x, z);
      return;
    }
  }

  update(dt: number): void {
    this.clock += dt;
    const p = this.group.position;
    const dx = this.target.x - p.x;
    const dz = this.target.y - p.z;
    if (Math.hypot(dx, dz) < 30) this.pick();
    let want = Math.atan2(dx, dz);
    const ahead = this.map.sample(p.x + Math.sin(this.yaw) * 60, p.z + Math.cos(this.yaw) * 60);
    if (ahead > -8) want = Math.atan2(p.x, p.z);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += Math.max(-0.35 * dt, Math.min(0.35 * dt, diff));
    p.x += Math.sin(this.yaw) * 6.5 * dt;
    p.z += Math.cos(this.yaw) * 6.5 * dt;
    p.y = Math.sin(this.clock * 0.9 + p.x * 0.02) * 0.35 - 0.1;
    this.group.rotation.set(Math.sin(this.clock * 0.8) * 0.05, this.yaw, Math.sin(this.clock * 0.63 + 1) * 0.07 - diff * 0.1);
  }
}
