import * as THREE from 'three/webgpu';
import { float, mix, normalWorld, positionLocal, positionWorld, smoothstep, uv, vec3 } from 'three/tsl';
import { Simplex, mulberry32 } from '../core/noise';
import { WORLD_SIZE, type HeightMap } from './height';
import type { LightMap } from './lightmap';
import { sculptMaterial, type RGB } from './sculpt';
import { env, type N } from './shading';
import { LodField, type LodKind } from './lod';

function colored(geometry: THREE.BufferGeometry, color: (p: THREE.Vector3, n: THREE.Vector3) => RGB): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  flat.computeVertexNormals();
  const position = flat.attributes.position;
  const normal = flat.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const c = color(p.fromBufferAttribute(position, i), n.fromBufferAttribute(normal, i));
    colors.set(c, i * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(position.count), 1));
  flat.deleteAttribute('uv');
  flat.computeBoundingSphere();
  return flat;
}

function boulder(seed: number, detail = 1): THREE.BufferGeometry {
  const simplex = new Simplex(seed);
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const k = 1 + simplex.noise(v.x * 1.3 + seed, v.y * 1.3 + v.z) * 0.32;
    position.setXYZ(i, v.x * k * 1.25, v.y * k * 0.72, v.z * k);
  }
  return colored(geometry, (p, n) => {
    const moss = n.y > 0.55 && simplex.noise(p.x * 2, p.z * 2) > 0.1;
    const tone = 0.52 + simplex.noise(p.x * 3 + 9, p.y * 3 + p.z) * 0.1;
    return moss ? [0.42, 0.5, 0.28] : [tone + 0.06, tone + 0.04, tone];
  });
}

