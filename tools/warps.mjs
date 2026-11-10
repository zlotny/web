import puppeteer from 'puppeteer-core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const profile = mkdtempSync(join(tmpdir(), 'ndrs-chrome-'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: profile, args: ['--enable-unsafe-webgpu','--enable-gpu','--use-angle=metal','--ignore-gpu-blocklist','--mute-audio','--no-first-run'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type()==='warn') console.log('[console]', m.text().slice(0, 300)); });
  await page.goto(process.env.URL || 'http://localhost:5180/', { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 30000 });
  await page.evaluate('__dbg.begin()');
  await new Promise((r) => setTimeout(r, 1200));
  for (const id of process.argv.slice(2)) {
    await page.evaluate(`__dbg.warp("${id}")`);
    await new Promise((r) => setTimeout(r, 2600));
    await page.screenshot({ path: `/tmp/ndrs-shots/wp-${id}.png` });
    console.log(id, JSON.stringify(await page.evaluate('({fade: __dbg.bird && __dbg.bird.fade.value, pos: __dbg.flight.position.toArray().map(v=>v|0)})')));
  }
} finally { await browser.close(); rmSync(profile, { recursive: true, force: true }); }
