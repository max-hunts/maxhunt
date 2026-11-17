import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACCOUNTS, ADMIN_UID, VISITOR_UID, createBackend, memoryKV, type Backend } from '../src/backend/index.ts';
import { pushId } from '../src/backend/db.ts';

const TOM = ACCOUNTS.find((a) => a.label === 'Tom Whitfield')!.uid;
const MAYA = ACCOUNTS.find((a) => a.label === 'Maya Collins')!.uid;

function boot(kv = memoryKV()) {
  let t = Date.UTC(2026, 10, 17, 12, 0);
  const b = createBackend(kv, () => (t += 1000));
  const tok = (uid: string) => b.server.issueToken(uid);
  return { b, s: b.server, tok, kv };
}

const draft = { name: 'Chess set', desc: 'Wooden, all pieces present.', location: 'Bristol', price: '14' };
const firstKey = (b: Backend, status: string, owner?: string) =>
  Object.entries(b.store.data.products).find(([, p]) => p.status === status && (!owner || p.owner === owner))![0];

test('seed: a full marketplace with listings in every state', () => {
  const { b, s } = boot();
  const all = Object.values(b.store.data.products);
  for (const status of ['pending', 'on-sale', 'off-sale', 'sold', 'rejected'])
    assert.ok(all.some((p) => p.status === status), status);
  assert.equal(Object.keys(s.home().products).length, 20);
  assert.ok(Object.values(s.home().products).every((p) => p.status === 'on-sale'));
  // every listing has a seller record
  for (const key of Object.keys(b.store.data.products)) {
    const page = s.product(key);
    assert.ok(page.ok && page.data.seller.dbid);
  }
});

test('push ids sort by creation time, and new listings sort after the seed', () => {
  assert.ok(pushId(1000) < pushId(2000));
  const { b, s, tok } = boot();
  const r = s.newProduct({ authToken: tok(TOM), product: draft, image: { name: 'chess.jpg' } });
  assert.ok(r.success);
  const keys = Object.keys(b.store.data.products).sort();
  assert.equal(b.store.data.products[keys.at(-1)!]!.name, 'Chess set');
});

test('home shows at most the last 25 on sale', () => {
  const { b, s, tok } = boot();
  for (let i = 0; i < 8; i++) {
    const r = s.newProduct({ authToken: tok(TOM), product: { ...draft, name: `Thing ${i}` }, image: { name: 'x.png' } });
    assert.ok(r.success);
  }
  for (const [key, p] of Object.entries(b.store.data.products))
    if (p.status === 'pending') s.productAR({ authToken: tok(ADMIN_UID), prodID: key, approved: true });
  const keys = Object.keys(s.home().products);
  assert.equal(keys.length, 25);
  assert.equal(s.home().products[keys.at(-1)!]!.name, 'Thing 7');
});

test('search matches name and description of listings on sale only', () => {
  const { s } = boot();
  const names = (q?: string) => Object.values(s.search(q).products).map((p) => p.name);
  assert.deepEqual(names('GUITAR'), ['Acoustic guitar']);
  assert.ok(names('walnut').includes('Record player')); // description match
  assert.deepEqual(names('surfboard'), []); // pending
  assert.deepEqual(names('helmet'), []); // sold
  assert.equal(names().length, 20);
  assert.deepEqual(names('zzzz'), []);
});

