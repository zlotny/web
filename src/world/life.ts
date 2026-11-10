import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, cos, float, fract, hash, instanceIndex, mix, mod, positionGeometry, positionWorld, sin, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import { arcadeMaterial } from './arcade';
import { Sculpt, type RGB } from './sculpt';
import { createSigns } from './signs';
import { applyFog, env, groundHeight, noise, paint, type N } from './shading';

export interface Flock {
  x: number;
  y: number;
  z: number;
  radius: number;
  count: number;
}

export function createGulls(flocks: Flock[]): THREE.Mesh {
  const rand = mulberry32(606);
  const positions = [0, 0, 0.32, 0.07, 0, -0.1, -0.07, 0, -0.1, 0.05, 0.02, 0.12, 1.15, 0.05, -0.1, 0.05, 0.02, -0.14, -0.05, 0.02, 0.12, -0.05, 0.02, -0.14, -1.15, 0.05, -0.1];
  const wing = [0, 0, 0, 0, 1, 0, 0, 0, 1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('wing', new THREE.Float32BufferAttribute(wing, 1));
  const orbit: number[] = [];
  const motion: number[] = [];
  for (const flock of flocks) {
    for (let i = 0; i < flock.count; i++) {
      orbit.push(flock.x + (rand() - 0.5) * flock.radius * 0.6, flock.y + rand() * 26, flock.z + (rand() - 0.5) * flock.radius * 0.6, flock.radius * (0.35 + rand() * 0.75));
      motion.push(rand() * 6.28, (rand() < 0.5 ? -1 : 1) * (7 + rand() * 5), 0.8 + rand() * 0.7, rand());
    }
  }
  geometry.setAttribute('orbit', new THREE.InstancedBufferAttribute(new Float32Array(orbit), 4));
  geometry.setAttribute('motion', new THREE.InstancedBufferAttribute(new Float32Array(motion), 4));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const o: N = attribute('orbit', 'vec4');
  const m: N = attribute('motion', 'vec4');
  const local: N = positionGeometry;
  const tip: N = attribute('wing', 'float');
  const angle = m.x.add(time.mul(m.y).div(o.w));
  const way = m.y.sign();
  const forward = vec2(sin(angle).negate(), cos(angle)).mul(way);
  const glide = smoothstep(0.55, 0.75, sin(time.mul(0.4).add(m.w.mul(20))));
  const beat = sin(time.mul(9).mul(m.z).add(m.x.mul(7))).mul(glide.oneMinus()).mul(0.55).add(0.12);
  const scaled = local.mul(m.z.mul(1.7));
  const lifted = scaled.y.add(tip.mul(beat).mul(1.15).mul(m.z.mul(1.7)));
  const side = vec2(forward.y, forward.x.negate());
  const world = vec3(
    o.x.add(cos(angle).mul(o.w)).add(side.x.mul(scaled.x)).add(forward.x.mul(scaled.z)),
    o.y.add(sin(time.mul(0.3).add(m.x)).mul(4)).add(lifted),
    o.z.add(sin(angle).mul(o.w)).add(side.y.mul(scaled.x)).add(forward.y.mul(scaled.z)),
  );
  material.positionNode = world;
  const tone = mix(vec3(0.96, 0.96, 0.94), vec3(0.3, 0.32, 0.36), tip.mul(smoothstep(0.6, 1, local.x.abs())));
  material.colorNode = applyFog(tone.pow(vec3(2.2)).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.5))), positionWorld);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = orbit.length / 4;
  mesh.frustumCulled = false;
  mesh.name = 'gulls';
  return mesh;
}

export interface Walk {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  lift?: number;
}

function person(shirt: RGB, skin: RGB, hat: boolean): THREE.BufferGeometry {
  const s = new Sculpt(9);
  s.jitter = 0;
  s.box(-0.13, 0.42, 0, 0.2, 0.84, 0.22, [0.22, 0.24, 0.36]);
  s.box(0.13, 0.42, 0, 0.2, 0.84, 0.22, [0.22, 0.24, 0.36]);
  s.box(0, 1.2, 0, 0.52, 0.74, 0.3, shirt);
  s.box(-0.33, 1.2, 0, 0.14, 0.64, 0.2, shirt);
  s.box(0.33, 1.2, 0, 0.14, 0.64, 0.2, shirt);
  s.box(0, 1.76, 0, 0.34, 0.36, 0.34, skin);
  if (hat) {
    s.box(0, 1.98, 0, 0.6, 0.06, 0.6, [0.82, 0.72, 0.42]);
    s.box(0, 2.06, 0, 0.34, 0.14, 0.34, [0.82, 0.72, 0.42]);
  } else {
    s.box(0, 1.97, -0.02, 0.38, 0.1, 0.38, [0.18, 0.13, 0.1]);
  }
  return s.geometry();
}

