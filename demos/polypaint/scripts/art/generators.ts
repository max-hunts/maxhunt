// Pixel-art generators for the seeded canvas. All original: procedural pieces,
// a 5x7 bitmap font, and two of Max's own sprites downsampled from PNG
// (the 2022 PolyPaint logo and the maxhunt.design Shiba).
import fs from 'node:fs';
import { PNG } from 'pngjs';
import type { Rng } from '../../src/chain/sprites.ts';

/** [x, y, 0xRRGGBB] relative to the piece's origin. */
export type Px = [number, number, number];

const rgb = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;

export function shade(c: number, d: number): number {
  const ch = (shift: number) => Math.max(0, Math.min(255, ((c >> shift) & 255) + d));
  return rgb(ch(16), ch(8), ch(0));
}

function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return rgb(ch(16), ch(8), ch(0));
}

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function text(str: string, scale: number, colour: (charIndex: number, col: number, row: number) => number): Px[] {
  const out: Px[] = [];
  [...str].forEach((ch, ci) => {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) out.push([ci * 6 * scale + c * scale + sx, r * scale + sy, colour(ci, c, r)]);
        }
      }
    }
  });
  return out;
}

/** Downsamples a blocky PNG to `cells` x `cells` art pixels and trims the empty border. */
export function spriteFromPng(file: string, cells: number, opts: { dropWhite?: boolean } = {}): Px[] {
  const png = PNG.sync.read(fs.readFileSync(file));
  const step = png.width / cells;
  const raw: Px[] = [];
  let minX = cells;
  let minY = cells;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const sx = Math.floor((cx + 0.5) * step);
      const sy = Math.floor((cy + 0.5) * step);
      const i = (sy * png.width + sx) * 4;
      const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
      if (a < 128) continue;
      if (opts.dropWhite && r > 235 && g > 235 && b > 235) continue;
      raw.push([cx, cy, rgb(r, g, b)]);
      minX = Math.min(minX, cx);
      minY = Math.min(minY, cy);
    }
  }
  return raw.map(([x, y, c]) => [x - minX, y - minY, c]);
}

/** An 8x8 board (with a two pixel frame) in a quiet middlegame position. */
export function chessBoard(cell: number): Px[] {
  const light = 0xe9dfc8;
  const dark = 0x7a5a3c;
  const frame = 0x3a2a1c;
  const size = cell * 8;
  const out = new Map<number, Px>();
  const set = (x: number, y: number, c: number) => out.set((y + 2) * 1000 + x + 2, [x + 2, y + 2, c]);
  for (let y = -2; y < size + 2; y++) for (let x = -2; x < size + 2; x++) set(x, y, frame);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) set(f * cell + x, r * cell + y, (r + f) % 2 ? dark : light);
    }
  }
  const position: Record<'w' | 'b', [number, number][]> = {
    w: [[0, 7], [4, 7], [6, 7], [0, 6], [1, 6], [5, 6], [6, 6], [7, 6], [2, 5], [3, 4], [4, 4], [5, 5], [3, 6]],
    b: [[0, 0], [3, 0], [4, 0], [7, 0], [0, 1], [1, 1], [5, 1], [6, 1], [7, 1], [2, 2], [3, 3], [4, 3], [5, 2]],
  };
  for (const side of ['w', 'b'] as const) {
    for (const [f, r] of position[side]) {
      const c = side === 'w' ? 0xfbfbf5 : 0x17171a;
      const cx = f * cell + ((cell - 3) >> 1);
      const cy = r * cell + ((cell - 3) >> 1);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) set(cx + x, cy + y, c);
    }
  }
  return [...out.values()];
}

