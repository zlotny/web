import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  cos,
  float,
  floor,
  hash,
  instanceIndex,
  length,
  mix,
  positionGeometry,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { applyFog, env, groundHeight, groundMask, noise, paint, type N } from './shading';
import { terrainAlbedo, terrainNormal } from './terrain';

export interface GrassSettings {
  side: number;
  spacing: number;
  width: number;
  height: number;
  blades: number;
  near: number;
  lead: number;
}

function clumpGeometry(blades: number): THREE.BufferGeometry {
  const rows = [
    [0.5, 0],
    [0.36, 0.5],
    [0, 1],
  ];
  const positions: number[] = [];
  const lean: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI + (b * 0.7 + 0.3);
    const tilt = blades === 1 ? 0 : 0.35 + (b % 2) * 0.25;
    const scale = blades === 1 ? 1 : 0.7 + ((b * 37) % 10) / 22;
    const base = positions.length / 3;
    for (const [w, y] of rows) {
      for (const s of [-1, 1]) {
        if (w === 0 && s === 1) continue;
        const x = s * w;
        const out = y * y * tilt;
        positions.push(Math.cos(angle) * x + Math.sin(angle) * out, y * scale, Math.sin(angle) * x - Math.cos(angle) * out);
        lean.push(y);
      }
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('tip', new THREE.Float32BufferAttribute(lean, 1));
  geometry.setIndex(indices);
  return geometry;
}

export class Grass {
  readonly mesh: THREE.Mesh;
  readonly focus = uniform(new THREE.Vector2());
  readonly lead: number;
  private side: number;
  private columns = uniform(1);

  constructor(settings: GrassSettings) {
    const { side, spacing } = settings;
    this.lead = settings.lead;
    this.side = side;
    this.columns.value = side;
    const span: N = this.columns.mul(spacing);
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });

    const index: N = instanceIndex;
    const id = index.toFloat();
    const cell = vec2(id.mod(this.columns), floor(id.div(this.columns)));
    const r1 = hash(index);
    const r2 = hash(index.add(7919));
    const r3 = hash(index.add(15485863));
    const r4 = hash(index.add(32452843));
    const base = cell.add(vec2(r1, r2)).mul(spacing);
    const world = base.add(floor(this.focus.sub(base).div(span).add(0.5)).mul(span));

    const ground = groundHeight(world);
    const normal = terrainNormal(world);
    const slope = normal.y.oneMinus();
    const patch = noise(world.mul(0.004)).g;
    const grow = smoothstep(2.4, 5, ground)
      .mul(smoothstep(0.3, 0.17, slope))
      .mul(smoothstep(150, 95, ground))
      .mul(smoothstep(0.2, 0.4, patch.add(r3.mul(0.25))))
      .mul(smoothstep(0.5, 0.22, groundMask(world).r));
    const distance = length(world.sub(this.focus));
    const outer = smoothstep(span.mul(0.5), span.mul(0.34), distance);
    const inner = settings.near > 0 ? smoothstep(settings.near * 0.6, settings.near, distance) : float(1);
    const tall = r3.mul(0.8).add(0.6).mul(grow).mul(outer).mul(inner).mul(settings.height);

    const tip: N = attribute('tip', 'float');
    const yaw: N = r4.mul(Math.PI * 2);
    const gust = noise(world.mul(0.006).add(env.wind.mul(time.mul(0.11)))).r.sub(0.4);
    const flutter = sin(time.mul(2.3).add(r1.mul(6.28))).mul(0.07);
    const bend: N = gust.mul(0.8).add(flutter).mul(tip.mul(tip)).mul(tall);
    const wide = float(settings.width).mul(r2.mul(0.5).add(0.75));
    const lx: N = positionGeometry.x.mul(wide);
    const lz: N = positionGeometry.z.mul(wide);
    const gap: N = world.sub(env.bird.xz);
    const reach = gap.length();
    const press = smoothstep(5.5, 0.6, reach).mul(smoothstep(7, 1.5, env.bird.y.sub(ground)));
    const shove: N = gap.div(reach.max(0.01)).mul(press).mul(tip).mul(tall).mul(1.1);
    const ox: N = cos(yaw).mul(lx).sub(sin(yaw).mul(lz)).add(env.wind.x.mul(bend)).add(shove.x);
    const oy: N = positionGeometry.y.mul(tall).mul(press.mul(0.55).oneMinus());
    const oz: N = sin(yaw).mul(lx).add(cos(yaw).mul(lz)).add(env.wind.y.mul(bend)).add(shove.y);
    const alive: N = step(0.001, tall);
    const offset: N = vec3(ox, oy, oz).mul(alive);
    const worldPos: N = varying(vec3(world.x, ground, world.y).add(offset));
    material.positionNode = vec3(world.x, ground, world.y).add(offset);

    const root: N = varying(
      Fn(() => {
        const color = vec3(0).toVar();
        If(tall.greaterThan(0.001), () => {
          color.assign(terrainAlbedo(world, ground, normal));
        });
        return color;
      })(),
    );
    const groundNormal: N = varying(normal);
    const height: N = varying(tip);
    const tint: N = varying(r3);
    const blown: N = varying(smoothstep(0.12, 0.42, gust));
    const dry = vec3(0.1, 0.09, -0.02).mul(tint.mul(tint));
    const blade = mix(root.mul(0.86), root.mul(1.12).add(dry).add(vec3(0.1, 0.11, 0.04).mul(blown)), height);
    material.colorNode = applyFog(paint(blade, groundNormal, worldPos, mix(float(0.72), float(1.1), height)), worldPos);

    this.mesh = new THREE.Mesh(clumpGeometry(settings.blades), material);
    this.mesh.count = side * side;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
  }

  setReach(fraction: number): void {
    const columns = Math.max(8, Math.round(this.side * fraction));
    this.columns.value = columns;
    this.mesh.count = columns * columns;
  }

  follow(x: number, z: number, fx: number, fz: number): void {
    this.focus.value.set(x + fx * this.lead, z + fz * this.lead);
  }
}
