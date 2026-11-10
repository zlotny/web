import * as THREE from 'three/webgpu';
import { sin, time, uniform, vec3 } from 'three/tsl';

export class Race {
  readonly group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private levels: { value: number }[] = [];
  private next = -1;
  elapsed = 0;
  running = false;
  onStart: () => void = () => {};
  onRing: (index: number, total: number) => void = () => {};
  onFinish: (seconds: number) => void = () => {};

  constructor(points: THREE.Vector3[]) {
    const geometry = new THREE.TorusGeometry(7, 0.55, 8, 28);
    points.forEach((point, i) => {
      const level = uniform(i === 0 ? 1 : 0);
      const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const pulse = sin(time.mul(4)).mul(0.25).add(0.85);
      material.colorNode = (i === 0 ? vec3(1.0, 0.85, 0.25) : vec3(0.35, 1.0, 0.75)).mul(pulse).mul(1.6);
      material.opacityNode = level;
      const ring = new THREE.Mesh(geometry, material);
      ring.position.copy(point);
      const ahead = points[(i + 1) % points.length];
      ring.lookAt(ahead.x, point.y, ahead.z);
      ring.frustumCulled = false;
      ring.renderOrder = 25;
      this.rings.push(ring);
      this.levels.push(level);
      this.group.add(ring);
    });
    this.group.name = 'race';
  }

  private show(): void {
    this.levels.forEach((level, i) => {
      level.value = !this.running ? (i === 0 ? 1 : 0) : i === this.next ? 1 : i === (this.next + 1) % this.rings.length ? 0.3 : 0;
    });
  }

  cancel(): void {
    this.running = false;
    this.next = -1;
    this.show();
  }

  update(position: THREE.Vector3, dt: number): void {
    const target = this.running ? this.next : 0;
    const ring = this.rings[target];
    if (this.running) {
      this.elapsed += dt;
      if (this.elapsed > 150) this.cancel();
    }
    if (position.distanceTo(ring.position) > 7.5) return;
    if (!this.running) {
      this.running = true;
      this.elapsed = 0;
      this.next = 1;
      this.show();
      this.onStart();
      return;
    }
    if (this.next === 0) {
      const seconds = this.elapsed;
      this.cancel();
      this.onFinish(seconds);
      return;
    }
    this.onRing(this.next, this.rings.length);
    this.next = (this.next + 1) % this.rings.length;
    this.show();
  }
}
