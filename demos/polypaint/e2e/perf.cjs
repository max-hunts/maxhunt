// Performance: first paint vs EVM load order, long tasks while panning and zooming, transfer size.
const { chromium } = require('playwright');
const zlib = require('zlib');
const URL = process.env.URL || 'http://127.0.0.1:4331/polypaint-demo/';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const reqs = [];
  const t0 = Date.now();
  page.on('response', async (r) => {
    try {
      const body = await r.body();
      reqs.push({ url: r.url().replace(/^.*polypaint-demo\//, ''), at: Date.now() - t0, raw: body.length, gz: zlib.gzipSync(body, { level: 9 }).length });
    } catch { /* ignored */ }
  });
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) }); }).observe({ entryTypes: ['longtask'] });
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.__polypaint && window.__polypaint.store.getState().seedLoaded, null, { timeout: 20000 });
  const seedAt = Date.now() - t0;
  await page.waitForFunction(() => window.__polypaint.store.getState().chain.status === 'ready', null, { timeout: 60000 });
  const readyAt = Date.now() - t0;
  const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)])));
  const bootLong = await page.evaluate(() => window.__long.splice(0));
  console.log('paint', JSON.stringify(paint), '| canvas painted from seed at', seedAt, 'ms | chain ready at', readyAt, 'ms');
  console.log('long tasks during boot (main thread):', JSON.stringify(bootLong));
  const worker = reqs.find((r) => /worker-/.test(r.url));
  console.log('EVM worker chunk requested at', worker && worker.at, 'ms (after first paint:', worker && worker.at > paint['first-contentful-paint'], ')');

  await page.locator('.tour button', { hasText: 'Skip' }).click().catch(() => {});
  // frame pacing while zooming and panning
  await page.evaluate(() => { window.__frames = []; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; window.__raf = requestAnimationFrame(tick); }; window.__raf = requestAnimationFrame(tick); });
  await page.mouse.move(600, 450);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -180); await page.waitForTimeout(60); }
  for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 160); await page.waitForTimeout(50); }
  await page.keyboard.press('h');
  await page.mouse.move(700, 450); await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(700 - i * 8, 450 + Math.sin(i / 5) * 60);
  await page.mouse.up();
  await page.keyboard.press('0'); await page.waitForTimeout(900);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -220); await page.waitForTimeout(50); }
  await page.waitForTimeout(600);
  const stats = await page.evaluate(() => { cancelAnimationFrame(window.__raf); const f = window.__frames.slice(2).sort((a, b) => a - b); const p = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))]; return { frames: f.length, median: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), p99: +p(0.99).toFixed(1), max: +f[f.length - 1].toFixed(1), over50: f.filter((x) => x > 50).length, long: window.__long.splice(0) }; });
  console.log('pan/zoom frame times (ms):', JSON.stringify(stats));

  const used = reqs.filter((r) => !/\.woff$/.test(r.url));
  const sum = (a, k) => a.reduce((n, r) => n + r[k], 0);
  const firstPaint = used.filter((r) => !/worker-|secp256k1|ccip/.test(r.url));
  console.log('requests:', used.map((r) => `${r.url || 'index.html'} ${(r.gz / 1024).toFixed(1)}k`).join(', '));
  console.log(`transfer (gzip -9 equivalent): total ${(sum(used, 'gz') / 1024).toFixed(0)} KB over ${used.length} requests; needed before the chain boots ${(sum(firstPaint, 'gz') / 1024).toFixed(0)} KB; raw ${(sum(used, 'raw') / 1024).toFixed(0)} KB`);
  await browser.close();
})();
