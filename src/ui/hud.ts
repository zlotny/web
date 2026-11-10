import { LANGUAGES, content, language, onLanguage, setLanguage } from '../content';
import type { Language, PlaceId, SpotId } from '../content/types';
import type { Input } from '../core/input';

const NAMES = ['Andrés Vieira', 'ndrs', 'zlotny'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function rotatingName(className: string): HTMLElement {
  const wrap = el('span', `names ${className}`);
  const items = NAMES.map((name, i) => {
    const item = el('span', i === 0 ? 'name on' : 'name', name);
    wrap.append(item);
    return item;
  });
  let index = 0;
  setInterval(() => {
    items[index].classList.remove('on');
    index = (index + 1) % items.length;
    items[index].classList.add('on');
  }, 3200);
  return wrap;
}

export class Hud {
  onStart: () => void = () => {};
  onVisit: () => void = () => {};
  onLeave: () => void = () => {};
  onSound: () => boolean = () => false;
  onWarp: (id: PlaceId | SpotId) => void = () => {};
  onTerminal: () => void = () => {};
  onPlay: () => void = () => {};
  onTour: () => void = () => {};
  onPostcard: () => void = () => {};
  onWhistle: () => void = () => {};
  onFinale: () => void = () => {};

  private root = document.getElementById('ui')!;
  private intro = el('section', 'intro');
  private tagline = el('p', 'tagline');
  private startButton = el('button', 'start');
  private hint = el('p', 'hint');
  private loading = el('p', 'loading');
  private bar = el('header', 'bar');
  private plainLinks: HTMLAnchorElement[] = [];
  private prompt = el('button', 'prompt');
  private panel = el('aside', 'panel');
  private panelBody = el('div', 'panel-body');
  private leave = el('button', 'leave');
  private progress = el('button', 'progress');
  private compass = el('div', 'compass');
  private needle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private compassLabel = el('span');
  private remaining = 0;
  private sound = el('button', 'sound');
  private tip = el('p', 'tip');
  private tipKey: 'takeoff' | 'sea' | null = null;
  private warp = el('button', 'warp');
  private warpLabel = el('span');
  private warpMenu = el('nav', 'warp-menu');
  private warpIds: (PlaceId | SpotId)[] = [];
  private flashLayer = el('div', 'flash');
  private toasts = el('div', 'toasts');
  private shell = el('button', 'shell', '~ λ');
  private percent = 0;
  private timer = el('div', 'timer');
  private tourButton = el('button', 'tour');
  private camera = el('button', 'sound camera');
  private stick = el('div', 'stick');
  private knob = el('div', 'knob');
  private flap = el('button', 'pad flap');
  private brake = el('button', 'pad brake');
  private place: PlaceId | null = null;
  private open: PlaceId | null = null;
  private total = 0;
  private seen = 0;

  constructor(private input: Input) {
    const title = el('h1', 'title');
    title.append(rotatingName('big'));
    const langs = (className: string) => {
      const nav = el('nav', `langs ${className}`);
      for (const code of Object.keys(LANGUAGES) as Language[]) {
        const button = el('button', 'lang', code.toUpperCase());
        button.dataset.lang = code;
        button.title = LANGUAGES[code].language;
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          setLanguage(code);
        });
        nav.append(button);
      }
      return nav;
    };
    const plain = () => {
      const link = el('a', 'plain');
      link.href = '/plain/';
      this.plainLinks.push(link);
      return link;
    };

    this.toasts.setAttribute('aria-live', 'polite');
    this.panel.setAttribute('aria-live', 'polite');
    this.loading.classList.add('on');
    const actions = el('div', 'actions');
    this.tourButton.addEventListener('click', () => this.onTour());
    actions.append(this.startButton, this.tourButton, plain());
    this.intro.append(title, this.tagline, this.loading, actions, langs('intro-langs'), this.hint);
    this.startButton.disabled = true;
    this.startButton.addEventListener('click', () => this.onStart());

    const brand = el('div', 'brand');
    brand.append(rotatingName('small'));
    const tools = el('div', 'tools');
    this.sound.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.4v13.2l-4.8-4.1H4z" fill="currentColor"/><path class="waves" d="M15 9.2a4 4 0 0 1 0 5.6M17.4 6.8a7.4 7.4 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path class="mute" d="M15.2 9.6l4.8 4.8M20 9.6l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    this.sound.setAttribute('aria-pressed', 'false');
    const toggleSound = () => {
      const on = this.onSound();
      this.sound.classList.toggle('on', on);
      this.sound.setAttribute('aria-pressed', String(on));
    };
    this.sound.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSound();
    });
    this.shell.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onTerminal();
    });
    this.camera.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3.2l1.4-2h6.8l1.4 2H20v10H4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
    this.camera.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPostcard();
    });
    this.progress.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onWhistle();
    });
    this.needle.setAttribute('viewBox', '0 0 24 24');
    this.needle.innerHTML = '<path d="M12 2l6 18-6-4-6 4z" fill="currentColor"/>';
    this.compass.append(this.needle, this.compassLabel);
    tools.append(this.progress, this.shell, this.camera, this.sound, langs('bar-langs'), plain());
    this.bar.append(brand, tools);

    this.prompt.addEventListener('click', () => this.onVisit());
    this.leave.addEventListener('click', () => this.onLeave());
    this.panel.append(this.panelBody, this.leave);

    this.stick.append(this.knob);
    this.flap.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 30c8-2 12-8 18-18 2 9 8 14 18 16-8 1-13 4-18 9-4-5-10-7-18-7z" fill="currentColor"/></svg>';
    this.brake.innerHTML =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c7 9 9 20 4 34l-4 6-4-6C15 24 17 13 24 4z" fill="currentColor"/></svg>';
    input.bindButton(this.flap, 'flap');
    input.bindButton(this.brake, 'brake');

    this.warp.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z" fill="currentColor"/></svg>';
    this.warp.append(this.warpLabel);
    this.warp.addEventListener('click', (e) => {
      e.stopPropagation();
      this.warpMenu.classList.toggle('on');
    });
    this.root.append(this.flashLayer, this.compass, this.toasts, this.timer, this.bar, this.tip, this.prompt, this.panel, this.stick, this.flap, this.brake, this.warpMenu, this.warp, this.intro);
    for (const node of [this.bar, this.intro, this.panel, this.prompt, this.warp, this.warpMenu]) {
      node.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.onLeave();
      if (e.code === 'KeyM' && !e.repeat) toggleSound();
    });

    onLanguage(() => this.render());
  }

  private render(): void {
    const c = content();
    this.tagline.textContent = c.ui.tagline;
    this.startButton.textContent = c.ui.start;
    this.tourButton.textContent = c.ui.tour;
    this.camera.title = c.ui.postcard;
    this.camera.setAttribute('aria-label', c.ui.postcard);
    this.loading.textContent = c.ui.loading;
    for (const link of this.plainLinks) {
      link.textContent = c.ui.plain;
      link.href = `/plain/?lang=${language()}`;
    }
    this.leave.textContent = c.ui.leave;
    this.sound.setAttribute('aria-label', c.ui.sound);
    this.sound.title = c.ui.sound;
    this.flap.setAttribute('aria-label', c.ui.flap);
    this.brake.setAttribute('aria-label', c.ui.brake);
    this.hint.textContent = this.input.touch ? c.ui.hintTouch : c.ui.hintKeys;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.lang')) {
      button.classList.toggle('on', button.dataset.lang === language());
    }
    this.warpLabel.textContent = c.ui.warp;
    this.renderWarps();
    this.renderTip();
    this.renderPrompt();
    this.renderProgress();
    if (this.open) this.renderPanel(this.open);
  }

  private renderPrompt(): void {
    if (!this.place) return;
    const c = content();
    this.prompt.innerHTML = '';
    if (!this.input.touch) this.prompt.append(el('kbd', undefined, 'E'));
    this.prompt.append(el('span', undefined, `${c.ui.visit}: ${c.places[this.place].name}`));
  }

  private renderTip(): void {
    const c = content();
    this.tip.textContent = this.tipKey === 'sea' ? c.ui.tipSea : this.tipKey === 'takeoff' ? (this.input.touch ? c.ui.tipTakeoffTouch : c.ui.tipTakeoff) : this.tip.textContent;
  }

  private renderWarps(): void {
    const c = content();
    this.warpMenu.innerHTML = '';
    for (const id of this.warpIds) {
      const name = id in c.places ? c.places[id as PlaceId].name : c.spots[id as SpotId];
      const item = el('button', 'warp-item', name);
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.warpMenu.classList.remove('on');
        this.onWarp(id);
      });
      this.warpMenu.append(item);
    }
  }

  setWarps(ids: (PlaceId | SpotId)[]): void {
    this.warpIds = ids;
    this.renderWarps();
  }

  setTip(key: 'takeoff' | 'sea' | null): void {
    if (key === this.tipKey) return;
    this.tipKey = key;
    this.renderTip();
    this.tip.classList.toggle('on', key !== null);
  }

  flash(on: boolean): void {
    this.flashLayer.classList.toggle('on', on);
  }

  private renderProgress(): void {
    this.progress.textContent = this.total ? `${this.percent}% · ${this.seen}/${this.total} ${content().ui.visited}` : '';
    this.progress.title = content().ui.whistle;
    this.shell.title = content().terminal.button;
    this.shell.setAttribute('aria-label', content().terminal.button);
  }

  private renderPanel(id: PlaceId): void {
    const place = content().places[id];
    this.panelBody.innerHTML = '';
    this.panelBody.append(el('p', 'kicker', place.kicker), el('h2', undefined, place.title));
    for (const paragraph of place.body) this.panelBody.append(el('p', undefined, paragraph));
    if (id === 'lighthouse') {
      const now = new Date();
      const time = new Intl.DateTimeFormat(language(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(now);
      const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Madrid' }).format(now));
      const ui = content().ui;
      this.panelBody.append(el('p', 'clock', `${ui.clock.replace('{t}', time)} ${hour >= 1 && hour < 8 ? ui.clockNight : ui.clockDay}`));
    }
    const quip = el('blockquote', 'quip');
    quip.append(el('cite', undefined, content().ui.leloSays), el('span', undefined, content().quips[id]));
    this.panelBody.append(quip);
    const tags = el('ul', 'tags');
    for (const tag of place.tags) tags.append(el('li', undefined, tag));
    this.panelBody.append(tags);
    if (id === 'bench') {
      const mail = el('a', 'play', content().ui.write);
      mail.href = ['mailto:anvieiravazquez', 'gmail.com'].join('@');
      const more = el('p', 'links');
      for (const [label, url] of [
        ['GitHub', 'https://github.com/zlotny'],
        ['LinkedIn', 'https://www.linkedin.com/in/andrés-vieira-5393aaa4/'],
      ]) {
        const a = el('a', 'link', label);
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        more.append(a);
      }
      this.panelBody.append(mail, more);
      if (this.remaining > 0) {
        this.panelBody.append(el('p', 'locked', content().ui.finaleLocked.replace('{n}', String(this.remaining))));
      } else {
        const sunset = el('button', 'play', content().ui.finale);
        sunset.addEventListener('click', () => this.onFinale());
        this.panelBody.append(sunset);
      }
    }
    if (id === 'jam') {
      const play = el('button', 'play', content().game.seeds.play);
      play.addEventListener('click', () => this.onPlay());
      this.panelBody.append(play);
    }
    if (place.link) {
      const link = el('a', 'link', place.link.label);
      link.href = place.link.url;
      link.target = '_blank';
      link.rel = 'noopener';
      this.panelBody.append(link);
    }
  }

  ready(): void {
    this.loading.classList.remove('on');
    this.startButton.disabled = false;
    this.startButton.focus({ preventScroll: true });
  }

  start(): void {
    this.intro.classList.add('gone');
    document.body.classList.add('flying');
    this.render();
  }

  pressSound(): void {
    this.sound.click();
  }

  setFinale(remaining: number): void {
    if (remaining === this.remaining) return;
    this.remaining = remaining;
    if (this.open === 'bench') this.renderPanel('bench');
  }

  setCompass(text: string | null, angle = 0): void {
    this.compass.classList.toggle('on', text !== null);
    if (text === null) return;
    if (this.compassLabel.textContent !== text) this.compassLabel.textContent = text;
    this.needle.style.transform = `rotate(${angle}rad)`;
  }

  setTimer(text: string | null): void {
    this.timer.textContent = text ?? '';
    this.timer.classList.toggle('on', text !== null);
  }

  toast(title: string, text: string, hold = 3800): void {
    const card = el('div', 'toast');
    card.append(el('strong', undefined, title), el('span', undefined, text));
    this.toasts.append(card);
    setTimeout(() => card.classList.add('gone'), hold);
    setTimeout(() => card.remove(), hold + 800);
  }

  append(node: HTMLElement): void {
    this.root.append(node);
  }

  setProgress(seen: number, total: number, percent = this.percent): void {
    this.seen = seen;
    this.total = total;
    this.percent = percent;
    this.renderProgress();
  }

  setPrompt(place: PlaceId | null): void {
    if (place === this.place) return;
    this.place = place;
    this.prompt.classList.toggle('on', place !== null);
    this.renderPrompt();
  }

  openPanel(place: PlaceId): void {
    this.open = place;
    this.renderPanel(place);
    this.panelBody.scrollTop = 0;
    this.panel.classList.add('on');
    this.warpMenu.classList.remove('on');
    document.body.classList.add('visiting');
  }

  panelSize(): { width: number; height: number } {
    return { width: this.panel.offsetWidth, height: this.panel.offsetHeight };
  }

  closePanel(): void {
    this.open = null;
    this.panel.classList.remove('on');
    document.body.classList.remove('visiting');
  }

  update(): void {
    const stick = this.input.stick;
    const show = stick.active && this.input.touch;
    this.stick.classList.toggle('on', show);
    document.body.classList.toggle('touch', this.input.touch);
    if (show) {
      this.stick.style.transform = `translate(${stick.originX}px, ${stick.originY}px)`;
      this.knob.style.transform = `translate(${stick.x * 44}px, ${stick.y * 44}px)`;
    }
  }
}
