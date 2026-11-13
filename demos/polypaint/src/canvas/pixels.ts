// Main-thread mirror of the canvas: who owns each pixel, its color and link.
// Filled once from the shipped seed (plus any saved snapshot), then kept current
// by applying the contract's own events (PixelMinted / PixelColourChanged).
import type { Address } from 'viem';
import { GRID, TOTAL_PIXELS, type PixelTable } from '../chain/types.ts';

/** The placeholder the 2022 client sent when no link was given. Pixels.sol never lets it change. */
export const LOCKED_URL = '/#';

const GROUP_REACH = 3;

export interface PixelLog {
  kind: 'minted' | 'colour';
  txHash: string;
  blockNumber: number;
  pixelId: number;
  owner: Address;
  colour?: number;
  url?: string;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PixelGroup extends Bounds {
  ids: number[];
  count: number;
  /** Representative swatches for the list thumbnail. */
  colours: number[];
}

export class PixelMirror {
  ownerIdx = new Uint16Array(TOTAL_PIXELS);
  colours = new Uint32Array(TOTAL_PIXELS);
  urlIdx = new Uint16Array(TOTAL_PIXELS);
  owners: Address[] = [];
  urls: string[] = [];
  ownerCounts: number[] = [];
  owned = 0;
  /** Bumped on every change; cheap way for the UI to know it must recompute. */
  version = 0;

  private ownerLookup = new Map<string, number>();
  private urlLookup = new Map<string, number>();

  load(table: PixelTable): void {
    this.ownerIdx.set(table.ownerIdx);
    this.colours.set(table.colours);
    this.urlIdx.set(table.urlIdx);
    this.owners = [...table.owners];
    this.urls = [...table.urls];
    this.reindex();
  }

  private reindex(): void {
    this.ownerLookup.clear();
    this.urlLookup.clear();
    this.owners.forEach((a, i) => this.ownerLookup.set(a.toLowerCase(), i + 1));
    this.urls.forEach((u, i) => this.urlLookup.set(u, i + 1));
    this.ownerCounts = new Array(this.owners.length + 1).fill(0);
    let owned = 0;
    const idx = this.ownerIdx;
    for (let i = 0; i < TOTAL_PIXELS; i++) {
      const o = idx[i];
      if (o) {
        owned++;
        this.ownerCounts[o]++;
      }
    }
    this.owned = owned;
    this.version++;
  }

  /** 1-based owner index for an address, creating it if needed. */
  private internOwner(address: Address): number {
    const key = address.toLowerCase();
    let i = this.ownerLookup.get(key);
    if (!i) {
      this.owners.push(address);
      i = this.owners.length;
      this.ownerLookup.set(key, i);
      this.ownerCounts[i] = 0;
    }
    return i;
  }

  private internUrl(url: string): number {
    if (!url) return 0;
    let i = this.urlLookup.get(url);
    if (!i) {
      this.urls.push(url);
      i = this.urls.length;
      this.urlLookup.set(url, i);
    }
    return i;
  }

  /** 1-based index of an address, or 0 when it owns nothing and was never seen. */
  indexOfOwner(address?: string | null): number {
    return address ? (this.ownerLookup.get(address.toLowerCase()) ?? 0) : 0;
  }

  ownerOf(id: number): Address | null {
    const o = this.ownerIdx[id];
    return o ? this.owners[o - 1] : null;
  }

  urlOf(id: number): string {
    const u = this.urlIdx[id];
    return u ? this.urls[u - 1] : '';
  }

  isOwned(id: number): boolean {
    return this.ownerIdx[id] !== 0;
  }

  uniqueOwners(): number {
    let n = 0;
    for (let i = 1; i < this.ownerCounts.length; i++) if (this.ownerCounts[i] > 0) n++;
    return n;
  }

  countOwnedBy(address?: string | null): number {
    const i = this.indexOfOwner(address);
    return i ? (this.ownerCounts[i] ?? 0) : 0;
  }

  /**
   * Apply decoded contract events in log order. Returns the ids that changed.
   *
   * mint() emits PixelMinted then PixelColourChanged and stores the URL as given.
   * changePixelColour() emits only PixelColourChanged, and (a quirk of the 2022
   * contract) leaves the stored URL alone when it is currently '/#', even though
   * the event still reports the new one. The mirror follows storage, not the event.
   */
  applyLogs(logs: PixelLog[]): number[] {
    const changed: number[] = [];
    let mintedTx = '';
    const justMinted = new Set<number>();
    for (const log of logs) {
      if (log.txHash !== mintedTx) {
        mintedTx = log.txHash;
        justMinted.clear();
      }
      const id = log.pixelId;
      if (id < 0 || id >= TOTAL_PIXELS) continue;
      if (log.kind === 'minted') {
        justMinted.add(id);
        const next = this.internOwner(log.owner);
        const prev = this.ownerIdx[id];
        if (prev !== next) {
          if (prev) this.ownerCounts[prev]--;
          else this.owned++;
          this.ownerCounts[next]++;
          this.ownerIdx[id] = next;
        }
        changed.push(id);
      } else {
        if (log.colour !== undefined) this.colours[id] = log.colour & 0xffffff;
        const fresh = justMinted.has(id);
        if (fresh || this.urlOf(id) !== LOCKED_URL) this.urlIdx[id] = this.internUrl(log.url ?? '');
        if (!fresh) changed.push(id);
      }
    }
    if (changed.length) this.version++;
    return changed;
  }

  /** All pixel ids owned by an address, ascending. One pass over the table. */
  idsOwnedBy(address?: string | null): number[] {
    const i = this.indexOfOwner(address);
    if (!i || !this.ownerCounts[i]) return [];
    const out: number[] = [];
    const idx = this.ownerIdx;
    for (let id = 0; id < TOTAL_PIXELS; id++) if (idx[id] === i) out.push(id);
    return out;
  }

  /**
   * Cluster an address's pixels into blocks, largest first. Pixels within
   * GROUP_REACH of each other count as one block, so lettering or a sprite with
   * gaps reads as a single purchase instead of a dozen fragments.
   */
  groupsOwnedBy(address?: string | null): PixelGroup[] {
    const ids = this.idsOwnedBy(address);
    if (!ids.length) return [];
    const mine = new Set(ids);
    const seen = new Set<number>();
    const groups: PixelGroup[] = [];
    for (const start of ids) {
      if (seen.has(start)) continue;
      const stack = [start];
      seen.add(start);
      const members: number[] = [];
      let x0 = GRID, y0 = GRID, x1 = 0, y1 = 0;
      while (stack.length) {
        const id = stack.pop()!;
        members.push(id);
        const x = id % GRID, y = (id / GRID) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        for (let dy = -GROUP_REACH; dy <= GROUP_REACH; dy++) {
          for (let dx = -GROUP_REACH; dx <= GROUP_REACH; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            const n = ny * GRID + nx;
            if (mine.has(n) && !seen.has(n)) {
              seen.add(n);
              stack.push(n);
            }
          }
        }
      }
      members.sort((a, b) => a - b);
      const swatches = new Map<number, number>();
      for (const id of members) swatches.set(this.colours[id], (swatches.get(this.colours[id]) ?? 0) + 1);
      const colours = [...swatches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
      groups.push({ ids: members, count: members.length, x0, y0, x1, y1, colours });
    }
    groups.sort((a, b) => b.count - a.count);
    return groups;
  }
}

export function boundsOf(ids: Iterable<number>): Bounds | null {
  let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1;
  for (const id of ids) {
    const x = id % GRID, y = (id / GRID) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
