import { LANGUAGES, language, onLanguage, setLanguage } from './content';
import type { Language } from './content/types';

const page = document.getElementById('page')!;
const reason = new URLSearchParams(location.search).get('why');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(label: string, url: string): HTMLAnchorElement {
  const a = el('a', undefined, label);
  a.href = url;
  if (/^https?:/.test(url)) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
}

onLanguage((c) => {
  page.innerHTML = '';
  document.title = `Andrés Vieira · ${c.plain.title}`;

  const top = el('header');
  const langs = el('nav', 'langs');
  for (const code of Object.keys(LANGUAGES) as Language[]) {
    const button = el('button', code === language() ? 'on' : undefined, code.toUpperCase());
    button.title = LANGUAGES[code].language;
    button.addEventListener('click', () => setLanguage(code));
    langs.append(button);
  }
  const fly = link(c.plain.back, `/?lang=${language()}&fly=1`);
  fly.className = 'fly';
  top.append(langs, fly);

  const hero = el('section', 'hero');
  hero.append(el('h1', undefined, 'Andrés Vieira'), el('p', 'aka', 'ndrs · zlotny'));
  if (reason) {
    const note = el('p', 'note');
    note.append(el('strong', undefined, reason === 'motion' ? c.ui.motionTitle : c.ui.fallbackTitle), document.createTextNode(` ${reason === 'motion' ? c.ui.motionBody : c.ui.fallbackBody}`));
    hero.append(note);
  }
  page.append(top, hero);

  for (const section of c.plain.sections) {
    const block = el('section');
    block.append(el('h2', undefined, section.title));
    for (const paragraph of section.paragraphs ?? []) block.append(el('p', undefined, paragraph));
    if (section.items) {
      const list = el('dl');
      for (const item of section.items) {
        const term = el('dt');
        term.append(item.url ? link(item.label, item.url) : document.createTextNode(item.label));
        list.append(term, el('dd', undefined, item.text));
      }
      block.append(list);
    }
    page.append(block);
  }

  const contact = el('section');
  contact.append(el('h2', undefined, c.plain.contact));
  const list = el('ul', 'contact');
  const address = ['anvieiravazquez', 'gmail.com'].join('@');
  const items: [string, string][] = [
    [c.plain.email, `mailto:${address}`],
    ['GitHub', 'https://github.com/zlotny'],
    ['LinkedIn', 'https://www.linkedin.com/in/andr%C3%A9s-vieira-5393aaa4/'],
  ];
  for (const [label, url] of items) {
    const item = el('li');
    item.append(link(label, url));
    list.append(item);
  }
  contact.append(list);
  page.append(contact, el('footer', undefined, '~ λ'));
});
