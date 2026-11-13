// Compact codecs for the canvas state.
//
//  - Seed: the whole 1000x1000 canvas after build-time seeding (scripts/seed.ts).
//    Shipped as public/seed.bin and decoded on the main thread (to paint the
//    canvas before the EVM loads) and again inside the node.
//  - Delta: what changed since the seed (the visitor's and the bots' pixels,
//    balances, nonces, block height). Small enough for localStorage.
//
// This file must stay free of @ethereumjs imports: it is part of the main bundle.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { Address } from 'viem';
import { TOTAL_PIXELS } from './types.ts';
import type { DecodedSeed, PixelTable, SeedAccount, SeedMeta } from './types.ts';

const SEED_MAGIC = 0x44535050; // "PPSD" little endian
const SEED_VERSION = 1;
const DELTA_VERSION = 1;
const DELTA_PIXEL_BYTES = 10; // id u24, ownerIdx u16, rgb u24, urlIdx u16

interface SeedHeader {
  meta: {
    blockNumber: number;
    timestamp: number;
    contract: Address;
    deployer: Address;
    contractBalance: string;
    accounts: { address: Address; balance: string; nonce: number }[];
    ownedCount: number;
    txCount: number;
  };
  owners: Address[];
  urls: string[];
  /** Bytes per entry of the owner and url planes (1 or 2). */
  ownerBytes: 1 | 2;
  urlBytes: 1 | 2;
}

const toHex = (v: bigint): string => '0x' + v.toString(16);

export function emptyTable(): PixelTable {
  return {
    ownerIdx: new Uint16Array(TOTAL_PIXELS),
    colours: new Uint32Array(TOTAL_PIXELS),
    urlIdx: new Uint16Array(TOTAL_PIXELS),
    owners: [],
    urls: [],
  };
}

/** Deep copy (planes and lists), so a decoded seed can be mutated safely. */
export function cloneTable(t: PixelTable): PixelTable {
  return {
    ownerIdx: t.ownerIdx.slice(),
    colours: t.colours.slice(),
    urlIdx: t.urlIdx.slice(),
    owners: t.owners.slice(),
    urls: t.urls.slice(),
  };
}

export function encodeSeed(table: PixelTable, meta: SeedMeta): Uint8Array {
  const ownerBytes = table.owners.length < 256 ? 1 : 2;
  const urlBytes = table.urls.length < 256 ? 1 : 2;
  const header: SeedHeader = {
    meta: {
      blockNumber: meta.blockNumber,
      timestamp: meta.timestamp,
      contract: meta.contract,
      deployer: meta.deployer,
      contractBalance: toHex(meta.contractBalance),
      accounts: meta.accounts.map((a) => ({ address: a.address, balance: toHex(a.balance), nonce: a.nonce })),
      ownedCount: meta.ownedCount,
      txCount: meta.txCount,
    },
    owners: table.owners,
    urls: table.urls,
    ownerBytes,
    urlBytes,
  };
  const headerBytes = strToU8(JSON.stringify(header));
  const planes = TOTAL_PIXELS * (ownerBytes + 3 + urlBytes);
  const raw = new Uint8Array(12 + headerBytes.length + planes);
  const dv = new DataView(raw.buffer);
  dv.setUint32(0, SEED_MAGIC, true);
  dv.setUint32(4, SEED_VERSION, true);
  dv.setUint32(8, headerBytes.length, true);
  raw.set(headerBytes, 12);
  let o = 12 + headerBytes.length;
  // Planar layout (all owners, then R, G, B planes, then urls) compresses
  // better than interleaving: long runs of zeros and of identical values.
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const v = table.ownerIdx[i];
    if (ownerBytes === 1) raw[o++] = v;
    else {
      raw[o++] = v & 255;
      raw[o++] = v >> 8;
    }
  }
  for (let shift = 16; shift >= 0; shift -= 8) {
    for (let i = 0; i < TOTAL_PIXELS; i++) raw[o++] = table.ownerIdx[i] ? (table.colours[i] >> shift) & 255 : 0;
  }
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    const v = table.ownerIdx[i] ? table.urlIdx[i] : 0;
    if (urlBytes === 1) raw[o++] = v;
    else {
      raw[o++] = v & 255;
      raw[o++] = v >> 8;
    }
  }
  // mtime 0 keeps the output byte-for-byte reproducible between runs.
  return gzipSync(raw, { level: 9, mtime: 0 });
}

