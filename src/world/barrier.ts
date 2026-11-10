import * as THREE from 'three/webgpu';
import { atan, float, floor, fract, mix, positionLocal, sin, smoothstep, step, time, vec2, vec3 } from 'three/tsl';
import type { HeightMap } from './height';
import type { Obstacles } from './obstacles';
import { Sculpt, type RGB } from './sculpt';
import { noise, type N } from './shading';

export interface BarrierZone {
  x: number;
  z: number;
  radius: number;
}

const HALO = 170;

function halo(zone: BarrierZone, base: number, style: 'neon' | 'pixel'): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(zone.radius, zone.radius, HALO, 160, 1, true);
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const local: N = positionLocal;
  const rise: N = local.y.div(HALO).add(0.5);
  const around: N = atan(local.z, local.x).div(Math.PI * 2).add(0.5);
  const fade = float(1).sub(rise).pow(1.7).mul(smoothstep(0, 0.02, rise));
  if (style === 'neon') {
    const columns = around.mul(1500);
    const column = floor(columns);
    const roll = noise(vec2(column.mul(0.0173), 0.37));
    const dash = fract(rise.mul(5).sub(time.mul(roll.r.mul(0.25).add(0.08))).add(roll.g.mul(7)));
    const streak = smoothstep(0.5, 1, dash).mul(step(0.62, roll.b));
    const wire = smoothstep(0.42, 0.5, fract(columns.div(12)).sub(0.5).abs()).mul(0.35);
    const band = smoothstep(0.47, 0.5, fract(rise.mul(26).sub(time.mul(0.12))).sub(0.5).abs()).mul(0.35);
    const sweep = sin(around.mul(Math.PI * 12).add(time.mul(0.5))).mul(0.5).add(0.5);
    material.colorNode = mix(vec3(0.1, 0.9, 1.0), vec3(1.0, 0.2, 0.8), sweep).mul(streak.mul(1.6).add(wire).add(band).add(0.16));
    material.opacityNode = fade.mul(streak.mul(0.42).add(wire.mul(0.4)).add(band.mul(0.4)).add(0.07));
  } else {
    const cell: N = floor(vec2(around.mul(300), rise.mul(26)));
    const tick = floor(time.mul(3));
    const roll = noise(cell.mul(0.0371).add(vec2(tick.mul(0.013), tick.mul(0.007))));
    const lit = step(rise.mul(0.75).add(0.3), roll.r);
    const hue = fract(cell.y.mul(0.09).add(cell.x.mul(0.004)).add(time.mul(0.03)));
    const rainbow = vec3(sin(hue.mul(6.283)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(2.09)).mul(0.5).add(0.5), sin(hue.mul(6.283).add(4.18)).mul(0.5).add(0.5));
    material.colorNode = rainbow.mul(lit.mul(1.3).add(0.1));
    material.opacityNode = fade.mul(lit.mul(0.6).add(0.12));
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(zone.x, base + HALO / 2, zone.z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 26;
  return mesh;
}

export function createBarrier(zone: BarrierZone, style: 'neon' | 'pixel', map: HeightMap, obstacles: Obstacles, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = `barrier-${style}`;
  const s = new Sculpt(style === 'neon' ? 31 : 32);
  s.jitter = 0.05;
  const step2 = style === 'neon' ? 8 : 6;
  const count = Math.round((Math.PI * 2 * zone.radius) / step2);
  const long = (Math.PI * 2 * zone.radius) / count;
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = zone.x + Math.cos(angle) * zone.radius;
    const z = zone.z + Math.sin(angle) * zone.radius;
    const ground = Math.max(map.sample(x, z), 0);
    lowest = Math.min(lowest, ground);
    s.push(x, ground, z, -angle + Math.PI / 2);
    let top = 0;
    if (style === 'neon') {
      const pylon = i % 6 === 0;
      const dark: RGB = [0.1, 0.11, 0.17];
      const steel: RGB = [0.2, 0.22, 0.31];
      const accent: RGB = i % 12 < 6 ? [0.2, 0.95, 1.0] : [1.0, 0.22, 0.75];
      s.glow = 0.6;
      s.box(0, 3, 0, long + 0.3, 12, 2.4, i % 2 ? dark : steel);
      s.box(0, 9.6, 0, long + 0.3, 0.8, 3.2, steel);
      top = 10;
      if (pylon) {
        s.box(0, 6, 0, 3.4, 22, 4.2, dark, 0.8);
        top = 18;
      }
      s.glow = 1;
      s.box(0, 8.6, 1.26, long + 0.3, 0.35, 0.12, accent);
      s.box(0, 8.6, -1.26, long + 0.3, 0.35, 0.12, accent);
      s.box(0, 4.4, 1.26, long * 0.5, 0.2, 0.1, accent);
      s.box(0, 4.4, -1.26, long * 0.5, 0.2, 0.1, accent);
      if (pylon) {
        s.box(0, 17.6, 0, 2.2, 1.2, 2.8, accent);
        s.box(0, 11, 2.16, 0.5, 9, 0.12, accent);
        s.box(0, 11, -2.16, 0.5, 9, 0.12, accent);
      }
      s.glow = 0;
    } else {
      const palette: RGB[] = [
        [0.86, 0.42, 0.2],
        [0.74, 0.34, 0.18],
        [0.92, 0.55, 0.26],
      ];
      const tower = i % 9 === 0;
      const levels = tower ? 4 : i % 2 ? 3 : 2;
      for (let level = 0; level < levels; level++) {
        s.box(0, -1 + level * 4 + 2, 0, long + 0.2, 4, 4, palette[(i + level) % palette.length]);
        s.box(0, -1 + level * 4 + 3.86, 0, long + 0.3, 0.3, 4.2, [0.98, 0.78, 0.5]);
      }
      top = levels * 4 - 1;
      if (tower) {
        s.glow = 1;
        s.box(0, top + 2.4, 0, 2.6, 2.6, 2.6, [[1.0, 0.85, 0.2], [0.3, 0.9, 1.0], [1.0, 0.4, 0.75]][(i / 9) % 3 | 0] as RGB);
        s.glow = 0;
      }
    }
    s.pop();
    if (i % 2 === 0) obstacles.add(x, z, long * 1.05, ground - 2, ground + top + 0.5);
    highest = Math.max(highest, ground + top);
  }
  const wall = new THREE.Mesh(s.geometry(), material);
  wall.frustumCulled = false;
  group.add(wall, halo(zone, lowest - 4, style));
  group.userData.top = highest;
  return group;
}
