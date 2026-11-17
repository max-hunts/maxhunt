import { Store } from './db.ts';
import { Mailer } from './mail.ts';
import { ACCOUNTS, SEED_ID, buildSeed } from './seed.ts';
import { Server } from './server.ts';
import type { KV } from './types.ts';

export const NS = 'gg-demo:v1:';

export interface Backend {
  store: Store;
  mail: Mailer;
  server: Server;
  /** Uploaded images by storage path (data URLs), the stand-in for Firebase Storage. */
  uploads: {
    get(path: string): string | null;
    put(path: string, dataUrl: string): void;
  };
  reset(): void;
}

export function createBackend(kv: KV, now: () => number = Date.now): Backend {
  const store = new Store(kv, NS + 'db', SEED_ID, buildSeed, now);
  const mail = new Mailer(kv, NS + 'mail', () => store.touch(), now);
  const server = new Server(store, mail, ACCOUNTS, now);

  let files: Record<string, string> = {};
  try {
    files = JSON.parse(kv.get(NS + 'uploads') ?? '{}') as Record<string, string>;
  } catch {
    files = {};
  }
  const uploads = {
    get: (path: string) => files[path] ?? null,
    put: (path: string, dataUrl: string) => {
      files[path] = dataUrl;
      try {
        kv.set(NS + 'uploads', JSON.stringify(files));
      } catch {
        // Over quota: the picture lasts until the tab closes.
      }
      store.touch();
    },
  };

  return {
    store,
    mail,
    server,
    uploads,
    reset() {
      files = {};
      kv.remove(NS + 'uploads');
      mail.reset();
      store.reset(buildSeed);
    },
  };
}

export * from './types.ts';
export { ACCOUNTS, ADMIN_UID, VISITOR_UID, SEED_PRODUCT_KEYS } from './seed.ts';
export type { ProductDraft, ProductEdit, Profile } from './server.ts';
