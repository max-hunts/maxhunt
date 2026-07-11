import { useEffect, useRef, useState } from 'react';
import { SITE } from '../consts';

// A small Shiba that trots along the bottom of the page following the cursor.
// Hover it for a moment and it lights up + can be clicked (→ LinkedIn). Ported
// from the old "coming soon" page; de-fullscreened so it's a subtle easter egg.
//
// It's pinned at z-[-1] so it walks *behind* the footer — which means it never
// receives real mouseenter/click events (the page content is always stacked on
// top). So interactivity can't hang off the element itself: we hit-test the
// cursor against the sprite's rect on the global mousemove/click instead.
type State = 'sit' | 'right' | 'left';

export default function Shiba() {
  const [x, setX] = useState(120);
  const [state, setState] = useState<State>('sit');
  const [frame, setFrame] = useState(1);
  const [lit, setLit] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; left: number }[]>([]);

  const targetX = useRef(120);
  const xRef = useRef(120); // live x for the heart spawner (avoids stale closure)
  const litRef = useRef(false);
  const clickable = useRef(false);
  const heartId = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const spawnTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only enable on hover-capable devices (no cursor to follow otherwise).
  // Intentionally NOT gated on prefers-reduced-motion — it's an opt-in easter egg.
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches,
  );

  useEffect(() => {
    xRef.current = x;
  }, [x]);

  const stopSpawning = () => {
    if (spawnTimer.current) {
      clearInterval(spawnTimer.current);
      spawnTimer.current = null;
    }
  };
  const startSpawning = () => {
    if (spawnTimer.current) return;
    spawnTimer.current = setInterval(() => {
      setHearts((hs) =>
        [...hs, { id: heartId.current++, left: xRef.current - 30 + Math.random() * 60 }].slice(-8),
      );
    }, 220);
  };

  // Enter/leave the lit ("nuzzling") state — driven by the cursor hit-test.
  const setHover = (on: boolean) => {
    if (on === litRef.current) return;
    litRef.current = on;
    setLit(on);
    if (on) {
      startSpawning();
      if (armTimer.current) clearTimeout(armTimer.current);
      // Arm the click after a beat of petting.
      armTimer.current = setTimeout(() => {
        if (litRef.current) clickable.current = true;
      }, 1200);
      // While nuzzling, the cursor becomes the bone (inherited by the region it
      // sits over; real links keep their own pointer cursor).
      document.body.style.cursor = "url('/shiba/bone.png') 16 16, pointer";
    } else {
      stopSpawning();
      clickable.current = false;
      if (armTimer.current) {
        clearTimeout(armTimer.current);
        armTimer.current = null;
      }
      document.body.style.cursor = '';
    }
  };

  // Cursor tracking + hit-testing (the sprite lives behind the content, so we
  // detect hover/click by geometry rather than DOM events).
  useEffect(() => {
    if (!enabled) return;
    let throttled = false;
    const onMove = (e: MouseEvent) => {
      targetX.current = Math.max(40, Math.min(window.innerWidth - 40, e.clientX));
      const el = imgRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const pad = 14;
        const inside =
          r.width > 0 &&
          e.clientX >= r.left - pad &&
          e.clientX <= r.right + pad &&
          e.clientY >= r.top - pad &&
          e.clientY <= r.bottom + pad;
        setHover(inside);
      }
      if (throttled) return;
      throttled = true;
      window.setTimeout(() => (throttled = false), 16);
    };
    const onClick = (e: MouseEvent) => {
      if (!clickable.current) return;
      const el = imgRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        window.open(SITE.linkedin, '_blank', 'noopener');
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('click', onClick);
      stopSpawning();
      if (armTimer.current) clearTimeout(armTimer.current);
      document.body.style.cursor = '';
    };
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
    // pointer-events:none throughout — interaction is handled by the global
    // hit-test above, so the invisible sprite never blocks real clicks.
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
        ref={imgRef}
        src={img}
        alt="A friendly Shiba — hover, then click to visit my LinkedIn"
        title="woof — click me"
        className="absolute bottom-0 left-0 w-24 h-24 object-contain will-change-transform"
        style={{
          transform: `translate3d(${x - 48}px, 0, 0)`,
          transition: 'transform 0.1s linear, filter 0.35s ease, opacity 0.35s ease',
          opacity: lit ? 1 : 0.4,
          // Dark tint + desaturated so it's barely there; full colour on hover.
          filter: lit ? 'none' : 'brightness(0.4) saturate(0.5) contrast(0.95)',
        }}
      />
      <style>{`@keyframes shiba-heart{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-40px) scale(1.4)}}`}</style>
    </div>
  );
}
