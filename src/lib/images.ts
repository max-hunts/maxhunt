import type { ImageMetadata } from 'astro';
import { getImage } from 'astro:assets';

// Eagerly import every project image so we can resolve the string paths stored
// in content frontmatter (e.g. "/images/pwr-title.jpg") to real assets that
// Astro can optimize at build time.
const files = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/images/*.{jpg,JPG,jpeg,png,webp}',
  { eager: true },
);

const map: Record<string, ImageMetadata> = {};
for (const path in files) {
  const filename = path.split('/').pop()!;
  map[`/images/${filename}`] = files[path].default;
}

export function resolveImage(publicPath?: string): ImageMetadata | undefined {
  if (!publicPath) return undefined;
  return map[publicPath];
}

export type OptimizedImage = {
  src: string;
  srcset: string;
  width: number;
  height: number;
};

// Produce an optimized WebP (with a srcset) for use inside React islands, which
// can't call Astro's <Image> directly. Returns null when the path is unknown.
export async function optimize(
  publicPath: string | undefined,
  width: number,
): Promise<OptimizedImage | null> {
  const meta = resolveImage(publicPath);
  if (!meta) return null;
  const w = Math.min(width, meta.width);
  const img = await getImage({
    src: meta,
    format: 'webp',
    width: w,
    widths: [Math.round(w / 2), w],
    quality: 72,
  });
  return {
    src: img.src,
    srcset: img.srcSet.attribute,
    width: meta.width,
    height: meta.height,
  };
}