export function sunset(w: number, h: number, rng: Rng): Px[] {
  const sky = [0x2a1b4f, 0x4a2470, 0x7a2f7f, 0xb23b79, 0xe2565f, 0xff7a4a, 0xffa64a, 0xffd166];
  const sea = [0x3b2a6b, 0x2d2460, 0x221c4d, 0x181540];
  const horizon = Math.round(h * 0.62);
  const sx = w / 2;
  const sr = Math.round(h * 0.3);
  const out = new Map<number, Px>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number;
      if (y < horizon) {
        c = sky[Math.min(sky.length - 1, Math.floor((y / horizon) * sky.length))];
        if (Math.hypot(x - sx, y - horizon) < sr) c = y % 4 === 3 && y > horizon - sr * 0.6 ? 0xff7a4a : 0xfff1a8;
      } else {
        const t = (y - horizon) / (h - horizon);
        c = sea[Math.min(3, Math.floor(t * 4))];
        if (Math.abs(x - sx) < sr * (1 - t * 0.7) && (y + ((x >> 1) % 2)) % 2 === 0) c = 0xffb86b;
      }
      out.set(y * 1000 + x, [x, y, c]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * horizon * 0.35);
    out.set(y * 1000 + x, [x, y, 0xfdf6d8]);
  }
  return [...out.values()];
}

export function plasma(w: number, h: number, palette: readonly number[]): Px[] {
  const out: Px[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x / 5.3) + Math.sin(y / 4.1) + Math.sin((x + y) / 6.7) + Math.sin(Math.hypot(x - w / 2, y - h / 2) / 3.9);
      out.push([x, y, palette[Math.min(palette.length - 1, Math.floor(((v + 4) / 8) * palette.length))]]);
    }
  }
  return out;
}

export function truchet(cells: number, cell: number, a: number, b: number, rng: Rng): Px[] {
  const out: Px[] = [];
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const flip = rng() > 0.5;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const d1 = Math.hypot(x + 0.5, y + 0.5);
          const d2 = Math.hypot(cell - x - 0.5, cell - y - 0.5);
          const d3 = Math.hypot(cell - x - 0.5, y + 0.5);
          const d4 = Math.hypot(x + 0.5, cell - y - 0.5);
          const on = flip
            ? Math.abs(d1 - cell / 2) < 1.1 || Math.abs(d2 - cell / 2) < 1.1
            : Math.abs(d3 - cell / 2) < 1.1 || Math.abs(d4 - cell / 2) < 1.1;
          out.push([cx * cell + x, cy * cell + y, on ? a : b]);
        }
      }
    }
  }
  return out;
}

export function planet(r: number): Px[] {
  const out: Px[] = [];
  const cx = r + 6;
  const cy = r + 2;
  for (let y = 0; y < 2 * r + 5; y++) {
    for (let x = 0; x < 2 * r + 13; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.abs(Math.hypot((x - cx) / 1.55, (y - cy) * 2.6) - r * 0.98) < 1.6;
      let c: number | undefined;
      if (d <= r) {
        const light = (cx - x) * 0.6 + (cy - y) * 0.8;
        const band = Math.floor((y - cy + r) / 3) % 2;
        c = light > r * 0.35 ? (band ? 0x8fd3ff : 0xb9e6ff) : light > -r * 0.2 ? (band ? 0x4f7cff : 0x6b93ff) : band ? 0x274690 : 0x31549f;
      }
      if (ring && !(d <= r && y < cy)) c = (x + y) % 3 ? 0xffe45c : 0xffb23d;
      if (c !== undefined) out.push([x, y, c]);
    }
  }
  return out;
}

/** Concentric squares. */
export function target(size: number, palette: readonly number[]): Px[] {
  const out: Px[] = [];
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ring = Math.floor(Math.max(Math.abs(x - c), Math.abs(y - c)));
      out.push([x, y, palette[(ring >> 1) % palette.length]]);
    }
  }
  return out;
}

export function gradientBlock(w: number, h: number, a: number, b: number): Px[] {
  const out: Px[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (x + y) / Math.max(1, w + h - 2);
      const dither = ((x + y * 2) % 4) / 4 - 0.375;
      out.push([x, y, mix(a, b, Math.max(0, Math.min(1, Math.round((t + dither * 0.18) * 7) / 7)))]);
    }
  }
  return out;
}

export function checker(w: number, h: number, a: number, b: number): Px[] {
  const out: Px[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y, (x + y) % 2 ? a : b]);
  return out;
}

export function solid(w: number, h: number, c: number): Px[] {
  const out: Px[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([x, y, c]);
  return out;
}
