import * as THREE from 'three/webgpu';
import { attribute, float, mix, smoothstep, uniform, uv, vec3 } from 'three/tsl';
import { Sculpt, sculptMaterial, type RGB } from '../world/sculpt';
import type { N } from '../world/shading';
import type { Flight } from './flight';

const GREY: RGB = [0.55, 0.57, 0.62];
const DARK: RGB = [0.2, 0.21, 0.26];
const YELLOW: RGB = [0.98, 0.85, 0.2];
const ORANGE: RGB = [0.96, 0.42, 0.1];
const WHITE: RGB = [0.96, 0.95, 0.9];
const BLACK: RGB = [0.05, 0.05, 0.07];
const BEAK: RGB = [0.7, 0.66, 0.62];
const STEP = Math.PI / 10;

export class PixelBird {
  readonly group = new THREE.Group();
  private wings: THREE.Mesh[] = [];
  private tail: THREE.Mesh;
  private head: THREE.Mesh;

  constructor() {
    const material = sculptMaterial(true);
    const part = (build: (s: Sculpt) => void) => {
      const s = new Sculpt(7);
      s.jitter = 0;
      build(s);
      return new THREE.Mesh(s.geometry(), material);
    };
    const body = part((s) => {
      s.box(0, 0, 0, 0.44, 0.4, 0.92, GREY);
      s.box(0, -0.12, 0.02, 0.36, 0.2, 0.7, [0.66, 0.68, 0.72]);
      s.box(0.12, -0.26, -0.05, 0.08, 0.12, 0.1, [0.8, 0.6, 0.55]);
      s.box(-0.12, -0.26, -0.05, 0.08, 0.12, 0.1, [0.8, 0.6, 0.55]);
    });
    this.head = part((s) => {
      s.box(0, 0, 0, 0.4, 0.38, 0.38, YELLOW);
      s.box(0, -0.04, 0.24, 0.14, 0.14, 0.12, BEAK);
      s.box(0, -0.12, 0.2, 0.1, 0.08, 0.08, [0.5, 0.47, 0.45]);
      for (const side of [-1, 1]) {
        s.box(side * 0.205, 0.04, 0.08, 0.02, 0.08, 0.08, BLACK);
        s.box(side * 0.205, -0.08, -0.02, 0.02, 0.12, 0.12, ORANGE);
      }
      s.box(0, 0.26, -0.06, 0.1, 0.16, 0.1, YELLOW);
      s.box(0, 0.4, -0.14, 0.1, 0.16, 0.1, YELLOW);
      s.box(0, 0.54, -0.2, 0.08, 0.14, 0.08, [0.86, 0.8, 0.36]);
      s.box(0, 0.64, -0.14, 0.08, 0.08, 0.08, [0.86, 0.8, 0.36]);
    });
    this.head.position.set(0, 0.16, 0.56);
    this.tail = part((s) => {
      s.box(0, 0, -0.34, 0.26, 0.06, 0.68, DARK);
      s.box(0, 0, -0.78, 0.16, 0.06, 0.24, BLACK);
    });
    this.tail.position.set(0, 0.04, -0.44);
    for (const side of [1, -1]) {
      const wing = part((s) => {
        s.box(side * 0.3, 0, 0, 0.6, 0.07, 0.5, GREY);
        s.box(side * 0.36, 0.006, -0.05, 0.44, 0.07, 0.2, WHITE);
        s.box(side * 0.82, 0, -0.04, 0.46, 0.06, 0.4, DARK);
        s.box(side * 1.14, 0, -0.1, 0.22, 0.05, 0.26, BLACK);
      });
      wing.position.set(side * 0.2, 0.1, 0.08);
      this.wings.push(wing);
      this.group.add(wing);
    }
    this.group.add(body, this.head, this.tail);
    this.group.scale.setScalar(1.25);
    this.group.visible = false;
  }

  update(flight: Flight, clock: number): void {
    const perch = flight.perch;
    const amplitude = 0.2 + Math.min(1.25, flight.flapPower) * 0.75;
    const raw = Math.sin(flight.flapPhase) * amplitude * (1 - perch) + 0.12;
    const stroke = Math.round(raw / STEP) * STEP;
    this.wings.forEach((wing, i) => {
      const side = i === 0 ? 1 : -1;
      wing.rotation.set(0, side * perch * 1.25, side * (stroke - perch * 0.2));
    });
    this.tail.rotation.x = Math.round((-flight.pitch * 0.4 - perch * 0.3) / STEP) * STEP * 0.5;
    this.head.rotation.y = perch * Math.round((Math.sin(clock * 0.7) * 0.6) / STEP) * STEP;
    this.head.rotation.x = perch * 0.5;
    this.group.position.y = Math.round((-Math.sin(flight.flapPhase) * amplitude * 0.06 * (1 - perch)) / 0.02) * 0.02 + perch * 0.1;
  }
}

