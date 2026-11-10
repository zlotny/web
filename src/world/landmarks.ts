import * as THREE from 'three/webgpu';
import { float, positionLocal, sin, smoothstep, time, uniform, uv, vec3 } from 'three/tsl';
import type { PlaceId } from '../content/types';
import type { N } from './shading';

export interface Landmark {
  id: PlaceId;
  x: number;
  z: number;
  ground: number;
  reach: number;
  orbit: number;
  height: number;
  focus: number;
  back: number;
}

const STORAGE_KEY = 'ndrs.visited';

export class Landmarks {
  readonly group = new THREE.Group();
  readonly visited = new Set<PlaceId>();
  private pillars = new Map<PlaceId, { mesh: THREE.Mesh; level: { value: number }; pulse: number }>();
  private clock = 0;

  constructor(readonly list: Landmark[]) {
    try {
      for (const id of JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) this.visited.add(id);
    } catch {}
    const geometry = new THREE.CylinderGeometry(2.2, 5.5, 150, 16, 1, true);
    geometry.translate(0, 75, 0);
    for (const landmark of list) {
      const level = uniform(this.visited.has(landmark.id) ? 0.35 : 1);
      const material = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const rise: N = uv().y;
      const shimmer = sin(positionLocal.y.mul(0.22).sub(time.mul(2.4))).mul(0.25).add(0.75);
      material.colorNode = vec3(1.0, 0.82, 0.36);
      material.opacityNode = smoothstep(0, 0.08, rise).mul(float(1).sub(rise).pow(2.2)).mul(shimmer).mul(level).mul(0.34);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(landmark.x, landmark.ground + landmark.height * 0.4, landmark.z);
      mesh.frustumCulled = false;
      mesh.renderOrder = 30;
      this.group.add(mesh);
      this.pillars.set(landmark.id, { mesh, level, pulse: 0 });
    }
    this.group.name = 'landmarks';
  }

  nearest(position: THREE.Vector3): { landmark: Landmark; distance: number } | null {
    let best: { landmark: Landmark; distance: number } | null = null;
    for (const landmark of this.list) {
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z);
      if (!best || distance < best.distance) best = { landmark, distance };
    }
    return best;
  }

  ping(id: PlaceId): void {
    const pillar = this.pillars.get(id);
    if (pillar) pillar.pulse = 1;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const [id, pillar] of this.pillars) {
      if (pillar.pulse <= 0) continue;
      pillar.pulse = Math.max(0, pillar.pulse - dt / 7);
      const base = this.visited.has(id) ? 0.35 : 1;
      pillar.level.value = base + pillar.pulse * (1.6 + Math.sin(this.clock * 7) * 1.1);
    }
  }

  unseen(position: THREE.Vector3): { landmark: Landmark; distance: number } | null {
    let best: { landmark: Landmark; distance: number } | null = null;
    for (const landmark of this.list) {
      if (this.visited.has(landmark.id)) continue;
      const distance = Math.hypot(position.x - landmark.x, position.z - landmark.z);
      if (!best || distance < best.distance) best = { landmark, distance };
    }
    return best;
  }

  reset(): void {
    this.visited.clear();
    for (const pillar of this.pillars.values()) pillar.level.value = 1;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  visit(id: PlaceId): void {
    this.visited.add(id);
    const pillar = this.pillars.get(id);
    if (pillar) pillar.level.value = 0.35;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.visited]));
    } catch {}
  }
}