export function createWalkers(walks: Walk[], seed: number, glow = 0): THREE.Group {
  const group = new THREE.Group();
  group.name = 'walkers';
  const rand = mulberry32(seed);
  const shirts: RGB[] = [
    [0.75, 0.25, 0.2],
    [0.2, 0.42, 0.66],
    [0.9, 0.82, 0.6],
    [0.3, 0.55, 0.35],
    [0.8, 0.6, 0.2],
    [0.55, 0.35, 0.6],
  ];
  const skins: RGB[] = [
    [0.93, 0.76, 0.62],
    [0.8, 0.6, 0.46],
    [0.62, 0.44, 0.33],
  ];
  const kinds = 6;
  for (let k = 0; k < kinds; k++) {
    const mine = walks.filter((_, i) => i % kinds === k);
    if (!mine.length) continue;
    const geometry = person(shirts[k], skins[k % 3], k % 3 === 0 && !glow);
    const path = new Float32Array(mine.length * 4);
    const pace = new Float32Array(mine.length * 4);
    mine.forEach((walk, i) => {
      path.set([walk.ax, walk.az, walk.bx, walk.bz], i * 4);
      pace.set([rand(), 1 + rand() * 0.5, walk.lift ?? -1000, 0.85 + rand() * 0.3], i * 4);
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
    const t = phase.mul(2).sub(1).abs().oneMinus();
    const turn = float(1).sub(phase.step(0.5).mul(2));
    const dir = span.div(long).mul(turn);
    const at: N = a.xy.add(span.mul(t));
    const base = p.z.greaterThan(-900).select(p.z, groundHeight(at));
    const stride = time.mul(7).mul(p.y).add(p.x.mul(40));
    const leg = smoothstep(0.9, 0, local.y).mul(sin(stride)).mul(local.x.sign()).mul(0.22);
    const lx = local.x.mul(p.w);
    const lz = local.z.add(leg).mul(p.w);
    material.positionNode = vec3(at.x.add(dir.y.mul(lx)).add(dir.x.mul(lz)), base.add(local.y.mul(p.w)).add(sin(stride.mul(2)).abs().mul(0.04)), at.y.sub(dir.x.mul(lx)).add(dir.y.mul(lz)));
    const color: N = attribute('color', 'vec3');
    const lit = paint(color, vec3(0, 1, 0), positionWorld, float(1), 0.8, false);
    material.colorNode = applyFog(glow ? lit.add(color.mul(color).mul(glow)) : lit, positionWorld);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.count = mine.length;
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

export class Motes {
  readonly mesh: THREE.Mesh;
  readonly tint = uniform(new THREE.Color(1, 0.95, 0.7));
  readonly rise = uniform(0.15);
  readonly square = uniform(0);
  readonly stretch = uniform(1);
  readonly amount = uniform(1);
  readonly glint = uniform(1);

  private clock: { value: number };

  update(dt: number): void {
    this.clock.value += this.rise.value * dt;
  }

  constructor(count: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const index: N = instanceIndex;
    const seed = vec3(hash(index), hash(index.add(977)), hash(index.add(2311)));
    const box = vec3(90, 46, 90);
    const clock = uniform(0);
    this.clock = clock;
    const drift = vec3(env.wind.x.mul(1.4).mul(time), clock, env.wind.y.mul(1.4).mul(time));
    const wobble = vec3(sin(time.mul(0.7).add(seed.x.mul(40))), sin(time.mul(0.9).add(seed.y.mul(40))), cos(time.mul(0.6).add(seed.z.mul(40)))).mul(1.2);
    const cell = mod(seed.mul(box).add(drift).add(wobble).sub(cameraPosition), box).sub(box.mul(0.5));
    const center: N = cameraPosition.add(cell);
    const local: N = positionGeometry;
    const toCamera = cameraPosition.sub(center).normalize();
    const right = vec3(toCamera.z, 0, toCamera.x.negate()).normalize();
    const up = toCamera.cross(right);
    const size = seed.y.mul(0.1).add(0.07);
    material.positionNode = center.add(right.mul(local.x.mul(size))).add(up.mul(local.y.mul(size).mul(this.stretch)));
    const at: N = uv();
    const round = smoothstep(0.5, 0.1, at.sub(0.5).length());
    const shape = mix(round, float(1), this.square);
    const far = cell.length();
    const fade = smoothstep(46, 30, far).mul(smoothstep(1.5, 5, far));
    const twinkle = mix(float(1), sin(time.mul(2).add(seed.z.mul(60))).mul(0.4).add(0.6), this.glint);
    const tint: N = this.tint;
    material.colorNode = tint.mul(twinkle).mul(1.6);
    material.opacityNode = shape.mul(fade).mul(twinkle).mul(0.75).mul(this.amount);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 23;
    this.mesh.name = 'motes';
  }
}

export function createSmoke(sources: { x: number; y: number; z: number }[]): THREE.Mesh {
  const puffs = 7;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const data = new Float32Array(sources.length * puffs * 4);
  sources.forEach((source, i) => {
    for (let k = 0; k < puffs; k++) data.set([source.x, source.y, source.z, (k + (i * 0.37) % 1) / puffs], (i * puffs + k) * 4);
  });
  geometry.setAttribute('source', new THREE.InstancedBufferAttribute(data, 4));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const source: N = attribute('source', 'vec4');
  const local: N = positionGeometry;
  const age = fract(time.mul(0.11).add(source.w));
  const center: N = vec3(source.x.add(env.wind.x.mul(age).mul(7)).add(sin(age.mul(9).add(source.x)).mul(0.5)), source.y.add(age.mul(9)), source.z.add(env.wind.y.mul(age).mul(7)));
  const toCamera = cameraPosition.sub(center).normalize();
  const right = vec3(toCamera.z, 0, toCamera.x.negate()).normalize();
  const size = age.mul(3.4).add(0.7);
  material.positionNode = center.add(right.mul(local.x.mul(size))).add(vec3(0, local.y.mul(size), 0));
  const at: N = uv();
  const cloud = noise(at.mul(0.4).add(vec2(source.w.mul(3), age.mul(0.3)))).r;
  const round = smoothstep(0.5, 0.15, at.sub(0.5).length().add(cloud.sub(0.5).mul(0.3)));
  material.colorNode = applyFog(vec3(0.82, 0.82, 0.85).mul(env.ambientSky.mul(0.8).add(env.sunColor.mul(0.25))), center);
  material.opacityNode = round.mul(smoothstep(0, 0.1, age)).mul(smoothstep(1, 0.4, age)).mul(0.55);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = sources.length * puffs;
  mesh.frustumCulled = false;
  mesh.renderOrder = 13;
  mesh.name = 'smoke';
  return mesh;
}

export function createAurora(x: number, y: number, z: number, radius: number): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.86, 150, 96, 12, true);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const local: N = positionGeometry;
  const at: N = uv();
  const around = local.z.atan(local.x);
  const fold: N = sin(around.mul(6).add(time.mul(0.25))).mul(14).add(sin(around.mul(2).sub(time.mul(0.17))).mul(26));
  const out: N = vec2(local.x, local.z).normalize();
  material.positionNode = vec3(local.x.add(out.x.mul(fold)), local.y, local.z.add(out.y.mul(fold)));
  const band = noise(vec2(at.x.mul(3).add(time.mul(0.012)), at.y.mul(0.15).add(time.mul(0.02)))).r;
  const rays = noise(vec2(at.x.mul(14).sub(time.mul(0.02)), 0.3)).g;
  const curtain = smoothstep(0.0, 0.25, at.y).mul(float(1).sub(at.y).pow(1.6)).mul(smoothstep(0.3, 0.75, band.mul(0.6).add(rays.mul(0.6))));
  const tone = mix(vec3(0.1, 1.0, 0.6), vec3(0.75, 0.25, 1.0), at.y.add(band.sub(0.5).mul(0.6)));
  material.colorNode = tone.mul(curtain).mul(1.5);
  material.opacityNode = curtain.mul(0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.name = 'aurora';
  return mesh;
}

export function createFogBanks(spots: { x: number; y: number; z: number; size: number }[]): THREE.Mesh {
  const layers = 3;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const data = new Float32Array(spots.length * layers * 4);
  const extra = new Float32Array(spots.length * layers * 2);
  spots.forEach((spot, i) => {
    for (let k = 0; k < layers; k++) {
      data.set([spot.x, spot.y + k * spot.size * 0.035, spot.z, spot.size * (1 - k * 0.18)], (i * layers + k) * 4);
      extra.set([(i * 0.618 + k * 0.37) % 1, k], (i * layers + k) * 2);
    }
  });
  geometry.setAttribute('bank', new THREE.InstancedBufferAttribute(data, 4));
  geometry.setAttribute('roll', new THREE.InstancedBufferAttribute(extra, 2));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const bank: N = attribute('bank', 'vec4');
  const roll: N = attribute('roll', 'vec2');
  const local: N = positionGeometry;
  const slide = time.mul(0.6).add(roll.x.mul(300));
  const center: N = vec3(bank.x.add(env.wind.x.mul(sin(slide.mul(0.02)).mul(30))), bank.y, bank.z.add(env.wind.y.mul(sin(slide.mul(0.02)).mul(30))));
  const toCamera = vec3(cameraPosition.x.sub(center.x), 0, cameraPosition.z.sub(center.z)).normalize();
  const right = vec3(toCamera.z, 0, toCamera.x.negate());
  material.positionNode = center.add(right.mul(local.x.mul(bank.w))).add(vec3(0, local.y.add(0.4).mul(bank.w.mul(0.2)), 0)).add(toCamera.mul(roll.y.mul(14)));
  const at: N = uv();
  const billow = noise(vec2(at.x.mul(0.45).add(roll.x.mul(9)).add(time.mul(0.004)), at.y.mul(0.2).add(roll.y.mul(0.3)))).r;
  const wisp = noise(vec2(at.x.mul(1.3).sub(time.mul(0.006)), at.y.mul(0.5).add(roll.x))).b;
  const shape = smoothstep(0, 0.35, at.x).mul(smoothstep(1, 0.65, at.x)).mul(smoothstep(0, 0.2, at.y)).mul(smoothstep(1, 0.35, at.y));
  const away = cameraPosition.sub(center).length();
  const thin = smoothstep(bank.w.mul(0.12), bank.w.mul(0.55), away).mul(smoothstep(2600, 1100, away));
  material.colorNode = applyFog(vec3(0.93, 0.95, 0.97).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.28))), center);
  material.opacityNode = shape.mul(smoothstep(0.3, 0.72, billow.mul(0.75).add(wisp.mul(0.45)))).mul(thin).mul(0.42);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = spots.length * layers;
  mesh.frustumCulled = false;
  mesh.renderOrder = 15;
  mesh.name = 'fog';
  return mesh;
}

