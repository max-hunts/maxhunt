// What gets painted on the canvas before a visitor arrives, and who owns it.
// The "mix" the handover asked for: a centerpiece cluster of recognizable
// pieces around (500, 500) plus generative art scattered over the rest.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRIGHTS, PALETTE, critter, flower, heart, mulberry32, pick } from '../../src/chain/sprites.ts';
import type { Rng, Sprite } from '../../src/chain/sprites.ts';
import { GRID } from '../../src/chain/types.ts';
import { checker, chessBoard, gradientBlock, planet, plasma, shade, solid, spriteFromPng, sunset, target, text, truchet } from './generators.ts';
import type { Px } from './generators.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO = path.join(here, 'sprites/polypaint-logo-2022.png');
const SHIBA = path.join(here, 'sprites/shiba-sit.png');

/** The 2022 client sent this when no link was given. The contract then refuses every later link. */
export const LEGACY_PLACEHOLDER = '/#';

export interface Piece {
  name: string;
  /** Index of the seed wallet that buys it (0..9). */
  owner: number;
  url: string;
  x: number;
  y: number;
  px: Px[];
}

/** Final per-pixel assignment after later pieces painted over earlier ones. */
export interface Placed {
  id: number;
  colour: number;
  piece: number;
}

const RAINBOW = [0xff6b3d, 0xffb23d, 0xffe45c, 0x7bd957, 0x2fc4d6, 0x4f7cff, 0x8a5cf6, 0xf25ca2, 0xff6b3d];
const fromSprite = (s: Sprite): Px[] => s.px.map(([x, y, c]) => [x, y, c]);

export function buildScene(): { pieces: Piece[]; placed: Placed[] } {
  const rng: Rng = mulberry32(20220214);
  const pieces: Piece[] = [];
  const add = (name: string, owner: number, x: number, y: number, px: Px[], url = '') => pieces.push({ name, owner, url, x, y, px });

  // ---- centerpiece ---------------------------------------------------------
  add('title', 0, 447, 448, text('POLYPAINT', 2, (ci, _c, r) => (r >= 5 ? shade(RAINBOW[ci], -40) : RAINBOW[ci])));
  add('sunset', 3, 422, 472, sunset(58, 36, rng));
  add('shiba', 1, 488, 470, spriteFromPng(SHIBA, 64), 'https://maxhunt.design');
  add('chess', 2, 534, 470, chessBoard(5), 'https://chess.polypaint.io');
  add('logo', 0, 424, 516, spriteFromPng(LOGO, 28, { dropWhite: true }), 'https://polypaint.io');
  add('target', 6, 458, 520, target(27, [0xf25ca2, 0xffb23d, 0x7bd957, 0x4f7cff]));
  [0xf25ca2, 0xff6b3d, 0xffb23d, 0x8a5cf6, 0x2fc4d6].forEach((c, i) => add(`heart-${i}`, 6, 540 + i * 9, 524, fromSprite(heart(c))));
  add('gm', 7, 541, 536, text('GM', 1, () => 0xf4f1e8), LEGACY_PLACEHOLDER);
  add('planet', 5, 552, 538, planet(12));
  add('plasma', 4, 596, 470, plasma(40, 40, [0x5b2a86, 0x8a5cf6, 0x4f7cff, 0x2fc4d6, 0x7bd957, 0xffe45c, 0xffb23d, 0xff6b3d]));
  add('truchet', 4, 598, 518, truchet(6, 6, 0x2fc4d6, 0x06222a, rng));
  add('gradient', 5, 644, 472, gradientBlock(30, 36, 0xf25ca2, 0x4f7cff));
  for (let i = 0; i < 9; i++) {
    add(`flower-${i}`, 7, 424 + i * 7 + Math.floor(rng() * 3), 556 + Math.floor(rng() * 4), fromSprite(flower(pick(rng, [0xf25ca2, 0xf4f1e8, 0xff6b3d, 0x8a5cf6, 0x4f7cff]))));
  }
  for (let i = 0; i < 6; i++) add(`critter-${i}`, 7, 600 + i * 12, 562, fromSprite(critter(rng, pick(rng, BRIGHTS))));
  add('hello', 9, 600, 456, text('HELLO WORLD', 1, (ci) => PALETTE[ci % 8]), LEGACY_PLACEHOLDER);
  // A block someone else owns, right where a visitor is likely to paint first.
  add('checker', 8, 522, 537, checker(12, 8, 0xffe45c, 0x1b1b1f));

  // ---- scatter ---------------------------------------------------------------
  for (let i = 0; i < 340; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 60 + Math.pow(rng(), 0.8) * 380;
    const x = Math.round(500 + Math.cos(angle) * radius * 1.15);
    const y = Math.round(500 + Math.sin(angle) * radius * 0.9);
    const kind = rng();
    // Draw the random numbers a piece needs before deciding to skip it, so the
    // layout does not depend on which pieces were skipped.
    let px: Px[];
    if (kind < 0.25) px = fromSprite(critter(rng, pick(rng, BRIGHTS)));
    else if (kind < 0.45) px = fromSprite(heart(pick(rng, BRIGHTS), 1 + Math.floor(rng() * 2)));
    else if (kind < 0.6) px = gradientBlock(8 + Math.floor(rng() * 22), 6 + Math.floor(rng() * 16), pick(rng, PALETTE), pick(rng, PALETTE));
    else if (kind < 0.7) {
      const pw = 14 + Math.floor(rng() * 20);
      const ph = 14 + Math.floor(rng() * 20);
      px = plasma(pw, ph, [pick(rng, PALETTE), pick(rng, PALETTE), pick(rng, PALETTE), pick(rng, PALETTE), pick(rng, PALETTE)]);
    } else if (kind < 0.78) px = truchet(3 + Math.floor(rng() * 4), 6, pick(rng, BRIGHTS), 0x1b1b1f, rng);
    else if (kind < 0.84) px = target(15 + Math.floor(rng() * 6) * 2, [pick(rng, PALETTE), pick(rng, PALETTE)]);
    else {
      const c = pick(rng, PALETTE);
      px = solid(2 + Math.floor(rng() * 9), 2 + Math.floor(rng() * 7), c);
    }
    const owner = Math.floor(rng() * 10);
    if (x > 330 && x < 710 && y > 410 && y < 600) continue; // keep the centerpiece clear
    add(`scatter-${i}`, owner, x, y, px);
  }

  // ---- resolve overlaps: the piece painted last keeps the pixel ---------------
  const top = new Map<number, Placed>();
  pieces.forEach((piece, index) => {
    for (const [dx, dy, colour] of piece.px) {
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      top.set(y * GRID + x, { id: y * GRID + x, colour, piece: index });
    }
  });
  return { pieces, placed: [...top.values()] };
}
