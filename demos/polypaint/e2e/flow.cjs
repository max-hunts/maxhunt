// End-to-end check of the PolyPaint demo against the verification checklist.
// Usage: start `npm run dev` (port 4330) or `npx vite preview` (4331), then
//   URL=http://127.0.0.1:4331/polypaint-demo/ node e2e/flow.cjs
// Needs `playwright` resolvable (it is not a dependency of this package).
const { chromium } = require('playwright');

const URL = process.env.URL || 'http://127.0.0.1:4330/polypaint-demo/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());

  const S = () => page.evaluate(() => {
    const s = window.__polypaint.store.getState();
    const w = s.wallet;
    const me = w.connected ? w.accounts[w.selected].address : null;
    return {
      chain: s.chain, basket: s.basket, mode: s.mode, myCount: s.myCount, stats: s.stats,
      connected: w.connected, selected: w.selected, me, open: w.open, view: w.view, queue: w.queue.length,
      balance: me ? w.balances[me.toLowerCase()] : null,
      activity: w.activity.map((a) => ({ title: a.title, status: a.status, reason: a.reason, fee: a.fee, value: a.value, block: a.block })),
      ticker: s.ticker.map((t) => ({ kind: t.kind, count: t.count, mine: t.mine })),
      checkout: s.checkout,
    };
  });
  const pt = (x, y) => page.evaluate(([x, y]) => {
    const b = window.__polypaint.board;
    const r = document.querySelector('canvas.view').getBoundingClientRect();
    return [r.left + (x + 0.5 - b.x) * b.zoom, r.top + (y + 0.5 - b.y) * b.zoom];
  }, [x, y]);
  const px = (x, y) => page.evaluate(([x, y]) => {
    const m = window.__polypaint.board.mirror, id = y * 1000 + x;
    return { owner: m.ownerOf(id), colour: m.colours[id], url: m.urlOf(id) };
  }, [x, y]);
  const drag = async (x0, y0, x1, y1) => {
    const [ax, ay] = await pt(x0, y0), [bx, by] = await pt(x1, y1);
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 4 });
    await page.mouse.move(bx, by, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(150);
  };
  const ready = async () => {
    await page.waitForFunction(() => window.__polypaint && window.__polypaint.store.getState().chain.status === 'ready', null, { timeout: 60000 });
    await page.waitForTimeout(300);
  };
  const settled = async () => {
    await page.waitForFunction(() => {
      const s = window.__polypaint.store.getState();
      return !s.wallet.activity.some((a) => a.status === 'pending') && !(s.checkout && s.checkout.busy);
    }, null, { timeout: 30000 });
    await page.waitForTimeout(1300); // let the event sync and balance refresh land
  };
  const clearDraft = () => page.evaluate(() => window.__polypaint.board.clearDraft());
  const closeWallet = () => page.evaluate(() => window.__polypaint.wallet.close());

  // ---- boot -------------------------------------------------------------
  await page.goto(URL);
  await ready();
  await page.locator('.tour button', { hasText: 'Skip' }).click().catch(() => {});
  // Keep the simulated buyers out of the way: they could take the pixels the checks paint on.
  await page.locator('.ticker .r button', { hasText: 'Pause buyers' }).click();
  let s = await S();
  check('chain boots and canvas is seeded', s.chain.status === 'ready' && s.stats.owned > 50000, `block ${s.chain.block}, ${s.stats.owned} px, ${s.stats.owners} owners`);

  // ---- connect ----------------------------------------------------------
  await page.locator('.chip.connect').click();
  await page.locator('[data-testid="account-0"]').click();
  await page.waitForTimeout(300);
  s = await S();
  check('connect wallet', s.connected && s.balance === '1000000000000000000000', `balance ${s.balance}`);
  await closeWallet();
  const bal0 = BigInt(s.balance);

  // ---- buy --------------------------------------------------------------
  const free = await px(488, 524);
  await page.keyboard.press('b');
  await drag(488, 524, 500, 524);
  s = await S();
  check('brush draft on unowned pixels', free.owner === null && s.basket.actionable === 13, `actionable ${s.basket.actionable}`);
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="confirm"]').waitFor();
  const simOk = (await page.locator('[data-testid="sim-revert"]').count()) === 0;
  const total = await page.locator('[data-testid="confirm-total"]').textContent();
    await page.locator('[data-testid="confirm"]').click();
  await settled();
  s = await S();
  const buy = s.activity[0];
  const spent = bal0 - BigInt(s.balance);
  const expected = 13n * 400000000000000000n + BigInt(buy.fee || 0);
  check('buy confirms', buy.status === 'confirmed' && simOk, `${buy.title}, block ${buy.block}, wallet showed total ${total}`);
  check('balance drops by n x 0.4 POL plus gas', spent === expected, `spent ${spent} = 5.2 POL + fee ${buy.fee}`);
  const mine = await px(488, 524);
  check('pixels change owner and color', mine.owner && mine.owner.toLowerCase() === s.me.toLowerCase() && mine.colour === 0xff6b3d && s.myCount === 13, `myCount ${s.myCount}`);
  check('ticker shows the purchase', s.ticker.some((t) => t.mine && t.kind === 'buy' && t.count === 13));
  check('draft is emptied after a confirmed buy', s.basket.total === 0);
  const bal1 = BigInt(s.balance);

  // ---- already owned -> real revert --------------------------------------
  const taken = await px(505, 492);
  await page.keyboard.press('r');
  await drag(504, 491, 506, 493);
  s = await S();
  check('owned pixels are flagged and excluded', taken.owner !== null && s.basket.actionable === 0 && s.basket.others === 9, `others ${s.basket.others}`);
  await page.locator('.anyway input').check();
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="sim-revert"]').waitFor();
  const simText = await page.locator('[data-testid="sim-revert"]').textContent();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  s = await S();
  const rev = s.activity[0];
  check('buying an owned pixel reverts with the contract message', rev.status === 'reverted' && rev.reason === 'Pixel is already owned' && /Pixel is already owned/.test(simText), `reason "${rev.reason}"`);
  check('a reverted buy costs gas only', bal1 - BigInt(s.balance) === BigInt(rev.fee) && BigInt(rev.fee) > 0n, `fee ${rev.fee}`);
  await page.locator('[data-testid="tab-activity"]').click();
  await page.waitForTimeout(200);
  await closeWallet();
  await page.locator('.anyway input').uncheck();
  await clearDraft();

  // ---- insufficient funds -------------------------------------------------
  await page.evaluate(() => window.__polypaint.wallet.switchAccount(2));
  await page.waitForTimeout(300);
  await page.keyboard.press('b');
  await drag(488, 528, 497, 528);
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="insufficient"]').waitFor();
  const disabled = await page.locator('[data-testid="confirm"]').isDisabled();
  s = await S();
  check('insufficient funds: wallet blocks the transaction', disabled, `balance ${s.balance} wei for a 4 POL buy`);
  await page.locator('[data-testid="reject"]').click();
  await page.waitForTimeout(300);
  s = await S();
  check('rejecting leaves nothing pending', s.queue === 0 && s.checkout.batches[0].status === 'rejected');
  await closeWallet();
  await clearDraft();
  await page.evaluate(() => window.__polypaint.wallet.switchAccount(0));
  await page.waitForTimeout(300);

  // ---- recolor own ---------------------------------------------------------
  await page.locator('.mode button', { hasText: 'Recolor' }).click();
  await page.locator('.sw button').nth(4).click(); // teal
  await page.keyboard.press('b');
  await drag(488, 524, 492, 524);
  s = await S();
  check('recolor mode: own pixels are actionable', s.basket.actionable === 5 && s.mode === 'recolor', `actionable ${s.basket.actionable}`);
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  s = await S();
  const rc = await px(490, 524);
  check('recoloring your own pixel works', s.activity[0].status === 'confirmed' && rc.colour === 0x2fc4d6, `color #${rc.colour.toString(16)}`);

  // ---- recolor someone else's ----------------------------------------------
  await closeWallet();
  await drag(504, 491, 506, 491);
  s = await S();
  check('recolor mode: other owners\' pixels are flagged', s.basket.actionable === 0 && s.basket.others === 3);
  await page.locator('.anyway input').check();
  await page.locator('[data-testid="checkout"]').click();
  await page.locator('[data-testid="sim-revert"]').waitFor();
  await page.locator('[data-testid="confirm"]').click();
  await settled();
  s = await S();
  check('recoloring someone else\'s pixel reverts', s.activity[0].status === 'reverted' && s.activity[0].reason === 'Sender is not Pixel owner', `reason "${s.activity[0].reason}"`);
  await closeWallet();
  await page.locator('.anyway input').uncheck();
  await clearDraft();

  // ---- reload: persistence --------------------------------------------------
  await page.waitForTimeout(1500);
  const before = await S();
  await page.reload();
  await ready();
  await page.waitForTimeout(1500);
  s = await S();
  const after = await px(490, 524);
  check('reload keeps the wallet connected', s.connected && s.me === before.me);
  check('reload keeps your pixels and colors', s.myCount === 13 && after.colour === 0x2fc4d6 && after.owner.toLowerCase() === s.me.toLowerCase(), `myCount ${s.myCount}`);
  check('reload keeps balance and block height', s.balance === before.balance && s.chain.block >= before.chain.block, `block ${before.chain.block} -> ${s.chain.block}`);
  check('reload keeps wallet activity', s.activity.length === before.activity.length);

  // ---- reset ----------------------------------------------------------------
  await page.locator('.ticker .r button', { hasText: 'Reset demo' }).click();
  await page.waitForLoadState('load');
  await ready();
  await page.waitForTimeout(800);
  s = await S();
  const wiped = await px(490, 524);
  check('reset demo clears wallet, pixels and chain state', !s.connected && wiped.owner === null && s.activity.length === 0 && s.myCount === 0);

  const unexpected = errs.filter((e) => !/favicon/.test(e));
  check('no console errors', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('FLOW CRASHED:', e.message.split('\n').slice(0, 6).join('\n'));
  process.exit(2);
});
