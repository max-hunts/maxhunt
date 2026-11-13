// Small original procedural sprites (16 to 64 pixels). Used by the simulated
// other buyers at runtime and by the seeder for the scattered background art.
export interface Sprite {
  w: number;
  h: number;
  /** [dx, dy, 0xRRGGBB] */
  px: [number, number, number][];
}

export type Rng = () => number;

export const PALETTE = [
  0xff6b3d, 0xffb23d, 0xffe45c, 0x7bd957, 0x2fc4d6, 0x4f7cff, 0x8a5cf6, 0xf25ca2,
  0xf4f1e8, 0xb9b6ad, 0x6b6a63, 0x1b1b1f, 0xa8452a, 0x2b8a6e, 0x274690, 0x5b2a86,
] as const;
/** The eight saturated colors at the front of the palette. */
export const BRIGHTS = PALETTE.slice(0, 8);

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];

function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];

export function heart(colour: number, scale = 1): Sprite {
  const px: Sprite['px'] = [];
  HEART.forEach((row, y) =>
    [...row].forEach((v, x) => {
      if (v !== '1') return;
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) px.push([x * scale + b, y * scale + a, colour]);
    }),
  );
  return { w: 7 * scale, h: 6 * scale, px };
}

/** A mirrored 8x7 creature. Every call draws a different one. */
export function critter(rng: Rng, colour: number): Sprite {
  for (;;) {
    const px: Sprite['px'] = [];
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 4; x++) {
        if (rng() > 0.42) px.push([x, y, colour], [7 - x, y, colour]);
      }
    }
    if (px.length >= 16) return { w: 8, h: 7, px };
  }
}

export function gradientTile(w: number, h: number, a: number, b: number): Sprite {
  const px: Sprite['px'] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x + y) / Math.max(1, w + h - 2);
      const dither = ((x + y * 2) % 4) / 4 - 0.375;
      const q = Math.max(0, Math.min(1, Math.round((t + dither * 0.18) * 7) / 7));
      px.push([x, y, mix(a, b, q)]);
    }
  }
  return { w, h, px };
}

/** A straight or diagonal stroke, two pixels thick. */
export function run(length: number, diagonal: boolean, colour: number, accent: number): Sprite {
  const px: Sprite['px'] = [];
  for (let i = 0; i < length; i++) {
    const c = i % 4 === 3 ? accent : colour;
    if (diagonal) px.push([i, i, c], [i + 1, i, c]);
    else px.push([i, 0, c], [i, 1, c]);
  }
  return diagonal ? { w: length + 1, h: length, px } : { w: length, h: 2, px };
}

export function diamond(radius: number, colour: number, core: number): Sprite {
  const px: Sprite['px'] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.abs(x) + Math.abs(y);
      if (d <= radius) px.push([x + radius, y + radius, d <= radius - 2 ? core : colour]);
    }
  }
  return { w: radius * 2 + 1, h: radius * 2 + 1, px };
}

export function flower(petal: number): Sprite {
  return {
    w: 3,
    h: 5,
    px: [
      [1, 0, petal],
      [0, 1, petal],
      [2, 1, petal],
      [1, 2, petal],
      [1, 1, 0xffe45c],
      [1, 3, 0x2b8a6e],
      [1, 4, 0x2b8a6e],
    ],
  };
}

/** One of the above, sized 16 to 64 pixels. */
export function randomSprite(rng: Rng): Sprite {
  const k = rng();
  if (k < 0.3) return heart(pick(rng, BRIGHTS));
  if (k < 0.55) return critter(rng, pick(rng, BRIGHTS));
  if (k < 0.75) return gradientTile(4 + Math.floor(rng() * 5), 4 + Math.floor(rng() * 5), pick(rng, PALETTE), pick(rng, BRIGHTS));
  if (k < 0.88) return run(8 + Math.floor(rng() * 13), rng() < 0.4, pick(rng, BRIGHTS), pick(rng, PALETTE));
  return diamond(3 + Math.floor(rng() * 2), pick(rng, BRIGHTS), pick(rng, PALETTE));
}
