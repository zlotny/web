import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, dot, float, max, mix, normalWorld, normalize, positionGeometry, positionWorld, pow, smoothstep, varying, vec3 } from 'three/tsl';
import { TANK } from '../sim/fluid';
import type { LightMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { Sculpt, sculptMaterial, type RGB } from './sculpt';
import { applyFog, env, type N } from './shading';

const STONE: RGB = [0.6, 0.58, 0.55];
const STONE_DARK: RGB = [0.44, 0.43, 0.42];
const WOOD: RGB = [0.5, 0.35, 0.23];
const BRASS: RGB = [0.78, 0.6, 0.25];
const WALL = 1.75;

function basin(): THREE.BufferGeometry {
  const s = new Sculpt(31);
  const { length, width, slopeStart, slope } = TANK;
  const t = 0.55;
  s.box(length / 2, -0.35, width / 2, length + 2 * t + 1.2, 0.7, width + 2 * t + 1.2, STONE_DARK);
  for (const z of [-t / 2, width + t / 2]) {
    const blocks = 9;
    for (let i = 0; i < blocks; i++) {
      const w = (length + 2 * t) / blocks;
      s.box(-t + w * (i + 0.5), WALL / 2, z, w - 0.04, WALL + (i % 2) * 0.08, t, i % 3 ? STONE : STONE_DARK);
    }
  }
  s.box(-t / 2, WALL / 2 + 0.3, width / 2, t, WALL + 0.6, width + 2 * t, STONE);
  s.box(length + t / 2, WALL / 2 + 0.2, width / 2, t, WALL + 0.4, width + 2 * t, STONE);
  const rise = (length - slopeStart) * slope;
  s.quad([slopeStart, 0.02, 0], [slopeStart, 0.02, width], [length, rise, width], [length, rise, 0], [0.8, 0.72, 0.54]);
  s.box(-1.5, 1.2, width / 2, 0.3, 2.4, 0.3, WOOD);
  s.box(-1.5, 2.5, width / 2, 0.5, 0.2, width + 1.4, WOOD);
  s.cylinder(-1.5, 2.6, width / 2 - 0.5, 0.7, 0.7, 0.12, 12, BRASS);
  for (let i = 0; i < 5; i++) {
    s.box(length * 0.2 + i * 2.1, WALL + 0.14, -t / 2, 0.08, 0.28, t + 0.06, BRASS);
  }
  return s.geometry();
}

function pistonGeometry(): THREE.BufferGeometry {
  const s = new Sculpt(32);
  const { width } = TANK;
  s.box(-0.09, 1.15, width / 2, 0.18, 2.3, width - 0.08, WOOD);
  for (const z of [0.5, width / 2, width - 0.5]) s.box(-0.22, 1.15, z, 0.1, 2.3, 0.16, [0.36, 0.25, 0.17]);
  s.box(-1.0, 1.5, width / 2, 1.9, 0.16, 0.16, BRASS);
  return s.geometry();
}

export class Tank {
  readonly group = new THREE.Group();
  private worker: Worker;
  private data: Float32Array | null = null;
  private buffer: THREE.InstancedBufferAttribute | null = null;
  private sprite: THREE.Mesh | null = null;
  private piston: THREE.Mesh;
  private spare: Float32Array | null = null;
  private waiting = false;
  private count = 0;
  private shapes: THREE.BufferGeometry[] = [];

  constructor(x: number, ground: number, z: number, yaw: number, light: LightMap, spacing: number, obstacles: Obstacles) {
    const frame = new THREE.Group();
    frame.position.set(-TANK.length / 2, 0.55, -TANK.width / 2);
    const material = sculptMaterial();
    frame.add(new THREE.Mesh(basin(), material));
    this.piston = new THREE.Mesh(pistonGeometry(), material);
    frame.add(this.piston);
    this.group.add(frame);
    this.group.position.set(x, ground, z);
    this.group.rotation.y = yaw;
    this.group.name = 'tank';
    light.occlude(x, z, 10, 0.3);
    for (const along of [-5.2, -1.7, 1.7, 5.2]) {
      obstacles.add(x + Math.cos(yaw) * along, z - Math.sin(yaw) * along, 2.9, ground - 1, ground + 2.5);
    }

    this.worker = new Worker(new URL('../sim/fluid.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<{ type: string; count?: number; buffer?: Float32Array }>) => {
      const message = event.data;
      if (message.type === 'ready' && message.count) {
        this.count = message.count;
        this.build(frame, spacing);
      } else if (message.type === 'frame' && message.buffer && this.data) {
        this.data.set(message.buffer.subarray(0, this.count * 4));
        if (this.buffer) this.buffer.needsUpdate = true;
        this.piston.position.x = message.buffer[this.count * 4];
        this.spare = message.buffer;
        this.waiting = false;
      }
    };
    this.worker.postMessage({ type: 'init', spacing });
  }

  private build(frame: THREE.Group, spacing: number): void {
    this.data = new Float32Array(this.count * 4);
    this.buffer = new THREE.InstancedBufferAttribute(this.data, 4);
    this.buffer.setUsage(THREE.DynamicDrawUsage);
    const particle: N = attribute('particle', 'vec4');
    const material = new THREE.MeshBasicNodeMaterial();
    const center: N = particle.xyz;
    const speed: N = varying(particle.w);
    const depth: N = varying(center.y);
    material.positionNode = positionGeometry.mul(spacing * 0.92).add(center);
    const normal: N = normalize(normalWorld);
    const view: N = normalize(cameraPosition.sub(positionWorld));
    const calm = mix(vec3(0.03, 0.2, 0.36), vec3(0.1, 0.5, 0.62), smoothstep(0.0, 1.3, depth));
    const fast = mix(calm, vec3(0.5, 0.86, 0.9), smoothstep(0.8, 3.0, speed));
    const foam = mix(fast, vec3(1, 1, 1), smoothstep(2.6, 5.0, speed));
    const facing = max(dot(normal, env.sunDir), 0);
    const rim = float(1).sub(max(dot(normal, view), 0)).pow(3);
    const glint = pow(max(dot(normalize(env.sunDir.add(view)), normal), 0), 40);
    const light = env.ambientSky.mul(normal.y.mul(0.3).add(0.7)).add(env.sunColor.mul(facing.mul(0.5).add(0.12)));
    const lit = pow(foam, vec3(2.2)).mul(light).add(env.skyHorizon.mul(rim.mul(0.35))).add(env.sunColor.mul(glint.mul(0.5)));
    material.colorNode = applyFog(lit, positionWorld);
    const bound = new THREE.Sphere(new THREE.Vector3(TANK.length / 2, TANK.height / 2, TANK.width / 2), Math.hypot(TANK.length, TANK.height, TANK.width) / 2 + 1);
    this.shapes = [1, 0].map((detail) => {
      const geometry = new THREE.IcosahedronGeometry(1, detail);
      geometry.setAttribute('particle', this.buffer!);
      geometry.boundingSphere = bound;
      return geometry;
    });
    this.sprite = new THREE.Mesh(this.shapes[0], material);
    this.sprite.count = this.count;
    frame.add(this.sprite);
  }

  focus(distance: number): void {
    if (this.sprite) this.sprite.geometry = this.shapes[distance > 90 ? 1 : 0];
  }

  update(active: boolean): void {
    if (!active || this.waiting || !this.data) return;
    this.waiting = true;
    if (this.spare) {
      const buffer = this.spare;
      this.spare = null;
      this.worker.postMessage({ type: 'tick', buffer }, [buffer.buffer]);
    } else {
      this.worker.postMessage({ type: 'tick' });
    }
  }
}
