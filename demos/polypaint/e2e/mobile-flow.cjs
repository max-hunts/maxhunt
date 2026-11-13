// Phone (390x844) checks: no horizontal overflow, tap to select, pinch to zoom, buy through bottom sheets.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://127.0.0.1:4330/polypaint-demo/';
const out = [];
const check = (name, ok, detail = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'no-preference',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const S = () => page.evaluate(() => { const s = window.__polypaint.store.getState(); const b = window.__polypaint.board; return { basket: s.basket, zoom: b.zoom, x: b.x, y: b.y, hover: s.hover && { x: s.hover.x, y: s.hover.y, pinned: s.hover.pinned, owner: s.hover.owner }, myCount: s.myCount, connected: s.wallet.connected, activity: s.wallet.activity.map((a) => a.status), sheet: s.sheet }; });
  const pt = (x, y) => page.evaluate(([x, y]) => { const b = window.__polypaint.board; const r = document.querySelector('canvas.view').getBoundingClientRect(); return [r.left + (x + 0.5 - b.x) * b.zoom, r.top + (y + 0.5 - b.y) * b.zoom]; }, [x, y]);
  const overflow = () => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth, body: document.body.scrollWidth }));

  await page.goto(URL);
  await page.waitForFunction(() => window.__polypaint && window.__polypaint.store.getState().chain.status === 'ready', null, { timeout: 60000 });
  await page.locator('.tour button', { hasText: 'Skip' }).tap();
  await page.evaluate(() => window.__polypaint.store.setState({}) );
  let o = await overflow();
  check('no horizontal overflow at 390 px', o.doc <= o.win && o.body <= o.win, JSON.stringify(o));

  // pause bots via the More sheet
  await page.locator('.dock button', { hasText: 'More' }).tap();
  await page.waitForTimeout(350);
  await page.locator('.morebtns button', { hasText: 'Pause other buyers' }).tap();
  await page.waitForTimeout(300);

  // pinch to zoom in around the middle of the canvas
  let s0 = await S();
  await touch('touchStart', [[150, 380], [240, 380]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[150 - i * 8, 380], [240 + i * 8, 380]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  let s1 = await S();
  check('pinch zooms in', s1.zoom > s0.zoom * 1.5, `${s0.zoom.toFixed(2)}x -> ${s1.zoom.toFixed(2)}x`);

  // one-finger drag pans with the select tool
  await touch('touchStart', [[200, 400]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[200 - i * 10, 400 - i * 6]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  let s2 = await S();
  check('one-finger drag pans', Math.abs(s2.x - s1.x) > 2 && Math.abs(s2.y - s1.y) > 1, `dx ${(s2.x - s1.x).toFixed(1)} dy ${(s2.y - s1.y).toFixed(1)}`);

  // bring a known free spot and a known owned spot into view
  await page.evaluate(() => { const b = window.__polypaint.board; b.jumpTo({ x0: 484, y0: 486, x1: 512, y1: 530 }, 12); });
  await page.waitForTimeout(900);
  // tap an unowned pixel -> goes into the draft
  let [fx, fy] = await pt(490, 526);
  await page.touchscreen.tap(fx, fy);
  await page.waitForTimeout(250);
  let s3 = await S();
  check('tap selects an unowned pixel', s3.basket.actionable === 1, `actionable ${s3.basket.actionable}`);
  // tap an owned pixel -> pinned info card
  let [ox, oy] = await pt(505, 492);
  await page.touchscreen.tap(ox, oy);
  await page.waitForTimeout(250);
  let s4 = await S();
  check('tap on an owned pixel pins its info card', !!s4.hover && s4.hover.pinned && !!s4.hover.owner && s4.basket.actionable === 1);
  await page.evaluate(() => window.__polypaint.board.unpin());

  // brush a few more with a finger
  await page.locator('button[aria-label^="Brush"]').tap();
  const [bx, by] = await pt(492, 526), [cx, cy] = await pt(497, 526);
  await touch('touchStart', [[bx, by]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[bx + ((cx - bx) * i) / 5, by]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(250);
  let s5 = await S();
  check('finger painting adds to the draft', s5.basket.actionable === 7, `actionable ${s5.basket.actionable}`);

  // buy through the sheets
  await page.locator('[data-testid="dock-basket"]').tap();
  await page.waitForTimeout(350);
  await page.locator('[data-testid="checkout"]').tap();
  await page.locator('[data-testid="account-0"]').waitFor();
  await page.locator('[data-testid="account-0"]').tap();
  await page.locator('[data-testid="confirm"]').waitFor();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="confirm"]').tap();
  await page.waitForFunction(() => { const s = window.__polypaint.store.getState(); return s.wallet.activity.length > 0 && !s.wallet.activity.some((a) => a.status === 'pending') && !(s.checkout && s.checkout.busy); }, null, { timeout: 30000 });
  await page.waitForTimeout(1300);
  let s6 = await S();
  check('buy on phone confirms', s6.activity[0] === 'confirmed' && s6.myCount === 7, `myCount ${s6.myCount}`);
  o = await overflow();
  check('still no horizontal overflow with sheets open', o.doc <= o.win && o.body <= o.win, JSON.stringify(o));
  check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`\n${out.filter(Boolean).length}/${out.length} phone checks passed`);
  await browser.close();
})().catch((e) => { console.error('CRASHED:', e.message.split('\n').slice(0, 8).join('\n')); process.exit(2); });