test('a new listing is pending, owned by the token holder, and hidden until approved', () => {
  const { b, s, tok } = boot();
  const r = s.newProduct({
    authToken: tok(TOM),
    // the 2020 client sent owner and status itself; the port ignores both
    product: { ...draft, owner: MAYA, status: 'on-sale' } as never,
    image: { name: 'chess.jpg' },
  });
  assert.ok(r.success);
  const key = r.imgRef.split('/')[2]!;
  assert.equal(r.imgRef, `/product-img/${key}/chess.jpg`);
  const p = b.store.data.products[key]!;
  assert.equal(p.status, 'pending');
  assert.equal(p.owner, TOM);
  assert.equal(p.stock, 1);
  assert.deepEqual(Object.values(s.search('chess').products), []);

  const queue = s.adminReview(tok(ADMIN_UID));
  assert.ok(queue.ok && key in queue.data.products);
  assert.deepEqual(s.productAR({ authToken: tok(TOM), prodID: key, approved: true }), { success: false, error: 'Unauthorized' });
  assert.ok(s.productAR({ authToken: tok(ADMIN_UID), prodID: key, approved: true }).success);
  assert.equal(Object.values(s.search('chess').products).length, 1);
});

test('rejecting keeps a listing out of search and out of the queue', () => {
  const { b, s, tok } = boot();
  const key = firstKey(b, 'pending');
  assert.ok(s.productAR({ authToken: tok(ADMIN_UID), prodID: key, approved: false }).success);
  assert.equal(b.store.data.products[key]!.status, 'rejected');
  const queue = s.adminReview(tok(ADMIN_UID));
  assert.ok(queue.ok && !(key in queue.data.products));
});

test('admin review is a 404 for everyone else', () => {
  const { s, tok } = boot();
  assert.deepEqual(s.adminReview(tok(TOM)), { ok: false, status: 404 });
  assert.deepEqual(s.adminReview(undefined), { ok: false, status: 404 });
  assert.deepEqual(s.adminReview('garbage'), { ok: false, status: 404 });
});

test('unregistered accounts cannot list, request or contact', () => {
  const { b, s, tok } = boot();
  assert.deepEqual(s.loginUser({ uToken: tok(VISITOR_UID) }), { success: true, error: null, registered: false });
  assert.deepEqual(s.newProduct({ authToken: tok(VISITOR_UID), product: draft, image: { name: 'a.png' } }), {
    success: false,
    error: 'Unregistered!',
  });
  const key = firstKey(b, 'on-sale');
  assert.deepEqual(s.request({ prodID: key, authToken: tok(VISITOR_UID), usrMsg: 'hi' }), {
    success: false,
    error: 'Unregistered user!',
  });
});

test('registration creates the user record once', () => {
  const { b, s, tok } = boot();
  const data = { fName: 'Sam', lName: 'Reed', address: 'Cardiff', pPic: 'me.jpg' };
  assert.deepEqual(s.registerNewUser({ authToken: tok(VISITOR_UID), data: { ...data, address: '' } }), {
    success: false,
    error: 'invalid data',
  });
  const r = s.registerNewUser({ authToken: tok(VISITOR_UID), data });
  assert.ok(r.success);
  const key = r.imgRef.split('/')[2]!;
  const u = b.store.data.users[key]!;
  assert.equal(u.UID, VISITOR_UID);
  assert.equal(u.email, 'you@example.com');
  assert.equal(u.memberSince, 'November 2026');
  assert.deepEqual(s.loginUser({ uToken: tok(VISITOR_UID) }), { success: true, error: null, registered: true, name: 'Sam' });
  assert.deepEqual(s.registerNewUser({ authToken: tok(VISITOR_UID), data }), { success: false, error: 'user exists' });
});

test('only the owner (or the admin) can manage a listing', () => {
  const { b, s, tok } = boot();
  const key = firstKey(b, 'on-sale', TOM);
  assert.deepEqual(s.myProduct(tok(MAYA), key), { ok: false, status: 404 });
  assert.ok(s.myProduct(tok(TOM), key).ok);
  assert.ok(s.myProduct(tok(ADMIN_UID), key).ok);
  assert.deepEqual(s.toggleSale({ prodID: key, authToken: tok(MAYA), targetState: false }), {
    success: false,
    error: 'Unauthorized',
  });
  assert.deepEqual(s.sold({ prodID: key, authToken: tok(MAYA) }), { success: false, error: 'Unauthorized' });
  assert.deepEqual(s.updateProduct({ authToken: tok(MAYA), product: { price: '1' }, productID: key }), {
    success: false,
    error: 'You do not own this item',
  });
});