export function createRainbow(): THREE.Mesh {
  const level = uniform(0);
  const geometry = new THREE.RingGeometry(0.8, 1, 72, 1, 0, Math.PI);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const local: N = positionGeometry;
  const band = local.xy.length().sub(0.8).div(0.2);
  const hue = band.oneMinus().mul(0.8);
  const tone = vec3(sin(hue.mul(6.283)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(4.18)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(2.09)).mul(0.5).add(0.5));
  const soft = smoothstep(0, 0.25, band).mul(smoothstep(1, 0.75, band));
  const base = smoothstep(0.02, 0.3, local.y);
  material.colorNode = tone.mul(0.8);
  material.opacityNode = soft.mul(base).mul(level).mul(0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 18;
  mesh.name = 'rainbow';
  mesh.userData.level = level;
  return mesh;
}

export function createWorldEnd(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'world-end';
  const fall = new THREE.PlaneGeometry(9000, 520, 1, 1);
  const fallMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const at: N = uv();
  const streak = noise(vec2(at.x.mul(26), at.y.mul(0.7).add(time.mul(0.16)))).r.mul(0.6).add(noise(vec2(at.x.mul(90), at.y.mul(2.2).add(time.mul(0.33)))).g.mul(0.4));
  fallMaterial.colorNode = mix(vec3(0.03, 0.2, 0.42), vec3(0.9, 0.96, 1.0), smoothstep(0.42, 0.7, streak)).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.3)));
  fallMaterial.opacityNode = smoothstep(0, 0.5, at.y).mul(0.95);
  const wall = new THREE.Mesh(fall, fallMaterial);
  wall.rotation.y = Math.PI / 2;
  wall.position.set(-2700, -260, 0);
  wall.frustumCulled = false;
  wall.renderOrder = 9;

  const voidGeometry = new THREE.PlaneGeometry(14000, 14000, 1, 1);
  voidGeometry.rotateX(-Math.PI / 2);
  const voidMaterial = new THREE.MeshBasicNodeMaterial();
  const where: N = positionWorld.xz.mul(0.004);
  const field = noise(where).b.mul(noise(where.mul(2.7).add(0.3)).r);
  const stars = smoothstep(0.4, 0.55, field).mul(noise(where.mul(0.5).add(time.mul(0.01))).g.mul(0.7).add(0.4));
  const nebula = noise(where.mul(0.12).add(time.mul(0.002))).g;
  const depth: N = vec3(0.01, 0.012, 0.05).add(mix(vec3(0.1, 0.05, 0.3), vec3(0.02, 0.2, 0.3), nebula).mul(smoothstep(0.35, 0.8, nebula)).mul(0.5)).add(vec3(0.9, 0.95, 1.0).mul(stars).mul(2));
  voidMaterial.colorNode = mix(env.skyHorizon, depth, smoothstep(-1700, -2500, cameraPosition.x));
  const abyss = new THREE.Mesh(voidGeometry, voidMaterial);
  abyss.position.set(-2700 - 7000, -520, 0);
  abyss.frustumCulled = false;

  const mistGeometry = new THREE.PlaneGeometry(9000, 110, 1, 1);
  const mistMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const m: N = uv();
  const puff = noise(vec2(m.x.mul(12).add(time.mul(0.01)), m.y.mul(0.3).sub(time.mul(0.03)))).r;
  mistMaterial.colorNode = vec3(0.92, 0.95, 1.0).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.3)));
  mistMaterial.opacityNode = smoothstep(0, 0.3, m.y).mul(smoothstep(1, 0.3, m.y)).mul(smoothstep(0.3, 0.7, puff)).mul(0.4);
  const mist = new THREE.Mesh(mistGeometry, mistMaterial);
  mist.rotation.y = Math.PI / 2;
  mist.position.set(-2712, 22, 0);
  mist.frustumCulled = false;
  mist.renderOrder = 16;

  const lines: [string, number, number][] = [
    ['O FIN DO MUNDO', 142, 34],
    ['A SMALL WORLD BY ANDRÉS VIEIRA', 104, 18],
    ['SUPERVISED BY LELO', 78, 18],
    ['GRAZAS POR VOAR ATA AQUÍ', 50, 20],
  ];
  const credits = createSigns(
    lines.map(([text, y, height]) => ({ text, x: -2880, y: y + 20, z: 0, yaw: Math.PI / 2, height, color: [1, 0.92, 0.7] as [number, number, number] })),
    0,
    true,
  );
  group.add(abyss, wall, mist, credits);
  return group;
}

