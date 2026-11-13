import type { ReactNode } from 'react';

const F = { fill: 'currentColor', stroke: 'none' } as const;

const PATHS: Record<string, ReactNode> = {
  select: <path {...F} d="M5 3l14 8.2-6.3 1.6L10.2 19z" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="1.5" strokeDasharray="3.2 2.8" />,
  brush: (
    <>
      <path d="M20 4l-8.5 8.5" />
      <path {...F} d="M10 11.6l2.4 2.4c.9 1 .7 2.6-.5 3.6C10 19.3 7 20 4 20c1.2-1.5 1.4-3 1.8-4.4.5-1.8 2.6-4.8 4.2-4z" />
    </>
  ),
  fill: (
    <>
      <path d="M11.5 3.5l8 8-7 7a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8z" />
      <path d="M4.5 12H19" />
      <path d="M20.5 16c.8 1.1 1.3 1.9 1.3 2.7a1.3 1.3 0 0 1-2.6 0c0-.8.5-1.6 1.3-2.7z" />
    </>
  ),
  erase: (
    <>
      <path d="M4.6 14.4l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-7.2 7.2H8.2l-3.6-3.4a.6.6 0 0 1 0-.8z" />
      <path d="M9.5 9.5l5.5 5.5M8 19h11" />
    </>
  ),
  stamp: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle {...F} cx="9" cy="10" r="1.7" />
      <path d="M5 18l4.5-5 3.5 3.5 2.5-2.5L20 18" />
    </>
  ),
  pan: <path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  warn: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M7 17L17 7M9 7h8v8" />,
  back: <path d="M15 5l-7 7 7 7" />,
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M3.5 10h17" />
      <circle {...F} cx="16.5" cy="14.5" r="1.3" />
    </>
  ),
  chev: <path d="M7 10l5 5 5-5" />,
  undo: (
    <>
      <path d="M8 6L4 10l4 4" />
      <path d="M4 10h10a5 5 0 0 1 0 10h-3" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9M12 16.6v.3" />
    </>
  ),
  drop: <path d="M12 3.5s6 6.4 6 10.9a6 6 0 0 1-12 0c0-4.5 6-10.9 6-10.9z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  play: <path {...F} d="M7 4.5v15l12-7.5z" />,
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  activity: <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  cart: (
    <>
      <path d="M4 5h2l2.2 10h9.3l2-7H7.2" />
      <circle {...F} cx="9.5" cy="18.5" r="1.4" />
      <circle {...F} cx="16.5" cy="18.5" r="1.4" />
    </>
  ),
  more: (
    <>
      <circle {...F} cx="5.5" cy="12" r="1.6" />
      <circle {...F} cx="12" cy="12" r="1.6" />
      <circle {...F} cx="18.5" cy="12" r="1.6" />
    </>
  ),
};

export function Icon({ name, size = 18, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg
      className={`ico${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/** The refreshed PolyPaint mark: a pixel "P" with one coral pixel being placed. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="#eceae3">
        <rect x="0" y="0" width="3" height="1" />
        <rect x="0" y="1" width="1" height="4" />
        <rect x="3" y="1" width="1" height="1" />
        <rect x="1" y="2" width="2" height="1" />
      </g>
      <rect x="3" y="3" width="2" height="2" fill="#ff6b3d" />
    </svg>
  );
}
