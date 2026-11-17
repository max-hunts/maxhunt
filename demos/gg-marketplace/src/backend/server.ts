import type { Store } from './db.ts';
import type { Mailer } from './mail.ts';
import { ADMIN_UID } from './seed.ts';
import type { Account, ApiResult, PageResult, Product, Products, User } from './types.ts';

// A port of the 2020 Express server (server.js in max-hunts/gg-marketplace).
// Same routes, same request and response shapes, same error strings; the
// Firebase Admin calls are replaced by a local store and nodemailer by an
// outbox the page can read.
//
// Three deliberate differences, all places where the original trusted the
// browser more than it should have:
//   1. new-product-api took `owner` from the request body. Here it comes from
//      the verified token.
//   2. update-product-api wrote whatever fields the client sent, so a seller
//      could set `status: "on-sale"` and skip review. Here only the five
//      editable fields are written.
//   3. A bad token made authCheck throw (it read `.uid` of undefined) and the
//      request hung. Here it answers "invalid auth token".

const ok = <T extends object>(extra?: T): ApiResult<T> =>
  ({ success: true, error: null, ...(extra as T) }) as ApiResult<T>;
const fail = (error: string): ApiResult<never> => ({ success: false, error });

const EDITABLE = ['name', 'desc', 'location', 'stock', 'price'] as const;
export type ProductEdit = Partial<Pick<Product, (typeof EDITABLE)[number]>>;

export interface ProductDraft {
  name: string;
  desc: string;
  location: string;
  stock?: string | number;
  price: string | number;
}

export interface Profile {
  name: string;
  location: string;
  rating: string;
  memberSince: string;
  pPic: string;
}

export class Server {
  constructor(
    private store: Store,
    private mail: Mailer,
    private accounts: Account[],
    private now: () => number = Date.now,
  ) {}

  // ---- auth -------------------------------------------------------------

  /** What Firebase Auth's getIdToken() returned, minus the cryptography. */
  issueToken(uid: string): string {
    return `demo.${uid}`;
  }

  /** admin.auth().verifyIdToken(): the uid and email, or null. */
  private verify(token: unknown): { uid: string; email: string } | null {
    if (typeof token !== 'string' || !token.startsWith('demo.')) return null;
    const uid = token.slice(5);
    const acct = this.accounts.find((a) => a.uid === uid);
    return acct ? { uid, email: acct.email } : null;
  }

  private users(): Record<string, User> {
    return this.store.data.users;
  }
  private products(): Products {
    return this.store.data.products;
  }

  /** usersRef.orderByChild("UID").equalTo(uid) */
  private userByUid(uid: string): { key: string; user: User } | null {
    for (const [key, user] of Object.entries(this.users())) if (user.UID === uid) return { key, user };
    return null;
  }

  private where(pred: (p: Product) => boolean): Products {
    const out: Products = {};
    for (const key of Object.keys(this.products()).sort()) {
      const p = this.products()[key]!;
      if (pred(p)) out[key] = p;
    }
    return out;
  }

  private verifyOwner(uid: string, pid: string): boolean {
    const item = this.products()[pid];
    return !!item && (item.owner === uid || uid === ADMIN_UID);
  }

  // ---- pages (the GET routes that rendered EJS templates) ----------------

  /** GET / and /home: the last 25 listings on sale. */
  home(): { products: Products } {
    const onSale = this.where((p) => p.status === 'on-sale');
    const keys = Object.keys(onSale).slice(-25);
    return { products: Object.fromEntries(keys.map((k) => [k, onSale[k]!])) };
  }