test('the sale lifecycle: off sale, back on, sold, then frozen', () => {
  const { b, s, tok } = boot();
  const key = firstKey(b, 'on-sale', TOM);
  const status = () => b.store.data.products[key]!.status;
  assert.ok(s.toggleSale({ prodID: key, authToken: tok(TOM), targetState: false }).success);
  assert.equal(status(), 'off-sale');
  assert.ok(s.toggleSale({ prodID: key, authToken: tok(TOM), targetState: true }).success);
  assert.equal(status(), 'on-sale');
  assert.ok(s.sold({ prodID: key, authToken: tok(TOM) }).success);
  assert.equal(status(), 'sold');
  // a sold listing cannot be put back on sale
  assert.deepEqual(s.toggleSale({ prodID: key, authToken: tok(TOM), targetState: true }), {
    success: false,
    error: 'Unauthorized',
  });
  // nor can a pending one skip review
  const pending = firstKey(b, 'pending', TOM);
  assert.deepEqual(s.toggleSale({ prodID: pending, authToken: tok(TOM), targetState: true }), {
    success: false,
    error: 'Unauthorized',
  });
});

test('update writes the five editable fields and nothing else', () => {
  const { b, s, tok } = boot();
  const key = firstKey(b, 'pending', TOM);
  const r = s.updateProduct({
    authToken: tok(TOM),
    productID: key,
    product: { name: 'Surfboard, 7 ft 2', price: 99, status: 'on-sale', owner: MAYA } as never,
  });
  assert.ok(r.success);
  const p = b.store.data.products[key]!;
  assert.equal(p.name, 'Surfboard, 7 ft 2');
  assert.equal(p.price, '99');
  assert.equal(p.status, 'pending');
  assert.equal(p.owner, TOM);
  assert.deepEqual(s.updateProduct({ authToken: tok(TOM), productID: 'nope', product: {} }), {
    success: false,
    error: 'Item does not exist',
  });
});

test('a request emails the seller with the buyer and the message', () => {
  const { b, s, tok } = boot();
  const key = firstKey(b, 'on-sale', TOM);
  const item = b.store.data.products[key]!;
  assert.ok(s.request({ prodID: key, authToken: tok(MAYA), usrMsg: 'Hi, I would like to purchase your item' }).success);
  const [mail] = b.mail.inbox('tom.whitfield@example.com');
  assert.ok(mail);
  assert.equal(mail.from, 'Project GG');
  assert.equal(mail.subject, "Someone's interested!");
  assert.equal(
    mail.text,
    `Hi Tom\n \nMaya Collins is interested in your product ${item.name} (ID: ${key})\n\nUser email: maya.collins@example.com\n\nUser message:\nHi, I would like to purchase your item`,
  );
  assert.equal(b.mail.inbox('maya.collins@example.com').length, 0);
  // requesting changes nothing about the listing (2020 behavior: stock is never decremented)
  assert.equal(b.store.data.products[key]!.stock, item.stock);
  assert.deepEqual(s.request({ prodID: 'nope', authToken: tok(MAYA), usrMsg: 'x' }), {
    success: false,
    error: 'Item does not exist',
  });
  assert.deepEqual(s.request({ prodID: key, authToken: tok(MAYA) }), { success: false, error: 'invalid data' });
});

test('contact emails a user from their profile', () => {
  const { b, s, tok } = boot();
  const dbid = Object.entries(b.store.data.users).find(([, u]) => u.UID === TOM)![0];
  assert.ok(s.contact({ userDBID: dbid, authToken: tok(MAYA), usrMsg: 'Is the bike still there?' }).success);
  const [mail] = b.mail.inbox('tom.whitfield@example.com');
  assert.equal(mail!.subject, 'New message!');
  assert.match(mail!.text, /Maya Collins would like to send you a message\./);
  assert.deepEqual(s.contact({ userDBID: 'nope', authToken: tok(MAYA), usrMsg: 'x' }), {
    success: false,
    error: 'User does not exist!',
  });
});