export function decodeSeed(bytes: Uint8Array): DecodedSeed {
  const raw = gunzipSync(bytes);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (dv.getUint32(0, true) !== SEED_MAGIC) throw new Error('seed: bad magic');
  if (dv.getUint32(4, true) !== SEED_VERSION) throw new Error('seed: unsupported version');
  const headerLen = dv.getUint32(8, true);
  const header = JSON.parse(strFromU8(raw.subarray(12, 12 + headerLen))) as SeedHeader;
  const { ownerBytes, urlBytes } = header;
  let o = 12 + headerLen;
  if (raw.length !== o + TOTAL_PIXELS * (ownerBytes + 3 + urlBytes)) throw new Error('seed: truncated');

  const ownerIdx = new Uint16Array(TOTAL_PIXELS);
  const colours = new Uint32Array(TOTAL_PIXELS);
  const urlIdx = new Uint16Array(TOTAL_PIXELS);
  if (ownerBytes === 1) {
    for (let i = 0; i < TOTAL_PIXELS; i++) ownerIdx[i] = raw[o + i];
  } else {
    for (let i = 0; i < TOTAL_PIXELS; i++) ownerIdx[i] = raw[o + 2 * i] | (raw[o + 2 * i + 1] << 8);
  }
  o += TOTAL_PIXELS * ownerBytes;
  const r = o;
  const g = o + TOTAL_PIXELS;
  const b = o + 2 * TOTAL_PIXELS;
  for (let i = 0; i < TOTAL_PIXELS; i++) colours[i] = (raw[r + i] << 16) | (raw[g + i] << 8) | raw[b + i];
  o += 3 * TOTAL_PIXELS;
  if (urlBytes === 1) {
    for (let i = 0; i < TOTAL_PIXELS; i++) urlIdx[i] = raw[o + i];
  } else {
    for (let i = 0; i < TOTAL_PIXELS; i++) urlIdx[i] = raw[o + 2 * i] | (raw[o + 2 * i + 1] << 8);
  }

  const m = header.meta;
  const meta: SeedMeta = {
    blockNumber: m.blockNumber,
    timestamp: m.timestamp,
    contract: m.contract,
    deployer: m.deployer,
    contractBalance: BigInt(m.contractBalance),
    accounts: m.accounts.map((a) => ({ address: a.address, balance: BigInt(a.balance), nonce: a.nonce })),
    ownedCount: m.ownedCount,
    txCount: m.txCount,
  };
  return { ownerIdx, colours, urlIdx, owners: header.owners, urls: header.urls, meta };
}

/**
 * Cheap identity of a seed file: gzip stores the CRC32 and size of the
 * uncompressed data in its last 8 bytes. A delta only applies to the seed it
 * was taken against.
 */
