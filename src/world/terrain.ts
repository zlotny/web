import * as THREE from 'three/webgpu';
import { float, floor, fract, mix, normalize, positionWorld, sin, smoothstep, step, time, vec2, vec3 } from 'three/tsl';
import { BEACH, MAP_RES, WORLD_SIZE, type HeightMap } from './height';
import { applyFog, brush, env, groundHeight, groundMask, noise, paint, type N } from './shading';
import { ARCADE, CITY } from './zones';

const within = (xz: N, zone: { x: number; z: number; radius: number }): N =>
  smoothstep(zone.radius * 0.98, zone.radius * 0.86, vec2(xz).sub(vec2(zone.x, zone.z)).length());

export function terrainGlow(xz: N): N {
  const lane: N = vec2(xz).sub(vec2(CITY.x, CITY.z)).div(44);
  const road: N = fract(lane).sub(0.5).abs();
  const stripe = smoothstep(0.035, 0.012, road.x.min(road.y));
  const flow = sin(xz.x.add(xz.y).mul(0.08).sub(time.mul(1.6))).mul(0.35).add(0.65);
  const city = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.2, 0.7), smoothstep(0.012, 0.0, road.x)).mul(stripe).mul(flow).mul(within(xz, CITY)).mul(1.5);
  const tile: N = vec2(xz).div(6);
  const seam: N = fract(tile).sub(0.5).abs();
  const line = smoothstep(0.47, 0.495, seam.x.max(seam.y));
  const arcade = vec3(1.0, 0.35, 0.75).mul(line).mul(within(xz, ARCADE)).mul(0.55);
  const puddle = smoothstep(0.5, 0.68, noise(xz.mul(0.021)).r);
  const sheen = noise(vec2(xz.x.mul(0.19), xz.y.mul(0.012)).add(time.mul(0.01))).g;
  const wet = mix(vec3(0.1, 0.8, 1.0), vec3(1.0, 0.25, 0.75), noise(xz.mul(0.006)).b).mul(puddle).mul(smoothstep(0.35, 0.8, sheen)).mul(within(xz, CITY)).mul(0.5);
  return city.add(arcade).add(wet);
}


export function terrainNormal(xz: N): N {
  const e = WORLD_SIZE / (MAP_RES - 1);
  const hx0 = groundHeight(xz.sub(vec2(e, 0)));
  const hx1 = groundHeight(xz.add(vec2(e, 0)));
  const hz0 = groundHeight(xz.sub(vec2(0, e)));
  const hz1 = groundHeight(xz.add(vec2(0, e)));
  return normalize(vec3(hx0.sub(hx1), 2 * e, hz0.sub(hz1)));
}

