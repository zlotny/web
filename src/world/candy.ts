import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cos, float, fract, mix, normalWorld, positionGeometry, positionLocal, positionWorld, sin, smoothstep, time, uv, vec2, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import { Sculpt } from './sculpt';
import { applyFog, env, groundHeight, noise, type N } from './shading';

const skyLight: N = env.ambientSky;
const sunLight: N = env.sunColor;

export function createWindLines(count: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1, 1, 40, 1);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = (i + 0.37) / count;
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const seed: N = attribute('seed', 'float');
  const local: N = positionGeometry;
  const s: N = local.x.add(0.5);
  const period = seed.mul(3).add(5);
  const clock: N = time.div(period).add(seed.mul(17));
  const cycle: N = clock.floor();
  const life: N = clock.fract();
  const h = (k: number): N => cycle.mul(12.9898 + k * 3.7).add(seed.mul(78.233)).sin().mul(43758.5453).fract();
  const wind: N = vec2(env.wind).normalize();
  const cross: N = vec2(wind.y.negate(), wind.x);
  const start: N = vec2(env.bird.x, env.bird.z).add(wind.mul(h(0).mul(190).sub(70))).add(cross.mul(h(1).mul(240).sub(120)));
  const travel: N = life.mul(70).add(s.mul(34));
  const loop = smoothstep(0.35, 0.5, s).mul(smoothstep(0.8, 0.65, s));
  const swirl: N = s.sub(0.35).mul(14).add(h(3).mul(6));
  const side: N = sin(s.mul(5).add(h(2).mul(6.28))).mul(2.5).add(sin(swirl).mul(loop).mul(3.2));
  const flat: N = start.add(wind.mul(travel.sub(cos(swirl).mul(loop).mul(3.2)))).add(cross.mul(side));
  const floor: N = groundHeight(flat).max(0);
  const lift: N = floor.add(3).add(h(4).mul(26)).max(env.bird.y.add(h(5).mul(30).sub(18))).add(cos(swirl).mul(loop).mul(2.2)).add(sin(s.mul(4).add(h(2).mul(9))).mul(1.2));
  const centre: N = vec3(flat.x, lift, flat.y);
  const toCamera: N = cameraPosition.sub(centre).normalize();
  const along: N = vec3(wind.x, 0, wind.y);
  const across: N = along.cross(toCamera).normalize();
  const taper = sin(s.mul(Math.PI)).pow(0.7);
  material.positionNode = centre.add(across.mul(local.y.mul(0.34).mul(taper)));
  const fade = sin(life.mul(Math.PI)).pow(0.8).mul(taper);
  material.colorNode = applyFog(vec3(1, 1, 1).mul(skyLight.add(sunLight.mul(0.5))), centre);
  material.opacityNode = fade.mul(smoothstep(0.5, 0.2, uv().y.sub(0.5).abs())).mul(0.2).mul(float(1).sub(env.night.mul(0.6)));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 17;
  mesh.name = 'wind';
  return mesh;
}

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  private puffs: { x: number; y: number; z: number; size: number; turn: number }[] = [];
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private position = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(count: number, floor: number) {
    const rand = mulberry32(3301);
    const s = new Sculpt(3302);
    s.jitter = 0.12;
    const white: [number, number, number] = [1, 1, 1];
    for (let k = 0; k < 9; k++) {
      const a = rand() * Math.PI * 2;
      const d = k === 0 ? 0 : 0.35 + rand() * 0.75;
      const r = k === 0 ? 0.62 : 0.26 + rand() * 0.3;
      const px = Math.cos(a) * d;
      const pz = Math.sin(a) * d * 0.6;
      s.dome(px, 0, pz, r, r * (0.7 + rand() * 0.4), 9, white);
      s.push(px, 0, pz).tilt(Math.PI, 0);
      s.dome(0, 0, 0, r, r * 0.22, 9, white);
      s.pop();
    }
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const swell = noise(positionWorld.xz.mul(0.004).add(time.mul(0.01))).r.sub(0.5);
    material.positionNode = positionLocal.add(vec3(0, swell.mul(0.05), 0));
    const lightSide: N = normalWorld.dot(env.sunDir).mul(0.5).add(0.5);
    const under = smoothstep(0.1, -0.6, normalWorld.y);
    const body: N = mix(vec3(0.62, 0.68, 0.8), vec3(1, 1, 1), smoothstep(0.2, 0.85, lightSide));
    const tone: N = mix(body, vec3(0.5, 0.55, 0.68), under.mul(0.55));
    material.colorNode = applyFog(tone.mul(tone).mul(skyLight.mul(0.62).add(sunLight.mul(lightSide).mul(0.42))), positionWorld);
    this.mesh = new THREE.InstancedMesh(s.geometry(), material, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'clouds';
    for (let i = 0; i < count; i++) {
      this.puffs.push({ x: (rand() - 0.5) * 4400, y: floor + rand() * 130, z: (rand() - 0.5) * 4400, size: 60 + rand() * 90, turn: rand() * Math.PI * 2 });
    }
    this.update(0, 0, 0);
  }

  update(dt: number, wx: number, wz: number): void {
    this.puffs.forEach((puff, i) => {
      puff.x += wx * dt * 3.2;
      puff.z += wz * dt * 3.2;
      if (puff.x > 2200) puff.x -= 4400;
      if (puff.x < -2200) puff.x += 4400;
      if (puff.z > 2200) puff.z -= 4400;
      if (puff.z < -2200) puff.z += 4400;
      this.position.set(puff.x, puff.y, puff.z);
      this.quaternion.setFromAxisAngle(this.up, puff.turn);
      this.scale.set(puff.size, puff.size * 0.62, puff.size);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.quaternion, this.scale));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  inside(p: THREE.Vector3): number {
    let deepest = 0;
    for (const puff of this.puffs) {
      const dx = (p.x - puff.x) / (puff.size * 0.95);
      const dy = (p.y - puff.y - puff.size * 0.14) / (puff.size * 0.36);
      const dz = (p.z - puff.z) / (puff.size * 0.7);
      const d = dx * dx + dy * dy + dz * dz;
      if (d < 1) deepest = Math.max(deepest, 1 - d);
    }
    return deepest;
  }
}

export class Sparkles {
  readonly mesh: THREE.Mesh;
  private data: Float32Array;
  private attribute: THREE.InstancedBufferAttribute;

  constructor(points: { x: number; y: number; z: number }[]) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.data = new Float32Array(points.length * 4);
    points.forEach((p, i) => this.data.set([p.x, p.y, p.z, 1], i * 4));
    this.attribute = new THREE.InstancedBufferAttribute(this.data, 4);
    geometry.setAttribute('spark', this.attribute);
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const spark: N = attribute('spark', 'vec4');
    const local: N = positionGeometry;
    const centre: N = vec3(spark.x, spark.y.add(sin(time.mul(1.3).add(spark.x)).mul(0.6)), spark.z);
    const toCamera: N = cameraPosition.sub(centre);
    const far = toCamera.length();
    const facing: N = toCamera.div(far);
    const right: N = vec3(facing.z, 0, facing.x.negate()).normalize();
    const upward: N = facing.cross(right);
    const size = far.mul(0.035).clamp(1.6, 14);
    const turn = time.mul(0.6).add(spark.z);
    const qx: N = local.x.mul(cos(turn)).sub(local.y.mul(sin(turn)));
    const qy: N = local.x.mul(sin(turn)).add(local.y.mul(cos(turn)));
    material.positionNode = centre.add(right.mul(qx.mul(size))).add(upward.mul(qy.mul(size)));
    const p: N = uv().sub(0.5).abs();
    const star = smoothstep(0.035, 0.0, p.x.mul(p.y)).mul(smoothstep(0.5, 0.1, p.x.max(p.y)));
    const core = smoothstep(0.16, 0.0, p.length());
    const blink = fract(time.mul(0.45).add(spark.x.mul(0.37))).mul(6.283).sin().mul(0.5).add(0.5).pow(3);
    material.colorNode = vec3(1.0, 0.92, 0.6).mul(2.2);
    material.opacityNode = star.mul(blink.mul(0.8).add(0.2)).add(core.mul(0.5)).mul(spark.w).mul(smoothstep(700, 300, far)).mul(smoothstep(14, 30, far));
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.count = points.length;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 26;
    this.mesh.name = 'sparkles';
  }

  hide(index: number): void {
    if (this.data[index * 4 + 3] === 0) return;
    this.data[index * 4 + 3] = 0;
    this.attribute.needsUpdate = true;
  }

  show(): void {
    for (let i = 3; i < this.data.length; i += 4) this.data[i] = 1;
    this.attribute.needsUpdate = true;
  }
}
