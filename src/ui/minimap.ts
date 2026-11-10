import { content } from '../content';
import type { PlaceId } from '../content/types';
import type { HeightMap } from '../world/height';
import { CHART_SIZE, CHART_SPAN, chart, chartPx } from './chart';

export interface Marker {
  id: PlaceId;
  x: number;
  z: number;
  seen: boolean;
}

export interface Waypoint {
  x: number;
  z: number;
  id: PlaceId | null;
}

const DISC = 148;
const REACH = 430;
const SHEET = 720;
const VIEW = 2760;

export class Minimap {
  readonly root = document.createElement('div');
  onWaypoint: (waypoint: Waypoint | null) => void = () => {};
  open = false;
  private disc = document.createElement('canvas');
  private sheet = document.createElement('div');
  private big = document.createElement('canvas');
  private hint = document.createElement('p');
  private ratio = Math.min(2, window.devicePixelRatio || 1);
  private last = 0;
  private markers: Marker[] = [];
  private waypoint: Waypoint | null = null;
  private extras: { x: number; z: number; color: string }[] = [];
  private pose = { x: 0, z: 0, yaw: 0 };

  constructor(private map: HeightMap) {
    this.root.className = 'minimap';
    this.disc.width = this.disc.height = DISC * this.ratio;
    this.disc.className = 'minimap-disc';
    this.disc.setAttribute('role', 'button');
    this.disc.tabIndex = 0;
    this.sheet.className = 'map-sheet';
    this.big.width = this.big.height = SHEET * this.ratio;
    this.sheet.append(this.big, this.hint);
    this.root.append(this.disc, this.sheet);
    for (const node of [this.disc, this.sheet]) node.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.disc.addEventListener('click', () => this.toggle());
    this.sheet.addEventListener('click', (e) => {
      if (e.target !== this.big) {
        this.toggle(false);
        return;
      }
      const box = this.big.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width - 0.5) * VIEW;
      const z = ((e.clientY - box.top) / box.height - 0.5) * VIEW;
      let best: Marker | null = null;
      let near = (26 / box.width) * VIEW;
      for (const marker of this.markers) {
        const d = Math.hypot(marker.x - x, marker.z - z);
        if (d < near) {
          near = d;
          best = marker;
        }
      }
      const same = this.waypoint && Math.hypot(this.waypoint.x - x, this.waypoint.z - z) < (22 / box.width) * VIEW;
      this.onWaypoint(same ? null : best ? { x: best.x, z: best.z, id: best.id } : { x, z, id: null });
      this.toggle(false);
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.toggle(false);
    });
  }

  toggle(next = !this.open): void {
    if (next === this.open) return;
    this.open = next;
    this.sheet.classList.toggle('on', next);
    this.hint.textContent = content().ui.mapHint;
    this.disc.title = content().ui.map;
    if (next) this.drawSheet();
  }

  set(markers: Marker[], waypoint: Waypoint | null, extras: { x: number; z: number; color: string }[]): void {
    this.markers = markers;
    this.waypoint = waypoint;
    this.extras = extras;
  }

  update(now: number, x: number, z: number, yaw: number): void {
    if (now - this.last < 50) return;
    this.last = now;
    this.pose.x = x;
    this.pose.z = z;
    this.pose.yaw = yaw;
    this.drawDisc(now);
    if (this.open) this.drawSheet();
  }

  private drawDisc(now: number): void {
    const c = this.disc.getContext('2d')!;
    const size = DISC * this.ratio;
    const half = size / 2;
    const scale = half / REACH;
    const turn = this.pose.yaw - Math.PI;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, size, size);
    c.save();
    c.beginPath();
    c.arc(half, half, half - 2 * this.ratio, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#5e96aa';
    c.fillRect(0, 0, size, size);
    c.translate(half, half);
    c.rotate(turn);
    const unit = (CHART_SPAN / CHART_SIZE) * scale;
    c.imageSmoothingQuality = 'high';
    c.drawImage(chart(this.map), -chartPx(this.pose.x) * unit, -chartPx(this.pose.z) * unit, CHART_SIZE * unit, CHART_SIZE * unit);
    c.restore();

    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const place = (wx: number, wz: number): [number, number, boolean] => {
      const dx = (wx - this.pose.x) * scale;
      const dz = (wz - this.pose.z) * scale;
      let px = dx * cos - dz * sin;
      let py = dx * sin + dz * cos;
      const far = Math.hypot(px, py);
      const rim = half - 9 * this.ratio;
      const out = far > rim;
      if (out) {
        px *= rim / far;
        py *= rim / far;
      }
      return [half + px, half + py, out];
    };
    const dot = (wx: number, wz: number, radius: number, fill: string, ring: string | null, keep: boolean) => {
      const [px, py, out] = place(wx, wz);
      if (out && !keep) return;
      c.beginPath();
      c.arc(px, py, radius * this.ratio * (out ? 0.7 : 1), 0, Math.PI * 2);
      c.fillStyle = fill;
      c.fill();
      if (ring) {
        c.lineWidth = 1.5 * this.ratio;
        c.strokeStyle = ring;
        c.stroke();
      }
    };
    for (const extra of this.extras) dot(extra.x, extra.z, 2.2, extra.color, null, false);
    for (const marker of this.markers) dot(marker.x, marker.z, marker.seen ? 3 : 4.2, marker.seen ? 'rgba(244,236,216,0.75)' : '#f6dd52', marker.seen ? null : '#3a2c0c', !marker.seen);
    if (this.waypoint) {
      const [px, py] = place(this.waypoint.x, this.waypoint.z);
      const beat = 1 + Math.sin(now * 0.006) * 0.25;
      c.beginPath();
      c.arc(px, py, 7.5 * this.ratio * beat, 0, Math.PI * 2);
      c.lineWidth = 2.2 * this.ratio;
      c.strokeStyle = '#ff6a3c';
      c.stroke();
      c.beginPath();
      c.arc(px, py, 3 * this.ratio, 0, Math.PI * 2);
      c.fillStyle = '#ff6a3c';
      c.fill();
    }

    c.save();
    c.translate(half, half);
    c.scale(this.ratio, this.ratio);
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6, 7);
    c.lineTo(0, 3.5);
    c.lineTo(-6, 7);
    c.closePath();
    c.fillStyle = '#fff8dc';
    c.strokeStyle = '#2a2418';
    c.lineWidth = 1.4;
    c.fill();
    c.stroke();
    c.restore();

    c.beginPath();
    c.arc(half, half, half - 2 * this.ratio, 0, Math.PI * 2);
    c.lineWidth = 3 * this.ratio;
    c.strokeStyle = 'rgba(244,236,216,0.9)';
    c.stroke();
    const north = half - 11 * this.ratio;
    const nx = half + Math.sin(turn) * north;
    const ny = half - Math.cos(turn) * north;
    c.beginPath();
    c.arc(nx, ny, 8 * this.ratio, 0, Math.PI * 2);
    c.fillStyle = '#b8442e';
    c.fill();
    c.fillStyle = '#fff8dc';
    c.font = `700 ${10 * this.ratio}px ui-sans-serif, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('N', nx, ny + 0.5 * this.ratio);
  }

  private drawSheet(): void {
    const c = this.big.getContext('2d')!;
    const size = SHEET * this.ratio;
    const px = (v: number) => (v / VIEW + 0.5) * size;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const from = chartPx(-VIEW / 2);
    const side = chartPx(VIEW / 2) - from;
    c.drawImage(chart(this.map), from, from, side, side, 0, 0, size, size);
    const boxes: [number, number, number, number][] = [];
    const names = content().places;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.font = `600 ${11 * this.ratio}px ui-sans-serif, system-ui, sans-serif`;
    c.lineJoin = 'round';
    for (const marker of this.markers) {
      const x = px(marker.x);
      const y = px(marker.z);
      c.beginPath();
      c.arc(x, y, 6 * this.ratio, 0, Math.PI * 2);
      c.fillStyle = marker.seen ? '#f4ecd8' : '#f6dd52';
      c.fill();
      c.lineWidth = 2 * this.ratio;
      c.strokeStyle = marker.seen ? '#6b5a36' : '#b8442e';
      c.stroke();
      boxes.push([x - 8 * this.ratio, y - 8 * this.ratio, 16 * this.ratio, 16 * this.ratio]);
    }
    for (const marker of this.markers) {
      const x = px(marker.x);
      const y = px(marker.z);
      const label = names[marker.id].name;
      const w = c.measureText(label).width + 6 * this.ratio;
      const h = 14 * this.ratio;
      const spots: [number, number][] = [
        [x - w / 2, y + 8 * this.ratio],
        [x - w / 2, y - 8 * this.ratio - h],
        [x + 9 * this.ratio, y - h / 2],
        [x - 9 * this.ratio - w, y - h / 2],
      ];
      const spot = spots.find(([bx, by]) => bx > 0 && by > 0 && bx + w < size && by + h < size && !boxes.some(([ox, oy, ow, oh]) => bx < ox + ow && bx + w > ox && by < oy + oh && by + h > oy));
      if (!spot) continue;
      boxes.push([spot[0], spot[1], w, h]);
      c.lineWidth = 3.5 * this.ratio;
      c.strokeStyle = 'rgba(244,236,216,0.9)';
      c.strokeText(label, spot[0] + w / 2, spot[1] + 1.5 * this.ratio);
      c.fillStyle = '#2a2418';
      c.fillText(label, spot[0] + w / 2, spot[1] + 1.5 * this.ratio);
    }
    if (this.waypoint) {
      c.beginPath();
      c.setLineDash([6 * this.ratio, 6 * this.ratio]);
      c.moveTo(px(this.pose.x), px(this.pose.z));
      c.lineTo(px(this.waypoint.x), px(this.waypoint.z));
      c.lineWidth = 2 * this.ratio;
      c.strokeStyle = '#ff6a3c';
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(px(this.waypoint.x), px(this.waypoint.z), 10 * this.ratio, 0, Math.PI * 2);
      c.lineWidth = 3 * this.ratio;
      c.stroke();
    }
    c.save();
    c.translate(px(this.pose.x), px(this.pose.z));
    c.rotate(Math.PI - this.pose.yaw);
    c.scale(this.ratio, this.ratio);
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(7.5, 9);
    c.lineTo(0, 4.5);
    c.lineTo(-7.5, 9);
    c.closePath();
    c.fillStyle = '#fff8dc';
    c.strokeStyle = '#2a2418';
    c.lineWidth = 1.6;
    c.fill();
    c.stroke();
    c.restore();
  }
}
