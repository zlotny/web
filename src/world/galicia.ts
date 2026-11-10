import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cos, float, fract, mix, positionGeometry, positionWorld, sin, smoothstep, step, time, uv, vec2, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import type { HeightMap } from './height';
import type { Obstacles } from './obstacles';
import { Sculpt, sculptMaterial, type RGB } from './sculpt';
import { applyFog, env, groundHeight, noise, paint, type N } from './shading';

export type ThingId =
  | 'vacas'
  | 'bestas'
  | 'batea'
  | 'palleiro'
  | 'anta'
  | 'castro'
  | 'petroglifo'
  | 'marco'
  | 'peto'
  | 'lavadoiro'
  | 'eolicos'
  | 'polbo'
  | 'gaiteiro'
  | 'queimada'
  | 'percebeiro'
  | 'pedra'
  | 'arroaces'
  | 'corvo'
  | 'toxo'
  | 'hortensias';

export const THINGS: ThingId[] = ['vacas', 'bestas', 'batea', 'palleiro', 'anta', 'castro', 'petroglifo', 'marco', 'peto', 'lavadoiro', 'eolicos', 'polbo', 'gaiteiro', 'queimada', 'percebeiro', 'pedra', 'arroaces', 'corvo', 'toxo', 'hortensias'];

export interface Thing {
  id: ThingId;
  x: number;
  y: number;
  z: number;
  reach: number;
  night?: boolean;
}

