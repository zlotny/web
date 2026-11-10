import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, float, hash, instanceIndex, mix, normalWorld, positionGeometry, positionLocal, positionWorld, sin, smoothstep, time, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Simplex, mulberry32 } from '../core/noise';
import { WORLD_SIZE, type HeightMap } from './height';
import type { LightMap, MaskMap } from './lightmap';
import type { Obstacles } from './obstacles';
import { applyFog, brush, env, paint, type N } from './shading';
import { LodField, type LodKind } from './lod';

interface Species {
  name: string;
  geometry: THREE.BufferGeometry;
  levels: THREE.BufferGeometry[];
  dark: [number, number, number];
  light: [number, number, number];
  trunk: [number, number, number];
  crown: number;
  height: number;
  bottom: number;
  girth: number;
}

interface Blob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
}

function canopy(blobs: Blob[], seed: number, top: number, bottom: number, detail = 1): THREE.BufferGeometry[] {
  const simplex = new Simplex(seed);
  return blobs.map((blob, index) => {
    const geometry = new THREE.IcosahedronGeometry(1, detail);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const normal = geometry.attributes.normal as THREE.BufferAttribute;
    const data = new Float32Array(position.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const bump = 1 + simplex.noise(v.x * 1.7 + index * 9, v.y * 1.7 + v.z * 1.3) * 0.2;
      const px = blob.x + v.x * blob.rx * bump;
      const py = blob.y + v.y * blob.ry * bump;
      const pz = blob.z + v.z * blob.rx * bump;
      position.setXYZ(i, px, py, pz);
      const out = new THREE.Vector3(px, (py - (top + bottom) / 2) * 1.3, pz).normalize().lerp(v, 0.45).normalize();
      normal.setXYZ(i, out.x, out.y, out.z);
      data[i * 3] = 1;
      data[i * 3 + 1] = THREE.MathUtils.clamp((py - bottom) / (top - bottom), 0, 1);
      data[i * 3 + 2] = index / blobs.length;
    }
    geometry.deleteAttribute('uv');
    geometry.setAttribute('leaf', new THREE.BufferAttribute(data, 3));
    return geometry;
  });
}

