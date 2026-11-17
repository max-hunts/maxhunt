import type { Database, KV } from './types.ts';

// A small stand-in for Firebase Realtime Database: one JSON tree, push ids,
// and a change counter the page subscribes to. Persistence is the whole tree
// as JSON (it is a few kilobytes), tagged with the seed it grew from so a
// reseed starts every visitor fresh.

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

/**
 * A Firebase-style push id: 8 characters of timestamp, 12 of entropy, sortable
 * by creation time. `rand` returns a number in [0, 1).
 */
export function pushId(ts: number, rand: () => number = Math.random): string {
  let t = Math.floor(ts);
  const head = new Array<string>(8);
  for (let i = 7; i >= 0; i--) {
    head[i] = PUSH_CHARS.charAt(t % 64);
    t = Math.floor(t / 64);
  }
  let tail = '';
  for (let i = 0; i < 12; i++) tail += PUSH_CHARS.charAt(Math.floor(rand() * 64));
  return head.join('') + tail;
}

/** Deterministic PRNG (mulberry32) so the seed is identical on every build. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Store {
  data: Database;
  version = 0;
  private listeners = new Set<() => void>();
  private lastTs = 0;

  constructor(
    private kv: KV,
    private key: string,
    private seedId: string,
    seed: () => Database,
    private now: () => number = Date.now,
  ) {
    this.data = this.load() ?? seed();
  }

  private load(): Database | null {
    try {
      const raw = this.kv.get(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { seed: string; data: Database };
      if (parsed.seed !== this.seedId || !parsed.data?.products || !parsed.data?.users) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  /** Persist and notify. Call after every write. */
  commit(): void {
    this.version++;
    try {
      this.kv.set(this.key, JSON.stringify({ seed: this.seedId, data: this.data }));
    } catch {
      // Storage full or blocked: the session still works from memory.
    }
    for (const fn of this.listeners) fn();
  }

  /** Notify without persisting (for state kept elsewhere, like mail). */
  touch(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** A new key, strictly later than every key this store handed out before. */
  newKey(): string {
    const ts = Math.max(this.now(), this.lastTs + 1);
    this.lastTs = ts;
    return pushId(ts);
  }

  reset(seed: () => Database): void {
    this.kv.remove(this.key);
    this.data = seed();
    this.version++;
    for (const fn of this.listeners) fn();
  }
}
