// Image stamp: the idea of the 2022 repo's js_pixel_converter (turn an image
// into pixel ids + colors), done in the page: resize, quantize, preview as a
// draggable ghost, then commit to the draft.
import type { StampImage } from './board.ts';

export const STAMP_SIZES = [16, 24, 32, 48, 64] as const;

/** Median cut over the opaque cells. Returns the cells remapped to at most `n` colors. */
function quantize(cells: Int32Array, n: number): Int32Array {
  const pts: number[] = [];
  for (const c of cells) if (c >= 0) pts.push(c);
  if (!pts.length || n <= 0) return cells;
  type Box = number[];
  const range = (b: Box) => {
    let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
    for (const c of b) {
      const r = c >> 16, g = (c >> 8) & 255, bl = c & 255;
      if (r < r0) r0 = r;
      if (r > r1) r1 = r;
      if (g < g0) g0 = g;
      if (g > g1) g1 = g;
      if (bl < b0) b0 = bl;
      if (bl > b1) b1 = bl;
    }
    const spans = [r1 - r0, g1 - g0, b1 - b0];
    const axis = spans.indexOf(Math.max(...spans));
    return { axis, span: spans[axis] };
  };
  let boxes: Box[] = [pts];
  while (boxes.length < n) {
    let best = -1, bestScore = 0;
    boxes.forEach((b, i) => {
      const score = range(b).span * Math.sqrt(b.length);
      if (b.length > 1 && score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best < 0) break;
    const box = boxes[best];
    const shift = [16, 8, 0][range(box).axis];
    box.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
    const mid = box.length >> 1;
    boxes = [...boxes.slice(0, best), box.slice(0, mid), box.slice(mid), ...boxes.slice(best + 1)];
  }
  const palette = boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const c of b) {
      r += c >> 16;
      g += (c >> 8) & 255;
      bl += c & 255;
    }
    return (Math.round(r / b.length) << 16) | (Math.round(g / b.length) << 8) | Math.round(bl / b.length);
  });
  const cache = new Map<number, number>();
  const nearest = (c: number) => {
    let hit = cache.get(c);
    if (hit !== undefined) return hit;
    let bestD = Infinity;
    hit = palette[0];
    for (const p of palette) {
      const dr = (c >> 16) - (p >> 16), dg = ((c >> 8) & 255) - ((p >> 8) & 255), db = (c & 255) - (p & 255);
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3;
      if (d < bestD) {
        bestD = d;
        hit = p;
      }
    }
    cache.set(c, hit);
    return hit;
  };
  return cells.map((c) => (c < 0 ? c : nearest(c)));
}

/**
 * Resize an image so its longer side is `maxSide` pixels and reduce it to
 * `colours` colors (0 keeps full color). Transparent areas stay empty.
 */
export async function imageToStamp(source: Blob, maxSide: number, colours: number, name = 'image'): Promise<StampImage> {
  const bmp = await createImageBitmap(source);
  const scale = maxSide / Math.max(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const px = g.getImageData(0, 0, w, h).data;
  const cells = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3];
    cells[i] = a < 128 ? -1 : (px[i * 4] << 16) | (px[i * 4 + 1] << 8) | px[i * 4 + 2];
  }
  return { w, h, data: quantize(cells, colours), name };
}

/** A small built-in sample so the stamp tool can be tried without a file. */
export function sampleStamp(): StampImage {
  const rows = [
    '....YYYYYY....',
    '..YYYYYYYYYY..',
    '.YYYYYYYYYYYY.',
    '.YYKKYYYYKKYY.',
    'YYYKKYYYYKKYYY',
    'YYYYYYYYYYYYYY',
    'YYYYYYYYYYYYYY',
    'YYPYYYYYYYYPYY',
    'YYYKYYYYYYKYYY',
    '.YYYKKKKKKYYY.',
    '.YYYYYYYYYYYY.',
    '..YYYYYYYYYY..',
    '....YYYYYY....',
  ];
  const map: Record<string, number> = { Y: 0xffe45c, K: 0x1b1b1f, P: 0xf25ca2 };
  const w = rows[0].length, h = rows.length;
  const data = new Int32Array(w * h);
  rows.forEach((row, y) => [...row].forEach((ch, x) => (data[y * w + x] = ch === '.' ? -1 : map[ch])));
  return { w, h, data, name: 'sample' };
}
