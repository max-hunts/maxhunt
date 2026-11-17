// End-to-end checks against the production build, driven through the UI.
// Usage: (cd demos/gg-marketplace && npx vite preview) then  node e2e/flow.cjs
// Needs `playwright` resolvable. Set SHOTS=dir to also save a screenshot per stage.
const { chromium } = require('playwright');
const path = require('path');
const zlib = require('zlib');
const URL = process.env.URL || 'http://127.0.0.1:4341/gg-demo/';
const SHOTS = process.env.SHOTS;

// A valid 64x64 PNG (solid teal), built by hand so the check has a real photo to upload.
function png(w = 64, h = 64, rgb = [32, 150, 140]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
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
  const count = (id) => t(id).count();
  const go = async (hash) => {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(80);
  };
  let n = 0;
  const shot = async (name) => {
    if (!SHOTS) return;
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) });
  };
  const signIn = async (who) => {
    const open = (await count('account-button')) ? t('account-button') : t('signin-button');
    await open.click();
    await t(`account-${who}`).click();
  };
  const guideStep = () => page.locator('[data-testid="guide"] li.now').getAttribute('data-step');

  await page.goto(URL);
  await t('home-grid').waitFor();

  // 1. browsing, signed out
  check('home lists the 20 seeded listings on sale', (await count('product-card')) === 20);
  await shot('home');
  await t('search-input').fill('guitar');
  await t('search-input').press('Enter');
  await page.waitForTimeout(80);
  check('search finds a listing by name', (await count('product-card')) === 1 && /guitar/.test(await t('search-title').innerText()));
  await t('search-input').fill('walnut');
  await t('search-input').press('Enter');
  await page.waitForTimeout(80);
  check('search matches the description too', (await page.locator('.card-name').first().innerText()) === 'Record player');
  await t('search-input').fill('surfboard');
  await t('search-input').press('Enter');
  await page.waitForTimeout(80);
  check('a pending listing is not searchable', (await count('product-card')) === 0 && (await page.locator('main .empty').count()) === 1);
  await go('#/search');
  await t('sort').selectOption('low');
  const prices = await page.locator('.card-price').allInnerTexts();
  check('sort by price, low to high', prices[0] === '£10' && prices.at(-1) === '£180', prices.join(','));
  await go('#/search?city=Leeds');
  check('city filter narrows the results', (await count('product-card')) === 4);
  await shot('search');

  await go('#/');
  await page.locator('.card', { hasText: 'Vintage road bike' }).click();
  check('a listing page shows name, price and seller', (await t('product-name').innerText()) === 'Vintage road bike' && (await t('product-price').innerText()) === '£180' && /Tom Whitfield/.test(await t('seller-link').innerText()));
  await t('request').click();
  check('signed out, requesting asks you to sign in', /Sign in/.test(await t('toast').innerText()));
  await shot('product-signed-out');

  // 2. the guided loop: list as Tom
  check('guide starts at step 1', (await guideStep()) === '1');
  await t('guide-cta').click();
  await t('fill-example').waitFor();
  check('guide signs in as Tom and opens the sell form', (await t('account-button').innerText()).includes('Tom') && page.url().endsWith('#/sell'));
  await t('submit-listing').click();
  check('an empty form is refused with a message', /Fill in all required fields/.test(await t('api-error').innerText()));
  check('on the right page the guide says what to do instead of offering a jump', (await count('guide-cta')) === 0 && /Fill in the form/.test(await t('guide-hint').innerText()));
  await t('fill-example').click();
  await shot('sell-form');
  await t('submit-listing').click();
  await t('sell-done').waitFor();
  check('a submitted listing is confirmed as in review', /Ceramic vase/.test(await t('sell-done').innerText()) && (await guideStep()) === '2');
  await shot('sell-done');
  await t('search-input').fill('vase');
  await t('search-input').press('Enter');
  await page.waitForTimeout(80);
  check('it stays out of search until approved', (await count('product-card')) === 0);
  await go('#/selling');
  const first = t('my-listing').first();
  check('it is at the top of my listings, in review', /Ceramic vase/.test(await first.innerText()) && (await first.locator('.chip').getAttribute('data-status')) === 'pending');
  check('my listings covers every status', (await page.locator('.tabs button').count()) === 5);
  await shot('my-listings');
  await go('#/admin');
  check('the review queue is a 404 for a seller', (await page.locator('.notfound').count()) === 1);

  // 3. approve as the admin
  await t('guide-cta').click();
  await t('queue').waitFor();
  check('admin sees three listings waiting', (await count('queue-item')) === 3);
  await shot('admin-queue');
  await page.locator('[data-testid="queue-item"]', { hasText: 'Ceramic vase' }).locator('[data-testid="approve"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="queue-item"]').length === 2);
  check('approving removes it from the queue', (await guideStep()) === '3');
  await page.locator('[data-testid="queue-item"]', { hasText: 'Electric kettle' }).locator('[data-testid="reject"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="queue-item"]').length === 1);
  await go('#/search?q=kettle');
  check('a rejected listing never reaches search', (await count('product-card')) === 0);
  await go('#/search?q=vase');
  check('the approved listing is now searchable', (await count('product-card')) === 1);

  // 4. request as Maya
  await t('guide-cta').click();
  await t('request').waitFor();
  check('guide switches to Maya on the listing', (await t('account-button').innerText()).includes('Maya') && (await t('product-name').innerText()) === 'Ceramic vase');
  await t('request').click();
  check('the request box is prefilled with the 2020 message', (await t('request-message').inputValue()) === 'Hi, I would like to purchase your item');
  await t('request-message').fill('Hi Tom, is the vase still available? I can collect on Saturday.');
  await shot('request-compose');
  await t('request-send').click();
  await t('request-sent').waitFor();
  check('the request is confirmed', /Request sent to Tom/.test(await t('request-sent').innerText()) && (await guideStep()) === '4');
  check('the buyer has no mail of their own', (await count('unread')) === 0);
  await shot('request-sent');

  // 5. read the email as Tom
  await t('guide-cta').click();
  await t('mail').first().waitFor();
  check('the seller has one unread email', (await t('unread').innerText()) === '1' && (await t('account-button').innerText()).includes('Tom'));
  await t('mail').first().locator('.mail-head').click();
  const text = await t('mail-text').innerText();
  check('the email is the 2020 template with the buyer and message', text.startsWith('Hi Tom') && text.includes('Maya Collins is interested in your product Ceramic vase (ID: -') && text.includes('User email: maya.collins@example.com') && text.endsWith('I can collect on Saturday.'), text);
  await shot('inbox');
  await page.keyboard.press('Escape');
  check('reading it completes the loop', (await count('unread')) === 0 && (await count('guide-done')) === 1);

  // 6. managing a listing
  await go('#/selling');
  await page.locator('[data-testid="my-listing"]', { hasText: 'Ceramic vase' }).click();
  await t('toggle-sale').click();
  await page.waitForFunction(() => document.querySelector('.product-info .chip')?.getAttribute('data-status') === 'off-sale');
  await go('#/search?q=vase');
  check('taking it off sale hides it from search', (await count('product-card')) === 0);
  await go('#/selling');
  await page.locator('[data-testid="my-listing"]', { hasText: 'Ceramic vase' }).click();
  await t('toggle-sale').click();
  await page.waitForFunction(() => document.querySelector('.product-info .chip')?.getAttribute('data-status') === 'on-sale');
  await t('edit-link').click();
  await t('e-price').fill('14');
  await t('save-edit').click();
  await t('mark-sold').waitFor();
  check('an edit is saved', (await page.locator('.price').innerText()) === '£14');
  await shot('manage');
  await t('mark-sold').click();
  await t('confirm-sold').click();
  await page.waitForFunction(() => document.querySelector('.product-info .chip')?.getAttribute('data-status') === 'sold');
  check('sold is final: no edit, toggle or sold buttons remain', (await count('edit-link')) + (await count('toggle-sale')) + (await count('mark-sold')) === 0);
  const vaseUrl = page.url();

  await go('#/selling');
  await t('address-edit').click();
  await t('address-input').fill('12 Harbour Road, Bristol');
  await t('address-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-testid="address"]')?.textContent === '12 Harbour Road, Bristol');
  check('the shipping address can be edited', true);

  // 7. ownership
  await signIn('maya.collins');
  await page.goto(vaseUrl);
  await page.waitForTimeout(100);
  check("someone else's manage page is a 404", (await page.locator('.notfound').count()) === 1);
  await go('#/selling');
  check('a buyer with no listings sees the empty state', (await page.locator('main .empty').count()) === 1);
  await page.locator('.rows, .empty').first().waitFor();
  await go('#/');
  await page.locator('.card', { hasText: 'Acoustic guitar' }).click();
  await t('seller-link').click();
  check('the seller link opens their profile', (await t('profile-name').innerText()) === 'Callum Fraser' && (await count('product-card')) === 4);
  await t('contact').click();
  await t('contact-message').fill('Do you ever sell amps?');
  await t('contact-send').click();
  await t('contact-sent').waitFor();
  await shot('profile');
  const mails = await page.evaluate(() => window.__gg.backend.mail.inbox('callum.fraser@example.com').map((m) => m.subject + '|' + m.text));
  check('contacting a seller emails them', mails.length === 1 && mails[0].startsWith('New message!|Hi Callum') && mails[0].endsWith('Do you ever sell amps?'));

  // 8. a new account has to register first
  await signIn('you');
  await t('register-submit').waitFor();
  check('an unregistered account is sent to registration', page.url().endsWith('#/register') && (await t('account-button').innerText()).includes('Unregistered'));
  await go('#/sell');
  await page.waitForTimeout(100);
  check('and cannot reach the sell form', page.url().endsWith('#/register'));
  await t('register-submit').click();
  check('registration needs a name and address', /Fill in your name and address/.test(await t('api-error').innerText()));
  await t('r-first').fill('Sam');
  await t('r-last').fill('Reed');
  await t('r-address').fill('Cardiff');
  await shot('register');
  await t('register-submit').click();
  await t('home-grid').waitFor();
  check('after registering you land on the home page, signed in', (await t('account-button').innerText()).includes('Sam'));

  // 9. listing with an uploaded photo
  await go('#/sell');
  await t('f-name').fill('Teal print');
  await t('f-desc').fill('A very teal print.');
  await t('f-price').fill('7');
  check('location defaults to your own', (await t('f-location').inputValue()) === 'Cardiff');
  await t('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  check('a non-image is refused with the 2020 message', /Accepted formats: jpeg\/jpg, png, gif/.test(await t('api-error').innerText()));
  await t('file-input').setInputFiles({ name: 'teal.png', mimeType: 'image/png', buffer: png() });
  await page.locator('.dropzone.has img').waitFor();
  await t('submit-listing').click();
  await t('sell-done').waitFor();
  const uploaded = await page.evaluate(() => {
    const { backend } = window.__gg;
    const [key, p] = Object.entries(backend.store.data.products).find(([, x]) => x.name === 'Teal print');
    return { path: p.img, expect: `/product-img/${key}/teal.png`, url: (backend.uploads.get(p.img) || '').slice(0, 23), owner: p.owner, status: p.status };
  });
  check('the photo is stored at the path the server returned', uploaded.path === uploaded.expect && uploaded.url === 'data:image/jpeg;base64,' && uploaded.status === 'pending', JSON.stringify(uploaded));

  // 10. persistence and reset
  await page.reload();
  await t('account-button').waitFor();
  const after = await page.evaluate(() => {
    const { backend, session } = window.__gg;
    const ps = Object.values(backend.store.data.products);
    return { n: ps.length, vase: ps.find((p) => p.name === 'Ceramic vase')?.status, mail: backend.mail.all().length, uid: !!session.uid, pic: !!backend.uploads.get(ps.find((p) => p.name === 'Teal print').img) };
  });
  check('a reload keeps listings, mail, uploads and the session', after.n === 27 && after.vase === 'sold' && after.mail === 2 && after.uid && after.pic, JSON.stringify(after));
  await t('reset').click();
  await t('home-grid').waitFor();
  const reset = await page.evaluate(() => {
    const { backend, session } = window.__gg;
    return { n: Object.keys(backend.store.data.products).length, mail: backend.mail.all().length, uid: session.uid, keys: Object.keys(localStorage).filter((k) => k.startsWith('gg-demo:')) };
  });
  check('reset returns to the seed and signs you out', reset.n === 25 && reset.mail === 0 && reset.uid === null && (await count('signin-button')) === 1, JSON.stringify(reset));
  check('guide is back at step 1', (await guideStep()) === '1');

  await go('#/nope/nope');
  check('unknown routes show the 404 page', (await page.locator('.notfound').count()) === 1);
  check('no console errors', errs.length === 0, errs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
