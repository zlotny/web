import * as THREE from 'three/webgpu';
import { Sound } from './audio/sound';
import { Input, type Controls } from './core/input';
import { Post, configureToneMapping } from './core/post';
import { Governor, pickQuality } from './core/quality';
import { Profiler } from './core/profiler';
import { content, language } from './content';
import { ACHIEVEMENTS, Progress } from './game/progress';
import { Race } from './game/race';
import { SeedGame } from './game/seeds';
import { Terminal } from './ui/terminal';
import { Collectibles, featherSpots } from './world/collect';
import { orbit, type Orbit } from './player/autopilot';
import { Arcade, arcadeMaterial } from './world/arcade';
import { createBarrier } from './world/barrier';
import { City, cityMaterial } from './world/city';
import { ARCADE, CITY } from './world/zones';
import { Bird } from './player/bird';
import { Feathers } from './player/feathers';
import { NeonTrail, PixelBird, Pulse } from './player/forms';
import { ChaseCamera } from './player/camera';
import { Flight } from './player/flight';
import { Hud } from './ui/hud';
import { Dioramas } from './world/dioramas';
import { Fleet } from './world/fleet';
import { Nods } from './world/nods';
import { createSigns } from './world/signs';
import { Motes, createAurora, createBonfires, createFogBanks, createProcession, createRainbow, createWorldEnd, createGulls, createSmoke, createWalkers, type Walk } from './world/life';
import { Grass } from './world/grass';
import { BEACH, HeightMap, ISLETS, MAP_RES, WORLD_SIZE, beachWeight } from './world/height';
import { Landmarks, type Landmark } from './world/landmarks';
import { LightMap, MaskMap } from './world/lightmap';
import { Obstacles } from './world/obstacles';
import { createScatter } from './world/scatter';
import { SHADOW_HALF, birdShadow, env, uploadHeight, uploadLight, uploadMask } from './world/shading';
import { createSky } from './world/sky';
import { createSurf } from './world/surf';
import { Tank } from './world/tank';
import { createTerrain } from './world/terrain';
import { createTrees } from './world/trees';
import { LodField } from './world/lod';
import { SITES, Village } from './world/village';
import { createWater } from './world/water';
import { Finale } from './ui/finale';
import { Minimap, type Waypoint } from './ui/minimap';
import { Clouds, Sparkles, createWindLines } from './world/candy';
import { Coca } from './world/coca';
import { Galicia } from './world/galicia';

declare const __LEDGER__: { lines: number; files: number };

declare global {
  interface Window {
    __ready?: boolean;
    __stats?: () => unknown;
    __dbg?: Record<string, unknown>;
  }
}

type Mode = 'intro' | 'fly' | 'visit';

const params = new URLSearchParams(location.search);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const bootFill = document.getElementById('boot-fill');
const bootText = document.getElementById('boot-text');

