import { useEffect, useState } from 'react';

export type Shot = {
  src: string;
  srcset: string;
  thumb: string;
  full: string;
  ar: string; // "w / h"
  caption?: string;
};

export default function Gallery({ shots }: { shots: Shot[] }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const active = shots[index];
  // padding-bottom % drives the frame height — animatable in every browser
  // (Safari won't transition `aspect-ratio`).
  const [w, h] = (active?.ar ?? '16 / 10').split('/').map((n) => parseFloat(n));
  const padPct = (h / w) * 100;

  function select(i: number) {
    // The frame reserves space via aspect-ratio, so swapping never collapses
    // height → no scroll jump.
    setIndex(i);
  }

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % shots.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + shots.length) % shots.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, shots.length]);

  if (!shots.length) return null;

  return (
    <div>
      <button
        onClick={() => setLightbox(true)}
        className="block w-full rounded-xl overflow-hidden border border-white/[0.12] bg-surface cursor-zoom-in relative transition-[padding] duration-500 ease-out"
        style={{ paddingBottom: `${padPct}%` }}
        aria-label="Open image full screen"
      >
        {shots.map((s, i) => (
          <img
            key={s.src}
            src={s.src}
            srcSet={s.srcset}
            sizes="(min-width: 768px) 720px, 100vw"
            alt={s.caption ?? ''}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-[400ms] ease-out"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}
      </button>
      {active.caption && (
        <p className="font-mono text-[11px] text-faint mt-2 m-0">{active.caption}</p>
      )}

      {shots.length > 1 && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {shots.map((s, i) => (
            <button
              key={s.src}
              onClick={() => select(i)}
              className={
                'h-14 rounded-lg overflow-hidden border transition-all duration-200 ' +
                'hover:-translate-y-0.5 ' +
                (i === index
                  ? 'border-accent ring-1 ring-accent/40'
                  : 'border-white/[0.12] opacity-70 hover:opacity-100 hover:border-white/40')
              }
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
            >
              <img
                src={s.thumb}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(false)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6 animate-[fadein_.2s_ease]"
        >
          <button
            className="absolute top-4 right-5 font-mono text-sm text-white/70 hover:text-white"
            onClick={() => setLightbox(false)}
            aria-label="Close"
          >
            ESC ✕
          </button>
          <img
            key={active.full}
            src={active.full}
            alt={active.caption ?? ''}
            className="max-w-full max-h-[88vh] object-contain animate-[fadein_.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          />
          {shots.length > 1 && (
            <>
              <button
                className="absolute left-4 text-white/70 hover:text-white text-3xl transition-transform hover:-translate-x-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => (i - 1 + shots.length) % shots.length);
                }}
                aria-label="Previous"
              >
                ‹
              </button>
              <button
                className="absolute right-4 text-white/70 hover:text-white text-3xl transition-transform hover:translate-x-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex((i) => (i + 1) % shots.length);
                }}
                aria-label="Next"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
