// Phone-size checks (390x844) against the production build.
// Usage: (cd demos/gg-marketplace && npx vite preview) then  node e2e/mobile-flow.cjs
// Needs `playwright` resolvable. Set SHOTS=dir to also save screenshots.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.env.URL || 'http://127.0.0.1:4341/gg-demo/';
const SHOTS = process.env.SHOTS;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  let pass = 0;
  let fail = 0;
  const check = (name, ok, extra = '') => {
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !extra ? '' : '  -> ' + extra}`);
  };
  const t = (id) => page.locator(`[data-testid="${id}"]`);
  const go = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(100);
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  let n = 0;
  const shot = async (name) => {
    if (!SHOTS) return;
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `m${String(++n).padStart(2, '0')}-${name}.png`) });
  };

  await page.goto(URL);
  await t('home-grid').waitFor();
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length);
  check('home grid is two columns with no sideways scroll', cols === 2 && (await overflow()) === 0, `cols ${cols} overflow ${await overflow()}`);
  const bar = await t('guide').boundingBox();
  check('the guide bar is docked to the bottom edge', Math.round(bar.y + bar.height) === 844 && bar.height <= 72, JSON.stringify(bar));
  await shot('home');

  await t('signin-button').click();
  const menu = await page.locator('.menu').boundingBox();
  check('the account menu fits the screen', menu.x >= 0 && menu.x + menu.width <= 390, JSON.stringify(menu));
  await shot('menu');
  await t('account-tom.whitfield').click();
  await go('#/sell');
  await t('fill-example').click();
  check('the sell form stacks without overflow', (await overflow()) === 0);
  await shot('sell');
  await t('submit-listing').scrollIntoViewIfNeeded();
  await t('submit-listing').click();
  await t('sell-done').waitFor();
  check('a listing can be submitted from a phone', true);

  await t('guide-cta').click();
  await t('queue').waitFor();
  await shot('admin');
  await page.locator('[data-testid="queue-item"]', { hasText: 'Ceramic vase' }).locator('[data-testid="approve"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="queue-item"]').length === 2);
  await t('guide-cta').click();
  await t('request').waitFor();
  check('the listing page has no sideways scroll', (await overflow()) === 0);
  await t('request').click();
  await t('request-send').click();
  await t('request-sent').waitFor();
  await shot('request-sent');
  await t('guide-cta').click();
  await t('mail').first().waitFor();
  const drawer = await t('inbox').boundingBox();
  check('the inbox covers the phone screen', drawer.width === 390 && drawer.x === 0, JSON.stringify(drawer));
  await t('mail').first().locator('.mail-head').click();
  await shot('inbox');
  await page.locator('[aria-label="Close inbox"]').click();
  check('the loop completes on a phone', (await t('guide-done').count()) === 1);

  await go('#/selling');
  check('my listings fits', (await overflow()) === 0);
  await shot('selling');
  await go('#/search');
  check('search fits', (await overflow()) === 0);
  check('no console errors', errs.length === 0, errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
