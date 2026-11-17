// Captures the ORIGINAL 2020 interface for the case study's before/after.
//
// It renders the untouched EJS templates, CSS, fonts and client scripts from a
// checkout of max-hunts/gg-marketplace, and feeds them the page data produced
// by this demo's ported server (the shapes are the same, which is the point of
// the port). Firebase itself is stubbed in the page: auth reports Tom as
// signed in, and Storage resolves image paths to this demo's illustrations.
// So: real 2020 UI, 2026 seed data and pictures.
//
// Usage:  GG_REPO=/path/to/gg-marketplace npx tsx scripts/before-shots.ts
// Output: e2e/shots/gg-before-*.png at 1440x900 @2x. Needs `playwright` resolvable.
import ejs from 'ejs';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artSvg, avatarUrl } from '../src/art/products.ts';
import { ACCOUNTS, ADMIN_UID, createBackend, memoryKV } from '../src/backend/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.env.GG_REPO;
if (!repo || !existsSync(join(repo, 'functions/views/home.ejs'))) {
  console.error('Set GG_REPO to a checkout of max-hunts/gg-marketplace');
  process.exit(1);
}
const views = join(repo, 'functions/views');
const out = process.env.OUT ?? join(here, '../e2e/shots');
mkdirSync(out, { recursive: true });

const { server, store } = createBackend(memoryKV());
const TOM = ACCOUNTS.find((a) => a.label === 'Tom Whitfield')!;
const tok = server.issueToken(TOM.uid);
const adminTok = server.issueToken(ADMIN_UID);

const MIME: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

const render = (view: string, data: object) => ejs.renderFile(join(views, view), data, { root: views });

// The same routes server.js defined, answered from the ported server.
async function page(path: string, q: URLSearchParams): Promise<string | null> {
  const unwrap = <T,>(r: { ok: true; data: T } | { ok: false }) => (r.ok ? r.data : null);
  switch (path) {
    case '/':
    case '/home':
      return render('home.ejs', server.home());
    case '/search':
      return render('search.ejs', server.search(q.get('search') ?? undefined));
    case '/additmpage':
      return render('add-item.ejs', {});
    case '/product': {
      const d = unwrap(server.product(q.get('productid') ?? undefined));
      return d ? render('product.ejs', d) : render('404.ejs', {});
    }
    case '/my-products': {
      const d = unwrap(server.myProducts(q.get('uToken') ?? undefined));
      return d ? render('my-products.ejs', d) : null;
    }
    case '/my-product': {
      const d = unwrap(server.myProduct(q.get('uToken') ?? undefined, q.get('productid') ?? undefined));
      return d ? render('my-product.ejs', d) : render('404.ejs', {});
    }
    case '/admin-review': {
      const d = unwrap(server.adminReview(q.get('authToken') ?? undefined));
      return d ? render('admin-review.ejs', d) : render('404.ejs', {});
    }
    case '/user-profile': {
      const d = unwrap(server.userProfile(q.get('dbid') ?? undefined));
      return d ? render('user-profile.ejs', d) : render('404.ejs', {});
    }
    default:
      return null;
  }
}

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  try {
    if (req.method === 'POST') {
      // Only the sign-in check runs during a capture.
      res.setHeader('content-type', 'application/json');
      return void res.end(JSON.stringify({ success: true, registered: true, name: 'Tom' }));
    }
    if (url.pathname.startsWith('/__art/')) {
      const svg = artSvg(url.pathname.slice(7).replace(/\.svg$/, ''));
      res.setHeader('content-type', 'image/svg+xml');
      return void res.end(svg ?? '');
    }
    const html = await page(url.pathname, url.searchParams);
    if (html !== null) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      return void res.end(html);
    }
    // express.static('views'). The committed fAuth.js / fdb.js are empty (the
    // minified builds were never checked in), so serve their sources instead.
    let file = normalize(join(views, url.pathname));
    if (!file.startsWith(views)) throw new Error('outside views');
    if (/\/js\/(fAuth|fdb)\.js$/.test(file)) file = file.replace(/\.js$/, '.src.js');
    res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
});

// What the page sees instead of the Firebase SDK. Kept as a source string so
// it reaches the browser exactly as written (no transpiler helpers).
const firebaseStub = (user: { uid: string; email: string; token: string }, avatars: Record<string, string>) => `
(() => {
  const user = ${JSON.stringify(user)};
  const avatars = ${JSON.stringify(avatars)};
  const stem = (p) => (p.split('/').pop() || '').replace(/\\.[^.]*$/, '');
  const currentUser = { uid: user.uid, email: user.email, getIdToken: () => Promise.resolve(user.token) };
  const auth = () => ({ currentUser, onAuthStateChanged: (cb) => setTimeout(() => cb(currentUser), 0) });
  const storage = () => ({
    ref: () => ({
      child: (path) => ({
        getDownloadURL: () =>
          path.startsWith('/user-img/')
            ? Promise.resolve(avatars[path] || '')
            : path
              ? Promise.resolve('/__art/' + stem(path) + '.svg')
              : Promise.reject(new Error('no path')),
      }),
    }),
  });
  window.firebase = { initializeApp() {}, analytics() {}, auth, storage };
})();`;

const require = createRequire(import.meta.url);
// Playwright is resolved from the machine, not from this package, so it has no types here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as { chromium: { launch(): Promise<any> } };

await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
const port = (http.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;

const avatars = Object.fromEntries(
  Object.values(store.data.users).map((u) => [u.pPic, avatarUrl(`${u.fName} ${u.lName}`)]),
);
const key = (name: string) => Object.entries(store.data.products).find(([, p]) => p.name === name)![0];
const tomDbid = Object.entries(store.data.users).find(([, u]) => u.UID === TOM.uid)![0];

const browser = await chromium.launch();
async function capture(name: string, path: string, as: 'tom' | 'admin' = 'tom', fullPage = false) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  // No network beyond this server: the SDK and analytics scripts are answered empty.
  await ctx.route(/gstatic\.com|googletagmanager\.com/, (route: { fulfill(response: object): Promise<void> }) => route.fulfill({ contentType: 'text/javascript', body: '' }));
  const user = as === 'admin' ? { uid: ADMIN_UID, email: 'dev@dev.dev', token: adminTok } : { uid: TOM.uid, email: TOM.email, token: tok };
  await ctx.addInitScript(firebaseStub(user, avatars));

  const p = await ctx.newPage();
  p.on('pageerror', (e: Error) => console.log('  pageerror:', e.message));
  await p.goto(base + path);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(out, `gg-before-${name}.png`), fullPage });
  console.log('shot', name);
  await ctx.close();
}

await capture('home', '/home');
await capture('product', `/product?productid=${key('Vintage road bike')}`);
await capture('my-products', `/my-products?uToken=${tok}`);
await capture('my-product', `/my-product?uToken=${tok}&productid=${key('Vintage road bike')}`);
await capture('add-item', '/additmpage');
await capture('search', '/search?search=bike');
await capture('profile', `/user-profile?dbid=${tomDbid}`);
await capture('admin', `/admin-review?authToken=${adminTok}`, 'admin');

await browser.close();
http.close();
