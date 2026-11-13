// Captures the case-study screenshots from the production build at 1440x900 @2x.
// Usage: (cd demos/polypaint && npx vite preview) then  node e2e/shots.cjs
// Output: e2e/shots/polypaint-*.png (copy into src/assets/images/). Needs `playwright` resolvable.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.env.URL || 'http://127.0.0.1:4331/polypaint-demo/';
const OUT = process.env.OUT || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

// 5x7 glyphs for the draft lettering
const FONT = { H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'] };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    try {
      if (!localStorage.getItem('polypaint-demo:v1:prefs')) localStorage.setItem('polypaint-demo:v1:prefs', JSON.stringify({ tourDone: true, ribbon: true }));
    } catch {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  // Toggled from inside the page so the mouse (and the hover card) stays where the script put it.
  const setBots = (on) => page.evaluate((on) => {
    const b = document.querySelector('.ticker .r button');
    if (on !== /Pause/.test(b.textContent || '')) b.click();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, on);
  // The buyers are paused while the script works (so its pixels are deterministic) and resumed for each capture.
  const shot = async (name, keepToast = false) => {
    await setBots(true);
    if (!keepToast) await page.evaluate(() => window.__polypaint.store.setState({ toast: null }));
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `polypaint-${name}.png`) });
    await setBots(false);
    console.log('shot', name);
  };
  const pt = (x, y) => page.evaluate(([x, y]) => { const b = window.__polypaint.board; const r = document.querySelector('canvas.view').getBoundingClientRect(); return [r.left + (x + 0.5 - b.x) * b.zoom, r.top + (y + 0.5 - b.y) * b.zoom]; }, [x, y]);
  const hover = async (x, y) => { const [sx, sy] = await pt(x, y); await page.mouse.move(sx - 3, sy - 3); await page.mouse.move(sx, sy); };
  const settled = async () => {
    await page.waitForFunction(() => { const s = window.__polypaint.store.getState(); return s.wallet.queue.length === 0 && !s.wallet.activity.some((a) => a.status === 'pending') && !(s.checkout && s.checkout.busy); }, null, { timeout: 60000 });
    await page.waitForTimeout(1400);
  };
  const closeWallet = () => page.evaluate(() => window.__polypaint.wallet.close());

  await page.goto(URL);
  await page.waitForFunction(() => window.__polypaint && window.__polypaint.store.getState().chain.status === 'ready', null, { timeout: 60000 });
  await page.waitForTimeout(600);
  // Let the simulated buyers mint a few sprites first, with the view parked away from the centerpiece.
  await page.evaluate(() => window.__polypaint.board.jumpTo({ x0: 180, y0: 200, x1: 300, y1: 280 }, 6));
  await page.waitForFunction(() => window.__polypaint.store.getState().ticker.length >= 3, null, { timeout: 150000 });
  await setBots(false);
  // Back to the view the page opens on.
  await page.evaluate(() => { const b = window.__polypaint.board; const r = document.querySelector('canvas.view').getBoundingClientRect(); b.anim = null; b.zoom = Math.min(8, Math.max(2, Math.min(r.width / 250, r.height / 135))); b.x = 527 - r.width / (2 * b.zoom); b.y = 505 - r.height / (2 * b.zoom); b.requestDraw(); });
  await page.waitForTimeout(600);
  await page.locator('.chip.connect').click();
  await page.locator('[data-testid="account-0"]').click();
  await page.waitForTimeout(300);
  await closeWallet();

  // ---- hero: a brush draft that runs into someone else's block, hover card on the Shiba
  const draft = [];
  [...'HI!'].forEach((ch, ci) => FONT[ch].forEach((row, r) => [...row].forEach((v, c) => { if (v === '1') for (let a = 0; a < 2; a++) for (let d = 0; d < 2; d++) draft.push((524 + r * 2 + a) * 1000 + 492 + ci * 12 + c * 2 + d); })));
  for (let x = 492; x <= 529; x++) { draft.push(540 * 1000 + x); draft.push(541 * 1000 + x); }
  const info = await page.evaluate((ids) => { const pp = window.__polypaint; pp.store.setState({ tool: 'brush' }); pp.board.addToDraft(ids, 0xff6b3d); const m = pp.board.mirror; return { owned: ids.filter((id) => m.isOwned(id)).length, total: ids.length }; }, draft);
  console.log('draft', JSON.stringify(info));
  await hover(574, 513);
  await shot('hero');

  // ---- confirm screen
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="confirm"]').waitFor();
  await page.mouse.move(60, 760);
  await shot('confirm');
  await page.locator('[data-testid="confirm"]').click();
  await settled();

  // ---- revert: send the flagged pixels anyway
  await page.locator('.anyway input').check();
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="sim-revert"]').waitFor();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  await page.locator('[data-testid="tab-activity"]').click();
  await page.mouse.move(60, 760);
  await shot('revert', true);
  await closeWallet();
  await page.locator('.anyway input').uncheck();
  await page.evaluate(() => { const pp = window.__polypaint; pp.board.clearDraft(); pp.store.setState({ checkout: null }); });

  // ---- image stamp: a walking Shiba from the portfolio, placed on free canvas
  await page.keyboard.press('i');
  await page.locator('.stampbar input[type="file"]').setInputFiles(process.env.STAMP || path.join(__dirname, '../../../public/shiba/dog-right-2.png'));
  await page.waitForFunction(() => !!window.__polypaint.store.getState().stamp, null, { timeout: 10000 });
  await page.locator('.stampbar select').first().selectOption('48');
  await page.waitForTimeout(400);
  // find free room near the centerpiece for the ghost
  const spot = await page.evaluate(() => {
    const pp = window.__polypaint, m = pp.board.mirror, st = pp.store.getState().stamp;
    let best = null;
    for (let y = 560; y < 640; y += 2) for (let x = 440; x < 600; x += 2) {
      let free = true;
      for (let j = 0; j < st.h + 2 && free; j++) for (let i = 0; i < st.w + 2; i++) if (m.isOwned((y + j) * 1000 + x + i)) { free = false; break; }
      if (free) { const d = Math.hypot(x - 500, y - 575); if (!best || d < best.d) best = { x, y, d }; }
    }
    return best && { x: best.x + 1, y: best.y + 1, w: st.w, h: st.h };
  });
  console.log('stamp spot', JSON.stringify(spot));
  await page.evaluate(([x, y]) => { const b = window.__polypaint.board; b.jumpTo({ x0: x - 40, y0: y - 52, x1: x + 90, y1: y + 62 }, 7); }, [spot.x, spot.y]);
  await page.waitForTimeout(900);
  // drag the ghost from where it sits to the free spot
  const ghost = await page.evaluate(() => { const s = window.__polypaint.board['stamp']; return { x: s.x, y: s.y }; });
  const [gx, gy] = await pt(ghost.x + 10, ghost.y + 10), [tx, ty] = await pt(spot.x + 10, spot.y + 10);
  await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move((gx + tx) / 2, (gy + ty) / 2, { steps: 6 }); await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up();
  await page.mouse.move(60, 760);
  await shot('stamp');
  await page.locator('[data-testid="stamp-place"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="confirm"]').waitFor();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  await closeWallet();

  // ---- my pixels: give the stamp a link, then show the list
  await page.locator('[data-testid="tab-mine"]').click();
  await page.waitForTimeout(500);
  await page.locator('.group .acts button[aria-label^="Set a link"]').first().click();
  await page.locator('.relink input').fill('https://maxhunt.design');
  await page.locator('.relink button').click();
  await page.locator('[data-testid="confirm"]').waitFor();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  await closeWallet();
  await page.evaluate(() => window.__polypaint.store.setState({ checkout: null, tool: 'select' }));
  await page.waitForTimeout(600);
  await hover(spot.x + 30, spot.y + 14);
  await shot('mine');

  // ---- zoomed in: grid lines and a hover card with a link
  await page.locator('.tabs button', { hasText: 'Basket' }).click();
  await page.evaluate(() => window.__polypaint.board.jumpTo({ x0: 494, y0: 468, x1: 548, y1: 500 }, 16));
  await page.waitForTimeout(1100);
  await hover(494, 496);
  await shot('hover');

  // ---- overview: the whole canvas
  await page.mouse.move(720, 200);
  await page.keyboard.press('0');
  await page.waitForTimeout(1200);
  await hover(300, 300);
  await page.mouse.move(40, 870);
  await shot('overview');

  console.log(errs.join('\n') || 'no console errors');
  await browser.close();
})().catch((e) => { console.error('CRASHED:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