function dabs(blobs: Blob[], seed: number, top: number, bottom: number, perBlob: number, size: number, keep = 1): THREE.BufferGeometry {
  const grow = Math.sqrt(keep);
  const rand = mulberry32(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const leaf: number[] = [];
  const out = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const center = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const soft = new THREE.Vector3();
  blobs.forEach((blob, index) => {
    for (let k = 0; k < perBlob; k++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      out.set(ring * Math.cos(phi), u * 0.9 + 0.1, ring * Math.sin(phi)).normalize();
      center.set(blob.x + out.x * blob.rx * 0.97, blob.y + out.y * blob.ry * 0.97, blob.z + out.z * blob.rx * 0.97);
      tangent.set(-out.z, 0, out.x).normalize();
      bitangent.crossVectors(out, tangent).normalize();
      const spin = rand() * Math.PI;
      const w = size * (0.6 + rand() * 0.7) * grow;
      const h = w * (0.55 + rand() * 0.5);
      const tilt = 0.35 + rand() * 0.5;
      const corners = [
        [-w, 0],
        [0, -h],
        [w, 0],
        [0, h],
      ].map(([a, b]) => {
        const ca = a * Math.cos(spin) - b * Math.sin(spin);
        const cb = a * Math.sin(spin) + b * Math.cos(spin);
        return corner
          .copy(center)
          .addScaledVector(tangent, ca)
          .addScaledVector(bitangent, cb)
          .addScaledVector(out, Math.abs(ca) * tilt * 0.4)
          .clone();
      });
      soft.set(center.x, (center.y - (top + bottom) / 2) * 1.3, center.z).normalize().lerp(out, 0.4).normalize();
      const shade = THREE.MathUtils.clamp((center.y - bottom) / (top - bottom) + (rand() - 0.5) * 0.3, 0, 1);
      const tones = [rand(), rand(), rand(), rand(), rand(), rand()];
      if (k % keep !== 0) continue;
      for (const i of [0, 1, 2, 0, 2, 3]) {
        positions.push(corners[i].x, corners[i].y, corners[i].z);
        normals.push(soft.x, soft.y, soft.z);
        leaf.push(1, shade, tones.shift()!);
      }
    }
    void index;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('leaf', new THREE.Float32BufferAttribute(leaf, 3));
  return geometry;
}

interface TrunkShape {
  height: number;
  base: number;
  top: number;
  flare: number;
  roots: number;
  rootCount: number;
  bendX: number;
  bendZ: number;
  twist: number;
}

function spine(shape: TrunkShape, t: number, out: THREE.Vector3): THREE.Vector3 {
  const wobble = Math.sin(t * 5.2) * shape.twist * t;
  return out.set(shape.bendX * t * t + wobble, t * shape.height, shape.bendZ * t * t + Math.cos(t * 4.1) * shape.twist * t * 0.7);
}

function trunk(shape: TrunkShape, seed: number, rings = 10, segments = 10): THREE.BufferGeometry {
  const simplex = new Simplex(seed);
  const positions: number[] = [];
  const normals: number[] = [];
  const leaf: number[] = [];
  const indices: number[] = [];
  const center = new THREE.Vector3();
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    spine(shape, t, center);
    const radius = shape.top + (shape.base - shape.top) * Math.pow(1 - t, 1.6) + shape.flare * Math.exp(-t * 9);
    for (let k = 0; k <= segments; k++) {
      const angle = (k / segments) * Math.PI * 2;
      const toe = Math.pow(Math.max(0, Math.cos(angle * shape.rootCount + seed)), 2) * shape.roots * Math.exp(-t * 11) * 1.7;
      const knot = 1 + simplex.noise(Math.cos(angle) * 1.4 + seed, t * 4 + Math.sin(angle) * 1.4) * 0.1;
      const reach = radius * (1 + toe) * knot;
      const sink = r === 0 ? -0.5 - toe * 0.2 : 0;
      positions.push(center.x + Math.cos(angle) * reach, center.y + sink, center.z + Math.sin(angle) * reach);
      normals.push(Math.cos(angle), 0.15, Math.sin(angle));
      leaf.push(0, t * 0.8, 0);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const i = r * row + k;
      indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('leaf', new THREE.Float32BufferAttribute(leaf, 3));
  geometry.setIndex(indices);
  return geometry;
}

function limb(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, height: number, segments = 6): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const leaf: number[] = [];
  const indices: number[] = [];
  const axis = new THREE.Vector3().subVectors(to, from).normalize();
  const side = new THREE.Vector3(axis.z, 0, -axis.x);
  if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
  side.normalize();
  const other = new THREE.Vector3().crossVectors(axis, side).normalize();
  const mid = new THREE.Vector3().lerpVectors(from, to, 0.5);
  mid.y += from.distanceTo(to) * 0.12;
  const stations = [from, mid, to];
  const radii = [r0, (r0 + r1) / 2, r1];
  stations.forEach((station, r) => {
    for (let k = 0; k <= segments; k++) {
      const angle = (k / segments) * Math.PI * 2;
      const nx = side.x * Math.cos(angle) + other.x * Math.sin(angle);
      const ny = side.y * Math.cos(angle) + other.y * Math.sin(angle);
      const nz = side.z * Math.cos(angle) + other.z * Math.sin(angle);
      positions.push(station.x + nx * radii[r], station.y + ny * radii[r], station.z + nz * radii[r]);
      normals.push(nx, ny, nz);
      leaf.push(0, THREE.MathUtils.clamp(station.y / height, 0, 1) * 0.8, 0);
    }
  });
  const row = segments + 1;
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < segments; k++) {
      const i = r * row + k;
      indices.push(i, i + row, i + 1, i + 1, i + row, i + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('leaf', new THREE.Float32BufferAttribute(leaf, 3));
  geometry.setIndex(indices);
  return geometry;
}

function build(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  merged.computeBoundingSphere();
  return merged;
}

interface Recipe {
  name: string;
  shape: TrunkShape;
  blobs: Blob[];
  limbs: number;
  dabs: number;
  dabSize: number;
  dark: [number, number, number];
  light: [number, number, number];
  bark: [number, number, number];
  seed: number;
}

const B = (x: number, y: number, z: number, rx: number, ry: number): Blob => ({ x, y, z, rx, ry });

const RECIPES: Recipe[] = [
  {
    name: 'oak',
    shape: { height: 3.6, base: 0.62, top: 0.36, flare: 0.5, roots: 0.45, rootCount: 2.5, bendX: 0.3, bendZ: -0.2, twist: 0.12 },
    blobs: [B(0.3, 5.6, -0.2, 3.0, 2.3), B(2.4, 4.5, 0.7, 2.1, 1.6), B(-2.1, 4.7, -1.0, 2.2, 1.7), B(0.4, 4.4, 2.3, 2.0, 1.5), B(-0.5, 4.6, -2.4, 1.9, 1.5), B(0.8, 7.0, -0.4, 2.0, 1.4)],
    limbs: 4,
    dabs: 26,
    dabSize: 1.0,
    dark: [0.17, 0.31, 0.17],
    light: [0.52, 0.62, 0.27],
    bark: [0.4, 0.33, 0.27],
    seed: 11,
  },
  {
    name: 'pine',
    shape: { height: 10, base: 0.4, top: 0.2, flare: 0.22, roots: 0.25, rootCount: 2, bendX: 1.5, bendZ: 0.5, twist: 0.25 },
    blobs: [B(1.5, 11, 0.5, 3.6, 1.4), B(3.3, 10.2, 1.3, 2.2, 1.0), B(-0.6, 10.3, -0.3, 2.4, 1.1), B(1.7, 12.1, 0.1, 2.1, 0.9)],
    limbs: 3,
    dabs: 22,
    dabSize: 0.95,
    dark: [0.12, 0.26, 0.19],
    light: [0.36, 0.52, 0.3],
    bark: [0.46, 0.33, 0.27],
    seed: 23,
  },
  {
    name: 'eucalyptus',
    shape: { height: 13.5, base: 0.3, top: 0.13, flare: 0.16, roots: 0.1, rootCount: 2, bendX: 0.5, bendZ: 0.2, twist: 0.3 },
    blobs: [B(0.7, 14.6, 0.2, 1.7, 2.5), B(-0.5, 11.8, 0.6, 1.3, 1.7), B(1.1, 9.8, -0.5, 1.2, 1.5), B(-0.2, 8, -0.2, 0.9, 1.2)],
    limbs: 2,
    dabs: 20,
    dabSize: 0.7,
    dark: [0.2, 0.33, 0.27],
    light: [0.46, 0.57, 0.42],
    bark: [0.72, 0.68, 0.62],
    seed: 37,
  },
  {
    name: 'birch',
    shape: { height: 7.2, base: 0.2, top: 0.09, flare: 0.1, roots: 0.1, rootCount: 2, bendX: -0.5, bendZ: 0.3, twist: 0.35 },
    blobs: [B(-0.5, 7.6, 0.3, 1.5, 1.6), B(0.6, 6.3, -0.4, 1.2, 1.3), B(-1.1, 5.6, 0.5, 1.0, 1.2), B(0.3, 4.6, 0.6, 0.8, 1.0), B(-0.3, 8.9, 0.1, 0.9, 1.0)],
    limbs: 2,
    dabs: 24,
    dabSize: 0.55,
    dark: [0.4, 0.52, 0.2],
    light: [0.8, 0.8, 0.34],
    bark: [0.88, 0.87, 0.82],
    seed: 41,
  },
  {
    name: 'chestnut',
    shape: { height: 4.6, base: 1.0, top: 0.5, flare: 0.85, roots: 0.6, rootCount: 3, bendX: 0.5, bendZ: 0.4, twist: 0.55 },
    blobs: [B(3.6, 6.4, 0.6, 2.9, 1.7), B(-2.9, 7.3, 1.8, 2.7, 1.6), B(-0.6, 8.6, -3.0, 2.8, 1.7), B(0.5, 10.4, 0.3, 3.3, 2.0)],
    limbs: 4,
    dabs: 30,
    dabSize: 1.1,
    dark: [0.4, 0.3, 0.12],
    light: [0.8, 0.56, 0.2],
    bark: [0.36, 0.28, 0.22],
    seed: 53,
  },
  {
    name: 'elder',
    shape: { height: 5.2, base: 1.9, top: 0.95, flare: 1.7, roots: 0.75, rootCount: 3.5, bendX: -0.4, bendZ: 0.3, twist: 0.4 },
    blobs: [B(0, 9.2, 0, 6.2, 3.4), B(5.6, 7.2, 1.2, 4.0, 2.5), B(-5.2, 7.6, -1.6, 4.2, 2.6), B(0.8, 7.0, 5.4, 3.9, 2.4), B(-1.0, 7.3, -5.6, 3.8, 2.4), B(1.2, 12.2, -0.6, 3.8, 2.2)],
    limbs: 5,
    dabs: 34,
    dabSize: 1.5,
    dark: [0.11, 0.25, 0.16],
    light: [0.44, 0.58, 0.24],
    bark: [0.33, 0.29, 0.26],
    seed: 67,
  },
  {
    name: 'windswept',
    shape: { height: 3.4, base: 0.34, top: 0.18, flare: 0.25, roots: 0.3, rootCount: 2, bendX: 2.3, bendZ: 0, twist: 0.3 },
    blobs: [B(3.2, 3.9, 0, 2.3, 0.9), B(5.2, 3.5, 0.3, 1.7, 0.7), B(1.6, 3.6, -0.3, 1.5, 0.8)],
    limbs: 2,
    dabs: 22,
    dabSize: 0.75,
    dark: [0.14, 0.24, 0.15],
    light: [0.38, 0.47, 0.22],
    bark: [0.4, 0.36, 0.33],
    seed: 79,
  },
];

const LEVELS = [
  { rings: 10, segments: 10, limbSegments: 6, detail: 1, keep: 1 },
  { rings: 6, segments: 7, limbSegments: 5, detail: 1, keep: 2 },
  { rings: 4, segments: 5, limbSegments: 4, detail: 0, keep: 4 },
  { rings: 2, segments: 4, limbSegments: 3, detail: 0, keep: 8 },
];

function speciesList(): Species[] {
  const tip = new THREE.Vector3();
  return RECIPES.map((recipe) => {
    const top = Math.max(...recipe.blobs.map((blob) => blob.y + blob.ry));
    const bottom = Math.min(...recipe.blobs.map((blob) => blob.y - blob.ry));
    const height = top;
    const levels = LEVELS.map(({ rings, segments, limbSegments, detail, keep }) => {
      const parts: THREE.BufferGeometry[] = [trunk(recipe.shape, recipe.seed, rings, segments)];
      spine(recipe.shape, 0.92, tip);
      const ordered = [...recipe.blobs].sort((a, b) => Math.hypot(b.x - tip.x, b.z - tip.z) - Math.hypot(a.x - tip.x, a.z - tip.z));
      for (const blob of ordered.slice(0, recipe.limbs)) {
        parts.push(limb(tip.clone(), new THREE.Vector3(blob.x, blob.y - blob.ry * 0.3, blob.z), recipe.shape.top * 0.8, recipe.shape.top * 0.3, height, limbSegments));
      }
      parts.push(...canopy(recipe.blobs, recipe.seed, top, bottom, detail), dabs(recipe.blobs, recipe.seed, top, bottom, recipe.dabs, recipe.dabSize, keep));
      return build(parts);
    });
    const crown = Math.max(...recipe.blobs.map((blob) => Math.hypot(blob.x, blob.z) + blob.rx));
    return {
      name: recipe.name,
      geometry: levels[0],
      levels,
      dark: recipe.dark,
      light: recipe.light,
      trunk: recipe.bark,
      crown: crown * 0.8,
      height,
      bottom,
      girth: recipe.shape.base + recipe.shape.flare * 0.5,
    };
  });
}

function treeMaterial(species: Species, cutout: boolean): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const leaf: N = attribute('leaf', 'vec3');
  const random = hash(instanceIndex);
  const tall: N = positionGeometry.y;
  const sway = sin(time.mul(1.3).add(random.mul(6.28)).add(tall.mul(0.35))).mul(0.045);
  const lean = tall.mul(tall).mul(0.0022);
  material.positionNode = positionLocal.add(
    vec3(env.wind.x, 0, env.wind.y).mul(sway.mul(tall.mul(0.16)).add(lean)).mul(leaf.x.mul(0.7).add(0.3)),
  );

  const dab = brush(positionWorld.xz.add(positionWorld.y.mul(0.7)), 0.16);
  const tone = leaf.y.mul(0.7).add(dab.sub(0.5).mul(0.55)).add(random.sub(0.5).mul(0.3)).add(leaf.z.sub(0.5).mul(0.5)).clamp(0, 1);
  const foliage = mix(vec3(...species.dark), vec3(...species.light), tone);
  const autumn = mix(foliage, vec3(0.74, 0.6, 0.24), random.sub(0.86).max(0).mul(5).mul(leaf.y));
  const bark = vec3(...species.trunk).mul(dab.mul(0.5).add(0.75));
  const albedo = mix(bark, autumn, leaf.x);
  const depth = mix(float(0.62), float(1.1), leaf.y).mul(leaf.x).add(leaf.x.oneMinus().mul(0.75));
  const soft = normalWorld.add(vec3(0, 0.55, 0).mul(leaf.x)).normalize();
  material.colorNode = applyFog(paint(albedo, soft, positionWorld, depth, 0.62, false), positionWorld);
  if (cutout) {
    const near = positionWorld.sub(cameraPosition).length();
    material.opacityNode = smoothstep(3.5, 8, near).add(dab.sub(0.5).mul(0.6));
    material.alphaTest = 0.5;
  }
  return material;
}

export interface TreeSettings {
  density: number;
  chunk: number;
  ranges: number[];
}

export function createTrees(
  map: HeightMap,
  light: LightMap,
  mask: MaskMap,
  settings: TreeSettings,
  blocked: (x: number, z: number) => boolean,
  obstacles: Obstacles,
): LodField {
  const species = speciesList();
  const forest = new Simplex(4242);
  const rand = mulberry32(99);
  const windYaw = Math.atan2(-env.wind.value.y, env.wind.value.x);
  const buckets = new Map<string, THREE.Matrix4[]>();
  const spacing = 8.5;
  const half = WORLD_SIZE / 2;
  const dummy = new THREE.Object3D();

  for (let z = -half; z < half; z += spacing) {
    for (let x = -half; x < half; x += spacing) {
      const px = x + rand() * spacing;
      const pz = z + rand() * spacing;
      const pick = rand();
      const keep = rand();
      const size = rand();
      const turn = rand();
      const h = map.sample(px, pz);
      if (h < 4.5 || h > 128) continue;
      if (map.slope(px, pz) > 0.2) continue;
      const cover = forest.fbm(px * 0.0021, pz * 0.0021, 3) * 0.5 + 0.5 + forest.noise(px * 0.011, pz * 0.011) * 0.12;
      const chance = Math.max(0, (cover - 0.5) * 5.5) * settings.density + 0.012 * settings.density;
      if (keep > chance) continue;
      if (blocked(px, pz)) continue;

      const kind = forest.noise(px * 0.0016 + 60, pz * 0.0016 - 60) + (pick - 0.5) * 0.55;
      const grove = forest.noise(px * 0.0043 + 9, pz * 0.0043 + 27);
      const altitude = h / 110;
      const shore = Math.hypot(px, pz) > 830 && h > 14;
      let index = kind + altitude * 0.7 > 0.42 ? 1 : kind < -0.3 ? 2 : 0;
      if (grove > 0.42 && h < 70) index = 3;
      else if (grove < -0.48 && h < 60) index = 4;
      if (shore && pick < 0.7) index = 6;
      if (index !== 6 && keep < chance * 0.035 && h < 55) index = 5;
      const tree = species[index];
      const range = index === 5 ? 0.9 + size * 0.5 : index === 6 ? 0.7 + size * 0.7 : 0.6 + size * size * 1.25;
      const scale = range;
      dummy.position.set(px, h - 0.25, pz);
      const tiltX = (rand() - 0.5) * 0.1;
      const tiltZ = (rand() - 0.5) * 0.1;
      dummy.rotation.set(tiltX, index === 6 ? windYaw + (turn - 0.5) * 0.7 : turn * Math.PI * 2, tiltZ);
      const tall = scale * (index === 2 || index === 3 ? 0.85 + rand() * 0.55 : 0.9 + rand() * 0.3);
      dummy.scale.set(scale, tall, scale);
      obstacles.add(px, pz, tree.girth * scale, h - 1, h + tree.bottom * tall);
      if (index !== 6) obstacles.add(px, pz, tree.crown * scale * 0.78, h + tree.bottom * tall, h + tree.height * tall);
      dummy.updateMatrix();
      const key = String(index);
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(dummy.matrix.clone());
      light.stamp(px, pz, tree.crown * scale, tree.height * scale, 0.62);
      light.occlude(px, pz, tree.crown * scale * 1.3, 0.35);
      mask.cover(px, pz, tree.crown * scale * 2.4);
    }
  }

  const materials = species.map((kind) => [treeMaterial(kind, true), treeMaterial(kind, false)]);
  const kinds = new Map<number, LodKind>();
  for (const [key, matrices] of buckets) {
    const index = Number(key);
    let kind = kinds.get(index);
    if (!kind) kinds.set(index, (kind = { levels: species[index].levels, material: materials[index], items: [] }));
    kind.items.push(...matrices);
  }
  return new LodField('trees', [...kinds.values()], settings.chunk, settings.ranges);
}
