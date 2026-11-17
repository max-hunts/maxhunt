// Captures the case-study screenshots from the production build at 1440x900 @2x.
// Usage: (cd demos/gg-marketplace && npx vite preview) then  node e2e/shots.cjs
// Output: e2e/shots/gg-*.png (copy into src/assets/images/). Needs `playwright` resolvable.
// The "before" shots of the 2020 interface come from scripts/before-shots.ts.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.env.URL || 'http://127.0.0.1:4341/gg-demo/';
const OUT = process.env.OUT || path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const t = (id) => page.locator(`[data-testid="${id}"]`);
  const go = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(150);
  };
  const shot = async (name, keepToast = false) => {
    if (!keepToast) await page.evaluate(() => window.__gg.ui.set({ toast: null }));
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.mouse.move(0, 0);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, `gg-${name}.png`) });
    console.log('shot', name);
  };

  await page.goto(URL);
  await t('home-grid').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await shot('home');

  // list as Tom
  await t('guide-cta').click();
  await t('fill-example').click();
  await shot('sell');
  await t('submit-listing').click();
  await t('sell-done').waitFor();

  // review as the admin
  await t('guide-cta').click();
  await t('queue').waitFor();
  await shot('admin');
  await page.locator('[data-testid="queue-item"]', { hasText: 'Ceramic vase' }).locator('[data-testid="approve"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="queue-item"]').length === 2);

  // request as Maya
  await t('guide-cta').click();
  await t('request').click();
  await t('request-message').fill('Hi Tom, is the vase still available? I can collect on Saturday.');
  await shot('request');
  await t('request-send').click();
  await t('request-sent').waitFor();

  // read the email as Tom
  await t('guide-cta').click();
  await t('mail').first().locator('.mail-head').click();
  await shot('inbox');
  await page.keyboard.press('Escape');

  await go('#/selling');
  await shot('listings');
  await page.locator('[data-testid="my-listing"]', { hasText: 'Vintage road bike' }).click();
  await t('mark-sold').waitFor();
  await shot('manage');

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
