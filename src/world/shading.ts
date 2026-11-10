import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  dot,
  exp,
  float,
  length,
  max,
  mix,
  normalize,
  pow,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { tileableNoiseData } from '../core/noise';
import { MAP_RES, WORLD_SIZE, type HeightMap } from './height';

export type N = any;

const NOISE_SIZE = 256;

export const noiseTexture = (() => {
  const tex = new THREE.DataTexture(tileableNoiseData(NOISE_SIZE, 7), NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
})();

export const env = {
  sunDir: uniform(new THREE.Vector3(-0.62, 0.42, -0.34).normalize()),
  sunColor: uniform(new THREE.Color(1.0, 0.84, 0.62).multiplyScalar(2.5)),
  skyTop: uniform(new THREE.Color(0.08, 0.24, 0.62)),
  skyHorizon: uniform(new THREE.Color(0.6, 0.74, 0.88)),
  ambientSky: uniform(new THREE.Color(0.56, 0.68, 0.92)),
  ambientGround: uniform(new THREE.Color(0.5, 0.45, 0.36)),
  fogDensity: uniform(0.00024),
  wind: uniform(new THREE.Vector2(0.8, 0.35)),
  bird: uniform(new THREE.Vector3(0, 999, 0)),
  orb: uniform(new THREE.Vector3(-0.62, 0.42, -0.34).normalize()),
  moon: uniform(new THREE.Vector3(0.45, 0.62, 0.5).normalize()),
  shadowRight: uniform(new THREE.Vector3(1, 0, 0)),
  shadowUp: uniform(new THREE.Vector3(0, 0, 1)),
  night: uniform(0),
  flash: uniform(0),
};

export const SHADOW_HALF = 2.3;
export const birdShadow = new THREE.RenderTarget(256, 256, { depthBuffer: false });

export const noise = (uv: N): N => texture(noiseTexture, uv);

export const mapUV = (xz: N): N =>
  xz
    .add(WORLD_SIZE / 2)
    .div(WORLD_SIZE / (MAP_RES - 1))
    .add(0.5)
    .div(MAP_RES);

export const LIGHT_RES = 512;

export const heightTexture = (() => {
  const tex = new THREE.DataTexture(new Uint16Array(MAP_RES * MAP_RES), MAP_RES, MAP_RES, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
})();

export const lightTexture = (() => {
  const tex = new THREE.DataTexture(new Uint8Array(LIGHT_RES * LIGHT_RES * 4).fill(255), LIGHT_RES, LIGHT_RES, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
})();

export const MASK_RES = 1024;

export const maskTexture = (() => {
  const tex = new THREE.DataTexture(new Uint8Array(MASK_RES * MASK_RES * 4), MASK_RES, MASK_RES, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
})();

export function uploadMask(data: Uint8Array): void {
  (maskTexture.image.data as Uint8Array).set(data);
  maskTexture.needsUpdate = true;
}

export const groundMask = (xz: N): N => texture(maskTexture, xz.div(WORLD_SIZE).add(0.5));

export function uploadHeight(map: HeightMap): void {
  const half = heightTexture.image.data as Uint16Array;
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(map.data[i]);
  heightTexture.needsUpdate = true;
}

export function uploadLight(data: Uint8Array): void {
  (lightTexture.image.data as Uint8Array).set(data);
  lightTexture.needsUpdate = true;
}

export const groundHeight = (xz: N): N => texture(heightTexture, mapUV(xz)).r;

export const groundLight = (xz: N): N => texture(lightTexture, xz.div(WORLD_SIZE).add(0.5));

export const cloudShadow = Fn(([xz]: [N]) => {
  const drift = env.wind.mul(time.mul(6));
  const a = noise(xz.add(drift).mul(0.00042)).r;
  const b = noise(xz.add(drift.mul(1.7)).mul(0.0013)).g;
  const cover = a.mul(0.72).add(b.mul(0.28));
  return smoothstep(0.42, 0.6, cover).oneMinus().mul(0.62).add(0.38);
});

export const fogColorFor = Fn(([viewDir]: [N]) => {
  const toSun = max(dot(viewDir, env.sunDir), 0);
  const glow = pow(toSun, 6).mul(0.55);
  return mix(env.skyHorizon, env.sunColor.mul(0.42), glow);
});

export const applyFog = Fn(([color, worldPos]: [N, N]) => {
  const offset = worldPos.sub(cameraPosition);
  const dist = length(offset);
  const heightFade = exp(max(worldPos.y, 0).mul(-0.006)).mul(0.75).add(0.25);
  const amount = exp(dist.mul(env.fogDensity).mul(heightFade).negate()).oneMinus();
  return mix(color, fogColorFor(normalize(offset)), amount.mul(0.94));
});

export function paint(albedo: N, normal: N, worldPos: N, shade: N = float(1), shadowFloor = 0, dappled = true): N {
  const baked = groundLight(worldPos.xz);
  let shadow: N = mix(float(shadowFloor), float(1), baked.r);
  if (dappled) {
    const sway = env.wind.mul(time.mul(0.35));
    const leaves = noise(worldPos.xz.add(sway).mul(0.045)).a.mul(0.7).add(noise(worldPos.xz.sub(sway).mul(0.13)).r.mul(0.3));
    const spots = smoothstep(0.3, 0.52, leaves).mul(0.8).add(0.2);
    shadow = shadow.mul(mix(float(1), spots, groundMask(worldPos.xz).g));
  }
  const occlusion = mix(float(shadowFloor), float(1), baked.g);
  const lit = smoothstep(-0.18, 0.55, dot(normal, env.sunDir));
  const clouds = cloudShadow(worldPos.xz);
  const hemi = mix(env.ambientGround, env.ambientSky, normal.y.mul(0.5).add(0.5)).mul(occlusion);
  const direct = env.sunColor.mul(lit).mul(clouds).mul(shadow).mul(shade);
  const light = hemi.mul(mix(float(0.75), float(1), clouds)).add(direct).add(vec3(0.7, 0.75, 0.9).mul(env.flash));
  const rel: N = vec3(worldPos).sub(env.bird);
  const drop: N = rel.dot(env.sunDir).negate();
  const at: N = vec2(rel.dot(env.shadowRight), rel.dot(env.shadowUp)).div(SHADOW_HALF * 2).add(0.5);
  const blur: N = drop.mul(0.0011).add(0.006);
  const tap = (ox: number, oy: number): N => texture(birdShadow.texture, at.add(vec2(ox, oy).mul(blur))).r;
  const shape: N = tap(1, 0.4).add(tap(-0.4, 1)).add(tap(-1, -0.4)).add(tap(0.4, -1)).mul(0.25);
  const inside = step(0.0, at.x).mul(step(at.x, 1.0)).mul(step(0.0, at.y)).mul(step(at.y, 1.0));
  const under = shape.mul(inside).mul(smoothstep(0.5, 1.2, drop)).mul(smoothstep(150, 20, drop)).mul(float(1).sub(env.night.mul(0.6)));
  return pow(vec3(albedo).max(0), vec3(2.2)).mul(light).mul(float(1).sub(under.mul(0.55)));
}

export const brush = Fn(([xz, scale]: [N, N]) => {
  const p = vec2(xz).mul(scale);
  const warp = noise(p.mul(0.35)).rg.sub(0.5).mul(0.6);
  return noise(p.add(warp)).b;
});