export function terrainAlbedo(xz: N, height: N, normal: N): N {
  const big = noise(xz.mul(0.0011)).r;
  const mid = brush(xz, 0.012);
  const fine = brush(xz, 0.09);
  const grain = brush(xz, 0.55);
  const stroke = mid.sub(0.5).mul(0.6).add(fine.sub(0.5).mul(0.4));

  const meadow = mix(vec3(0.33, 0.46, 0.2), vec3(0.58, 0.63, 0.3), smoothstep(0.35, 0.65, big.add(stroke.mul(0.5))));
  const lush = mix(meadow, vec3(0.2, 0.35, 0.18), smoothstep(0.55, 0.75, noise(xz.mul(0.0031)).g.add(stroke.mul(0.4))));
  const heather = mix(vec3(0.47, 0.42, 0.25), vec3(0.52, 0.36, 0.48), smoothstep(0.4, 0.7, mid));
  const upland = mix(lush, heather, smoothstep(70, 135, height.add(stroke.mul(50))));

  const bands = noise(vec2(height.mul(0.021).add(mid.mul(0.05)), xz.x.add(xz.y).mul(0.0014))).r;
  const strata = mix(float(0.78), float(1.1), smoothstep(0.38, 0.62, bands));
  const rock = mix(vec3(0.36, 0.35, 0.37), vec3(0.64, 0.6, 0.54), fine).mul(mix(float(0.8), float(1.08), mid)).mul(strata);
  const tideLine = mix(float(0.42), float(1), smoothstep(0.6, 5.5, height.add(fine.mul(2.5))));
  const lichen = smoothstep(0.7, 0.86, noise(xz.add(height.mul(0.8)).mul(0.021)).g.add(fine.mul(0.2))).mul(smoothstep(6, 16, height));
  const slope = normal.y.oneMinus();
  const rocky = smoothstep(0.2, 0.34, slope.add(stroke.mul(0.16)));
  const dots = smoothstep(0.17, 0.07, noise(xz.mul(0.19)).a);
  const bloomArea = smoothstep(0.5, 0.66, noise(xz.mul(0.0043)).b.add(stroke.mul(0.2)));
  const petal = mix(vec3(0.96, 0.82, 0.2), vec3(0.96, 0.94, 0.86), smoothstep(0.55, 0.7, noise(xz.mul(0.011)).g));
  const flowered = mix(upland, petal, dots.mul(bloomArea).mul(smoothstep(110, 60, height)).mul(0.85));
  const crop = groundMask(xz).b;
  const rows = smoothstep(0.25, 0.75, sin(xz.x.add(xz.y.mul(0.6)).mul(1.7)).mul(0.5).add(0.5));
  const maize = mix(vec3(0.36, 0.5, 0.16), vec3(0.62, 0.66, 0.26), rows);
  const hay = mix(vec3(0.74, 0.66, 0.34), vec3(0.86, 0.79, 0.46), rows);
  const greens = mix(vec3(0.2, 0.4, 0.3), vec3(0.34, 0.52, 0.34), rows);
  const tilled = mix(mix(maize, hay, smoothstep(0.42, 0.58, crop)), greens, smoothstep(0.75, 0.92, crop));
  const farmed = mix(flowered, tilled, smoothstep(0.18, 0.3, crop));
  const land = mix(farmed, mix(rock, vec3(0.74, 0.66, 0.3), lichen.mul(0.26)).mul(tideLine), rocky);

  const sand = mix(vec3(0.82, 0.74, 0.56), vec3(0.94, 0.89, 0.73), fine);
  const along = vec2(BEACH.bx - BEACH.ax, BEACH.bz - BEACH.az);
  const from: N = vec2(xz).sub(vec2(BEACH.ax, BEACH.az));
  const nearest = from.sub(along.mul(from.dot(along).div(along.dot(along)).clamp(0, 1))).length();
  const strand = smoothstep(BEACH.reach, BEACH.reach * 0.62, nearest).mul(smoothstep(10.5, 7.5, height.add(stroke.mul(2))));
  const beach = smoothstep(3.0, 1.3, height.add(stroke.mul(2.2))).mul(smoothstep(0.42, 0.2, slope)).max(strand);
  const wet = smoothstep(1.2, -0.4, height);
  const dirt = mix(vec3(0.6, 0.5, 0.37), vec3(0.72, 0.63, 0.48), fine);
  const worn = smoothstep(0.3, 0.55, groundMask(xz).r.add(stroke.mul(0.35)));
  const surface = mix(mix(mix(land, dirt, worn), sand, beach), vec3(0.52, 0.47, 0.38), wet.mul(0.7));
  const asphalt = mix(vec3(0.1, 0.11, 0.15), vec3(0.17, 0.18, 0.24), fine);
  const tiles = floor(vec2(xz).div(6));
  const check = fract(tiles.x.add(tiles.y).mul(0.5)).mul(2);
  const shadeTile = noise(tiles.mul(0.0613)).r;
  const pixel = mix(mix(vec3(0.24, 0.56, 0.5), vec3(0.36, 0.3, 0.6), check), vec3(0.95, 0.62, 0.4), step(0.8, shadeTile).mul(0.6));
  const zoned = mix(mix(surface, asphalt, within(xz, CITY)), pixel, within(xz, ARCADE));
  return zoned.mul(grain.sub(0.5).mul(0.22).add(1));
}

export function createTerrain(map: HeightMap, step: number): THREE.Mesh {
  const grid = (MAP_RES - 1) / step;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, grid, grid);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, map.sample(position.getX(i), position.getZ(i)));
  }
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  const material = new THREE.MeshBasicNodeMaterial();
  const xz = positionWorld.xz;
  const normal = terrainNormal(xz);
  const albedo = terrainAlbedo(xz, positionWorld.y, normal);
  const drift = time.mul(0.012);
  const web = noise(xz.mul(0.045).add(drift)).r.sub(0.5).abs().add(noise(xz.mul(0.061).sub(drift.mul(1.3))).g.sub(0.5).abs());
  const caustic = smoothstep(0.1, 0.02, web).mul(smoothstep(0.2, -1.2, positionWorld.y)).mul(smoothstep(-16, -4, positionWorld.y)).mul(float(1).sub(env.night));
  material.colorNode = applyFog(paint(albedo, normal, positionWorld, float(1)).add(terrainGlow(xz)).add(env.sunColor.mul(caustic).mul(0.22)), positionWorld);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  return mesh;
}
