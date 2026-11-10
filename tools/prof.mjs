import puppeteer from 'puppeteer-core';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const base = opt('url', 'http://localhost:5180/');
const query = opt('query', '');
const mobile = flag('mobile');
const [width, height] = opt('size', mobile ? '390x844' : '1440x810').split('x').map(Number);
const dpr = Number(opt('dpr', mobile ? '3' : '2'));
const ms = Number(opt('ms', '1200'));
const run = opt('run', 'path');
const shots = opt('shots', '');
const out = opt('out', '');

const profile = mkdtempSync(join(tmpdir(), 'ndrs-prof-'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: profile,
  protocolTimeout: 600000,
  args: [
    ...(flag('webgl') ? ['--disable-features=WebGPU'] : ['--enable-unsafe-webgpu', '--enable-webgpu-developer-features']),
    '--enable-gpu',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
  ],
});

const report = { url: '', runs: {} };
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 400)));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300));
  });
  if (opt('cpu', '')) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt('cpu', '1')) });
  }
  const sep = query ? '&' : '';
  report.url = `${base}?fly&prof${sep}${query}`;
  await page.goto(report.url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__ready === true', { timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => ({ quality: window.__dbg.quality, timing: window.__dbg.prof.timing, size: [innerWidth, innerHeight, devicePixelRatio], buffer: [window.__dbg.renderer.domElement.width, window.__dbg.renderer.domElement.height] }));
  report.info = info;
  console.error(JSON.stringify(info));

  const stops = JSON.parse(
    opt(
      'stops',
      JSON.stringify([
        { id: 'start', from: [-1250, -260], to: [0, 0], at: 0 },
        { id: 'p20', from: [-1250, -260], to: [0, 0], at: 0.2 },
        { id: 'p40', from: [-1250, -260], to: [0, 0], at: 0.4 },
        { id: 'p60', from: [-1250, -260], to: [0, 0], at: 0.6 },
        { id: 'p80', from: [-1250, -260], to: [0, 0], at: 0.8 },
        { id: 'center', from: [-1250, -260], to: [0, 0], at: 1 },
        { id: 'city', from: [0, 0], to: [700, 200], at: 0.7 },
      ]),
    ),
  );
  const goTo = (stop) =>
    page.evaluate((stop) => {
      const d = window.__dbg;
      d.begin();
      const [ax, az] = stop.from;
      const [bx, bz] = stop.to;
      const x = ax + (bx - ax) * stop.at;
      const z = az + (bz - az) * stop.at;
      const yaw = Math.atan2(bx - ax, bz - az);
      const y = Math.max(d.map.sample(x, z), 0) + (stop.up ?? 22);
      d.place(x, y, z, yaw);
      d.freeze(true);
      d.sky2.fixed = 0.18;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      d.view(x - fx * 14, y + 5, z - fz * 14, x + fx * 40, y - 6, z + fz * 40);
      return [Math.round(x), Math.round(y), Math.round(z)];
    }, stop);

  const runs = run.split(',');
  if (runs.includes('path')) {
    report.runs.path = [];
    for (const stop of stops) {
      const pos = await goTo(stop);
      const s = await page.evaluate((ms) => window.__dbg.prof.sample(ms, 600), ms);
      report.runs.path.push({ id: stop.id, pos, ...s });
      console.error(`${stop.id.padEnd(8)} frame ${s.frame.toFixed(2)} p95 ${s.frameP95.toFixed(2)} cpu ${JSON.stringify(s.cpu)} calls ${s.calls} tris ${s.triangles}`);
      if (shots) await page.screenshot({ path: `${shots}-${stop.id}.png` });
    }
  }
  if (runs.includes('ablate')) {
    const where = opt('where', 'p40');
    const stop = stops.find((s) => s.id === where) ?? stops[0];
    await goTo(stop);
    const result = await page.evaluate((ms) => window.__dbg.prof.ablate(ms), ms);
    report.runs.ablate = { where, ...result };
    console.error(`ablate at ${where}: base frame ${result.base.frame} gpu ${result.base.gpu} cpu ${JSON.stringify(result.base.cpu)} calls ${result.base.calls} tris ${result.base.triangles}`);
    for (const p of result.parts) console.error(`  ${p.name.padEnd(28)} frame ${String(p.frame).padStart(6)} gpu ${String(p.gpu).padStart(6)} cpu ${String(p.cpu).padStart(6)} calls ${String(p.calls).padStart(5)} tris ${p.triangles}`);
  }
  if (runs.includes('knobs')) {
    const where = opt('where', 'p40');
    const stop = stops.find((s) => s.id === where) ?? stops[0];
    await goTo(stop);
    const q = report.info.quality;
    const knobs = [
      ['base', `0`],
      ['paint0', `__dbg.post.build({ radius: 0, bloom: ${q.bloom} })`],
      ['nobloom', `__dbg.post.build({ radius: ${q.paint}, bloom: false })`],
      ['nopost', `__dbg.post.build({ radius: 0, bloom: false })`],
      ['restore', `__dbg.post.build({ radius: ${q.paint}, bloom: ${q.bloom} })`],
      ['halfres', `(__dbg.renderer.setPixelRatio(__dbg.renderer.getPixelRatio() / 2), __dbg.renderer.setSize(innerWidth, innerHeight, false))`],
      ['restoreres', `(__dbg.renderer.setPixelRatio(__dbg.renderer.getPixelRatio() * 2), __dbg.renderer.setSize(innerWidth, innerHeight, false))`],
    ];
    report.runs.knobs = [];
    for (const [name, code] of knobs) {
      await page.evaluate(code);
      const s = await page.evaluate((ms) => window.__dbg.prof.sample(ms, 800), ms);
      report.runs.knobs.push({ name, ...s });
      console.error(`${name.padEnd(10)} frame ${s.frame.toFixed(2)} cpu ${JSON.stringify(s.cpu)} calls ${s.calls} tris ${s.triangles}`);
    }
  }
  if (runs.includes('eval')) {
    const code = opt('eval', '0');
    report.runs.eval = await page.evaluate(code);
    console.error(JSON.stringify(report.runs.eval, null, 1));
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