export function createProcession(ax: number, az: number, bx: number, bz: number): THREE.Mesh {
  const count = 13;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) seeds[i] = i / count;
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
  const lit = uniform(1);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const seed: N = attribute('seed', 'float');
  const local: N = positionGeometry;
  const t = fract(time.mul(0.006).add(seed.mul(0.16)));
  const along = vec2(ax, az).add(vec2(bx - ax, bz - az).mul(t));
  const center: N = vec3(along.x.add(sin(seed.mul(40)).mul(0.8)), groundHeight(along).add(1.5).add(sin(time.mul(1.4).add(seed.mul(30))).mul(0.06)), along.y);
  const toCamera = cameraPosition.sub(center).normalize();
  const right = vec3(toCamera.z, 0, toCamera.x.negate()).normalize();
  const size = sin(time.mul(9).add(seed.mul(70))).mul(0.1).add(1.1);
  material.positionNode = center.add(right.mul(local.x.mul(size))).add(vec3(0, local.y.mul(size).mul(1.5), 0));
  const p: N = uv();
  const flame = smoothstep(0.5, 0.05, p.sub(0.5).mul(vec2(1, 0.7)).length());
  const ends = smoothstep(0, 0.06, t).mul(smoothstep(1, 0.94, t));
  material.colorNode = vec3(1.0, 0.8, 0.45).mul(2);
  material.opacityNode = flame.mul(ends).mul(env.night).mul(lit);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 24;
  mesh.name = 'procession';
  mesh.userData.lit = lit;
  return mesh;
}

