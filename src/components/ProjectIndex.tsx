import { useMemo, useRef, useState } from 'react';

export type ProjectCard = {
  slug: string;
  title: string;
  tagline: string;
  category: 'software' | 'product' | 'engineering';
  type: string;
  year: string;
  isNew: boolean;
  // True for white-background product shots → fade the preview edges so the
  // white blends into the card instead of reading as a bright box.
  heroLight: boolean;
  // Optimized hero (null for projects without imagery yet).
  hero: { src: string; srcset: string } | null;
  // Aspect ratio "w / h" known at build so the frame can resize instantly.
  ar: string;
};

type Filter = 'all' | ProjectCard['category'];

const FILTERS: Filter[] = ['all', 'software', 'product', 'engineering'];

const placeholderTint: Record<ProjectCard['category'], string> = {
  software: '#3a1d14',
  product: '#142a35',
  engineering: '#16271f',
};

export default function ProjectIndex({ projects }: { projects: ProjectCard[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const visible = useMemo(
    () => projects.filter((p) => filter === 'all' || p.category === filter),
    [filter, projects],
  );
  const [activeSlug, setActiveSlug] = useState<string>(projects[0]?.slug);
  const active = projects.find((p) => p.slug === activeSlug) ?? projects[0];

  // Debounce hover-driven preview swaps: dragging the cursor across the list
  // shouldn't fire a swap per row — only settle on the one you pause over.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewHover = (slug: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setActiveSlug(slug), 90);
  };

  // padding-bottom % drives the frame height (animatable in every browser,
  // unlike `aspect-ratio` which Safari won't transition).
  const [w, h] = (active?.ar ?? '16 / 10').split('/').map((n) => parseFloat(n));
  const padPct = (h / w) * 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] border-t border-line">
      {/* List */}
      <div className="md:border-r border-line">
        <div className="flex flex-wrap gap-1.5 px-1 py-3">
          {FILTERS.map((f) => {
            const count =
              f === 'all'
                ? projects.length
                : projects.filter((p) => p.category === f).length;
            const on = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  'font-mono text-[11px] px-2.5 py-1.5 rounded-lg border transition-colors ' +
                  (on
                    ? 'bg-accent text-accent-ink border-accent'
                    : 'border-white/20 text-muted hover:border-accent hover:text-accent')
                }
              >
                {f === 'all' ? `all · ${count}` : f}
              </button>
            );
          })}
        </div>

        <div>
          {visible.map((p, i) => (
            <a
              key={p.slug}
              href={`/work/${p.slug}`}
              onMouseEnter={() => previewHover(p.slug)}
              onFocus={() => setActiveSlug(p.slug)}
              className={
                'group grid grid-cols-[30px_1fr_auto] gap-3 items-center px-1 py-3.5 ' +
                'border-t border-line cursor-pointer transition-[background,padding] ' +
                'hover:bg-white/[0.03] hover:pl-4 ' +
                (active?.slug === p.slug ? 'bg-white/[0.03]' : '')
              }
            >
              <span className="font-mono text-xs text-faint group-hover:text-accent transition-colors">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <p className="text-[17px] font-medium flex items-center gap-2 m-0">
                  {p.title}
                  {p.isNew && (
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-accent text-accent-ink tracking-wider">
                      NEW
                    </span>
                  )}
                </p>
                <p className="text-[12.5px] text-muted mt-0.5 m-0">{p.tagline}</p>
              </div>
              <div className="flex gap-2 items-center">
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-muted">
                  {p.type}
                </span>
                <span className="text-accent text-[17px] opacity-30 group-hover:opacity-100 transition-opacity">
                  →
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Side preview (desktop only). The frame animates its aspect-ratio to the
          active image; every layer is rendered once and crossfaded via opacity,
          so hovering never remounts/redecodes an image (smooth, no dropped frames). */}
      <div className="hidden md:block p-[18px]">
        <div
          className="relative w-full rounded-[10px] overflow-hidden border border-white/[0.12] bg-surface transition-[padding] duration-[260ms] ease-out"
          style={{ paddingBottom: `${padPct}%` }}
        >
          {projects.map((p) => {
            const on = p.slug === active?.slug;
            return p.hero ? (
              <img
                key={p.slug}
                src={p.hero.src}
                srcSet={p.hero.srcset}
                sizes="300px"
                alt={p.title}
                loading={on ? 'eager' : 'lazy'}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[220ms] ease-out"
                style={{
                  opacity: on ? 1 : 0,
                  ...(p.heroLight
                    ? {
                        WebkitMaskImage:
                          'radial-gradient(115% 95% at 50% 45%, #000 46%, transparent 100%)',
                        maskImage:
                          'radial-gradient(115% 95% at 50% 45%, #000 46%, transparent 100%)',
                      }
                    : {}),
                }}
              />
            ) : (
              <div
                key={p.slug}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 transition-opacity duration-[220ms] ease-out"
                style={{
                  opacity: on ? 1 : 0,
                  background: placeholderTint[p.category],
                }}
              >
                <span className="text-2xl text-white/40">⊹</span>
                <span className="font-mono text-[11px] text-white/55">{p.title}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[19px] font-medium mt-3.5 m-0">{active?.title}</p>
        <p className="text-[13px] text-muted leading-relaxed mt-1.5 m-0">
          {active?.tagline}
        </p>
        <a
          href={`/work/${active?.slug}`}
          className="inline-block font-mono text-[11px] px-3 py-2 rounded-lg bg-accent text-accent-ink mt-3"
        >
          open case study →
        </a>
      </div>
    </div>
  );
}
