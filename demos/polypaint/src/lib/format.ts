import type { Address } from 'viem';
import { GRID } from '../chain/types.ts';

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

export const sameAddr = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** 0xRRGGBB number to "#RRGGBB". */
export const hexColour = (c: number) => `#${(c & 0xffffff).toString(16).padStart(6, '0').toUpperCase()}`;
/** 0xRRGGBB number to the bytes3 hex the contract takes. */
export const bytes3 = (c: number) => `0x${(c & 0xffffff).toString(16).padStart(6, '0')}` as `0x${string}`;

export function parseHexColour(s: string): number | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(s.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((ch) => ch + ch).join('') : m[1];
  return parseInt(h, 16);
}

export const idOf = (x: number, y: number) => y * GRID + x;
export const xOf = (id: number) => id % GRID;
export const yOf = (id: number) => (id / GRID) | 0;

const WEI = 10n ** 18n;
/** Wei to a trimmed decimal string, e.g. 84800000000000000000n -> "84.8". */
export function formatPol(wei: bigint, maxDecimals = 4): string {
  const neg = wei < 0n;
  let v = neg ? -wei : wei;
  const scale = 10n ** BigInt(18 - maxDecimals);
  v = (v + scale / 2n) / scale; // round half up at maxDecimals
  const unit = 10n ** BigInt(maxDecimals);
  const whole = v / unit;
  const frac = (v % unit).toString().padStart(maxDecimals, '0').replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  return `${neg ? '-' : ''}${wholeStr}${frac ? `.${frac}` : ''}`;
}
export const polToWei = (pol: number) => (BigInt(Math.round(pol * 1e6)) * WEI) / 1_000_000n;

export const formatInt = (n: number | bigint) => n.toLocaleString('en-US');

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export type { Address };
