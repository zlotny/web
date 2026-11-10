export type AchievementId =
  | 'landing'
  | 'warp'
  | 'feather'
  | 'feathers'
  | 'places'
  | 'neon'
  | 'pixel'
  | 'sea'
  | 'summit'
  | 'wreck'
  | 'terminal'
  | 'konami'
  | 'race'
  | 'nods'
  | 'edge'
  | 'compana'
  | 'sunset'
  | 'galicia'
  | 'boat';

export const ACHIEVEMENTS: AchievementId[] = ['landing', 'warp', 'feather', 'feathers', 'places', 'neon', 'pixel', 'sea', 'summit', 'wreck', 'terminal', 'konami', 'race', 'nods', 'edge', 'compana', 'sunset', 'galicia', 'boat'];

const KEY = 'ndrs.progress';

interface Saved {
  feathers: number[];
  nods?: number[];
  achievements: AchievementId[];
  best: number;
}

export class Progress {
  readonly feathers = new Set<number>();
  readonly achievements = new Set<AchievementId>();
  readonly nods = new Set<number>();
  nodTotal = 0;
  best = 0;
  onUnlock: (id: AchievementId) => void = () => {};
  onChange: () => void = () => {};

  constructor(
    readonly featherTotal: number,
    private places: () => { seen: number; total: number },
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
      if (saved) {
        const list = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);
        for (const i of list(saved.feathers)) if (Number.isInteger(i) && i >= 0 && i < featherTotal) this.feathers.add(i);
        for (const id of list(saved.achievements)) if (ACHIEVEMENTS.includes(id)) this.achievements.add(id);
        this.best = Number.isFinite(saved.best) && saved.best > 0 ? saved.best : 0;
        for (const i of list(saved.nods)) if (Number.isInteger(i) && i >= 0) this.nods.add(i);
      }
    } catch {}
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ nods: [...this.nods], feathers: [...this.feathers], achievements: [...this.achievements], best: this.best }));
    } catch {}
    this.onChange();
  }

  unlock(id: AchievementId): void {
    if (this.achievements.has(id)) return;
    this.achievements.add(id);
    this.save();
    this.onUnlock(id);
  }

  collect(index: number): boolean {
    if (this.feathers.has(index)) return false;
    this.feathers.add(index);
    this.save();
    this.unlock('feather');
    if (this.feathers.size === this.featherTotal) this.unlock('feathers');
    return true;
  }

  spot(index: number): boolean {
    if (this.nods.has(index)) return false;
    this.nods.add(index);
    this.save();
    if (this.nods.size >= this.nodTotal) this.unlock('nods');
    return true;
  }

  record(seconds: number): boolean {
    const better = this.best === 0 || seconds < this.best;
    if (better) this.best = seconds;
    this.save();
    this.unlock('race');
    return better;
  }

  refresh(): void {
    const places = this.places();
    if (places.seen === places.total) this.unlock('places');
    this.onChange();
  }

  percent(): number {
    const places = this.places();
    const done = places.seen + this.feathers.size + this.achievements.size + Math.min(this.nods.size, this.nodTotal);
    const total = places.total + this.featherTotal + ACHIEVEMENTS.length + this.nodTotal;
    return Math.floor((done / total) * 100);
  }

  reset(): void {
    this.feathers.clear();
    this.nods.clear();
    this.achievements.clear();
    this.best = 0;
    this.save();
  }
}
