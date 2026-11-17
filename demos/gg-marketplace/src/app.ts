import { useSyncExternalStore } from 'react';
import { artUrl, avatarUrl, placeholderUrl } from './art/products.ts';
import { ACCOUNTS, ADMIN_UID, NS, createBackend, type Account, type KV, type Product, type User } from './backend/index.ts';

// The page-side singletons: the in-browser backend, who is signed in, and a
// little UI state. Reads are synchronous calls into the ported server (it is
// all local); writes go through `call`, which adds a short delay so the
// "Sending..." states of a real network round trip are still visible.

const kv: KV = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    localStorage.setItem(key, value);
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage blocked: nothing to remove
    }
  },
};

export const backend = createBackend(kv);
export const server = backend.server;
const bump = () => backend.store.touch();

// ---- session (the stand-in for Firebase Auth) -----------------------------

interface Prefs {
  uid: string | null;
  /** Mail ids the recipient has opened. */
  read: string[];
  /** Progress through the guided loop: the visitor's listing and the request sent for it. */
  guide: { key?: string; mail?: string; hidden?: boolean };
}

const fresh = (): Prefs => ({ uid: null, read: [], guide: {} });

function loadPrefs(): Prefs {
  try {
    const raw = kv.get(NS + 'session');
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    // fall through
  }
  return fresh();
}

let prefs = loadPrefs();
function save(): void {
  try {
    kv.set(NS + 'session', JSON.stringify(prefs));
  } catch {
    // memory only
  }
  bump();
}

export const session = {
  get uid(): string | null {
    return prefs.uid;
  },
  account(): Account | null {
    return ACCOUNTS.find((a) => a.uid === prefs.uid) ?? null;
  },
  /** The signed-in visitor's user record, if they have registered. */
  me(): { key: string; user: User } | null {
    if (!prefs.uid) return null;
    for (const [key, user] of Object.entries(backend.store.data.users)) if (user.UID === prefs.uid) return { key, user };
    return null;
  },
  token(): string | undefined {
    return prefs.uid ? server.issueToken(prefs.uid) : undefined;
  },
  isAdmin(): boolean {
    return prefs.uid === ADMIN_UID;
  },
  /** Sign in, then do what the 2020 client did: ask the server whether this account is registered. */
  signIn(uid: string): { registered: boolean } {
    prefs.uid = uid;
    save();
    const r = server.loginUser({ uToken: server.issueToken(uid) });
    return { registered: r.success && r.registered };
  },
  signOut(): void {
    prefs.uid = null;
    save();
  },
  isRead: (id: string): boolean => prefs.read.includes(id),
  markRead(id: string): void {
    if (prefs.read.includes(id)) return;
    prefs.read.push(id);
    save();
  },
  get guide(): Prefs['guide'] {
    return prefs.guide;
  },
  setGuide(patch: Prefs['guide']): void {
    prefs.guide = { ...prefs.guide, ...patch };
    save();
  },
  unread(): number {
    const acct = this.account();
    return acct ? backend.mail.inbox(acct.email).filter((m) => !prefs.read.includes(m.id)).length : 0;
  },
};

export function resetDemo(): void {
  prefs = fresh();
  kv.remove(NS + 'session');
  backend.reset();
}

// ---- transient UI state ---------------------------------------------------

export interface Toast {
  text: string;
  action?: { label: string; run: () => void };
}

export const ui = {
  inbox: false,
  toast: null as Toast | null,
  set(patch: Partial<{ inbox: boolean; toast: Toast | null }>): void {
    Object.assign(this, patch);
    bump();
  },
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastAt = 0;
export function toast(text: string, action?: Toast['action']): void {
  clearTimeout(toastTimer);
  toastAt = Date.now();
  ui.set({ toast: { text, action } });
  toastTimer = setTimeout(() => ui.set({ toast: null }), action ? 9000 : 4200);
}

/** Re-render on any change to the backend, the session or the UI state. */
export function useApp(): number {
  return useSyncExternalStore(backend.store.subscribe, backend.store.getVersion);
}

/** Run a write against the server after a short, network-like delay. */
export function call<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(fn()), 260 + Math.random() * 240));
}

// ---- routing (hash based, so it works from a static folder) ---------------

export interface Route {
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path = '', qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) };
}

let route = parse();
const routeListeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  route = parse();
  window.scrollTo(0, 0);
  // A toast belongs to the page it appeared on (unless it was raised by this very navigation).
  if (ui.toast && Date.now() - toastAt > 500) ui.set({ toast: null });
  for (const fn of routeListeners) fn();
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      routeListeners.add(fn);
      return () => routeListeners.delete(fn);
    },
    () => route,
  );
}

export const href = (path: string): string => '#' + path;
export function navigate(path: string): void {
  if (location.hash === '#' + path) return;
  location.hash = path;
}

// ---- pictures (the stand-in for Firebase Storage) -------------------------

const stem = (path: string): string => (path.split('/').pop() ?? '').replace(/\.[^.]*$/, '');

export function productImg(p: Pick<Product, 'img'>): string {
  return backend.uploads.get(p.img) ?? artUrl(stem(p.img)) ?? placeholderUrl();
}

export function userPic(pPic: string, name: string): string {
  return backend.uploads.get(pPic) ?? avatarUrl(name);
}

/** Shrink a chosen photo to something that fits in localStorage. */
export async function fileToDataUrl(file: File, max = 720): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function money(price: string | number): string {
  const n = Number(price);
  return Number.isFinite(n) && String(price).trim() !== '' ? `£${n.toLocaleString('en-GB')}` : `£${price}`;
}

export { ACCOUNTS, ADMIN_UID };
