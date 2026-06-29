import { useEffect, useRef, useState } from 'react';

type Props = {
  dir: string;
  count: number;
  pad?: number;
  ext?: string;
  /** Aspect ratio of the frames, "w / h". */
  ar?: string;
  label?: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function frameUrl(dir: string, i: number, pad: number, ext: string) {
  return `${dir}/${String(i + 1).padStart(pad, '0')}.${ext}`;
}

export default function FrameSequence({
  dir,
  count,
  pad = 4,
  ext = 'jpg',
  ar = '12 / 5',
  label = 'scroll to rotate · drag to scrub',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartFrame = useRef(0);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);

  // Preload every frame so swapping is instant (the browser caches them; the
  // <img> below just points at the same URLs without re-fetching).
  useEffect(() => {
    let alive = true;
    let done = 0;
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < count; i++) {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (!alive) return;
        done++;
        setLoaded(done);
        if (done === count) setReady(true);
      };
      img.src = frameUrl(dir, i, pad, ext);
      imgs.push(img);
    }
    return () => {
      alive = false;
    };
  }, [dir, count, pad, ext]);

  // Scroll-driven: map whole-page scroll progress onto the frame index, so the
  // render is at frame 1 at the very top and the final frame at the very bottom
  // (spans 100% of the page scroll instead of finishing early).
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf || dragging.current) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const doc = document.documentElement;
        const max = doc.scrollHeight - window.innerHeight;
        const progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
        setIdx(clamp(Math.round(progress * (count - 1)), 0, count - 1));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count]);

  // Drag-to-scrub (pauses scroll-sync while held).
  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartFrame.current = idx;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !wrapRef.current) return;
    const w = wrapRef.current.clientWidth || 1;
    const delta = ((e.clientX - dragStartX.current) / w) * count;
    setIdx(clamp(Math.round(dragStartFrame.current + delta), 0, count - 1));
  }
  function onPointerUp() {
    dragging.current = false;
  }

  const pct = Math.round((loaded / count) * 100);

  return (
    <div ref={wrapRef}>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-white/[0.12] bg-surface touch-none select-none cursor-ew-resize"
        style={{ aspectRatio: ar }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={frameUrl(dir, idx, pad, ext)}
          alt="Rotating product render"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: ready ? 1 : 0.4, transition: 'opacity .4s ease' }}
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[11px] text-white/60">
              loading render… {pct}%
            </span>
          </div>
        )}
      </div>
      <p className="font-mono text-[10px] text-faint mt-2 flex items-center gap-2">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent"></span>
        {label}
      </p>
    </div>
  );
}