interface Roam {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

const skyLight: N = env.ambientSky;
const sunLight: N = env.sunColor;

const GRANITE: RGB = [0.62, 0.6, 0.57];
const GRANITE_DARK: RGB = [0.44, 0.43, 0.42];
const WOOD: RGB = [0.36, 0.25, 0.17];
const STRAW: RGB = [0.84, 0.72, 0.38];

function cow(coat: RGB, horn: number): THREE.BufferGeometry {
  const s = new Sculpt(41);
  s.jitter = 0;
  const pale: RGB = [0.93, 0.86, 0.72];
  const leg: RGB = [coat[0] * 0.72, coat[1] * 0.7, coat[2] * 0.7];
  for (const x of [-0.26, 0.26]) for (const z of [-0.62, 0.62]) s.box(x, 0.36, z, 0.2, 0.72, 0.22, leg);
  s.box(0, 1.47, 0, 0.6, 0.06, 1.7, [Math.min(1, coat[0] * 1.2), Math.min(1, coat[1] * 1.2), coat[2] * 1.2]);
  s.box(0, 1.06, 0, 0.78, 0.76, 1.8, coat);
  s.box(0, 0.74, -0.45, 0.4, 0.2, 0.4, [0.93, 0.7, 0.68]);
  s.box(0, 1.0, 1.08, 0.36, 0.42, 0.5, coat);
  s.box(0, 0.78, 1.38, 0.4, 0.44, 0.56, coat);
  s.box(0, 0.68, 1.68, 0.34, 0.26, 0.16, pale);
  s.box(-0.3, 1.02, 1.3, 0.22, 0.08, 0.12, coat);
  s.box(0.3, 1.02, 1.3, 0.22, 0.08, 0.12, coat);
  s.box(-0.2 - horn * 0.5, 1.1 + horn * 0.3, 1.24, 0.12 + horn, 0.1, 0.1, pale);
  s.box(0.2 + horn * 0.5, 1.1 + horn * 0.3, 1.24, 0.12 + horn, 0.1, 0.1, pale);
  if (horn > 0.2) {
    s.box(-0.2 - horn, 1.3 + horn * 0.5, 1.24, 0.1, 0.4, 0.1, pale);
    s.box(0.2 + horn, 1.3 + horn * 0.5, 1.24, 0.1, 0.4, 0.1, pale);
  }
  s.box(0, 0.9, -0.96, 0.08, 0.7, 0.08, coat);
  s.box(0, 0.52, -0.97, 0.12, 0.16, 0.12, [0.3, 0.2, 0.14]);
  return s.geometry();
}

function pony(coat: RGB): THREE.BufferGeometry {
  const s = new Sculpt(42);
  s.jitter = 0;
  const mane: RGB = [0.1, 0.08, 0.07];
  for (const x of [-0.2, 0.2]) for (const z of [-0.5, 0.5]) s.box(x, 0.4, z, 0.16, 0.8, 0.18, coat);
  s.box(0, 1.08, 0, 0.56, 0.6, 1.5, coat);
  s.push(0, 1.25, 0.72).tilt(-0.7, 0);
  s.box(0, 0.38, 0, 0.3, 0.86, 0.36, coat);
  s.box(0, 0.42, -0.2, 0.12, 0.9, 0.12, mane);
  s.pop();
  s.box(0, 1.82, 1.2, 0.28, 0.32, 0.62, coat);
  s.box(0, 2.0, 0.98, 0.3, 0.14, 0.2, mane);
  s.box(0, 0.86, -0.82, 0.14, 0.86, 0.14, mane);
  return s.geometry();
}

function hen(body: RGB): THREE.BufferGeometry {
  const s = new Sculpt(43);
  s.jitter = 0;
  s.box(-0.06, 0.1, 0, 0.04, 0.2, 0.04, [0.9, 0.7, 0.2]);
  s.box(0.06, 0.1, 0, 0.04, 0.2, 0.04, [0.9, 0.7, 0.2]);
  s.box(0, 0.32, 0, 0.24, 0.26, 0.36, body);
  s.box(0, 0.44, -0.2, 0.16, 0.2, 0.12, body);
  s.box(0, 0.52, 0.2, 0.14, 0.2, 0.14, body);
  s.box(0, 0.5, 0.3, 0.05, 0.05, 0.08, [0.95, 0.75, 0.2]);
  s.box(0, 0.64, 0.2, 0.04, 0.08, 0.12, [0.85, 0.15, 0.12]);
  return s.geometry();
}

function hound(): THREE.BufferGeometry {
  const s = new Sculpt(44);
  s.jitter = 0;
  const coat: RGB = [0.74, 0.6, 0.38];
  for (const x of [-0.14, 0.14]) for (const z of [-0.34, 0.34]) s.box(x, 0.24, z, 0.1, 0.48, 0.12, coat);
  s.box(0, 0.62, 0, 0.36, 0.36, 0.96, coat);
  s.box(0, 0.86, 0.56, 0.28, 0.3, 0.36, coat);
  s.box(0, 0.8, 0.8, 0.16, 0.14, 0.2, [0.25, 0.2, 0.16]);
  s.box(-0.12, 1.06, 0.5, 0.08, 0.16, 0.08, coat);
  s.box(0.12, 1.06, 0.5, 0.08, 0.16, 0.08, coat);
  s.box(0, 0.86, -0.56, 0.08, 0.4, 0.08, coat);
  return s.geometry();
}

function herd(geometry: THREE.BufferGeometry, roams: Roam[], seed: number, speed: number, legs: number, hip: number): THREE.Mesh {
  const rand = mulberry32(seed);
  const path = new Float32Array(roams.length * 4);
  const pace = new Float32Array(roams.length * 4);
  roams.forEach((r, i) => {
    path.set([r.ax, r.az, r.bx, r.bz], i * 4);
    pace.set([rand(), speed * (0.7 + rand() * 0.6), 0.88 + rand() * 0.26, rand()], i * 4);
  });
  geometry.setAttribute('path', new THREE.InstancedBufferAttribute(path, 4));
  geometry.setAttribute('pace', new THREE.InstancedBufferAttribute(pace, 4));
  const material = new THREE.MeshBasicNodeMaterial();
  const a: N = attribute('path', 'vec4');
  const p: N = attribute('pace', 'vec4');
  const local: N = positionGeometry;
  const span: N = a.zw.sub(a.xy);
  const long = span.length().max(0.01);
  const phase = fract(time.mul(p.y).div(long.mul(2)).add(p.x));
  const leg2 = fract(phase.mul(2));
  const walk = smoothstep(0.0, 0.05, leg2).mul(smoothstep(0.62, 0.56, leg2));
  const along = smoothstep(0.0, 0.6, leg2);
  const back = step(0.5, phase);
  const t = mix(along, along.oneMinus(), back);
  const dir = span.div(long).mul(float(1).sub(back.mul(2)));
  const at: N = a.xy.add(span.mul(t));
  const stride = along.mul(long).mul(legs).add(p.x.mul(40));
  const swing = smoothstep(hip, 0, local.y).mul(sin(stride.add(local.z.sign().mul(1.57)))).mul(local.x.sign()).mul(0.2).mul(walk);
  const graze = smoothstep(hip * 0.9, hip * 1.6, local.y).mul(smoothstep(0.5, 1.2, local.z)).mul(sin(time.mul(1.3).add(p.w.mul(30))).mul(0.5).add(0.5)).mul(walk.oneMinus()).mul(hip * 0.5);
  const lx = local.x.mul(p.z);
  const lz = local.z.add(swing).mul(p.z);
  material.positionNode = vec3(at.x.add(dir.y.mul(lx)).add(dir.x.mul(lz)), groundHeight(at).add(local.y.sub(graze).mul(p.z)), at.y.sub(dir.x.mul(lx)).add(dir.y.mul(lz)));
  const color: N = attribute('color', 'vec3');
  material.colorNode = applyFog(paint(color, vec3(0, 1, 0), positionWorld, float(1), 0.8, false), positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = roams.length;
  mesh.frustumCulled = false;
  return mesh;
}

function flutter(spots: number[], night: boolean): THREE.Mesh {
  const count = spots.length / 4;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(night ? [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0] : [0, 0, -0.5, 1, 0, -0.6, 1, 0, 0.6, 0, 0, -0.5, 1, 0, 0.6, 0, 0, 0.5, 0, 0, -0.5, -1, 0, 0.6, -1, 0, -0.6, 0, 0, -0.5, 0, 0, 0.5, -1, 0, 0.6], 3));
  geometry.setAttribute('home', new THREE.InstancedBufferAttribute(new Float32Array(spots), 4));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: night, depthWrite: !night, blending: night ? THREE.AdditiveBlending : THREE.NormalBlending });
  const h: N = attribute('home', 'vec4');
  const local: N = positionGeometry;
  const seed = h.w;
  const clock: N = time.mul(night ? 0.35 : 0.8).add(seed.mul(60));
  const drift = vec3(sin(clock.mul(1.1)).add(sin(clock.mul(0.37).add(seed.mul(9)))), sin(clock.mul(1.7).add(seed.mul(5))).mul(0.4), cos(clock.mul(0.9)).add(cos(clock.mul(0.53).add(seed.mul(7))))).mul(night ? 1.6 : 2.4);
  const base: N = vec3(h.x.add(drift.x), groundHeight(vec2(h.x, h.z)).add(h.y).add(drift.y), h.z.add(drift.z));
  if (night) {
    const toCamera = cameraPosition.sub(base).normalize();
    const right = vec3(toCamera.z, 0, toCamera.x.negate()).normalize();
    const blink = smoothstep(0.2, 0.9, sin(time.mul(1.4).add(seed.mul(80))).mul(0.5).add(0.5));
    material.positionNode = base.add(right.mul(local.x.mul(0.5))).add(vec3(0, local.y.mul(0.5), 0));
    material.colorNode = vec3(0.75, 1.0, 0.35).mul(2.6);
    material.opacityNode = smoothstep(0.5, 0.05, positionGeometry.xy.length()).mul(blink).mul(env.night);
  } else {
    const heading: N = clock.mul(0.9).add(seed.mul(20));
    const flap: N = sin(time.mul(17).add(seed.mul(90))).mul(0.9).add(0.25);
    const wing = local.x.abs();
    const lx: N = local.x.mul(cos(flap)).mul(0.32);
    const ly: N = wing.mul(sin(flap)).mul(0.32);
    const lz: N = local.z.mul(0.32);
    const day: N = float(1).sub(env.night);
    const wx: N = cos(heading).mul(lx).add(sin(heading).mul(lz));
    const wz: N = cos(heading).mul(lz).sub(sin(heading).mul(lx));
    const wings: N = vec3(wx, ly, wz);
    material.positionNode = base.add(wings.mul(day));
    const hue = fract(seed.mul(7.31));
    const tint: N = mix(mix(vec3(1, 0.95, 0.85), vec3(1.0, 0.72, 0.1), smoothstep(0.25, 0.3, hue)), mix(vec3(0.3, 0.55, 1.0), vec3(0.95, 0.35, 0.2), smoothstep(0.75, 0.8, hue)), smoothstep(0.5, 0.55, hue));
    const shade: N = tint.mul(mix(float(1), float(0.55), smoothstep(0.6, 1, wing)));
    material.colorNode = applyFog(shade.pow(vec3(2.2)).mul(skyLight.add(sunLight.mul(0.6))), positionWorld);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = night ? 18 : 0;
  return mesh;
}

