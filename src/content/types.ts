import type { AchievementId } from '../game/progress';
import type { ThingId } from '../world/galicia';

export type PlaceId = 'lighthouse' | 'village' | 'tank' | 'fullstack' | 'backend' | 'infra' | 'agents' | 'consoles' | 'lan' | 'jam' | 'podcast' | 'digimon' | 'marionette' | 'glint' | 'garage' | 'studio' | 'bench';
export type SpotId = 'cliffs' | 'islets' | 'summit' | 'beach' | 'city' | 'arcade' | 'edge';

export interface Place {
  name: string;
  kicker: string;
  title: string;
  body: string[];
  tags: string[];
  link?: { label: string; url: string };
  lelo?: string;
}

export interface Content {
  language: string;
  ui: {
    tagline: string;
    start: string;
    loading: string;
    plain: string;
    sound: string;
    help: string;
    visit: string;
    leave: string;
    open: string;
    visited: string;
    leloSays: string;
    tour: string;
    postcard: string;
    write: string;
    map: string;
    mapHint: string;
    waypoint: string;
    whistle: string;
    compass: string;
    allSeen: string;
    finale: string;
    finaleLocked: string;
    clock: string;
    clockNight: string;
    clockDay: string;
    hintKeys: string;
    hintTouch: string;
    hintPad: string;
    flap: string;
    brake: string;
    warp: string;
    tipTakeoff: string;
    tipTakeoffTouch: string;
    tipSea: string;
    fallbackTitle: string;
    fallbackBody: string;
    motionTitle: string;
    motionBody: string;
  };
  places: Record<PlaceId, Place>;
  spots: Record<SpotId, string>;
  quips: Record<PlaceId, string>;
  words: Record<string, string>;
  galicia: Record<ThingId, { name: string; text: string }>;
  end: { thanks: string; line: string; route: string; places: string; feathers: string; minutes: string; postcards: string; again: string; credits: string[] };
  game: {
    galicia: string;
    boat: string;
    all: string;
    allText: string;
    back: string;
    backText: string;
    backAll: string;
    feather: string;
    achievement: string;
    complete: string;
    race: string;
    raceGo: string;
    raceDone: string;
    raceBest: string;
    nod: string;
    seeds: { title: string; hint: string; over: string; best: string; play: string };
    achievements: Record<AchievementId, string>;
  };
  terminal: {
    stats: string[];
    welcome: string[];
    help: string[];
    whoami: string[];
    lelo: string[];
    missing: string;
    unknown: string;
    warping: string;
    sudo: string;
    rm: string;
    whistle: string;
    reset: string;
    turboOn: string;
    turboOff: string;
    party: string;
    feathers: string;
    resetDone: string;
    button: string;
  };
  plain: {
    title: string;
    back: string;
    sections: PlainSection[];
    contact: string;
    email: string;
  };
}

export interface PlainItem {
  label: string;
  text: string;
  url?: string;
}

export interface PlainSection {
  title: string;
  paragraphs?: string[];
  items?: PlainItem[];
}

export type Language = 'en' | 'es' | 'gl';
