// State manager for the simulated node.
//
// It is ethereumjs' SimpleStateManager with two changes:
//
//  1. Contract storage is kept in one flat overlay map with an undo journal.
//     The stock implementation copies the entire storage map on every
//     checkpoint, which is fine for a handful of slots and far too slow once
//     a contract holds hundreds of thousands of them.
//  2. The Pixels contract can have a PixelTable attached. Storage slots of
//     seeded pixels are then served straight from the table planes, so booting
//     from the shipped seed never materializes 200k+ map entries. Anything the
//     EVM writes afterwards lands in the overlay and wins over the table.
import { SimpleStateManager } from '@ethereumjs/statemanager';
import type { Address as EthAddress } from '@ethereumjs/util';
import { keccakP, keccak_256 } from '@noble/hashes/sha3.js';
import { SLOT, TOTAL_PIXELS } from './types.ts';
import type { PixelTable } from './types.ts';

const EMPTY = new Uint8Array(0);

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push(i.toString(16).padStart(2, '0'));

function hexOf(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i]];
  return s;
}

export function hexToBytesUnprefixed(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Shortest big-endian form, the shape the EVM itself hands to putStorage (zero is empty). */
function minimalBytes(value: number): Uint8Array {
  if (value === 0) return EMPTY;
  if (value < 0x100) return Uint8Array.of(value);
  if (value < 0x10000) return Uint8Array.of(value >> 8, value & 255);
  if (value < 0x1000000) return Uint8Array.of(value >> 16, (value >> 8) & 255, value & 255);
  return Uint8Array.of(value >>> 24, (value >> 16) & 255, (value >> 8) & 255, value & 255);
}

// Which storage slot of a pixel an index entry stands for.
const KIND_OWNER = 0;
const KIND_COLOUR = 1;
const KIND_OWNED = 2;
const KIND_URL = 3;
const KIND_BALANCE = 4;
const KIND_SLOT = [SLOT.owners, SLOT.pixelColours, SLOT.pixelOwned, SLOT.pixelURL, SLOT.balances] as const;

// keccak256 of exactly 64 bytes, the shape of every Solidity mapping slot
// derivation. One sponge block, so the permutation runs once on a reused
// state instead of going through a general-purpose hasher (about half the
// time, and the seed index needs a few hundred thousand of these).
const sponge = new Uint32Array(50);
const spongeBytes = new Uint8Array(sponge.buffer);
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

function keccak64(): Uint8Array {
  let out: Uint8Array;
  if (LITTLE_ENDIAN) {
    spongeBytes[64] = 0x01; // keccak padding: 0x01 ... 0x80 at the end of the 136-byte rate
    spongeBytes[135] = 0x80;
    keccakP(sponge, 24);
    out = spongeBytes.slice(0, 32);
  } else {
    out = keccak_256(spongeBytes.subarray(0, 64));
  }
  sponge.fill(0);
  return out;
}

/** Storage key of `mapping(uint256 => T)[id]` at `slot`: keccak256(pad32(id) ++ pad32(slot)). */
export function mappingSlot(id: number, slot: number): Uint8Array {
  spongeBytes[28] = id >>> 24;
  spongeBytes[29] = (id >>> 16) & 255;
  spongeBytes[30] = (id >>> 8) & 255;
  spongeBytes[31] = id & 255;
  spongeBytes[63] = slot;
  return keccak64();
}

/** Storage key of `mapping(address => T)[address]` at `slot`. */
export function addressMappingSlot(address20: Uint8Array, slot: number): Uint8Array {
  spongeBytes.set(address20, 12);
  spongeBytes[63] = slot;
  return keccak64();
}

/** Solidity storage encoding of a string that fits in one slot (fewer than 32 bytes). */
function shortStringSlot(utf8: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(utf8);
  out[31] = utf8.length * 2;
  return out;
}

/**
 * Open-addressing hash table from a 32-byte storage key to a small integer,
 * in two typed arrays. Keys are keccak output, so the first 4 bytes pick the
 * bucket and the next 4 are kept as a tag. A tag match is confirmed by the
 * caller, which recomputes the full key for the candidate entry.
 */
class SlotIndex {
  private readonly mask: number;
  private readonly tags: Uint32Array;
  private readonly vals: Int32Array; // entry + 1, 0 = free

  constructor(entries: number) {
    let cap = 1024;
    while (cap < entries * 2) cap <<= 1;
    this.mask = cap - 1;
    this.tags = new Uint32Array(cap);
    this.vals = new Int32Array(cap);
  }

  get bytes(): number {
    return this.tags.byteLength + this.vals.byteLength;
  }

  insert(key: Uint8Array, entry: number): void {
    let i = (((key[0] << 24) | (key[1] << 16) | (key[2] << 8) | key[3]) >>> 0) & this.mask;
    while (this.vals[i] !== 0) i = (i + 1) & this.mask;
    this.tags[i] = ((key[4] << 24) | (key[5] << 16) | (key[6] << 8) | key[7]) >>> 0;
    this.vals[i] = entry + 1;
  }

  /** Calls `confirm(entry)` for each candidate until one is accepted. Returns it, or -1. */
  find(key: Uint8Array, confirm: (entry: number) => boolean): number {
    let i = (((key[0] << 24) | (key[1] << 16) | (key[2] << 8) | key[3]) >>> 0) & this.mask;
    const tag = ((key[4] << 24) | (key[5] << 16) | (key[6] << 8) | key[7]) >>> 0;
    for (let v = this.vals[i]; v !== 0; i = (i + 1) & this.mask, v = this.vals[i]) {
      if (this.tags[i] === tag && confirm(v - 1)) return v - 1;
    }
    return -1;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface Attached {
  address: string; // 0x-prefixed lowercase, as EthAddress.toString()
  table: PixelTable;
  index: SlotIndex;
  ownerBytes: Uint8Array[]; // 20-byte addresses, by owner index
  /** `_balances[owner]` as of attach time. Later changes live in the overlay. */
  balances: Uint32Array;
  urlBytes: Uint8Array[]; // utf8, by url index
  /** Pixels below this id are in the index. TOTAL_PIXELS once it is complete. */
  cursor: number;
  entries: number;
  done: number;
  ms: number;
}

export interface AttachStats {
  entries: number;
  indexBytes: number;
  /** Time spent hashing so far. */
  ms: number;
  complete: boolean;
}

export class PixelStateManager extends SimpleStateManager {
  /** `${address}_${slotHex}` to value. Holds every slot the EVM has written. */
  private readonly overlay = new Map<string, Uint8Array>();
  /** One undo list per open checkpoint: [key, previous value or undefined if absent]. */
  private readonly undo: [string, Uint8Array | undefined][][] = [];
  private attached: Attached | undefined;

  /**
   * Serves the storage of `contract` from `table` wherever the overlay has no
   * entry. The table is not copied: the node keeps mutating it as its mirror
   * of the canvas, which is safe because every field it changes was first
   * written through SSTORE and therefore sits in the overlay.
   *
   * Storage keys are hashes, so serving a read means knowing which pixel a
   * key belongs to. That index (three or four hashes per owned pixel) is not
   * built here: call `indexStep` in the background, or let the first read
   * that needs it finish the job.
   */
  attachPixels(contract: EthAddress, table: PixelTable): void {
    const { ownerIdx, urlIdx, owners, urls } = table;
    const encoder = new TextEncoder();
    const urlBytes = urls.map((u) => encoder.encode(u));
    const ownerBytes = owners.map((o) => hexToBytesUnprefixed(o.slice(2)));
    const balances = new Uint32Array(owners.length);
    const address = contract.toString();

    let entries = owners.length;
    for (let id = 0; id < TOTAL_PIXELS; id++) {
      const o = ownerIdx[id];
      if (o === 0) continue;
      balances[o - 1]++;
      entries += urlIdx[id] === 0 ? 3 : 4;
    }
    const index = new SlotIndex(entries);
    for (let i = 0; i < owners.length; i++) {
      index.insert(addressMappingSlot(ownerBytes[i], SLOT.balances), i * 8 + KIND_BALANCE);
    }
    this.attached = { address, table, index, ownerBytes, balances, urlBytes, cursor: 0, entries, done: owners.length, ms: 0 };
  }

  /**
   * Indexes owned pixels for up to `budgetMs` (all of them if omitted).
   * Returns true once the index is complete.
   */
  indexStep(budgetMs?: number): boolean {
    const a = this.attached;
    if (!a) return true;
    if (a.cursor >= TOTAL_PIXELS) return true;
    const started = performance.now();
    const { ownerIdx, urlIdx } = a.table;
    const { index } = a;
    let id = a.cursor;
    for (let n = 0; id < TOTAL_PIXELS; id++) {
      if (ownerIdx[id] === 0) continue;
      index.insert(mappingSlot(id, SLOT.owners), id * 8 + KIND_OWNER);
      index.insert(mappingSlot(id, SLOT.pixelColours), id * 8 + KIND_COLOUR);
      index.insert(mappingSlot(id, SLOT.pixelOwned), id * 8 + KIND_OWNED);
      a.done += 3;
      const u = urlIdx[id];
      if (u !== 0) {
        const main = mappingSlot(id, SLOT.pixelURL);
        index.insert(main, id * 8 + KIND_URL);
        a.done++;
        const bytes = a.urlBytes[u - 1];
        if (bytes.length >= 32) {
          // Long strings keep their data in keccak256(slot) + i. Rare, so
          // those chunks go into the overlay instead of the index.
          const base = BigInt('0x' + hexOf(keccak_256(main)));
          for (let c = 0; c * 32 < bytes.length; c++) {
            const chunk = new Uint8Array(32);
            chunk.set(bytes.subarray(c * 32, c * 32 + 32));
            const slotHex = (base + BigInt(c)).toString(16).padStart(64, '0');
            this.overlay.set(`${a.address}_${slotHex}`, chunk);
          }
        }
      }
      if (budgetMs !== undefined && (++n & 255) === 0 && performance.now() - started >= budgetMs) {
        id++;
        break;
      }
    }
    a.cursor = id;
    a.ms += performance.now() - started;
    return a.cursor >= TOTAL_PIXELS;
  }

  /** 0..1, how much of the seed index exists. */
  get indexProgress(): number {
    const a = this.attached;
    return !a || a.entries === 0 ? 1 : Math.min(1, a.done / a.entries);
  }

  get attachStats(): AttachStats | undefined {
    const a = this.attached;
    return a ? { entries: a.entries, indexBytes: a.index.bytes, ms: a.ms, complete: a.cursor >= TOTAL_PIXELS } : undefined;
  }

  private seeded(key: Uint8Array): Uint8Array {
    const a = this.attached!;
    // A miss is only meaningful against the complete index.
    if (a.cursor < TOTAL_PIXELS) this.indexStep();
    const entry = a.index.find(key, (e) => {
      const kind = e & 7;
      const n = e >>> 3;
      const expected =
        kind === KIND_BALANCE ? addressMappingSlot(a.ownerBytes[n], SLOT.balances) : mappingSlot(n, KIND_SLOT[kind]);
      return sameBytes(expected, key);
    });
    if (entry < 0) return EMPTY;
    const kind = entry & 7;
    const n = entry >>> 3;
    const { table } = a;
    switch (kind) {
      case KIND_OWNER: {
        const o = table.ownerIdx[n];
        return o === 0 ? EMPTY : a.ownerBytes[o - 1];
      }
      case KIND_COLOUR:
        return minimalBytes(table.colours[n]);
      case KIND_OWNED:
        return table.ownerIdx[n] === 0 ? EMPTY : Uint8Array.of(1);
      case KIND_URL: {
        const u = table.urlIdx[n];
        if (u === 0) return EMPTY;
        // The table's url list only grows, but encodings are cached at attach time.
        const bytes = a.urlBytes[u - 1] ?? new TextEncoder().encode(table.urls[u - 1]);
        if (bytes.length === 0) return EMPTY;
        return bytes.length < 32 ? shortStringSlot(bytes) : minimalBytes(bytes.length * 2 + 1);
      }
      default:
        return minimalBytes(a.balances[n]);
    }
  }

  override async getStorage(address: EthAddress, key: Uint8Array): Promise<Uint8Array> {
    const addr = address.toString();
    const hit = this.overlay.get(`${addr}_${hexOf(key)}`);
    if (hit !== undefined) return hit;
    if (this.attached !== undefined && this.attached.address === addr) return this.seeded(key);
    return EMPTY;
  }

  override async putStorage(address: EthAddress, key: Uint8Array, value: Uint8Array): Promise<void> {
    const k = `${address.toString()}_${hexOf(key)}`;
    if (this.undo.length > 0) this.undo[this.undo.length - 1].push([k, this.overlay.get(k)]);
    this.overlay.set(k, value);
  }

  override async clearStorage(address: EthAddress): Promise<void> {
    const prefix = `${address.toString()}_`;
    for (const k of [...this.overlay.keys()]) {
      if (!k.startsWith(prefix)) continue;
      if (this.undo.length > 0) this.undo[this.undo.length - 1].push([k, this.overlay.get(k)]);
      this.overlay.delete(k);
    }
  }

  override async checkpoint(): Promise<void> {
    await super.checkpoint();
    this.undo.push([]);
  }

  override async commit(): Promise<void> {
    await super.commit();
    const top = this.undo.pop();
    // The enclosing checkpoint must still be able to roll these writes back.
    if (top !== undefined && this.undo.length > 0) {
      const parent = this.undo[this.undo.length - 1];
      for (const entry of top) parent.push(entry);
    }
  }

  override async revert(): Promise<void> {
    await super.revert();
    const top = this.undo.pop();
    if (top === undefined) return;
    for (let i = top.length - 1; i >= 0; i--) {
      const [k, prev] = top[i];
      if (prev === undefined) this.overlay.delete(k);
      else this.overlay.set(k, prev);
    }
  }

  /** Number of slots held in the overlay (diagnostics). */
  get overlaySize(): number {
    return this.overlay.size;
  }
}