function murmuration(cx: number, cy: number, cz: number, count: number): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.9, 0, -0.4, 0, 0.05, -0.1, 0, 0, 0.5, 0, 0.05, -0.1, -0.9, 0, -0.4], 3));
  const seeds = new Float32Array(count * 2);
  const rand = mulberry32(881);
  for (let i = 0; i < count; i++) seeds.set([i / count, rand()], i * 2);
  geometry.setAttribute('bird', new THREE.InstancedBufferAttribute(seeds, 2));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const b: N = attribute('bird', 'vec2');
  const local: N = positionGeometry;
  const t = time.mul(0.22);
  const s = b.x.mul(6.283).add(b.y.mul(0.9));
  const swirl = (shift: number): N =>
    vec3(
      sin(t.mul(1.0).add(s.mul(1.0)).add(shift)).mul(60).add(sin(t.mul(2.3).add(s.mul(2.0))).mul(22)),
      sin(t.mul(1.7).add(s.mul(1.5)).add(shift)).mul(16).add(cos(t.mul(0.9).add(s.mul(3.0))).mul(8)),
      cos(t.mul(1.3).add(s.mul(1.0)).add(shift)).mul(60).add(cos(t.mul(2.9).add(s.mul(2.0))).mul(22)),
    );
  const here: N = swirl(0).add(vec3(sin(b.y.mul(40)), sin(b.y.mul(71)), cos(b.y.mul(53))).mul(5));
  const ahead: N = swirl(0.05).sub(swirl(0)).normalize();
  const side: N = vec3(ahead.z, 0, ahead.x.negate()).normalize();
  const flap: N = sin(time.mul(14).add(b.y.mul(60))).mul(local.x.abs()).mul(0.5);
  const drift: N = vec3(sin(t.mul(0.31)).mul(260), sin(t.mul(0.5)).mul(14), cos(t.mul(0.23)).mul(200));
  const centre: N = vec3(cx, cy, cz);
  material.positionNode = centre.add(drift).add(here).add(side.mul(local.x.mul(0.8))).add(ahead.mul(local.z.mul(0.8))).add(vec3(0, flap.add(local.y), 0));
  material.colorNode = applyFog(vec3(0.03, 0.03, 0.04), positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.name = 'murmuration';
  return mesh;
}

