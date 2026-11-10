import { content } from '../content';
import type { HeightMap } from '../world/height';
import { chart, chartPx } from './chart';

export interface FinaleData {
  places: number;
  placeTotal: number;
  feathers: number;
  featherTotal: number;
  minutes: number;
  track: number[];
  stamps: [number, number][];
  cards: string[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SIZE = 640;
const VIEW = 2900;

export class Finale {
  readonly root = el('section', 'finale');
  open = false;
  onClose: () => void = () => {};

  constructor(private map: HeightMap) {
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    window.addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.close();
    });
  }

  private draw(data: FinaleData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const c = canvas.getContext('2d')!;
    const from = chartPx(-VIEW / 2);
    const side = chartPx(VIEW / 2) - from;
    c.drawImage(chart(this.map), from, from, side, side, 0, 0, SIZE, SIZE);
    const px = (v: number) => (v / VIEW + 0.5) * (SIZE - 1);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [width, style] of [
      [7, 'rgba(60,40,10,0.35)'],
      [3.2, '#f6dd52'],
    ] as const) {
      c.lineWidth = width;
      c.strokeStyle = style;
      c.beginPath();
      let pen = false;
      for (let i = 0; i < data.track.length; i += 2) {
        const jump = i > 0 && Math.hypot(data.track[i] - data.track[i - 2], data.track[i + 1] - data.track[i - 1]) > 160;
        if (!pen || jump) c.moveTo(px(data.track[i]), px(data.track[i + 1]));
        else c.lineTo(px(data.track[i]), px(data.track[i + 1]));
        pen = true;
      }
      c.stroke();
    }
    for (const [x, z] of data.stamps) {
      c.fillStyle = '#b8442e';
      c.beginPath();
      c.arc(px(x), px(z), 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#f4ecd8';
      c.beginPath();
      c.arc(px(x), px(z), 3, 0, Math.PI * 2);
      c.fill();
    }
    return canvas;
  }

  show(data: FinaleData): void {
    const t = content().end;
    this.root.innerHTML = '';
    const sheet = el('div', 'finale-sheet');
    const stats = el('ul', 'finale-stats');
    for (const [value, label] of [
      [`${data.places}/${data.placeTotal}`, t.places],
      [`${data.feathers}/${data.featherTotal}`, t.feathers],
      [String(data.minutes), t.minutes],
    ]) {
      const item = el('li');
      item.append(el('strong', undefined, value), el('span', undefined, label));
      stats.append(item);
    }
    const figure = el('figure', 'finale-map');
    figure.append(this.draw(data), el('figcaption', undefined, t.route));
    sheet.append(el('p', 'kicker', 'ndrs.es'), el('h2', undefined, t.thanks), el('p', 'finale-line', t.line), figure, stats);
    if (data.cards.length) {
      const strip = el('div', 'finale-cards');
      for (const url of data.cards) {
        const image = el('img');
        image.src = url;
        image.alt = '';
        strip.append(image);
      }
      sheet.append(el('p', 'kicker', t.postcards), strip);
    }
    const credits = el('div', 'finale-credits');
    for (const line of t.credits) credits.append(el('p', undefined, line));
    const again = el('button', 'play', t.again);
    again.addEventListener('click', () => this.close());
    sheet.append(credits, again);
    this.root.append(sheet);
    this.root.classList.add('on');
    this.open = true;
    again.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    this.onClose();
  }
}