const SAMPLES = 54;

export class NeonTrail {
  readonly mesh: THREE.Mesh;
  private positions: Float32Array;
  private strength = uniform(0);
  private ribbons: number;
  private point = new THREE.Vector3();
  private primed = false;

  constructor(private tips: THREE.Object3D[], soft = false) {
    this.ribbons = tips.length;
    const count = this.ribbons * SAMPLES * 2;
    this.positions = new Float32Array(count * 3);
    const ages = new Float32Array(count);
    const lanes = new Float32Array(count);
    const indices: number[] = [];
    for (let r = 0; r < this.ribbons; r++) {
      for (let i = 0; i < SAMPLES; i++) {
        const k = (r * SAMPLES + i) * 2;
        ages[k] = ages[k + 1] = i / (SAMPLES - 1);
        lanes[k] = lanes[k + 1] = r / Math.max(1, this.ribbons - 1);
        if (i < SAMPLES - 1) indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('age', new THREE.BufferAttribute(ages, 1));
    geometry.setAttribute('lane', new THREE.BufferAttribute(lanes, 1));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const age: N = attribute('age', 'float');
    const lane: N = attribute('lane', 'float');
    material.colorNode = soft ? vec3(0.9, 0.95, 1.0).mul(0.5) : mix(mix(vec3(0.2, 1.0, 1.0), vec3(1.0, 0.25, 0.85), age), vec3(0.6, 0.4, 1.0), smoothstep(0.4, 0.6, lane).mul(smoothstep(0.6, 0.4, lane)).mul(2)).mul(0.75);
    material.opacityNode = float(1).sub(age).pow(soft ? 2.4 : 1.6).mul(this.strength).mul(soft ? 0.5 : 1);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 24;
    this.mesh.visible = false;
  }

  update(dt: number, active: boolean): void {
    this.strength.value += ((active ? 1 : 0) - this.strength.value) * (1 - Math.exp(-5 * dt));
    this.mesh.visible = this.strength.value > 0.01;
    if (!this.mesh.visible) {
      this.primed = false;
      return;
    }
    const p = this.positions;
    this.tips.forEach((tip, r) => {
      tip.getWorldPosition(this.point);
      const base = r * SAMPLES * 6;
      if (!this.primed) {
        for (let i = 0; i < SAMPLES; i++) {
          p[base + i * 6] = p[base + i * 6 + 3] = this.point.x;
          p[base + i * 6 + 1] = p[base + i * 6 + 4] = this.point.y;
          p[base + i * 6 + 2] = p[base + i * 6 + 5] = this.point.z;
        }
      }
      p.copyWithin(base + 6, base, base + (SAMPLES - 1) * 6);
      p[base] = p[base + 3] = this.point.x;
      p[base + 2] = p[base + 5] = this.point.z;
      p[base + 1] = this.point.y + 0.06;
      p[base + 4] = this.point.y - 0.06;
    });
    this.primed = true;
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Pulse {
  readonly mesh: THREE.Mesh;
  private life = uniform(1);
  private tint = uniform(new THREE.Color(1, 1, 1));
  private age = 1;

  constructor() {
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const at: N = uv();
    const d = at.sub(0.5).length().mul(2);
    const ring = smoothstep(0.62, 0.86, d).mul(smoothstep(1, 0.9, d));
    const core = smoothstep(0.7, 0, d).mul(float(1).sub(this.life).pow(3));
    const tint: N = this.tint;
    material.colorNode = tint.mul(ring.mul(2.4).add(core.mul(3)));
    material.opacityNode = ring.add(core).mul(float(1).sub(this.life).pow(1.3));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    this.mesh.visible = false;
  }

  fire(color: THREE.Color): void {
    this.age = 0;
    this.tint.value.copy(color);
    this.mesh.visible = true;
  }

  update(dt: number, position: THREE.Vector3, camera: THREE.Camera): void {
    if (!this.mesh.visible) return;
    this.age += dt / 0.7;
    this.life.value = Math.min(1, this.age);
    this.mesh.position.copy(position);
    this.mesh.quaternion.copy(camera.quaternion);
    this.mesh.scale.setScalar(1 + Math.pow(Math.min(1, this.age), 0.5) * 9);
    if (this.age >= 1) this.mesh.visible = false;
  }
}
