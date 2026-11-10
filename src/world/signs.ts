import * as THREE from 'three/webgpu';
import { attribute, floor, mix, sin, texture, time, uv, vec2 } from 'three/tsl';
import type { N } from './shading';

export type RGB3 = [number, number, number];

export interface Sign {
  text: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  height: number;
  color: RGB3;
  vertical?: boolean;
}

const COLUMNS = 2;
const ROWS = 24;
const SLOT_W = 1024;
const SLOT_H = 84;

export function createSigns(signs: Sign[], pixel = 0, plate = true): THREE.Mesh {
  const words = [...new Set(signs.map((sign) => sign.text))].slice(0, COLUMNS * ROWS);
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * SLOT_W;
  canvas.height = ROWS * SLOT_H;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff';
  context.textBaseline = 'middle';
  context.font = `700 ${Math.round(SLOT_H * 0.74)}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  const widths = new Map<string, number>();
  words.forEach((word, i) => {
    const width = Math.min(SLOT_W - 24, context.measureText(word).width);
    widths.set(word, width);
    context.fillText(word, (i % COLUMNS) * SLOT_W + 12, Math.floor(i / COLUMNS) * SLOT_H + SLOT_H / 2 + 2, SLOT_W - 24);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter;
  atlas.generateMipmaps = true;

  const positions: number[] = [];
  const uvs: number[] = [];
  const tints: number[] = [];
  const seeds: number[] = [];
  const corner = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  signs.forEach((sign, n) => {
    const slot = words.indexOf(sign.text);
    if (slot < 0) return;
    const span = widths.get(sign.text)! + 24;
    const wide = (span / SLOT_H) * sign.height;
    const u0 = ((slot % COLUMNS) * SLOT_W) / canvas.width;
    const u1 = ((slot % COLUMNS) * SLOT_W + span) / canvas.width;
    const v1 = 1 - (Math.floor(slot / COLUMNS) * SLOT_H) / canvas.height;
    const v0 = 1 - ((Math.floor(slot / COLUMNS) + 1) * SLOT_H) / canvas.height;
    matrix.makeRotationY(sign.yaw);
    if (sign.vertical) matrix.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
    matrix.setPosition(sign.x, sign.y, sign.z);
    const quad: [number, number, number, number][] = [
      [-wide / 2, -sign.height / 2, u0, v0],
      [wide / 2, -sign.height / 2, u1, v0],
      [wide / 2, sign.height / 2, u1, v1],
      [-wide / 2, sign.height / 2, u0, v1],
    ];
    for (const face of [1, -1]) {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [px, py, u, v] = quad[i];
        corner.set(px * face, py, 0).applyMatrix4(matrix);
        positions.push(corner.x, corner.y, corner.z);
        uvs.push(u, v);
        tints.push(...sign.color);
        seeds.push(n * 0.731);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));

  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: plate ? THREE.NormalBlending : THREE.AdditiveBlending });
  const at: N = uv();
  const grid = vec2(canvas.width / pixel, canvas.height / pixel);
  const sample: N = pixel ? floor(at.mul(grid)).add(0.5).div(grid) : at;
  const ink = texture(atlas, sample).r;
  const seed: N = attribute('seed', 'float');
  const flicker = sin(time.mul(2.3).add(seed.mul(17))).mul(0.12).add(0.88).mul(sin(time.mul(31).add(seed.mul(5))).mul(0.04).add(0.96));
  const tint: N = attribute('tint', 'vec3');
  material.colorNode = plate ? mix(tint.mul(0.035), tint.mul(flicker).mul(1.9), ink) : tint.mul(ink).mul(flicker).mul(2.4);
  material.opacityNode = plate ? ink.max(0.96) : ink;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 22;
  return mesh;
}
