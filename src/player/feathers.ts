import * as THREE from 'three/webgpu';
import { attribute, positionWorld, pow, vec3 } from 'three/tsl';
import { applyFog, env, type N } from '../world/shading';

const COUNT = 56;
const TINTS = [
  [0.97, 0.87, 0.3],
  [0.97, 0.87, 0.3],
  [0.96, 0.95, 0.9],
  [0.45, 0.47, 0.5],
  [0.95, 0.45, 0.15],
];

interface Feather {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  angle: THREE.Euler;
  life: number;
  span: number;
  size: number;
}

export class Feathers {
  readonly mesh: THREE.InstancedMesh;
  private items: Feather[] = [];
  private dummy = new THREE.Object3D();
  private active = false;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, -0.5, 0, 0.16, -0.05, 0.03, 0, 0.5, 0, -0.16, -0.05, 0.03], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const tints = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) tints.set(TINTS[i % TINTS.length], i * 3);
    geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tints, 3));
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const tint: N = attribute('tint', 'vec3');
    material.colorNode = applyFog(pow(tint, vec3(2.2)).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.45))), positionWorld);
    this.mesh = new THREE.InstancedMesh(geometry, material, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    for (let i = 0; i < COUNT; i++) {
      this.items.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        angle: new THREE.Euler(),
        life: 0,
        span: 1,
        size: 0.3,
      });
    }
  }

  burst(center: THREE.Vector3, inward = false, palette: number[][] = TINTS): void {
    const tint = this.mesh.geometry.getAttribute('tint') as THREE.InstancedBufferAttribute;
    for (let i = 0; i < COUNT; i++) tint.setXYZ(i, palette[i % palette.length][0], palette[i % palette.length][1], palette[i % palette.length][2]);
    tint.needsUpdate = true;
    this.active = true;
    this.mesh.visible = true;
    for (const item of this.items) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      const speed = 2.5 + Math.random() * 6;
      item.velocity.set(ring * Math.cos(phi) * speed, u * speed * 0.7 + 1.5, ring * Math.sin(phi) * speed);
      item.position.copy(center);
      if (inward) {
        item.position.addScaledVector(item.velocity, 0.55);
        item.velocity.multiplyScalar(-1.5);
      }
      item.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      item.angle.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      item.span = 0.8 + Math.random() * 0.9;
      item.life = item.span;
      item.size = 0.22 + Math.random() * 0.3;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    let alive = false;
    this.items.forEach((item, i) => {
      item.life -= dt;
      const k = Math.max(0, item.life / item.span);
      if (k > 0) alive = true;
      item.velocity.multiplyScalar(Math.exp(-2.6 * dt));
      item.velocity.y -= 1.6 * dt;
      item.position.addScaledVector(item.velocity, dt);
      item.angle.x += item.spin.x * dt;
      item.angle.y += item.spin.y * dt;
      item.angle.z += item.spin.z * dt;
      this.dummy.position.copy(item.position);
      this.dummy.rotation.copy(item.angle);
      this.dummy.scale.setScalar(item.size * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (k > 0 ? 1 : 0));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
}
