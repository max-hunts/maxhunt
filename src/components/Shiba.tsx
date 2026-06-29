import { useEffect, useRef, useState } from 'react';
import { SITE } from '../consts';

// A small Shiba that trots along the bottom of the page following the cursor.
// Hover it for a moment and it becomes clickable (→ LinkedIn). Ported from the
// old "coming soon" page; de-fullscreened so it's a subtle easter egg.
type State = 'sit' | 'right' | 'left';

export default function Shiba() {
  const [x, setX] = useState(120);
  const [state, setState] = useState<State>('sit');
  const [frame, setFrame] = useState(1);
  const [clickable, setClickable] = useState(false);
  const [lit, setLit] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);
  const targetX = useRef(120);
  const hovering = useRef(false);
  const heartId = useRef(0);
  const spawnTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop the heart spawner (on mouse-leave and unmount) so re-entering can't
  // stack overlapping intervals.
  const stopSpawning = () => {
    if (spawnTimer.current) {
      clearInterval(spawnTimer.current);
      spawnTimer.current = null;
    }
  };
  useEffect(() => stopSpawning, []);

  // Only disable on touch devices (no cursor to follow). Intentionally NOT gated
  // on prefers-reduced-motion — it's an opt-in easter egg, like the old page.
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover)').matches,
  );

  useEffect(() => {
    if (!enabled) return;
    let t: number | undefined;
    const onMove = (e: MouseEvent) => {
      targetX.current = Math.max(40, Math.min(window.innerWidth - 40, e.clientX));
      if (t) return;
      t = window.setTimeout(() => (t = undefined), 16);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled]);

  // Movement loop.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setX((prev) => {
        const diff = targetX.current - prev;
        if (Math.abs(diff) <= 12) {
          setState('sit');
          return prev;
        }
        setState(diff > 0 ? 'right' : 'left');
        return prev + Math.sign(diff) * 5;
      });
    }, 50);
    return () => clearInterval(id);
  }, [enabled]);

  // Walk-cycle frames.
  useEffect(() => {
    if (state === 'sit') return;
    const id = setInterval(() => setFrame((f) => (f === 4 ? 1 : f + 1)), 200);
    return () => clearInterval(id);
  }, [state]);

  // Heart fade-out cleanup.
  useEffect(() => {
    const id = setInterval(() => {
      setHearts((hs) => (hs.length ? hs.slice(1) : hs));
    }, 700);
    return () => clearInterval(id);
  }, []);

  if (!enabled) return null;

  const img =
    state === 'sit' ? '/shiba/dog-sit.png' : `/shiba/dog-${state}-${frame}.png`;

  return (
    // Pinned to the very bottom of the page (absolute → adds no page height) and
    // sat at z-index:-1 so it walks *behind* the footer. Dim until hovered.
    <div className="absolute inset-x-0 bottom-0 h-24 z-[-1] pointer-events-none overflow-visible select-none">
      {hearts.map((h) => (
        <img
          key={h.id}
          src="/shiba/heart.png"
          alt=""
          className="absolute bottom-20 w-5 h-5"
          style={{ left: h.left, animation: 'shiba-heart 0.7s ease-out forwards' }}
        />
      ))}
      <img
        src={img}
        alt="A friendly Shiba — hover, then click to visit my LinkedIn"
        title="woof — click me"
        className="absolute bottom-0 left-0 w-24 h-24 object-contain pointer-events-auto will-change-transform"
        style={{
          transform: `translate3d(${x - 48}px, 0, 0)`,
          transition: 'transform 0.1s linear, filter 0.35s ease, opacity 0.35s ease',
          opacity: lit ? 1 : 0.4,
          // Dark tint + desaturated so it's barely there; full colour on hover.
          filter: lit ? 'none' : 'brightness(0.4) saturate(0.5) contrast(0.95)',
          // While it's nuzzling (hearts flowing), the cursor becomes the bone.
          cursor: lit ? "url('/shiba/bone.png') 16 16, pointer" : 'pointer',
        }}
        onMouseEnter={() => {
          hovering.current = true;
          setLit(true);
          window.setTimeout(() => {
            if (hovering.current) setClickable(true);
          }, 1200);
          stopSpawning();
          spawnTimer.current = setInterval(() => {
            if (!hovering.current) return stopSpawning();
            setHearts((hs) =>
              [...hs, { id: heartId.current++, left: x - 30 + Math.random() * 60 }].slice(-8),
            );
          }, 220);
        }}
        onMouseLeave={() => {
          hovering.current = false;
          setLit(false);
          setClickable(false);
          stopSpawning();
        }}
        onClick={() => {
          if (clickable) window.open(SITE.linkedin, '_blank', 'noopener');
        }}
      />
      <style>{`@keyframes shiba-heart{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-40px) scale(1.4)}}`}</style>
    </div>
  );
}
