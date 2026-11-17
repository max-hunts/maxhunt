// The record shapes are the ones the 2020 app kept in Firebase Realtime
// Database, field for field (including `price` and `stock` as strings and the
// unused `id` / `holder`).

export type ProductStatus = 'pending' | 'on-sale' | 'off-sale' | 'sold' | 'rejected';

export interface Product {
  id: number;
  name: string;
  desc: string;
  /** Storage path, e.g. /product-img/<key>/<filename>. */
  img: string;
  location: string;
  stock: string | number;
  status: ProductStatus;
  price: string | number;
  /** Auth uid of the seller. */
  owner: string;
  holder: string;
}

export interface User {
  fName: string;
  lName: string;
  /** Auth uid. The database key of the record is a separate push id. */
  UID: string;
  email: string;
  address: string;
  /** Storage path, e.g. /user-img/<key>/<filename>. */
  pPic: string;
  /** "May 2020" */
  memberSince: string;
}

export interface Mail {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  at: number;
}

/** A sign-in the demo offers in place of Firebase Auth. */
export interface Account {
  uid: string;
  email: string;
  /** Shown in the account picker before the visitor is registered. */
  label: string;
  blurb: string;
}

export type Products = Record<string, Product>;

export interface Database {
  users: Record<string, User>;
  products: Products;
}

/** Minimal key/value persistence so the backend runs in Node tests too. */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

// Every JSON endpoint of the 2020 server answered with this envelope.
export type ApiOk<T = object> = { success: true; error: null } & T;
export type ApiErr = { success: false; error: string };
export type ApiResult<T = object> = ApiOk<T> | ApiErr;

// The page routes rendered an EJS template, a 404 page, or a bare error line.
export type PageResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 }
  | { ok: false; status: 401; message: string };
