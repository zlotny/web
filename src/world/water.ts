import * as THREE from 'three/webgpu';
import {
  cameraPosition,
  cos,
  dot,
  float,
  fract,
  max,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  reflect,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { step } from 'three/tsl';
import { applyFog, cloudShadow, env, groundHeight, groundLight, noise, type N } from './shading';
import { skyColor } from './sky';

export const SWELL: [number, number, number, number][] = [
  [0.62, 0.78, 96, 1.25],
  [0.86, 0.5, 57, 0.68],
  [0.28, 0.96, 33, 0.36],
  [0.96, -0.26, 21, 0.18],
];

export function swellPhase(xz: N, index: number): N {
  const [dx, dz, length] = SWELL[index];
  const k = (Math.PI * 2) / length;
  return xz.x.mul(dx * k).add(xz.y.mul(dz * k)).sub(time.mul(Math.sqrt(9.81 * k)));
}

function swell(xz: N): { height: N; slopeX: N; slopeZ: N } {
  let height: N = float(0);
  let slopeX: N = float(0);
  let slopeZ: N = float(0);
  SWELL.forEach(([dx, dz, length, amplitude], index) => {
    const k = (Math.PI * 2) / length;
    const phase = swellPhase(xz, index);
    height = height.add(sin(phase).mul(amplitude));
    slopeX = slopeX.add(cos(phase).mul(amplitude * k * dx));
    slopeZ = slopeZ.add(cos(phase).mul(amplitude * k * dz));
  });
  return { height, slopeX, slopeZ };
}

export function createWater(): THREE.Mesh {
  const cells = 240;
  const geometry = new THREE.PlaneGeometry(2, 2, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const stretch = (u: number) => (Math.sinh(u * 6.4) / Math.sinh(6.4)) * 15000;
  for (let i = 0; i < position.count; i++) position.setXYZ(i, stretch(position.getX(i)), 0, stretch(position.getZ(i)));
  geometry.deleteAttribute('normal');
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });

  const origin = uniform(new THREE.Vector2());
  const local: N = positionGeometry;
  const flat: N = vec2(local.x.add(origin.x), local.z.add(origin.y));
  const calm = (at: N): N => {
    const reach = 16;
    const sum = groundHeight(at)
      .add(groundHeight(at.add(vec2(reach, 0))))
      .add(groundHeight(at.sub(vec2(reach, 0))))
      .add(groundHeight(at.add(vec2(0, reach))))
      .add(groundHeight(at.sub(vec2(0, reach))));
    const below = max(sum.div(5).negate(), 0);
    const open = smoothstep(640, 1120, at.length()).mul(0.9).add(0.1);
    return smoothstep(3, 26, below).mul(open);
  };
  const near = smoothstep(1500, 500, local.xz.length());
  material.positionNode = vec3(flat.x, swell(flat).height.mul(calm(flat)).mul(near), flat.y);

  const xz = positionWorld.xz;
  const ground = groundHeight(xz);
  const depth = max(ground.negate(), 0);
  const waves = swell(xz);
  const far = smoothstep(1500, 420, positionWorld.sub(cameraPosition).length());
  const power: N = calm(xz).mul(far);
  const lift: N = waves.height.mul(power).div(2.2);

  const t = time.mul(0.05);
  const n1 = noise(xz.mul(0.011).add(env.wind.mul(t))).rg;
  const n2 = noise(xz.mul(0.037).sub(env.wind.yx.mul(t.mul(1.6)))).gb;
  const n3 = noise(xz.mul(0.0023).add(t.mul(0.3))).ba;
  const ripple = n1.sub(0.5).mul(0.5).mul(far.mul(0.7).add(0.3)).add(n2.sub(0.5).mul(0.28).mul(far)).add(n3.sub(0.5).mul(0.42));
  const normal = normalize(vec3(ripple.x.sub(waves.slopeX.mul(power).mul(5)), 1.6, ripple.y.sub(waves.slopeZ.mul(power).mul(5))));

  const view = normalize(positionWorld.sub(cameraPosition));
  const fresnel = pow(float(1).sub(max(dot(view.negate(), normal), 0)), 4).mul(0.86).add(0.06);
  const reflected = reflect(view, normal);
  const skyRef = skyColor(normalize(vec3(reflected.x, max(reflected.y, 0.02), reflected.z)));

  const shallow = vec3(0.16, 0.6, 0.58);
  const mid = vec3(0.05, 0.3, 0.42);
  const deep = vec3(0.02, 0.12, 0.26);
  const body = mix(mix(shallow, mid, smoothstep(0.5, 7, depth)), deep, smoothstep(6, 30, depth));
  const shade = cloudShadow(xz).mul(groundLight(xz).r.mul(0.6).add(0.4));
  const lit = body.mul(lift.mul(0.3).add(1)).mul(env.ambientSky.mul(1.5).add(env.sunColor.mul(0.34).mul(shade)));

  const glint = pow(max(dot(reflected, env.sunDir), 0), 180).mul(smoothstep(0.52, 0.72, n2.x.add(n1.y).mul(0.5))).mul(far).mul(6);
  const lobe = pow(max(dot(reflected, env.sunDir), 0), 9);
  const grit = noise(xz.mul(0.83).add(t.mul(3.1))).r.mul(noise(xz.mul(1.37).sub(t.mul(2.3))).g);
  const glitter = smoothstep(0.5, 0.58, grit).mul(lobe).mul(float(1).sub(env.night)).mul(9);
  let color = mix(lit, skyRef, fresnel).mul(lift.mul(0.24).add(1)).add(env.sunColor.mul(glint.add(glitter)).mul(shade));

  const e = 5;
  const slopeX = groundHeight(xz.add(vec2(e, 0))).sub(groundHeight(xz.sub(vec2(e, 0))));
  const slopeZ = groundHeight(xz.add(vec2(0, e))).sub(groundHeight(xz.sub(vec2(0, e))));
  const steep = smoothstep(2.5, 11, slopeX.abs().add(slopeZ.abs()));

  const lace = noise(xz.mul(0.09).add(t.mul(2))).a;
  const froth = noise(xz.mul(0.031).sub(t.mul(1.4))).b;
  const set = n3.x.mul(7).add(noise(xz.mul(0.0009)).g.mul(9));
  const roll = fract(depth.mul(0.11).add(time.mul(0.13)).add(set.mul(0.16)));
  const zone = smoothstep(13, 6, depth).mul(smoothstep(0.05, 0.9, depth));
  const crest = smoothstep(0.8, 0.95, roll).mul(smoothstep(1.0, 0.985, roll));
  const wash = smoothstep(0.3, 0.0, roll).mul(smoothstep(0.5, 0.85, lace.add(froth.mul(0.5))));
  const breaker = max(crest, wash.mul(0.45)).mul(zone).mul(smoothstep(9, 2.5, depth).mul(0.75).add(0.25));
  const tide = sin(time.mul(0.82).add(set)).mul(0.5).add(0.5);
  const swash = smoothstep(tide.mul(0.75).add(0.22), 0.0, depth).mul(smoothstep(0.2, 0.55, lace.add(tide.mul(0.35))));
  const surge = smoothstep(-0.2, 0.9, sin(swellPhase(xz, 0).add(n3.x.mul(2))));
  const wall = smoothstep(1.5, 9, slopeX.abs().add(slopeZ.abs()));
  const band = smoothstep(surge.mul(20).add(7), surge.mul(3).add(1), depth);
  const boil = smoothstep(surge.mul(-0.22).add(0.6), surge.mul(-0.22).add(0.82), froth.mul(0.6).add(lace.mul(0.6)));
  const backwash = smoothstep(0.42, 0.6, noise(xz.mul(0.017).add(vec2(slopeX, slopeZ).normalize().mul(time.mul(0.03)))).r).mul(smoothstep(34, 10, depth)).mul(surge.oneMinus()).mul(0.5);
  const contact = smoothstep(2.2, 0.2, depth).mul(surge.mul(0.5).add(0.5));
  const churn = wall.mul(max(max(band.mul(boil.mul(0.75).add(surge.mul(0.25))), backwash), contact));
  void steep;
  const cap = smoothstep(0.66, 1.0, lift.add(lace.sub(0.5).mul(0.4))).mul(smoothstep(0.5, 0.68, froth)).mul(power).mul(0.55);
  const off = xz.sub(env.bird.xz).length();
  const skim = smoothstep(5, 1.2, env.bird.y).mul(smoothstep(0.3, 2, depth));
  const rings = smoothstep(0.8, 0.98, sin(off.mul(3.2).sub(time.mul(9)))).mul(smoothstep(6.5, 1, off)).mul(smoothstep(0.2, 1.2, off)).mul(skim);
  const foam = max(max(max(max(breaker, swash), churn), cap), rings.mul(0.55)).clamp(0, 1);
  const face = smoothstep(0.62, 0.8, roll).mul(smoothstep(0.86, 0.8, roll)).mul(zone);
  color = mix(color, vec3(0.2, 0.62, 0.6).mul(shade.mul(0.6).add(0.5)), face.mul(0.45));
  color = mix(color, vec3(0.95, 0.97, 0.96).mul(shade.mul(0.5).add(0.6)), foam.mul(0.92));

  color = color.add(vec3(0.08, 0.85, 1.0).mul(foam.mul(0.9).add(rings.mul(1.4))).mul(env.night).mul(1.3));
  material.colorNode = applyFog(color, positionWorld);
  const brink = step(-2700, xz.x);
  material.opacityNode = brink.mul(smoothstep(0.0, 0.5, depth).mul(0.5).add(0.5).mul(smoothstep(-0.05, 0.08, depth)).add(foam).min(1));

  const mesh = new THREE.Mesh(geometry, material);
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    origin.value.set(camera.position.x, camera.position.z);
  };
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = 'water';
  return mesh;
}
