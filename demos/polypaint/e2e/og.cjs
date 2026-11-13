// Captures the 1200x630 social card. Usage: node e2e/og.cjs public/og.png (with `npx vite preview` running).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => { try { localStorage.setItem('polypaint-demo:v1:prefs', JSON.stringify({ tourDone: true, ribbon: false })); } catch {} });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4331/polypaint-demo/');
  await page.waitForFunction(() => window.__polypaint && window.__polypaint.store.getState().chain.status === 'ready', null, { timeout: 60000 });
  await page.evaluate(() => { const b = window.__polypaint.board; const r = document.querySelector('canvas.view').getBoundingClientRect(); b.zoom = 4.6; b.x = 540 - r.width / (2 * b.zoom); b.y = 500 - r.height / (2 * b.zoom); b.requestDraw(); });
  await page.waitForTimeout(700);
  await page.mouse.move(40, 600);
  await page.screenshot({ path: process.argv[2] });
  await browser.close();
})();
