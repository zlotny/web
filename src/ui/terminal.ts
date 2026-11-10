import { content, language, setLanguage, LANGUAGES } from '../content';
import type { Language, PlaceId } from '../content/types';

export interface TerminalHost {
  warps: () => string[];
  warp: (id: string) => boolean;
  sound: () => boolean;
  status: () => string[];
  stats: () => string[];
  cheat: (name: 'turbo' | 'feathers' | 'reset' | 'party') => string;
  play: () => void;
  form: (name: string) => boolean;
  sky: (name: string) => boolean;
  opened: () => void;
  closed: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class Terminal {
  readonly root = el('section', 'terminal');
  private log = el('div', 'terminal-log');
  private input = el('input', 'terminal-input');
  private history: string[] = [];
  private cursor = 0;
  open = false;

  constructor(private host: TerminalHost) {
    const bar = el('header', 'terminal-bar');
    const close = el('button', 'terminal-close', '×');
    close.addEventListener('click', () => this.toggle(false));
    bar.append(el('span', undefined, 'lelo@ndrs.es: ~'), close);
    const line = el('label', 'terminal-line');
    this.input.spellcheck = false;
    this.input.autocapitalize = 'off';
    this.input.autocomplete = 'off';
    this.input.setAttribute('aria-label', 'terminal');
    line.append(el('span', 'terminal-prompt', '~ λ'), this.input);
    this.root.append(bar, this.log, line);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        this.input.value = '';
        if (text) {
          this.history.push(text);
          this.cursor = this.history.length;
          this.print(`~ λ ${text}`, 'echo');
          this.run(text);
        }
      } else if (e.key === 'Escape') {
        this.toggle(false);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.cursor = Math.max(0, Math.min(this.history.length, this.cursor + (e.key === 'ArrowUp' ? -1 : 1)));
        this.input.value = this.history[this.cursor] ?? '';
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const names = ['help', 'whoami', 'ls', 'cat', 'warp', 'lang', 'sound', 'status', 'stats', 'clear', 'exit', ...this.host.warps().map((id) => `warp ${id}`), ...Object.keys(this.files()).map((f) => `cat ${f}`)];
        const match = names.filter((name) => name.startsWith(this.input.value));
        if (match.length === 1) this.input.value = match[0];
        else if (match.length > 1) this.print(match.join('   '));
      }
    });
    this.print(content().terminal.welcome);
  }

  toggle(next = !this.open): void {
    if (next === this.open) return;
    this.open = next;
    this.root.classList.toggle('on', next);
    if (next) {
      this.input.focus({ preventScroll: true });
      this.host.opened();
    } else {
      this.input.blur();
      this.host.closed();
    }
  }

  print(text: string | string[], kind = ''): void {
    for (const row of Array.isArray(text) ? text : [text]) this.log.append(el('p', kind || undefined, row));
    while (this.log.childElementCount > 200) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private files(): Record<string, string[]> {
    const c = content();
    const email = ['anvieiravazquez', 'gmail.com'].join(' at ');
    return {
      'about.txt': c.places.lighthouse.body,
      'roots.txt': c.places.village.body,
      'work.txt': [...c.places.fullstack.body, '', ...c.places.backend.body, '', ...c.places.infra.body, '', ...c.places.agents.body],
      'games.txt': [...c.places.consoles.body, '', ...c.places.lan.body, '', ...c.places.jam.body],
      'contact.txt': [`${c.plain.email}: ${email}`, 'GitHub: https://github.com/zlotny', 'LinkedIn: https://www.linkedin.com/in/andrés-vieira-5393aaa4/'],
      'lelo.txt': c.terminal.lelo,
    };
  }

  private run(text: string): void {
    const c = content().terminal;
    const [command, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    switch (command.toLowerCase()) {
      case 'help':
        this.print(c.help);
        break;
      case 'whoami':
        this.print(c.whoami);
        break;
      case 'ls':
        this.print(Object.keys(this.files()).join('   '));
        break;
      case 'cat': {
        const file = this.files()[arg];
        this.print(file ?? `cat: ${arg || '?'}: ${c.missing}`);
        break;
      }
      case 'warp':
      case 'cd': {
        if (!arg) {
          const places = content().places;
          const spots = content().spots as Record<string, string>;
          this.print(this.host.warps().map((id) => `${id.padEnd(12)} ${places[id as PlaceId]?.name ?? spots[id] ?? ''}`));
        } else if (this.host.warp(arg)) {
          this.print(c.warping);
          this.toggle(false);
        } else {
          this.print(`warp: ${arg}: ${c.missing}`);
        }
        break;
      }
      case 'lang':
        if (arg in LANGUAGES) {
          setLanguage(arg as Language);
          this.print(LANGUAGES[arg as Language].language);
        } else {
          this.print(`lang ${Object.keys(LANGUAGES).join(' | ')}  (${language()})`);
        }
        break;
      case 'sound':
        this.print(this.host.sound() ? 'sound: on' : 'sound: off');
        break;
      case 'status':
      case 'achievements':
        this.print(this.host.status());
        break;
      case 'stats':
        this.print(this.host.stats());
        break;
      case 'time':
        this.print(this.host.sky(arg) ? `time: ${arg}` : 'time day | dusk | night | dawn | auto');
        break;
      case 'sanxoan':
        this.host.sky('sanxoan');
        this.print('🔥');
        break;
      case 'storm':
        this.host.sky('storm');
        this.print('⚡');
        break;
      case 'form':
        this.print(this.host.form(arg) ? `form: ${arg}` : 'form lelo | neon | pixel | auto');
        break;
      case 'turbo':
      case 'party':
      case 'feathers':
        this.print(this.host.cheat(command.toLowerCase() as 'turbo' | 'party' | 'feathers'));
        break;
      case 'reset':
        this.print(arg === '--yes' ? this.host.cheat('reset') : c.reset);
        break;
      case 'play':
        this.toggle(false);
        this.host.play();
        break;
      case 'sudo':
        this.print(c.sudo);
        break;
      case 'rm':
        this.print(c.rm);
        break;
      case 'whistle':
      case 'lelo':
        this.print(c.whistle);
        break;
      case 'date':
        this.print(new Date().toString());
        break;
      case 'echo':
        this.print(arg);
        break;
      case 'clear':
        this.log.innerHTML = '';
        break;
      case 'exit':
      case 'quit':
        this.toggle(false);
        break;
      default:
        this.print(`${command}: ${c.unknown}`);
    }
  }
}