test('profiles list only what is on sale; my-products lists everything', () => {
  const { b, s, tok } = boot();
  const dbid = Object.entries(b.store.data.users).find(([, u]) => u.UID === TOM)![0];
  const profile = s.userProfile(dbid);
  assert.ok(profile.ok);
  assert.equal(profile.data.user.name, 'Tom Whitfield');
  assert.ok(Object.values(profile.data.userProducts).every((p) => p.status === 'on-sale'));
  const mine = s.myProducts(tok(TOM));
  assert.ok(mine.ok);
  assert.equal(mine.data.dbid, dbid);
  const statuses = new Set(Object.values(mine.data.products).map((p) => p.status));
  assert.deepEqual([...statuses].sort(), ['off-sale', 'on-sale', 'pending', 'sold']);
  // the admin sees every listing
  const all = s.myProducts(tok(ADMIN_UID));
  assert.ok(all.ok);
  assert.equal(Object.keys(all.data.products).length, Object.keys(b.store.data.products).length);
  assert.deepEqual(s.myProducts(undefined), { ok: false, status: 401, message: 'No Auth Token Provided' });
  assert.deepEqual(s.myProducts('nope'), { ok: false, status: 401, message: 'Bad Auth Token' });
  assert.deepEqual(s.userProfile('nope'), { ok: false, status: 404 });
});

test('shipping address round trip', () => {
  const { s, tok } = boot();
  assert.deepEqual(s.shippingAddressGet({ authToken: tok(MAYA) }), { success: true, error: null, address: 'London' });
  assert.ok(s.shippingAddressEdit({ authToken: tok(MAYA), address: '4 Canal Street, London' }).success);
  assert.deepEqual(s.shippingAddressGet({ authToken: tok(MAYA) }), {
    success: true,
    error: null,
    address: '4 Canal Street, London',
  });
  assert.deepEqual(s.shippingAddressGet({ authToken: tok(VISITOR_UID) }), { success: false, error: 'user does not exist' });
});

test('bad tokens are refused, not crashed on', () => {
  const { b, s } = boot();
  const key = firstKey(b, 'on-sale');
  assert.deepEqual(s.sold({ prodID: key, authToken: 'demo.nobody' }), { success: false, error: 'invalid auth token' });
  assert.deepEqual(s.request({ prodID: key, authToken: 'x', usrMsg: 'hi' }), { success: false, error: 'invalid auth token' });
});

test('state survives a reload, and reset returns to the seed', () => {
  const { b, s, tok, kv } = boot();
  const key = firstKey(b, 'on-sale', TOM);
  s.sold({ prodID: key, authToken: tok(TOM) });
  s.request({ prodID: key, authToken: tok(MAYA), usrMsg: 'hello' });
  b.uploads.put('/product-img/x/y.jpg', 'data:image/jpeg;base64,AAAA');

  const again = boot(kv).b;
  assert.equal(again.store.data.products[key]!.status, 'sold');
  assert.equal(again.mail.inbox('tom.whitfield@example.com').length, 1);
  assert.equal(again.uploads.get('/product-img/x/y.jpg'), 'data:image/jpeg;base64,AAAA');

  again.reset();
  assert.equal(again.store.data.products[key]!.status, 'on-sale');
  assert.equal(again.mail.all().length, 0);
  assert.equal(again.uploads.get('/product-img/x/y.jpg'), null);
  assert.equal(boot(kv).b.store.data.products[key]!.status, 'on-sale');
});

test('saved state from an older seed is ignored', () => {
  const kv = memoryKV();
  kv.set('gg-demo:v1:db', JSON.stringify({ seed: 'old', data: { users: {}, products: {} } }));
  const { b } = boot(kv);
  assert.ok(Object.keys(b.store.data.products).length > 20);
});