export function createBonfires(spots: { x: number; y: number; z: number }[]): THREE.Mesh {
  const s = new Sculpt(623);
  for (const spot of spots) {
    for (let k = 0; k < 7; k++) {
      s.push(spot.x, spot.y, spot.z, k * 0.9).tilt(0, 0.9);
      s.cylinder(0, 0, 0, 0.3, 0.2, 3.4, 5, [0.3, 0.2, 0.14]);
      s.pop();
    }
    s.glow = 1;
    s.cylinder(spot.x, spot.y + 0.4, spot.z, 1.5, 0.05, 5.5, 7, [1, 0.45, 0.1], false);
    s.cylinder(spot.x, spot.y + 0.4, spot.z, 0.9, 0.05, 7.5, 6, [1, 0.8, 0.25], false);
    for (let k = 0; k < 8; k++) s.box(spot.x + Math.sin(k * 2.1) * 1.6, spot.y + 5 + k * 1.3, spot.z + Math.cos(k * 1.7) * 1.6, 0.16, 0.16, 0.16, [1, 0.6, 0.2]);
    s.glow = 0;
  }
  const mesh = new THREE.Mesh(s.geometry(), arcadeMaterial());
  mesh.frustumCulled = false;
  mesh.name = 'bonfires';
  return mesh;
}
