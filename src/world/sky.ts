import * as THREE from 'three/webgpu';
import { dot, float, max, mix, normalize, positionLocal, pow, smoothstep, time, vec2, vec3 } from 'three/tsl';
import { env, fogColorFor, noise, type N } from './shading';

export function skyColor(dir: N): N {
  const up = max(dir.y, 0);
  const base = mix(env.skyHorizon, env.skyTop, pow(up, 0.55));
  const toSun = max(dot(dir, env.orb), 0);
  const halo = pow(toSun, 24).mul(0.9).add(pow(toSun, 3).mul(0.22));
  const disc = smoothstep(0.9988, 0.9994, toSun).mul(14);
  const lit = base.add(env.sunColor.mul(halo.add(disc)).mul(0.45).mul(float(1).sub(env.night)));

  const plane = dir.xz.div(dir.y.add(0.16));
  const drift = env.wind.mul(time.mul(0.004));
  const p = plane.mul(0.11).add(drift);
  const warp = noise(p.mul(0.6).add(drift)).rg.sub(0.5).mul(0.22);
  const big = noise(p.add(warp)).r;
  const detail = noise(p.mul(3.1).add(warp.mul(2)).sub(drift)).g;
  const wisps = noise(p.mul(8.3).add(drift.mul(3))).b;
  const density = big.mul(0.62).add(detail.mul(0.28)).add(wisps.mul(0.1));
  const cover = smoothstep(0.46, 0.66, density);
  const core = smoothstep(0.55, 0.85, density);

  const sunSide = pow(toSun, 2);
  const bright = mix(vec3(0.96, 0.95, 0.93), env.sunColor.mul(0.62), sunSide.mul(0.6));
  const shade = mix(vec3(0.5, 0.54, 0.62), vec3(0.3, 0.32, 0.4), core);
  const cloud = mix(bright, shade, core.mul(mix(float(0.95), float(0.55), sunSide)));
  const horizonFade = smoothstep(0.0, 0.2, dir.y);
  const withClouds = mix(lit, cloud, cover.mul(horizonFade).mul(0.94));

  const starField = noise(plane.mul(2.3)).b.mul(noise(plane.mul(5.9).add(0.37)).r);
  const twinkle = noise(plane.mul(1.1).add(time.mul(0.02))).g.mul(0.6).add(0.5);
  const stars = smoothstep(0.42, 0.56, starField).mul(twinkle).mul(cover.oneMinus()).mul(horizonFade).mul(env.night);
  const toMoon = max(dot(dir, env.moon), 0);
  const moon = smoothstep(0.9989, 0.9993, toMoon).mul(2.2).add(pow(toMoon, 60).mul(0.25)).mul(env.night).mul(cover.mul(0.7).oneMinus());
  const axis = normalize(vec3(0.34, 0.5, -0.8));
  const lane: N = dot(dir, axis);
  const dust = noise(plane.mul(0.9).add(3.7)).r.mul(0.6).add(noise(plane.mul(3.3)).g.mul(0.4));
  const milky = lane.mul(lane).mul(-26).exp().mul(smoothstep(0.25, 0.75, dust)).mul(cover.oneMinus()).mul(horizonFade).mul(env.night);
  const tick: N = time.div(6.5);
  const id: N = tick.floor();
  const shot: N = tick.fract().div(0.11);
  const h = (k: number): N => id.mul(12.9898 + k * 7.31).sin().mul(43758.5453).fract();
  const from: N = vec2(h(0).sub(0.5), h(1).sub(0.5)).mul(2.6);
  const way: N = vec2(h(2).sub(0.5), h(3).sub(0.5)).normalize();
  const head: N = from.add(way.mul(shot.mul(1.5)));
  const tail: N = head.sub(way.mul(0.5));
  const pa: N = plane.sub(tail);
  const ba: N = head.sub(tail);
  const along: N = pa.dot(ba).div(ba.dot(ba)).clamp(0, 1);
  const streak = smoothstep(0.014, 0.0, pa.sub(ba.mul(along)).length()).mul(along.mul(along)).mul(smoothstep(1.0, 0.8, shot)).mul(h(4).step(0.75)).mul(horizonFade).mul(env.night);
  const lightning = env.flash.mul(smoothstep(-0.1, 0.5, dir.y)).mul(0.8);
  const night = withClouds.add(vec3(0.85, 0.9, 1.0).mul(stars.mul(1.5).add(moon).add(streak.mul(3)))).add(vec3(0.5, 0.56, 0.85).mul(milky.mul(0.34))).add(vec3(0.8, 0.85, 1.0).mul(lightning));

  const haze = smoothstep(0.16, -0.02, dir.y);
  return mix(night, fogColorFor(dir), haze);
}

export function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  material.colorNode = skyColor(normalize(positionLocal));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.setScalar(9000);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.name = 'sky';
  return mesh;
}
