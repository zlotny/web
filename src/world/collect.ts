import * as THREE from 'three/webgpu';
import { attribute, cos, float, mix, positionGeometry, positionWorld, sin, time, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import type { HeightMap } from './height';
import { applyFog, type N } from './shading';

export interface Spot {
  x: number;
  y: number;
  z: number;
}

export function featherSpots(map: HeightMap, fixed: Spot[], count: number, free: (x: number, z: number) => boolean): Spot[] {
  const rand = mulberry32(777);
  const spots = [...fixed];
  let guard = 0;
  while (spots.length < count && guard++ < 4000) {
    const angle = rand() * Math.PI * 2;
    const r = 150 + rand() * 1250;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const ground = map.sample(x, z);
    const lift = 7 + rand() * 22;
    if (ground < 1.5 || !free(x, z)) continue;
    if (spots.some((spot) => Math.hypot(spot.x - x, spot.z - z) < 170)) continue;
    spots.push({ x, y: ground + lift, z });
  }
  return spots;
}

export class Collectibles {
  readonly mesh: THREE.Mesh;
  private state: THREE.InstancedBufferAttribute;

  constructor(
    readonly spots: Spot[],
    taken: Set<number>,
  ) {
    const blade = new THREE.BufferGeometry();
    const positions: number[] = [];
    const steps = 7;
    for (const turn of [0, Math.PI / 2]) {
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const w0 = Math.sin(Math.PI * Math.pow(t0, 0.7)) * 0.42 + 0.03;
        const w1 = Math.sin(Math.PI * Math.pow(t1, 0.7)) * 0.42 + 0.03;
        const quad = [
          [-w0, t0 * 2.4 - 1.2],
          [w0, t0 * 2.4 - 1.2],
          [w1, t1 * 2.4 - 1.2],
          [-w1, t1 * 2.4 - 1.2],
        ];
        for (const k of [0, 1, 2, 0, 2, 3]) positions.push(Math.cos(turn) * quad[k][0], quad[k][1], Math.sin(turn) * quad[k][0]);
      }
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const data = new Float32Array(spots.length * 4);
    spots.forEach((spot, i) => data.set([spot.x, spot.y, spot.z, taken.has(i) ? 0 : 1], i * 4));
    this.state = new THREE.InstancedBufferAttribute(data, 4);
    this.state.setUsage(THREE.DynamicDrawUsage);
    blade.setAttribute('spot', this.state);

    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const spot: N = attribute('spot', 'vec4');
    const local: N = positionGeometry;
    const spin = time.mul(1.6).add(spot.x.mul(0.37));
    const size = spot.w.mul(sin(time.mul(2.2).add(spot.z)).mul(0.08).add(1));
    const turned = vec3(local.x.mul(cos(spin)).sub(local.z.mul(sin(spin))), local.y, local.x.mul(sin(spin)).add(local.z.mul(cos(spin))));
    material.positionNode = vec3(spot.x, spot.y.add(sin(time.mul(1.3).add(spot.x)).mul(0.5)), spot.z).add(turned.mul(size).mul(1.15));
    const shine = sin(local.y.mul(4).sub(time.mul(3))).mul(0.5).add(0.5);
    material.colorNode = applyFog(mix(vec3(1.0, 0.62, 0.08), vec3(1.0, 0.95, 0.55), shine).mul(float(1.15)), positionWorld);
    this.mesh = new THREE.Mesh(blade, material);
    this.mesh.count = spots.length;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'collectibles';
  }

  near(position: THREE.Vector3, radius: number): number {
    for (let i = 0; i < this.spots.length; i++) {
      if (this.state.getW(i) === 0) continue;
      const spot = this.spots[i];
      if (Math.abs(position.x - spot.x) < radius && Math.abs(position.z - spot.z) < radius && Math.abs(position.y - spot.y) < radius + 1.5) return i;
    }
    return -1;
  }

  take(index: number): void {
    this.state.setW(index, 0);
    this.state.needsUpdate = true;
  }

  restore(): void {
    for (let i = 0; i < this.spots.length; i++) this.state.setW(i, 1);
    this.state.needsUpdate = true;
  }
}
