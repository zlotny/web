import { en } from './en';
import { es } from './es';
import { gl } from './gl';
import type { Content, Language } from './types';

export const LANGUAGES: Record<Language, Content> = { en, es, gl };
const STORAGE_KEY = 'ndrs.lang';

function detect(): Language {
  const forced = new URLSearchParams(location.search).get('lang');
  if (forced && forced in LANGUAGES) return forced as Language;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGUAGES) return saved as Language;
  } catch {}
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.toLowerCase().slice(0, 2);
    if (code in LANGUAGES) return code as Language;
  }
  return 'en';
}

type Listener = (content: Content, language: Language) => void;
const listeners = new Set<Listener>();
let current: Language = detect();

export const language = (): Language => current;
export const content = (): Content => LANGUAGES[current];

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  document.documentElement.lang = next;
  for (const listener of listeners) listener(content(), current);
}

export function onLanguage(listener: Listener): void {
  listeners.add(listener);
  listener(content(), current);
}

document.documentElement.lang = current;