function bush(seed: number, flower: RGB, leaf: RGB, detail = 1, keep = 1): THREE.BufferGeometry {
  const grow = Math.sqrt(keep);
  const rand = mulberry32(seed);
  const simplex = new Simplex(seed * 13);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const v = new THREE.Vector3();
  const out = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const lumps = 4 + Math.floor(rand() * 3);
  for (let l = 0; l < lumps; l++) {
    const radius = 0.55 + rand() * 0.5;
    const squash = 0.68 + rand() * 0.2;
    const cx = (rand() - 0.5) * 1.7;
    const cy = 0.25 + rand() * 0.3;
    const cz = (rand() - 0.5) * 1.7;
    const ball = new THREE.IcosahedronGeometry(1, detail);
    const position = ball.attributes.position;
    let tone = 1;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).normalize();
      const bump = 1 + simplex.noise(v.x * 1.9 + l * 7, v.y * 1.9 + v.z * 1.4) * 0.24;
      tone = 0.92 + simplex.noise(v.x * 2.6 + l * 3, v.z * 2.6 - v.y * 2) * 0.1;
      const shade = tone + v.y * 0.2;
      positions.push(cx + v.x * radius * bump, cy + v.y * radius * squash * bump, cz + v.z * radius * bump);
      out.set(v.x, v.y + 0.35, v.z).normalize();
      normals.push(out.x, out.y, out.z);
      colors.push(leaf[0] * shade, leaf[1] * shade, leaf[2] * shade);
    }
    const dabs = 34;
    for (let k = 0; k < dabs; k++) {
      const u = rand() * 1.25 - 0.25;
      const phi = rand() * Math.PI * 2;
      const ring = Math.sqrt(Math.max(0, 1 - u * u));
      out.set(ring * Math.cos(phi), u, ring * Math.sin(phi));
      const bloom = u > 0.1 && rand() < 0.36;
      const size = (bloom ? 0.07 + rand() * 0.06 : 0.11 + rand() * 0.11) * grow;
      const reach = radius * (bloom ? 1.1 : 1.02);
      v.set(cx + out.x * reach, cy + out.y * reach * squash, cz + out.z * reach);
      tangent.set(-out.z, 0, out.x).normalize();
      bitangent.crossVectors(out, tangent).normalize();
      const spin = rand() * Math.PI;
      const k1 = 0.95 + rand() * 0.4;
      if (k % keep !== 0) continue;
      const tint: RGB = bloom ? [flower[0] * k1, flower[1] * k1, flower[2] * k1] : [leaf[0] * k1 * 1.12, leaf[1] * k1 * 1.16, leaf[2] * k1];
      const quad = [
        [-size, 0],
        [0, -size * 0.7],
        [size, 0],
        [0, size * 0.7],
      ].map(([a, b]) => {
        const ca = a * Math.cos(spin) - b * Math.sin(spin);
        const cb = a * Math.sin(spin) + b * Math.cos(spin);
        return corner.copy(v).addScaledVector(tangent, ca).addScaledVector(bitangent, cb).addScaledVector(out, Math.abs(ca) * 0.3).clone();
      });
      const up = out.clone().setY(out.y + 0.4).normalize();
      for (const i of [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) {
        positions.push(quad[i].x, quad[i].y, quad[i].z);
        normals.push(up.x, up.y, up.z);
        colors.push(tint[0], tint[1], tint[2]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface ScatterSettings {
  density: number;
  chunk: number;
  ranges: number[];
}

export function createScatter(
  map: HeightMap,
  light: LightMap,
  settings: ScatterSettings,
  blocked: (x: number, z: number) => boolean,
): LodField {
  const material = sculptMaterial();
  const rand = mulberry32(555);
  const patches = new Simplex(808);
  const dummy = new THREE.Object3D();
  const half = WORLD_SIZE / 2;

  const bushes: [number, RGB, RGB][] = [
    [3, [0.98, 0.82, 0.16], [0.27, 0.4, 0.2]],
    [4, [0.72, 0.42, 0.76], [0.36, 0.4, 0.29]],
    [5, [0.95, 0.93, 0.85], [0.3, 0.44, 0.24]],
  ];
  const kinds: LodKind[] = [
    ...[1, 2].map((seed) => {
      const full = boulder(seed);
      return { levels: [full, full, boulder(seed, 0)], material, items: [] as THREE.Matrix4[] };
    }),
    ...bushes.map(([seed, flower, leaf]) => ({ levels: [bush(seed, flower, leaf), bush(seed, flower, leaf, 1, 3), bush(seed, flower, leaf, 0, 6)], material, items: [] })),
  ];

  const spacing = 11;
  for (let z = -half; z < half; z += spacing) {
    for (let x = -half; x < half; x += spacing) {
      const px = x + rand() * spacing;
      const pz = z + rand() * spacing;
      const roll = rand();
      const size = rand();
      const turn = rand();
      const h = map.sample(px, pz);
      if (h < 0.4 || blocked(px, pz)) continue;
      const slope = map.slope(px, pz);
      const patch = patches.fbm(px * 0.004, pz * 0.004, 2) * 0.5 + 0.5;
      let kind = -1;
      let scale = 1;
      if ((slope > 0.16 && slope < 0.5 && roll < 0.3 * settings.density) || (h < 3 && roll < 0.1 * settings.density)) {
        kind = roll * 100 - Math.floor(roll * 100) > 0.5 ? 0 : 1;
        scale = 0.6 + size * size * 3.2;
      } else if (slope < 0.2 && h > 4.5 && roll < Math.max(0, patch - 0.52) * 3.2 * settings.density) {
        kind = h > 78 ? 3 : patch > 0.72 && size > 0.6 ? 4 : 2;
        scale = 0.55 + size * 0.7;
      }
      if (kind < 0) continue;
      dummy.position.set(px, h - (kind < 2 ? scale * 0.25 : 0.1), pz);
      dummy.rotation.set((rand() - 0.5) * 0.5, turn * Math.PI * 2, (rand() - 0.5) * 0.5);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      kinds[kind].items.push(dummy.matrix.clone());
      light.occlude(px, pz, scale * 1.8, 0.3);
    }
  }

  return new LodField('scatter', kinds.filter((kind) => kind.items.length), settings.chunk, settings.ranges);
}

export function createBeam(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(0.6, 15, 240, 20, 1, true);
  geometry.translate(0, -120, 0);
  geometry.rotateZ(-Math.PI / 2);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const along: N = uv().y;
  const fade = smoothstep(0, 0.06, along).mul(float(1).sub(along).pow(1.6));
  const edge = normalWorld.dot(positionWorld.sub(positionLocal.mul(0)).normalize()).abs();
  material.colorNode = mix(vec3(1.0, 0.86, 0.55), env.sunColor.mul(0.4), 0.3);
  material.opacityNode = fade.mul(0.2).mul(edge.mul(0.5).add(0.5));
  for (const turn of [0, Math.PI]) {
    const beam = new THREE.Mesh(geometry, material);
    beam.rotation.y = turn;
    beam.frustumCulled = false;
    beam.renderOrder = 20;
    group.add(beam);
  }
  return group;
}