function dolphins(pods: { x: number; z: number; radius: number }[]): THREE.Mesh {
  const s = new Sculpt(47);
  s.jitter = 0;
  const skin: RGB = [0.2, 0.25, 0.32];
  const belly: RGB = [0.7, 0.74, 0.78];
  s.box(0, 0, 0.2, 0.5, 0.5, 1.5, skin, 0.8);
  s.box(0, -0.14, 0.2, 0.42, 0.24, 1.3, belly);
  s.box(0, 0, 1.2, 0.3, 0.3, 0.7, skin, 0.5);
  s.box(0, 0, -0.9, 0.3, 0.32, 1.0, skin, 0.45);
  s.box(0, 0, -1.5, 0.8, 0.07, 0.34, skin);
  s.triangle([0, 0.25, 0.3], [0, 0.25, -0.3], [0, 0.72, -0.25], skin);
  s.triangle([0, 0.25, -0.3], [0, 0.25, 0.3], [0, 0.72, -0.25], skin);
  const geometry = s.geometry();
  const data: number[] = [];
  const rand = mulberry32(48);
  for (const pod of pods) for (let i = 0; i < 4; i++) data.push(pod.x, pod.z, pod.radius * (0.85 + rand() * 0.3), rand());
  geometry.setAttribute('pod', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
  const material = new THREE.MeshBasicNodeMaterial();
  const p: N = attribute('pod', 'vec4');
  const local: N = positionGeometry;
  const angle = time.mul(4.5).div(p.z).add(p.w.mul(1.2));
  const forward = vec2(sin(angle).negate(), cos(angle));
  const side = vec2(forward.y, forward.x.negate());
  const leap = time.mul(1.15).add(p.w.mul(17));
  const height = sin(leap).mul(3.6).sub(1.1);
  const pitch = cos(leap).mul(0.75);
  const ly = local.y.mul(cos(pitch)).add(local.z.mul(sin(pitch)));
  const lz = local.z.mul(cos(pitch)).sub(local.y.mul(sin(pitch)));
  material.positionNode = vec3(p.x.add(cos(angle).mul(p.z)).add(side.x.mul(local.x).mul(1.5)).add(forward.x.mul(lz).mul(1.5)), height.add(ly.mul(1.5)), p.y.add(sin(angle).mul(p.z)).add(side.y.mul(local.x).mul(1.5)).add(forward.y.mul(lz).mul(1.5)));
  const color: N = attribute('color', 'vec3');
  material.colorNode = applyFog(color.pow(vec3(2.2)).mul(skyLight.mul(0.8).add(sunLight.mul(0.5))), positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = data.length / 4;
  mesh.frustumCulled = false;
  mesh.name = 'dolphins';
  return mesh;
}

function rotors(masts: { x: number; y: number; z: number; yaw: number }[]): THREE.Mesh {
  const s = new Sculpt(49);
  s.jitter = 0;
  const white: RGB = [0.95, 0.95, 0.93];
  for (let k = 0; k < 3; k++) {
    s.push(0, 0, 0).tilt(0, (k / 3) * Math.PI * 2);
    s.box(0, 9.5, 0, 1.5, 19, 0.3, white, 0.25);
    s.pop();
  }
  s.cylinder(0, -0.8, 0, 1.1, 1.1, 1.6, 8, white);
  const geometry = s.geometry();
  const data = new Float32Array(masts.length * 4);
  masts.forEach((m, i) => data.set([m.x, m.y, m.z, m.yaw], i * 4));
  geometry.setAttribute('mast', new THREE.InstancedBufferAttribute(data, 4));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const m: N = attribute('mast', 'vec4');
  const local: N = positionGeometry;
  const spin = time.mul(0.9).add(m.x.mul(0.37));
  const rx = local.x.mul(cos(spin)).sub(local.y.mul(sin(spin)));
  const ry = local.x.mul(sin(spin)).add(local.y.mul(cos(spin)));
  material.positionNode = vec3(m.x.add(cos(m.w).mul(rx)).add(sin(m.w).mul(local.z.add(1.6))), m.y.add(ry), m.z.sub(sin(m.w).mul(rx)).add(cos(m.w).mul(local.z.add(1.6))));
  const color: N = attribute('color', 'vec3');
  material.colorNode = applyFog(color.pow(vec3(2.2)).mul(skyLight.mul(0.8).add(sunLight.mul(0.7))), positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = masts.length;
  mesh.frustumCulled = false;
  mesh.name = 'rotors';
  return mesh;
}

function blueFlame(x: number, y: number, z: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const local: N = positionGeometry;
  const toCamera = cameraPosition.sub(vec3(x, y, z)).normalize();
  const right = vec3(toCamera.z, 0, toCamera.x.negate()).normalize();
  material.positionNode = vec3(x, y, z).add(right.mul(local.x.mul(2.2))).add(vec3(0, local.y.add(0.5).mul(3.2), 0));
  const at: N = uv();
  const lick = noise(vec2(at.x.mul(0.35), at.y.mul(0.3).sub(time.mul(0.5)))).r;
  const shape = smoothstep(0.5, 0.1, at.x.sub(0.5).abs().add(at.y.mul(0.35))).mul(smoothstep(1, 0.2, at.y.add(lick.mul(0.5)).sub(0.25)));
  material.colorNode = mix(vec3(0.15, 0.4, 1.0), vec3(0.7, 0.95, 1.0), smoothstep(0.5, 0, at.y)).mul(2.4);
  material.opacityNode = shape.mul(smoothstep(0.2, 0.7, env.night));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  return mesh;
}

function figure(s: Sculpt, shirt: RGB, skin: RGB): void {
  s.box(-0.13, 0.42, 0, 0.2, 0.84, 0.22, [0.2, 0.2, 0.26]);
  s.box(0.13, 0.42, 0, 0.2, 0.84, 0.22, [0.2, 0.2, 0.26]);
  s.box(0, 1.2, 0, 0.52, 0.74, 0.3, shirt);
  s.box(-0.33, 1.2, 0, 0.14, 0.64, 0.2, shirt);
  s.box(0.33, 1.2, 0, 0.14, 0.64, 0.2, shirt);
  s.box(0, 1.76, 0, 0.34, 0.36, 0.34, skin);
}

export class Galicia {
  readonly group = new THREE.Group();
  readonly things: Thing[] = [];
  private solid: { x: number; z: number; r: number }[] = [];

  reserved = (x: number, z: number): boolean => this.solid.some((c) => Math.hypot(c.x - x, c.z - z) < c.r);

  constructor(map: HeightMap, obstacles: Obstacles, free: (x: number, z: number) => boolean, houses: { x: number; z: number; yaw: number }[], plaza: { x: number; z: number }, chapel: { x: number; z: number }, summit: { x: number; z: number }, paths: [number, number][][], amount: number) {
    this.group.name = 'galicia';
    const rand = mulberry32(1906);
    const s = new Sculpt(1907);
    const ground = (x: number, z: number) => Math.max(map.sample(x, z), 0);
    const flat = (x: number, z: number, low: number, high: number, slope: number) => {
      const h = map.sample(x, z);
      return h > low && h < high && map.slope(x, z) < slope && free(x, z);
    };
    const find = (ok: (x: number, z: number) => boolean, span = 2500): { x: number; z: number } | null => {
      for (let guard = 0; guard < 4000; guard++) {
        const x = (rand() - 0.5) * span;
        const z = (rand() - 0.5) * span;
        if (ok(x, z)) return { x, z };
      }
      return null;
    };
    const taken: { x: number; z: number; r: number }[] = [];
    const clear = (x: number, z: number, r: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
    const claim = (x: number, z: number, r: number, keep = 0) => {
      taken.push({ x, z, r });
      if (keep > 0) this.solid.push({ x, z, r: keep });
    };
    const add = (id: ThingId, x: number, z: number, up: number, reach: number, night = false) => this.things.push({ id, x, y: ground(x, z) + up, z, reach, night });
    const roamsAround = (cx: number, cz: number, count: number, spread: number, reach: number, low: number, high: number): Roam[] => {
      const list: Roam[] = [];
      for (let guard = 0; guard < 400 && list.length < count; guard++) {
        const ax = cx + (rand() - 0.5) * spread;
        const az = cz + (rand() - 0.5) * spread;
        const angle = rand() * Math.PI * 2;
        const bx = ax + Math.cos(angle) * reach * (0.5 + rand());
        const bz = az + Math.sin(angle) * reach * (0.5 + rand());
        let fine = true;
        for (let k = 0; k <= 4; k++) if (!flat(ax + ((bx - ax) * k) / 4, az + ((bz - az) * k) / 4, low, high, 0.09)) fine = false;
        if (fine) list.push({ ax, az, bx, bz });
      }
      return list;
    };

    const cows: Roam[] = [];
    const horned: Roam[] = [];
    let firstHerd = true;
    for (let k = 0; k < Math.round(9 * amount); k++) {
      const spot = find((x, z) => flat(x, z, 5, 55, 0.06) && clear(x, z, 60) && Math.hypot(x, z) < 1150);
      if (!spot) break;
      claim(spot.x, spot.z, 60, 26);
      const members = roamsAround(spot.x, spot.z, 6 + Math.floor(rand() * 5), 38, 9, 4, 60);
      (k % 4 === 3 ? horned : cows).push(...members);
      if (firstHerd && members.length > 2) {
        add('vacas', spot.x, spot.z, 4, 46);
        firstHerd = false;
      }
    }
    if (cows.length) this.group.add(herd(cow([0.6, 0.43, 0.3], 0.06), cows, 51, 0.5, 2.2, 0.72));
    if (horned.length) this.group.add(herd(cow([0.36, 0.26, 0.2], 0.34), horned, 52, 0.5, 2.2, 0.72));

    const ponies: Roam[] = [];
    for (let k = 0; k < Math.round(4 * amount); k++) {
      const spot = find((x, z) => flat(x, z, 38, 135, 0.16) && clear(x, z, 70) && Math.hypot(x - summit.x, z - summit.z) > 60);
      if (!spot) break;
      claim(spot.x, spot.z, 70, 28);
      const members = roamsAround(spot.x, spot.z, 4 + Math.floor(rand() * 3), 50, 30, 30, 150);
      ponies.push(...members);
      if (k === 0 && members.length) add('bestas', spot.x, spot.z, 4, 50);
    }
    if (ponies.length) {
      this.group.add(herd(pony([0.36, 0.24, 0.16]), ponies.filter((_, i) => i % 2 === 0), 53, 2.4, 1.5, 0.8));
      this.group.add(herd(pony([0.16, 0.13, 0.12]), ponies.filter((_, i) => i % 2 === 1), 54, 2.4, 1.5, 0.8));
    }

    const hens: Roam[] = [];
    const dogs: Roam[] = [];
    houses.forEach((h, i) => {
      if (i % 2 === 0) hens.push(...roamsAround(h.x, h.z, 3, 26, 5, 1.5, 80));
      if (i % 5 === 0) dogs.push(...roamsAround(h.x, h.z, 1, 30, 16, 1.5, 80));
    });
    if (hens.length) {
      this.group.add(herd(hen([0.92, 0.9, 0.84]), hens.filter((_, i) => i % 2 === 0), 55, 0.7, 9, 0.2));
      this.group.add(herd(hen([0.62, 0.34, 0.16]), hens.filter((_, i) => i % 2 === 1), 56, 0.7, 9, 0.2));
    }
    if (dogs.length) this.group.add(herd(hound(), dogs, 57, 1.6, 3.2, 0.48));

    const meadow: number[] = [];
    const glow: number[] = [];
    for (let guard = 0; guard < 30000 && meadow.length < Math.round(520 * amount) * 4; guard++) {
      const x = (rand() - 0.5) * 2500;
      const z = (rand() - 0.5) * 2500;
      if (!flat(x, z, 3, 90, 0.14)) continue;
      for (let k = 0; k < 4; k++) meadow.push(x + (rand() - 0.5) * 9, 0.5 + rand() * 1.4, z + (rand() - 0.5) * 9, rand());
    }
    for (let guard = 0; guard < 30000 && glow.length < Math.round(900 * amount) * 4; guard++) {
      const x = (rand() - 0.5) * 2500;
      const z = (rand() - 0.5) * 2500;
      const h = map.sample(x, z);
      if (h < 1.5 || h > 110 || !free(x, z)) continue;
      for (let k = 0; k < 5; k++) glow.push(x + (rand() - 0.5) * 22, 0.5 + rand() * 4, z + (rand() - 0.5) * 22, rand());
    }
    this.group.add(flutter(meadow, false), flutter(glow, true));

    for (let guard = 0, made = 0; guard < 20000 && made < Math.round(340 * amount); guard++) {
      const x = (rand() - 0.5) * 2700;
      const z = (rand() - 0.5) * 2700;
      const h = map.sample(x, z);
      if (h < 12 || h > 150 || map.slope(x, z) > 0.2 || !free(x, z)) continue;
      const coast = Math.min(map.sample(x + 45, z), map.sample(x - 45, z), map.sample(x, z + 45), map.sample(x, z - 45)) < 1;
      if (!coast && h < 62) continue;
      made++;
      if (made === 1) add('toxo', x, z, 3, 26);
      for (let k = 0; k < 3; k++) {
        const bx = x + (rand() - 0.5) * 7;
        const bz = z + (rand() - 0.5) * 7;
        const r = 0.9 + rand() * 1.1;
        const by = map.sample(bx, bz) - 0.2;
        s.dome(bx, by, bz, r, r * 0.85, 6, [0.17 + rand() * 0.05, 0.31 + rand() * 0.06, 0.15]);
        for (let f = 0; f < 5; f++) {
          const a = rand() * 6.28;
          const d = rand() * r * 0.7;
          s.box(bx + Math.cos(a) * d, by + r * 0.85 * (1 - (d / r) * (d / r) * 0.6), bz + Math.sin(a) * d, 0.3, 0.2, 0.3, [0.98, 0.84, 0.12]);
        }
      }
    }

    houses.forEach((h, i) => {
      const side = (sx: number, sz: number): [number, number] => [h.x + Math.cos(h.yaw) * sx + Math.sin(h.yaw) * sz, h.z - Math.sin(h.yaw) * sx + Math.cos(h.yaw) * sz];
      if (i % 2 === 0) {
        for (let k = 0; k < 4; k++) {
          const [x, z] = side(-3.2 + k * 2.1, 4.6);
          const r = 0.65 + rand() * 0.3;
          s.dome(x, map.sample(x, z), z, r * 1.1, r * 0.7, 6, [0.2, 0.42, 0.22]);
          s.dome(x, map.sample(x, z) + r * 0.45, z, r, r * 0.8, 6, rand() < 0.6 ? [0.36, 0.5, 0.95] : [0.92, 0.5, 0.75]);
        }
        if (i === 0) add('hortensias', h.x, h.z, 3, 22);
      }
      if (i % 3 === 1) {
        for (let row = 0; row < 3; row++) {
          for (let k = 0; k < 5; k++) {
            const [x, z] = side(6.5 + row * 1.2, -2.4 + k * 1.2);
            if (!free(x, z) && map.sample(x, z) < 2) continue;
            const y = map.sample(x, z);
            const tall = 1.1 + rand() * 0.7;
            s.box(x, y + tall / 2, z, 0.1, tall, 0.1, [0.62, 0.66, 0.5]);
            s.dome(x, y + tall - 0.1, z, 0.42, 0.34, 5, [0.3, 0.52, 0.34]);
          }
        }
      }
    });

    for (let k = 0; k < 9; k++) {
      const spot = find((x, z) => flat(x, z, 4, 60, 0.07) && clear(x, z, 16) && Math.hypot(x - plaza.x, z - plaza.z) < 420 && Math.hypot(x - plaza.x, z - plaza.z) > 50);
      if (!spot) break;
      claim(spot.x, spot.z, 16, 4);
      const y = map.sample(spot.x, spot.z);
      s.cylinder(spot.x, y, spot.z, 0.12, 0.1, 4.6, 5, WOOD);
      s.cylinder(spot.x, y + 0.3, spot.z, 1.9, 0.25, 3.7, 9, STRAW);
      s.cylinder(spot.x, y, spot.z, 1.75, 1.9, 0.3, 9, [0.74, 0.62, 0.32]);
      obstacles.add(spot.x, spot.z, 1.7, y - 1, y + 4);
      if (k === 0) add('palleiro', spot.x, spot.z, 3, 20);
    }

    for (let k = 0, made = 0; k < 4000 && made < 7; k++) {
      const x = (rand() - 0.5) * 2200;
      const z = (rand() - 0.5) * 2200;
      const h = map.sample(x, z);
      if (h > -4 || h < -22 || Math.hypot(x, z) > 1050 || !clear(x, z, 90)) continue;
      let shores = 0;
      for (let a = 0; a < 8; a++) if (map.sample(x + Math.cos(a * 0.785) * 170, z + Math.sin(a * 0.785) * 170) > 1) shores++;
      let wet = true;
      for (let a = 0; a < 8; a++) if (map.sample(x + Math.cos(a * 0.785) * 16, z + Math.sin(a * 0.785) * 16) > -2.5) wet = false;
      if (shores < 3 || !wet) continue;
      claim(x, z, 90);
      made++;
      s.push(x, 0.5, z, rand() * 3.14);
      for (let i = -3; i <= 3; i++) s.box(i * 2.2, 0.5, 0, 0.3, 0.3, 11, WOOD);
      for (let i = -2; i <= 2; i++) s.box(0, 0.75, i * 2.4, 14, 0.26, 0.3, [0.3, 0.21, 0.15]);
      for (const [fx, fz] of [[-5, -3.6], [5, -3.6], [-5, 3.6], [5, 3.6], [0, 0]]) s.cylinder(fx, -0.5, fz, 1.1, 1.1, 0.9, 8, [0.2, 0.3, 0.42]);
      for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) s.box(i * 2.2, -0.9, j * 2.4, 0.12, 2.4, 0.12, [0.12, 0.12, 0.14]);
      s.box(4.2, 1.5, 3.4, 2, 1.4, 1.6, [0.86, 0.84, 0.78]);
      s.pop();
      if (made === 1) add('batea', x, z, 4, 30);
    }

    const stone = (id: ThingId, ok: (x: number, z: number) => boolean, r: number, build: (x: number, y: number, z: number) => void, up = 3, reach = 20) => {
      const spot = find((x, z) => ok(x, z) && clear(x, z, r));
      if (!spot) return;
      claim(spot.x, spot.z, r, r * 0.6);
      build(spot.x, map.sample(spot.x, spot.z), spot.z);
      add(id, spot.x, spot.z, up, reach);
    };

    stone('anta', (x, z) => flat(x, z, 18, 70, 0.05) && Math.hypot(x, z) < 1000, 26, (x, y, z) => {
      s.dome(x, y - 0.6, z, 7, 1.6, 10, [0.36, 0.48, 0.24]);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 1.7 + 0.5;
        s.push(x + Math.cos(a) * 2.4, y + 0.5, z + Math.sin(a) * 2.4, -a).tilt(0.12, 0);
        s.box(0, 1.2, 0, 0.5, 2.6, 1.7, k % 2 ? GRANITE : GRANITE_DARK);
        s.pop();
      }
      s.push(x, y + 3.2, z, 0.4).tilt(0.07, 0.05);
      s.box(0, 0, 0, 6.2, 0.7, 5.2, GRANITE);
      s.pop();
      obstacles.add(x, z, 3.4, y - 1, y + 4);
    });

    stone('castro', (x, z) => flat(x, z, 16, 60, 0.07) && Math.min(map.sample(x + 70, z), map.sample(x - 70, z), map.sample(x, z + 70), map.sample(x, z - 70)) < 0 && Math.hypot(x - plaza.x, z - plaza.z) > 350, 40, (x, y, z) => {
      const hut = (hx: number, hz: number, r: number) => {
        const hy = map.sample(hx, hz);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          if (k === 0) continue;
          s.push(hx + Math.cos(a) * r, hy, hz + Math.sin(a) * r, -a + Math.PI / 2);
          s.box(0, 0.55, 0, r * 0.56, 1.3 + (k % 3) * 0.14, 0.6, k % 2 ? GRANITE : GRANITE_DARK);
          s.pop();
        }
      };
      hut(x, z, 3.6);
      for (let k = 0; k < 6; k++) {
        const a = k * 1.05 + 0.3;
        hut(x + Math.cos(a) * (9.5 + (k % 2) * 3), z + Math.sin(a) * (9.5 + (k % 2) * 3), 2.2 + (k % 3) * 0.5);
      }
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        if (k % 20 === 0) continue;
        const wx = x + Math.cos(a) * 20;
        const wz = z + Math.sin(a) * 20;
        s.push(wx, map.sample(wx, wz), wz, -a + Math.PI / 2);
        s.box(0, 0.5, 0, 3.3, 1.4, 1.1, k % 2 ? GRANITE_DARK : GRANITE);
        s.pop();
      }
    }, 5, 30);

    stone('petroglifo', (x, z) => flat(x, z, 25, 110, 0.12) && Math.hypot(x, z) < 1000, 16, (x, y, z) => {
      s.push(x, y + 0.2, z, rand() * 3).tilt(0.16, 0.08);
      s.box(0, 0, 0, 7, 0.9, 5.4, [0.55, 0.53, 0.5]);
      for (const [cx, cz, rings] of [[-1.3, 0.2, 4], [1.6, -0.9, 3], [1.2, 1.3, 2]] as const) {
        for (let k = rings; k > 0; k--) s.cylinder(cx, 0.44 + (rings - k) * 0.012, cz, k * 0.42, k * 0.42, 0.03, 14, k % 2 ? [0.3, 0.29, 0.28] : [0.58, 0.56, 0.52]);
      }
      s.pop();
    }, 3, 16);

    stone('pedra', (x, z) => flat(x, z, 2.5, 14, 0.16) && Math.min(map.sample(x + 30, z), map.sample(x - 30, z), map.sample(x, z + 30), map.sample(x, z - 30)) < -1 && Math.hypot(x - chapel.x, z - chapel.z) < 700, 20, (x, y, z) => {
      s.box(x, y + 0.5, z, 2.2, 1.4, 1.8, GRANITE_DARK, 0.7);
      s.push(x, y + 1.6, z, 0.5).tilt(0.06, 0.03);
      s.box(0, 0, 0, 8.6, 1.0, 6.4, [0.66, 0.63, 0.58]);
      s.pop();
      obstacles.add(x, z, 4, y - 1, y + 2.4);
    }, 4, 22);

    const waymarks = paths.flatMap((path) => path.filter((_, i) => i % 2 === 1)).slice(0, 6);
    waymarks.forEach(([px, pz], i) => {
      const x = px + 5.5;
      const z = pz + 1.5;
      const y = map.sample(x, z);
      s.box(x, y + 0.6, z, 0.42, 1.2, 0.42, GRANITE, 0.86);
      s.box(x, y + 0.9, z + 0.2, 0.3, 0.3, 0.04, [0.12, 0.3, 0.72]);
      s.box(x, y + 0.9, z + 0.225, 0.14, 0.14, 0.03, [0.98, 0.84, 0.1]);
      s.box(x, y + 0.5, z + 0.2, 0.2, 0.08, 0.04, [0.98, 0.84, 0.1]);
      if (i === 0) add('marco', x, z, 2, 13);
    });

    const near = (cx: number, cz: number, low: number, high: number, r: number) => map.findLand(cx, cz, low, high, 90, (x, z) => free(x, z) && clear(x, z, r));
    {
      const p = near(chapel.x + 26, chapel.z + 22, 2, 90, 6);
      claim(p.x, p.z, 6, 4);
      const y = map.sample(p.x, p.z);
      s.box(p.x, y + 0.2, p.z, 1.5, 0.4, 1.3, GRANITE_DARK);
      s.box(p.x, y + 1.2, p.z, 1.0, 1.7, 0.8, GRANITE);
      s.box(p.x, y + 1.35, p.z + 0.36, 0.6, 0.8, 0.1, [0.16, 0.12, 0.12]);
      s.box(p.x, y + 1.25, p.z + 0.4, 0.34, 0.4, 0.06, [0.85, 0.3, 0.16]);
      s.gable(p.x, y + 2.05, p.z, 1.3, 0.5, 1.1, GRANITE_DARK, GRANITE);
      s.box(p.x, y + 2.9, p.z, 0.1, 0.7, 0.1, GRANITE);
      s.box(p.x, y + 3.0, p.z, 0.4, 0.1, 0.1, GRANITE);
      add('peto', p.x, p.z, 2, 13);
    }
    {
      const p = near(plaza.x - 60, plaza.z + 50, 2, 60, 10);
      claim(p.x, p.z, 10, 8);
      const y = map.sample(p.x, p.z);
      s.push(p.x, y, p.z, 0.6);
      s.box(0, 0.35, 0, 7, 0.7, 3.6, GRANITE);
      s.box(0, 0.62, 0, 6.2, 0.2, 2.6, [0.3, 0.5, 0.62]);
      s.push(0, 0.72, 1.7).tilt(0.5, 0);
      s.box(0, 0, 0, 6.6, 0.14, 1.0, GRANITE_DARK);
      s.pop();
      for (const [px, pz] of [[-3.4, -2], [3.4, -2], [-3.4, 2.4], [3.4, 2.4]]) s.box(px, 1.6, pz, 0.3, 3.2, 0.3, GRANITE);
      s.gable(0, 3.2, 0.2, 5.6, 1.1, 8, [0.62, 0.3, 0.2], WOOD);
      s.pop();
      obstacles.add(p.x, p.z, 4, y - 1, y + 4.6);
      add('lavadoiro', p.x, p.z, 4, 18);
    }
    {
      const p = near(plaza.x + 6, plaza.z + 8, 2, 60, 5);
      claim(p.x, p.z, 7, 9);
      const y = map.sample(p.x, p.z);
      s.push(p.x, y, p.z, 1.1);
      s.cylinder(0, 0, 0, 0.75, 0.9, 1.0, 9, [0.72, 0.4, 0.2]);
      s.cylinder(0, 1.0, 0, 0.86, 0.86, 0.05, 9, [0.5, 0.2, 0.3]);
      s.box(2.2, 0.75, 0, 2.6, 0.1, 1.2, [0.62, 0.45, 0.28]);
      for (const [lx, lz] of [[1.1, -0.5], [3.3, -0.5], [1.1, 0.5], [3.3, 0.5]]) s.box(lx, 0.36, lz, 0.1, 0.72, 0.1, WOOD);
      for (let k = 0; k < 3; k++) {
        s.cylinder(1.4 + k * 0.8, 0.8, 0, 0.32, 0.32, 0.05, 9, [0.74, 0.56, 0.36]);
        s.cylinder(1.4 + k * 0.8, 0.85, 0, 0.22, 0.22, 0.03, 7, [0.78, 0.3, 0.3]);
      }
      s.push(-0.2, 0, -1.3, 0.2);
      figure(s, [0.9, 0.9, 0.86], [0.93, 0.76, 0.62]);
      s.box(0, 1.1, 0.17, 0.5, 0.7, 0.04, [0.3, 0.3, 0.36]);
      s.pop();
      s.push(5.2, 0, 1.6, -1.2);
      figure(s, [0.2, 0.2, 0.24], [0.9, 0.72, 0.58]);
      s.box(0.22, 1.25, 0.2, 0.36, 0.42, 0.3, [0.7, 0.12, 0.14]);
      s.box(0.3, 1.85, 0.1, 0.07, 0.9, 0.07, WOOD);
      s.box(0.42, 1.7, 0.1, 0.06, 0.6, 0.06, WOOD);
      s.box(0.1, 1.0, 0.36, 0.06, 0.5, 0.06, WOOD);
      s.box(0, 1.98, 0, 0.44, 0.1, 0.44, [0.14, 0.14, 0.16]);
      s.pop();
      s.pop();
      add('polbo', p.x, p.z, 3, 11);
      add('gaiteiro', p.x + 4.2, p.z - 4.2, 3, 8);
    }
    {
      const p = near(chapel.x - 60, chapel.z - 70, 3, 90, 8);
      claim(p.x, p.z, 10, 7);
      const y = map.sample(p.x, p.z);
      s.cylinder(p.x, y, p.z, 0.5, 0.95, 0.7, 9, [0.5, 0.3, 0.2]);
      s.cylinder(p.x, y + 0.66, p.z, 0.84, 0.84, 0.04, 9, [0.16, 0.3, 0.6]);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.4;
        s.push(p.x + Math.cos(a) * 3, y, p.z + Math.sin(a) * 3, -a - Math.PI / 2);
        s.cylinder(0, 0, 0, 0.62, 0.2, 1.9, 7, [0.1, 0.09, 0.12]);
        s.box(0, 1.84, 0.1, 0.3, 0.3, 0.3, [0.85, 0.72, 0.6]);
        s.cylinder(0, 1.9, 0, 0.36, 0.02, 0.8, 7, [0.1, 0.09, 0.12]);
        s.pop();
      }
      this.group.add(blueFlame(p.x, y + 0.7, p.z));
      add('queimada', p.x, p.z, 3, 18, true);
    }

    const masts: { x: number; y: number; z: number; yaw: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const spot = find((x, z) => flat(x, z, 50, 150, 0.34) && clear(x, z, 55) && Math.hypot(x - summit.x, z - summit.z) > 90 && Math.hypot(x - summit.x, z - summit.z) < 800);
      if (!spot) break;
      claim(spot.x, spot.z, 55, 5);
      const y = map.sample(spot.x, spot.z);
      s.cylinder(spot.x, y - 1, spot.z, 1.5, 0.8, 47, 8, [0.94, 0.94, 0.92]);
      s.box(spot.x, y + 46.4, spot.z, 1.9, 1.8, 4.4, [0.92, 0.92, 0.9]);
      masts.push({ x: spot.x, y: y + 46.4, z: spot.z, yaw: 2.2 });
      obstacles.add(spot.x, spot.z, 1.6, y - 2, y + 48);
      if (k === 0) add('eolicos', spot.x, spot.z, 30, 60);
    }
    if (masts.length) this.group.add(rotors(masts));

    {
      const spot = find((x, z) => {
        const h = map.sample(x, z);
        return h > 1.2 && h < 5 && Math.hypot(x, z) > 900 && map.sample(x - 14, z - 14) < -3 && clear(x, z, 12);
      }, 2900);
      if (spot) {
        const y = map.sample(spot.x, spot.z);
        s.push(spot.x, y, spot.z, rand() * 6);
        figure(s, [0.95, 0.5, 0.1], [0.9, 0.72, 0.58]);
        s.box(0, 1.98, 0, 0.38, 0.12, 0.38, [0.95, 0.85, 0.2]);
        s.box(0.42, 0.9, 0.3, 0.05, 1.3, 0.05, [0.3, 0.3, 0.32]);
        s.pop();
        for (let k = 0; k < 9; k++) {
          const a = rand() * 6.28;
          const d = 1.2 + rand() * 2.2;
          const bx = spot.x + Math.cos(a) * d;
          const bz = spot.z + Math.sin(a) * d;
          s.box(bx, map.sample(bx, bz) + 0.12, bz, 0.3, 0.3, 0.3, [0.16, 0.15, 0.17]);
          s.box(bx, map.sample(bx, bz) + 0.3, bz, 0.16, 0.08, 0.16, [0.8, 0.2, 0.16]);
        }
        add('percebeiro', spot.x, spot.z, 3, 18);
      }
    }

    for (let k = 0, made = 0; k < 6000 && made < 5; k++) {
      const x = (rand() - 0.5) * 3000;
      const z = (rand() - 0.5) * 3000;
      const h = map.sample(x, z);
      if (h < 2 || h > 9 || Math.hypot(x, z) < 950 || !clear(x, z, 40) || map.sample(x + 18, z) > 0 && map.sample(x - 18, z) > 0 && map.sample(x, z + 18) > 0 && map.sample(x, z - 18) > 0) continue;
      claim(x, z, 40);
      made++;
      s.push(x, h, z, rand() * 6);
      const black: RGB = [0.08, 0.09, 0.1];
      s.box(0, 0.5, 0, 0.36, 0.8, 0.4, black);
      s.box(0, 1.1, 0.06, 0.16, 0.5, 0.16, black);
      s.box(0, 1.4, 0.16, 0.16, 0.16, 0.3, black);
      s.box(0, 1.38, 0.38, 0.06, 0.06, 0.2, [0.9, 0.7, 0.2]);
      s.push(0.2, 0.8, 0).tilt(0, -0.5);
      s.box(0.5, 0, 0, 1.0, 0.06, 0.5, black);
      s.pop();
      s.push(-0.2, 0.8, 0).tilt(0, 0.5);
      s.box(-0.5, 0, 0, 1.0, 0.06, 0.5, black);
      s.pop();
      s.pop();
      if (made === 1) add('corvo', x, z, 3, 20);
    }

    const pods: { x: number; z: number; radius: number }[] = [];
    for (let k = 0, guard = 0; guard < 4000 && k < 3; guard++) {
      const a = rand() * Math.PI * 2;
      const d = 1150 + rand() * 350;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      let deep = map.sample(x, z) < -20;
      for (let j = 0; j < 8 && deep; j++) if (map.sample(x + Math.cos(j * 0.785) * 75, z + Math.sin(j * 0.785) * 75) > -12) deep = false;
      if (!deep || pods.some((p) => Math.hypot(p.x - x, p.z - z) < 500)) continue;
      pods.push({ x, z, radius: 46 + rand() * 20 });
      if (k === 0) this.things.push({ id: 'arroaces', x, y: 4, z, reach: 80 });
      k++;
    }
    if (pods.length) this.group.add(dolphins(pods));

    this.group.add(murmuration(-520, 105, 420, Math.round(420 * amount)));

    const set = new THREE.Mesh(s.geometry(), sculptMaterial(true));
    set.frustumCulled = false;
    set.name = 'galicia-set';
    this.group.add(set);
  }
}