  /** GET /search?search=: substring match on name and description. */
  search(query?: string): { products: Products } {
    const q = (query ?? '').toLowerCase();
    if (!q) return { products: this.where((p) => p.status === 'on-sale') };
    return {
      products: this.where(
        (p) => p.status === 'on-sale' && (p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)),
      ),
    };
  }

  /** GET /admin-review?authToken= */
  adminReview(authToken?: string): PageResult<{ products: Products }> {
    const who = this.verify(authToken);
    if (!who || who.uid !== ADMIN_UID) return { ok: false, status: 404 };
    return { ok: true, data: { products: this.where((p) => p.status === 'pending') } };
  }

  /** GET /my-products?uToken=: your listings, or every listing for the admin. */
  myProducts(uToken?: string): PageResult<{ products: Products; dbid?: string }> {
    if (!uToken) return { ok: false, status: 401, message: 'No Auth Token Provided' };
    const who = this.verify(uToken);
    if (!who) return { ok: false, status: 401, message: 'Bad Auth Token' };
    if (who.uid === ADMIN_UID) return { ok: true, data: { products: this.where(() => true) } };
    const me = this.userByUid(who.uid);
    if (!me) return { ok: false, status: 401, message: 'Bad Auth Token' };
    return { ok: true, data: { products: this.where((p) => p.owner === who.uid), dbid: me.key } };
  }

  /** GET /my-product and /edit-item (?uToken=&productid=) */
  myProduct(uToken?: string, productid?: string): PageResult<{ item: Product; key: string }> {
    if (!uToken || !productid) return { ok: false, status: 401, message: 'No Auth Token Provided' };
    const who = this.verify(uToken);
    if (!who) return { ok: false, status: 401, message: 'Bad Auth Token' };
    const item = this.products()[productid];
    if (!item || !this.verifyOwner(who.uid, productid)) return { ok: false, status: 404 };
    return { ok: true, data: { item, key: productid } };
  }

  /** GET /product?productid=: any listing by id, whatever its status. */
  product(productid?: string): PageResult<{ item: Product; key: string; seller: { name: string; dbid: string } }> {
    const item = productid ? this.products()[productid] : undefined;
    if (!item || !productid) return { ok: false, status: 404 };
    const seller = this.userByUid(item.owner);
    return {
      ok: true,
      data: {
        item,
        key: productid,
        seller: seller
          ? { name: `${seller.user.fName} ${seller.user.lName}`, dbid: seller.key }
          : { name: 'John Doe (error)', dbid: '' },
      },
    };
  }

  /** GET /user-profile?dbid= */
  userProfile(dbid?: string): PageResult<{ userProducts: Products; user: Profile; userDBID: string }> {
    const user = dbid ? this.users()[dbid] : undefined;
    if (!user || !dbid) return { ok: false, status: 404 };
    return {
      ok: true,
      data: {
        userProducts: this.where((p) => p.owner === user.UID && p.status === 'on-sale'),
        user: {
          name: `${user.fName} ${user.lName}`,
          location: user.address,
          rating: 'WIP',
          memberSince: user.memberSince,
          pPic: user.pPic,
        },
        userDBID: dbid,
      },
    };
  }

  // ---- JSON API (the POST routes) ----------------------------------------

  loginUser(body: { uToken?: string }): ApiResult<{ registered: boolean; name?: string }> {
    if (!body.uToken) return fail('invalid data');
    const who = this.verify(body.uToken);
    if (!who) return fail('invalid auth token, bad token');
    const me = this.userByUid(who.uid);
    return me ? ok({ registered: true, name: me.user.fName }) : ok({ registered: false });
  }

  registerNewUser(body: {
    authToken?: string;
    data?: { fName?: string; lName?: string; address?: string; pPic?: string };
  }): ApiResult<{ imgRef: string }> {
    const d = body.data;
    if (!body.authToken || !d?.fName || !d.lName || !d.address || !d.pPic) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    if (this.userByUid(who.uid)) return fail('user exists');
    const today = new Date(this.now());
    const key = this.store.newKey();
    const imgRef = `/user-img/${key}/${d.pPic}`;
    this.users()[key] = {
      fName: d.fName,
      lName: d.lName,
      UID: who.uid,
      email: who.email,
      address: d.address,
      pPic: imgRef,
      memberSince: `${today.toLocaleString('en-GB', { month: 'long' })} ${today.getFullYear()}`,
    };
    this.store.commit();
    return ok({ imgRef });
  }

  newProduct(body: {
    authToken?: string;
    product?: ProductDraft;
    image?: { name?: string };
  }): ApiResult<{ imgRef: string }> {
    if (!body.authToken || !body.product || !body.image?.name) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    if (!this.userByUid(who.uid)) return fail('Unregistered!');
    const p = body.product;
    const key = this.store.newKey();
    const imgRef = `/product-img/${key}/${body.image.name}`;
    this.products()[key] = {
      id: 999,
      name: String(p.name ?? ''),
      desc: String(p.desc ?? ''),
      img: imgRef,
      location: String(p.location ?? ''),
      stock: p.stock ? String(p.stock) : 1,
      status: 'pending',
      price: String(p.price ?? ''),
      owner: who.uid,
      holder: who.uid,
    };
    this.store.commit();
    return ok({ imgRef });
  }

  updateProduct(body: { authToken?: string; product?: ProductEdit; productID?: string }): ApiResult {
    if (!body.authToken || !body.product || !body.productID) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const item = this.products()[body.productID];
    if (!item) return fail('Item does not exist');
    if (!this.verifyOwner(who.uid, body.productID)) return fail('You do not own this item');
    for (const field of EDITABLE) {
      const value = body.product[field];
      if (value !== undefined) item[field] = String(value);
    }
    this.store.commit();
    return ok();
  }

  toggleSale(body: { prodID?: string; authToken?: string; targetState?: boolean | null }): ApiResult {
    if (!body.prodID || !body.authToken || body.targetState == null) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const item = this.products()[body.prodID];
    if (!item) return fail('Item does not exist');
    const toggleable = item.status === 'on-sale' || item.status === 'off-sale';
    if (!this.verifyOwner(who.uid, body.prodID) || !toggleable) return fail('Unauthorized');
    item.status = body.targetState === true ? 'on-sale' : 'off-sale';
    this.store.commit();
    return ok();
  }

  sold(body: { prodID?: string; authToken?: string }): ApiResult {
    if (!body.prodID || !body.authToken) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const item = this.products()[body.prodID];
    if (!item) return fail('Item does not exist');
    if (!this.verifyOwner(who.uid, body.prodID)) return fail('Unauthorized');
    item.status = 'sold';
    this.store.commit();
    return ok();
  }

  /** Approve or reject a pending listing. Admin only. */
  productAR(body: { authToken?: string; prodID?: string; approved?: boolean | null }): ApiResult {
    if (!body.authToken || !body.prodID || body.approved == null) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who || who.uid !== ADMIN_UID) return fail('Unauthorized');
    const item = this.products()[body.prodID];
    if (!item) return fail('Item does not exist');
    item.status = body.approved === true ? 'on-sale' : 'rejected';
    this.store.commit();
    return ok();
  }

  shippingAddressGet(body: { authToken?: string }): ApiResult<{ address: string }> {
    if (!body.authToken) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const me = this.userByUid(who.uid);
    if (!me) return fail('user does not exist');
    return ok({ address: me.user.address });
  }

  shippingAddressEdit(body: { authToken?: string; address?: string }): ApiResult {
    if (!body.authToken || !body.address) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const me = this.userByUid(who.uid);
    if (!me) return fail('user does not exist');
    me.user.address = body.address;
    this.store.commit();
    return ok();
  }

  /** "Request!" on a listing: emails the seller with the buyer's message. */
  request(body: { prodID?: string; authToken?: string; usrMsg?: string }): ApiResult {
    if (!body.prodID || !body.authToken || !body.usrMsg) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const product = this.products()[body.prodID];
    if (!product) return fail('Item does not exist');
    const seller = this.userByUid(product.owner);
    if (!seller)
      return fail("Something very bad has happened..... Item owner apparantly doesn't exist in the database");
    const buyer = this.userByUid(who.uid);
    if (!buyer) return fail('Unregistered user!');
    const buyerName = `${buyer.user.fName} ${buyer.user.lName}`;
    this.mail.send(
      seller.user.email,
      "Someone's interested!",
      `Hi ${seller.user.fName}\n \n${buyerName} is interested in your product ${product.name} (ID: ${body.prodID})\n\nUser email: ${buyer.user.email}\n\nUser message:\n${body.usrMsg}`,
    );
    return ok();
  }

  /** "Contact" on a profile: emails that user. */
  contact(body: { userDBID?: string; authToken?: string; usrMsg?: string }): ApiResult {
    if (!body.userDBID || !body.authToken || !body.usrMsg) return fail('invalid data');
    const who = this.verify(body.authToken);
    if (!who) return fail('invalid auth token');
    const sender = this.userByUid(who.uid);
    if (!sender) return fail('Unregistered user!');
    const seller = this.users()[body.userDBID];
    if (!seller) return fail('User does not exist!');
    this.mail.send(
      seller.email,
      'New message!',
      `Hi ${seller.fName}\n \n${sender.user.fName} ${sender.user.lName} would like to send you a message.\n\nUser email: ${sender.user.email}\n\nMessage:\n${body.usrMsg}`,
    );
    return ok();
  }
}