async function stage(progress: number): Promise<void> {
  if (bootFill) bootFill.style.transform = `scaleX(${progress})`;
  if (bootText) bootText.textContent = content().ui.loading;
  await nextFrame();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function start(): Promise<void> {
  const bootStart = performance.now();
  const toPlain = (why: string) => location.replace(`/plain/?why=${why}&lang=${language()}`);
  if (bootText) bootText.textContent = content().ui.loading;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !params.has('fly')) return toPlain('motion');
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const input = new Input(canvas);
  const hud = new Hud(input);
  await stage(0.08);

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: params.has('webgl'), reversedDepthBuffer: true, trackTimestamp: params.has('prof') });
  try {
    await renderer.init();
  } catch {
    return toPlain('gpu');
  }
  renderer.onDeviceLost = () => {
    let recent = false;
    try {
      recent = Date.now() - Number(sessionStorage.getItem('ndrs.lost') ?? 0) < 60000;
      sessionStorage.setItem('ndrs.lost', String(Date.now()));
    } catch {}
    if (recent) toPlain('gpu');
    else location.reload();
  };
  const webgpu = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const quality = pickQuality(params, webgpu);
  LodField.detail = quality.lod;
  configureToneMapping(renderer);
  await stage(0.2);

  const scene = new THREE.Scene();
  const map = new HeightMap();
  let crest = 0;
  for (let k = 1; k < map.data.length; k++) if (map.data[k] > map.data[crest]) crest = k;
  const summit = { x: -WORLD_SIZE / 2 + (crest % MAP_RES) * map.texel, z: -WORLD_SIZE / 2 + Math.floor(crest / MAP_RES) * map.texel };
  map.flatten(summit.x, summit.z, 4.5, 9, map.data[crest] - 2.5);
  const village = new Village(map);
  const city = new City(map);
  const arcade = new Arcade(map);
  const dioramas = new Dioramas(map, (x, z) => !village.blocked(x, z, 1.6) && !city.blocked(x, z) && !arcade.blocked(x, z) && Math.hypot(x - SITES.harbor.x - 20, z - SITES.harbor.z - 40) > 150);
  const tank = map.findLand(SITES.harbor.x + 20, SITES.harbor.z + 40, 2.2, 9, 120, (x, z) => !village.blocked(x, z, 1.5));
  map.flatten(tank.x, tank.z, 11, 9);
  if (quality.terrain > 1) map.coarsen(quality.terrain);
  uploadHeight(map);
  await stage(0.45);

  const light = new LightMap(map, env.sunDir.value);
  const mask = new MaskMap();
  const nods = new Nods(map, (x, z) => !village.blocked(x, z, 1.4) && !dioramas.blocked(x, z, 1.5) && !city.blocked(x, z) && !arcade.blocked(x, z) && Math.hypot(x - summit.x, z - summit.z) > 30, null);
  let reserved: (x: number, z: number) => boolean = () => false;
  const blocked = (x: number, z: number) => reserved(x, z) || village.blocked(x, z) || nods.blocked(x, z) || dioramas.blocked(x, z) || city.blocked(x, z) || arcade.blocked(x, z) || Math.hypot(x - tank.x, z - tank.z) < 36 || (beachWeight(x, z) > 0.15 && map.sample(x, z) < 11);
  const obstacles = new Obstacles();
  const open = (x: number, z: number) => !blocked(x, z) && Math.hypot(x - CITY.x, z - CITY.z) > CITY.radius + 30 && Math.hypot(x - ARCADE.x, z - ARCADE.z) > ARCADE.radius + 30 && Math.hypot(x - summit.x, z - summit.z) > 26;
  const galicia = new Galicia(map, obstacles, open, village.houses, SITES.village, SITES.chapel, summit, village.paths, quality.life);
  reserved = galicia.reserved;
  const coca = new Coca(map);
  await stage(0.58);
  const sky = createSky();
  const trees = createTrees(map, light, mask, { density: quality.trees, chunk: 160, ranges: [120, 320, 640] }, blocked, obstacles);
  await stage(0.72);
  village.build(light, mask, obstacles);
  city.build(light, mask, obstacles);
  arcade.build(light, mask, obstacles);
  nods.build(light, mask, obstacles, city.ground);
  dioramas.summit = summit;
  dioramas.build(light, mask, obstacles);
  const barriers = [createBarrier(CITY, 'neon', map, obstacles, cityMaterial()), createBarrier(ARCADE, 'pixel', map, obstacles, arcadeMaterial())];
  mask.bare(tank.x, tank.z, 15, 0.9);
  for (let bz = BEACH.az - BEACH.reach; bz < BEACH.bz + BEACH.reach; bz += 11) {
    for (let bx = BEACH.ax - BEACH.reach; bx < BEACH.bx + BEACH.reach; bx += 11) {
      if (beachWeight(bx, bz) > 0.25 && map.sample(bx, bz) < 8.5) mask.bare(bx, bz, 15, 1);
    }
  }
  const scatter = createScatter(map, light, { density: quality.scatter, chunk: 160, ranges: [70, 190] }, blocked);
  const basin = new Tank(tank.x, map.sample(tank.x, tank.z), tank.z, 0.55, light, quality.fluid, obstacles);
  const fleet = new Fleet(map, obstacles, quality.boats);
  const motes = new Motes(quality.motes);
  const lifeRand = (() => {
    let seed = 99;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  const walks: Walk[] = [];
  for (const path of village.paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const far = Math.hypot(bx - ax, bz - az);
      const people = Math.round((far / 34) * quality.life + lifeRand());
      for (let k = 0; k < people; k++) {
        const side = (lifeRand() - 0.5) * 3.4;
        const nx = (-(bz - az) / far) * side;
        const nz = ((bx - ax) / far) * side;
        const t0 = lifeRand() * 0.4;
        const t1 = 0.6 + lifeRand() * 0.4;
        walks.push({ ax: ax + (bx - ax) * t0 + nx, az: az + (bz - az) * t0 + nz, bx: ax + (bx - ax) * t1 + nx, bz: az + (bz - az) * t1 + nz });
      }
    }
  }
  const beachDir = { x: BEACH.bx - BEACH.ax, z: BEACH.bz - BEACH.az };
  for (let k = 0; k < Math.round(9 * quality.life); k++) {
    const t0 = lifeRand() * 0.7;
    const t1 = t0 + 0.1 + lifeRand() * 0.2;
    const out = 18 + lifeRand() * 26;
    const far = Math.hypot(BEACH.ax + beachDir.x * 0.5, BEACH.az + beachDir.z * 0.5);
    const ox = ((BEACH.ax + beachDir.x * 0.5) / far) * out;
    const oz = ((BEACH.az + beachDir.z * 0.5) / far) * out;
    const from = { x: BEACH.ax + beachDir.x * t0 + ox, z: BEACH.az + beachDir.z * t0 + oz };
    const to = { x: BEACH.ax + beachDir.x * t1 + ox, z: BEACH.az + beachDir.z * t1 + oz };
    if (map.sample(from.x, from.z) > 0.6 && map.sample(to.x, to.z) > 0.6) walks.push({ ax: from.x, az: from.z, bx: to.x, bz: to.z });
  }
  const cityWalks: Walk[] = [];
  for (let n = -5; n <= 4; n++) {
    const offset = (n + 0.5) * 44;
    const half = Math.sqrt(Math.max(0, (CITY.radius * 0.8) ** 2 - offset * offset));
    for (let k = 0; k < Math.round(5 * quality.life); k++) {
      const a = -half + lifeRand() * half * 1.2;
      const b = a + 30 + lifeRand() * 60;
      const side = (lifeRand() < 0.5 ? -1 : 1) * 7.6;
      cityWalks.push(k % 2 ? { ax: CITY.x + offset + side, az: CITY.z + a, bx: CITY.x + offset + side, bz: CITY.z + Math.min(b, half), lift: city.ground } : { ax: CITY.x + a, az: CITY.z + offset + side, bx: CITY.x + Math.min(b, half), bz: CITY.z + offset + side, lift: city.ground });
    }
  }
  const arcadeWalks: Walk[] = [];
  for (let k = 0; k < Math.round(22 * quality.life); k++) {
    const a = lifeRand() * Math.PI * 2;
    const r = 20 + lifeRand() * ARCADE.radius * 0.5;
    const b = a + (lifeRand() - 0.5) * 1.2;
    const r2 = 20 + lifeRand() * ARCADE.radius * 0.5;
    arcadeWalks.push({ ax: ARCADE.x + Math.cos(a) * r, az: ARCADE.z + Math.sin(a) * r, bx: ARCADE.x + Math.cos(b) * r2, bz: ARCADE.z + Math.sin(b) * r2, lift: arcade.ground });
  }
  const gulls = createGulls(
    [
      { x: SITES.lighthouse.x - 40, y: 46, z: SITES.lighthouse.z, radius: 120, count: 14 },
      { x: ISLETS[0][0], y: 60, z: ISLETS[0][1], radius: 150, count: 16 },
      { x: -1100, y: 44, z: -380, radius: 140, count: 12 },
      { x: SITES.harbor.x - 30, y: 26, z: SITES.harbor.z - 30, radius: 70, count: 8 },
      { x: (BEACH.ax + BEACH.bx) / 2, y: 30, z: (BEACH.az + BEACH.bz) / 2 - 60, radius: 170, count: 12 },
      { x: -500, y: 40, z: -980, radius: 120, count: 10 },
    ].map((flock) => ({ ...flock, count: Math.round(flock.count * quality.life) })),
  );
  const smoke = createSmoke(village.houses.filter((_, i) => i % 2 === 0).map((h) => ({ x: h.x + 1.2, y: map.sample(h.x, h.z) + 7.4, z: h.z })));
  const aurora = createAurora(CITY.x, city.ground + 250, CITY.z, CITY.radius * 1.5);
  const banks: { x: number; y: number; z: number; size: number }[] = [];
  for (let guard = 0; guard < 900 && banks.length < Math.round(16 * quality.life); guard++) {
    const fx = (lifeRand() - 0.5) * 2600;
    const fz = (lifeRand() - 0.5) * 2600;
    const fh = map.sample(fx, fz);
    if (fh < -1 || fh > 60 || blocked(fx, fz) || city.blocked(fx, fz) || arcade.blocked(fx, fz)) continue;
    let rim = 0;
    for (let k = 0; k < 8; k++) rim += map.sample(fx + Math.cos(k * 0.785) * 90, fz + Math.sin(k * 0.785) * 90);
    if (rim / 8 - fh < 7 || banks.some((b) => Math.hypot(b.x - fx, b.z - fz) < 220)) continue;
    banks.push({ x: fx, y: Math.max(fh, 0) + 3, z: fz, size: 190 + lifeRand() * 130 });
  }
  const fog = createFogBanks(banks);
  const pathA = village.paths[1][1];
  const pathB = village.paths[1][3];
  const procession = createProcession(pathA[0], pathA[1], pathB[0], pathB[1]);
  const today = new Date();
  const fires: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const t = 0.15 + k * 0.14;
    const far = Math.hypot(BEACH.ax + beachDir.x * 0.5, BEACH.az + beachDir.z * 0.5);
    let fx = BEACH.ax + beachDir.x * t;
    let fz = BEACH.az + beachDir.z * t;
    for (let step2 = 0; step2 < 40 && map.sample(fx, fz) < 1.6; step2++) {
      fx -= ((BEACH.ax + beachDir.x * 0.5) / far) * 4;
      fz -= ((BEACH.az + beachDir.z * 0.5) / far) * 4;
    }
    fires.push({ x: fx, y: Math.max(map.sample(fx, fz), 0.3), z: fz });
  }
  const bonfires = createBonfires(fires);
  bonfires.visible = today.getMonth() === 5 && (today.getDate() === 23 || today.getDate() === 24);
  const wordList: [string, number, number, number][] = [
    ['morriña', SITES.lighthouse.x + 30, SITES.lighthouse.z + 24, 26],
    ['orballo', -1150, -330, 16],
    ['retranca', SITES.village.x + 10, SITES.village.z + 20, 16],
    ['enxebre', SITES.chapel.x + 14, SITES.chapel.z - 10, 18],
    ['luscofusco', (BEACH.ax + BEACH.bx) / 2 - 60, (BEACH.az + BEACH.bz) / 2 + 50, 14],
    ['aloumiño', summit.x - 26, summit.z + 22, 9],
  ];
  const words = wordList.map(([word, wx, wz, up]) => ({ word, x: wx, y: Math.max(map.sample(wx, wz), 0) + up, z: wz }));
  const wordSigns = createSigns(
    words.flatMap((w) => [0, Math.PI / 2].map((yaw) => ({ text: w.word, x: w.x, y: w.y, z: w.z, yaw, height: 2.4, color: [1, 0.85, 0.35] as [number, number, number] }))),
    0,
    false,
  );
  const life = [createWorldEnd(), procession, bonfires, wordSigns, fog, gulls, smoke, aurora, motes.mesh, createWalkers(walks, 11), createWalkers(cityWalks, 12, 0.6), createWalkers(arcadeWalks, 13)];
  const lawns = [
    new Grass({ ...quality.grassNear, width: 0.085, height: 0.62, blades: 3, near: 0, lead: 12 }),
    new Grass({ ...quality.grassFar, width: 0.24, height: 0.74, blades: 3, near: quality.grassNear.side * quality.grassNear.spacing * 0.4, lead: 70 }),
  ];
  await stage(0.86);
  uploadLight(light.finish());
  uploadMask(mask.data);

  const place = (id: Landmark['id'], x: number, z: number, reach: number, radius: number, height: number, focus: number, back: number): Landmark => ({
    id,
    x,
    z,
    ground: Math.max(map.sample(x, z), 0),
    reach,
    orbit: radius,
    height,
    focus,
    back,
  });
  const landmarks = new Landmarks([
    place('lighthouse', SITES.lighthouse.x, SITES.lighthouse.z, 150, 58, 30, 16, 9),
    place('village', SITES.village.x + 40, SITES.village.z - 10, 170, 85, 36, 4, 10),
    place('tank', tank.x, tank.z, 110, 24, 10, 1.5, 6),
    ...city.towers.map((t) => place(t.id, t.x, t.z, 120, 74, t.height * 0.66, t.height * 0.56, 13)),
    ...arcade.stands.map((stand) => place(stand.id, stand.x, stand.z, 70, 38, stand.height + 5, stand.height * 0.45, 8)),
    ...dioramas.list.map((d) => place(d.id, d.x, d.z, 75, 30, d.height + 3, d.height * 0.45, 7)),
    place('bench', summit.x, summit.z, 60, 20, 7, 1.2, 5),
  ]);

  scene.add(sky, createTerrain(map, quality.terrain), createWater(), createSurf(map, quality.surf), trees.group, scatter.group, village.group, city.group, arcade.group, dioramas.group, nods.group, galicia.group, coca.group, ...barriers, basin.group, fleet.group, ...life, landmarks.group, ...lawns.map((lawn) => lawn.mesh));

  const flight = new Flight(map, obstacles);
  flight.place(-1250, 70, -260, Math.PI * 0.42);
  flight.rings = [CITY, ARCADE].map((zone, i) => ({ x: zone.x, z: zone.z, radius: zone.radius, top: barriers[i].userData.top as number }));
  const bird = await Bird.load();
  scene.add(bird.root);
  const feathers = new Feathers();
  const pixel = new PixelBird();
  bird.root.add(pixel.group);
  const trail = new NeonTrail(bird.tips);
  const vapour = new NeonTrail(bird.tips, true);
  const pulse = new Pulse();
  const clouds = new Clouds(Math.round(26 * quality.life), map.max + 70);
  const sparkles = new Sparkles(galicia.things.map((t) => ({ x: t.x, y: t.y + 5, z: t.z })));
  const veil = document.createElement('div');
  veil.className = 'veil';
  document.getElementById('ui')!.prepend(veil);
  scene.add(feathers.mesh, trail.mesh, vapour.mesh, pulse.mesh, clouds.mesh, sparkles.mesh, createWindLines(Math.round(34 * quality.life)));

  type Form = 'lelo' | 'neon' | 'pixel';
  const looks: Record<Form, { color: THREE.Color; palette: number[][] }> = {
    lelo: { color: new THREE.Color(1.0, 0.85, 0.4), palette: [[0.97, 0.87, 0.3], [0.96, 0.95, 0.9], [0.45, 0.47, 0.5], [0.95, 0.45, 0.15]] },
    neon: { color: new THREE.Color(0.3, 0.95, 1.0), palette: [[0.2, 0.95, 1.0], [1.0, 0.25, 0.8], [0.6, 0.4, 1.0]] },
    pixel: { color: new THREE.Color(1.0, 0.5, 0.8), palette: [[0.98, 0.82, 0.18], [0.86, 0.18, 0.2], [0.16, 0.36, 0.86], [0.2, 0.72, 0.38], [1, 1, 1]] },
  };
  let form: Form = 'lelo';
  let forced: Form | null = null;
  let morph: { time: number; to: Form; swapped: boolean } | null = null;
  let clock = 0;
  const formAt = (x: number, z: number): Form => {
    if (forced) return forced;
    const inCity = Math.hypot(x - CITY.x, z - CITY.z) / CITY.radius;
    const inArcade = Math.hypot(x - ARCADE.x, z - ARCADE.z) / ARCADE.radius;
    if (inCity < (form === 'neon' ? 1.012 : 0.988)) return 'neon';
    if (inArcade < (form === 'pixel' ? 1.012 : 0.988)) return 'pixel';
    return 'lelo';
  };
  const showForm = (next: Form) => {
    form = next;
    bird.setStyle(next === 'neon' ? 'neon' : 'lelo');
    bird.setVisible(next !== 'pixel');
    pixel.group.visible = next === 'pixel';
  };

  await stage(0.95);
  const chase = new ChaseCamera((x, z) => flight.groundAt(x, z));
  const post = new Post(renderer, scene, chase.camera, { radius: quality.paint, bloom: quality.bloom });

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.min(window.devicePixelRatio, quality.dpr) * governor.scale));
    renderer.setSize(width, height, false);
    chase.resize(width, height);
  };
  const governor = new Governor(
    (step) => {
      LodField.detail = quality.lod * step.lod;
      for (const lawn of lawns) lawn.setReach(step.grass);
      resize();
    },
    () => {
      if (!params.has('fly') && document.visibilityState === 'visible') toPlain('slow');
    },
    quality.name === 'high',
  );
  window.addEventListener('resize', resize);
  if (params.has('step')) governor.pin(Number(params.get('step')));
  resize();

  let mode: Mode = 'intro';
  let visiting: Landmark | null = null;
  const attract: Orbit = { x: SITES.lighthouse.x + 60, z: SITES.lighthouse.z, y: 64, radius: 190 };
  const circle: Orbit = { x: 0, z: 0, y: 0, radius: 1 };

  const begin = () => {
    if (mode !== 'intro') return;
    mode = 'fly';
    hud.start();
    if (returning) {
      setTimeout(() => {
        const next = landmarks.unseen(flight.position);
        const g = content().game;
        hud.toast(g.back, next ? g.backText.replace('{name}', content().places[next.landmark.id].name) : g.backAll, 7000);
      }, 2600);
    }
  };
  const returning = landmarks.visited.size > 0;
  const enter = (landmark: Landmark) => {
    mode = 'visit';
    visiting = landmark;
    circle.x = landmark.x;
    circle.z = landmark.z;
    circle.y = landmark.ground + landmark.height;
    circle.radius = landmark.orbit;
    if (landmark.id === 'bench') {
      const yaw = Math.atan2(-summit.x - 400, -summit.z - 300);
      const px = summit.x + Math.cos(yaw) * -2.7 + Math.sin(yaw) * 0.7;
      const pz = summit.z - Math.sin(yaw) * -2.7 + Math.cos(yaw) * 0.7;
      flight.place(px, map.sample(summit.x, summit.z) + 1.8, pz, yaw);
      flight.perchY = map.sample(summit.x, summit.z) + 1.56;
      flight.landed = true;
      chase.snap();
    }
    landmarks.visit(landmark.id);
    progress.refresh();
    hud.openPanel(landmark.id);
  };
  const leave = () => {
    if (mode !== 'visit') return;
    if (!touring) tour = null;
    mode = 'fly';
    visiting = null;
    if (flight.perchY !== null) {
      flight.perchY = null;
      flight.landed = false;
      flight.speed = 10;
      flight.pitch = 0.45;
      flight.position.y += 0.6;
    }
    hud.closePanel();
  };
  const sound = new Sound();
  hud.onSound = () => sound.toggle();
  hud.onStart = begin;
  hud.onLeave = leave;
  hud.onVisit = () => {
    const near = landmarks.nearest(flight.position);
    if (mode === 'fly' && !warp && near && near.distance < near.landmark.reach) enter(near.landmark);
  };
  hud.setProgress(landmarks.visited.size, landmarks.list.length);
  input.onFirstInput = begin;

  interface Destination {
    x: number;
    y: number;
    z: number;
    yaw: number;
  }
  const toward = (x: number, z: number, up: number, tx: number, tz: number): Destination => ({
    x,
    y: Math.max(map.sample(x, z), 0) + up,
    z,
    yaw: Math.atan2(tx - x, tz - z),
  });
  const peakX = summit.x;
  const peakZ = summit.z;
  const beachMid = { x: (BEACH.ax + BEACH.bx) / 2, z: (BEACH.az + BEACH.bz) / 2 };
  const beachSpan = Math.hypot(beachMid.x, beachMid.z);
  const beachOut = { x: beachMid.x / beachSpan, z: beachMid.z / beachSpan };
  const destinations: Record<string, Destination> = {
    cliffs: toward(-1190, -340, 36, -900, -120),
    islets: toward(-590, -1000, 52, ISLETS[0][0], ISLETS[0][1]),
    summit: { x: peakX + 70, y: map.sample(peakX, peakZ) + 14, z: peakZ + 55, yaw: Math.atan2(-70, -55) },
    edge: { x: -2540, y: 72, z: 0, yaw: -Math.PI / 2 },
    city: toward(CITY.x - 430, CITY.z + 260, 100, CITY.x, CITY.z),
    arcade: toward(ARCADE.x - 170, ARCADE.z + 270, 46, ARCADE.x, ARCADE.z),
    beach: toward(beachMid.x + beachOut.x * 210, beachMid.z + beachOut.z * 210, 16, beachMid.x, beachMid.z),
  };
  for (const l of landmarks.list) destinations[l.id] = toward(l.x - l.orbit - 45, l.z + 25, l.height, l.x, l.z);
  let warp: { time: number; to: Destination; moved: boolean } | null = null;
  hud.setWarps(['bench', 'lighthouse', 'village', 'garage', 'studio', 'tank', 'digimon', 'marionette', 'glint', 'beach', 'cliffs', 'islets', 'summit', 'city', 'arcade', 'edge']);
  hud.onWarp = (id) => {
    if (mode !== 'fly' || warp || morph) return;
    warp = { time: 0, to: destinations[id], moved: false };
    if (race.running) {
      race.cancel();
      hud.setTimer(null);
    }
    feathers.burst(flight.position);
    progress.unlock('warp');
    hud.flash(true);
    sound.chime();
  };

  const tone = (r: number, g: number, b: number, k = 1) => new THREE.Color(r, g, b).multiplyScalar(k);
  const day = {
    sun: env.sunColor.value.clone(),
    top: env.skyTop.value.clone(),
    horizon: env.skyHorizon.value.clone(),
    sky: env.ambientSky.value.clone(),
    ground: env.ambientGround.value.clone(),
  };
  const moods = [
    { zone: CITY, retro: 0, fringe: 1, stride: 0.55, glow: 0.75, mote: tone(0.3, 0.9, 1.0), rise: 1.6, square: 0, reach: 2.5, sun: tone(1.0, 0.4, 0.58, 0.9), top: tone(0.03, 0.02, 0.13), horizon: tone(0.48, 0.2, 0.52), sky: tone(0.2, 0.2, 0.46), ground: tone(0.16, 0.1, 0.22) },
    { zone: ARCADE, retro: 1, fringe: 0, stride: 0.5, glow: 0.3, mote: tone(1.0, 0.5, 0.85), rise: 0.8, square: 1, reach: 2.6, sun: tone(1.0, 0.5, 0.32, 2.2), top: tone(0.16, 0.1, 0.42), horizon: tone(1.0, 0.55, 0.5), sky: tone(0.58, 0.4, 0.62), ground: tone(0.45, 0.3, 0.36) },
  ];
  const dusk = { sun: tone(1.0, 0.5, 0.25, 2.2), top: tone(0.12, 0.14, 0.42), horizon: tone(1.0, 0.6, 0.42), sky: tone(0.5, 0.42, 0.6), ground: tone(0.5, 0.36, 0.3) };
  const dark = { sun: tone(0.35, 0.45, 0.75, 0.7), top: tone(0.01, 0.015, 0.06), horizon: tone(0.06, 0.09, 0.2), sky: tone(0.1, 0.13, 0.26), ground: tone(0.06, 0.07, 0.12) };
  const grey = { sun: tone(0.5, 0.55, 0.6, 0.9), top: tone(0.2, 0.23, 0.28), horizon: tone(0.5, 0.54, 0.58), sky: tone(0.45, 0.48, 0.55), ground: tone(0.3, 0.3, 0.3) };
  const blend = (to: typeof dusk, w: number) => {
    if (w <= 0) return;
    env.sunColor.value.lerp(to.sun, w);
    env.skyTop.value.lerp(to.top, w);
    env.skyHorizon.value.lerp(to.horizon, w);
    env.ambientSky.value.lerp(to.sky, w);
    env.ambientGround.value.lerp(to.ground, w);
  };
  const sky2 = { cycle: 0.18, fixed: null as number | null, storm: -1, stormDone: false, flown: 0, bow: { value: 0 }, weather: 0, night: 0 };
  const ramp = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const noon = env.sunDir.value.clone();
  const sunBase = Math.atan2(noon.x, noon.z);
  const sunPeak = Math.asin(noon.y) / Math.sin(Math.PI * 0.385);
  const lamp = new THREE.Vector3();
  const moonLamp = new THREE.Vector3();
  const rain = new Motes(Math.round(quality.motes * 1.6));
  rain.tint.value.setRGB(0.75, 0.82, 0.9);
  rain.rise.value = -46;
  rain.stretch.value = 9;
  rain.glint.value = 0;
  rain.amount.value = 0;
  const rainbow = createRainbow();
  scene.add(rain.mesh, rainbow);
  const heavens = (dt: number, position: THREE.Vector3) => {
    if (mode === 'fly') sky2.flown += dt;
    sky2.cycle = (sky2.cycle + dt / 600) % 1;
    const t = sky2.fixed ?? sky2.cycle;
    const u = ((t + 0.05) % 1) / 0.65;
    const sunUp = Math.sin(Math.PI * Math.min(u, 1.25)) * sunPeak;
    const sunTurn = sunBase + (u - 0.385) * Math.PI * 0.95;
    env.orb.value.set(Math.sin(sunTurn) * Math.cos(sunUp), Math.sin(sunUp), Math.cos(sunTurn) * Math.cos(sunUp));
    const v = (t - 0.6) / 0.35;
    const moonUp = Math.sin(Math.PI * Math.max(-0.2, Math.min(1.2, v))) * 0.85;
    const moonTurn = sunBase + Math.PI * 0.8 + (v - 0.5) * Math.PI * 0.8;
    env.moon.value.set(Math.sin(moonTurn) * Math.cos(moonUp), Math.sin(moonUp), Math.cos(moonTurn) * Math.cos(moonUp));
    const byMoon = ramp(0.6, 0.67, t) * (1 - ramp(0.9, 0.96, t));
    lamp.copy(env.orb.value);
    lamp.y = Math.max(lamp.y, 0.14);
    lamp.normalize();
    moonLamp.copy(env.moon.value);
    moonLamp.y = Math.max(moonLamp.y, 0.2);
    moonLamp.normalize();
    env.sunDir.value.copy(lamp).lerp(moonLamp, byMoon).normalize();
    const duskW = Math.max(ramp(0.5, 0.58, t) * (1 - ramp(0.6, 0.68, t)), ramp(0.9, 0.95, t) * (1 - ramp(0.96, 1, t)));
    sky2.night = ramp(0.6, 0.68, t) * (1 - ramp(0.9, 0.96, t));
    blend(dusk, duskW);
    blend(dark, sky2.night);
    if (sky2.storm < 0 && !sky2.stormDone && sky2.flown > 240 && form === 'lelo') sky2.storm = 0;
    let weather = 0;
    let flash = 0;
    if (sky2.storm >= 0) {
      sky2.storm += dt;
      const s2 = sky2.storm;
      weather = ramp(0, 12, s2) * (1 - ramp(57, 70, s2));
      sky2.bow.value = ramp(62, 72, s2) * (1 - ramp(115, 130, s2)) * (1 - sky2.night);
      if (s2 > 10 && s2 < 58) {
        const beat = (s2 * 0.37) % 1;
        const strike = Math.sin(Math.floor(s2 * 0.37) * 91.7) > 0.2;
        if (strike && beat < 0.12) flash = (1 - beat / 0.12) * (Math.sin(beat * 180) > 0 ? 1 : 0.35);
      }
      if (s2 > 130) {
        sky2.storm = -1;
        sky2.stormDone = true;
      }
    }
    sky2.weather = weather;
    blend(grey, weather * 0.85);
    env.fogDensity.value = 0.00024 * (1 + weather * 3.2 + sky2.night * 0.4);
    env.night.value = sky2.night;
    env.flash.value = flash * 0.9;
    rain.amount.value = weather * 0.5;
    rain.update(dt);
    if (sky2.bow.value > 0) {
      const sun = env.sunDir.value;
      const flat = Math.hypot(sun.x, sun.z);
      rainbow.position.set(position.x - (sun.x / flat) * 1500, -60, position.z - (sun.z / flat) * 1500);
      rainbow.scale.setScalar(820);
      rainbow.lookAt(position.x, -60, position.z);
    }
    rainbow.visible = sky2.bow.value > 0.001;
    rainbow.userData.level.value = sky2.bow.value;
  };
  const mood = (position: THREE.Vector3, dt = 0.016) => {
    env.sunColor.value.copy(day.sun);
    env.skyTop.value.copy(day.top);
    env.skyHorizon.value.copy(day.horizon);
    env.ambientSky.value.copy(day.sky);
    env.ambientGround.value.copy(day.ground);
    heavens(dt, position);
    let stride = 1.35;
    let glow = 0.14 + sky2.night * 0.3;
    let retro = 0;
    let fringe = 0;
    let rise = 0.15;
    let square = 0;
    motes.tint.value.setRGB(1, 0.93, 0.62);
    for (const m of moods) {
      const inside = Math.hypot(position.x - m.zone.x, position.z - m.zone.z) / m.zone.radius;
      const near = Math.max(0, Math.min(1, (1.5 - inside) / 0.5));
      stride += (m.stride - stride) * near;
      glow += (m.glow - glow) * near;
      const within = Math.max(0, Math.min(1, (1.02 - inside) / 0.04));
      retro += (m.retro - retro) * within;
      fringe += (m.fringe - fringe) * within;
      rise += (m.rise - rise) * near;
      square += (m.square - square) * near;
      motes.tint.value.lerp(m.mote, near);
      const d = Math.hypot(position.x - m.zone.x, position.z - m.zone.z) / m.zone.radius;
      const t = Math.max(0, Math.min(1, (m.reach - d) / (m.reach - 1.15)));
      const w = t * t * (3 - 2 * t);
      if (w <= 0) continue;
      env.sunColor.value.lerp(m.sun, w);
      env.skyTop.value.lerp(m.top, w);
      env.skyHorizon.value.lerp(m.horizon, w);
      env.ambientSky.value.lerp(m.sky, w);
      env.ambientGround.value.lerp(m.ground, w);
    }
    post.stride.value = stride;
    post.glow.value = glow;
    post.retro.value = retro;
    post.fringe.value = fringe;
    post.rush.value += (Math.max(0, Math.min(1, (flight.speed - 30) / 22)) - post.rush.value) * 0.08;
    motes.rise.value = rise;
    motes.square.value = square;
  };

  const top = (x: number, z: number, up: number) => ({ x, y: Math.max(map.sample(x, z), 0) + up, z });
  const wreck = fleet.group.getObjectByName('wreck');
  const fixed = [
    top(SITES.lighthouse.x, SITES.lighthouse.z, 42),
    { x: peakX + 9, y: map.sample(peakX, peakZ) + 7, z: peakZ - 6 },
    top(ISLETS[0][0], ISLETS[0][1], 14),
    top(ISLETS[1][0], ISLETS[1][1], 10),
    ...(wreck ? [{ x: wreck.position.x, y: 15, z: wreck.position.z }] : []),
    top(tank.x, tank.z, 9),
    top(SITES.chapel.x, SITES.chapel.z, 15),
    top(beachMid.x, beachMid.z, 5),
    top(CITY.x, CITY.z, 44),
    ...city.towers.map((t) => top(t.x, t.z, t.height + 14)),
    top(CITY.x - 132, CITY.z + 22, 12),
    top(CITY.x + 22, CITY.z + 132, 9),
    top(ARCADE.x, ARCADE.z, 34),
    ...arcade.stands.map((stand) => top(stand.x, stand.z, stand.height + 12)),
    top(-1190, -340, 8),
    top(-292, 128, 6),
  ];
  const collectibles = new Collectibles(
    featherSpots(map, fixed, 40, (x, z) => !city.blocked(x, z) && !arcade.blocked(x, z)),
    new Set(),
  );
  const progress = new Progress(collectibles.spots.length, () => ({ seen: landmarks.visited.size, total: landmarks.list.length }));
  for (const i of progress.feathers) collectibles.take(i);
  let lastPercent = -1;
  const showProgress = () => {
    const percent = progress.percent();
    hud.setProgress(landmarks.visited.size, landmarks.list.length, percent);
    hud.setFinale(Math.max(0, 8 - landmarks.visited.size));
    if (percent >= 100 && lastPercent >= 0 && lastPercent < 100) {
      party = true;
      hud.toast(content().game.all, content().game.allText, 9000);
      pulse.fire(looks.lelo.color);
      feathers.burst(flight.position, false, looks.pixel.palette);
    }
    lastPercent = percent;
  };
  progress.onChange = showProgress;
  progress.onUnlock = (id) => {
    hud.toast(content().game.achievement, content().game.achievements[id]);
    sound.chime(12);
  };
  progress.nodTotal = nods.list.length + words.length + galicia.things.length;
  galicia.things.forEach((_, i) => {
    if (progress.nods.has(200 + i)) sparkles.hide(i);
  });
  let party = false;
  showProgress();

  const course: THREE.Vector3[] = [];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 - 2.2;
    const r = ARCADE.radius * (k === 0 ? 0.16 : 0.5 + (k % 3) * 0.11);
    course.push(new THREE.Vector3(ARCADE.x + Math.cos(a) * r, arcade.ground + (k === 0 ? 30 : 26 + ((k * 7) % 5) * 5), ARCADE.z + Math.sin(a) * r));
  }
  const race = new Race(course);
  const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
  race.onStart = () => {
    hud.toast(content().game.race, content().game.raceGo);
    sound.chime(5);
  };
  race.onRing = () => sound.chime(9);
  race.onFinish = (seconds) => {
    const better = progress.record(seconds);
    hud.toast(better ? content().game.raceBest : content().game.raceDone, clockText(seconds));
    hud.setTimer(null);
    pulse.fire(looks.pixel.color);
    sound.chime(12);
  };
  scene.add(collectibles.mesh, race.group);

  const terminal = new Terminal({
    warps: () => Object.keys(destinations),
    warp: (id) => {
      if (!(id in destinations) || mode !== 'fly') return false;
      hud.onWarp(id as never);
      return true;
    },
    sound: () => {
      hud.pressSound();
      return sound.enabled;
    },
    status: () => {
      const g = content().game;
      return [
        `${progress.percent()}% ${g.complete}`,
        `${landmarks.visited.size}/${landmarks.list.length} ${content().ui.visited}`,
        `${g.feather}: ${progress.feathers.size}/${progress.featherTotal}`,
        ...(progress.best ? [`${g.race}: ${clockText(progress.best)}`] : []),
        '',
        ...ACHIEVEMENTS.map((id) => `[${progress.achievements.has(id) ? 'x' : ' '}] ${progress.achievements.has(id) ? g.achievements[id] : '???'}`),
      ];
    },
    stats: () =>
      content().terminal.stats.map((line) =>
        line
          .replace('{lines}', __LEDGER__.lines.toLocaleString(language()))
          .replace('{files}', String(__LEDGER__.files))
          .replace('{triangles}', renderer.info.render.triangles.toLocaleString(language()))
          .replace('{calls}', String(renderer.info.render.drawCalls))
          .replace('{places}', String(landmarks.list.length))
          .replace('{feathers}', String(progress.featherTotal))
          .replace('{nods}', String(progress.nodTotal)),
      ),
    cheat: (name) => {
      const t = content().terminal;
      if (name === 'turbo') {
        flight.turbo = !flight.turbo;
        return flight.turbo ? t.turboOn : t.turboOff;
      }
      if (name === 'party') {
        party = !party;
        return t.party;
      }
      if (name === 'feathers') {
        let best = Infinity;
        collectibles.spots.forEach((spot, i) => {
          if (!progress.feathers.has(i)) best = Math.min(best, Math.hypot(spot.x - flight.position.x, spot.z - flight.position.z));
        });
        return Number.isFinite(best) ? t.feathers.replace('{n}', String(Math.round(best))) : content().game.achievements.feathers;
      }
      progress.reset();
      landmarks.reset();
      collectibles.restore();
      sparkles.show();
      showProgress();
      return t.resetDone;
    },
    sky: (name) => {
      if (name === 'sanxoan') {
        bonfires.visible = !bonfires.visible;
        return true;
      }
      if (name === 'storm') {
        sky2.storm = 0;
        return true;
      }
      const hours: Record<string, number | null> = { day: 0.2, dusk: 0.585, night: 0.78, dawn: 0.945, auto: null };
      if (!(name in hours)) return false;
      sky2.fixed = hours[name];
      return true;
    },
    form: (name) => {
      if (name !== 'lelo' && name !== 'neon' && name !== 'pixel' && name !== 'auto') return false;
      forced = name === 'auto' ? null : name;
      return true;
    },
    play: () => hud.onPlay(),
    opened: () => {
      input.enabled = false;
      progress.unlock('terminal');
    },
    closed: () => {
      input.enabled = true;
    },
  });
  const seeds = new SeedGame();
  const seedLabels = () => {
    const t = content().game.seeds;
    seeds.labels = { title: t.title, hint: t.hint, over: t.over, best: t.best };
  };
  seeds.onToggle = (open) => {
    seedLabels();
    input.enabled = !open && !terminal.open;
  };
  hud.append(seeds.root);
  hud.onPlay = () => {
    seedLabels();
    seeds.toggle(true);
  };
  hud.append(terminal.root);
  hud.onTerminal = () => terminal.toggle();
  const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let combo = 0;
  window.addEventListener('keydown', (e) => {
    if (terminal.open || seeds.open) return;
    if (e.code === 'Backquote' || e.code === 'KeyT' || e.code === 'Slash') {
      if (mode !== 'intro') {
        e.preventDefault();
        terminal.toggle(true);
      }
      return;
    }
    if (e.code === 'KeyP' && mode !== 'intro' && !e.repeat) hud.onPostcard();
    if (e.code === 'KeyQ' && !e.repeat) whistle();
    if (e.code === 'KeyN' && !e.repeat && mode === 'fly' && !ending) minimap.toggle();
    combo = e.code === konami[combo] ? combo + 1 : e.code === konami[0] ? 1 : 0;
    if (combo === konami.length) {
      combo = 0;
      party = true;
      progress.unlock('konami');
      pulse.fire(looks.lelo.color);
      feathers.burst(flight.position, false, looks.pixel.palette);
    }
  });

  let goal: (Waypoint & { time: number }) | null = null;
  const bearing = (x: number, z: number) => Math.atan2(x - flight.position.x, z - flight.position.z) - flight.yaw;
  const minimap = new Minimap(map);
  hud.append(minimap.root);
  const setGoal = (waypoint: Waypoint | null) => {
    goal = waypoint ? { ...waypoint, time: 0 } : null;
    if (!goal) hud.setCompass(null);
    else if (goal.id) landmarks.ping(goal.id);
  };
  minimap.onWaypoint = (waypoint) => {
    setGoal(waypoint);
    if (waypoint) sound.chime(2);
  };
  const whistle = () => {
    if (mode !== 'fly' || ending) return;
    const next = landmarks.unseen(flight.position);
    if (!next) {
      sound.whistle(0);
      hud.toast(content().ui.leloSays, content().ui.allSeen);
      return;
    }
    setGoal({ x: next.landmark.x, z: next.landmark.z, id: next.landmark.id });
    sound.whistle(-Math.sin(bearing(next.landmark.x, next.landmark.z)));
  };
  hud.onWhistle = whistle;

  let mapAt = 0;
  let spray = 0;
  const track: number[] = [];
  let trackAt = 0;
  let aloft = 0;
  const cards: string[] = [];
  const finale = new Finale(map);
  hud.append(finale.root);
  let ending: { time: number; from: number; angle: number; radius: number; height: number; shown: boolean } | null = null;
  hud.onFinale = () => {
    if (mode !== 'visit' || visiting?.id !== 'bench' || ending) return;
    const camera = chase.camera.position;
    ending = {
      time: 0,
      from: sky2.fixed ?? sky2.cycle,
      angle: Math.atan2(camera.z - summit.z, camera.x - summit.x),
      radius: Math.hypot(camera.x - summit.x, camera.z - summit.z),
      height: camera.y - map.sample(summit.x, summit.z),
      shown: false,
    };
    tour = null;
    hud.closePanel();
    document.body.classList.add('ending');
    input.enabled = false;
    progress.unlock('sunset');
  };
  finale.onClose = () => {
    ending = null;
    override = null;
    sky2.fixed = null;
    document.body.classList.remove('ending');
    input.enabled = !terminal.open && !seeds.open;
    if (mode === 'visit' && visiting) hud.openPanel(visiting.id);
    chase.snap();
  };

  const shore = { surf: 0, lap: 0, open: 0 };
  let shoreAt = 0;
  const senseShore = () => {
    const p = flight.position;
    let land = 0;
    let water = 0;
    let deep = 0;
    const rings: [number, number][] = [
      [14, 1],
      [38, 0.6],
      [85, 0.3],
    ];
    for (const [radius, weight] of rings) {
      for (let k = 0; k < 8; k++) {
        const h = map.sample(p.x + Math.cos(k * 0.785) * radius, p.z + Math.sin(k * 0.785) * radius);
        if (h > 0.6) land += weight;
        else if (h < -0.3) {
          water += weight;
          if (h < -5) deep += weight;
        }
      }
    }
    const near = Math.min(1, land / 2.4) * Math.min(1, water / 2.4);
    const exposed = water > 0 ? Math.max(0, Math.min(1, (deep / water - 0.2) / 0.4)) : 0;
    const level = Math.max(map.sample(p.x, p.z), 0);
    const height = Math.max(0, Math.min(1, 1 - (p.y - level) / 85));
    shore.surf = near * exposed * height * height;
    shore.lap = near * (1 - exposed) * height * height;
    shore.open = land === 0 && map.sample(p.x, p.z) < -3 ? height : 0;
  };

  let snap = false;
  const postcard = () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const image = new Image();
      image.onload = () => {
        const w = 1600;
        const h = Math.round((w * image.height) / image.width);
        const card = document.createElement('canvas');
        card.width = w + 96;
        card.height = h + 230;
        const c2 = card.getContext('2d')!;
        c2.fillStyle = '#f4ecd8';
        c2.fillRect(0, 0, card.width, card.height);
        c2.drawImage(image, 48, 48, w, h);
        c2.strokeStyle = 'rgba(60,45,20,0.35)';
        c2.lineWidth = 2;
        c2.strokeRect(48, 48, w, h);
        c2.fillStyle = '#2a2418';
        c2.font = "italic 58px 'Iowan Old Style', Palatino, Georgia, serif";
        c2.fillText('Saúdos dende a illa de Lelo', 56, h + 132);
        c2.font = "26px ui-monospace, Menlo, monospace";
        c2.fillStyle = '#7a6a48';
        c2.fillText(`ndrs.es · ${new Date().toLocaleDateString(language())}`, 58, h + 184);
        c2.strokeStyle = '#b8442e';
        c2.lineWidth = 5;
        c2.strokeRect(card.width - 230, h + 74, 170, 120);
        c2.fillStyle = '#f6dd52';
        c2.beginPath();
        c2.arc(card.width - 145, h + 134, 34, 0, Math.PI * 2);
        c2.fill();
        c2.fillStyle = '#f0692c';
        c2.beginPath();
        c2.arc(card.width - 130, h + 142, 10, 0, Math.PI * 2);
        c2.fill();
        const thumb = document.createElement('canvas');
        thumb.width = 320;
        thumb.height = Math.round((320 * card.height) / card.width);
        thumb.getContext('2d')!.drawImage(card, 0, 0, thumb.width, thumb.height);
        cards.push(thumb.toDataURL('image/jpeg', 0.8));
        if (cards.length > 4) cards.shift();
        card.toBlob((out) => {
          if (!out) return;
          const file = new File([out], 'lelo-postcard.png', { type: 'image/png' });
          const share = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
          const save = () => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(out);
            link.download = 'lelo-postcard.png';
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
          };
          if (share.canShare?.({ files: [file] }) && input.touch) {
            navigator.share({ files: [file], title: 'ndrs.es' }).catch((error: Error) => {
              if (error.name !== 'AbortError') save();
            });
          } else save();
        }, 'image/png');
        URL.revokeObjectURL(image.src);
      };
      image.src = URL.createObjectURL(blob);
    }, 'image/png');
  };
  hud.onPostcard = () => {
    snap = true;
    hud.flash(true);
    setTimeout(() => hud.flash(false), 120);
  };
  const route = ['lighthouse', 'village', 'tank', 'fullstack', 'agents', 'jam', 'lan', 'studio', 'bench'];
  let tour: { index: number; time: number } | null = null;
  let touring = false;
  const hop = () => {
    if (!tour) return;
    const landmark = landmarks.list.find((l) => l.id === route[tour!.index]);
    const to = destinations[route[tour.index]];
    if (!landmark || !to) return;
    hud.flash(true);
    setTimeout(() => hud.flash(false), 250);
    flight.place(to.x, to.y, to.z, to.yaw);
    chase.snap();
    enter(landmark);
  };
  hud.onTour = () => {
    if (warp || ending) return;
    begin();
    tour = { index: 0, time: 0 };
    hop();
  };

  const shadowCamera = new THREE.OrthographicCamera(-SHADOW_HALF, SHADOW_HALF, SHADOW_HALF, -SHADOW_HALF, 0.1, 40);
  shadowCamera.layers.set(1);
  bird.root.traverse((node) => node.layers.enable(1));
  const silhouette = new THREE.MeshBasicNodeMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const shadowScene = new THREE.Scene();
  shadowScene.overrideMaterial = silhouette;
  const clearWas = new THREE.Color();
  const castShadow = () => {
    const light = env.sunDir.value;
    shadowCamera.position.copy(flight.position).addScaledVector(light, 12);
    shadowCamera.up.set(0, 0, 1);
    shadowCamera.lookAt(flight.position);
    shadowCamera.updateMatrixWorld();
    env.shadowRight.value.setFromMatrixColumn(shadowCamera.matrixWorld, 0);
    env.shadowUp.value.setFromMatrixColumn(shadowCamera.matrixWorld, 1);
    renderer.getClearColor(clearWas);
    const alphaWas = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    shadowScene.add(bird.root);
    renderer.setRenderTarget(birdShadow);
    renderer.render(shadowScene, shadowCamera);
    renderer.setRenderTarget(null);
    scene.add(bird.root);
    renderer.setClearColor(clearWas, alphaWas);
  };

  let override: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let frames = 0;
  let frameTime = 0;
  let last = performance.now();

  const prof = params.has('prof') ? new Profiler(renderer, scene) : null;
  renderer.setAnimationLoop(() => {
    prof?.frame();
    prof?.begin('update');
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    frameTime += now - last;
    if (!prof) governor.tick(now - last);
    last = now;
    frames++;

    const manual = input.update();
    chase.free(input.look.dx, input.look.dy, input.look.held && mode === 'fly');
    input.look.dx = input.look.dy = 0;
    let controls: Controls = manual;
    if (mode === 'intro') {
      controls = orbit(flight, attract);
    } else if (mode === 'visit' && visiting) {
      if (manual.interact) leave();
      else controls = orbit(flight, circle);
    } else {
      const near = landmarks.nearest(flight.position);
      const inReach = near && near.distance < near.landmark.reach ? near.landmark : null;
      hud.setPrompt(inReach ? inReach.id : null);
      if (inReach && manual.interact && !warp) enter(inReach);
    }

    flight.canLand = mode === 'fly' && !warp;
    flight.update(dt, controls);
    if (warp) {
      warp.time += dt;
      if (!warp.moved) {
        bird.setFade(Math.min(1, warp.time / 0.55));
        if (warp.time >= 0.7) {
          flight.place(warp.to.x, warp.to.y, warp.to.z, warp.to.yaw);
          chase.snap();
          warp.moved = true;
          feathers.burst(flight.position, true);
          hud.flash(false);
        }
      } else {
        bird.setFade(Math.max(0, 1 - (warp.time - 0.75) / 0.7));
        if (warp.time > 1.5) {
          bird.setFade(0);
          warp = null;
        }
      }
    }
    clock += dt;
    landmarks.update(dt);
    if (mode !== 'intro') {
      aloft += dt;
      if (now - trackAt > 1000) {
        trackAt = now;
        track.push(flight.position.x, flight.position.z);
        if (track.length > 7200) for (let i = 0; i < track.length / 2; i += 2) track.splice(i, 2);
      }
    }
    if (goal) {
      goal.time += dt;
      const away = Math.hypot(goal.x - flight.position.x, goal.z - flight.position.z);
      const reach = goal.id ? (landmarks.list.find((l) => l.id === goal!.id)?.reach ?? 60) * 0.7 : 35;
      if (away < reach || (goal.id && landmarks.visited.has(goal.id) && goal.time > 1)) {
        if (!goal.id) sound.chime(5);
        setGoal(null);
      } else if (mode === 'fly' && (goal.time < 12 || away < 260)) {
        const name = goal.id ? content().places[goal.id].name : content().ui.waypoint;
        hud.setCompass(content().ui.compass.replace('{name}', name).replace('{n}', String(Math.round(away / 10) * 10)), -bearing(goal.x, goal.z));
      } else {
        hud.setCompass(null);
      }
    }
    if (mode !== 'intro') {
      if (now - mapAt > 400) {
        mapAt = now;
        const dots: { x: number; z: number; color: string }[] = [];
        collectibles.spots.forEach((spot, i) => {
          if (!progress.feathers.has(i)) dots.push({ x: spot.x, z: spot.z, color: '#fff2a0' });
        });
        minimap.set(
          landmarks.list.map((l) => ({ id: l.id, x: l.x, z: l.z, seen: landmarks.visited.has(l.id) })),
          goal,
          dots,
        );
      }
      minimap.update(now, flight.position.x, flight.position.z, flight.yaw);
    }
    if (ending) {
      ending.time += dt;
      const e = ending;
      const rise = ramp(0, 40, e.time);
      const angle = e.angle + e.time * 0.045;
      const radius = e.radius + (330 - e.radius) * rise;
      const base = map.sample(summit.x, summit.z);
      const height = e.height + (120 - e.height) * rise;
      override = {
        position: new THREE.Vector3(summit.x + Math.cos(angle) * radius, base + height, summit.z + Math.sin(angle) * radius),
        target: new THREE.Vector3(summit.x, base + 1.5 + rise * 14, summit.z),
      };
      sky2.fixed = e.from + (0.585 - e.from) * ramp(0, 7, e.time);
      if (!e.shown && e.time > 8) {
        e.shown = true;
        finale.show({
          places: landmarks.visited.size,
          placeTotal: landmarks.list.length,
          feathers: progress.feathers.size,
          featherTotal: progress.featherTotal,
          minutes: Math.max(1, Math.round(aloft / 60)),
          track,
          stamps: landmarks.list.filter((l) => landmarks.visited.has(l.id)).map((l) => [l.x, l.z] as [number, number]),
          cards,
        });
      }
    }
    const wanted = formAt(flight.position.x, flight.position.z);
    if (!morph && !warp && wanted !== form) {
      morph = { time: 0, to: wanted, swapped: false };
      sound.chime(wanted === 'lelo' ? 0 : wanted === 'neon' ? -5 : 7);
    }
    if (morph) {
      morph.time += dt;
      const out = Math.min(1, morph.time / 0.26);
      if (!morph.swapped) {
        if (form === 'pixel') pixel.group.scale.setScalar(1.25 * (1 - out));
        else bird.setFade(out);
        if (morph.to === 'pixel' || form === 'pixel') post.shut.value = out;
        if (out >= 1) {
          showForm(morph.to);
          morph.swapped = true;
          pulse.fire(looks[morph.to].color);
          feathers.burst(flight.position, false, looks[morph.to].palette);
          if (form !== 'pixel') bird.setFade(1);
        }
      } else {
        const back = Math.min(1, (morph.time - 0.26) / 0.4);
        if (post.shut.value > 0) post.shut.value = Math.max(0, 1 - back * 1.4);
        if (form === 'pixel') pixel.group.scale.setScalar(1.25 * (1 + Math.sin(back * Math.PI) * 0.35) * Math.min(1, back * 2.5));
        else bird.setFade(1 - back);
        if (back >= 1) {
          if (form === 'pixel') pixel.group.scale.setScalar(1.25);
          else bird.setFade(0);
          morph = null;
        }
      }
    }
    pixel.update(flight, clock);
    trail.update(dt, (form === 'neon' || party) && form !== 'pixel' && !flight.landed);
    vapour.update(dt, form === 'lelo' && !party && !flight.landed && mode !== 'intro' && (flight.speed > 25 || Math.abs(flight.roll) > 0.62));
    clouds.update(dt, env.wind.value.x, env.wind.value.y);
    const fogged = clouds.inside(chase.camera.position);
    veil.style.opacity = fogged > 0.002 ? String(Math.min(0.92, fogged * 2.6)) : '0';
    if (mode === 'fly' && flight.position.y < 1.9 && flight.speed > 9 && map.sample(flight.position.x, flight.position.z) < -0.5) {
      spray += dt;
      if (spray > 0.16) {
        spray = 0;
        feathers.burst(flight.position, false, [[0.9, 0.97, 1], [0.7, 0.9, 1], [1, 1, 1]]);
      }
    }
    if (mode === 'fly') {
      const found = collectibles.near(flight.position, 3.4);
      if (found >= 0 && progress.collect(found)) {
        collectibles.take(found);
        pulse.fire(looks.lelo.color);
        sound.chime(3);
        hud.toast(content().game.feather, `${progress.feathers.size}/${progress.featherTotal}`);
        navigator.vibrate?.(12);
      }
      for (let i = 0; i < nods.list.length; i++) {
        const nod = nods.list[i];
        if (!progress.nods.has(i) && Math.abs(flight.position.x - nod.x) < 13 && Math.abs(flight.position.z - nod.z) < 13 && Math.abs(flight.position.y - nod.y) < 16 && progress.spot(i)) {
          hud.toast(`${content().game.nod} ${[...progress.nods].filter((n) => n < 100).length}/${nods.list.length}`, nod.name);
          sound.chime(7);
        }
      }
      words.forEach((w, i) => {
        if (!progress.nods.has(100 + i) && Math.abs(flight.position.x - w.x) < 7 && Math.abs(flight.position.z - w.z) < 7 && Math.abs(flight.position.y - w.y) < 8 && progress.spot(100 + i)) {
          hud.toast(w.word, content().words[w.word]);
          sound.chime(10);
        }
      });
      galicia.things.forEach((thing, i) => {
        if (progress.nods.has(200 + i) || (thing.night && sky2.night < 0.4)) return;
        if (Math.abs(flight.position.x - thing.x) > thing.reach || Math.abs(flight.position.z - thing.z) > thing.reach || Math.abs(flight.position.y - thing.y) > thing.reach + 14) return;
        if (!progress.spot(200 + i)) return;
        sparkles.hide(i);
        pulse.fire(looks.lelo.color);
        const entry = content().galicia[thing.id];
        const found = galicia.things.filter((_, k) => progress.nods.has(200 + k)).length;
        hud.toast(`${content().game.galicia} ${found}/${galicia.things.length} · ${entry.name}`, entry.text, 6500);
        sound.chime(8);
        if (found === galicia.things.length) progress.unlock('galicia');
      });
      if (!progress.achievements.has('boat') && flight.position.distanceTo(coca.group.position) < 42) {
        progress.unlock('boat');
        hud.toast('A Coca', content().game.boat, 8000);
        pulse.fire(new THREE.Color(1, 0.25, 0.15));
      }
      if (flight.position.x < -2650) progress.unlock('edge');
      if (sky2.night > 0.5) {
        const mx = (pathA[0] + pathB[0]) / 2;
        const mz = (pathA[1] + pathB[1]) / 2;
        const away = Math.hypot(flight.position.x - mx, flight.position.z - mz);
        const lit = procession.userData.lit as { value: number };
        if (away < 26 && flight.altitude < 14) lit.value = 0;
        else if (away > 120) lit.value = 1;
        if (lit.value > 0 && away < 75) progress.unlock('compana');
      }
      race.update(flight.position, dt);
      if (race.running) hud.setTimer(clockText(race.elapsed));
      if (flight.landed) progress.unlock('landing');
      if (flight.turningBack) progress.unlock('sea');
      if (form === 'neon') progress.unlock('neon');
      if (form === 'pixel') progress.unlock('pixel');
      if (Math.hypot(flight.position.x - peakX, flight.position.z - peakZ) < 45 && flight.altitude < 30) progress.unlock('summit');
      if (wreck && flight.position.distanceTo(wreck.position) < 40) progress.unlock('wreck');
    } else if (race.running) {
      race.cancel();
      hud.setTimer(null);
    }
    pulse.update(dt, flight.position, chase.camera);
    env.bird.value.copy(flight.position);
    feathers.update(dt);
    fleet.update(dt, now);
    coca.update(dt);
    city.update(dt);
    arcade.update(dt, now);
    hud.setTip(mode !== 'fly' ? null : flight.landed ? 'takeoff' : flight.turningBack ? 'sea' : null);
    bird.update(dt, flight, controls.steerX);
    for (const lawn of lawns) lawn.follow(flight.position.x, flight.position.z, flight.forward.x, flight.forward.z);
    if (override) {
      chase.camera.position.copy(override.position);
      chase.camera.lookAt(override.target);
    } else if (mode === 'visit' && visiting && flight.perchY === null) {
      chase.orbit(dt, flight, visiting.x, visiting.ground + visiting.focus, visiting.z, visiting.back);
    } else {
      chase.update(dt, flight);
    }
    const panel = mode === 'visit' ? hud.panelSize() : null;
    const below = panel !== null && panel.width > window.innerWidth * 0.8;
    chase.shift(dt, panel && !below ? panel.width / 2 : 0, panel && below ? panel.height * 0.45 : 0, window.innerWidth, window.innerHeight);
    sky.position.copy(chase.camera.position);
    trees.update(chase.camera.position);
    scatter.update(chase.camera.position);
    mood(chase.camera.position, dt);
    motes.update(dt);
    village.beacon.rotation.y = now * 0.00045;
    const tankDistance = Math.hypot(flight.position.x - tank.x, flight.position.z - tank.z);
    basin.update(tankDistance < 380);
    basin.focus(chase.camera.position.distanceTo(basin.group.position));
    if (sound.enabled) {
      if (now - shoreAt > 250) {
        shoreAt = now;
        senseShore();
      }
      sound.update({
        speed: mode === 'intro' ? 8 : flight.speed,
        surf: shore.surf,
        lap: shore.lap,
        open: shore.open,
        flapPhase: flight.flapPhase,
        flapPower: flight.flapPower,
        visiting: mode === 'visit',
        water: Math.min(1, Math.max(0, 1 - tankDistance / 60)),
        region: form === 'neon' ? 'city' : form === 'pixel' ? 'arcade' : 'island',
      });
    }
    hud.update();
    prof?.end('update');
    prof?.begin('shadow');
    castShadow();
    prof?.end('shadow');
    prof?.begin('render');
    post.render();
    prof?.end('render');
    if (snap) {
      snap = false;
      postcard();
    }
    if (tour && mode === 'visit') {
      tour.time += dt;
      if (tour.time > 13 && tour.index < route.length - 1) {
        tour.index++;
        tour.time = 0;
        touring = true;
        leave();
        touring = false;
        hop();
      }
    }
  });

  await nextFrame();
  try {
    trees.reveal(true);
    scatter.reveal(true);
    await renderer.compileAsync(scene, chase.camera);
  } catch {}
  trees.reveal(false);
  scatter.reveal(false);
  await stage(1);
  document.getElementById('boot')?.classList.add('done');
  document.body.classList.add('painted');
  hud.ready();

  const bootTime = performance.now() - bootStart;
  window.__stats = () => ({
    backend: webgpu ? 'webgpu' : 'webgl2',
    quality: quality.name,
    scale: +governor.scale.toFixed(2),
    step: governor.index,
    fps: frames ? Math.round((1000 * frames) / frameTime) : 0,
    frames,
    mode,
    position: flight.position.toArray().map((v) => Math.round(v)),
    calls: renderer.info.render.drawCalls,
    triangles: renderer.info.render.triangles,
    trees: trees.count,
    scatter: scatter.count,
    boot: Math.round(bootTime),
  });
  if (params.has('debug')) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;top:56px;z-index:60;margin:0;padding:6px 8px;font:11px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:92vw';
    document.body.append(box);
    const adapter = (renderer.backend as { adapter?: { info?: { vendor?: string; architecture?: string; description?: string } } }).adapter?.info;
    const gl = (renderer.backend as { gl?: WebGL2RenderingContext }).gl;
    const glInfo = gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : '';
    setInterval(() => {
      box.textContent = [
        `${webgpu ? 'webgpu' : 'webgl2'} ${quality.name} dpr ${window.devicePixelRatio} step ${governor.index} scale ${governor.scale.toFixed(2)} lod ${LodField.detail.toFixed(2)}`,
        `gpu ${adapter ? `${adapter.vendor} ${adapter.architecture} ${adapter.description}` : glInfo}`,
        `fps ${frames ? Math.round((1000 * frames) / frameTime) : 0} form ${form} mode ${mode}`,
        navigator.userAgent,
      ].join('\n');
    }, 500);
  }
  window.__dbg = {
    prof,
    quality,
    lawns,
    flight,
    bird,
    map,
    renderer,
    scene,
    landmarks,
    obstacles,
    basin,
    sky2,
    post,
    finale,
    whistle,
    minimap,
    env,
    chase,
    galicia,
    coca,
    track,
    progress,
    collectibles,
    race,
    nods,
    terminal,
    seeds,
    form: () => form,
    fleet,
    hud,
    warp: (id: string) => hud.onWarp(id as never),
    sound,
    begin,
    enter: (id: string) => {
      const landmark = landmarks.list.find((l) => l.id === id);
      if (landmark) {
        begin();
        enter(landmark);
      }
    },
    view: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      override = { position: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz) };
    },
    release: () => {
      override = null;
      chase.snap();
    },
    place: (x: number, y: number, z: number, yaw: number) => {
      flight.place(x, y, z, yaw);
      chase.snap();
    },
    freeze: (value: boolean) => {
      flight.frozen = value;
    },
    resetStats: () => {
      frames = 0;
      frameTime = 0;
    },
  };
  window.__ready = true;
}

start().catch((error) => {
  console.error(error);
  document.body.dataset.failed = 'true';
  if (!new URLSearchParams(location.search).has('fly')) location.replace(`/plain/?why=error&lang=${language()}`);
});