export function seedId(bytes: Uint8Array): string {
  let s = '';
  for (let i = bytes.length - 8; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// ---- delta --------------------------------------------------------------

export interface DeltaPixel {
  id: number;
  /** Index + 1 into the combined owner list (seed owners, then `owners` below). 0 = unowned. */
  ownerIdx: number;
  colour: number;
  /** Index + 1 into the combined url list. 0 = empty string. */
  urlIdx: number;
}

export interface Delta {
  /** `seedId()` of the seed this delta was taken against. */
  seed: string;
  blockNumber: number;
  timestamp: number;
  contractBalance: bigint;
  /** Every externally owned account whose balance or nonce moved since the seed. */
  accounts: SeedAccount[];
  /** Owners and urls appended after the seed's own lists, in index order. */
  owners: Address[];
  urls: string[];
  pixels: DeltaPixel[];
}

interface DeltaHeader {
  v: number;
  seed: string;
  blockNumber: number;
  timestamp: number;
  contractBalance: string;
  accounts: [Address, string, number][];
  owners: Address[];
  urls: string[];
  pixels: number;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeDelta(delta: Delta): string {
  const header: DeltaHeader = {
    v: DELTA_VERSION,
    seed: delta.seed,
    blockNumber: delta.blockNumber,
    timestamp: delta.timestamp,
    contractBalance: toHex(delta.contractBalance),
    accounts: delta.accounts.map((a) => [a.address, toHex(a.balance), a.nonce]),
    owners: delta.owners,
    urls: delta.urls,
    pixels: delta.pixels.length,
  };
  const headerBytes = strToU8(JSON.stringify(header));
  const raw = new Uint8Array(4 + headerBytes.length + delta.pixels.length * DELTA_PIXEL_BYTES);
  new DataView(raw.buffer).setUint32(0, headerBytes.length, true);
  raw.set(headerBytes, 4);
  let o = 4 + headerBytes.length;
  for (const p of delta.pixels) {
    raw[o++] = p.id & 255;
    raw[o++] = (p.id >> 8) & 255;
    raw[o++] = (p.id >> 16) & 255;
    raw[o++] = p.ownerIdx & 255;
    raw[o++] = (p.ownerIdx >> 8) & 255;
    raw[o++] = (p.colour >> 16) & 255;
    raw[o++] = (p.colour >> 8) & 255;
    raw[o++] = p.colour & 255;
    raw[o++] = p.urlIdx & 255;
    raw[o++] = (p.urlIdx >> 8) & 255;
  }
  return toBase64(gzipSync(raw, { level: 6, mtime: 0 }));
}

/** Throws on anything malformed. Callers treat a throw as "no snapshot". */
export function decodeDelta(text: string): Delta {
  const raw = gunzipSync(fromBase64(text));
  const headerLen = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint32(0, true);
  const header = JSON.parse(strFromU8(raw.subarray(4, 4 + headerLen))) as DeltaHeader;
  if (header.v !== DELTA_VERSION) throw new Error('delta: unsupported version');
  let o = 4 + headerLen;
  if (raw.length !== o + header.pixels * DELTA_PIXEL_BYTES) throw new Error('delta: truncated');
  const pixels: DeltaPixel[] = new Array(header.pixels);
  for (let i = 0; i < header.pixels; i++, o += DELTA_PIXEL_BYTES) {
    pixels[i] = {
      id: raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16),
      ownerIdx: raw[o + 3] | (raw[o + 4] << 8),
      colour: (raw[o + 5] << 16) | (raw[o + 6] << 8) | raw[o + 7],
      urlIdx: raw[o + 8] | (raw[o + 9] << 8),
    };
  }
  return {
    seed: header.seed,
    blockNumber: header.blockNumber,
    timestamp: header.timestamp,
    contractBalance: BigInt(header.contractBalance),
    accounts: header.accounts.map(([address, balance, nonce]) => ({ address, balance: BigInt(balance), nonce })),
    owners: header.owners,
    urls: header.urls,
    pixels,
  };
}

/**
 * Applies a delta to a table in place (the table must be the decoded seed the
 * delta was taken against). Throws if the delta does not fit the table.
 */
export function applyDelta(table: PixelTable, delta: Delta): void {
  const owners = table.owners.length + delta.owners.length;
  const urls = table.urls.length + delta.urls.length;
  for (const p of delta.pixels) {
    if (p.id >= TOTAL_PIXELS || p.ownerIdx > owners || p.urlIdx > urls) throw new Error('delta: out of range');
  }
  table.owners.push(...delta.owners);
  table.urls.push(...delta.urls);
  for (const p of delta.pixels) {
    table.ownerIdx[p.id] = p.ownerIdx;
    table.colours[p.id] = p.colour;
    table.urlIdx[p.id] = p.urlIdx;
  }
}
