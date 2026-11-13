import { memo } from 'react';

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 5x5 mirrored avatar for an address. Purely decorative. */
export const Identicon = memo(function Identicon({ address, size = 20, round = false }: { address: string; size?: number; round?: boolean }) {
  let h = hash(address.toLowerCase());
  const hue = h % 360;
  const hue2 = (hue + 140 + ((h >>> 9) % 80)) % 360;
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      if ((h >>> 16) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  return (
    <svg
      className="ident"
      width={size}
      height={size}
      viewBox="-1 -1 7 7"
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ background: `hsl(${hue2} 55% 86%)`, borderRadius: round ? '50%' : Math.max(3, size / 5) }}
    >
      <g fill={`hsl(${hue} 68% 42%)`}>
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />
        ))}
      </g>
    </svg>
  );
});
