import puppeteer from 'puppeteer-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const url = opt('url', 'http://localhost:5173/');
const out = opt('out', '/tmp/shot.png');
const [width, height] = opt('size', '1440x810').split('x').map(Number);
const wait = Number(opt('wait', '2500'));
const dpr = Number(opt('dpr', '1'));
const evals = args.flatMap((a, i) => (a === '--eval' ? [args[i + 1]] : []));
const afters = args.flatMap((a, i) => (a === '--after' ? [args[i + 1]] : []));
const shots = Number(opt('shots', '1'));
const gap = Number(opt('gap', '700'));

const profile = mkdtempSync(join(tmpdir(), 'ndrs-chrome-'));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  userDataDir: profile,
  args: [
    ...(flag('no-webgpu') ? [] : ['--enable-unsafe-webgpu']),
    '--enable-gpu',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--no-first-run',
    ...(flag('no-webgpu') ? ['--disable-features=WebGPU'] : []),
  ],
});

const logs = [];
let result = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: flag('mobile'), hasTouch: flag('mobile') });
  if (flag('no-webgpu')) await page.evaluateOnNewDocument("Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined })");
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn' || flag('verbose')) logs.push(`[${m.type()}] ${m.text()}`.slice(0, 600));
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack || e).slice(0, 900)}`));
  page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()}`));
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__ready === true', { timeout: Number(opt('ready', '20000')) }).catch(() => logs.push('[harness] __ready timeout'));
  for (const code of evals) {
    const value = await page.evaluate(code).catch((e) => `EVAL ERROR ${e}`);
    if (value !== undefined && value !== null) logs.push(`[eval] ${JSON.stringify(value)}`.slice(0, 1500));
  }
  await new Promise((r) => setTimeout(r, wait));
  for (let i = 0; i < shots; i++) {
    const file = shots === 1 ? out : out.replace(/\.png$/, `-${i}.png`);
    await page.screenshot({ path: file });
    if (i < shots - 1) await new Promise((r) => setTimeout(r, gap));
  }
  for (const code of afters) {
    const value = await page.evaluate(code).catch((e) => `EVAL ERROR ${e}`);
    if (value !== undefined && value !== null) logs.push(`[after] ${JSON.stringify(value)}`.slice(0, 1500));
  }
  if (flag('fps')) {
    await page.evaluate('window.__dbg.resetStats()');
    await new Promise((r) => setTimeout(r, 2000));
  }
  result = await page.evaluate('window.__stats ? window.__stats() : null').catch(() => null);
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(JSON.stringify({ out, stats: result, logs }, null, 1));
