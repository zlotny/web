import { MAP_RES, WORLD_SIZE, type HeightMap } from '../world/height';
import { ARCADE, CITY } from '../world/zones';

export const CHART_SIZE = 1024;
export const CHART_SPAN = 3400;

let cached: HTMLCanvasElement | null = null;

export const chartPx = (v: number): number => (v / CHART_SPAN + 0.5) * (CHART_SIZE - 1);

export function chart(map: HeightMap): HTMLCanvasElement {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CHART_SIZE;
  const c = canvas.getContext('2d')!;
  const image = c.createImageData(CHART_SIZE, CHART_SIZE);
  const d = map.data;
  for (let j = 0; j < CHART_SIZE; j++) {
    for (let i = 0; i < CHART_SIZE; i++) {
      const x = (i / (CHART_SIZE - 1) - 0.5) * CHART_SPAN;
      const z = (j / (CHART_SIZE - 1) - 0.5) * CHART_SPAN;
      const mi = Math.max(1, Math.min(MAP_RES - 2, Math.round(((x + WORLD_SIZE / 2) / WORLD_SIZE) * (MAP_RES - 1))));
      const mj = Math.max(1, Math.min(MAP_RES - 2, Math.round(((z + WORLD_SIZE / 2) / WORLD_SIZE) * (MAP_RES - 1))));
      const k = mj * MAP_RES + mi;
      const h = d[k];
      const light = Math.max(-1, Math.min(1, (d[k + 1] - d[k - 1] + d[k + MAP_RES] - d[k - MAP_RES]) * 0.07));
      let r: number;
      let g: number;
      let b: number;
      if (h < 0) {
        const deep = Math.min(1, -h / 30);
        r = 150 - deep * 62;
        g = 196 - deep * 58;
        b = 206 - deep * 40;
      } else if (h < 2.5) {
        r = 236;
        g = 220;
        b = 176;
      } else {
        const t = Math.min(1, h / 170);
        r = 128 + t * 70 + light * 34;
        g = 158 - t * 14 + light * 34;
        b = 96 + t * 62 + light * 30;
      }
      const band = h < 2.5 || Math.floor(h / 22) % 2 === 0 ? 1 : 0.955;
      const o = (j * CHART_SIZE + i) * 4;
      image.data[o] = r * band;
      image.data[o + 1] = g * band;
      image.data[o + 2] = b * band;
      image.data[o + 3] = 255;
    }
  }
  c.putImageData(image, 0, 0);
  for (const [zone, fill, line] of [
    [CITY, 'rgba(70,60,140,0.5)', '#58e6ff'],
    [ARCADE, 'rgba(230,120,170,0.45)', '#ffd24a'],
  ] as const) {
    c.beginPath();
    c.arc(chartPx(zone.x), chartPx(zone.z), (zone.radius / CHART_SPAN) * CHART_SIZE, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = line;
    c.stroke();
  }
  cached = canvas;
  return canvas;
}
