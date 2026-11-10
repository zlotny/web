import * as THREE from 'three/webgpu';
import { attribute, cameraPosition, float, fract, mix, normalize, positionGeometry, sin, smoothstep, time, uv, varying, vec2, vec3 } from 'three/tsl';
import { mulberry32 } from '../core/noise';
import { MAP_RES, WORLD_SIZE, type HeightMap } from './height';
import { applyFog, env, noise, type N } from './shading';
import { SWELL, swellPhase } from './water';

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)]);

export function createSurf(map: HeightMap, limit: number): THREE.Mesh {
  const rand = mulberry32(4711);
  const half = WORLD_SIZE / 2;
  const step = (WORLD_SIZE / (MAP_RES - 1)) * 2;
  const spots: number[] = [];
  const taken = new Set<number>();
  const gap = 34;
  for (let z = -half + 20; z < half - 20; z += step) {
    for (let x = -half + 20; x < half - 20; x += step) {
      const px = x + rand() * step;
      const pz = z + rand() * step;
      const h = map.sample(px, pz);
      if (h > -0.8 || h < -14) continue;
      let wall = 0;
      let wx = 0;
      let wz = 0;
      for (const [dx, dz] of DIRECTIONS) {
        const land = map.sample(px + dx * 11, pz + dz * 11);
        if (land > wall) {
          wall = land;
          wx = dx;
          wz = dz;
        }
      }
      if (wall < 7) continue;
      const facing = -(wx * SWELL[0][0] + wz * SWELL[0][1]);
      if (facing > 0.55 && rand() > 0.25) continue;
      let reach = 0;
      while (reach < 11 && map.sample(px + wx * (reach + 1), pz + wz * (reach + 1)) < -0.3) reach++;
      const sx = px + wx * reach;
      const sz = pz + wz * reach;
      const cell = Math.floor(sx / gap) * 4096 + Math.floor(sz / gap);
      if (taken.has(cell)) continue;
      taken.add(cell);
      spots.push(sx, sz, rand(), 0.75 + rand() * 0.7 + Math.min(wall, 40) * 0.012);
    }
  }
  const total = spots.length / 4;
  const count = Math.min(limit, total);
  const data = new Float32Array(count * 4);
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < count; i++) data.set(spots.slice(order[i] * 4, order[i] * 4 + 4), i * 4);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('spot', new THREE.InstancedBufferAttribute(data, 4));
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const spot: N = attribute('spot', 'vec4');
  const beat: N = swellPhase(spot.xy, 0).negate().div(Math.PI * 2).add(spot.z.mul(0.12));
  const pick = fract(beat.floor().mul(0.37).add(spot.z.mul(5.7)));
  const life: N = fract(beat).mul(1.35).add(smoothstep(0.5, 0.52, pick).mul(4));
  const toCamera: N = normalize(vec3(cameraPosition.x.sub(spot.x), 0, cameraPosition.z.sub(spot.y)));
  const right: N = vec3(toCamera.z, 0, toCamera.x.negate());
  const local: N = positionGeometry;
  const width: N = spot.w.mul(17);
  const height: N = spot.w.mul(6.5);
  material.positionNode = vec3(spot.x, -0.3, spot.y)
    .add(right.mul(local.x.mul(width)))
    .add(vec3(0, local.y.add(0.5).mul(height), 0))
    .add(toCamera.mul(1.5));

  const age: N = varying(life);
  const seed: N = varying(spot.z);
  const tex: N = uv();
  const side = tex.x.sub(0.5).abs().mul(2);
  const rise: N = sin(age.min(0.5).mul(Math.PI)).mul(0.95).add(0.05);
  const fan = smoothstep(0, 0.35, tex.y.mul(0.35).add(0.62).sub(side));
  const cap = smoothstep(rise, rise.sub(0.45), tex.y);
  const streak = noise(vec2(tex.x.mul(0.42).add(seed.mul(5.3)), tex.y.mul(0.2).sub(age.mul(0.22)).add(seed))).r;
  const grain = noise(tex.mul(1.3).add(seed.mul(9))).a;
  const body = streak.mul(0.65).add(grain.mul(0.35)).add(tex.y.oneMinus().mul(0.3));
  const erode = smoothstep(age.mul(0.5).add(0.31), age.mul(0.5).add(0.5), body);
  const fade = smoothstep(0, 0.04, age).mul(smoothstep(0.62, 0.36, age));
  const lit = mix(vec3(0.8, 0.88, 0.93), vec3(1, 1, 1), tex.y).mul(env.ambientSky.mul(0.9).add(env.sunColor.mul(0.32)));
  material.colorNode = applyFog(lit, vec3(spot.x, float(2), spot.y));
  material.opacityNode = fan.mul(cap).mul(erode).mul(fade).mul(0.95);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.name = 'surf';
  mesh.userData.count = count;

  const veils = Math.min(Math.round(limit * 0.45), total);
  const veilData = new Float32Array(veils * 4);
  for (let i = 0; i < veils; i++) veilData.set(spots.slice(order[total - 1 - i] * 4, order[total - 1 - i] * 4 + 4), i * 4);
  const veilGeometry = new THREE.PlaneGeometry(1, 1);
  veilGeometry.setAttribute('spot', new THREE.InstancedBufferAttribute(veilData, 4));
  const veil = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const place: N = attribute('spot', 'vec4');
  const facing: N = normalize(vec3(cameraPosition.x.sub(place.x), 0, cameraPosition.z.sub(place.y)));
  const across: N = vec3(facing.z, 0, facing.x.negate());
  const quad: N = positionGeometry;
  const drift = sin(time.mul(0.07).add(place.z.mul(40))).mul(9);
  const base: N = vec3(place.x.add(across.x.mul(drift)), 0, place.y.add(across.z.mul(drift)));
  veil.positionNode = base.add(across.mul(quad.x.mul(120))).add(vec3(0, quad.y.add(0.42).mul(place.w.mul(34)), 0)).add(facing.mul(6));
  const at: N = uv();
  const billow = noise(vec2(at.x.mul(0.5).add(place.z.mul(7)).add(time.mul(0.006)), at.y.mul(0.3).sub(time.mul(0.012)))).r;
  const wisp = noise(vec2(at.x.mul(1.4).sub(time.mul(0.01)), at.y.mul(0.8).add(place.z))).g;
  const shape = smoothstep(0, 0.3, at.x).mul(smoothstep(1, 0.7, at.x)).mul(smoothstep(0, 0.12, at.y)).mul(float(1).sub(at.y).pow(1.7));
  const beat2 = sin(swellPhase(place.xy, 0)).mul(0.25).add(0.75);
  const closeness = cameraPosition.sub(base).length();
  const thin = smoothstep(18, 70, closeness).mul(smoothstep(2400, 900, closeness));
  veil.colorNode = applyFog(mix(vec3(0.86, 0.91, 0.95), vec3(1, 0.98, 0.94), at.y).mul(env.ambientSky.mul(0.85).add(env.sunColor.mul(0.3))), vec3(base.x, float(6), base.z));
  veil.opacityNode = shape.mul(smoothstep(0.25, 0.75, billow.mul(0.7).add(wisp.mul(0.5)))).mul(beat2).mul(thin).mul(0.34);
  const haze = new THREE.Mesh(veilGeometry, veil);
  haze.count = veils;
  haze.frustumCulled = false;
  haze.renderOrder = 14;
  haze.name = 'mist';
  mesh.add(haze);
  return mesh;
}
